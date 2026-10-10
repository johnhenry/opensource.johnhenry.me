---
title: "Limitations and traps"
description: "The mport behaviours that surprise people, traps first: pattern matching, lockfile keys, CLI pins, memoized lookups, trust on first use, and what an import map can never do."
sidebar:
  order: 11
---

Traps first: behaviour that is documented and deliberate, but that you will not guess
from a quick read of the API, and that fails quietly rather than loudly. The permanent
limitations, the ones that follow from what CDNs and import maps are, come after.

## Traps

### Routing

- **`"react*"` also matches `react-dom` and `reactive`.** A trailing `*` is a plain
  prefix match, not a package boundary. To mean only React, write `"react"` and
  `"react/*"`. See [Routes and matching](/mport/api/router/#routes-and-matching).
- **A route pattern `"gh:*"` never matches anything.** `gh:` specifiers match as
  `github:`, so write the route as `"github:*"`.
- **Object-form routes are ranked, not ordered.** An exact key beats a glob, a longer
  glob beats a shorter one, and `"*"` comes last; insertion order only breaks ties. An
  explicit specifier is tested with and without its prefix, and the highest-ranked
  route that accepts either form wins: with `{ "npm:*": a, "react": b }`, the specifier
  `npm:react` goes to `b`. Use the array form (`route(...)`) when you want first-match
  order.
- **A URL string is only shorthand at the top level of a route.** Inside `fallback()`,
  `race()` and the other strategies a string throws
  `TypeError: wrap URL strings with custom() inside strategies`.

### Lockfiles and the CLI

- **Lock keys are the specifier as written.** `react@^19` and `react@19` are different
  keys, so a pin applies only when the specifier is spelled exactly as it was when the
  lockfile was made. See [lockKey()](/mport/api/lockfiles-and-import-maps/#lockkey).
- **`router.build()` returns every resolution this router has made**, including
  earlier `resolve()` and `import()` calls, not only this build's specifiers. The
  lockfile you passed in only pins and is never copied across, so specifiers you stopped
  building are pruned. Use a fresh router per build if the lockfile should contain
  exactly one build's inputs.
- **A prebuilt router in `mport.config.mjs` can't take a lockfile.** `--lock` and
  `--relock` with one are an error, and `build` writes the import map but leaves the
  lock file alone. Export a function instead:
  `export default ({ lock }) => createRouter(routes, { lock })`.
- **Two specifiers that map one import-map key to different URLs throw.** `react@18`
  and `react@19` in one `build()` is a `ResolutionError` naming the key; give the second
  its own `scopes` entry, or opt in with `conflicts: "scope"` (next two items).
- **`conflicts: "scope"` only scopes what the build's packages depend on.** Dependents
  are the npm packages named in the build, not their transitive dependencies: list
  `lib-a-utils` too, or add an explicit scope. JSR and GitHub packages have no manifest
  the router reads. A conflicting version nobody depends on lands in no scope (the report
  lists it as `unscoped`), and the page's own modules only ever see the first-listed
  version.
- **A scope does nothing for CDNs that import by URL.** Scopes change only what a bare
  specifier resolves to. esm.sh and jsDelivr `+esm` rewrite their dependency imports to
  absolute URLs, so the scope is generated but has no effect; it matters for jspm, raw
  jsDelivr/unpkg and `local()`. See
  [Conflicting versions](/mport/api/router/#conflicting-versions-conflicts-scope).
- **`graph` is bounded, same-origin and tokenizer-level.** It stops at `maxFiles` (500)
  and `maxDepth` (20) and only reports it as a `truncated` event and in `result.graph`
  (the CLI prints a warning): a truncated lockfile is partial, so treat the warning as an
  error in CI. It follows static imports on the module's own origin, with a tokenizer,
  not a JavaScript parser: dynamic imports with computed arguments, workers, fetched
  assets and a second CDN's files are not hashed. It downloads every file at build time,
  and an import map's `integrity` is enforced only by engines that implement it. See
  [Whole-graph integrity](/mport/api/router/#whole-graph-integrity-graph).
- **`mport update` moves within the range and leaves the import map alone.** It never
  crosses a major (change the specifier and `build`), run `mport build` afterwards, and
  with a `files` map it re-walks and re-records every file hash, not only the selected
  packages'. See [`mport outdated` and `mport update`](/mport/api/cli/#mport-outdated-and-mport-update).
- **A prefix specifier (`lit/`) can skip a provider.** Raw file CDNs skip it for
  packages with an `exports` map (subpaths such as `lit/decorators.js` would 404), and
  `jsDelivr({ esm: true })` always skips it. The route falls through to e.g. esm.sh, so
  `lit/` may be served by a different CDN than `lit`.
- **A pinned `entry` is trusted to be ESM.** Lockfile entries skip the entry lookup and
  the CommonJS check entirely.

### Registry lookups and caching

- **A long-lived router never re-reads `latest`.** Registry lookups are memoized per
  router for its whole lifetime (failed lookups are forgotten and retried). Create a new
  router when you want fresh dist-tags.
- **`cache()` is keyed on the specifier as written, so a hit makes no request at all**
  (it works offline). The flip side: a range stays pinned to whatever it resolved to
  until the record expires (`ttl`) or the store is cleared. And the router writes every
  successful resolution into **every** `cache()` node in its whole route table, not only
  the route that served it.
- **An exact version is used as written, even if it doesn't exist.** No lookup happens
  for `react@19.2.0`; a typo surfaces later as a probe failure, not a
  `ResolutionError`.
- **`resolveVersions: false` hands the CDN the range as written** (for example
  `https://esm.sh/react@^19?target=es2022`), so the CDN, not mport, picks the version.
  Providers that need an entry file (the raw CDNs) skip a range or tag and the route
  falls through.
- **The `latest` tag wins when it satisfies the range, and deprecated versions are
  passed over,** as in npm, so `react@^19` may not be the highest matching version.
- **Prereleases only match a range that names one.** `^20` does not match
  `20.0.0-rc.1`; `>=20.0.0-rc.0` does.

### Probing, health and failover

- **`probe: "none"` records no health data.** Nothing was checked, so circuits never
  open and `adaptive()` never learns. It is for build-time routing you trust.
- **`verified()` trusts the first download when no hash is pinned** (trust on first
  use), and it downloads even with `probe: "none"`. With the default `"head"` probe the
  download is the probe (one `GET` per candidate); with another probe it follows it.
- **Integrity covers the entry module only.** `verified()` hashes the one URL it
  selected, not the modules that file imports in turn.
- **`router.import()` only resets the failure streak when the import completes.** A
  mirror that passes the probe but fails to import accumulates failures and its circuit
  opens; `resolve()` and `build()` never import, so there a passing probe still resets
  it.
- **A circuit is half-open after `reset`.** The failure streak is not reset when the
  circuit closes again, so the next failure reopens it immediately; only a success
  closes it for good.
- **A per-call `onEvent` replaces the router's handler, it does not add to it.**
  Exceptions thrown by a handler are swallowed.
- **`trace` is a live array.** After a `race()`, events from the losing probes can
  still be appended for a moment after `resolve()` returns.
- **`router.import()`'s import failures are not in any trace.** They are reported only
  to `onEvent` (`{ type: "fail", phase: "import" }`).
- **Runtime failover can switch builds.** Without a lockfile entry or `options.build`,
  `router.import()` may move from esm.sh to jsDelivr's `+esm` bundle. Switching to a raw
  `"npm"` build at runtime only works when the page's import map already covers that
  build's own bare imports.

### In the browser and the v1 API

- **Firefox ignores an import map added after any module has loaded** (155, the version
  the browser tests run), so `startup()` and `injectImportMap()` work in Chromium and
  WebKit only. Firefox logs "Import maps are not allowed after a module load or preload
  has started" and leaves bare specifiers unmapped; mport is itself a module, so it is
  always too late. `startup()` now notices (it asks `import.meta.resolve()`) and rejects
  with an `Error` carrying the build result as `error.result`, instead of leaving bare
  imports to fail later with a `TypeError`. What works in all three engines: a map in the
  HTML before any module script (build it ahead of time and use `renderImportMap()`), or
  `createImporter()`, which needs no map. Permanent until Firefox ships late or multiple
  import maps; a browser test fails the day it does.

- **The import map must come before any `modulepreload` link.** Firefox (155) ignores an
  import map that follows a `modulepreload` (the same rule as a late map), so every bare
  import fails there; Chromium and WebKit accept either order. Docs and example 12 print
  `renderImportMap()` first, then `renderModulePreload()`; a browser test pins it per engine.
- **`local()` asks the registry unless you give it `installedRegistry()`.** A package that is
  not on npm is a `ResolutionError`, and a published one resolves to the registry's `latest`,
  not the copy you serve. `installedRegistry({ root })` (Node only, from
  `@johnhenry/mport/node`) reads `<root>/<name>/package.json` instead; it does not walk up
  parent `node_modules`, and a vendored copy has no `integrity` (`graph` skips origin-relative
  URLs, listing them in `graph.skipped`).
- **A CSP hash covers the map's exact text.** Re-serialising the page (a minifier, CRLF
  conversion) changes the text and the browser blocks the map: write `renderImportMapCsp()`'s
  `html` out unchanged and recompute the hash whenever the map changes. The hash functions are
  async (Web Crypto, a secure context in browsers), and under `require-trusted-types-for
  'script'` an `injectImportMap()` map is refused, so put it in the HTML.
- **`dependencies` expands only declared, raw-CDN dependencies.** esm.sh, jsDelivr `+esm` and
  jspm are not expanded; a module that imports something it does not declare, a Node built-in
  or a CommonJS dependency is not helped (the dependency lands in `skipped`); only
  `dependencies` count, not dev, peer or optional ones; nested `node_modules` layouts are not
  modelled by `local()` + `installedRegistry()`.

- **`startup()` has to win the race with your modules.** The import map must be in the
  document before the first module that uses it resolves: put the startup code in its
  own `<script type="module">` before the rest, or generate the map at build time.
- **The v1 functions don't resolve ranges.** With no version they use `latest`, and a
  range is handed to the CDN. A `useCache: "localhost"` hit whose import fails rejects
  rather than racing again, and the default v1 race still mixes builds (raw
  jsDelivr/unpkg files against jspm's transformed output). For consistent builds, use a
  router such as `createRouter({ "*": race(jsDelivr(), unpkg()) })`.
- **The v1 functions accept only JSON and CSS import attributes** (since 0.0.1). Per-call
  `importOptions` other than none, `{ with: { type: "json" } }` or `{ with: { type: "css" } }`
  reject with a `TypeError` before anything is imported; use `createRouter({ importer })` for
  others. See [The v1 API](/mport/api/v1/#mport-and-mporturl).

### Bundler plugins

- **`"external"` mode picks one URL per import at build time.** There is no runtime
  failover and no `integrity` (a URL in an `import` statement can't carry one). Use
  `mode: "importmap"` to keep bare imports and get a map with `integrity` and scopes.
- **Only imports the bundler reports are routed**, and a routable package whose lookup
  fails fails the build. Vite's dev server is untouched by default (it pre-bundles
  itself), so dev and production can differ. Tested against Rollup 4 and Vite 8; other
  majors are untested. See [Bundler plugins](/mport/api/bundler-plugins/#bundler-plugins).

## Permanent limitations

These follow from what raw CDNs, import maps and the npm registry are, not from mport.

- **Raw file CDNs serve packages exactly as published.** A CommonJS entry can't be
  imported by a browser, and mport's detection of CommonJS is a heuristic over
  `package.json` (file extension, `type`, `module`, export conditions, naming
  conventions): a `.js` ES module with none of those signals is skipped, and a CommonJS
  file that looks like ESM is served. Raw ES modules also keep their own bare imports
  (`import "preact"`), which only resolve if the page's import map covers them
  (`build(…, { dependencies: true })` adds the ones a manifest declares);
  ESM-transforming CDNs (esm.sh, jsDelivr `+esm`) rewrite those. The exact rules:
  [CommonJS detection](/mport/api/registry-and-semver/#commonjs-detection).
- **Import maps have no runtime fallback.** The platform lets a specifier map to one URL
  and gives no hook to retry when that fetch fails, so a map built with `startup()` or
  the CLI is only as available as the mirror it chose. Failover after page load exists
  only for loads that go through `router.import()` / `createImporter()`, and switching
  builds at runtime only works when the new build's own imports resolve. Permanent until
  import maps grow a fallback mechanism.
- **A probe proves availability, not correctness.** `probe: "head"` learns that a URL
  answers, not that it is an ES module that will evaluate; `probe: "none"` checks
  nothing and records no health; `resolveVersions: false` hands the CDN a range it
  resolves on its own (so providers that need an entry file, the raw CDNs, skip a range
  and fall through). `verified()` hashes the entry module only; `build(…, { graph: true })` hashes the
  modules it imports in turn too. Either checks bytes only against a hash you already
  have: without a pinned `integrity` it records whatever the first mirror served (trust
  on first use).
  By design: stronger checks cost a download per candidate.
- **The npm registry answers an unknown package with a 404 that carries no CORS
  header.** In a browser that surfaces as a network error, so "this package doesn't
  exist" and "the registry is unreachable" are the same `ResolutionError` (its message
  says so). Registry lookups also cost a request per package per page load; resolve at
  build time or ship a lockfile to avoid both. A property of registry.npmjs.org, not of
  mport.
