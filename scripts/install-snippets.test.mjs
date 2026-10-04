import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEntry, scanImports, splitSpecifier } from './lib/cdn-map.mjs';
import { cdnState, comboKey, identifier, mergedImportMap } from '../src/lib/install-snippets.mjs';

test('resolveEntry prefers the browser condition, then import/default', () => {
  const pj = { exports: { '.': { browser: { default: './b.js' }, types: './x.d.ts', default: './n.js' }, './sub': { import: './s.mjs', require: './s.cjs' } } };
  assert.equal(resolveEntry(pj, '.'), './b.js');
  assert.equal(resolveEntry(pj, './sub'), './s.mjs');
  assert.equal(resolveEntry(pj, './nope'), null);
});

test('resolveEntry handles subpath patterns and packages without exports', () => {
  assert.equal(resolveEntry({ exports: { './*': './src/*' } }, './a/b.mjs'), './src/a/b.mjs');
  assert.equal(resolveEntry({ module: './m.js', main: './c.js' }, '.'), './m.js');
  assert.equal(resolveEntry({ exports: './only.js' }, '.'), './only.js');
});

test('splitSpecifier splits scoped and unscoped names', () => {
  assert.deepEqual(splitSpecifier('@johnhenry/mport/node'), { name: '@johnhenry/mport', subpath: './node' });
  assert.deepEqual(splitSpecifier('dompurify'), { name: 'dompurify', subpath: '.' });
});

test('scanImports separates static from dynamic imports and ignores strings', () => {
  const src = `import a from "x"; export { b } from './y.js'; const s = "import z from 'nope'"; await import("lazy");`;
  const { statics, dynamics } = scanImports(src);
  assert.deepEqual(statics.sort(), ['./y.js', 'x']);
  assert.deepEqual(dynamics, ['lazy']);
});

const data = {
  packages: {
    '@j/a': { status: 'ready', npm: '1.0.0', importMap: { imports: { '@j/a': 'A', dep: 'D1' } }, integrity: { A: 'sha384-a' } },
    '@j/b': { status: 'partial', npm: '2.0.0', importMap: { imports: { '@j/b': 'B', dep: 'D2' }, scopes: { 'S/': { '#x': 'X' } } } },
    '@j/n': { status: 'node', npm: '0.1.0' },
  },
  verified: { '@j/a@1.0.0 @j/b@2.0.0': { jsdelivr: true, esmsh: false, date: 'd' } },
};

test('mergedImportMap: first package wins, scopes kept, integrity only on request', () => {
  assert.deepEqual(mergedImportMap(['@j/a', '@j/b'], data), {
    imports: { '@j/a': 'A', dep: 'D1', '@j/b': 'B' },
    scopes: { 'S/': { '#x': 'X' } },
  });
  assert.deepEqual(mergedImportMap(['@j/a'], data, { integrity: true }).integrity, { A: 'sha384-a' });
});

test('cdnState shows only what was verified at these versions', () => {
  assert.equal(comboKey(['@j/b', '@j/a'], data), '@j/a@1.0.0 @j/b@2.0.0');
  const s = cdnState(['@j/b', '@j/a'], data);
  assert.equal(s.importMap, true);
  assert.equal(s.esmSh, false);
  assert.equal(cdnState(['@j/a'], data).importMap, false); // never verified alone
  assert.equal(cdnState(['@j/a', '@j/n'], data).importMap, false); // a Node-only package in the set
  const bumped = { ...data, packages: { ...data.packages, '@j/a': { ...data.packages['@j/a'], npm: '1.0.1' } } };
  assert.equal(cdnState(['@j/a', '@j/b'], bumped).importMap, false);
});

test('identifier makes a JS name from a specifier', () => {
  assert.equal(identifier('@johnhenry/window-algebra/browser'), 'windowAlgebraBrowser');
  assert.equal(identifier('@johnhenry/safe-fragment'), 'safeFragment');
});
