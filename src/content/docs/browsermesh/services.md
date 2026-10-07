---
title: Core services
description: browsermesh-core (identity/keyring/trust), browsermesh-transport (adapters), browsermesh-sync (CRDT/delta sync), and browsermesh-discovery (DHT/naming/swarm) — the four packages browsermesh-apps builds on.
---

`core`, `transport`, `sync`, and `discovery` are the four services layer packages: identity and trust management, transport adapters, state synchronization, and peer discovery. All four depend only on `@johnhenry/browsermesh-primitives` (peer range `>=0.2.0 <1.0.0`) — none requires another — and all four were extracted from the private `clawser` monorepo, manually published once with no CI, and never touched by automation until this consolidation. Current versions: `core` 0.6.0, `transport` 0.3.3, `sync` 0.2.1, `discovery` 0.0.6. Each declares `"engines": { "node": ">=26.0.0" }`.

The API tables below mirror each package's own module table. The one cross-reference between them is optional: `core` lists `@johnhenry/browsermesh-apps` as an optional peer, and `apps` lists `core` as an optional peer, so each lazily `import()`s the other for one narrow purpose and neither is needed to load the other.

**Breaking in this round of releases:** `PodIdentity.verify()` in `primitives` 0.2.0 now takes `(publicKey, signature, data)` — [WebCrypto order](/browsermesh/primitives/#breaking-in-020-podidentityverify-takes-webcrypto-argument-order). All four now declare `primitives` `>=0.2.0 <1.0.0` as their peer range.

## Core

```sh
npm install @johnhenry/browsermesh-core @johnhenry/browsermesh-primitives
```

```js
import { MeshIdentityManager, MeshKeyring, TrustGraph } from '@johnhenry/browsermesh-core'
```

| Module | Key exports |
| --- | --- |
| identity | `MeshIdentityManager`, `AutoIdentityManager`, `IdentitySelector`, `PodIdentity`, `derivePodId` |
| identity-tools | `IdentityCreateTool`, `IdentityListTool`, `IdentitySwitchTool`, `registerIdentityTools` |
| keyring | `MeshKeyring`, `KeyLink`, `SignedKeyLink`, `SuccessionPolicy` |
| group-keys | `GroupKeyManager`, `GroupState` |
| peer | `PeerState`, `MeshPeerManager` |
| peer-tools | `MeshPeerToolsContext`, `registerMeshPeerTools` + 30 `BrowserTool` subclasses |
| handshake | `HandshakeCoordinator`, `SignalingClient`, `DirectInputHandshake` |
| acl | `MeshACL`, `ScopeTemplate`, `RosterEntry`, `InvitationToken` |
| capabilities | `CapabilityToken`, `CapabilityChain`, `CapabilityValidator`, `WasmSandbox` |
| trust | `TrustGraph` |
| hardening | `RetryWithBackoff`, `TransportHealthCheck`, `ConnectionPool`, `TransportFailover` |
| identity-base | `IdentityManager`, `compileSystemPrompt`, `detectIdentityFormat` |
| identity-wallet | `IdentityWallet` |

`MeshIdentityManager#verify(publicKeyBytes, signature, data)` and `IdentityWallet#verify(...)` take the same `(key, signature, data)` order — **breaking in `core` 0.5.0**, where both previously took `(publicKey, data, signature)`. The old order throws a `TypeError` rather than returning `false`.

`GroupKeyManager` has a `wireTransport(broadcastFn, subscribeFn)` method; `apps`' [`createPeerNodeTransport(peerNode)`](/browsermesh/apps/#sending-to-peers-wire-format-the-bulk-lane-and-broadcast) builds that pair from a `PeerNode`.

Two names overlap with `primitives` in ways that are **not** symmetric — verified against source, not assumed from the README table alone:

- `PodIdentity` and `derivePodId` from `core` are the literal same classes/functions re-exported from `@johnhenry/browsermesh-primitives` (`export { PodIdentity, derivePodId, ... }` after importing them). Importing either from `core` or `primitives` gets you the identical class — interchangeable by design.
- `CapabilityToken` is **not** re-exported the same way — `core`'s `capabilities.mjs` defines its own, separate `CapabilityToken` class (attenuable, chainable) that has nothing to do with `primitives`' `CapabilityToken` beyond the shared name. `import { CapabilityToken } from '@johnhenry/browsermesh-core'` and `import { CapabilityToken } from '@johnhenry/browsermesh-primitives'` resolve to two different classes with incompatible shapes. Pick the import source deliberately; don't assume the two are the same type just because a codebase installs both packages.

## Transport

```sh
npm install @johnhenry/browsermesh-transport @johnhenry/browsermesh-primitives
```

```js
import { MeshTransport, WebSocketTransport, StreamMultiplexer } from '@johnhenry/browsermesh-transport'
```

| Module | Key exports |
| --- | --- |
| transport | `MeshTransport`, `MockMeshTransport`, `MeshTransportNegotiator` |
| websocket | `WebSocketTransport`, `WebRTCTransport`, `WebTransportTransport`, `NATTraversal`, `TransportFactory` |
| webrtc | `WebRTCPeerConnection`, `WebRTCMeshManager`, `WebRTCTransportAdapter` |
| webtransport | `WebTransportBridge`, `WebTransportAdapterFactory` |
| relay | `MeshRelayClient`, `MockRelayServer` |
| gateway | `GatewayNode`, `GatewayDiscovery`, `RouteTable` |
| wire-data | `encodeWireData`, `isWireNative` |
| streams | `MeshStream`, `StreamMultiplexer` |
| cross-origin | `CrossOriginBridge`, `CrossOriginHandshake`, `RateLimiter` |
| wsh-bridge | `MeshWshBridge` |
| wisp | `WispTransport` |
| channel-relay | `ChannelRelay` |

### What `send()` puts on the wire

`RTCDataChannel.send()` and `WebSocket.send()` accept only a string or binary data, and quietly turn anything else into the text `"[object Object]"`. Every transport here therefore sends strings and binary (`ArrayBuffer`, typed arrays, `Blob`) unchanged and any other value as its JSON text, via `encodeWireData()` (`isWireNative()` reports whether a value passes through verbatim). `encodeWireData()` throws a `TypeError` for `undefined` or a function rather than send the text `"undefined"`. The receiving side gets a string; a consumer that wants objects parses it — `apps`' `ctx.onIncomingData()` does. A custom `MeshTransport` should follow the same rule.

`WebRTCTransport.send(data, { channel })` takes `'control'` (the default) or `'bulk'`, and falls back to the control channel when the unordered `mesh-bulk` channel is not open. `PeerNode` — the object that calls it, with `sendTo(pubKey, data, { channel })` and `broadcast()` — lives in `browsermesh-apps`; see [Sending to peers](/browsermesh/apps/#sending-to-peers-wire-format-the-bulk-lane-and-broadcast).

`MeshWshBridge` (`wsh-bridge`) converts between `WshKeyStore`'s hex SHA-256 fingerprints and `MeshIdentityManager`'s base64url pod IDs for the same Ed25519 key. It is duck-typed, so the package depends on neither `@johnhenry/wsh` nor `core`, and nothing else in the package constructs it — it is there for consumers who keep both a `WshKeyStore` and a `MeshIdentityManager` in sync.

`MockMeshTransport` (from `transport.mjs`) and `MockRelayServer` (from `relay.mjs`) reach the public API through the package's wildcard re-exports (`export * from './transport.mjs'`, etc.) — there's no separate `/testing` subpath. Reach for them directly when writing tests against code that takes a transport; no extra install needed.

## Sync

```sh
npm install @johnhenry/browsermesh-sync @johnhenry/browsermesh-primitives
```

```js
import { MeshSyncEngine, MeshFileTransfer, CollabSession } from '@johnhenry/browsermesh-sync'
```

| Module | Key exports |
| --- | --- |
| sync | `SyncDocument`, `MeshSyncEngine`, `InMemorySyncStorage` |
| storage-indexeddb | `IndexedDBSyncStorage` — durable, drop-in `save`/`load`/`clear` for `MeshSyncEngine` |
| delta-sync | `SyncCoordinator`, `DeltaLog`, `DeltaEncoder`, `DeltaDecoder`, `DeltaBranch` |
| migration | `MigrationEngine`, `MigrationPlan`, `DualActiveWindow` |
| files | `MeshFileTransfer`, `ChunkStore`, `FileDescriptor`, `TransferOffer` |
| storage-indexeddb-chunks | `IndexedDBChunkStore` — durable counterpart to `ChunkStore`, same `save`/`get`/`has`/`verify`/`remove`/`computeCid` interface, byte-identical CIDs; backs `browsermesh-apps`'s `CloudStorage` and can be passed as the `chunkStore` of its [torrent service](/browsermesh/apps/#torrent-service-durable-stores-authorization-and-serve-limits) |
| collab | `CollabSession`, `YjsAdapter`, `AwarenessState` |
| collab-bridge | `CollabBridge`, `CollabManager` |
| memory-sync | `AgentMemorySync`, `MemoryEntry`, `ConflictEntry` |

`MigrationEngine` also has `wireTransport(broadcastFn, subscribeFn)`, fed by `apps`' `createPeerNodeTransport()`.

`YjsAdapter` doesn't bundle or fetch Yjs itself — its constructor takes an **injected** `Y` module (`new YjsAdapter(docId, { Y })`), meant to be loaded by the caller (its source comment documents the expected pattern: `import('https://cdn.jsdelivr.net/npm/yjs@13.6.30/+esm')` in a browser). **If you construct it without passing `Y`, it does not throw — it silently falls back to an internal stub doc** that mimics the shape of a Yjs document but has none of Yjs's actual CRDT merge guarantees. There's no dependency on `yjs` anywhere in `package.json` to tip you off; the only way to know you're on the stub path is that `#Y` was falsy at construction time. Always pass a real `Y` explicitly if you need real collaborative-merge semantics, and treat a missing one as a bug, not a graceful degradation. Separately, `collab.mjs`'s own header comment marks it `STATUS: EXPERIMENTAL — complete implementation, not yet integrated into main application` — worth knowing before depending on `CollabSession` for anything production-critical.

## Discovery

```sh
npm install @johnhenry/browsermesh-discovery @johnhenry/browsermesh-primitives
```

```js
import { DhtNode, DiscoveryManager, SwarmCoordinator } from '@johnhenry/browsermesh-discovery'
```

| Module | Key exports |
| --- | --- |
| dht | `DhtNode`, `RoutingTable`, `KBucket`, `GossipProtocol` |
| discovery | `DiscoveryManager`, `DiscoveryStrategy`, `ServiceDirectory`, `BroadcastChannelStrategy` |
| naming | `MeshNameResolver`, `NameRecord`, `parseMeshUri` |
| swarm | `SwarmCoordinator`, `LeaderElection`, `TaskDistributor`, `SwimMembership` |
| sw-routing | `MeshFetchRouter`, `parseMeshRequest` |
| stealth | `StealthAgent`, `ShardDistributor`, `ShardCollector` |

`BroadcastChannelStrategy` here and `browsermesh-pod`'s own built-in `BroadcastChannel` discovery (`browsermesh-pod`'s `discovery.mjs`/`transport.mjs`) are **separate implementations of the same idea, not shared code** — despite both packages depending on `primitives` and both talking to the same browser API, `discovery` doesn't import from `pod` or vice versa. Don't assume wiring up `DiscoveryManager` alongside a `Pod` dedupes discovery traffic or shares state; they're two independent same-origin announce/listen loops running side by side unless you explicitly bridge them. Reach for `discovery` when you need the DHT/naming/swarm layer beyond same-origin `BroadcastChannel` — that's genuinely new capability `Pod` doesn't have on its own.

`sw-routing`'s `MeshFetchRouter` sat with no real caller for a long time — its own module doc comment said so explicitly. `@johnhenry/browsermesh-apps`'s browsermesh serverless work finally gave it one (`createServerlessFetchRouter()`), and that first real use surfaced a genuine, previously-latent bug: `route()` always ran a non-string response body through `JSON.stringify()` before building the `Response`, silently mangling binary content (`Uint8Array`/`ArrayBuffer`) into a `{"0":..,"1":..}` object dump instead of real bytes. Fixed in `browsermesh-discovery@0.0.5` (and kept in 0.0.6, the current release) — binary bodies now pass straight to `new Response()`, which accepts `BufferSource` natively.

## Provenance

All four packages were extracted from the private `clawser` monorepo (previously `packages/browsermesh-<name>`), where each was manually `npm publish`ed once, unscoped, as `browsermesh-<name>@0.1.0` (2026-07-17), with no CI ever automating that publish. This is each package's first release as part of the `@johnhenry/browsermesh` monorepo; all four restart at version `0.0.0`.
