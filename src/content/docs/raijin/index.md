---
title: "raijin"
description: "Browser-native mesh rollup framework — PBFT consensus, state machine, mempool, and data availability as six composable TypeScript packages."
---

**`@johnhenry/raijin-*`** is a browser-native mesh rollup framework: six small TypeScript packages that compose into an L2 where the users visiting your web app *are* the validators. A deterministic state machine, a simplified PBFT consensus engine with leader rotation, a fee-ordered mempool, a pluggable data-availability layer, a validator composition root, and a client SDK — all transport-agnostic, storage-agnostic, and identity-agnostic (you inject signing, storage, and networking; the framework never touches WebRTC or IndexedDB itself). Zero runtime dependencies; runs in browsers and Node.

> Previously published unscoped, with a quirky version history: the initial
> release (2026-03) was tagged `v0.1.0` as a project but published each
> package at `0.0.1`; five packages (`raijin-consensus`, `raijin-mempool`,
> `raijin-da`, `raijin-validator`, `raijin-sdk`) then went `0.0.2` (broken
> tarballs — a `workspace:*` publish bug) → `0.0.3` the same day, while
> `raijin-core`, with no internal dependency to leak, stayed at `0.0.1`.
> The scoped `@johnhenry/raijin-*` packages restart at `0.0.0` — a new
> address and era, not a maturity signal.

## What this is not

Read this before anything else, because the name "rollup" over-promises:

- **Not a production blockchain.** This is experimental consensus research. Nothing here is audited, and load-bearing shortcuts remain: `chainId` is carried in every signed transaction but not enforced by the state machine itself. (Two shortcuts that used to be documented here — unverified commit signatures, and zeroed `stateRoot`/`receiptRoot` on the *finalized* header — have since been fixed; see [Consensus](/raijin/consensus/). The *pre-execution proposal* a leader broadcasts still carries zeroed roots, since neither can be known before the block runs — only the post-execution header nodes actually chain to has the real values.)
- **Not Byzantine-fault-tolerant below 4 validators.** Quorum is `quorumSize() = n − f` with `f = floor((n-1)/3)` — below n = 4 there's no fault *tolerance*, though (unlike an earlier version of this page) quorum at n = 2 or 3 now requires every validator, not a single one. See [Consensus](/raijin/consensus/).
- **Not a settlement layer.** There's no bridge, no fraud/validity proofs, no sequencer escape hatch. The DA layer posts bytes and verifies content hashes — it does not prove inclusion.
- **Not batteries-included networking.** There is no transport in the box. Every consensus and gossip interface takes an object you implement over WebRTC, WebSockets, or anything else.

## Install

Install only what you need — packages are independent, all depending only on `raijin-core`:

```sh
npm install @johnhenry/raijin-sdk @johnhenry/raijin-validator
```

## Quick start

A one-validator chain in one process (quorum of 1 finalizes instantly):

```js
import { InMemoryStateStore } from '@johnhenry/raijin-core'
import { ValidatorNode } from '@johnhenry/raijin-validator'

const node = new ValidatorNode({
  identity: { publicKey, sign, verify },  // your keys — see Getting started
  transport: { broadcast() {}, send() {}, onMessage() {} },
  timer: { set: (ms, cb) => setTimeout(cb, ms), clear: clearTimeout },
  store: new InMemoryStateStore(),
  validators: [publicKey],                // must include self
})
node.onBlockFinalized((block, receipts) => console.log(block.header.number, receipts))
node.start()
await node.submitTransaction(signedTx)
```

The runnable version, with real Ed25519 keys and genesis funding, is [Getting started](/raijin/getting-started/).

## Which package do I want?

| You want to… | Package | Docs |
| --- | --- | --- |
| Build/sign transactions, query a chain | `@johnhenry/raijin-sdk` | [Getting started](/raijin/getting-started/) |
| Run a validator (the usual entry point) | `@johnhenry/raijin-validator` | [Validator](/raijin/validator/) |
| Use the state machine, hashing, or types directly | `@johnhenry/raijin-core` | [Core](/raijin/core/) |
| Drive PBFT yourself over your own transport | `@johnhenry/raijin-consensus` | [Consensus](/raijin/consensus/) |
| Fee-ordered transaction pooling with gossip | `@johnhenry/raijin-mempool` | [Mempool](/raijin/mempool/) |
| Post block data to a DA layer (local/Celestia) | `@johnhenry/raijin-da` | [Data availability](/raijin/da/) |

A seventh workspace package, `raijin-test-harness`, is internal multi-node test infrastructure and is deliberately unpublished — see [Architecture](/raijin/architecture/).

## The pages here

- [Architecture](/raijin/architecture/) — how the six packages compose, the block lifecycle from tx submission through the PBFT phases to state commitment, and where DA actually sits (spoiler: not yet in the hot path)
- [Getting started](/raijin/getting-started/) — the smallest working node, driven through `@johnhenry/raijin-sdk`; doubles as the SDK API reference (`Wallet`, `RaijinClient`, `ClientTransport`)
- [Core](/raijin/core/) — state machine, transaction/block types, hashing, canonical encoding
- [Consensus](/raijin/consensus/) — `PBFTConsensus` and `ValidatorSet`, quorum math first
- [Mempool](/raijin/mempool/) — fee ordering, eviction rules, and the fee-byte convention that collides with the tx-type byte
- [Data availability](/raijin/da/) — `DALayer`, what commitments prove, `LocalDA`/`CelestiaDA`, and the `EthBlobDA` stub
- [Validator](/raijin/validator/) — `ValidatorNode`, `BlockProducer`, and the *other* `Mempool`

## Status

Experimental consensus research, unaudited, versioned pre-1.0 (`0.0.1`–`0.0.2` across the six packages — no longer `0.0.0`; `raijin-consensus`/`-da`/`-validator` have each shipped a real fix since). What's real: 258 deterministic tests across the six packages, [seven runnable single-node examples](https://github.com/johnhenry/raijin/tree/main/examples) smoke-tested in CI, and a multi-node scenario harness (partitions, leader crashes, churn) that runs in-repo.

Two things that used to be on the "not implemented" list are now real, verified against the packages' own READMEs, not assumed: **every PBFT vote is signature-verified** — PRE-PREPARE, PREPARE, COMMIT, and VIEW-CHANGE are all checked against a required, injected `verify` (there is no unverified mode), scoped to chain/epoch/view/sequence so a signature is never reusable outside the exact round it was cast for — and **block headers carry a real, computed `stateRoot`/`receiptRoot`**, filled in by PBFT after the block actually runs (the pre-execution proposal that nodes vote on leaves them zeroed; the post-execution header is what the chain links to). View changes now block a new leader from proposing a *conflicting* block at a sequence that already reached a PREPARE quorum — but full prepared-certificate carry-over (auto-re-proposing what was already prepared, rather than just blocking conflicts) is still tracked as follow-up work, not shipped.

What's still not: full prepared-certificate carry-over on view change (see above), any persistence (`InMemoryStateStore` is still the only `StateStore`) or transport implementation (WebRTC/WebSocket adapters are the caller's job — transport and timers are injected, never shipped), and `EthBlobDA` (still a documented stub that throws with implementation instructions).

Source: [github.com/johnhenry/raijin](https://github.com/johnhenry/raijin)
