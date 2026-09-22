---
title: "API"
description: "Server and Agent — constructors, options, methods, properties — plus upgradeWebSocket() and a note on the shared-secret authentication model."
---

## `Server`

The `Server` class handles incoming HTTP requests and manages WebSocket
connections to agents.

### Constructor

```javascript
new Server(defaultHandler, options)
```

- `defaultHandler` — a function that returns a `Response` when no agent is
  available to handle the request.
- `options`:
  - `strategy` (optional) — agent selection strategy. Default `"first"`.
    One of `"first"`, `"last"`, `"random"`, `"round-robin"`, `"last-used"`
    (the agent that most recently completed a request/response cycle), or
    `"most-recent"` (the agent that most recently connected).
  - `secret` — a string used for authentication between the server and
    agents. **Required** unless `allowUnauthenticatedAgents` is set — the
    constructor throws otherwise, since without a secret the server has
    nothing to validate an agent handshake against and would accept any
    agent unverified.
  - `allowUnauthenticatedAgents` (optional) — set to `true` to explicitly
    opt out of the `secret` requirement and accept any agent handshake
    with no verification. Default `false`.
  - `log` (optional) — an integer log level (0–4). Default `0`.

### Methods

- `addConnection(connection)` — registers a WebSocket-like connection
  (anything implementing `send`/`addEventListener`/`close`) as a candidate
  agent connection and starts consuming its messages. Returns a `Promise`
  resolving to the connection.
- `removeConnection(connection)` — unregisters a connection. Any request
  still in flight against it is rejected instead of hanging forever.
- `removeConnectionById(id)` / `removeConnectionByIndex(index)`
- `getConnectionById(id)` / `getConnectionByIndex(index)` — return
  `undefined` if not found.
- `fetch(request)` — handles an incoming HTTP request, returns a `Promise`
  resolving to a `Response`.
- `setStrategy(newStrategy)` — throws on an unrecognized value.

### Properties

- `strategy` — gets or sets the current agent selection strategy (setting
  validates the same way as `setStrategy`).
- `fetch` — a bound version of the `fetch` method, usable directly with
  HTTP server libraries.

### A note on authentication

The `secret` option is a single shared secret compared (in constant time)
against whatever every agent sends in its handshake — there's no
per-agent identity, rotation, or session/token model. That's an
intentional simplification for now, not an oversight; if you need
per-agent credentials or anything more sophisticated, put this behind your
own auth layer (a reverse proxy or VPN in front of the WebSocket port)
rather than expecting dialback to provide it.

`secret` is required precisely because omitting it isn't a safe default —
a `Server` with no secret configured would accept a handshake from *any*
agent with no verification at all. If that's genuinely what you want
(local development, or a deployment secured entirely at the network
layer), pass `allowUnauthenticatedAgents: true` explicitly so it's visible
in the code that authentication was deliberately skipped, not merely
forgotten.

If a shared secret genuinely isn't enough — you need to tell agents apart,
not just confirm they're *some* trusted agent — see [the
`dialback/browsermesh` transport](/dialback/browsermesh-transport/), which
swaps this model for real per-agent Ed25519 identity.

## `Agent`

The `Agent` class connects to a `Server` and handles proxied requests.

### Constructor

```javascript
new Agent(address, options)
```

- `address` — a string WebSocket address of the server to connect to (or
  whatever address shape a custom `transport` expects).
- `options`:
  - `reconnect` (optional) — milliseconds to wait before reconnecting if
    the connection is lost.
  - `log` (optional) — integer log level (0–4).
  - `abort` (optional) — a function returning a `Response` when a request
    is aborted.
  - `secret` (optional) — authentication string, matched against the
    server's own `secret`.
  - `transport` (optional) — `(address) => Promise<Connection>`. When
    provided, used instead of `new WebSocket(address)` to establish the
    connection — see [the `dialback/browsermesh`
    transport](/dialback/browsermesh-transport/).

### Methods

- `serve(handler)` — sets the request handler function. `handler` accepts
  a `Request` and returns a `Promise` resolving to a `Response`.

### Properties

- `serve` — a bound version of the `serve` method.

## Utility functions

### `upgradeWebSocket(req)`

Creates a WebSocket connection from an HTTP request. Primarily used in
Deno environments.

## Usage with Deno

```javascript
import { Server } from "npm:@johnhenry/dialback";

const server = new Server(() => new Response("no responder", { status: 500 }));
Deno.serve({ port: 8082 }, (req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return server.fetch(req);
  }
  const { socket: connection, response } = Deno.upgradeWebSocket(req);
  server.addConnection(connection);
  connection.addEventListener("close", () => server.removeConnection(connection));
  return response;
});
```

The `Agent` side is unchanged from Node.
