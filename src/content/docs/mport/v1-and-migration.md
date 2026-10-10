---
title: "The v1 API and migrating from 1.x"
description: "mport 1.x's mport(), MPort() and MPortURL() still work on top of the router; what changed: bug fixes, and per-call import attributes limited to none, JSON and CSS."
sidebar:
  order: 9
---

## The v1 API

These keep the same signatures as 1.x:
- `mport(spec, importOptions?)`: the default export
- `MPort(options | ...origins)`
- `MPortURL(options | ...origins)`
- options: `{ cdns, useCache: "localhost", cacheKey }`
- `@johnhenry/mport/firefox`

Specifiers are `"name@version[/path]"` or `{ name, version, path }`. With no path, mport reads the package's `package.json` and imports its ESM entry.

**Per-call import attributes (since 0.0.1).** `importOptions` may be absent (or `{}`, `{ with: {} }`), `{ with: { type: "json" } }` or `{ with: { type: "css" } }`. Any other import attributes (another `type`, another key, a non-string value) reject the `mport()` / `MPort()` / `MPortURL()` call with a `TypeError` before anything is imported, instead of being handed to `import()`. Each allowed form is a literal `import(url, { with: { type: "…" } })` in mport's source, which is what lets Rollup and Vite 7 bundle the package without "could not statically analyze an import attribute" warnings. For other attributes, use the router with your own `importer`: `createRouter({ importer })`.

```js
import mport from "@johnhenry/mport";

await mport("some-pkg@1.0.0/data.json", { with: { type: "json" } }); // OK
await mport("some-pkg@1.0.0/sheet.css", { with: { type: "css" } });  // OK
await mport("some-pkg@1.0.0/x.wasm", { with: { type: "webassembly" } }); // TypeError, nothing imported
```

`@johnhenry/mport/firefox` exists because older Firefox versions reject any two-argument `import()` at parse time. That entry point never uses the syntax. It reads `package.json` with `fetch`, so path-less specifiers work there too, and it ignores per-call import options.

## Migrating from 1.x

Nothing you call has been removed. Change the install to `@johnhenry/mport` (the unscoped `mport` stays at 1.0.0). Behaviour changes, all of them bug fixes apart from the narrower `importOptions`:

- **The race waits for the first success.** 1.x used `Promise.race`, so one CDN that failed quickly rejected the whole import.
- **Scoped names parse correctly.** `"@scope/pkg@1.2.3/x.js"` now works in string form.
- **Origin arguments are honoured.** `MPort("a.cdn/", "b.cdn/")`, as the old README showed, now uses those origins. 1.x silently ignored them.
- **`useCache: "localhost"` works.** It compared a URL host to an origin path and never matched.
- **`mport/firefox` works.** It referenced undefined variables. It is now `@johnhenry/mport/firefox`.
- **Path-less imports prefer ESM.** They pick the entry from `exports` → `module` → `main`; 1.x used `main` only. This can change which file loads for packages whose `main` is CommonJS.
- **`MPortURL` returns a third element** (debug info). `[module, url]` destructuring is unaffected.
- **The npm package ships every file.** The 1.0.0 tarball was missing `config.mjs` and `race-which.mjs`.
- **`importOptions` is limited to no attributes, JSON or CSS** (since 0.0.1). 1.x passed whatever you gave it to `import(url, importOptions)`; other attributes now reject with a `TypeError`, as above. Use `createRouter({ importer })` if you need them.

The default race still mixes builds (raw jsDelivr/unpkg files against jspm's transformed output), because that is what 1.x did. For consistent builds, move to a router such as `createRouter({ "*": race(jsDelivr(), unpkg()) })`.
