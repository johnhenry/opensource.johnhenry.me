---
title: "Tutorial: two peers, one message"
description: "Boot two browsermesh Pods over an in-process transport, watch them discover each other for real via HELLO/HELLO_ACK, and send one message between them."
---

This is the smallest real browsermesh program: two `Pod`s boot, find each other, and one sends the other a message. It runs in plain Node — no browser, no network — but the discovery handshake and message delivery are the real protocol, not a stub standing in for it.

Takes about 5 minutes.

## 1. Install

```sh
npm install @johnhenry/browsermesh-pod
```

`browsermesh-pod` depends on `@johnhenry/browsermesh-primitives` (identity, wire format) as a peer — npm will pull it in.

## 2. Create the file

Create `two-pods.mjs`:

```js
import assert from 'node:assert/strict'
import { Pod, EventEmitterTransport } from '@johnhenry/browsermesh-pod'

// In a browser, Pod auto-detects BroadcastChannel. Here in Node, we hand it
// an explicit in-process transport instead — a shared pub/sub bus standing
// in for a real one (WebSocket relay, BroadcastChannel, etc). Each pod gets
// its own transport instance bound to the same bus, exactly like two browser
// tabs would each get their own BroadcastChannel handle to the same channel
// name.
const bus = EventEmitterTransport.createBus()

const alice = new Pod()
const bob = new Pod()

await alice.boot({ transport: new EventEmitterTransport(bus), discoveryTimeout: 200 })
await bob.boot({ transport: new EventEmitterTransport(bus), discoveryTimeout: 200 })

console.log('alice podId:', alice.podId, '| role:', alice.role)
console.log('bob podId:  ', bob.podId, '| role:', bob.role)

// Real discovery, not a fixture: each pod's peer map was populated by the
// actual HELLO/HELLO_ACK handshake that ran during boot().
assert.ok(alice.peers.has(bob.podId), 'alice should have discovered bob')
assert.ok(bob.peers.has(alice.podId), 'bob should have discovered alice')
console.log('mutual discovery via HELLO/HELLO_ACK: ok')

// ── Send one message ────────────────────────────────────────────────
const received = new Promise((resolve) => {
  bob.on('message', (msg) => resolve(msg))
})

alice.send(bob.podId, { kind: 'greeting', text: 'hello from alice' })

const msg = await received
assert.equal(msg.from, alice.podId)
assert.equal(msg.to, bob.podId)
assert.deepEqual(msg.payload, { kind: 'greeting', text: 'hello from alice' })
console.log('bob received:', msg.payload)

await alice.shutdown()
await bob.shutdown()
console.log('ok: two independently-booted Pods discovered each other and exchanged a real message')
```

## 3. Run it

```sh
node two-pods.mjs
```

You should see something like:

```
alice podId: NZGSG5TSTEM_3rs2Xj6c9DFoD8cda3TWHWb7EgiFRvc | role: autonomous
bob podId:   Wq8cNg0uLzZ4WYans4N_lhPGapyh91zxS75LND90dyo | role: peer
mutual discovery via HELLO/HELLO_ACK: ok
bob received: { kind: 'greeting', text: 'hello from alice' }
ok: two independently-booted Pods discovered each other and exchanged a real message
```

The `podId` values are deterministically derived from each pod's freshly-generated Ed25519 identity, so yours will be different every run — everything else should match exactly.

## What just happened

- `Pod` is the base execution-context class from `browsermesh-pod`: identity, discovery, and peer messaging in one boot sequence. Passing only `transport` (no `discovery`) still runs the real discovery protocol — `boot()` builds a `TransportDiscovery` over your transport automatically.
- The HELLO/HELLO_ACK exchange is what actually populated `alice.peers` and `bob.peers` — that's why the assertions after boot pass. In a browser, the same handshake runs over `BroadcastChannel` with no code changes; the `EventEmitterTransport` here exists purely so this example needs no browser.
- `alice.send(bob.podId, payload)` and `bob.on('message', ...)` are the same send/receive API you'd use once real transports (WebRTC, WebSocket relay) are involved — this tutorial swaps the transport, not the messaging model.

## Where to go next

- [browsermesh overview](/browsermesh/) — the ten packages, what depends on what, and why they're consolidated under one scope.
- [Pod](/browsermesh/pod/) — the full `Pod` reference.
- `browsermesh`'s own [`examples/`](https://github.com/johnhenry/browsermesh/tree/main/examples) — the next steps from here are `04-kernel-capability-denial.mjs` (capability-gated security), `05-crdt-sync-across-two-engines.mjs` (state that merges instead of conflicting), and `07-full-mesh-pipeline.mjs` (discovery + CRDT sync + kernel + relay, all on one connection).
