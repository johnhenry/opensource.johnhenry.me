---
title: "Adding a new provider"
description: "Define a provider in your own code, or add a built-in: the pattern every built-in follows, with jsDelivr's +esm bundles as the worked example."
sidebar:
  order: 12
---

`jsDelivr({ esm: true })` is the best worked example in this package's history: a second provider on a CDN mport already supported, serving a different artifact. It is what `examples/app.html` falls back to when esm.sh fails to import, and the test `router.import() fails over across builds unless a lock or opts.build pins one` in `test/router.test.mjs` (and `examples/08-router-import-fails-over-at-runtime.mjs`) depends on it.

**Smallest: no library change at all.** A provider is data plus a `url()` function, so a CDN or an internal origin you need is `provider({ name, build, registries, capabilities, needsEntry, url })` or `custom("https://cdn.example/{name}@{version}/{entry}", { build: "npm" })` in your own code, and every strategy, the lockfile and the health registry treat it exactly like a built-in. Add a built-in only when it is a public CDN that many users would otherwise redefine.

**A genuinely new built-in: `jsDelivr({ esm: true })`.** Every built-in follows one small pattern:

1. **`src/providers.mjs`**: a factory that returns `provider({...})`, taking `origin` and `name` options like `unpkg()` does.
2. **`src/core.mjs`**: export it. `src/index.mjs` and `src/firefox.mjs` re-export core, so nothing else changes.
3. **`src/types.d.ts`** and **`src/core.d.ts`**: declare it. `test/exports.test.mjs` fails until both name it.
4. **The one part that isn't boilerplate: the provider's identity.** `build` decides which providers count as mirrors, so it must name the artifact, not the host: `/+esm` bundles are transformed, so they get build `"jsdelivr-esm"`, not jsDelivr's raw `"npm"`. Declaring `"npm"` would make a bundle a "mirror" of unpkg's raw files, and a lockfile pinned to raw files could fail over to it. `needsEntry: false` because jsDelivr resolves the entry itself, which also means no CommonJS check; `registries: ["npm"]` because `/+esm` has no GitHub form; and `base()` throws, because a bundle has no directory to map a prefix specifier to.

**Tests.** Add URL-shape and skip-behaviour cases to `test/router.test.mjs` against `fakeFetch` from `test/helpers.mjs`, not a live CDN: the suite asserts exact traces and timing-dependent race outcomes, which a real network would make flaky. Then list the provider in the tables in this README and in `docs/api.md`, and check it for real in `examples/playground.html`.
