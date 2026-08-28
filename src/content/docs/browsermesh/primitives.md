---
title: Primitives & networking
description: browsermesh-primitives (wire format, Ed25519 identity, CRDTs, capabilities, trust, ACL) and browsermesh-netway (BSD-socket-style virtual networking) — the two zero-dependency foundations.
---

`@johnhenry/browsermesh-primitives` and `@johnhenry/browsermesh-netway` are the two packages everything else either depends on or connects through. Both ship **zero dependencies** and pure ES modules — they run identically in a browser or Node.js.

## Primitives

```sh
npm install @johnhenry/browsermesh-primitives
```

```js
import { PodIdentity, VectorClock, ORSet, CapabilityToken, ACLEngine } from '@johnhenry/browsermesh-primitives'

// Ed25519 identity
const identity = await PodIdentity.generate()
console.log(identity.podId) // base64url-encoded SHA-256 of the public key

const data = new TextEncoder().encode('hello mesh')
const sig = await identity.sign(data)
await PodIdentity.verify(identity.keyPair.publicKey, data, sig)

// CRDTs merge across peers instead of conflicting
const clockA = new VectorClock()
clockA.increment('node-a')
const clockB = new VectorClock()
clockB.increment('node-b')
const merged = clockA.merge(clockB)

const set = new ORSet()
set.add('item', identity.podId)
set.has('item') // true
```

### What's in here

- **Identity** — `PodIdentity` (Ed25519 keypair, sign/verify), `derivePodId(publicKey)`
- **Wire format** — `messageTypeRegistry`, `encodeMeshMessage(msg)` / `decodeMeshMessage(bytes)`
- **Capabilities** — `CapabilityToken` (scoped, with expiry), `parseScope`/`matchScope`
- **Trust** — `createTrustEdge`, `computeTransitiveTrust(edges, source, target)` — a weighted trust graph, not just a boolean allow-list
- **ACL** — `ACLEngine`, `Permission`, `AccessGrant`, `matchResourcePattern` (glob-style)
- **CRDTs** — `VectorClock`, `LWWRegister`, `GCounter`, `PNCounter`, `ORSet`, `RGA` (replicated growable array), `LWWMap`. All support `merge()`, `toJSON()`, `fromJSON()`.
- **Test utilities** — `DeterministicRNG`, `LocalChannel`/`createLocalChannelPair()`, `TestMesh` — useful if you're testing code that consumes this package without standing up a real mesh

### Provenance

Previously published, unscoped, as `browsermesh-primitives@0.1.1` — a real standalone repo with its own history, not extracted from a private monorepo. Imported into the `@johnhenry` scope as part of the browsermesh consolidation; version restarts at `0.0.0`.

## Netway

```sh
npm install @johnhenry/browsermesh-netway
```

BSD-socket-like abstractions — `StreamSocket` (TCP-like), `DatagramSocket` (UDP-like), `Listener` — running entirely in-memory, or proxied through a remote gateway.

```js
import { VirtualNetwork, CAPABILITY } from '@johnhenry/browsermesh-netway'

const net = new VirtualNetwork()

const listener = await net.listen('mem://localhost:8080')
const client = await net.connect('mem://localhost:8080')
const server = await listener.accept()

await client.write(new TextEncoder().encode('hello'))
const chunk = await server.read() // Uint8Array: "hello"

// Scoped policy enforcement
const sandbox = net.scope({ capabilities: [CAPABILITY.LOOPBACK] })
await sandbox.connect('mem://localhost:8080') // allowed
// sandbox.connect('tcp://example.com:80')    // throws PolicyDeniedError
```

### Backends — this is where "virtual" stops meaning "fake"

`net.listen`/`net.connect` dispatch on URL scheme to a **backend**, and the backend is what determines whether traffic actually leaves the process:

- `LoopbackBackend` — `mem://` and `loop://`, purely in-memory
- `GatewayBackend` — **wsh-proxied**, for real TCP/UDP/DNS. This is the integration point with [`@johnhenry/wsh`](/wsh/): netway's socket API stays the same, but traffic goes out over wsh's remote command/tunnel transport.
- `ServiceBackend` — `svc://` scheme, routes through a service registry
- `FsServiceBackend` — filesystem-backed service routing
- `ChaosBackendWrapper` — wraps any of the above with fault injection (latency, drops, partitions) — useful for testing reconnect/retry logic without a real flaky network

Knowing which backend a given scheme resolves to matters: `mem://localhost:8080` and `tcp://example.com:80` look like the same kind of address but have completely different trust and reachability implications, and nothing about the `connect()` call site tells you which backend you're on unless you check the scheme.

### Provenance

Previously published, unscoped, as `browsermesh-netway@0.1.1` — also a real standalone repo. Version restarts at `0.0.0` under the `@johnhenry` scope.
