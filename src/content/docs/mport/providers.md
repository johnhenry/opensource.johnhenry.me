---
title: "Providers"
description: "The built-in CDN, registry and origin providers, what build each serves, and why raw CDNs skip CommonJS packages."
sidebar:
  order: 4
---

| Provider | Build | Registries | Notes |
|---|---|---|---|
| `esmSh()` | `esm.sh` | npm, jsr, github | transforms to browser ESM |
| `jsDelivr()` | `npm` | npm, github | raw files. The entry comes from `exports` → `module` → `main`, and sub-paths such as `preact/hooks` are mapped through `exports` |
| `jsDelivr({ esm: true })` | `jsdelivr-esm` | npm | jsDelivr's `/+esm` bundles |
| `unpkg()` | `npm` | npm | raw files |
| `jspm()` | `jspm` | npm | `ga.jspm.io` builds |
| `jsr()` | `esm.sh` | jsr | through esm.sh. `jsr({ via: "jsr.io" })` loads raw files from jsr.io and needs a path |
| `github()` | `npm` | github | through jsDelivr's `/gh/`. `{ via: "esm.sh" }` also works |
| `local({ base })` | `npm` | npm | your own copy, e.g. a vendored `node_modules` |
| `custom(template)` | origin host | npm | `"https://x/"` or a template using `{name}` `{version}` `{path}` `{entry}` `{scope}` `{bare}` |
| `provider({...})` | yours | yours | write your own: `{ name, build, registries, capabilities, needsEntry, needsVersion, url(artifact) }` |

The CDN providers (`esmSh`, `jsDelivr`, `unpkg`, `jspm`, `jsr`) accept `origin`, so you can point them at a self-hosted mirror. Full URL shapes and capabilities: [API › Built-in providers](/mport/api/providers/#built-in-providers).

**CommonJS and raw CDNs.** Raw file CDNs (`jsDelivr()`, `unpkg()`, `jspm()`, `local()`) serve files as published, so a package whose entry is CommonJS, such as React's `index.js`, can't be imported from them in a browser. mport skips those providers for such packages (`skip` with a reason) so the route falls through to an ESM-transforming CDN like esm.sh. ESM is detected from `.mjs`, an `import`/`module` export condition, the `module` field, `"type": "module"`, or ESM-by-convention names (`*.module.js`, `*.esm.js`, `…/esm/…`). Pass `createRouter(routes, { allowCommonJS: true })` to turn the check off. The exact rules: [API › CommonJS detection](/mport/api/registry-and-semver/#commonjs-detection).
