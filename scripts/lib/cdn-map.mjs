// Builds a raw-CDN import map for one npm package entry point.
//
// jsDelivr and unpkg serve npm files byte-for-byte: they never rewrite a bare
// `import "dompurify"` inside a package, so the page's import map has to name
// every bare specifier the module graph reaches. This module crawls that graph
// over jsDelivr (starting from a package's export entry), resolves each bare
// specifier the way a bundler would (`exports` with browser/import/default
// conditions, then `module`/`main`), and returns:
//
//   imports      specifier -> URL, ready for <script type="importmap">
//   nodeImports  node: / builtin specifiers reached (the entry is Node-only)
//   dynamic      bare specifiers only reached through import() (optional)
//   problems     anything it could not resolve
//
// A dependency that ships only CommonJS cannot load raw; it is mapped to
// jsDelivr's `/+esm` build of the same version instead (noted in `converted`).

import { init, parse } from 'es-module-lexer';

await init;

const CDN = 'https://cdn.jsdelivr.net/npm';

const BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto', 'dgram',
  'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'readline/promises', 'repl', 'stream', 'stream/promises', 'stream/web', 'string_decoder', 'sys',
  'timers', 'timers/promises', 'tls', 'tty', 'url', 'util', 'util/types', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

export const isBuiltin = (s) => s.startsWith('node:') || BUILTINS.has(s);

const textCache = new Map();
export async function fetchText(url) {
  if (!textCache.has(url)) {
    textCache.set(
      url,
      (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await fetch(url).catch(() => null);
          if (res?.ok) return res.text();
          if (res && res.status === 404) return null;
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        return null;
      })()
    );
  }
  return textCache.get(url);
}

export async function fetchJson(url) {
  const t = await fetchText(url);
  return t == null ? null : JSON.parse(t);
}

/** Exact version that `range` resolves to, via jsDelivr's resolver (npm semantics). */
export async function resolveVersion(name, range = 'latest') {
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(range)) return range;
  const spec = encodeURIComponent(range || 'latest');
  const data = await fetchJson(`https://data.jsdelivr.com/v1/packages/npm/${name}/resolved?specifier=${spec}`);
  return data?.version ?? null;
}

export function splitSpecifier(spec) {
  const parts = spec.split('/');
  const n = spec.startsWith('@') ? 2 : 1;
  const name = parts.slice(0, n).join('/');
  const sub = parts.slice(n).join('/');
  return { name, subpath: sub ? `./${sub}` : '.' };
}

const CONDITIONS = ['browser', 'import', 'module', 'default'];

function pickTarget(target) {
  if (target == null) return null;
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) {
    for (const t of target) {
      const r = pickTarget(t);
      if (r) return r;
    }
    return null;
  }
  for (const [cond, value] of Object.entries(target)) {
    if (CONDITIONS.includes(cond)) {
      const r = pickTarget(value);
      if (r) return r;
    }
  }
  return null;
}

