---
title: Application layer
description: browsermesh-apps — marketplace, chat, payments, compute orchestration, and agent tools built on core, transport, sync, and discovery.
---

`@johnhenry/browsermesh-apps` is the top of the stack: marketplace, chat, payments, compute orchestration, consensus, and agent tooling, all built on the four services packages.

```sh
npm install @johnhenry/browsermesh-apps @johnhenry/browsermesh-primitives @johnhenry/browsermesh-core @johnhenry/browsermesh-transport @johnhenry/browsermesh-sync @johnhenry/browsermesh-discovery
```

All five other packages are **peer dependencies**, not bundled — `apps` declares zero regular `dependencies` in its manifest, only `peerDependencies` on all five. Skipping any one of them from the install command above leaves `apps` importable but broken at the first call that touches the missing package.

```js
import { MeshChat, AppRegistry, MeshOrchestrator } from '@johnhenry/browsermesh-apps'
```

### What's in here

`apps` is by far the largest package in the family — over 30 modules covering:

| Area | Key exports |
| --- | --- |
| App runtime | `AppRegistry`, `AppStore`, `AppRPC`, `AppEventBus` |
| Marketplace | `Marketplace`, `MarketplaceIndex`, `ServiceListing`, `SkillMarketplace` |
| Chat | `MeshChat`, `ChatRoom`, `ChatMessage`, `PeerChat` |
| Payments | `PaymentChannel`, `EscrowManager`, `CreditLedger`, `PaymentRouter` |
| Compute | `ResourceRegistry`, `ComputeRequest`, `JobQueue`, `TrainingOrchestrator`, `GpuProbe`, `FederatedCompute` |
| Coordination | `ConsensusManager`, `Proposal`, `Ballot`, `MeshScheduler`, `TaskQueue` |
| Orchestration | `MeshOrchestrator` + `meshctl` `BrowserTool` subclasses |
| Audit | `AuditChain`, `AuditStore`, `detectFork`, `buildMerkleRoot` |
| Peer services | `PeerNode`, `PeerRegistry`, `FileHost`/`FileClient`, `TerminalHost`/`TerminalClient`, `HealthMonitor`/`AutoMigrator`, `TimestampAuthority`, `TorrentManager`, `VerificationQuorum`, `IPFSStore` |
| Agents | `AgentHost`, `AgentClient`, `bridgePeerAgent`, `AgentSwarmCoordinator` |
| Observability | `MeshInspector`, `MeshInspectTool`, `TopologyLayout`, `TrustGraphLayout`, `TrustHeatmap` |

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
