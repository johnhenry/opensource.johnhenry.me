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

**A directory specifier is matched as written too.** `components/` (a prefix mapping) has the match
text `components`, and is also tested as `components/`, so a `"components/*"` route captures it;
an exact `"components"` route still does. (Before, `components/` skipped a `"components/*"` route
and was looked up on the registry.)

#### Recipe: an app-owned prefix, no registry

Your own modules can be routed like packages, so one import map covers your code and your
dependencies, and a lockfile or `verified()` strategy can treat them uniformly:

```js
const router = createRouter({
  "components/*": custom("/components/{path}", { name: "app", build: "app" }),
  "*": [esmSh(), jsDelivr()],
});
await router.build(["components/button.js", "components/", "react@^19"]);
// "components/button.js" → "/components/button.js", "components/" → "/components/", react → esm.sh
```

Why it needs no registry: a [`custom()`](/mport/api/providers/#custom) template needs a version lookup only if it contains
`{version}`, and an entry lookup only if it contains `{entry}`; `{path}` alone is just the part of the
specifier after the package name (`components/forms/input.js` → `forms/input.js`), so the router never asks npm about a
package called `components`. Choices that matter:

- **Give it an explicit `name` and `build`.** Without them both default to the template's host, and a
  path-only template has none (the template string itself becomes the name). `name` is the identity in traces,
  health and `exclude`; `build: "app"` is what the lockfile pins, so a lock-pinned `components/…` can only be
  served by another provider of build `"app"` (say a `custom("https://static.example.com/components/{path}", { build: "app" })` mirror), never by a CDN
  that happens to have a package of that name.
- **A directory specifier (`components/`) gives a prefix mapping** (`"components/": "/components/"`), so any
  `import "components/x.js"` resolves without listing each file. Listing files gives you `modulepreload` and
  `integrity` candidates; the prefix does not.
- **Route on the first path segment.** The route pattern is matched against the specifier without a version, so
  `"components/*"` (or `/^components(\/|$)/` in the array form) captures it. A package of the same name on
  npm is shadowed by the route, which is the point.
- The lockfile records `{ provider: "app", build: "app", url }` and **no `version`**; there is nothing to pin.
  Files are not hashed (`graph` skips origin-relative URLs).

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
router.build(specifiers: string[], options?: { scopes?, signal?, conflicts?, graph?, dependencies?, dependencyDepth? }): Promise<{ importMap: ImportMap, lock: Lockfile, conflicts: ConflictReport[], dependencies?: DependencyReport, graph?: GraphReport }>
```

Resolves every specifier concurrently and compiles an [import map](/mport/api/lockfiles-and-import-maps/#import-maps).
`scopes` is `{ [scopeURL]: { [importMapKey]: specifier } }`; each scoped specifier is
resolved and placed under its scope with the key you gave. A specifier that resolves to
`null` (unroutable or unmatched) rejects the whole build with
`ResolutionError("mport: no route for …")`; nothing is silently dropped. Any other
rejection from `resolve()` rejects the build.

`conflicts` is `"error"` (the default) or `"scope"`; see [Conflicting versions](#conflicting-versions-conflicts-scope).
Any other value is a `TypeError`. The result's `conflicts` array holds one
[`ConflictReport`](#conflicting-versions-conflicts-scope) per conflicting key that `"scope"` handled
(always empty with `"error"`).

`graph` (default off) is `true` or [`GraphOptions`](#whole-graph-integrity-graph); the result then
has a `graph` report.

`dependencies` (default `false`) is `true` or `"prod"` and `dependencyDepth` (default `5`) a
non-negative integer; see [Including dependencies](/mport/api/router/#including-dependencies-dependencies). Any other
value is a `TypeError`. The result then has a `dependencies` report.

`lock` is `router.lock.toJSON()`: every resolution this router has made itself so far,
including earlier `resolve()` and `import()` calls, not only this build's specifiers. It
starts **empty**: entries of the `lock` option are read-only pins, never copied across, so
specifiers you no longer build are pruned from the written lockfile. Use a fresh router
per build if the lockfile should contain exactly one build's inputs.

#### Including dependencies (`dependencies`)

A raw file CDN (jsDelivr, unpkg) or `local()` serves a package's files exactly as published. A
file that says `import("dompurify")` or `import "preact"` keeps that bare specifier, which the
browser resolves through **your** import map, and the map holds only what you asked `build()` for.
You can list every dependency by hand, or let the build read each resolved package's manifest:

```js
const { importMap, dependencies } = await router.build(["safe-fragment@1"], { dependencies: true });
// importMap.imports: { "safe-fragment": ".../safe-fragment@1.0.0/index.js", "dompurify": ".../dompurify@3.2.0/purify.es.mjs" }
```

| Option | Meaning |
|---|---|
| `dependencies: true` or `"prod"` | the two are the same: add the package's manifest **`dependencies`**. Dev, peer and optional dependencies are not added (a peer is the app's choice; list it yourself). Default `false`. |
| `dependencyDepth` | levels to follow, the specifiers you list being level 0 (default `5`; `0` adds nothing and reports every direct dependency as truncated). Dependencies of dependencies are followed, each `name@version`'s manifest is read once, and cycles end. |

How each dependency is handled:

- **It is routed like any specifier**, `<name>@<range>` through the router's own routes (so a
  dependency can land on a different provider than its dependent), resolved to an exact version by the
  usual rules and **locked** in `result.lock` as `<name>@<range>`. A lockfile therefore reproduces the
  expanded build. The import-map key is the package name; a sub-path an entry imports
  (`dompurify/purify.js`) is not added, list it as a specifier.
- **Ranges are respected.** A dependency already in the build (listed, or added earlier) whose
  resolved version satisfies the dependent's range is left alone. If it does not satisfy it, the
  dependency is resolved at the dependent's range too and meets the existing
  [`conflicts`](/mport/api/router/#conflicting-versions-conflicts-scope) handling: the default `"error"` throws
  (`conflicting resolutions for "dompurify"…`), `"scope"` keeps the first and gives the dependent a scope with its own version.
  The expansion runs before `conflicts` and `graph`, so scopes cover added packages and `graph` hashes their files.
- **Only packages on raw-file providers are expanded**: those with the `raw` capability
  (`jsDelivr()`, `unpkg()`, `local()`, and a `custom()` / `provider()` you declare `capabilities: ["raw"]`
  for) from the npm registry. **esm.sh and `jsDelivr({ esm: true })` rewrite a module's imports
  themselves** (the bare `"dompurify"` in the source becomes a URL to the dependency, which they
  serve). Adding the same packages to the map would only duplicate them, at the risk of a different
  version than the one the CDN wired in. jspm is also a transforming provider (build `jspm`, no `raw`
  capability), so it is treated the same way. They are reported in `skipped` as `rewrites its own imports`
  and no manifest is fetched.
  GitHub and JSR packages have no npm manifest and are not expanded.
- **A dependency that cannot be added is reported, not thrown**: a range that is not a registry
  range (`github:…`, `file:…`, `workspace:…`, `npm:` aliases), no matching route, or a
  resolution error (not published, CommonJS-only on a raw CDN) goes to `skipped` with its reason, and
  everything else is still added. Aborting (`signal`) does throw.

`result.dependencies`:

```ts
{
  added: [{ specifier, key, version, url, provider, from, range, depth }],   // from: "<name>@<version>" of the dependent
  skipped: [{ from, provider?, name?, range?, reason }],                      // name + range: a dependency; else a package not expanded
  truncated: [{ name, range, from, depth, limit }],                           // beyond dependencyDepth
  maxDepth,
}
```

Each addition is also an `onEvent` event, `{ type: "dependency", phase: "dependencies", provider: "build", reason }`
(`truncated` and `fail` likewise). From the CLI: `mport build --dependencies [--dependency-depth N]`, or
`dependencies` / `dependencyDepth` in the config; it prints each added dependency and a warning for
each skipped or truncated one. `registry.manifest()` is required: the default client and
[`installedRegistry()`](/mport/api/registry-and-semver/#installedregistry) have it. `mport update` also honours `config.dependencies`.

Limits: manifests describe what a package *declares*; a module that imports something it does
not declare is not helped, and a package that imports a Node built-in or a CommonJS dependency is not made browser-ready by
this (the dependency lands in `skipped`). Nested `node_modules` layouts are not modelled with `local()` + `installedRegistry()`: one version per name, from `root`.

#### Conflicting versions (`conflicts: "scope"`)

An import map maps one key to one URL per scope. If `react@18.3.1` and `react@19.2.0` are
both requested, the unscoped `imports.react` can hold only one, and the other is reachable
only from a **scope**. By default `build()` throws (`ResolutionError`, *conflicting
resolutions for "react"*). With `conflicts: "scope"` it instead:

1. keeps the **first listed** specifier in `imports` (put your app's own version first);
2. for every other package in the build, reads its registry manifest (`dependencies`,
   `peerDependencies`, `optionalDependencies`; one `GET <npm>/<name>/<version>` per
   package, memoized) and looks at the range it declares for the conflicting package;
3. gives each such dependent the first of the conflicting versions that satisfies its
   range, *if that is not the unscoped one*, as an entry in `scopes[<dependent's package
   directory>]`. The directory is the dependent provider's `base()` for that exact
   version (`https://cdn.jsdelivr.net/npm/lib-a@1.0.0/`, `https://ga.jspm.io/npm:lib-a@1.0.0/`,
   `https://esm.sh/lib-a@1.0.0/`).

