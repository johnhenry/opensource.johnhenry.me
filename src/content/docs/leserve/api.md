---
title: "API"
description: "serve(), onWebSocket(), options, global types, and the full exports table."
---

## `serve(handlerOrOptions, maybeHandler)`

Either argument order works:

- `serve(handler, options?)` — handler first, the usual case.
- `serve(options, handler)` — options first,
  [`Deno.serve`](https://docs.deno.com/api/deno/~/Deno.serve)-style (used
  internally by the `leserve` CLI).

### Options

- `port` — port number (default: `8000`)
- `hostname` — hostname (default: `'localhost'`)
- `cert` / `key` — SSL certificate/key for HTTPS (optional)
- `signal` — an `AbortSignal`; aborting it calls `server.close()`
- `onListen({ path, port })` — called once the server is listening. `port`
  reflects the port the OS actually bound, which matters when you pass
  `port: 0`.

### Handler function

The handler receives a `Request` and an optional `context` object —
`{ remoteAddress, raw, state }`, where `state` is a fresh `Map` per request
— and returns a `Response`, or a `Promise` that resolves to one.

`onListen` is currently the only lifecycle hook `serve()` exposes — there's
no `onRequest`/`onResponse`. To intercept every request/response, wrap your
handler with [`compose()`](/leserve/middleware/#composefns) or write
middleware directly in the `(innerHandler) => (request, ctx) => Response`
shape used throughout this package.

## `onWebSocket(wsHandler)`

A composable WebSocket-upgrade middleware for the `serve()` model — kept
explicit and opt-in rather than automatic. (SSE, routing, and middleware
built on top of `serve()` now live in
[`@johnhenry/servant`](https://github.com/johnhenry/servant), not here.)

```javascript
import serve, { onWebSocket } from "@johnhenry/leserve/serve";

const withWebSocket = onWebSocket((ws, request, context) => {
  ws.on("message", (message) => {
    ws.send(`echo: ${message}`);
  });
});

const handler = withWebSocket((request) => new Response("Hello, World!"));

serve(handler, { port: 3000 });
```

`wsHandler(ws, request, context)` is called once per established connection
with the [`ws`](https://www.npmjs.com/package/ws) `WebSocket` instance, the
original upgrade `Request`, and the handler `context`. Because it follows
the same `(innerHandler) => handler` shape as other `serve()` middleware, it
composes with `compose()` and [`@johnhenry/leserve/auth`](/leserve/middleware/#authentication-middleware)
just like anything else.

The lower-level primitive `onWebSocket()` is sugar over —
`upgradeRawSocket(raw)` and the `WEBSOCKET_UPGRADE_RESPONSE` sentinel — is
published separately as `leserve/websocket`, for a caller that wants to
decide *inline*, inside a single request handler, whether to upgrade,
rather than via `onWebSocket()`'s outer-middleware shape.

## Global types

`Request`, `Response`, `Headers`, `URL`, `URLSearchParams`, and (in modern
Node.js) `WebSocket` are standard Node.js runtime globals (Node 18+) —
available out of the box, not something `@johnhenry/leserve` adds or
polyfills.

## Exports

| Export | Description |
|--------|-------------|
| `@johnhenry/leserve` or `@johnhenry/leserve/serve` | `serve(handler, options?)`, `onWebSocket(wsHandler)` — the recommended default |
| `@johnhenry/leserve/genport` | Random port generation |
| `@johnhenry/leserve/body` | `json`, `text`, `form`, `buffer`, `respond`, `error`, `redirect` — see [Middleware & helpers](/leserve/middleware/) |
| `@johnhenry/leserve/auth` | `basicAuth`, `bearerAuth`, `apiKeyAuth` — see [Middleware & helpers](/leserve/middleware/) |
| `@johnhenry/leserve/compose` | `compose(...fns)` — middleware composition |
| `@johnhenry/leserve/test-harness` | `testHandler` — test `serve()`-style handlers without a server |
| `@johnhenry/leserve/websocket` | `upgradeRawSocket(raw)`, `WEBSOCKET_UPGRADE_RESPONSE` — the low-level primitive `onWebSocket()` is sugar over |
| `@johnhenry/leserve/node-request` | `toWebRequest(req, options?)` — converts a raw Node `IncomingMessage` into a Web `Request`, the same conversion `serve()` itself uses (and what `@johnhenry/servable`'s Node adapter reuses instead of reimplementing) |
| `@johnhenry/leserve/trailers` | `setTrailers(response, trailers)`, `getTrailers(response)` — HTTP trailers, which aren't part of the Fetch `Response` model; `serve()` sends them via `res.addTrailers()` after the body finishes |
