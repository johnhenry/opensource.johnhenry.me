---
title: "createRouter() and the router"
description: "createRouter(), route matching, every router option, router.resolve(), router.import(), router.build(), and how versions and entry files are resolved."
sidebar:
  label: "Router"
  order: 102
---

## createRouter()

```ts
createRouter(routes: Routes, options?: RouterOptions): Router
```

Returns `{ name, health, lock, resolve, import, build }`.

### Routes and matching

`routes` is an object or an array.

**Object form**: `{ [pattern]: route }`. Patterns are ranked, not taken in order:

| Pattern | Matches | Rank |
|---|---|---|
| `"react"` (no `*`) | exactly that match text | highest |
| `"@std/*"`, `"react*"` (trailing `*`) | any match text starting with the part before `*` | longer prefix beats shorter |
| `"*"` | everything | lowest |

Ties keep insertion order. Only a trailing `*` is a wildcard. Note that `"react*"`
matches `react-dom` and `reactive` too; use `"react"` and `"react/*"` to mean only React.

**Array form**: `[{ match, use }]`, usually built with [`route()`](#route). The first
entry whose `match` accepts wins; nothing is ranked. `match` is a pattern string as above,
a `RegExp` (tested with `.test()`), or a function `(matchText) => boolean`.

**Match text** is the specifier without its version: `react/jsx-runtime`,
`@scope/pkg/dist/x.js`, and for explicit specifiers `npm:react/jsx-runtime`,
`jsr:@std/path`, `github:user/repo/x.js`. An explicit specifier is tested with and without
its prefix, so `npm:react` also matches a `"react*"` route; the highest-ranked route that
accepts either form wins, so with `{ "npm:*": a, "react": b }` the specifier `npm:react`
goes to `b`. `gh:` specifiers match as
`github:`, so a route pattern `"gh:*"` never matches anything; write `"github:*"`.

**Route values:**

| Value | Means |
|---|---|
| a provider or strategy node | itself |
| an array | `fallback(...)` of its elements (nested arrays become nested fallbacks) |
| a string | `custom(string)`, a [custom origin](/mport/api/providers/#custom) |

The string and array shorthands work only at the top level of a route value (and inside
its arrays). Inside `fallback()`, `race()` and the other strategies, a string throws
`TypeError: wrap URL strings with custom() inside strategies`.

#### route()

```ts
route(match: string | RegExp | ((matchText: string) => boolean), use: Route): { match, use }
```

Builds one array-form entry.

### Router options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `probe` | `"head" \| "import" \| "none" \| function` | `"head"` | How a candidate URL is checked. See [Probing](/mport/api/probing-and-health/#probing). |
| `lock` | `Lockfile` | none | A lockfile whose entries pin version, entry, build and integrity. See [Lockfiles](/mport/api/lockfiles-and-import-maps/#lockfiles). |
| `resolveVersions` | `boolean` | `true` | Resolve ranges to exact versions through the registries. With `false`, providers get the range (or nothing) as written, e.g. `https://esm.sh/react@^19?target=es2022`; exact versions and lockfile pins still apply. Providers that need an entry file (`needsEntry`: jsDelivr raw, unpkg, jspm, `local()`) can't look one up for a range, so they **skip** with a reason (`needs an exact version to find its entry file…`) and the route falls through to e.g. esm.sh; an exact version or a lockfile pin still gets an entry. |
| `circuitBreaker` | `{ failures?, reset? }` | `{ failures: 3, reset: 30000 }` | Options for this router's own [`HealthRegistry`](/mport/api/probing-and-health/#healthregistry). Ignored when `health` is given. |
| `health` | `HealthRegistry` | a new one | Share health and open circuits with another router (`health: other.health`). |
| `target` | `string` | `"browser"` | Default target for [`prefer()`](/mport/api/strategies/#prefer). |
| `capabilities` | `string[]` | none | Capabilities every provider must have; a provider missing one is skipped (`lacks …`). |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Used for probes, registry lookups (unless `registry` is given) and `verified()`. Tests and the examples pass a fake. |
| `importer` | `(url) => Promise<module>` | `(url) => import(url)` | Used by `probe: "import"` and by `router.import()`. |
| `registries` | `{ npm?, jsr?, fetch? }` | `https://registry.npmjs.org`, `https://jsr.io` | Registry base URLs, passed to `createRegistry({ fetch, ...registries })`. |
| `registry` | `RegistryClient` | `createRegistry(...)` | A registry client to use instead (see [createRegistry()](/mport/api/registry-and-semver/#createregistry)). |
| `onEvent` | `(event) => void` | none | Called with every [trace event](/mport/api/trace-and-errors/#trace-events) as it happens, plus `router.import()`'s import failures. Exceptions it throws are swallowed. |
| `now` | `() => number` | `Date.now` | Clock for health, circuit timing and event timestamps. |
| `allowCommonJS` | `boolean` | `false` | Let raw file CDNs serve packages whose entry looks like CommonJS. See [CommonJS detection](/mport/api/registry-and-semver/#commonjs-detection). |
| `name` | `string` | `"mport"` | Exposed as `router.name`; not used otherwise. |

### router.resolve()

```ts
router.resolve(specifier: string | SpecifierObject, options?: ResolveOptions): Promise<Resolution | null>
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `signal` | `AbortSignal` | none | A pre-aborted signal rejects immediately with `signal.reason`; aborting later rejects promptly with it, even while a shared registry lookup or an uncancellable import probe is still running. `race()` aborts its in-flight probes. |
| `exclude` | `Iterable<string>` | none | Provider names to skip (`skip`, reason `excluded`). |
| `build` | `string` | the lockfile entry's build | Only providers with this build may serve. |
| `integrity` | `string` | the lockfile entry's integrity | Expected SRI hash for [`verified()`](/mport/api/strategies/#verified). |
| `target` | `string` | the router's `target` | Target for `prefer()`. |
| `capabilities` | `string[]` | the router's `capabilities` | Replaces the router's list for this call. |
| `relock` | `boolean` | `false` | Ignore the lockfile for this call. |
| `onEvent` | `(event) => void` | the router's `onEvent` | Replaces (does not add to) the router's handler for this call. |

Steps: parse the specifier (`null` if unroutable); find the route (`null` if none
matches); look up the lockfile entry by [`lockKey`](/mport/api/lockfiles-and-import-maps/#lockkey); run the route's node, which
resolves the version and entry lazily for the providers that need them; build the
Resolution; store it in every [`cache()`](/mport/api/strategies/#cache) node anywhere in the router's route
table; record it in `router.lock`.

**Returns** `null` for unroutable or unmatched specifiers, otherwise a **Resolution**:

| Field | Type | Meaning |
|---|---|---|
| `specifier` | `string` | the specifier as given; for object specifiers, `keyOf()` of it |
| `key` | `string` | the import-map key ([`keyOf`](/mport/api/specifiers/#keyof)) |
| `registry` | `"npm" \| "jsr" \| "github"` | the registry that actually served it (a bare `@std/path` routed to JSR says `"jsr"`) |
| `name` | `string` | package name |
| `range` | `string?` | the range as written |
| `version` | `string?` | the exact version (or the range when versions weren't resolved) |
| `path` | `string` | the sub-path, `""` when none |
| `entry` | `string?` | the entry file, for providers that needed one |
| `build` | `string` | the serving provider's build |
| `provider` | `string` | the serving provider's name |
| `url` | `string` | the URL to import |
| `base` | `string?` | for prefix specifiers only: the directory URL mapped by the import map |
| `integrity` | `string?` | SRI hash from `verified()` or from the lockfile |
| `module` | `unknown?` | the imported module, when `probe` is `"import"` |
| `cached` | `boolean` | served from a `cache()` node without probing |
| `trace` | `TraceEvent[]` | every attempt; see [Trace events](/mport/api/trace-and-errors/#trace-events) |

`trace` is the live array the strategies write into. After a `race()`, events from the
losing probes can still be appended for a moment after `resolve()` returns.

**Rejects** with the first applicable of: `signal.reason` (aborted); `ResolutionError`
(the package or version can't exist, or the registry is unreachable); `RoutingError`
(a fallback or race ran out of providers); `SkipError` or `IntegrityError` when the
route is a single provider or `verified()` node that declined; a plain `Error` from a
provider that can't build the URL (`jsr({ via: "jsr.io" })` without a path). Whatever it rejects with gets a `trace`
property. See [Errors](/mport/api/trace-and-errors/#errors).

### router.import()

```ts
router.import<T>(specifier: string | SpecifierObject, options?: ResolveOptions): Promise<T>
```

Resolves, then imports, with failover when the **import** fails (a URL that passed the
probe but whose module failed to load or evaluate). Rules:

1. `resolve(specifier, { ...options, exclude })`. If it returns `null`, the specifier is
   imported as it is with the router's `importer` (so relative imports still work).
2. If the Resolution has a `module` (`probe: "import"`), return it without importing again.
3. Otherwise import `url`. On success, return the module.
4. On failure: record a health failure against the provider, add it to `exclude`, emit
   `{ type: "fail", phase: "import", provider, url, error, at }` to `onEvent` (it is not
   in any Resolution's trace), and go back to 1.
5. When `resolve()` finally rejects (every provider excluded, skipped or failed): if any
   import failed, reject with `RoutingError("mport: could not import <specifier>")` whose
   `errors` are the import errors followed by the final rejection; otherwise rethrow the
   rejection as is.

**Build switching.** Failover may move to a different build (esm.sh → jsDelivr's `+esm`)
unless something pins one: a lockfile entry for the specifier, or `options.build`. With a
pin, only same-build mirrors are tried, and when they are exhausted the call rejects. Raw
file builds (`"npm"`) contain bare imports of their own dependencies, so switching to one
at runtime only works when the page's import map already covers those.

### router.build()

```ts
router.build(specifiers: string[], options?: { scopes?, signal? }): Promise<{ importMap: ImportMap, lock: Lockfile }>
```

Resolves every specifier concurrently and compiles an [import map](/mport/api/lockfiles-and-import-maps/#import-maps).
`scopes` is `{ [scopeURL]: { [importMapKey]: specifier } }`; each scoped specifier is
resolved and placed under its scope with the key you gave. A specifier that resolves to
`null` (unroutable or unmatched) rejects the whole build with
`ResolutionError("mport: no route for …")`; nothing is silently dropped. Any other
rejection from `resolve()` rejects the build.

`lock` is `router.lock.toJSON()`: every resolution this router has made itself so far,
including earlier `resolve()` and `import()` calls, not only this build's specifiers. It
starts **empty**: entries of the `lock` option are read-only pins, never copied across, so
specifiers you no longer build are pruned from the written lockfile. Use a fresh router
per build if the lockfile should contain exactly one build's inputs.

### router.health, router.lock, router.name

- `router.health`: the router's [`HealthRegistry`](/mport/api/probing-and-health/#healthregistry) (or the one passed as
  `health`).
- `router.lock`: a [`Lock`](/mport/api/lockfiles-and-import-maps/#createlock) recording each resolution by `lockKey`. The
  `lock` option is read separately and never modified.
- `router.name`: the `name` option.

## Resolution: versions and entry files

The lockfile's `version` is only ever a **resolved** version. A provider with
`needsVersion: false` (`local()`, `origin()`) is handed the range as written to build its
URL, but the lock records `version` only when a resolution happened anyway (`local()`
looks up the entry file, so it does) and otherwise omits it.

The deterministic half, run lazily and only for the providers that need it.

**Versions** (providers with `needsVersion`, which is all built-ins except `local()` and
`origin()`):

| Situation | Version | Registry request |
|---|---|---|
| the lockfile pins a version (and no `relock`) | the pinned one, if it is an exact version or a GitHub ref (an entry whose `version` is a range, as older locks recorded for `local()`/`origin()`, is ignored) | none |
| `resolveVersions: false` | the range as written (may be `undefined`) | none |
| GitHub | the ref as written | none |
| an exact version (`19.2.0`) | as written, even if it doesn't exist | none |
| a dist-tag present in the registry (`next`) | the tag's version | one |
| no range, `""` or `latest` | the `latest` dist-tag | one |
| any other range | npm's rule: the `latest` dist-tag if it satisfies the range, else the highest satisfying version (see [semver](/mport/api/registry-and-semver/#semver)). Versions marked `deprecated` (npm) are passed over unless nothing else satisfies | one |

npm lookups read `GET <npm>/<name>` with the abbreviated-metadata `accept` header; JSR
lookups read `GET <jsr>/<name>/meta.json` and ignore yanked versions. Lookups are
memoized per router for its lifetime (a long-lived router never re-reads `latest`);
failed lookups are forgotten and retried next time. Lookups appear in the trace as
`lookup` → `resolved` or `fail`.

**Entry files** (providers with `needsEntry`: jsDelivr raw, unpkg, jspm, local, and
`custom()` templates with `{entry}`) are looked up only when the specifier has no path,
or its path has no file extension (so `preact/hooks` is mapped through `exports`, while
`lit/decorators.js` is used as written). The lookup reads `GET <npm>/<name>/<version>`
and applies [`entryInfo()`](/mport/api/registry-and-semver/#entryinfo). Only npm packages have entries; JSR and GitHub
paths are used as written. A lockfile `entry` is used without a lookup and is trusted to
be ESM.

`local()` needs no version for its URL but still needs one to look up the entry, so it
still reads the registry unless the lockfile pins the entry.
