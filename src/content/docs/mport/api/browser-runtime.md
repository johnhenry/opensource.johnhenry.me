---
title: "Browser runtime helpers"
description: "injectImportMap(), injectModulePreload(), startup() and createImporter()."
sidebar:
  order: 109
---

Import maps can only name one URL per specifier and have to be in the document before
the first module that uses them resolves; once the browser has loaded a URL from an
import map, there is no hook to try another. So there are two runtime modes.

## injectImportMap()

```ts
injectImportMap(map: ImportMap, { document? = globalThis.document }?): HTMLScriptElement
```

Creates `<script type="importmap">` with `JSON.stringify(map)` and inserts it before the
first `script[type="module"]` or existing `script[type="importmap"]`, or at the end of
`<head>`. Throws `Error("mport: injectImportMap needs a document")` without one. It has
to run before the first module import that uses the map resolves.

## injectModulePreload()

```ts
injectModulePreload(map: ImportMap, { document? = globalThis.document, crossorigin? = "anonymous" }?): HTMLLinkElement[]
```

Appends a `<link rel="modulepreload">` to `<head>` for each
[`modulePreloads(map)`](/mport/api/lockfiles-and-import-maps/#modulepreloads) entry
(with `integrity` where known) and returns the elements. Throws
`Error("mport: injectModulePreload needs a document")` without a document. On a server,
use [`renderModulePreload`](/mport/api/lockfiles-and-import-maps/#rendermodulepreload).

## startup()

```ts
startup(router, specifiers: string[], { document?, ...buildOptions }?): Promise<BuildResult>
```

`router.build(specifiers, buildOptions)` (`scopes`, `conflicts`, `graph`, `signal`, …), then
`injectImportMap(importMap)`. Afterwards plain `import "react"` works natively, and nothing
retries if a mirror goes down later.

**Firefox ignores a late import map.** Firefox (155, the version the browser tests run) does not
allow an import map once any module has loaded or begun preloading: it logs "Import maps are
not allowed after a module load or preload has started" and leaves bare specifiers unmapped.
Since mport is itself a module, `startup()` and `injectImportMap()` cannot work there (Chromium
153 and WebKit 26 accept the map). So that this isn't a mystery `TypeError` later, when `startup()`
runs against the real `document` it asks the engine (`import.meta.resolve()` of the map's first
non-prefix key) whether the map took, and if not **rejects with an `Error` whose `result` property
is the build result** (message: *this browser ignored the import map startup() injected*). The
map has still been inserted. With a `document` option (a stand-in) nothing is checked.
What works in every engine: put the map in the HTML before any module script (build it ahead of
time or on a server, and use [`renderImportMap()`](/mport/api/lockfiles-and-import-maps/#renderimportmap)), or load packages with
[`createImporter()`](#createimporter), which needs no import map.

## createImporter()

```ts
createImporter(router): (specifier, options?) => Promise<module>
```

`(specifier, options) => router.import(specifier, options)`: every load goes through the
router and [fails over](/mport/api/router/#routerimport) when an import fails.
