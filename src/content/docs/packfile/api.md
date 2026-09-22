---
title: "API"
description: "fromDirectory, toArchive, fromArchive, createRouter, hashing, HTTP caching middleware, browser usage, and the full exports table."
---

```js
import {
  fromDirectory, fromDirectoryLazy, fromArchive, toArchive,
  createRouter, hashBuffer, hashStream,
  compileDirectory, decompileDirectory
} from '@johnhenry/packfile';
```

## `fromDirectory(path, options?)`

Reads all files from a directory into a `Map<string, { data, size, hash }>`.

```js
const files = await fromDirectory('./static');
```

Symlinks are resolved and checked: a symlink pointing outside the archived
directory's root is rejected (no accidental packaging of e.g.
`/etc/passwd`), and a self-referential symlink cycle is detected rather than
recursed into unboundedly.

## `fromDirectoryLazy(path, options?)`

Returns a `LazyFileMap` that reads files on demand (useful for development).

```js
const files = await fromDirectoryLazy('./static');
const entry = await files.get('index.html'); // reads from disk
```

## `toArchive(map, options?)`

Serializes a file `Map` to a compressed archive buffer —
`gzip(application/webbundle)`, via the real `wbn` package.

```js
const buffer = await toArchive(files);
```

## `fromArchive(buffer, options?)`

Deserializes an archive back to a file `Map`. Validates paths — entries with
path traversal (`../`) or absolute paths are rejected, including keys that
normalize to the archive root itself (empty string, `"."`, `"a/.."`).

```js
const files = await fromArchive(buffer);
```

## `createRouter(files, options?)`

Returns a `(Request) => Promise<Response>` handler that serves files.
Auto-sets `Content-Type`, `Cache-Control`, and `ETag` headers. Works with
both `Map` and `LazyFileMap`.

**Options:**

- `alias` — object mapping paths (e.g. `{ "/": "index.html" }`)
- `tryExtensions` — array of extensions to try (e.g. `[".html"]`)
- `fallback` — fallback handler for unmatched routes

```js
const handler = createRouter(files, {
  alias: { "/": "index.html" },
  tryExtensions: [".html"],
});

const response = await handler(new Request("http://localhost/"));
```

Content-Type lookup uses `Object.hasOwn()` rather than plain-object property
access, so a file named e.g. `report.constructor` or `image.__proto__`
resolves to `undefined` rather than an inherited `Object.prototype`
property.

## `hashBuffer(buffer)` / `hashStream(stream)`

SHA-256 hashing utilities, used for both content identity and ETags. Returns
a hex digest string.

```js
const hash = hashBuffer(myBuffer);        // sync
const hash2 = await hashStream(myStream); // async
```

## `compileDirectory(path, options?)` / `decompileDirectory(data, outputPath)`

Convenience wrappers: `fromDirectory → toArchive` and
`fromArchive → writeFile`.

```js
const compiled = await compileDirectory('./static');
await decompileDirectory(compiled, './output');
```

## HTTP caching middleware

```js
import { withCache } from '@johnhenry/packfile/cache';
```

Wraps any `(Request) => Response` handler with automatic ETag generation
and `304 Not Modified` negotiation:

```js
const cachedHandler = withCache(myHandler, {
  cacheControl: 'public, max-age=3600', // default
  weak: false,                           // use strong ETags (default)
});
```

Uses SHA-256 hashing — the same as file ETags — for consistent cache keys.

## Browser usage

```js
import { fromArchive, toArchive, createRouter } from '@johnhenry/packfile/browser';
```

The browser bundle provides `fromArchive`, `toArchive`, and `createRouter`,
using the `wbn` package directly (no Node APIs required) and Web Crypto for
hashing — same wire format as the Node entrypoint, so an archive built by
one is directly readable by the other (verified both directions in the test
suite, not just assumed).

```js
const archive = await fetch('/app.wbn').then(r => r.arrayBuffer());
const files = await fromArchive(archive);
const router = createRouter(files);
```

## Direct imports

```js
import { hashBuffer, hashStream } from '@johnhenry/packfile/hash';
import { compressObject, deCompressObject } from '@johnhenry/packfile/compression';
```

## Exports

| Export | File | Description |
|--------|------|-------------|
| `.` | `index.mjs` | Full API: `fromDirectory`, `fromArchive`, `toArchive`, `createRouter`, `hashBuffer`, etc. |
| `./browser` | `browser.mjs` | Browser-compatible: `fromArchive`, `toArchive`, `createRouter` |
| `./cache` | `cache.mjs` | `withCache` — HTTP caching middleware |
| `./hash` | `lib/hash.mjs` | `hashBuffer`, `hashStream` |
| `./compression` | `lib/compression.mjs` | `compressObject`, `deCompressObject` |
| `./compat` | `compat.mjs` | `compileDirectory`, `decompileDirectory` |
| `./blob-preview` | `lib/blob-preview.mjs` | `createBlobPreview` — see [Blob preview](/packfile/blob-preview/) |
| `./web-bundle` | `lib/web-bundle.mjs` | Lower-level Web Bundle primitives — see [Web Bundle / IWA primitives](/packfile/web-bundle/) |
