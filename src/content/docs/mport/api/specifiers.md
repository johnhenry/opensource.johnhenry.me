---
title: "Specifiers"
description: "parseSpecifier(), keyOf() and isRoutable(): every specifier form, what it parses to, and what is not routable."
sidebar:
  order: 101
---

| Specifier | Parsed as |
|---|---|
| `react` | npm package `react`, no range, no path |
| `react@^19` | npm `react`, range `^19` |
| `react@19.2.0/jsx-runtime` | npm `react`, range `19.2.0`, path `jsx-runtime` |
| `@scope/pkg@1.2.3/dist/x.js` | npm `@scope/pkg`, range `1.2.3`, path `dist/x.js` |
| `npm:lodash-es@4` | npm, **explicit** (the prefix is kept in keys) |
| `jsr:@std/path@^1` | JSR `@std/path`, range `^1`. JSR names must be scoped. |
| `github:user/repo@ref/path`, `gh:user/repo@ref/path` | GitHub repository `user/repo`, ref `ref` (both prefixes parse to registry `github`) |
| `lit/` | a **prefix** specifier (trailing slash): compiles to a prefix mapping in the import map |
| `{ name, version?, path?, registry? }` | object form; `registry` defaults to `"npm"`, leading slashes are stripped from `path`, never explicit, never a prefix |
| `./x.js`, `../x.js`, `/x.js`, `https://…`, `data:…`, `blob:…` | not routable: `parseSpecifier` returns `null` and `resolve()` returns `null` |
| `node:fs`, `partial:card`, any other `scheme:` | not a package: `null` |
| `@scope`, `@scope/` | a bare scope (an alias, not a package): `null` |

The version lives on the last name segment (`@scope/pkg@1.2`, `pkg@1.2`); `pkg@` means no
range.

## parseSpecifier()

```ts
parseSpecifier(input: string | SpecifierObject): ParsedSpecifier | null
```

Returns `{ raw, registry, explicit, name, range?, path, prefix }`:

| Field | Type | Meaning |
|---|---|---|
| `raw` | `string \| object` | the input |
| `registry` | `"npm" \| "jsr" \| "github"` | from the prefix, else `"npm"` (object form: `registry` or `"npm"`) |
| `explicit` | `boolean` | the string had an `npm:`, `jsr:`, `github:` or `gh:` prefix |
| `name` | `string` | `react`, `@scope/pkg`, or `user/repo` |
| `range` | `string \| undefined` | version, range, dist-tag or git ref, as written |
| `path` | `string` | sub-path without a leading slash, `""` when none |
| `prefix` | `boolean` | trailing slash |

Throws `TypeError` for: an empty string or a non-string, non-object input; an object
without `name`; `jsr:` with an unscoped name (`jsr:path`); an explicit prefix without a
complete two-part name (`github:user`, `npm:@scope`).

## keyOf()

```ts
keyOf(parsed: ParsedSpecifier): string
```

The import-map key a parsed specifier compiles to: the registry prefix only if the
specifier was explicit (`gh:` is spelled `github:`), the name, the path, and a trailing
`/` for prefixes. The version is dropped: `npm:react@19/jsx-runtime` → `npm:react/jsx-runtime`,
`lodash-es@4/` → `lodash-es/`, `@scope/pkg@1` → `@scope/pkg`.

## isRoutable()

```ts
isRoutable(specifier: string | object): boolean
```

`false` for relative (`./`, `../`), absolute-path (`/`), URL (`scheme://`), `data:` and
`blob:` specifiers; `true` for objects and everything else. It does not reject other
schemes; `parseSpecifier` does that.