The scope key is a **URL prefix of the importing module**, which is how import maps work:
for every module whose URL starts with it, the scoped mapping beats the top-level one.
Each scoped URL's `integrity` is carried into the map like any other. Each conflicting key
yields a report, also traced as `{ type: "conflict", provider: "build", reason }` through
`onEvent`:

```ts
interface ConflictReport {
  key: string;
  kept: { specifier: string; url: string };      // owns the unscoped imports entry
  scoped: Array<{ specifier; url; scope; dependent: "name@version"; range }>;
  unscoped: Array<{ specifier; url }>;            // versions no package in the build depends on
}
```

Why this design rather than a `{ scope }` per specifier: the information that decides which
dependent needs which version is the dependency graph, and the registry already records it.
Explicit scopes remain available (`build(specifiers, { scopes })`) and combine with
`conflicts: "scope"`. They are also the only way to scope something the manifests don't
tell you about.

**Limits, stated plainly:**

- Dependents are the **npm packages named in this build**, not their transitive
  dependencies. If `lib-a` imports `lib-a-utils` which imports `react@18`, list
  `lib-a-utils` in the build too (or add an explicit scope); otherwise `lib-a-utils` sees
  the unscoped version.
- Scopes only change what a **bare specifier** inside a file resolves to. Builds that
  rewrite their dependency imports to absolute URLs (esm.sh, jsDelivr `+esm`) never use
  the key, so for them the scope is generated but has no effect; the version a module
  gets is already fixed inside it. Scopes matter for jspm, raw CDNs (jsDelivr, unpkg)
  and `local()`, whose files keep bare imports.
