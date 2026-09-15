---
title: Application layer
description: browsermesh-apps — marketplace, chat, payments, mesh-native storage, serverless sites/functions, compute orchestration, and agent tools built on core, transport, sync, and discovery.
---

`@johnhenry/browsermesh-apps` is the top of the stack: marketplace, chat, payments, a mesh-native object store and key-value store, `fetch()`/`WebSocket`-shaped mesh access, static-site and serverless-function hosting across peers, compute orchestration, consensus, and agent tooling — all built on the four services packages.

```sh
npm install @johnhenry/browsermesh-apps @johnhenry/browsermesh-primitives @johnhenry/browsermesh-transport @johnhenry/browsermesh-sync
```

`primitives`, `transport`, and `sync` are **required peer dependencies** — `apps` declares zero regular `dependencies`, only `peerDependencies`, and is broken at the first call that touches a missing one. `core`, `discovery`, `kernel`, `netway`, and `@johnhenry/andbox` are peer dependencies too, but marked **optional**: install them only if you use the specific functionality that needs them (identity/trust needs `core`; DHT discovery and the `mesh://` Service Worker router need `discovery`; `Kernel.caps.net` wiring needs `kernel`; the S3-like `CloudStorage` backend needs `netway`; the light-tier serverless function executor needs `andbox`, and is imported *lazily* inside that one executor, not at module load, so its absence never breaks anything else in the package).

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
| Peer services | `PeerNode`, `PeerRegistry`, `FileHost`/`FileClient`, `TerminalHost`/`TerminalClient`, `HealthMonitor`/`AutoMigrator`, `TimestampAuthority`, `TorrentManager`, `VerificationQuorum`, `IPFSStore` |
| Observability | `MeshInspector`, `MeshInspectTool`, `TopologyLayout`, `TrustGraphLayout`, `TrustHeatmap`, `observability-bridge` (live event feed from grants/replication/connections) |

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

### Two class names collide inside this package itself — and only one is reachable

`payments.mjs` and `peer-payments.mjs` both define a `CreditLedger` class. `payments.mjs` and `peer-escrow.mjs` both define an `EscrowManager` class. The package's `index.mjs` re-exports everything with `export * from './<module>.mjs'` — and when two wildcard re-exports collide on the same name, **the ambiguous binding is silently dropped by the JS module system**, not an error. The package's own index.mjs works around this with two explicit, named re-exports:

```js
// from browsermesh-apps/src/index.mjs
export { CreditLedger } from './payments.mjs';
export { EscrowManager } from './peer-escrow.mjs';
```

So `import { CreditLedger } from '@johnhenry/browsermesh-apps'` always gets you `payments.mjs`'s mesh-level ledger, and `import { EscrowManager } from ...` always gets you `peer-escrow.mjs`'s opts-based manager — never the sibling classes of the same name from `peer-payments.mjs`/`payments.mjs`. Those siblings are not a secondary export you can reach another way: `package.json`'s `exports` map only lists `"."` and `"./compat"`, so there is **no subpath import** (`@johnhenry/browsermesh-apps/peer-payments` fails — Node's exports-map encapsulation blocks any path not explicitly listed). If your use case genuinely needs `peer-payments.mjs`'s `CreditLedger` or `payments.mjs`'s `EscrowManager`, the public package doesn't expose it; you'd need to fork or vendor that file.

### Provenance

Extracted from the private `clawser` monorepo (previously `packages/browsermesh-apps`), manually published, unscoped, as `browsermesh-apps@0.1.0` (2026-07-17), with no CI ever automating that publish. First release as `@johnhenry/browsermesh-apps`; version restarts at `0.0.0`.
