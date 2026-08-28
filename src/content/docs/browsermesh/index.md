---
title: browsermesh
description: Peer-to-peer mesh networking for browser environments — cryptographic identity, CRDTs, virtual sockets, transport, sync, discovery, and a capability-secure microkernel across ten packages.
---

browsermesh is peer-to-peer mesh networking for browser environments: cryptographic identity (Ed25519), CRDTs for state that merges instead of conflicting, capability-based trust and access control, a BSD-socket-style virtual network, and the higher-level building blocks — transport, sync, discovery, and an application runtime — that sit on top.

```sh
npm install @johnhenry/browsermesh-primitives
```

That single install gets you identity, wire format, CRDTs, capabilities, trust, and ACLs with **zero dependencies**. Everything else in the family builds on it.

## Why ten packages under one scope

This isn't ten libraries that happened to end up together — it's one family, consolidated. Three packages (`primitives`, `netway`, `pod`) were already real, independent, publicly-published repos. The other seven (`core`, `transport`, `sync`, `discovery`, `apps`, `kernel`, `embed`) were extracted from a private monorepo (`clawser`), where they'd been manually `npm publish`ed once each, unscoped, with no CI ever touching them again. All ten now live in one `johnhenry/browsermesh` monorepo (npm workspaces + Turborepo), publish under `@johnhenry/browsermesh-*`, and restart at version `0.0.0` — a new address, a new era, not a maturity signal. `browsermesh-embed` also carries a **rename**: it was `clawser-embed` before extraction, renamed specifically so a public package wouldn't carry the name of a private product. Its README still exports `ClawserEmbed` as a backward-compatible alias of `EmbeddedPod` — that's why the name survives inside the code even though it's gone from the package name.

## The ten packages

| Package | What it does | Depends on |
| --- | --- | --- |
| [`@johnhenry/browsermesh-primitives`](/browsermesh/primitives/) | Wire format, Ed25519 identity, CRDTs, capabilities, trust, ACL | *(nothing)* |
| [`@johnhenry/browsermesh-netway`](/browsermesh/primitives/) | BSD-socket-style virtual networking (streams, datagrams, DNS, policy) | *(nothing)* |
| [`@johnhenry/browsermesh-pod`](/browsermesh/pod/) | Pod base class: identity, discovery, peer messaging for any execution context | primitives |
| [`@johnhenry/browsermesh-embed`](/browsermesh/pod/) | Thin widget embedding a Pod-backed agent workspace into any web page | pod |
| [`@johnhenry/browsermesh-core`](/browsermesh/services/) | Identity, crypto, peer management, and trust layer | primitives |
| [`@johnhenry/browsermesh-transport`](/browsermesh/services/) | WebSocket/WebRTC/WebTransport adapters, stream multiplexing | primitives |
| [`@johnhenry/browsermesh-sync`](/browsermesh/services/) | CRDT/delta sync, file transfer, real-time collaboration | primitives |
| [`@johnhenry/browsermesh-discovery`](/browsermesh/services/) | DHT, peer discovery, naming, swarm coordination | primitives |
| [`@johnhenry/browsermesh-apps`](/browsermesh/apps/) | Application layer: marketplace, chat, payments, compute, orchestration, agent tools | core, transport, sync, discovery, primitives |
| [`@johnhenry/browsermesh-kernel`](/browsermesh/kernel/) | Capability-secure browser microkernel: resource handles, IPC, tracing, chaos engineering | *(nothing)* |

Two packages are genuinely standalone: `primitives` and `kernel` ship zero npm dependencies each, including zero dependencies on each other. Everything else in the mesh/app stack depends on `primitives`, directly or transitively — the kernel is a deliberately separate concern (a browser microkernel, not a mesh peer).

## Cross-package dependencies are peer dependencies with an unbounded range

Every package that depends on another package in this family (`pod` on `primitives`; `core`/`transport`/`sync`/`discovery` on `primitives`; `apps` on all four of those plus `primitives`; `embed` on `pod`) declares it as a **`peerDependencies`** entry with range `>=0.0.0` — not a regular `dependencies` entry, and not the pinned `^0.0.0` you'd expect from the family's usual pre-1.0-caret convention. Two consequences: (1) installing a package that has peers does **not** pull them in automatically — see each page's own install command, which always lists every peer explicitly; and (2) because the range is `>=0.0.0` rather than `^0.0.0`, npm will not warn you if your installed peer is a much later major than the dependent package was built against — there's no upper bound to violate. Match versions deliberately across the family rather than relying on npm to catch a drift.

Every package also declares `"engines": { "node": ">=24.0.0" }` — a hard floor, not a suggestion; nothing in this family is tested against, or expected to work on, earlier Node majors.

## The pages here

- [Primitives & networking](/browsermesh/primitives/) — wire format, identity, CRDTs, capabilities, trust, ACL, and the virtual BSD-socket network built without depending on anything
- [Pod & embed](/browsermesh/pod/) — the execution-context base class (window, iframe, worker, service worker) and the widget that embeds an agent workspace on top of it
- [Core services](/browsermesh/services/) — identity/keyring/trust (`core`), transport adapters (`transport`), CRDT/delta sync (`sync`), and DHT/discovery (`discovery`)
- [Application layer](/browsermesh/apps/) — marketplace, chat, payments, compute orchestration, and agent tooling built on the four services above
- [Kernel](/browsermesh/kernel/) — the standalone capability-secure microkernel, unrelated to mesh networking except by shared origin

Source: [github.com/johnhenry/browsermesh](https://github.com/johnhenry/browsermesh)
