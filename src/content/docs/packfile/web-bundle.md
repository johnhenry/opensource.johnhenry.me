---
title: "Web Bundle / IWA primitives"
description: "Lower-level Web Bundle control: a real baseURL, custom per-file headers, Isolated Web App signing, and a router that serves a bundle's own headers verbatim."
---

`toArchive()`/`fromArchive()` at the main `.` entrypoint (and
`createRouter()`) already use `application/webbundle` under the hood — see
[API](/packfile/api/). This subpath, `./web-bundle`, is for callers who want
the lower-level control those two deliberately hide: a real, resolvable
`baseURL` (rather than the fixed internal one `toArchive`/`fromArchive`
use), custom per-file `headers()`, signing via `wbn-sign` for actual
Isolated Web App deployment, and a router that serves a bundle's own real
headers verbatim.

```js
import { toWebBundle, fromWebBundle } from '@johnhenry/packfile/web-bundle';
import { fromDirectory } from '@johnhenry/packfile';

const files = await fromDirectory('./static');
const bundle = toWebBundle(files, { baseURL: 'https://example.com/' });
// bundle is a Uint8Array, directly loadable/parseable by wbn's own Bundle
// class, or <script type=webbundle> in a supporting browser.

const recovered = fromWebBundle(bundle, { baseURL: 'https://example.com/' });
// back to a FilesMap, e.g. to hand to a different consumer.
```

## Serving a bundle

`createRouter(fromWebBundle(bundle, { baseURL }))` already works today, no
new code needed — `fromWebBundle()`'s return value is a real `FilesMap`. But
that path only keeps `data`/`size`/`hash`, so `createRouter()` resynthesizes
Content-Type/Cache-Control/ETag from scratch rather than serving whatever
headers were actually baked into the bundle.

`createWebBundleRouter(bundle, options)` serves a parsed `wbn.Bundle`
directly instead — same `(input, ctx?) => Promise<Response>` router
contract (`alias`, `tryExtensions`, `fallback`, a real `Request` or a bare
path string, `.fetch`), but every response's actual status/headers are
served verbatim:

```js
import * as wbn from 'wbn';
import { toWebBundle, createWebBundleRouter } from '@johnhenry/packfile/web-bundle';

const bytes = toWebBundle(files, {
  baseURL: 'https://example.com/',
  headers: () => ({ 'Cache-Control': 'max-age=600, immutable' }),
});
const bundle = new wbn.Bundle(bytes); // parse once, reuse across requests —
                                       // wbn decodes the WHOLE bundle eagerly
                                       // in the constructor, there's no lazy/
                                       // streaming read path like
                                       // fromDirectoryLazy()'s LazyFileMap.
const router = createWebBundleRouter(bundle, { baseURL: 'https://example.com/' });
const response = await router('index.html'); // Cache-Control is the real, baked-in header
```

## Why this exists

packfile was originally built with `wbn` in mind, then moved to a bespoke
gzip+CBOR format when `wbn`/Web Bundles looked effectively abandoned. IWA
gave the format new, active life, and the archive format was migrated
wholesale onto it — `lib/to-archive.mjs`/`lib/from-archive.mjs` are now thin
wrappers around `toWebBundle()`/`fromWebBundle()`, with a fixed internal
`baseURL`.

## What this subpath adds beyond `toArchive`/`fromArchive`

A Web Bundle models full HTTP *exchanges* (absolute URL + status + headers
+ body), not just a flat path → bytes map — `FileEntry` carries none of
that, so `toWebBundle()` synthesizes it (`Content-Type` inferred by
extension, same as `createRouter()`'s own responses; status always `200`)
unless a real `baseURL`/`headers()` is supplied, which `toArchive()`
doesn't expose at all. `fromWebBundle()` recomputes `hash` via
`hashBuffer()` on the way back, since Web Bundles don't carry a content
hash of their own.

Verified against real interop, not just internal round-tripping: the test
suite cross-checks `toWebBundle()`'s output against `wbn`'s own `Bundle`
parser directly, and signs a real bundle with `wbn-sign`'s
`SignedWebBundle` using a real generated Ed25519 key pair — the actual
packages Chrome/IWA tooling itself uses.

## Still open

For actual IWA deployment (not for the archive-format use this subpath
already covers): how to choose/compute a `baseURL` when targeting
`isolated-app://<web-bundle-id>/` specifically — that origin is derived
from the signing key itself via `wbn-sign`'s `WebBundleId`, not chosen
freely, so a real IWA build needs to sign first and set `baseURL` from the
result, a different order than the examples above.
