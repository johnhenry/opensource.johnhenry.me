---
title: "Security model"
description: "What servant does and doesn't protect you from, stated plainly — including two real, unclosed gaps: unvalidated Host-header URL construction, and no WebSocket Origin check by default."
---

servant is a thin, self-contained HTTP/WebSocket server loop — it does not
add any request-level security controls beyond what raw Node `http`/
`https` gives you. Specifically:

- **No authentication or authorization.** `start()`/`use()`/`route()`
  dispatch every request that reaches the process to your middleware/
  handler chain. Access control, session/cookie validation, and API-key
  checks are entirely your responsibility to add via `use()`.

- **`request.url` is built from the client-supplied `Host` header,
  unvalidated.** Both `controls.mjs`'s own routing (`new URL(req.url,
  \`http://${req.headers.host}\`)`) and the shared `toWebRequest()` it
  depends on (`@johnhenry/leserve/node-request`) construct the request's
  URL/origin straight from `req.headers.host`, falling back to
  `"localhost"` only if the header is absent entirely — there is no
  allowlist or validation otherwise. A client can send any `Host` value it
  wants. If a handler reads `request.url` (or its `.host`/`.origin`) to
  build absolute links, redirects, password-reset URLs, or a CORS
  decision, that value is attacker-controlled input, not a trustworthy one
  — unless a reverse proxy in front of servant strips/overwrites the
  inbound `Host` header before the request reaches it.

- **Thrown errors with a tagged `.status` return `error.message` verbatim
  as the response body.** Only errors without a valid 400–599 `.status`
  fall back to the generic `"Internal Server Error"`; anything else
  (including a `413` from an upstream body-size check, or any error a
  middleware throws with a `.status` set) sends `error.message` directly
  to the client. Don't put internal detail — stack fragments, file paths,
  query values — into a thrown error's `.message` unless you intend for it
  to be public.

- **No built-in CORS, rate limiting, or request body size limit.** All of
  that is left to middleware you write with `use()`; nothing here imposes
  a ceiling on request size or concurrency by default.

- **WebSocket connections are accepted with no `Origin` check by
  default.** `wss.on("connection", ...)` dispatches every incoming
  WebSocket handshake to your `"websocket"` listener regardless of the
  connecting page's origin — the Same-Origin Policy does not apply to
  WebSocket handshakes, so any web page can open a connection to a servant
  server the same way a legitimate client would (cross-site WebSocket
  hijacking) unless you check for it yourself. `WebSocketEvent` exposes
  both `.socket` (the raw `ws` connection) and `.request` (the handshake
  converted to a real `Request`) — read
  `event.request.headers.get("origin")` and `event.socket.close(1008,
  "origin not allowed")` if a connecting origin isn't one you trust;
  servant itself enforces nothing by default.

None of the above is a defect specific to servant — it is what "a thin
wrapper around Node's `http`/`https`/`ws`" means. If you need any of these
protections, add them yourself in `use()` middleware or in front of
servant (a reverse proxy), the same way you would for Express or any other
minimal Node HTTP framework.

If you'd rather build routing/middleware on top of a leaner core yourself,
[leserve](/leserve/) is the plain `(Request) => Response` handler servant
grew out of — the same Host-header caveat above applies there too, since
servant's own `toWebRequest()` is leserve's.
