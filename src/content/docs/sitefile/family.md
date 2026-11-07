---
title: "Family"
description: "Sitefile, fileable and packfile: which one to use, and every hand-off between them (directories, zips, Web Bundles), with what works today, the workarounds and the open issues."
sidebar:
  order: 5
---

Three family packages produce or consume static file trees. None depends on another at runtime; they meet at file
formats.

| You want to… | Use |
| --- | --- |
| Build a site from pinned sources through a reproducible pipeline (stages, templates, plugins, checks, exports) | **sitefile** |
| Generate a tree of files from code, in JSX: scaffolding, codegen, append-only logs | **[fileable](/fileable/)** |
| Serve a built site from memory as a `(Request) => Response` handler, or pack a directory into one file | **[packfile](/packfile/)** |

## What works today

Checked on 2026-11-07 against the npm releases `@johnhenry/sitefile` 0.0.0, `@johnhenry/fileable` 0.1.1 and
`@johnhenry/packfile` 0.2.0, and against each repository's `main`, by building with both tools or by a test. "Fixed on
main, in the next release" means the change is merged but not published yet: the npm versions above still behave as
the rest of the row says.

| From | To | How | Status |
| --- | --- | --- | --- |
| fileable, loose output | Sitefile | `COPY ./generated/ /` | Works |
| fileable, `encode="zip"` | Sitefile | `IMPORT gen FROM ./site.zip AS tree`, then `COPY gen:/ /` | Works, same output as loose |
| fileable, `encode="wbn"` | Sitefile | `IMPORT … AS tree` | **Not yet** ([sitefile#141](https://github.com/johnhenry/sitefile/issues/141)) |
| fileable tree, rendered during a build | Sitefile | a JavaScript `TRANSFORM` plugin calling fileable's in-memory `toFiles()` | An example in Sitefile's repository (`examples/fileable/`, on main; not part of the npm package). fileable is vendored into the plugin folder, and `cmd`, local `src=` and `env://` are refused in the sandbox |
| fileable, `encode="wbn"` | packfile | `fromArchive()`, `createRouter()` | Works, with the file-name limits below; tested in fileable |
| Sitefile, `EXPORT / AS wbn BASE <url>` | packfile | `fromWebBundle(buffer, { baseURL })`, then `createRouter()` | Works; tested in both repositories (packfile reads a bundle written by the published 0.0.0) |
| Sitefile `.wbn` | packfile `fromArchive()` | with 0.0.0 / 0.2.0: gzip it, and export with `BASE https://packfile.invalid/` | Works with that workaround. **Fixed on main, in the next release:** `EXPORT … AS wbn COMPRESSION gzip` (or `-o site.wbn.gz`) writes the gzip ([sitefile#143](https://github.com/johnhenry/sitefile/issues/143)), and `fromArchive()` takes its base from a `baseURL` option or the bundle's primary URL, so any `BASE` reads back ([packfile#18](https://github.com/johnhenry/packfile/issues/18)) |
| Sitefile `HEADER` / `REDIRECT` | packfile `createWebBundleRouter()` | — | **Not applied** in 0.0.0: only the `/_headers` and `/_redirects` files are in the bundle. **Fixed on main, in the next release:** each response carries its HEADER values, and exact-path 301/302/303/307/308 REDIRECTs are 3xx responses with `location` ([sitefile#144](https://github.com/johnhenry/sitefile/issues/144)). Splats, `200` rewrites and `404` rules stay in `/_redirects` only |
| packfile `toArchive()` | Sitefile | `IMPORT … AS tree` | **Not yet** ([sitefile#141](https://github.com/johnhenry/sitefile/issues/141)) |

## fileable → Sitefile

```
COPY ./generated/ /
```

```
IMPORT gen FROM ./generated/site.zip AS tree
COPY gen:/ /
```

fileable's `encode="wbn"` writes gzip around a Web Bundle, and `IMPORT … AS tree` reads only plain bundles, so it fails
with `E_TYPE` ("gzip content is not a tar archive"). Use the directory or zip form until sitefile#141 lands.

To render a fileable tree inside a build instead, without a directory or zip in between, see the plugin example in
Sitefile's repository, `examples/fileable/` (on main; it is an example, not part of the npm package). fileable's `cmd`
attribute, local `src=` paths and `env://` fail there with `E_PLUGIN`, since a plugin cannot start processes, read
outside its folder or see the environment.

## Sitefile → packfile

`EXPORT / AS wbn BASE https://site.example/` writes a plain b2 Web Bundle. packfile reads it back into exactly the
exported files and serves it:

```js
import { readFile } from 'node:fs/promises';
import { createRouter } from '@johnhenry/packfile';
import { fromWebBundle } from '@johnhenry/packfile/web-bundle';

const files = fromWebBundle(await readFile('site.wbn'), { baseURL: 'https://site.example/' });
const handler = createRouter(files);   // (Request | path) => Promise<Response>
```

- **The `baseURL` must be the `BASE` you exported with.** Entries under any other origin are skipped, so the wrong base
  reads back as an empty map, without an error.
- **Pass a path string for non-ASCII paths.** `handler(new Request('https://site.example/docs/ünï/page.html'))` returns
  404 because the pathname isn't percent-decoded; `handler('/docs/ünï/page.html')` works
  ([packfile#20](https://github.com/johnhenry/packfile/issues/20)).
- **The bundle's entry at the bare base URL is skipped.** Sitefile stores the index page there as well as at
  `/index.html`; read it as `index.html`.
- **`HEADER` and `REDIRECT` rules aren't applied by 0.0.0.** They're in the bundle as `/_headers` and `/_redirects`
  files, which packfile serves as ordinary files. Fixed on main, in the next release
  ([sitefile#144](https://github.com/johnhenry/sitefile/issues/144)): the bundle's responses carry the HEADER values
  and exact-path REDIRECTs, which `createWebBundleRouter(new wbn.Bundle(bytes), { baseURL })` serves. `createRouter()`
  serves a files map, so it still answers with the files only. Splat rules, `200` rewrites and `404` rules are only in
  `/_redirects`, for a host that reads it.

packfile's own archive format (`toArchive()` / `fromArchive()`) is gzip around the same kind of bundle, under the fixed
base URL `https://packfile.invalid/`. With the published versions, a Sitefile bundle exported with that `BASE` is read
by `fromArchive(bundle, { compressed: false })` as is, or by plain `fromArchive()` once gzipped; a bundle with any
other `BASE` reads back as an empty map. Fixed on main, in the next release: Sitefile writes the gzip itself
(`EXPORT / AS wbn BASE <url> COMPRESSION gzip`, or `-o site.wbn.gz`), and `fromArchive()` accepts `{ baseURL }` or,
without it, uses the origin of the bundle's primary URL. Sitefile writes a primary URL only when the site has
`/index.html`, and the derived base is the origin (`https://site.example/`), so a `BASE` with a path such as
`https://site.example/blog/` gives keys like `blog/index.html` unless you pass that `baseURL`.

Sitefile's `test/packfile-interop.test.ts` covers the files and bytes, a served page with its MIME type, a 404, and the
gzip relationship (on main, also the gzip export and the baked-in headers and redirects); packfile is a development
dependency of Sitefile for that test only. packfile's `test/sitefile-fixture.test.mjs` reads a bundle written by the
published Sitefile 0.0.0.

## fileable → packfile

fileable's `encode="wbn"` output is packfile's archive format, so `fromArchive()` and `createRouter()` read it directly.
Limits:

- File names containing `#` make the `wbn` render throw, and names with `?` or `%` are dropped when packfile reads the
  archive ([fileable#20](https://github.com/johnhenry/fileable/issues/20)).
- An empty `<Dir>` isn't kept: a Web Bundle has no directory entries.
- `createRouter()` works out `Content-Type` from its own MIME table rather than the one fileable wrote; they agree on
  the common extensions.

For fileable trees served without writing anything to disk, see [servable's mount](/fileable/tutorial/).
