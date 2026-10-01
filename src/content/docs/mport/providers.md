---
title: "Providers"
description: "The built-in CDN, registry and origin providers, what build each serves, and why raw CDNs skip CommonJS packages."
sidebar:
  order: 4
---

| Provider | Build | Registries | Notes |
|---|---|---|---|
| `esmSh()` | `esm.sh` | npm, jsr, github | transforms to browser ESM; URLs carry `?target=es2022` (`esTarget`) so the bytes, and `integrity`, don't vary by browser |
| `jsDelivr()` | `npm` | npm, github | raw files. The entry comes from `exports` → `module` → `main`, and sub-paths such as `preact/hooks` are mapped through `exports` |
| `jsDelivr({ esm: true })` | `jsdelivr-esm` | npm | jsDelivr's `/+esm` bundles |
| `unpkg()` | `npm` | npm | raw files |
| `jspm()` | `jspm` | npm | `ga.jspm.io` builds |
| `jsr()` | `esm.sh` | jsr | through esm.sh. `jsr({ via: "jsr.io" })` loads raw files from jsr.io and needs a path |
| `github()` | `npm` | github | through jsDelivr's `/gh/`. `{ via: "esm.sh" }` also works |
| `local({ base })` | `npm` | npm | your own copy, e.g. a vendored `node_modules`. It looks up versions and entries in the npm registry; for a package that is not on npm, or to serve the installed version, add `registry: installedRegistry({ root })` from `@johnhenry/mport/node` (below) |
| `custom(template)` | origin host | npm | `"https://x/"` or a template using `{name}` `{version}` `{path}` `{entry}` `{scope}` `{bare}` |
| `provider({...})` | yours | yours | write your own: `{ name, build, registries, capabilities, needsEntry, needsVersion, url(artifact) }` |

**Serving what is installed, including packages that are not on npm.** `local()` maps to your own origin but still asks the registry for the version and entry file, so a package installed from git is a 404. `@johnhenry/mport/node` has a registry client that reads `<root>/<name>/package.json` instead:

```js
import { createRouter, local } from "@johnhenry/mport";
import { installedRegistry } from "@johnhenry/mport/node";

const router = createRouter({ "*": local({ base: "/node_modules/" }) },
  { registry: installedRegistry({ root: "node_modules" }), probe: "none" });
await router.build(["@scope/unpublished"]);  // /node_modules/@scope/unpublished/<entry>, lock records the installed version
```

The installed version wins over the registry's `latest`, and a range it does not satisfy is an error. See [API › installedRegistry()](/mport/api/registry-and-semver/#installedregistry); runnable: [example 17](/mport/examples/).

The CDN providers (`esmSh`, `jsDelivr`, `unpkg`, `jspm`, `jsr`) accept `origin`, so you can point them at a self-hosted mirror. Full URL shapes and capabilities: [API › Built-in providers](/mport/api/providers/#built-in-providers).

**CommonJS and raw CDNs.** Raw file CDNs (`jsDelivr()`, `unpkg()`, `jspm()`, `local()`) serve files as published, so a package whose entry is CommonJS, such as React's `index.js`, can't be imported from them in a browser. mport skips those providers for such packages (`skip` with a reason) so the route falls through to an ESM-transforming CDN like esm.sh. ESM is detected from `.mjs`, an `import`/`module` export condition, the `module` field, `"type": "module"`, or ESM-by-convention names (`*.module.js`, `*.esm.js`, `…/esm/…`). Pass `createRouter(routes, { allowCommonJS: true })` to turn the check off. The exact rules: [API › CommonJS detection](/mport/api/registry-and-semver/#commonjs-detection).
