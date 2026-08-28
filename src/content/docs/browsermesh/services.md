---
title: Core services
description: browsermesh-core (identity/keyring/trust), browsermesh-transport (adapters), browsermesh-sync (CRDT/delta sync), and browsermesh-discovery (DHT/naming/swarm) — the four packages browsermesh-apps builds on.
---

`core`, `transport`, `sync`, and `discovery` are the four services layer packages: identity and trust management, transport adapters, state synchronization, and peer discovery. All four depend only on `@johnhenry/browsermesh-primitives` — none depend on each other — and all four were extracted from the private `clawser` monorepo, manually published once with no CI, and never touched by automation until this consolidation.

Each has real prior-publish history but **no per-package README before this docs pass** — the API tables below are the first documented surface for any of them beyond source.

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
| streams | `MeshStream`, `StreamMultiplexer` |
| cross-origin | `CrossOriginBridge`, `CrossOriginHandshake`, `RateLimiter` |
| wsh-bridge | `MeshWshBridge` |
| wisp | `WispTransport` |
| channel-relay | `ChannelRelay` |

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
| delta-sync | `SyncCoordinator`, `DeltaLog`, `DeltaEncoder`, `DeltaDecoder`, `DeltaBranch` |
| migration | `MigrationEngine`, `MigrationPlan`, `DualActiveWindow` |
| files | `MeshFileTransfer`, `ChunkStore`, `FileDescriptor`, `TransferOffer` |
| collab | `CollabSession`, `YjsAdapter`, `AwarenessState` |
| collab-bridge | `CollabBridge`, `CollabManager` |
| memory-sync | `AgentMemorySync`, `MemoryEntry`, `ConflictEntry` |

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

## Provenance

All four packages were extracted from the private `clawser` monorepo (previously `packages/browsermesh-<name>`), where each was manually `npm publish`ed once, unscoped, as `browsermesh-<name>@0.1.0` (2026-07-17), with no CI ever automating that publish. This is each package's first release as part of the `@johnhenry/browsermesh` monorepo; all four restart at version `0.0.0`.
