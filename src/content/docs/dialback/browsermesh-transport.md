---
title: "The dialback/browsermesh transport"
description: "An optional, additive transport swapping dialback's shared-secret model for real per-agent Ed25519 identity, built on browsermesh-netway and browsermesh-primitives — usage, the handshake, and honest limitations."
---

dialback's built-in transport is a WebSocket plus a single shared `secret`
string, compared against whatever every connecting agent sends.
`dialback/browsermesh` is an **optional, additive** module — never
imported by dialback's own `index.mjs`/`server.mjs`/`agent.mjs`, so
requiring plain `dialback` never touches it — that swaps that in for real,
per-agent Ed25519 identity, built on
[`@johnhenry/browsermesh-netway`](https://www.npmjs.com/package/@johnhenry/browsermesh-netway)
(virtual networking: `StreamSocket`/`VirtualNetwork`/`Listener`) and
[`@johnhenry/browsermesh-primitives`](https://www.npmjs.com/package/@johnhenry/browsermesh-primitives)
(`PodIdentity`, an Ed25519 keypair whose `podId` is a base64url hash of its
public key) — both part of the [browsermesh](/browsermesh/) family.

## Why

A shared secret authenticates *that you're some agent this server trusts*,
not *which* agent — every agent presents the same string, there's no
revocation short of rotating the secret for everyone, and no way to tell
agents apart at the auth layer. `dialback/browsermesh` gives each agent
its own keypair; the server verifies a signed challenge before the
connection is ever handed to `Server#addConnection()`, so a compromised or
retired agent's key can simply stop being trusted without affecting any
other agent.

Both `@johnhenry/browsermesh-netway` and `@johnhenry/browsermesh-primitives`
are optional `peerDependencies` — install them yourself to use this
module:

```bash
npm install @johnhenry/browsermesh-netway @johnhenry/browsermesh-primitives
```

As of dialback 0.0.5 the declared ranges are `netway` `>=0.0.1` and
`primitives` `>=0.2.0 <1.0.0`. The `primitives` lower bound matters:
0.2.0 changed [`PodIdentity.verify()`](/browsermesh/primitives/#breaking-in-020-podidentityverify-takes-webcrypto-argument-order)
to the WebCrypto argument order `(publicKey, signature, data)`, and the
handshake below calls it that way. dialback 0.0.4 and earlier called the
old `(publicKey, data, signature)` order, which `primitives` 0.2.0 rejects
with a `TypeError` — against that `primitives`, every handshake failed with
"could not verify signature". Install dialback 0.0.5 or later alongside
`primitives` 0.2.0 or later.

## Usage

```javascript
import { Server, Agent } from "@johnhenry/dialback";
import {
  createBrowsermeshTransport,
  acceptBrowsermeshConnections,
} from "@johnhenry/dialback/browsermesh";
import { VirtualNetwork } from "@johnhenry/browsermesh-netway";
import { PodIdentity } from "@johnhenry/browsermesh-primitives";

// A VirtualNetwork is *your* responsibility to construct and configure.
// The default one (used below) only has its built-in LoopbackBackend,
// i.e. mem:// addresses -- real, in-process networking, good for
// same-process use and tests, but not cross-machine. For real
// cross-machine deployment, configure a GatewayBackend on your
// VirtualNetwork yourself (see @johnhenry/browsermesh-netway's own docs)
// -- this module takes whatever VirtualNetwork it's given and doesn't
// care which backend is behind it.
const net = new VirtualNetwork();

const serverIdentity = await PodIdentity.generate();
const agentIdentity = await PodIdentity.generate();

// allowUnauthenticatedAgents: true is correct and intentional here, not a
// security downgrade: by the time acceptBrowsermeshConnections() ever
// calls server.addConnection(), the connecting agent has already passed
// the identity handshake below -- a connection that fails it is closed
// and never reaches the Server at all.
const server = new Server(undefined, { allowUnauthenticatedAgents: true });

const listener = await net.listen("mem://localhost:9000");
acceptBrowsermeshConnections(listener, server, serverIdentity); // long-running; don't await

const transport = createBrowsermeshTransport(net, agentIdentity);
const { serve } = new Agent("mem://localhost:9000", { transport });

serve(async (request) => new Response("Hello there!", { status: 200 }));
```

## The handshake

Run entirely inside the transport, before either side ever sees a
`Connection`: the listener (mirroring how `Server` already validates
incoming agents against its `secret`) sends a random nonce; the connecting
peer signs it with its `PodIdentity` and replies with `{ podId, publicKey,
signature }`; the listener verifies the signature (`PodIdentity.verify(publicKey,
signature, nonce)`) and that `podId` really is the hash of the supplied
`publicKey`, then sends accept or reject. A
rejected or malformed handshake closes the connection immediately — it's
never wrapped as a `Connection` or handed to `Server#addConnection()`. See
`transports/handshake.mjs` in the repo for the exact wire format and
`transports/framing.mjs` for how dialback's message-oriented protocol is
framed (newline-delimited JSON) over `StreamSocket`'s raw byte stream.

### Using the handshake directly

If you bring your own `StreamSocket` transport instead of using
`createBrowsermeshTransport` / `acceptBrowsermeshConnections`, the two halves
of the handshake are importable by subpath, with no deep import into
`node_modules` (added in dialback 0.0.4):

```javascript
import {
  challengeConnectingPeer, // listener side: challenge, verify, accept/reject
  respondToChallenge, // connecting side: sign the nonce with your PodIdentity
} from "@johnhenry/dialback/transports/handshake"; // or the alias "@johnhenry/dialback/handshake"
```

Both are deliberately **not** re-exported from the package root, which stays
transport-agnostic (the handshake is only meaningful with the optional
`@johnhenry/browsermesh-*` peer dependencies).

This handshake is intentionally **one-directional** — the listener
authenticates the connecting agent, not the other way around — exactly
matching the asymmetry of the existing shared-`secret` model (an agent
today has no way to verify the server's secret either). The listener does
include its own `podId` in the initial challenge, but only
informationally (not signed) — a connecting agent can log/identify which
listener it reached, but that isn't cryptographic proof of the listener's
identity.

## Honest limitations

- **No real backpressure signal.** `StreamSocket` has no
  `bufferedAmount`-equivalent — `write()` either succeeds or throws once
  the peer's buffer has already overflowed, with no graduated "getting
  full" signal in between. This transport's `Connection.bufferedAmount`
  always reports `0`, so `agent.mjs`'s/`server.mjs`'s backpressure-wait
  loops never actually block on it; writes are attempted eagerly and fail
  (loudly) only once the peer is already overwhelmed.
- **No mutual authentication.** As above, the connecting agent does not
  cryptographically verify the listener.
- **No TypeScript types for this subpath.** `@johnhenry/dialback`'s root
  entry ships declarations; `@johnhenry/dialback/browsermesh` (and the
  handshake subpath) do not.
