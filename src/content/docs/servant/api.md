---
title: "API"
description: "addEventListener/removeEventListener and the real EventTarget events they carry, start()/stop(), use()/route(), emit(), createServerSentEvent(), and WebSockets."
---

## `addEventListener` / `removeEventListener`

Imported as a side effect from `@johnhenry/servant/event` — importing that
module attaches `addEventListener`/`removeEventListener` onto
`globalThis`. These are the **real, standard `EventTarget` methods** (see
the [WinterTC Minimum Common Web
API](https://min-common-api.proposal.wintertc.org/), which requires
`EventTarget`/`Event`/`CustomEvent`/`ErrorEvent` as globals every
conformant server-side runtime exposes) — not wrappers around an internal
`EventEmitter`. Every listener receives a real `Event` (or a real,
standard subclass), not a plain object:

| Event | Handler receives |
|-------|-------------------|
| `fetch` | A `FetchEvent` — `.request` (the `Request`), `.respondWith(response)` |
| `start` | An `Event` with `.index`, `.port` |
| `stop` | An `Event` with `.index` |
| `error` | A real `ErrorEvent` — `.message`, `.error` (the original thrown value) |
| `websocket` | An `Event` with `.socket` (the `ws` library socket) and `.request` (the handshake converted to a real `Request`) |

`emit(name, detail)` dispatches a real `CustomEvent`; listeners read the
payload via `event.detail`.

## `start(options)`

Starts an HTTP (or, with `options.https`, HTTPS) server and returns a
Promise that resolves to that server's index (used by `stop()`).

```typescript
type ServerOptions = {
  port: number;
  https?: {
    key: string;
    cert: string;
  };
};
```

## `stop(index)`

Stops the server started with the given index.

## `use(middleware)`

Registers a middleware, run in registration order before routing/dispatch.
Both `use` and `route` (below) take the same `(request, ctx)` shape — `ctx`
is `{ params, state, remoteAddress, raw }` (`state` is a fresh `Map` per
request, for passing data between middlewares/handlers; `params` is `{}`
until a route actually matches):

```javascript
use(async (req, ctx) => {
  console.log(`[Middleware] ${req.method} ${req.url} from ${ctx.remoteAddress}`);
  return req;
});
```

## `route(method, path, handler)`

Registers a route. `path` is compiled with
[`URLPattern`](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern)
(the native global on this package's Node 26+ floor) — segments prefixed
with `:` are captured into `ctx.params`:

```javascript
route("GET", "/hello/:name", async (req, ctx) => {
  return new Response(`Hello, ${ctx.params.name}!`, { status: 200 });
});
```

## `emit(name, detail)`

Dispatches a real `CustomEvent(name, { detail })` on the same
`EventTarget` `addEventListener` listens on.

## `createServerSentEvent(data, event?, id?)`

Formats a single `text/event-stream` frame:

```javascript
addEventListener("fetch", (event) => {
  if (!event.request.url.endsWith("/sse")) return;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(createServerSentEvent({ hello: "world" }, "update"));
    },
  });
  event.respondWith(
    new Response(stream, { headers: { "Content-Type": "text/event-stream" } })
  );
});
```

## WebSockets

```javascript
addEventListener("websocket", (event) => {
  event.socket.on("message", (message) => {
    event.socket.send(`Echo: ${message}`);
  });
});
```

`event.request` (the handshake converted via the same `toWebRequest()`
every other event already uses) is what a `"websocket"` listener reads to
check the connecting page's `Origin` before accepting — see [Security
model](/servant/security/) for why servant doesn't do this for you.
