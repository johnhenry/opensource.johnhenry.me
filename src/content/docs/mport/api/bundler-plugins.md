---
title: "Bundler plugins"
description: "@johnhenry/mport/vite and @johnhenry/mport/rollup: resolve bare imports through a router while bundling, as CDN URLs or as an import map."
sidebar:
  label: "Bundler plugins"
  order: 110
---

```js
// vite.config.js
import mportVite from "@johnhenry/mport/vite";
import { createRouter, esmSh } from "@johnhenry/mport";
const router = createRouter({ "*": esmSh() }, { lock: JSON.parse(readFileSync("mport.lock.json")) });
export default { plugins: [mportVite(router, { packageJson: true })] };

// rollup.config.js
import mportRollup from "@johnhenry/mport/rollup";
export default { input: "src/main.js", plugins: [mportRollup(router, { mode: "importmap" })], output: { dir: "dist" } };
```

```ts
mportRollup(router: Router, options?: RollupPluginOptions): Plugin
mportVite(router: Router, options?: VitePluginOptions): Plugin
```

Both resolve every **bare package import** the bundler meets (`react`, `react/jsx-runtime`,
`@scope/pkg/x.js`, `jsr:@std/path`) through `router.resolve()`. `vite` and `rollup` are not
dependencies of this package (they are dev dependencies here, used by its tests); the
plugins are plain objects the bundler calls.

| Option | Default | Meaning |
|---|---|---|
| `mode` | `"external"` | `"external"`: the import becomes the resolved CDN URL in the output, and the bundler treats it as external. `"importmap"`: the import stays bare and the build yields the import map for it (below) |
| `versions` | `{}` | `{ name: range }` for imports with no version. Without one the specifier has none, so the router uses its lockfile's pin for that specifier if it has one, else the registry's `latest` |
| `packageJson` | `false` | `true`: read `dependencies`, `devDependencies` and `peerDependencies` ranges from `package.json` (Vite: in `root`; Rollup: in the working directory) or give a path. Values that aren't registry ranges (`workspace:`, `file:`, git URLs) are ignored. `versions` wins |
| `exclude` | none | leave these to the bundler: package names or exact sources, a `RegExp` tested on the source, or a predicate |
| `specifiers` | `[]` | importmap mode: specifiers always put in the map (what only `router.import()` or a dynamic computed import uses) |
| `build` | `{}` | importmap mode: `router.build()` options for the map: `conflicts`, `graph`, `scopes` |
| `fileName` | `"importmap.json"` | Rollup, importmap mode: the emitted asset |
| `dev` | `false` | Vite: also resolve in the dev server (`"external"` mode only) |

What the plugins decide, per import:

- **Not touched** (the bundler handles it as usual): relative and absolute paths, URLs,
  `node:` and Node built-ins, prefix imports (`lit/`), `\0` virtual modules, anything in
  `exclude`, and a specifier **no route matches** (`router.resolve()` returned `null`).
  In Vite also `vite` and `vite/*` (its own virtual modules) and every SSR build (Node cannot
  import an `https:` URL).
- **A routable package whose lookup fails** (unknown package, no version satisfies the
  range, registry unreachable, no provider can serve it) **fails the build** with the
  router's `ResolutionError`/`RoutingError`; it is not left bare.
- Resolution happens once per distinct specifier per plugin instance, and uses the router
  exactly as `build` does: its probe, lockfile pins, fallback and integrity strategies.
  With the default `"head"` probe a build makes real requests; use `probe: "none"` to
  resolve without checking.

**`"external"` mode** emits `import React from "https://esm.sh/react@19.2.0?target=es2022"`.
The browser needs nothing else. It maps each import to **one** URL (the router's first
choice at build time): there is no runtime failover, and no `integrity` (a URL in an
`import` statement cannot carry one).

**`"importmap"` mode** keeps `import "react"` and builds the map from the specifiers it
routed (plus `specifiers`) with `router.build()`: Rollup emits it as the `fileName` asset
(`importmap.json`), for you to inline or serve; Vite injects
`<script type="importmap">…</script>` at the start of `index.html`'s `<head>`, before the
module script. Because it goes through `build()`, `build: { conflicts: "scope" }` and
`build: { graph: true }` give the page scopes and `integrity` for every file. Only HTML
entry pages get the injection: a Vite library or SSR build has none.

`plugin.api` exposes the instance: `api.specifiers()` (what has been routed) and
`api.importMap()` (the `build()` result).

**Limits.** Only imports the bundler reports are seen: `import(expr)` with a computed
specifier is not (list it in `specifiers`). Vite's dev server is untouched by default
because it pre-bundles dependencies itself, so dev and production can differ; `dev: true`
makes dev import CDN URLs too. The Vite plugin is `enforce: "pre"`; a plugin that resolves
bare imports earlier (an alias) wins. CommonJS-only packages need a provider that can serve
them (the router's CommonJS check applies as in `resolve()`). The Rollup tests here run
against Rollup 4 and Vite 8 (Rolldown-based); other majors are untested.
