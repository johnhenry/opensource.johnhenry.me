---
title: "API reference"
description: "Every export of every @johnhenry/mport entry point: the entry points, the concepts the reference assumes, and a one-line index of every export."
sidebar:
  label: "Overview"
  order: 100
---

Every export of every entry point, with signatures, options, defaults, return shapes,
errors and trace events. Defaults and behaviour here are checked against `src/` and the
tests; where the code does something surprising, this reference says so rather than
describing what it was meant to do. Types live in `src/types.d.ts`
(and `src/core.d.ts` for `./core`). The [guide pages](/mport/getting-started/) are the
tutorial; this is the reference.

## Entry points

| Import | File | Exports |
|---|---|---|
| `@johnhenry/mport` | `src/index.mjs` | everything in `./core`, plus the v1 functions `mport` (also the default export), `MPort`, `MPortURL` |
| `@johnhenry/mport/firefox` | `src/firefox.mjs` | the same names as `@johnhenry/mport`. No file it loads contains a two-argument `import()`, which older Firefox rejects at parse time. See [Firefox](/mport/api/v1/#the-firefox-entry-point). |
| `@johnhenry/mport/core` | `src/core.mjs` | the router, providers, strategies, registry, import-map, lockfile, runtime and semver exports, without the v1 functions |
| `mport` (bin) | `bin/mport.mjs` | the [CLI](/mport/api/cli/) |

All three module entry points are ES modules with no dependencies. The package is plain
JavaScript that runs in browsers, Deno and Node; the router's defaults (`fetch`,
`import()`) are the host's.

The `./core` exports, grouped:

