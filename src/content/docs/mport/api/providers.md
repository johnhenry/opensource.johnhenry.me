---
title: "Providers"
description: "Provider selection checks, the built-in providers with their builds, registries, capabilities and URL shapes, and provider(), custom() and origin()."
sidebar:
  order: 103
---

A provider turns an exact **artifact** `{ registry, name, version, path, entry, esm }`
into a URL. Its selection runs these checks in order, each producing a `skip` event with
the reason shown:

| Check | Skip reason |
|---|---|
| the provider supports the request's registry. A bare scoped name (`@std/path`, not explicit) reaching a provider that supports `jsr` but not `npm` is read as a JSR package. | `no <registry> support` |
| not in `exclude` | `excluded` |
| a pinned build (`options.build` or the lockfile) equals the provider's build | `serves build "<b>", locked to "<pin>"` |
| the provider has every required capability | `lacks <cap>, <cap>` |
| a prefix specifier needs a provider that serves directories (`prefix`, default true) | `serves no directory (prefix) mapping` |
| the provider's circuit is closed | `circuit open` |
| (after resolving the artifact) an entry file can be found: with `resolveVersions: false` and a range or tag, `needsEntry` providers can't | `needs an exact version to find its entry file, but "<range>" is not one (resolveVersions: false)` |
| (after resolving the artifact) a prefix specifier on a `needsEntry` provider needs a package without an `exports` map | `<name> has an exports map, so a directory prefix on a raw file CDN would 404 its subpaths (…)` |
| (after resolving the artifact) the entry is not CommonJS, unless `allowCommonJS` | `<entry> is CommonJS; raw file CDNs can't serve it to browsers (…)` |

