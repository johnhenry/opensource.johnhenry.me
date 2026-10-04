// Install snippets for @johnhenry packages, built from src/data/package-versions.json.
//
// Shared by src/components/Install.astro (which renders them) and
// scripts/verify-cdn-snippets.mjs (which loads exactly the same snippets in a
// browser and records the result), so what is published is what was tested.

export const ESM_SH = 'https://esm.sh';

/** "@johnhenry/window-algebra/browser" -> "windowAlgebraBrowser" */
export function identifier(spec) {
  const words = spec.replace(/^@[^/]+\//, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const id = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');
  return /^[A-Za-z_$]/.test(id) ? id : `_${id}`;
}

export const specifierFor = (name, subpath) => (subpath === '.' ? name : name + subpath.slice(1));

export function entrySpecifiers(name, pkg) {
  return (pkg.entries ?? ['.']).map((sub) => specifierFor(name, sub));
}

/** Packages in `names` that get a CDN snippet at all (not Node-only, not suppressed). */
export function browserPackages(names, data) {
  return names.filter((n) => {
    const p = data.packages[n];
    return p && p.status !== 'node' && p.cdn !== false && p.npm && p.importMap;
  });
}

/** Key under `data.verified` for this exact set of packages at their current versions. */
export function comboKey(names, data) {
  return [...names]
    .sort()
    .map((n) => `${n}@${data.packages[n].npm}`)
    .join(' ');
}

/**
 * One import map for several packages. The first package to claim a specifier
 * wins. With `{ integrity: true }` it also pins every raw file it loads.
 */
export function mergedImportMap(names, data, { integrity = false } = {}) {
  const imports = {};
  const scopes = {};
  const hashes = {};
  if (integrity) for (const n of names) Object.assign(hashes, data.packages[n].integrity);
  for (const n of names) {
    const map = data.packages[n].importMap;
    for (const [k, v] of Object.entries(map.imports ?? {})) imports[k] ??= v;
    for (const [scope, entries] of Object.entries(map.scopes ?? {})) {
      scopes[scope] ??= {};
      for (const [k, v] of Object.entries(entries)) scopes[scope][k] ??= v;
    }
  }
  return {
    imports,
    ...(Object.keys(scopes).length ? { scopes } : {}),
    ...(Object.keys(hashes).length ? { integrity: hashes } : {}),
  };
}

export function esmShUrl(name, version, subpath = '.') {
  return `${ESM_SH}/${name}@${version}${subpath === '.' ? '' : subpath.slice(1)}`;
}

/** [{ specifier, url }] for every entry point of every package, served by esm.sh. */
export function esmShImports(names, data) {
  return names.flatMap((n) => {
    const p = data.packages[n];
    return (p.entries ?? ['.']).map((sub) => ({ specifier: specifierFor(n, sub), url: esmShUrl(n, p.npm, sub) }));
  });
}

export function importMapSnippet(names, data, opts) {
  const map = JSON.stringify(mergedImportMap(names, data, opts), null, 2).replace(/\n/g, '\n  ');
  const lines = names.flatMap((n) => entrySpecifiers(n, data.packages[n]));
  return [
    '<!-- In <head>, before any <script type="module"> or modulepreload. -->',
    '<script type="importmap">',
    `  ${map}`,
    '</script>',
    '<script type="module">',
    ...lines.map((s) => `  import * as ${identifier(s)} from "${s}";`),
    '</script>',
  ].join('\n');
}

export function esmShSnippet(names, data) {
  return esmShImports(names, data)
    .map(({ specifier, url }) => `import * as ${identifier(specifier)} from "${url}";`)
    .join('\n');
}

/** What the component will show for `names`, and whether each half was verified. */
export function cdnState(names, data) {
  const pkgs = browserPackages(names, data);
  if (!pkgs.length || pkgs.length !== names.length) return { pkgs, importMap: false, esmSh: false };
  const v = data.verified?.[comboKey(pkgs, data)];
  return {
    pkgs,
    importMap: v?.jsdelivr === true,
    esmSh: v?.esmsh === true,
    integrity: v?.integrity === true,
    verifiedAt: v?.date,
  };
}
