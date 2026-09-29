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
- **`router.build()` returns every resolution the router has ever made**, including
  earlier `resolve()` and `import()` calls, not only this build's specifiers. Use a
  fresh router per build if the lockfile should contain exactly one build's inputs.
- **When `mport.config.mjs` exports a router, `--lock` is not applied to it.** The pins
  are silently ignored (pass `lock` to your own `createRouter`), although `build` still
  writes the lockfile.
- **A pinned `entry` is trusted to be ESM.** Lockfile entries skip the entry lookup and
  the CommonJS check entirely.

### Registry lookups and caching

- **A long-lived router never re-reads `latest`.** Registry lookups are memoized per
  router for its whole lifetime (failed lookups are forgotten and retried). Create a new
  router when you want fresh dist-tags.
- **`cache()` saves the probe, not the registry request.** Its key contains the exact
  version, so a range still costs one lookup. And the router writes every successful
  resolution into **every** `cache()` node in its whole route table, not only the route
  that served it.
- **An exact version is used as written, even if it doesn't exist.** No lookup happens
  for `react@19.2.0`; a typo surfaces later as a probe failure, not a
  `ResolutionError`.
- **`resolveVersions: false` hands the CDN the range as written** (for example
  `https://esm.sh/react@^19`), so the CDN, not mport, picks the version.
- **Prereleases only match a range that names one.** `^20` does not match
  `20.0.0-rc.1`; `>=20.0.0-rc.0` does.

### Probing, health and failover

- **`probe: "none"` records no health data.** Nothing was checked, so circuits never
  open and `adaptive()` never learns. It is for build-time routing you trust.
- **`verified()` trusts the first download when no hash is pinned** (trust on first
  use), and its download is **in addition to** the probe: a `"head"` probe plus
  `verified()` is two requests per candidate, and it downloads even with
  `probe: "none"`.
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

- **`startup()` has to win the race with your modules.** The import map must be in the
  document before the first module that uses it resolves: put the startup code in its
  own `<script type="module">` before the rest, or generate the map at build time.
- **The v1 functions don't resolve ranges.** With no version they use `latest`, and a
  range is handed to the CDN. A `useCache: "localhost"` hit whose import fails rejects
  rather than racing again, and the default v1 race still mixes builds (raw
  jsDelivr/unpkg files against jspm's transformed output). For consistent builds, use a
  router such as `createRouter({ "*": race(jsDelivr(), unpkg()) })`.

## Permanent limitations

These follow from what raw CDNs, import maps and the npm registry are, not from mport.

- **Raw file CDNs serve packages exactly as published.** A CommonJS entry can't be
  imported by a browser, and mport's detection of CommonJS is a heuristic over
  `package.json` (file extension, `type`, `module`, export conditions, naming
  conventions): a `.js` ES module with none of those signals is skipped, and a CommonJS
  file that looks like ESM is served. Raw ES modules also keep their own bare imports
  (`import "preact"`), which only resolve if the page's import map covers them;
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
  resolves on its own. `verified()` checks bytes only against a hash you already have.
  By design: stronger checks cost a download per candidate.
- **The npm registry answers an unknown package with a 404 that carries no CORS
  header.** In a browser that surfaces as a network error, so "this package doesn't
  exist" and "the registry is unreachable" are the same `ResolutionError` (its message
  says so). Registry lookups also cost a request per package per page load; resolve at
  build time or ship a lockfile to avoid both. A property of registry.npmjs.org, not of
  mport.
