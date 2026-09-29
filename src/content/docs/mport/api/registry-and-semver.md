---
title: "Registry, CommonJS detection and semver"
description: "createRegistry(), entryInfo(), entryOf(), resolveExports(), the CommonJS detection rules, and the semver namespace."
sidebar:
  label: "Registry and semver"
  order: 108
---

## Registry helpers and CommonJS detection

### createRegistry()

```ts
createRegistry({ fetch? = globalThis.fetch, npm? = "https://registry.npmjs.org", jsr? = "https://jsr.io" }?): RegistryClient
```

| Method | Returns |
|---|---|
| `version({ registry, name, range })` | the exact version per the [resolution table](/mport/api/router/#resolution-versions-and-entry-files) |
| `entryInfo(name, version, subpath?)` | `{ file, esm }` from `GET <npm>/<name>/<version>` |
| `entry(name, version, subpath?)` | `entryInfo(...).file` |

All memoized per client; failures are evicted. Errors are `ResolutionError`s as listed
under [Errors](/mport/api/trace-and-errors/#errors).

### entryInfo()

```ts
entryInfo(pkg: packageJson, subpath? = ""): { file: string, esm: boolean }
```

The file to import for a package (or a sub-path), and whether it is an ES module. The
file is chosen in this order:

1. `exports`, mapped through [`resolveExports`](#resolveexports) (conditions `browser`,
   `import`, `module`, `default`, in that order; `require`, `node` and `types` are
   ignored).
2. A sub-path that `exports` doesn't map: the sub-path itself.
3. `module`.
4. `browser_module`.
5. `browser` when it is a string (object `browser` maps are ignored), else `main`, else
   `index.js`.

A leading `./` is removed.

#### CommonJS detection

Raw file CDNs serve files as published, and browsers can't import CommonJS, so the
router skips raw providers when `esm` is `false`. The rules, first match wins:

| Rule | `esm` |
|---|---|
| the file ends in `.mjs` | `true` |
| the file ends in `.cjs` | `false` |
| it was chosen through an `import` or `module` export condition (an inner `import`/`module` beats an outer `browser`/`default`) | `true` |
| the package has `"type": "module"`, or the file is the `module` field | `true` |
| ESM by naming convention: `*.module.js`, `*.esm.js`, `*.es.js` (optionally with an extra extension such as `.min`), or inside an `/esm/`, `/es/` or `/module/` directory | `true` |
| any other file | `false` |

These rules apply to files chosen in steps 1, 2 and 5. A file chosen from the `module`
field (step 3) is ESM unless it ends in `.cjs`; `browser_module` (step 4) is always ESM.

It is a heuristic in both directions: a `.js` file that is ESM but carries none of these
signals is skipped (pass `allowCommonJS: true`, or route the package to an
ESM-transforming CDN), and a file that carries a signal but is really CommonJS is served.
The check runs only for providers with `needsEntry`, only when an entry is looked up (no
path, or a path without an extension), and never for lockfile-pinned entries.

### entryOf()

```ts
entryOf(pkg, subpath? = ""): string
```

`entryInfo(pkg, subpath).file`.

### resolveExports()

```ts
resolveExports(exportsField: unknown, subpath? = ""): string | undefined
```

Maps `"."` or `"./<subpath>"` through an `exports` field: string and array sugar,
condition objects (as above), exact keys, and `*` patterns (the longest matching
prefix wins; `*` in the target is replaced). Returns the file as written in `exports`
(with its `./`), or `undefined`.

## semver

`semver` is a namespace export with a small semver implementation, enough for the ranges
people write in import specifiers.

| Function | Meaning |
|---|---|
| `parse(v)` | `{ major, minor, patch, pre: string[] }` or `null`; a leading `v` and `+build` metadata are accepted |
| `valid(v)` | `parse(v) !== null` |
| `compare(a, b)` | `-1`, `0` or `1`; prereleases sort before their release, numeric identifiers numerically |
| `satisfies(version, range)` | whether `version` is in `range` |
| `maxSatisfying(versions, range)` | the highest satisfying version, or `null` |

Range syntax: exact (`1.2.3`, `=1.2.3`), x-ranges (`1`, `1.2`, `1.x`, `*`, `""`), `^`,
`~`, comparators (`>=`, `<=`, `>`, `<`) including space-separated sets and a space after
the operator, hyphen ranges (`1.2.3 - 2`), and unions (`||`). A prerelease only matches
a comparator that names a prerelease on the same `major.minor.patch` (`^20` does not
match `20.0.0-rc.1`; `>=20.0.0-rc.0` does). An unparseable range throws `TypeError`
(`resolve()` reports it as a `ResolutionError`).