Then the URL is built and [probed](/mport/api/probing-and-health/#probing).

## Built-in providers

| Factory | `name` | `build` | Registries | Capabilities | needsEntry | URL shape |
|---|---|---|---|---|---|---|
| `esmSh({ origin?, name?, esTarget? = "es2022" })` | `esm.sh` | `esm.sh` | npm, jsr, github | browser, esm-transform, types | no | `https://esm.sh/[jsr/\|gh/]<name>[@<version>][/<path>][?target=<esTarget>]` |
| `jsDelivr({ origin?, name? })` | `jsdelivr` | `npm` | npm, github | raw | yes | `https://cdn.jsdelivr.net/<npm\|gh>/<name>[@<version>]/<entry or path>` |
| `jsDelivr({ esm: true, origin?, name? })` | `jsdelivr-esm` | `jsdelivr-esm` | npm | browser, esm-transform | no | `https://cdn.jsdelivr.net/npm/<name>[@<version>][/<path>]/+esm` (skips prefix specifiers) |
| `unpkg({ origin?, name? })` | `unpkg` | `npm` | npm | raw | yes | `https://unpkg.com/<name>[@<version>]/<entry or path>` |
| `jspm({ origin?, name? })` | `jspm` | `jspm` | npm | browser, esm-transform | yes | `https://ga.jspm.io/npm:<name>[@<version>]/<entry or path>` |
| `jsr({ origin?, name?, esTarget? })` | `jsr` | `esm.sh` | jsr | browser, esm-transform, types | no | `https://esm.sh/jsr/<name>[@<version>][/<path>][?target=<esTarget>]` |
| `jsr({ via: "jsr.io", origin?, name? })` | `jsr` | `jsr` | jsr | types, deno | no | `https://jsr.io/<name>/<version>/<path>`; throws without a path |
| `github({ name? })` | `github` | `npm` | github | raw | no | `https://cdn.jsdelivr.net/gh/<user>/<repo>[@<ref>]/<path>` |
| `github({ via: "esm.sh", name?, esTarget? })` | `github` | `esm.sh` | github | browser, esm-transform, types | no | `https://esm.sh/gh/<user>/<repo>[@<ref>][/<path>][?target=<esTarget>]` |
| `local({ base?, name?, build? })` | `local` | `npm` | npm | raw, offline | yes | `<base>/<name>/<entry or path>`, `base` default `/node_modules/`; no version (`needsVersion: false`) |
| `custom(template, opts?)` | the template's host | the template's host | npm | none | with `{entry}` | see [custom()](#custom) |
| `origin(o)` | `o.path` | `o.path` | npm | none | no | `https://<path><name><versionMarker><version>/<path>`; see [origin()](#origin) |

`esmSh`, `jsDelivr`, `unpkg`, `jspm` and `jsr` take `origin` to point them at a
self-hosted mirror (`github()` does not; `local()` takes `base`). The provider's
`name` is its identity for health, circuits, `exclude` and traces: two providers with the
same name share all of those.

Notes that follow from the table:

- `jspm()` is treated as a raw file CDN for entry lookup (it needs an entry), so
  CommonJS entries are skipped on it too, although ga.jspm.io transforms packages.
- **esm.sh builds for the requester's User-Agent unless given a target**, so an unpinned
  URL can serve different bytes to Chrome and to Safari and break a pinned `integrity`
  hash. `esmSh()` therefore adds `?target=es2022` (`esTarget`, also on `jsr()` and
  `github({ via: "esm.sh" })`; `esTarget: null` leaves it to esm.sh). A **prefix** mapping
  (`lit/`) points at a directory, which can't carry a query, so it stays unpinned.
- **Integrity covers the entry module only.** `verified()` hashes the one URL it selected.
  The modules that file imports in turn (esm.sh's rewritten `/react@19.2.0/es2022/react.mjs`
  chains, dependencies of a raw file) are fetched by the browser without an integrity
  check unless you add them to the import map's `integrity` yourself; the hash proves the
  entry file's bytes, not the whole dependency graph.
- `jsr()` defaults to esm.sh's build, so it and `esmSh()` are mirrors of each other.
- `github()` defaults to jsDelivr's `"npm"` build, so it can stand in for other raw mirrors
  of a GitHub-hosted package only if they serve the same files.
- A prefix specifier (`lit/`) maps to the provider's `base()`: its URL with an empty
  path and entry, ending in `/`. Two kinds of provider **skip** a prefix specifier (with a
  reason, so the route carries on) instead of failing:
  - `jsDelivr({ esm: true })`: it serves bundles, not directories (provider option
    `prefix: false`);
  - raw providers (`needsEntry`: `jsDelivr()`, `unpkg()`, `jspm()`, `local()`) when the
    package has an `exports` map. `"react/"` would map to `…/react@19.2.0/`, but
    `import "react/jsx-runtime"` then asks for `…/react@19.2.0/jsx-runtime`, a file that
    does not exist (the exports map points somewhere else), so it would 404. Route such
    packages to an ESM-transforming CDN (esm.sh) for prefix mappings, or map each subpath
    as its own key. Packages without an `exports` map keep the directory mapping.

### provider()

```ts
provider({ name, build?, registries?, capabilities?, needsEntry?, needsVersion?, prefix?, url, base? }): Provider
```

Define your own provider.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `name` | `string` | required | identity for health, `exclude` and traces |
| `build` | `string` | `name` | what it serves; equal builds are mirrors |
| `registries` | `Registry[]` | `["npm"]` | registries it can serve |
| `capabilities` | `string[]` | `[]` | matched against the `capabilities` option |
| `needsEntry` | `boolean` | `false` | resolve the entry file (and run the CommonJS check) before `url()` |
| `needsVersion` | `boolean` | `true` | resolve the exact version before `url()`; with `false` the artifact carries the range as written |
| `prefix` | `boolean` | `true` | serves a directory for prefix specifiers; `false` skips them with a reason |
| `url(artifact)` | function | required (`TypeError` without it) | the URL for an artifact |
| `base(artifact)` | function | `url()` with empty path and entry, plus a trailing `/` | the directory URL for prefix specifiers |

Returns `{ kind: "provider", name, build, registries, capabilities, needsEntry, needsVersion, prefix, url, base, select }`.
Built-in factories return the same shape, and spreading one (`{ ...esmSh(), registries: ["jsr"] }`)
is how `jsr()` and `github()` are built.

### custom()

```ts
custom(template: string, { name?, build?, registries? = ["npm"], capabilities? = [] }?): Provider
```

Two forms:

- **A base URL** without `{`: `"https://modules.example.com/"` becomes
  `https://modules.example.com/<name>[@<version>][/<path>]`. It needs a version.
- **A template** with placeholders: `{name}` (full name), `{version}`, `{path}`, `{entry}`
  (the entry file, or the path), `{scope}` (`@scope`, including the `@`, or `""`),
  `{bare}` (the name without its scope). Unknown placeholders become `""`. A template
  needs a version only if it contains `{version}`, and an entry lookup only if it
  contains `{entry}`.

`name` and `build` default to the URL's host (`modules.example.com`). A string used as a
route value is `custom(string)` with those defaults.

### origin()

```ts
origin(o: string | { path, versionMarker? = "@", defaultVersion? = "latest" }): Provider
```

The v1 origin as a provider: `https://` + `path` + name + `versionMarker` + version (or
`defaultVersion`) + `/` + path. `name` and `build` are `path`; `needsVersion` is `false`,
so it receives the range as written. The v1 functions build their race from these.
