---
title: "How it works"
description: "Deterministic resolution, adaptive transport: how mport turns a specifier into one exact artifact and chooses which mirror serves it, and what a native import map can and cannot do."
sidebar:
  order: 2
---

```
 import "npm:react@^19"
         │
         ▼                                   RESOLUTION: deterministic
   route match      "*" → fallback(cache(), race(esmSh(), jsDelivr()), unpkg())
         │
   registry lookup  react@^19 → 19.2.0 (npm registry / JSR metadata, or the lockfile)
         │
         ▼                                   ROUTING: adaptive
   strategy tree    fallback ─┬─ cache
                              ├─ race ─┬─ esm.sh   ✓ 41 ms  ← selected
                              │        └─ jsDelivr ✗ aborted
                              └─ unpkg
         │
         ▼                                   COMPILATION
   import map       "react": "https://esm.sh/react@19.2.0"
         │
         ▼
   native browser ESM
```

The rule mport follows is that **resolution is deterministic and transport is adaptive**:

- `react@^19` becomes `19.2.0` once. The lockfile then pins that version together with its **build**, and a CDN outage can't change it.
- Providers that transform packages, such as esm.sh and jspm, serve a different artifact from providers that serve raw npm files, such as jsDelivr and unpkg. Only providers with the same `build` count as mirrors of each other. Once something is locked to the `npm` build, failover moves between jsDelivr, unpkg and your `local()` copy, and never silently switches to an esm.sh build.

## Native import maps vs mport

| | Import map | mport |
|---|---|---|
| Map a bare specifier to a URL | ✓ | ✓ (this is what it outputs) |
| Prefix mappings, scopes | ✓ | ✓ |
| Integrity | ✓ (`integrity`) | ✓ computes it with `verified()` |
| Several candidate URLs for one specifier | ✗ | ✓ fallback, race, adaptive |
| Choose by health, latency or capability | ✗ | ✓ |
| Version ranges → exact versions | ✗ | ✓ plus a lockfile |
| Retry another CDN after the browser has picked a URL | ✗ | only through `router.import()` / `createImporter()` |

Once the browser has resolved `import "react"` through an import map, there is no standard hook to try another URL if that fetch fails. mport therefore resolves ahead of time (CLI or `startup()`), or runs every load through `router.import()`.