| Group | Exports |
|---|---|
| Router | [`createRouter`](/mport/api/router/#createrouter), [`route`](/mport/api/router/#route) |
| Specifiers | [`parseSpecifier`](/mport/api/specifiers/#parsespecifier), [`keyOf`](/mport/api/specifiers/#keyof), [`isRoutable`](/mport/api/specifiers/#isroutable) |
| Providers | [`provider`](/mport/api/providers/#provider), [`esmSh`](/mport/api/providers/#built-in-providers), [`jsDelivr`](/mport/api/providers/#built-in-providers), [`unpkg`](/mport/api/providers/#built-in-providers), [`jspm`](/mport/api/providers/#built-in-providers), [`jsr`](/mport/api/providers/#built-in-providers), [`github`](/mport/api/providers/#built-in-providers), [`local`](/mport/api/providers/#built-in-providers), [`custom`](/mport/api/providers/#custom), [`origin`](/mport/api/providers/#origin), [`DEFAULT_ORIGINS`](/mport/api/v1/#constants) |
| Strategies | [`fallback`](/mport/api/strategies/#fallback), [`race`](/mport/api/strategies/#race), [`adaptive`](/mport/api/strategies/#adaptive), [`weighted`](/mport/api/strategies/#weighted), [`prefer`](/mport/api/strategies/#prefer), [`verified`](/mport/api/strategies/#verified), [`cache`](/mport/api/strategies/#cache), [`sri`](/mport/api/strategies/#sri) |
| Health and errors | [`HealthRegistry`](/mport/api/probing-and-health/#healthregistry), [`RoutingError`](/mport/api/trace-and-errors/#errors), [`SkipError`](/mport/api/trace-and-errors/#errors), [`IntegrityError`](/mport/api/trace-and-errors/#errors), [`ResolutionError`](/mport/api/trace-and-errors/#errors) |
| Registry | [`createRegistry`](/mport/api/registry-and-semver/#createregistry), [`entryInfo`](/mport/api/registry-and-semver/#entryinfo), [`entryOf`](/mport/api/registry-and-semver/#entryof), [`resolveExports`](/mport/api/registry-and-semver/#resolveexports) |
| Import maps | [`compileImportMap`](/mport/api/lockfiles-and-import-maps/#compileimportmap), [`mergeImportMaps`](/mport/api/lockfiles-and-import-maps/#mergeimportmaps) |
| Lockfiles | [`createLock`](/mport/api/lockfiles-and-import-maps/#createlock), [`lockKey`](/mport/api/lockfiles-and-import-maps/#lockkey) |
| Browser runtime | [`injectImportMap`](/mport/api/browser-runtime/#injectimportmap), [`startup`](/mport/api/browser-runtime/#startup), [`createImporter`](/mport/api/browser-runtime/#createimporter) |
| Misc | [`semver`](/mport/api/registry-and-semver/#semver), [`DEFAULT_CACHE_KEY`](/mport/api/v1/#constants) |

## Concepts

mport splits every import into two halves.

**Resolution is deterministic.** The router parses the specifier, matches it to a route,
turns a range into one exact version (from the npm or JSR registry, or from the
lockfile) and, for providers that serve raw files, looks up the entry file. None of this
depends on which CDN is up.

**Transport is adaptive.** The route's node (a provider or a strategy that combines
providers) chooses which provider serves that exact artifact: in order, by racing, by
weight and health, by target, from a cache, with integrity checks.

Every provider declares a **build**: what it actually serves. jsDelivr and unpkg both
serve the files as published to npm (build `"npm"`); esm.sh and jspm transform packages,
so their output is a different artifact even for the same version. Only providers with
the same build are mirrors of each other. A lockfile pins the build as well as the
version, so failover moves between mirrors and never silently switches to a different
build.

The router's output is a **Resolution** (one specifier) or an **import map** plus a
**lockfile** (many specifiers). The browser never needs mport at runtime unless you want
failover after the page has loaded, which only [`router.import()`](/mport/api/router/#routerimport) gives.

## API

Every export, from `@johnhenry/mport` (all of them), `@johnhenry/mport/firefox` (the same names) and `@johnhenry/mport/core` (all but the v1 functions). Each links to its full entry in this reference.

| Export | Signature | What it does |
|---|---|---|
| [`createRouter`](/mport/api/router/#createrouter) | `(routes, options?) → Router` | Build a router. Options: `probe`, `lock`, `resolveVersions`, `circuitBreaker`, `health`, `target`, `capabilities`, `fetch`, `importer`, `registries`, `registry`, `onEvent`, `now`, `allowCommonJS`, `name` |
| [`router.resolve`](/mport/api/router/#routerresolve) | `(specifier, options?) → Promise<Resolution \| null>` | Resolve one specifier. Options: `signal`, `exclude`, `build`, `integrity`, `target`, `capabilities`, `relock`, `onEvent` |
| [`router.import`](/mport/api/router/#routerimport) | `(specifier, options?) → Promise<module>` | Resolve and import, failing over when the import fails |
| [`router.build`](/mport/api/router/#routerbuild) | `(specifiers, { scopes?, signal? }?) → Promise<{ importMap, lock }>` | Resolve many and compile an import map and lockfile |
| `router.health`, `router.lock`, `router.name` | | The router's [`HealthRegistry`](/mport/api/probing-and-health/#healthregistry), its in-memory lock, its name |
| [`route`](/mport/api/router/#route) | `(match, use) → { match, use }` | One array-form route |
| [`esmSh`, `jsDelivr`, `unpkg`, `jspm`, `jsr`, `github`, `local`](/mport/api/providers/#built-in-providers) | `(options?) → Provider` | Built-in providers |
| [`custom`](/mport/api/providers/#custom) | `(template, options?) → Provider` | A base URL or a `{name}`/`{version}`/`{path}`/`{entry}`/`{scope}`/`{bare}` template |
| [`provider`](/mport/api/providers/#provider) | `(definition) → Provider` | Define your own provider |
| [`origin`](/mport/api/providers/#origin) | `(pathOrOrigin) → Provider` | A v1 origin as a provider |
| [`fallback`](/mport/api/strategies/#fallback) | `(...nodes)` or `({ providers, circuitBreaker })` | In order |
| [`race`](/mport/api/strategies/#race) | `(...nodes)` | First success wins |
| [`adaptive`](/mport/api/strategies/#adaptive), [`weighted`](/mport/api/strategies/#weighted) | `(...[node, weight])`, `(node, weight)` | Ordered by weight and health |
| [`prefer`](/mport/api/strategies/#prefer) | `({ [target]: node, default? })` | By target |
| [`verified`](/mport/api/strategies/#verified) | `(node, { algorithm? })` | SRI check against the pinned hash |
| [`cache`](/mport/api/strategies/#cache) | `({ store?, name?, prefix? }?)` | Remembered resolutions |
| [`sri`](/mport/api/strategies/#sri) | `(bytes, algorithm?) → Promise<string>` | Compute an SRI hash |
| [`HealthRegistry`](/mport/api/probing-and-health/#healthregistry) | `new ({ failures?, reset?, now? }?)` | Per-provider health and circuit breaker |
| [`RoutingError`, `SkipError`, `IntegrityError`, `ResolutionError`](/mport/api/trace-and-errors/#errors) | classes | See the errors table |
| [`parseSpecifier`](/mport/api/specifiers/#parsespecifier), [`keyOf`](/mport/api/specifiers/#keyof), [`isRoutable`](/mport/api/specifiers/#isroutable) | | Specifier parsing, import-map keys, routability |
| [`createRegistry`](/mport/api/registry-and-semver/#createregistry) | `({ fetch?, npm?, jsr? }?)` | Version and entry lookups |
| [`entryInfo`](/mport/api/registry-and-semver/#entryinfo), [`entryOf`](/mport/api/registry-and-semver/#entryof), [`resolveExports`](/mport/api/registry-and-semver/#resolveexports) | `(packageJson, subpath?)` | Entry-file selection and CommonJS detection |
| [`compileImportMap`](/mport/api/lockfiles-and-import-maps/#compileimportmap), [`mergeImportMaps`](/mport/api/lockfiles-and-import-maps/#mergeimportmaps) | | Import maps from resolutions; merging |
| [`createLock`](/mport/api/lockfiles-and-import-maps/#createlock), [`lockKey`](/mport/api/lockfiles-and-import-maps/#lockkey) | | Lockfiles and their keys |
| [`injectImportMap`](/mport/api/browser-runtime/#injectimportmap), [`startup`](/mport/api/browser-runtime/#startup), [`createImporter`](/mport/api/browser-runtime/#createimporter) | | Browser runtime helpers |
| [`semver`](/mport/api/registry-and-semver/#semver) | namespace | `parse`, `valid`, `compare`, `satisfies`, `maxSatisfying` |
| [`mport`](/mport/api/v1/#mport) (default), [`MPort`](/mport/api/v1/#mport-and-mporturl), [`MPortURL`](/mport/api/v1/#mport-and-mporturl) | | The v1 API (not in `./core`) |
| [`DEFAULT_ORIGINS`, `DEFAULT_CACHE_KEY`](/mport/api/v1/#constants) | | v1 defaults |

Errors, in one line each: `ResolutionError` means the package or version can't exist (or the registry is unreachable) and no CDN is blamed; `RoutingError` (an `AggregateError`) means every provider in a fallback or race failed or was skipped; `SkipError` is a provider declining without trying; `IntegrityError` is `verified()` rejecting bytes. Types ship in `src/types.d.ts`.
