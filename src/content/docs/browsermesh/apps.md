---
title: Application layer
description: browsermesh-apps — marketplace, chat, payments, mesh-native storage, serverless sites/functions, compute orchestration, and agent tools built on core, transport, sync, and discovery.
---

`@johnhenry/browsermesh-apps` is the top of the stack: marketplace, chat, payments, a mesh-native object store and key-value store, `fetch()`/`WebSocket`-shaped mesh access, static-site and serverless-function hosting across peers, compute orchestration, consensus, and agent tooling — all built on the four services packages.

```sh
npm install @johnhenry/browsermesh-apps @johnhenry/browsermesh-primitives @johnhenry/browsermesh-transport @johnhenry/browsermesh-sync
```

`primitives` and `sync` are the **required peer dependencies** — `apps` (0.11.0) declares zero regular `dependencies`, only `peerDependencies`, and is broken at the first call that touches a missing one. `core`, `transport`, `discovery`, `kernel`, `netway`, and `@johnhenry/andbox` are peer dependencies too, but marked **optional**: install them only if you use the specific functionality that needs them (identity/trust needs `core`; real WebRTC/WebSocket wires — `createMeshNode()`'s negotiator — need `transport`; DHT discovery and the `mesh://` Service Worker router need `discovery`; `Kernel.caps.net` wiring needs `kernel`; the S3-like `CloudStorage` backend needs `netway`; the light-tier serverless function executor needs `andbox`, and is imported *lazily* inside that one executor, not at module load, so its absence never breaks anything else in the package).

Every peer range has an upper bound of `<1.0.0`. The lower bounds are `primitives` `>=0.2.0` (the release that changed [`PodIdentity.verify()`'s argument order](/browsermesh/primitives/#breaking-in-020-podidentityverify-takes-webcrypto-argument-order)), `core` `>=0.5.0`, `transport` `>=0.1.0`, `sync` `>=0.0.0`, `discovery` `>=0.0.1`, `kernel` and `netway` `>=0.0.0`, and `andbox` `>=0.0.1`. The package declares `"engines": { "node": ">=26.0.0" }`.

It also imports in a browser as-is. Before 0.11.0 the modules that resolve an optional peer lazily did a static `import { createRequire } from 'node:module'` at the top of the file, which failed the moment the package's root entry was loaded in a browser, even for a caller who never touched that code path. As of 0.11.0 that lookup goes through `process.getBuiltinModule('module')` *inside* the function that needs it, so nothing Node-only runs from merely importing the package; only an actual call into one of those optional-peer paths still requires Node.

```js
import { MeshChat, AppRegistry, MeshOrchestrator, CloudStorage } from '@johnhenry/browsermesh-apps'
```

### What's in here

`apps` is by far the largest package in the family — 40+ modules covering:

| Area | Key exports |
| --- | --- |
| App runtime | `AppRegistry`, `AppStore`, `AppRPC`, `AppEventBus` |
| Marketplace | `Marketplace`, `MarketplaceIndex`, `ServiceListing`, `SkillMarketplace` |
| Chat | `MeshChat`, `ChatRoom`, `ChatMessage`, `PeerChat` |
| Payments | `PaymentChannel`, `EscrowManager`, `CreditLedger`, `PaymentRouter` |
| Storage | `CloudStorage` (S3-like, encrypted, replicated object store), `MeshKv` (replicated key-value store) |
| Mesh access | `createMeshRpcService` (request/response transport), `createBrowserMeshFetch` (`fetch()`-shaped mesh access), `BrowserMeshWebSocket` (standard `WebSocket` surface over the mesh) |
| Serverless | `createStaticHandler`, `createFunctionsHandler`, `createAndboxExecutor`, `createProxyHandler`, `createSiteRequestHandler`, `SiteRegistry` — static sites and functions served across mesh peers |
| Compute | `ResourceRegistry`, `ComputeRequest`, `JobQueue`, `TrainingOrchestrator`, `GpuProbe`, `FederatedCompute` |
| Coordination | `ConsensusManager`, `Proposal`, `Ballot`, `MeshScheduler`, `TaskQueue` |
| Orchestration | `MeshOrchestrator` (a real, `checkAccess()`-gated `MeshService`) + 8 `meshctl` `BrowserTool` subclasses |
| Agents | `createAgentRuntime` (bring-your-own-LLM tool-calling loop), `BrowserToolRegistry`, `AgentHost`, `AgentClient`, `bridgePeerAgent`, `AgentSwarmCoordinator` |
| Audit | `AuditChain`, `AuditStore`, `detectFork`, `buildMerkleRoot` |
| Peer services | `PeerNode` (`sendTo()` with a bulk lane, `broadcast()`), `createPeerNodeTransport`, `PeerRegistry`, `FileHost`/`FileClient`, `TerminalHost`/`TerminalClient`, `HealthMonitor`/`AutoMigrator`, `TimestampAuthority`, `TorrentManager`, `createTorrentService`, `VerificationQuorum`, `IPFSStore` (also exported as `MeshLocalCidStore`) |
| Observability | `MeshInspector`, `MeshInspectTool`, `TopologyLayout`, `TrustGraphLayout`, `TrustHeatmap`, `observability-bridge` (live event feed from grants/replication/connections) |

`IPFSStore` and `MeshLocalCidStore` are the same class: a mesh-local content-addressed store. Its CIDs are SHA-256 hex digests, not IPFS CIDs, and nothing in it talks to the IPFS network — the alias exists to say so. The class and its alias both come from `peer-ipfs.mjs`.

### Mesh-native storage: CloudStorage and MeshKv

`CloudStorage` is a genuine S3-like object store with **no server anywhere** — data lives in each participating peer's own IndexedDB, replicated peer-to-peer over WebRTC:

```js
import { CloudStorage } from '@johnhenry/browsermesh-apps'

const store = new CloudStorage({ bucket: 'my-bucket', node: peerNode })
await store.becomeAdmin()
await store.grant(otherPeer.podId, ['read', 'write'])
await store.put('key', data, { contentType: 'text/plain' })
const bytes = await store.get('key') // resolves once synced from any granted peer
```

Content is chunked (256KB) and encrypted (AES-256-GCM) before it's ever written to disk or sent over the wire; a signed, replicated grant-log handles multi-peer authorization (no wildcard-peer grant exists — every reader needs an explicit grant); `put()` never blocks or throws on an offline replica, returning `{durability: 'local-only'|'replicated'}` instead. `MeshKv` is the same CRDT/ACL machinery without chunking or encryption, for small, low-sensitivity shared state.

### browsermesh serverless: static sites and functions across peers

Adapted from a single-machine reference (`actually-serverless`, a Service Worker that routes `fetch()` to browser tabs) into a real mesh-native equivalent — a site's static assets and serverless functions are served by whichever peer answers first, not one browser tab:

```js
import { createStaticHandler, createSiteMeshRpcService, createServerlessFetchRouter } from '@johnhenry/browsermesh-apps'

const staticHandler = createStaticHandler({ store: cloudStorageBucket, public: true, spaFallback: true })
attachService(peerNode, network, createSiteMeshRpcService({ staticHandler }))
```

Requests route static → functions → proxy, first non-null response wins. The function-execution backend is intentionally pluggable and, for the light/default tier, built on `@johnhenry/andbox`'s Worker-isolated JS runtime — **not an adversarial-code sandbox** (Worker-global `fetch`/`WebSocket` are reachable regardless of granted capabilities), appropriate for a site operator's own functions, never arbitrary third-party code. One fresh sandbox is created per invocation and never pooled: concurrent inbound requests are real, and andbox's own Worker-realm sharing plus a timeout-triggered hard-kill can otherwise take down an unrelated concurrent call. A `SiteRegistry` handles multi-peer load-balanced routing (first-fit/round-robin/load-balanced), admin-designated the same way `CloudStorage`'s replica peers are — never auto-discovered.

### Sending to peers: wire format, the bulk lane, and `broadcast()`

**What goes on the wire.** A real transport (`RTCDataChannel`, `WebSocket`) carries only strings and binary. `PeerNode.sendTo(pubKey, envelopeObject)` and `ctx.sendTo()` hand the transport an object; the transports in `@johnhenry/browsermesh-transport` encode it as JSON text (strings and binary go out unchanged — see [`encodeWireData()`](/browsermesh/services/#what-send-puts-on-the-wire)), and a service receives it back as the parsed object through `ctx.onIncomingData()`. That parse accepts either form, so it works for transports that deliver text and for in-process nodes that pass objects. `PeerNode.onIncomingData()` is the raw bus: it hands subscribers exactly what the transport delivered, so a direct subscriber that wants objects should parse JSON-object text itself. If you write your own transport, make `send()` follow the same rule — forwarding an object to `RTCDataChannel.send()` turns it into the text `"[object Object]"` with no error.

**The bulk lane.** The WebRTC transport opens a second, unordered `mesh-bulk` data channel so a large payload does not sit in front of control traffic. Select it per send:

```js
await peerNode.sendTo(pubKey, envelope, { channel: 'bulk' })             // PeerNode
await ctx.sendTo(pubKey, 'chunk-response', payload, { channel: 'bulk' }) // MeshService ctx
```

`channel` is `'control'` (the default; the transport is then called exactly as before) or `'bulk'`; anything else throws a `TypeError`. It reaches the transport as `send(data, { channel })`. A transport with no bulk lane ignores the option, and the WebRTC transport falls back to its control channel when the bulk channel is not open, so the same code works against an older peer. The chunk-carrying services — chunk replication (`chunk-push`, `chunk-fetch-response`) and the torrent service (`chunk-response`) — already send on the bulk lane; requests and acknowledgements stay on control.

**Sending to everyone.** `PeerNode.broadcast(data, { channel, exclude, concurrency })` sends to every connected peer — one send per peer, at most `concurrency` (default 8) in flight. A peer whose send fails does not stop the others: errors are collected, never thrown.

```js
const { sent, failed } = await peerNode.broadcast({ type: 'hello' }, { exclude: [somePubKey] })
// sent: ['pk1', 'pk2'], failed: [{ pubKey: 'pk3', error: 'Data channel not open' }]
peerNode.on('broadcast', ({ sent, failed }) => { /* fires after each fan-out */ })
```

`exclude` is an array, a `Set`, or a `(pubKey) => boolean` predicate.

**Wiring payments, consensus, migration, and group keys.** `PaymentRouter`, `ConsensusManager`, `MigrationEngine` (`@johnhenry/browsermesh-sync`), and `GroupKeyManager` (`@johnhenry/browsermesh-core`) each take a host-supplied `wireTransport(broadcastFn, subscribeFn)`. `createPeerNodeTransport(peerNode)` builds that pair from a `PeerNode`:

```js
import { createPeerNodeTransport } from '@johnhenry/browsermesh-apps'

const { broadcastFn, subscribeFn } = createPeerNodeTransport(peerNode)
paymentRouter.wireTransport(broadcastFn, subscribeFn)
consensus.wireTransport(broadcastFn, subscribeFn)
```

Messages travel as `{ type: <wire type>, payload, from }`. The `fromPodId` a handler receives is the peer the message actually arrived from, not the envelope's own `from` field, which a remote peer could set to anything. `broadcastFn` never rejects, so it is safe to call fire-and-forget.

### Torrent service: durable stores, authorization, and serve limits

`createTorrentService()` distributes content in SHA-256-addressed pieces: a downloader fetches each piece from whichever peer holds it, and a finished downloader becomes a seeder. By default everything is in memory and open to any peer that knows the magnet URI. These options change that; all are optional.

```js
import { createTorrentService, attachService } from '@johnhenry/browsermesh-apps'
import { IndexedDBChunkStore } from '@johnhenry/browsermesh-sync'

const torrent = attachService(peerNode, undefined, createTorrentService({
  // Durable pieces and manifests: a seeder that reloads keeps serving.
  chunkStore: new IndexedDBChunkStore({ dbName: 'my-app-pieces' }),
  manifestStore: myManifestStore,
  // Who may fetch what. Return true to allow; false, a throw, or anything else denies.
  authorize: async (fromPubKey, { kind, magnetURI, infoHash, cid, chunkCid }) =>
    registry.checkAccess(fromPubKey, `share:${cid}`, 'read'),
  maxConcurrentServes: 16,                // chunk-responses in flight, all peers (0 = unlimited)
  maxConcurrentServesPerPeer: 4,          // ... per requesting peer
  maxBytesPerPeerPerSec: 4 * 1024 * 1024, // served-bytes budget per peer (default 0 = unlimited)
  maxAnnouncesPerPeerPerMinute: 30,       // inbound announces accepted per peer
}))

await torrent.api.ensureLoaded() // after a reload: also restores listTorrents()
const info = await torrent.api.seed('some text') // strings are UTF-8 encoded
```

- **`chunkStore`** is any object with `save(cid, bytes)`, `get(cid)`, `has(cid)`, and `remove(cid)`, each sync or returning a Promise. The in-memory `ChunkStore` and the IndexedDB-backed `IndexedDBChunkStore`, both from `@johnhenry/browsermesh-sync`, fit.
- **`manifestStore`** is `{ get(magnetURI), set(magnetURI, manifest), delete(magnetURI), entries() }` (sync or async). Each manifest is a small JSON-safe record. It is the index of what the node holds, and a node only serves pieces that one of its manifests lists, so persist both stores or neither. `TorrentManager` accepts the same two options (plus `chunkSize`).
- Stores you pass in belong to you: `destroy()` never clears them.
- **`authorize`** runs before every manifest and piece is served; only a strict `true` allows. A refused request gets exactly the reply an unknown one gets (`manifest: null` / `error: 'not-found'`), so a peer cannot probe what exists. `cid` is the SHA-256 hex CID of the whole content; `chunkCid` is set for `kind: 'chunk'`. Omitting `authorize` serves every peer, as before.
- Over a serve cap a requester is told `busy` and downloaders back off and retry. Caps and `authorize` never apply to the downloading side.
- Events: `torrent:chunk-served` and `torrent:chunk-received`, plus `torrent:request-denied` and `torrent:serve-busy`.

### Verify callbacks take the WebCrypto order too

Every signature check in BrowserMesh takes `(identity, signature, data)`, the same as `crypto.subtle.verify` and [`PodIdentity.verify()`](/browsermesh/primitives/#breaking-in-020-podidentityverify-takes-webcrypto-argument-order). That applies to the callbacks you hand to `apps`:

| Where | Callback shape |
| --- | --- |
| `PaymentChannel` `opts.verifyFn` | `(publicKey, signature, data) => boolean` |
| chat service / `PeerChat` `verifyFn` | `(fromPubKey, signature, data) => boolean` |
| `GrantLog` / key-distribution `wallet.verify` | `(publicKeyBytes, signature, data) => boolean` |
| `TimestampProof.verify(verifyFn)` and `identity.verify` on `TimestampAuthority` | `(signerPodId, signature, data) => boolean` |
| `Attestation.verify(verifyFn)` | `(podId, signature, resultHash) => boolean` |

**Breaking in apps 0.9.0:** `peer-timestamp` previously used `(signature, data, signerPodId)` and `Attestation.verify` used `(podId, resultHash, signature)`. Update those callbacks by swapping the arguments.

An old-order callback used to return `false` for every message, silently, because the library catches errors around callbacks. To make that loud, the `PaymentChannel`, chat, `GrantLog`, and key-distribution paths run a one-time self-test the first time a callback is used (the probe starts when the callback is passed in): the callback is called with a known-good Ed25519 test vector (RFC 8032, test 2) in the new order. If it rejects that but accepts `(publicKey, data, signature)`, a `TypeError` naming the new order is thrown from the call that used it (for example `channel.receive()` or `chat.receiveEnvelope()`), and every later call rejects the same way. A callback that accepts the new order, or that rejects both orders (for example because it looks keys up in a directory the test key is not in), is left alone. The self-test is skipped when `NODE_ENV` is `production`. Because the test vector is fed to your callback once, a spy on `verifyFn` sees one extra call with `Uint8Array` arguments. The `peer-timestamp` paths also throw a `TypeError` if the first argument is a 64-byte signature.

### Two class names collide inside this package itself — and only one is reachable

`payments.mjs` and `peer-payments.mjs` both define a `CreditLedger` class. `payments.mjs` and `peer-escrow.mjs` both define an `EscrowManager` class. The package's `index.mjs` re-exports everything with `export * from './<module>.mjs'` — and when two wildcard re-exports collide on the same name, **the ambiguous binding is silently dropped by the JS module system**, not an error. The package's own index.mjs works around this with two explicit, named re-exports:

```js
// from browsermesh-apps/src/index.mjs
export { CreditLedger } from './payments.mjs';
export { EscrowManager } from './peer-escrow.mjs';
```

So `import { CreditLedger } from '@johnhenry/browsermesh-apps'` always gets you `payments.mjs`'s mesh-level ledger, and `import { EscrowManager } from ...` always gets you `peer-escrow.mjs`'s opts-based manager — never the sibling classes of the same name from `peer-payments.mjs`/`payments.mjs`. Those siblings are not a secondary export you can reach another way: `package.json`'s `exports` map lists only `"."`, `"./compat"`, `"./mesh-rpc"`, `"./mesh-fetch"`, `"./mesh-service"`, and `"./peer-registry"`, so there is **no subpath import** for these files (`@johnhenry/browsermesh-apps/peer-payments` fails — Node's exports-map encapsulation blocks any path not explicitly listed). If your use case genuinely needs `peer-payments.mjs`'s `CreditLedger` or `payments.mjs`'s `EscrowManager`, the public package doesn't expose it; you'd need to fork or vendor that file.

### Provenance

Extracted from the private `clawser` monorepo (previously `packages/browsermesh-apps`), manually published, unscoped, as `browsermesh-apps@0.1.0` (2026-07-17), with no CI ever automating that publish. First release as `@johnhenry/browsermesh-apps`; version restarts at `0.0.0`.
