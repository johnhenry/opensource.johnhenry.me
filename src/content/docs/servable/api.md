---
title: "API"
description: "Every servable primitive — Router, Host, Group, Route, Use, ErrorBoundary, NotFound, Redirect, Response — plus Standard Web API usage, headers/trailers, streaming, adapters, and non-goals."
---

## The primitives

- **`Router`** — root container.
- **`Host name="..."` or `Host pattern="*.example.com"`** — a hostname-axis
  scope, matched against the incoming request's own `Host` header.
  Compiles into the same `URLPattern` `hostname` component every nested
  `Route`'s own compiled pattern carries — a real Layout-stage scope
  (applied *after* every other pipeline stage has finished expanding the
  tree: mounted fileable trees, glob-based file routing, promise-valued
  `path`s, ...), the same stage `Group`'s own prefix-joining, `NotFound`/
  `ErrorBoundary` scoping, and `linkTo()` already live in. `name` and
  `pattern` are mutually exclusive; exactly one is required. Composes with
  `Group` in either nesting order — the hostname and pathname axes are
  independent. Cannot be nested inside another `Host`. A `Route`/`Redirect`
  with no `Host` ancestor matches any hostname.
- **`Group prefix="..." from="glob"|fileableTree`** — a path-prefix scope;
  nesting concatenates prefixes, the same way nested `Dir`s concatenate
  names in fileable. `from` is polymorphic:
  - a glob string synthesizes one `Route` per matched handler module
    (file-based routing) — named exports matching an HTTP method
    (`export function GET(req) {...}`) become one route each; a plain
    `export default` becomes a single `GET` route. Subdirectory structure
    is preserved (`handlers/users/list.js` → `/users/list`, not flattened).
  - a **fileable Descriptor tree** mounts its artifacts as static routes —
    see [Mounting a fileable tree](/servable/mounting-fileable/).
- **`Route path="..." method="GET" handler={fn|"./mod.js"} src={...} download={...}`**
  — a leaf. `path` is a string (compiled to a `URLPattern` internally,
  `:id`-style named params) or a real `URLPattern` instance for advanced
  matching (cross-origin, query-string patterns). At most one of
  `handler`/`src`/children may be set — mixing throws.
  - **`handler`** — a function `(req, ctx) => Response | Promise<Response>`,
    or an import path string whose module's default export is the handler.
  - **`src`** — a binary/static asset: a local file path, an `http(s)://`
    URL, an `ipfs://<cid>/<path>` URI (fetched via a configurable gateway,
    `compile()`'s `ipfsGateway` option, default `"https://ipfs.io/ipfs/"` —
    the same scheme [fileable](/fileable/)'s own `<File src>` recognizes,
    independently implemented here since `Route src` resolves fresh per
    request rather than once at compile time), an already-built `Blob`, or
    a function of the request returning one of those. Gets Range support
    **on by default** (206 Partial Content, `Accept-Ranges`,
    `Content-Range`, via `Blob.prototype.slice()`), conditional requests
    (`ETag`/`If-None-Match` → 304), and correct `HEAD` handling. `download`
    (boolean or a filename string) sets `Content-Disposition: attachment`.
    This is the *one* mechanism behind video/audio/image/pdf/download
    serving — deliberately not five media-specific tags. The same logic is
    available as a standalone `serveFile(req, source, options)` helper for
    handlers that need logic around it (auth-gated files, a computed path).
  - **children** (a static value only, never a function): a string (→
    `text/plain`), JSX markup (→ serialized HTML, `text/html`), a plain
    object (→ `Response.json`), a recognized `BodyInit` (`Blob`,
    `ArrayBuffer`/typed array, `FormData`, `URLSearchParams`,
    `ReadableStream`), or a real `Response` (passed through untouched). A
    bare *array* as children flattens like any multi-child JSX position
    rather than serializing as one JSON array — use
    `handler={() => Response.json(arr)}` for a list.
- **`Use middleware={fn}>{children}</Use>`** — wraps a subtree. Signature
  `(req, ctx, next) => Response | Promise<Response>` — not calling `next()`
  is the short-circuit. Composition is **onion-style** — outermost runs
  first going in, last coming out — and since handlers are Fetch-shaped (no
  mutable `res`), a middleware can still inspect/modify the final
  `Response` after `await next()` resolves.
- **`ErrorBoundary handler={fn}>{children}</ErrorBoundary>`** — wraps a
  subtree; catches any throw from middleware or handlers inside it.
  Nearest enclosing boundary catches; an uncaught (or re-thrown) error
  propagates to the next one out.
- **`NotFound handler={fn}` or `<NotFound>static</NotFound>`** — fallback,
  scoped by its `Group`/`Router`. Nearest-scope-wins: a scope with no
  `NotFound` of its own bubbles out to the next ancestor's — one scoping
  rule for the whole system, shared with `ErrorBoundary`.
- **`Redirect from="..." to="..." status={301}`** — leaf, self-closing.
  Both `from` and `to` are Group-relative, except an absolute `http(s)://`
  `to`, which isn't joined with a local prefix.
- **`Response status={} headers={} trailers={}>{value}</Response>`** — the
  one primitive whose children is the *same* static-value slot `Route`
  already has, just with response-shape metadata attached. Using
  `<Response>` as children *and* setting `headers`/`trailers` directly on
  `Route` throws.

  > **Naming note**: importing `Response` (the tag) shadows the global
  > Fetch API `Response` class in that file. If you need both, alias the
  > import: `import { Response as ResponseTag } from "@johnhenry/servable"`.

