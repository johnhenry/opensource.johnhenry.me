---
title: "Family"
description: "Sitefile, fileable and packfile: which one to use, and the file formats they exchange (directories, zip, Web Bundles), with what is tested and what is not yet supported."
sidebar:
  order: 5
---

Three family packages produce or consume static file trees. They do not depend on each other at runtime; they meet at
file formats.

| You want to… | Use |
| --- | --- |
| Build a site from pinned sources through a reproducible pipeline (stages, templates, plugins, checks, exports) | **sitefile** |
| Generate a tree of files from code, in JSX: scaffolding, codegen, append-only logs | **[fileable](/fileable/)** |
| Serve a built site from memory as a `(Request) => Response` handler, or pack a directory into one file | **[packfile](/packfile/)** |

## fileable → Sitefile

fileable's output is a Sitefile input. A loose directory and an `encode="zip"` archive both work, and give the same
output:

```
COPY ./generated/ /
```

```
IMPORT gen FROM ./generated/site.zip AS tree
COPY gen:/ /
```

**Not yet:** fileable's `encode="wbn"` writes gzip around a Web Bundle, and `IMPORT … AS tree` reads only plain bundles,
so it fails with `E_TYPE` ("gzip content is not a tar archive"). Tracked as sitefile#141; use the directory or zip form
until then.

## Sitefile → packfile

`EXPORT / AS wbn BASE https://site.example/` writes a plain b2 Web Bundle. packfile reads it back into exactly the
exported files and serves it:

```js
import { readFile } from 'node:fs/promises';
import { createRouter } from '@johnhenry/packfile';
import { fromWebBundle } from '@johnhenry/packfile/web-bundle';

const files = fromWebBundle(await readFile('site.wbn'), { baseURL: 'https://site.example/' });
const handler = createRouter(files);   // (Request) => Promise<Response>
```

packfile's own archive format (`toArchive()` / `fromArchive()`) is gzip around the same kind of bundle, under the fixed
base URL `https://packfile.invalid/`. So a Sitefile bundle exported with `BASE https://packfile.invalid/` is read by
`fromArchive(bundle, { compressed: false })` as is, or by plain `fromArchive()` once gzipped.

All three of these are tested in Sitefile's suite (`test/packfile-interop.test.ts`): the same files and bytes as the
directory export, a served page with its MIME type and a 404, and the gzip relationship. packfile is a development
dependency of Sitefile for that test only.
