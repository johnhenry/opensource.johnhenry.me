---
title: "packfile"
description: "Static file compiler and server. Compresses a directory into a gzip(application/webbundle) archive — the format Chrome's Isolated Web Apps are built on — and serves it back as HTTP responses."
---

**`@johnhenry/packfile`** compresses a directory tree into a single archive
— `gzip(application/webbundle)`, via the real
[`wbn`](https://github.com/WICG/webpackage/tree/main/js/bundle) package —
and serves that archive as HTTP responses through the
`(Request) => Response` handler pattern shared across this family.

> Previously developed as `lemem`, never published under that name. Now
> `@johnhenry/packfile`, starting at `0.0.0`.

## Install

```sh
npm install @johnhenry/packfile
```

## Quick example

```js
import { fromDirectory, toArchive, createRouter } from '@johnhenry/packfile';

const files = await fromDirectory('./static');
const archive = await toArchive(files);

// later, from the archive alone:
import { fromArchive } from '@johnhenry/packfile';
const restored = await fromArchive(archive);
const handler = createRouter(restored, { alias: { "/": "index.html" } });

const response = await handler(new Request("http://localhost/"));
```

Or from the CLI:

```sh
npx packfile compress ./static ./compiled.wbn
npx packfile serve ./compiled.wbn 8080
```

## Family

packfile isn't a standalone compiler/server so much as the designed
consumer of one sibling package's archive output, and a drop-in handler for
another's router:

- **[fileable](/fileable/)** — fileable's `<Dir encode="wbn">` renders a
  JSX subtree straight to a `gzip(application/webbundle)` archive, via the
  same `wbn` package packfile itself depends on — not via a dependency on
  packfile. The resulting `.wbn` is directly readable by this package's own
  `fromArchive()` and servable via `createRouter()`, no unpacking to disk
  needed.
- **[`@johnhenry/servable`](https://github.com/johnhenry/servable)** —
  `createRouter()` returns a `(Request | path, ctx?) => Response` handler
  (aliased as `.fetch`), the exact shape servable's `Route`'s `handler` prop
  accepts. Mounting a packfile-served directory inside a servable app is
  just passing a function.
- **[andbox](/andbox/)** — packfile's [Blob Preview](/packfile/blob-preview/)
  mode is a real, direct npm dependency on `@johnhenry/andbox`: it delegates
  JS module-specifier resolution to andbox's `createVirtualModuleRegistry()`
  rather than reimplementing it. This is the same technical link that puts
  packfile on andbox's accent hue on this site (see this site's `README.md`
  hue registry if you're curious why).

## The pages here

- [API](/packfile/api/) — `fromDirectory`, `toArchive`, `fromArchive`,
  `createRouter`, hashing, caching middleware, browser usage
- [CLI](/packfile/cli/) — `compress`, `decompress`, `serve`
- [Blob preview](/packfile/blob-preview/) — host packaged content in a
  browser tab/iframe with no server at all
- [Web Bundle / IWA primitives](/packfile/web-bundle/) — the lower-level
  `toWebBundle`/`fromWebBundle`/`createWebBundleRouter` API, for real
  Isolated Web App deployment

Internal data formats — the `FileEntry`/`FilesMap` table, the archive byte
format, hashing, and how the two gzip implementations (Node/browser) relate
— are documented precisely in
[`FORMATS.md`](https://github.com/johnhenry/packfile/blob/main/FORMATS.md)
in the repo.

## License

MIT

## Source

[github.com/johnhenry/packfile](https://github.com/johnhenry/packfile)