### Rejected additions

Recorded so they don't get re-proposed without re-deriving why:
`<Header>`/`<Trailer>` tags (real capability, wrong shape — `headers`/
`trailers` are props, merged through a real `Headers` instance, never naive
object-spread, since HTTP header names are case-insensitive and
`Set-Cookie` is legitimately repeatable); `<Validate>` (just another
`Use`); `<Stream>`/`<Body>` tags (already expressible via `handler`
returning a `Response` with a `ReadableStream` body — `sse()`/
`streamBody()`, below, are the ergonomics that were actually missing);
`<Cookie>` (`setCookie()` is a header-value formatter, not a tag);
automatic route-specificity inference (**first full match in document
order wins**, always); a caching primitive built on the Fetch `Cache` API
(inconsistent support across Node/Deno/Bun/Workers); `<Video>`/`<Audio>`/
`<Image>`/`<Pdf>`/`<Download>` tags (all five are presets of the same
`src`/`download`/Range mechanism).

## Standard Web API usage

The throughline: prefer the platform's own type over inventing a parallel
one, and only add sugar for genuine gaps.

- **`Request`/`Response`/`Headers`** — handlers receive a *real* `Request`
  (`.json()`, `.formData()`, `.clone()`, `.signal`, `.headers.get()` all
  already work, zero wrapper). `headers`/`trailers` accept the standard
  `HeadersInit` union, not a servable-specific shape.
- **`URLPattern`** — not a global in Node 18/20/22, so `urlpattern-polyfill`
  ships as a real dependency; a native global is preferred when present
  (Deno/Bun/Workers/newer Node don't need it).
- **`WebSocket`** — fits the existing "handler returns a `Response`" model:
  every modern runtime models an upgrade as still returning a `Response`
  (status 101, socket attached). `upgradeWebSocket(req)` abstracts that for
  Deno and Cloudflare Workers, and for Node via
  [leserve](/leserve/)'s `upgradeRawSocket()`, lazily imported — Node has
  no built-in server-side WebSocket upgrade/framing at all, only a client
  `WebSocket` global since v22, so this delegates to leserve rather than
  reimplementing the handshake.

## Headers and trailers

`headers` (on `Route`, `Group`, `Response`) merges through a real `Headers`
instance: later layers override earlier ones for the same name
(case-insensitively), except `Set-Cookie`, which accumulates. A `Group`'s
`headers` are inherited by every `Route` inside it; a `Route`'s own
override on top.

**Trailers aren't part of the Fetch `Response` model at all** — they're an
HTTP/1.1 chunked-transfer-specific concept the Fetch spec doesn't
represent. `trailers` (a function receiving the streamed body, resolving to
a `HeadersInit`) is validated at dispatch time (throws if set on a
non-streaming response) and transmitted by whichever **adapter** actually
supports it — today, only the Node adapter, via `res.addTrailers()`.

## Streaming

Already fully expressible without any special primitive: a `handler`
returning `new Response(readableStream, { headers })` just works. `sse()`
and `streamBody()` are ergonomics around building that value:

```tsx
import { sse, streamBody } from "@johnhenry/servable";

async function* events() { yield "first"; yield { data: "second", event: "update" }; }
<Route path="/events" method="GET" handler={() => sse(events())} />

async function* chunks() { yield "chunk-a"; yield "chunk-b"; }
<Route path="/download" method="GET" handler={() => streamBody(chunks())} />
```

## Adapters

`compiled.fetch` is a plain `(Request) => Promise<Response>` — Deno, Bun,
and Cloudflare Workers already speak this signature natively at the server
boundary, so those adapters are thin pass-throughs:

```ts
import { serve } from "@johnhenry/servable/adapters/deno"; // Deno.serve(...)
import { serve } from "@johnhenry/servable/adapters/bun";  // Bun.serve({ fetch })
import { toWorker } from "@johnhenry/servable/adapters/cloudflare"; // export default { fetch }
```

**Node** needs a real bridge — `node:http` speaks `IncomingMessage`/
`ServerResponse`, not `Request`/`Response`. Rather than maintaining a
second, independently-drifting implementation of that conversion,
`adapters/node`'s `serve()` delegates to [leserve](/leserve/)'s own
`serve()`, which already solves it (multi-value headers like repeated
`Set-Cookie`, stream error forwarding, the malformed-request-target edge
case). leserve is an **optional peer dependency**, only needed if you use
this adapter.

```ts
import { serve } from "@johnhenry/servable/adapters/node";
const handle = serve(compiled, { port: 3000, onListen: (info) => console.log(info.path) });
// later: await handle[Symbol.asyncDispose]();
```

## Non-goals

- Not a full HTTP server implementation — ships a compiler + adapters, not
  a framework with its own server internals beyond the Node bridge.
- No ORM/templating/sessions. `setCookie()` formats a header value; it is
  not a session store.
- No hot-reload/watch mode.
- No plugin/middleware-registry system beyond what JSX composition already
  expresses.
- No built-in proxy or per-route timeout.

## Examples

See [`examples/`](https://github.com/johnhenry/servable/tree/main/examples)
in the repo: `01-hello-world`, `02-crud-api`, `03-middleware-auth`,
`04-file-based-routing`, `05-streaming`, `06-media-serving`,
`07-mount-fileable`, `08-mount-packfile`.
