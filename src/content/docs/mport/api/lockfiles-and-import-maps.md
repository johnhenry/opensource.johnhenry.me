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
createLock(data?: { packages? }): { get(key), set(key, entry), toJSON() }
```

The in-memory lock the router uses. `set` keeps only the fields above; `toJSON()` returns
`{ lockfileVersion: 1, packages }` sorted by key.

## Import maps

### compileImportMap()

```ts
compileImportMap(resolved: Resolution[], scoped?: Record<string, Resolution[]>): ImportMap
```

`{ imports, scopes?, integrity? }`. Each Resolution maps `key → url`; a prefix key
(ending `/`) maps to `base` (or the URL without its file name). `integrity` maps URL →
hash for every Resolution with an `integrity` (prefix keys are excluded, at the top
level and in scopes alike: the hash is of one entry file, not of the directory a prefix maps). `scopes` and `integrity` are omitted when empty. Two Resolutions that map one key
to **different** URLs (`react@18` and `react@19` both want `"react"`) throw a
`ResolutionError` naming the key and both URLs, in `imports` and inside each scope alike,
instead of keeping one silently; the same URL twice is fine. Give the second version its
own scope (`router.build(specifiers, { scopes })`). For scoped lists, each entry's
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
the first module script. `nonce` adds a CSP nonce attribute.

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
entry, joined by newlines, with attributes HTML-escaped. Put them in `<head>` next to the
import map so the browser fetches the modules before the importing script runs.
`crossorigin: ""` omits the attribute.

```js
const { importMap } = await router.build(["react@^19"]);
res.send(`<head>${renderModulePreload(importMap)}${renderImportMap(importMap)}</head>`);
```

`renderImportMap` and `renderModulePreload` need no DOM, so they run on a server; the
DOM counterparts are [`injectImportMap`](/mport/api/browser-runtime/#injectimportmap) and
[`injectModulePreload`](/mport/api/browser-runtime/#injectmodulepreload).
