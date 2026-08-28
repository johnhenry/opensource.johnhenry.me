---
title: Pod & embed
description: browsermesh-pod (the base class for any browser execution context) and browsermesh-embed (an agent-backed widget built on top of it).
---

A **Pod** is any browser execution context — window, iframe, worker, service worker — that can execute code, receive messages, and be discovered and addressed. `@johnhenry/browsermesh-pod` is the standalone base class; `@johnhenry/browsermesh-embed` is a thin, opinionated widget built on top of it.

## Pod

```sh
npm install @johnhenry/browsermesh-pod @johnhenry/browsermesh-primitives
```

`browsermesh-primitives` is a **peer dependency**, not bundled — it provides the Ed25519 identity generation `Pod` relies on. Both must be installed; installing only `browsermesh-pod` leaves the peer dependency unresolved.

```js
import { Pod } from '@johnhenry/browsermesh-pod'

const pod = new Pod()
await pod.boot()

pod.podId   // base64url Ed25519 public key hash
pod.kind    // 'window', 'worker', 'iframe', etc.
pod.role    // 'autonomous', 'peer', or 'child'
pod.peers.size

pod.on('message', (msg) => console.log('Received:', msg.payload))

pod.send(otherPodId, { text: 'hello' })
pod.broadcast({ text: 'hello everyone' })

await pod.shutdown()
```

### The boot sequence is not optional configuration — it's how peers find each other

Calling `pod.boot()` runs six phases automatically: generate identity → attach listeners → detect parent/opener relationships → parent handshake (`POD_HELLO`/`POD_HELLO_ACK`) → peer discovery over `BroadcastChannel` → role finalization. State moves `idle → booting → ready → shutdown`. If you need to tune timing — a fast-discovery client vs. a patient server — that's what `boot()`'s options are for:

```js
await pod.boot({
  identity,           // reuse an existing PodIdentity instead of generating one
  discoveryChannel,   // BroadcastChannel name (default: 'pod-discovery')
  handshakeTimeout,   // ms to wait for parent ACK (default: 1000)
  discoveryTimeout,   // ms to wait for peer responses (default: 2000)
})
```

Two convenience shapes cover the common client/server split: `createClient({ discoveryTimeout: 500 })` (fast, low-patience) and `createServer({ discoveryTimeout: 5000 })` (patient, expects to be found).

### Peer discovery is same-origin only

`BroadcastChannel`-based discovery only reaches peers in the same browsing context group and origin. A Pod in one origin never auto-discovers a Pod in another — that's a security boundary, not a bug to work around with a wider channel name.

### Subclassing

Three hooks exist for a subclass to extend behavior without re-implementing the boot sequence: `_onInstallListeners(g)` (phase 1), `_onReady()` (phase 5, boot complete), `_onMessage(msg)` (targeted incoming message). `InjectedPod` (also exported from this package) is the reference subclass — built for Chrome extension injection or bookmarklet use, adding page text extraction and a visual overlay indicator.

### Provenance

Previously published, unscoped, as `browsermesh-pod@0.2.1` — a real standalone repo. Version restarts at `0.0.0` under the `@johnhenry` scope.

## Embed

```sh
npm install @johnhenry/browsermesh-embed @johnhenry/browsermesh-pod
```

`EmbeddedPod` extends `Pod` with a minimal messaging API (`sendMessage`, `on`/`off`/`emit`) and a lazy-attached **agent slot** — the package has no dependency on any specific agent implementation. An agent just needs to be duck-typed with `sendMessage(text, opts)`, `getEventLog().query({ type })`, and `run()`.

```js
import { EmbeddedPod } from '@johnhenry/browsermesh-embed'

const pod = new EmbeddedPod({ containerId: 'my-agent', agent: myAgent })
pod.on('response', (msg) => console.log(msg))

const { content, toolCalls } = await pod.sendMessage('Summarize this page')
```

### Why the package name and the code don't match — on purpose

`browsermesh-embed` exports `ClawserEmbed` as a backward-compatible alias of `EmbeddedPod`. That's not stray debug code: this package **was** `clawser-embed`, published unscoped from inside the private `clawser` monorepo. It was renamed during extraction into this public monorepo specifically so a public package wouldn't carry the name of a private product — but the alias stays so anything already importing `ClawserEmbed` keeps working across the rename.

### Provenance

Previously published, unscoped, as `clawser-embed@0.1.1`, from inside the private `clawser` monorepo, with no CI ever automating that publish. This is its first release as `@johnhenry/browsermesh-embed`; version restarts at `0.0.0`.
