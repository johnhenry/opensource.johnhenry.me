---
title: "Lockfiles and import maps"
description: "The lockfile format, what a pin does, lockKey(), createLock(), compileImportMap() and mergeImportMaps()."
sidebar:
  order: 107
---

## Lockfiles

```json
{
  "lockfileVersion": 1,
  "packages": {
    "react@^19": {
      "specifier": "react@^19", "registry": "npm", "name": "react", "range": "^19",
      "version": "19.2.0", "build": "esm.sh", "provider": "esm.sh",
      "url": "https://esm.sh/react@19.2.0?target=es2022", "integrity": "sha384-…"
    }
  }
}
```

With `build(…, { graph })` the lockfile also has a top-level `files` map, URL → SRI hash,
for every file of every locked module's import graph (keys sorted); see
[Whole-graph integrity](/mport/api/router/#whole-graph-integrity-graph). Without `graph` the key is absent.
`createLock()`'s `getFile(url)` and `setFile(url, integrity)` read and write it.

Entry fields, in this order: `specifier`, `registry`, `name`, `range`, `version`, `path`,
`entry`, `build`, `provider`, `url`, `integrity`. Undefined and empty-string values are
left out. Keys are sorted.

**What a pin does** (when the router's `lock` has an entry for the specifier's key and
the call doesn't pass `relock`):

| Field | Effect |
|---|---|
| `version` | used without a registry lookup |
| `entry` | used without an entry lookup, and trusted to be ESM (no CommonJS check) |
| `build` | only providers with this build may serve (unless `options.build` overrides) |
| `integrity` | the expected hash for `verified()` (unless `options.integrity` overrides); also carried into the Resolution and the import map's `integrity` |
| `provider`, `url`, `specifier`, `registry`, `name`, `range`, `path` | recorded for reference; any mirror of the build may serve next time |

### lockKey()

```ts
lockKey(parsed: ParsedSpecifier): string
```

The specifier as written, normalized: the registry prefix only if the specifier had one,
`gh:` spelled `github:`, the range if any, the path if any, no trailing `/`.

| Specifier | Key |
|---|---|
| `react@^19` | `react@^19` |
| `npm:react@18.3.1` | `npm:react@18.3.1` |
| `@std/path@^1` (routed to JSR) | `@std/path@^1` (its entry says `"registry": "jsr"`) |
| `jsr:@std/path@1.0.0` | `jsr:@std/path@1.0.0` |
| `lit/` | `lit` |
| `gh:johnhenry/mport@v2/src/index.mjs` | `github:johnhenry/mport@v2/src/index.mjs` |
| `{ name: "react", version: "^19", path: "jsx-runtime" }` | `react@^19/jsx-runtime` |

`react@^19` and `react@19` are different keys: a pin applies only to the specifier as it
was written when the lockfile was made.

### createLock()

```ts
createLock(data?: { packages?, files? }): { get(key), set(key, entry), getFile(url), setFile(url, integrity), toJSON() }
```

The in-memory lock the router uses. `set` keeps only the fields above; `toJSON()` returns
`{ lockfileVersion: 1, packages, files? }` sorted by key (`files` only when non-empty).

## Import maps

### compileImportMap()

```ts
compileImportMap(resolved: Resolution[], scoped?: Record<string, Resolution[]>, extra?: { integrity?: Record<string, string> }): ImportMap
```

`{ imports, scopes?, integrity? }`. `extra.integrity` (URL → hash) is merged into the map's
`integrity`, which is how `build({ graph })` adds the files of the import graph. Each Resolution maps `key → url`; a prefix key
(ending `/`) maps to `base` (or the URL without its file name). `integrity` maps URL →
hash for every Resolution with an `integrity` (prefix keys are excluded, at the top
level and in scopes alike: the hash is of one entry file, not of the directory a prefix maps). `scopes` and `integrity` are omitted when empty. Two Resolutions that map one key
to **different** URLs (`react@18` and `react@19` both want `"react"`) throw a
`ResolutionError` naming the key and both URLs, in `imports` and inside each scope alike,
instead of keeping one silently; the same URL twice is fine. Give the second version its
own scope (`router.build(specifiers, { scopes })`), or build with
[`conflicts: "scope"`](/mport/api/router/#conflicting-versions-conflicts-scope). For scoped lists, each entry's
`key` is the key to use inside that scope.

### mergeImportMaps()

```ts
mergeImportMaps(...maps: ImportMap[]): ImportMap
```

Later maps win, per key; scopes merge per scope. Empty `scopes`/`integrity` are omitted.

### renderImportMap()

```ts
renderImportMap(map: ImportMap, { nonce? }?): string
```

`<script type="importmap">…</script>` as an HTML string, for a server-rendered page (the
counterpart of [`injectImportMap`](/mport/api/browser-runtime/#injectimportmap), which needs a DOM). The JSON has
`<`, U+2028 and U+2029 escaped, so no key or URL can end the element early. Put it before
the first module script. `nonce` adds a CSP nonce attribute; a page that cannot have one
(a static site) allows the script [by hash](/mport/api/lockfiles-and-import-maps/#importmaphash-importmaptext-csphash-renderimportmapcsp).

### importMapHash(), importMapText(), cspHash(), renderImportMapCsp()

```ts
importMapHash(map: ImportMap, { algorithm? = "sha256" }?): Promise<string>        // "'sha256-…'"
renderImportMapCsp(map: ImportMap, { algorithm?, nonce? }?): Promise<{ html: string, hash: string, text: string }>
importMapText(map: ImportMap): string                                              // the text between the tags
cspHash(text: string, algorithm?: "sha256" | "sha384" | "sha512"): Promise<string>
```

**Which to use.** A server that renders every response can give each its own **nonce**
(`renderImportMap(map, { nonce })`, `script-src 'nonce-…'`). A **static site** (GitHub Pages, any
CDN) cannot, and a CSP can allow an inline script only by the hash of its text:

```js
const { html, hash } = await renderImportMapCsp(importMap);
// <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'sha256-…'">  ← hash, quotes included
// …and `html` in <head>, before the first module script
```

- `importMapText(map)` is the string `renderImportMap()` puts between the tags (`JSON.stringify`
  with `<`, U+2028 and U+2029 escaped). It is also what `injectImportMap()` sets as the script's
  `textContent` and what the Vite plugin injects, so **one hash allows the map whichever way it
  reaches the page**. A change to the escaping changes the text and the hash together.
- `importMapHash(map)` is `cspHash(importMapText(map))`: the value for `script-src`, **with its single
  quotes** (`'sha256-47DEQ…='`). `renderImportMapCsp(map)` returns the rendered HTML, the hash and the
  text from the same string; a `nonce` only adds the attribute (the hash is unaffected).
- `cspHash(text)` hashes any inline script's UTF-8 bytes. mport renders no other inline script: its
  `<link rel="modulepreload">` tags are not scripts, and the Vite plugin's injected map is covered by
  `plugin.api.importMapHash()` (see [Bundler plugins](/mport/api/bundler-plugins/#bundler-plugins)).
- They use Web Crypto (`crypto.subtle`), so they are **async**, and in a browser need a secure context
  (HTTPS or localhost). `sha384` and `sha512` are accepted; anything else is a `TypeError`.

The hash is of the text exactly as emitted: write `html` to the page unchanged. A build step that
re-serialises the HTML afterwards (a minifier that rewrites the script, CRLF conversion) changes the
text and the browser blocks the map. **Recompute the hash from the final map** whenever it changes
(a new lockfile means a new map means a new hash) and generate the policy and the page in the same
build. `test/browser/csp.spec.mjs` has real engines enforce a strict policy: the map is allowed by
mport's hash and blocked by a wrong one, and the engine's own hash of the parsed text equals mport's.

Under `require-trusted-types-for 'script'`, an import map set from script (`injectImportMap()`)
assigns a string to a script's text, which Trusted Types refuses: put the map in the HTML
(`renderImportMapCsp()`) instead; the static-page test runs under that directive.

### modulePreloads()

```ts
modulePreloads(map: ImportMap): Array<{ href: string, integrity?: string }>
```

Every distinct module URL in `imports` and `scopes` (prefix mappings are directories, not
modules, and are left out), in order, each with its hash from `map.integrity` when there is
one.

### renderModulePreload()

```ts
renderModulePreload(map: ImportMap, { crossorigin? = "anonymous", nonce? }?): string
```

One `<link rel="modulepreload" href integrity? crossorigin>` per `modulePreloads(map)`
entry, joined by newlines, with attributes HTML-escaped. Put them in `<head>` so the browser
fetches the modules before the importing script runs, **after the import map**: Firefox
(155) ignores an import map that comes after a `modulepreload` (it has "started a module
load or preload", the same warning as for a late map), so every bare import on the page then
fails there, while Chromium and WebKit take either order (a browser test pins this down).
`crossorigin: ""` omits the attribute.

```js
const { importMap } = await router.build(["react@^19"]);
res.send(`<head>${renderImportMap(importMap)}${renderModulePreload(importMap)}</head>`);
```

`renderImportMap` and `renderModulePreload` need no DOM, so they run on a server; the
DOM counterparts are [`injectImportMap`](/mport/api/browser-runtime/#injectimportmap) and
[`injectModulePreload`](/mport/api/browser-runtime/#injectmodulepreload).

### parseImports()

```ts
parseImports(source: string, options?: { dynamic?: boolean }): string[]
```

The specifiers a JavaScript module imports **statically**, in source order: `import … from "x"`,
`import "x"`, `export … from "x"`, `export * from "x"`, `export * as ns from "x"`. With
`dynamic: true`, `import("x")` calls whose first argument is a string literal as well
(computed ones are never reported). Text inside comments, strings, template literals and
regular expressions is ignored. A tokenizer, not a parser; see the
[limits](/mport/api/router/#whole-graph-integrity-graph). It is what `build({ graph })` uses.
