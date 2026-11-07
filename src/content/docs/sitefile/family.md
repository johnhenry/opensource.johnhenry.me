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

Checked on 2026-11-07 against `@johnhenry/sitefile` 0.0.0, `@johnhenry/fileable` and `@johnhenry/packfile` 0.2.0, by
building with both tools or by a test.

| From | To | How | Status |
| --- | --- | --- | --- |
| fileable, loose output | Sitefile | `COPY ./generated/ /` | Works |
| fileable, `encode="zip"` | Sitefile | `IMPORT gen FROM ./site.zip AS tree`, then `COPY gen:/ /` | Works, same output as loose |
| fileable, `encode="wbn"` | Sitefile | `IMPORT … AS tree` | **Not yet** ([sitefile#141](https://github.com/johnhenry/sitefile/issues/141)) |
| fileable, `encode="wbn"` | packfile | `fromArchive()`, `createRouter()` | Works, with the file-name limits below |
| Sitefile, `EXPORT / AS wbn BASE <url>` | packfile | `fromWebBundle(buffer, { baseURL })`, then `createRouter()` | Works |
| Sitefile `.wbn` | packfile `fromArchive()` | gzip it, export with `BASE https://packfile.invalid/` | Works with that workaround ([sitefile#143](https://github.com/johnhenry/sitefile/issues/143), [packfile#18](https://github.com/johnhenry/packfile/issues/18)) |
| Sitefile `HEADER` / `REDIRECT` | packfile's routers | — | **Not applied** ([sitefile#144](https://github.com/johnhenry/sitefile/issues/144)) |
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
- **`HEADER` and `REDIRECT` rules aren't applied.** They're in the bundle as `/_headers` and `/_redirects` files, which
  packfile serves as ordinary files ([sitefile#144](https://github.com/johnhenry/sitefile/issues/144)).

packfile's own archive format (`toArchive()` / `fromArchive()`) is gzip around the same kind of bundle, under the fixed
base URL `https://packfile.invalid/`. A Sitefile bundle exported with that `BASE` is read by
`fromArchive(bundle, { compressed: false })` as is, or by plain `fromArchive()` once gzipped.

Sitefile's `test/packfile-interop.test.ts` covers the files and bytes, a served page with its MIME type, a 404, and the
gzip relationship; packfile is a development dependency of Sitefile for that test only.

## fileable → packfile

fileable's `encode="wbn"` output is packfile's archive format, so `fromArchive()` and `createRouter()` read it directly.
Limits:

- File names containing `#` make the `wbn` render throw, and names with `?` or `%` are dropped when packfile reads the
  archive ([fileable#20](https://github.com/johnhenry/fileable/issues/20)).
- An empty `<Dir>` isn't kept: a Web Bundle has no directory entries.
- `createRouter()` works out `Content-Type` from its own MIME table rather than the one fileable wrote; they agree on
  the common extensions.

For fileable trees served without writing anything to disk, see [servable's mount](/fileable/tutorial/).