- A key conflicting between two **explicit** scoped lists, or two different URLs inside one
  scope, is still an error.
- `npm` dependents only; JSR and GitHub packages have no manifest the router reads.
- A conflicting version nobody depends on (or whose dependents' ranges it doesn't satisfy)
  ends up in no scope: it is listed under `unscoped` and the map still has no way to reach
  it. The page's own modules can only ever see the unscoped version.
- A dependent whose range both the unscoped version and another satisfy keeps the unscoped
  one. A dependent whose range no listed version satisfies gets nothing.

#### Whole-graph integrity (`graph`)

`verified()` proves the bytes of the one URL a specifier resolves to. On esm.sh that URL
is a stub (`export * from "/react@19.2.0/es2022/react.mjs"`) and the real code is one hop
away, unchecked. `build(specifiers, { graph })` closes that gap at build time:

1. For every module the build maps (top-level, scoped, conflict-scoped; **not** prefix
   specifiers such as `lit/`, which map a directory), it `fetch`es the URL with the
   router's `fetch` and computes its SRI hash (`algorithm`, default `sha384`).
2. It parses the file's **static** imports (`import … from`, `import "x"`,
   `export … from`, `export * from`, with or without `with { … }` attributes;
   `import("literal")` as well when `dynamic: true`) with [`parseImports()`](/mport/api/lockfiles-and-import-maps/#parseimports),
   resolves each against the file's URL, and repeats for every **same-origin** URL it
   has not seen. Origin means the module's own origin plus `origins`.
3. Every hash goes into the import map's `integrity` (so the browser verifies every file),
   and into the lockfile's top-level `files` map. The entry's hash is also its package's
   `integrity`. If `verified()` or the lockfile already pinned a different hash for the
   entry, the build rejects with `IntegrityError`.

On the next build the lockfile's `files` are expectations: a file whose bytes no longer
match rejects with `IntegrityError` (traced `fail`, `phase: "integrity"`) instead of being
re-recorded. Dropping the lock (`relock`, a router without `lock`) accepts the new bytes.
A file that cannot be fetched (non-OK, network error) **fails the build**: it could not be
hashed, and an unlisted file is an unverified one.

`GraphOptions`: `maxFiles` (default 500, counted across the whole build), `maxDepth`
(default 20 hops from a module), `dynamic` (false), `origins` (none), `algorithm`
(`"sha384"`), `concurrency` (8). Hitting a bound does not fail the build: the files past it
are not fetched and the walk reports it, as a `{ type: "truncated", phase: "graph",
provider, url, reason: "maxFiles" | "maxDepth", limit, skipped, examples }` event through
`onEvent` and as `result.graph.truncated` (one entry per module and bound). The CLI prints
a warning for each. A truncated lockfile is a *partial* one: treat the warning as an
error in CI, or raise the bound.

`result.graph` is `{ files, truncated, bare, skipped }`: `bare` lists the bare specifiers
found inside files (raw CDN files import their dependencies by name, so they depend on
your import map; they are **not** followed), `skipped` the imports left alone (other
origins, non-HTTP schemes).
A module that a provider maps to an origin-relative URL (`local()`: `/node_modules/…`) has nothing to be fetched
from at build time: it is left out of the walk, listed in `skipped` (`{ url, from: <its specifier>, reason }`) and gets no
`integrity`, so one `build({ graph: true })` can mix local and CDN packages. (It used to throw `TypeError: Invalid URL`.)

**Limits:**

- *The parser is a tokenizer, not a JavaScript parser.* It skips comments, strings,
  template literals and regular expressions and finds import/export statements; it is
  exercised on minified esm.sh output. A construct it misreads (an obscure regex or
  division ambiguity) can hide or invent an import; a hidden one is simply not hashed.
- Dynamic imports with computed arguments, `new Worker(url)`, `fetch()`ed assets, CSS
  and anything else the code loads at run time are not in the graph, and neither are
  other origins (a CDN file importing from a second CDN).
- It hashes the bytes *the build machine's* request received. esm.sh pins `?target=` so
  those bytes don't depend on the User-Agent; a CDN that varies its output per client
  produces a hash some browsers will reject.
- Browsers verify import map `integrity` only where they implement the key; where they
  don't, the entries are ignored (as an unknown key is) and nothing is verified.
- Every file is downloaded once more at build time (the entry is fetched again even
  after `verified()`), so this is for build and CI, not page load.

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
still reads the registry unless the lockfile pins the entry. A package that is not on npm
is then a `ResolutionError` ("not found in the registry"), and a published one resolves to
the registry's `latest`, not to the copy you serve. Give the router an
[`installedRegistry({ root })`](/mport/api/registry-and-semver/#installedregistry) (`createRouter(routes, { registry })`) and
the version, the entry and the manifest all come from the installed `package.json`.