/** Resolve `subpath` ('.', './x') against a package.json, browser-first. */
export function resolveEntry(pj, subpath) {
  let exp = pj.exports;
  if (exp != null) {
    if (typeof exp === 'string' || Array.isArray(exp) || !Object.keys(exp).some((k) => k.startsWith('.'))) {
      exp = { '.': exp };
    }
    if (subpath in exp) return pickTarget(exp[subpath]);
    for (const [key, value] of Object.entries(exp)) {
      const star = key.indexOf('*');
      if (star < 0) continue;
      const pre = key.slice(0, star);
      const post = key.slice(star + 1);
      if (subpath.startsWith(pre) && subpath.endsWith(post) && subpath.length >= key.length - 1) {
        const mid = subpath.slice(pre.length, subpath.length - post.length);
        const t = pickTarget(value);
        return t ? t.replaceAll('*', mid) : null;
      }
    }
    return null;
  }
  if (subpath === '.') {
    const b = typeof pj.browser === 'string' ? pj.browser : null;
    return b || pj.module || pj.main || './index.js';
  }
  return subpath;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

const VALID = /^(?:[.#/]|@[\w.-]+\/[\w.-]+(?:\/[\w.@/+-]*)?$|[\w][\w.-]*(?:\/[\w.@/+-]*)?$|node:)/;

/** Static and literal dynamic import specifiers of one ES module. */
export function scanImports(src) {
  const statics = new Set();
  const dynamics = new Set();
  let parsed;
  try {
    parsed = parse(src);
  } catch {
    return { statics: [], dynamics: [], error: 'unparseable' };
  }
  for (const im of parsed[0]) {
    const s = im.n;
    if (!s || !VALID.test(s)) continue;
    if (im.d > -1) dynamics.add(s);
    else statics.add(s);
  }
  for (const s of statics) dynamics.delete(s);
  return { statics: [...statics], dynamics: [...dynamics] };
}

function looksLikeEsm(file, pj, src) {
  if (file.endsWith('.mjs')) return true;
  if (file.endsWith('.cjs')) return false;
  if (pj.type === 'module') return true;
  const code = stripComments(src);
  const esm = /(^|[;\s])(import|export)\s[\w{*"']/m.test(code);
  const cjs = /\bmodule\.exports\b|\bexports\.\w+\s*=|\brequire\s*\(/.test(code);
  return esm && !cjs;
}

/**
 * Crawl the graph that `specifiers` reach. `version` pins the package under
 * test; every other package's version comes from the range its importer
 * declares (dependencies, then peer/optional dependencies). Package-internal
 * `#imports` become import-map `scopes` keyed by that package's CDN base.
 */
export async function buildImportMap({ name, version, specifiers, mapLazyDeps = true }) {
  const pkgJsonCache = new Map();
  const getPj = async (n, v) => {
    const key = `${n}@${v}`;
    if (!pkgJsonCache.has(key)) pkgJsonCache.set(key, fetchJson(`${CDN}/${n}@${v}/package.json`));
    return pkgJsonCache.get(key);
  };

  const imports = {};
  const scopes = {};
  const nodeImports = new Set();
  const dynamic = new Set();
  const problems = new Set();
  const converted = new Set();
  const seenFiles = new Set();
  const pending = new Set();
  const versions = { [name]: version };

  async function load(spec, pkg, file, assign) {
    const url = `${CDN}/${pkg.n}@${pkg.v}/${file}`;
    const src = await fetchText(url);
    if (src == null) {
      problems.add(`${spec}: ${url} not found`);
      return;
    }
    if (!looksLikeEsm(file, pkg.pj, src)) {
      // jsDelivr's own /+esm bundles import each other as /npm/<name>@<v>[/<subpath>]/+esm,
      // so use the same URL shape: two spellings would load two copies (two Reacts).
      const sub = spec.startsWith('#') ? `/${file}` : splitSpecifier(spec).subpath.slice(1);
      assign(`${CDN}/${pkg.n}@${pkg.v}${sub}/+esm`);
      converted.add(spec);
      return;
    }
    assign(url);
    await crawl(url, pkg);
  }

  async function mapBare(spec, importer) {
    if (isBuiltin(spec)) {
      nodeImports.add(spec);
      return;
    }
    if (imports[spec] || pending.has(spec)) return;
    pending.add(spec);
    const { name: n, subpath } = splitSpecifier(spec);
    let v = versions[n];
    if (!v) {
      const ipj = importer?.pj;
      const range = ipj?.dependencies?.[n] ?? ipj?.peerDependencies?.[n] ?? ipj?.optionalDependencies?.[n] ?? 'latest';
      v = await resolveVersion(n, range);
      if (!v) {
        problems.add(`cannot resolve ${n}@${range}`);
        return;
      }
      versions[n] ??= v;
      v = versions[n];
    }
    const pj = await getPj(n, v);
    if (!pj) {
      problems.add(`no package.json for ${n}@${v}`);
      return;
    }
    const target = resolveEntry(pj, subpath);
    if (!target) {
      problems.add(`${spec}: not exported by ${n}@${v}`);
      return;
    }
    await load(spec, { n, v, pj }, target.replace(/^\.\//, ''), (url) => (imports[spec] = url));
  }

  async function mapHash(spec, pkg) {
    const base = `${CDN}/${pkg.n}@${pkg.v}/`;
    if (scopes[base]?.[spec]) return;
    const target = pickTarget(pkg.pj.imports?.[spec]);
    if (!target) {
      problems.add(`${spec}: not in ${pkg.n}'s package.json "imports"`);
      return;
    }
    if (!target.startsWith('./')) return mapBare(target, pkg);
    await load(spec, pkg, target.slice(2), (url) => ((scopes[base] ??= {})[spec] = url));
  }

  async function crawl(url, pkg) {
    if (seenFiles.has(url)) return;
    seenFiles.add(url);
    const src = await fetchText(url);
    if (src == null) {
      problems.add(`missing ${url}`);
      return;
    }
    const { statics, dynamics, error } = scanImports(src);
    if (error) problems.add(`${error}: ${url}`);
    // A lazily imported *hard* dependency (safe-fragment's dompurify) is still
    // needed at run time, and a raw CDN cannot resolve it, so it is mapped.
    // Lazily imported peers/optionals stay out of the map and are reported.
    const lazyHard = [];
    for (const d of dynamics) {
      if (d.startsWith('.') || d.startsWith('/') || d.startsWith('#')) continue;
      if (mapLazyDeps && !isBuiltin(d) && pkg.pj?.dependencies?.[splitSpecifier(d).name]) lazyHard.push(d);
      else dynamic.add(d);
    }
    await Promise.all(
      [...statics, ...lazyHard].map(async (s) => {
        if (/^(https?:|data:|blob:)/.test(s)) return;
        if (s.startsWith('#')) return mapHash(s, pkg);
        if (s.startsWith('.') || s.startsWith('/')) {
          const next = new URL(s, url).href;
          if (!/\.[cm]?js$/.test(next)) {
            if (/\.(json|css|wasm)$/.test(next)) return;
            problems.add(`extensionless relative import ${s} in ${url}`);
            return;
          }
          return crawl(next, pkg);
        }
        return mapBare(s, pkg);
      })
    );
  }

  for (const spec of specifiers) await mapBare(spec, null);
  for (const d of [...dynamic]) if (imports[d]) dynamic.delete(d);
  return {
    imports,
    scopes,
    nodeImports: [...nodeImports].sort(),
    dynamic: [...dynamic].sort(),
    converted: [...converted],
    problems: [...problems],
    // Every raw (byte-for-byte) file the graph loads: the ones an import map's
    // `integrity` can pin. jsDelivr's /+esm output is generated, so it is not here.
    rawFiles: [...seenFiles].sort(),
  };
}

/** SRI hash ("sha384-…") of the exact bytes at `url`. */
export async function sriHash(url) {
  const { createHash } = await import('node:crypto');
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) return `sha384-${createHash('sha384').update(Buffer.from(await res.arrayBuffer())).digest('base64')}`;
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`cannot fetch ${url} to hash it`);
}
