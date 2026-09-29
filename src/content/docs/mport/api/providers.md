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
| the provider's circuit is closed | `circuit open` |
| (after resolving the artifact) the entry is not CommonJS, unless `allowCommonJS` | `<entry> is CommonJS; raw file CDNs can't serve it to browsers (…)` |

Then the URL is built and [probed](/mport/api/probing-and-health/#probing).

## Built-in providers

| Factory | `name` | `build` | Registries | Capabilities | needsEntry | URL shape |
|---|---|---|---|---|---|---|
| `esmSh({ origin?, name? })` | `esm.sh` | `esm.sh` | npm, jsr, github | browser, esm-transform, types | no | `https://esm.sh/[jsr/\|gh/]<name>[@<version>][/<path>]` |
| `jsDelivr({ origin?, name? })` | `jsdelivr` | `npm` | npm, github | raw | yes | `https://cdn.jsdelivr.net/<npm\|gh>/<name>[@<version>]/<entry or path>` |
| `jsDelivr({ esm: true, origin?, name? })` | `jsdelivr-esm` | `jsdelivr-esm` | npm | browser, esm-transform | no | `https://cdn.jsdelivr.net/npm/<name>[@<version>][/<path>]/+esm` (no prefix specifiers) |
| `unpkg({ origin?, name? })` | `unpkg` | `npm` | npm | raw | yes | `https://unpkg.com/<name>[@<version>]/<entry or path>` |
| `jspm({ origin?, name? })` | `jspm` | `jspm` | npm | browser, esm-transform | yes | `https://ga.jspm.io/npm:<name>[@<version>]/<entry or path>` |
| `jsr({ origin?, name? })` | `jsr` | `esm.sh` | jsr | browser, esm-transform, types | no | `https://esm.sh/jsr/<name>[@<version>][/<path>]` |
| `jsr({ via: "jsr.io", origin?, name? })` | `jsr` | `jsr` | jsr | types, deno | no | `https://jsr.io/<name>/<version>/<path>`; throws without a path |
| `github({ name? })` | `github` | `npm` | github | raw | no | `https://cdn.jsdelivr.net/gh/<user>/<repo>[@<ref>]/<path>` |
| `github({ via: "esm.sh", name? })` | `github` | `esm.sh` | github | browser, esm-transform, types | no | `https://esm.sh/gh/<user>/<repo>[@<ref>][/<path>]` |
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
- `jsr()` defaults to esm.sh's build, so it and `esmSh()` are mirrors of each other.
- `github()` defaults to jsDelivr's `"npm"` build, so it can stand in for other raw mirrors
  of a GitHub-hosted package only if they serve the same files.
- A prefix specifier (`lit/`) maps to the provider's `base()`: its URL with an empty
  path and entry, ending in `/`. `jsDelivr({ esm: true })` has no base and rejects.

### provider()

```ts
provider({ name, build?, registries?, capabilities?, needsEntry?, needsVersion?, url, base? }): Provider
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
| `url(artifact)` | function | required (`TypeError` without it) | the URL for an artifact |
| `base(artifact)` | function | `url()` with empty path and entry, plus a trailing `/` | the directory URL for prefix specifiers |

Returns `{ kind: "provider", name, build, registries, capabilities, needsEntry, needsVersion, url, base, select }`.
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
