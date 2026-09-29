---
title: "mport"
description: "Route JavaScript imports across any number of CDNs: deterministic resolution, adaptive transport, compiled down to a standard import map."
sidebar:
  order: 0
---

**`@johnhenry/mport`** routes JavaScript imports across any number of CDNs.

You keep writing ordinary imports. mport decides which CDN, registry or origin serves
each one. Choosing an exact version is deterministic, but which mirror delivers it can
change. The result compiles down to a standard import map, so the browser never needs to
know mport exists.

```js
import { createRouter, esmSh, jsDelivr, unpkg, jsr } from "@johnhenry/mport";

const router = createRouter({
  "*": [esmSh(), jsDelivr(), unpkg()],            // ordered fallback
  "@std/*": jsr(),                                 // JSR packages
  "@internal/*": "https://modules.example.com/",  // your own origin
});

const { importMap, lock } = await router.build(["react@^19", "lit/", "@std/path@^1"]);
```

```json
{
  "imports": {
    "react": "https://esm.sh/react@19.2.0",
    "lit/": "https://esm.sh/lit@3.3.1/",
    "@std/path": "https://esm.sh/jsr/@std/path@1.1.0"
  }
}
```

mport 1.x's one-liner still works. It is now the simplest router: a runtime race between
jsDelivr, JSPM and unpkg.

```js
import mport from "@johnhenry/mport";
const { default: _ } = await mport("lodash-es@4.17.21/lodash.js");
```

> **Provenance:** previously published as the unscoped `mport`, last version 1.0.0.
> `@johnhenry/mport` restarts at `0.0.0` because it is a new address, not because the
> code is new: `0.0.0` is the first release of the router API (developed as mport 2.0,
> which never reached npm under the old name), and it keeps the 1.x API working. The
> scoped package is not on npm yet; see [Getting started](/mport/getting-started/).

## The one rule

**Resolution is deterministic and transport is adaptive.**

- `react@^19` becomes `19.2.0` once. The lockfile then pins that version together with
  its **build**, and a CDN outage can't change it.
- Providers that transform packages (esm.sh, jspm) serve a different artifact from
  providers that serve raw npm files (jsDelivr, unpkg). Only providers with the same
  `build` count as mirrors of each other, so failover for a locked package never
  silently switches to a differently built file.

[How it works](/mport/how-it-works/) walks through the pipeline, and what a native import
map can and cannot do on its own.

## What's here

**Guides**

- [Getting started](/mport/getting-started/): install, load from a CDN, and resolve at
  build time or in the browser.
- [How it works](/mport/how-it-works/): the resolution pipeline, and native import maps
  vs mport.
- [Routes and specifiers](/mport/routes/): object and array route tables, pattern
  ranking, and every specifier form.
- [Providers](/mport/providers/): the built-in CDNs, builds, and why raw CDNs skip
  CommonJS packages.
- [Strategies](/mport/strategies/): `fallback`, `race`, `adaptive`, `prefer`,
  `verified`, `cache`, and probing.
- [Import maps, lockfiles and the CLI](/mport/import-maps-and-cli/).
- [In the browser](/mport/in-the-browser/): `startup()` vs `createImporter()`.
- [Debugging: traces and events](/mport/debugging/).
- [The v1 API and migrating from 1.x](/mport/v1-and-migration/).
- [Examples](/mport/examples/): eleven self-verifying Node examples and three browser
  pages.
- [Limitations and traps](/mport/limitations/): read this before relying on failover.
- [Adding a new provider](/mport/adding-a-provider/).

**[API reference](/mport/api/)**: every export of every entry point, with signatures,
options, defaults, return shapes, errors and trace events:
[specifiers](/mport/api/specifiers/), [the router](/mport/api/router/),
[providers](/mport/api/providers/), [strategies](/mport/api/strategies/),
[probing and health](/mport/api/probing-and-health/),
[trace events and errors](/mport/api/trace-and-errors/),
[lockfiles and import maps](/mport/api/lockfiles-and-import-maps/),
[registry and semver](/mport/api/registry-and-semver/),
[browser runtime helpers](/mport/api/browser-runtime/), [the CLI](/mport/api/cli/) and
[the v1 API](/mport/api/v1/).

Source: [github.com/johnhenry/mport](https://github.com/johnhenry/mport). MIT licensed.

