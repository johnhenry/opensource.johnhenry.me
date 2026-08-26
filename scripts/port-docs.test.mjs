import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIndex, rewritePaths } from './port-docs.mjs';

// --- normalizeIndex -------------------------------------------------------

test('normalizeIndex: strips a hero block with no internal blank lines (baseline)', () => {
  const raw = [
    '---',
    'title: Foo',
    'hero:',
    '  title: Hero title',
    '  tagline: Something',
    'other: value',
    '---',
    'Body text.',
  ].join('\n');
  const out = normalizeIndex(raw);
  assert.match(out, /^---\ntitle: Foo\nother: value\n---\nBody text\.$/);
  assert.ok(!out.includes('hero:'));
  assert.ok(!out.includes('Hero title'));
});

test('normalizeIndex: strips a hero block containing an internal blank line, leaving the next real key intact', () => {
  const raw = [
    '---',
    'title: Foo',
    'hero:',
    '  title: Hero title',
    '  image:',
    '    file: ../../../assets/logo.png',
    '',
    '  actions:',
    '    - text: Get started',
    '      link: /guides/',
    'other: value',
    '---',
    'Body text.',
  ].join('\n');
  const out = normalizeIndex(raw);
  // The whole hero block — including its internal blank line — must be gone,
  // and it must not swallow the sibling `other:` key.
  assert.ok(!out.includes('hero:'), 'hero: key should be removed');
  assert.ok(!out.includes('actions:'), 'orphaned hero sub-key should not survive');
  assert.ok(!out.includes('Hero title'));
  assert.ok(out.includes('other: value'), 'sibling frontmatter key must survive intact');
  assert.match(out, /^---\ntitle: Foo\nother: value\n---\nBody text\.$/);
});

test('normalizeIndex: strips template: splash alongside a hero block with a blank line', () => {
  const raw = [
    '---',
    'title: Foo',
    'template: splash',
    'hero:',
    '  title: Hero title',
    '',
    '  actions: []',
    'other: value',
    '---',
    'Body text.',
  ].join('\n');
  const out = normalizeIndex(raw);
  assert.ok(!out.includes('template: splash'));
  assert.ok(!out.includes('hero:'));
  assert.ok(!out.includes('actions:'));
  assert.ok(out.includes('other: value'));
});

test('normalizeIndex: hero as the last frontmatter key (no trailing sibling) still strips cleanly', () => {
  const raw = ['---', 'title: Foo', 'hero:', '  title: X', '', '  tagline: Y', '---', 'Body.'].join(
    '\n'
  );
  const out = normalizeIndex(raw);
  assert.equal(out, '---\ntitle: Foo\n---\nBody.');
});

test('normalizeIndex: content without frontmatter passes through unchanged', () => {
  const raw = '# Just a heading\n\nSome body text.';
  assert.equal(normalizeIndex(raw), raw);
});

// --- rewritePaths: srcset ---------------------------------------------------

test('rewritePaths: srcset rewrites every candidate URL, not just the first', () => {
  const body = '<img srcset="/img-1x.png 1x, /img-2x.png 2x, /img-3x.png 3x" src="/img-1x.png">';
  const out = rewritePaths(body, 'ecmanim');
  assert.match(out, /srcset="\/ecmanim\/img-1x\.png 1x, \/ecmanim\/img-2x\.png 2x, \/ecmanim\/img-3x\.png 3x"/);
});

test('rewritePaths: srcset with a single candidate still works (baseline)', () => {
  const body = '<img srcset="/img.png">';
  const out = rewritePaths(body, 'ecmanim');
  assert.equal(out, '<img srcset="/ecmanim/img.png">');
});

test('rewritePaths: srcset respects SHARED_ROOTS per-candidate', () => {
  const body = '<img srcset="/src/shared.png 1x, /logo.png 2x">';
  const out = rewritePaths(body, 'circuit');
  assert.match(out, /srcset="\/src\/shared\.png 1x, \/circuit\/logo\.png 2x"/);
});

// --- rewritePaths: single vs double quotes ---------------------------------

test('rewritePaths: double-quoted href is rewritten (baseline)', () => {
  const body = '<a href="/guides/cli/">CLI</a>';
  assert.equal(rewritePaths(body, 'ai-matey'), '<a href="/ai-matey/guides/cli/">CLI</a>');
});

test('rewritePaths: single-quoted href is rewritten', () => {
  const body = "<a href='/guides/cli/'>CLI</a>";
  assert.equal(rewritePaths(body, 'ai-matey'), "<a href='/ai-matey/guides/cli/'>CLI</a>");
});

test('rewritePaths: single-quoted src is rewritten', () => {
  const body = "<img src='/logo.png'>";
  assert.equal(rewritePaths(body, 'ecmanim'), "<img src='/ecmanim/logo.png'>");
});

test('rewritePaths: mixed single- and double-quoted attributes in the same doc', () => {
  const body = `<a href='/guides/'>G</a><img src="/logo.png">`;
  const out = rewritePaths(body, 'ai-matey');
  assert.equal(out, `<a href='/ai-matey/guides/'>G</a><img src="/ai-matey/logo.png">`);
});

test('rewritePaths: markdown links are still rewritten', () => {
  const body = '[CLI](/guides/cli/)';
  assert.equal(rewritePaths(body, 'ai-matey'), '[CLI](/ai-matey/guides/cli/)');
});
