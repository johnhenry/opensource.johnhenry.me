---
title: "dialback"
description: "Reverse proxy HTTP requests over web sockets — an agent dials out, the server dials back through that connection to reach it."
---

**`@johnhenry/dialback`** is a library for creating a reverse proxy over
WebSockets: an `Agent` dials out (through a NAT/firewall it's behind), and
the `Server` dials back through that same connection to reach it — the
name is the mechanism, not just a label.

```
Request/Response <-HTTP-> [Server] <-WS-> [Agent]
```

> **Provenance:** previously developed as `leproxy` (itself a rename of the
> original `proxy-socks`), but never actually published to npm under
> either name. Renamed and adopted into the `@johnhenry` scope, starting
> fresh at `0.0.0`.

A `Server` instance is Fetch-shaped (`server.fetch(request)`), which is
what makes it easy to sit behind another package in this family:
[`@johnhenry/hostable`](/hostable/) can forward gateway traffic straight
to an agent behind a firewall with `<Upstream app={dialbackServer} />`, no
adapter needed — see hostable's own [API](/hostable/api/), "Ecosystem
integration."

## Install

```bash
npm install @johnhenry/dialback
```

## Quick example

```javascript
// Server
import { Server } from "@johnhenry/dialback";
import http from "http";
import { WebSocketServer } from "ws";

const server = new Server(() => new Response("no responder", { status: 500 }), {
  secret: "shared-secret",
});

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const response = await server.fetch(new Request(url, { method: req.method, headers: req.headers }));
  res.writeHead(response.status, response.statusText, Object.fromEntries(response.headers));
  response.body.pipe(res);
});

const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", (ws) => {
  server.addConnection(ws);
  ws.on("close", () => server.removeConnection(ws));
});

httpServer.listen(8082);
```

```javascript
// Agent
import { Agent } from "@johnhenry/dialback";

const { serve } = new Agent("ws://localhost:8082", { reconnect: 1000, secret: "shared-secret" });

serve(async (request, { id }) => {
  return new Response("Hello there!", {
    status: 200,
    headers: { "content-type": "text/plain", etag: id },
  });
});
```

See [API](/dialback/api/) for the full `Server`/`Agent` reference,
including Deno usage and the authentication model, and [the
`dialback/browsermesh` transport](/dialback/browsermesh-transport/) for a
real per-agent-identity alternative to the shared-secret model above.

## The pages here

- [API](/dialback/api/) — `Server`, `Agent`, utility functions, and a note
  on authentication
- [The `dialback/browsermesh` transport](/dialback/browsermesh-transport/)
  — optional per-agent Ed25519 identity in place of a shared secret, the
  handshake, and its honestly-documented limitations

## Contributing

Contributions are welcome — see the repo for details.

## License

This project is licensed under the MIT License.

## Source

[github.com/johnhenry/dialback](https://github.com/johnhenry/dialback)
