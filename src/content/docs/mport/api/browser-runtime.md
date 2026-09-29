---
title: "Browser runtime helpers"
description: "injectImportMap(), startup() and createImporter()."
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

## startup()

```ts
startup(router, specifiers: string[], { scopes?, document? }?): Promise<{ importMap, lock }>
```

`router.build(specifiers, { scopes })`, then `injectImportMap(importMap)`. Afterwards plain
`import "react"` works natively, and nothing retries if a mirror goes down later.

## createImporter()

```ts
createImporter(router): (specifier, options?) => Promise<module>
```

`(specifier, options) => router.import(specifier, options)`: every load goes through the
router and [fails over](/mport/api/router/#routerimport) when an import fails.
