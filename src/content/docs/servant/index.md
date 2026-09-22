---
title: "servant"
description: "A self-contained, batteries-included HTTP/HTTPS server with built-in routing, middleware, and WebSocket support, dispatched through a service-worker-style addEventListener('fetch', ...) API."
---

**`@johnhenry/servant`** is a self-contained, batteries-included HTTP/HTTPS
server for Node.js with built-in routing, middleware, and WebSocket
support, dispatched through a service-worker-style
`addEventListener("fetch", ...)` API (see
[WinterJS](https://github.com/wasmerio/winterjs)).

servant owns its own raw `http`/`https` server loop, its own
`WebSocketServer` wiring, and its own middleware/route arrays — it doesn't
interoperate with any other server in this family (don't `start()` a
servant server alongside another and expect them to share middleware or
state). The one exception is `toWebRequest` (the Node `IncomingMessage` →
Web `Request` conversion), a real, load-bearing dependency on
`@johnhenry/leserve/node-request` — everything else here is self-contained.

If you want a plain `(Request) => Response` handler with no routing/
middleware/event framework attached, see [leserve](/leserve/) instead —
servant and leserve are two independent implementations built on
different designs, extracted from a common origin (servant grew out of
leserve's own `controls.mjs`/`event.mjs`) but not meant to interoperate.
Where leserve stays a single function, servant is the batteries-included
alternative: routing, middleware, SSE, and WebSockets, all wired up for
you. See servant's [CHANGELOG](https://github.com/johnhenry/servant/blob/main/CHANGELOG.md)
for how this package came to exist.

## Install

```bash
npm install @johnhenry/servant
```

## Quick example

```javascript
import "@johnhenry/servant/event";
import { start } from "@johnhenry/servant";

start({ port: 3000 });

addEventListener("fetch", (event) => {
  event.respondWith(new Response("Hello, World!", { status: 200 }));
});
```

See `demo/` in the repo for a working example — run it with `npm run
demo:events`.

## Exports

| Export | Description |
|--------|-------------|
| `@johnhenry/servant` or `@johnhenry/servant/controls` | `start`, `stop`, `use`, `route`, `emit`, `createServerSentEvent`, `addEventListener`, `removeEventListener` |
| `@johnhenry/servant/event` | Side-effecting module; attaches `addEventListener`/`removeEventListener` to `globalThis` |

## The pages here

- [API](/servant/api/) — events, `start`/`stop`, `use`/`route`, `emit`,
  server-sent events, WebSockets
- [Security model](/servant/security/) — what servant does and doesn't
  protect you from, stated plainly

## License

This project is licensed under the MIT License.

## Source

[github.com/johnhenry/servant](https://github.com/johnhenry/servant)
