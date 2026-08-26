---
title: "Consensus"
description: "@johnhenry/raijin-consensus — the PBFT engine and ValidatorSet: quorum math, the message flow, view changes, and what is not verified."
---

**`@johnhenry/raijin-consensus`** implements a simplified PBFT: leader broadcasts PRE-PREPARE with a block, validators answer PREPARE then COMMIT, and finalization happens at `2f+1` commits, after which the block is applied to the injected `StateMachine`. Leader rotation is round-robin per view; view changes evict a stalled leader. Transport and time are injected interfaces, which is what makes the engine testable and browser-portable.

```sh
npm install @johnhenry/raijin-consensus
```

## The quorum trap — read before choosing n

`quorumSize()` returns `2f + 1` where `f = floor((n − 1) / 3)`:

| validators (n) | tolerated faults (f) | quorum |
| --- | --- | --- |
| 1 | 0 | 1 |
| 2 | 0 | **1** |
| 3 | 0 | **1** |
| 4 | 1 | 3 |
| 7 | 2 | 5 |

Below `n = 4` there is no fault tolerance at all, and — the part that bites — at n = 2 or 3 a *single* validator still meets quorum and can finalize blocks alone. A two-node "network" is two independent chains waiting to happen. Demos exploit this (one node finalizes instantly); production reasoning must start at n = 4.

Two more things the engine does **not** do:

- **No message authentication.** `#handleMessage` checks the claimed `from` is in the validator set — but `from` is whatever your transport says it is, and the signatures on COMMIT messages are collected into the block, never verified. If your transport doesn't authenticate peers, any peer can impersonate any validator.
- **No block building.** The leader's block timer is a no-op hook; something external must construct blocks and call `propose()` (in practice, `BlockProducer` from [`raijin-validator`](/raijin/validator/)).

## `PBFTConsensus`

```js
import { PBFTConsensus, ValidatorSet, PBFTPhase } from '@johnhenry/raijin-consensus'

const consensus = new PBFTConsensus({
  identity: myPublicKey,                       // Uint8Array(32)
  validators: new ValidatorSet([a, b, c, d]),  // same keys, same order, on every node
  transport,                                   // NetworkTransport
  timer: { set: (ms, cb) => setTimeout(cb, ms), clear: clearTimeout },
  stateMachine,                                // from @johnhenry/raijin-core
  sign: (msg) => wallet.sign(msg),
  blockTime: 2000,                             // ms, default 2000
  viewTimeout: 10000,                          // ms, default 10000
})

consensus.onBlockFinalized((block, receipts) => { /* applied to state already */ })
consensus.onViewChange((newView) => { /* leader rotated */ })
consensus.start()
if (consensus.isLeader) await consensus.propose(block)
```

| Member | Behavior |
| --- | --- |
| `start()` / `stop()` | Arm/clear timers; messages received while stopped are silently dropped. |
| `propose(block)` | **Throws** unless `isLeader` and `phase === Idle` — one round in flight at a time. Broadcasts PRE-PREPARE plus the leader's own PREPARE, increments `currentSequence`. |
| `onBlockFinalized(h)` | Fires after quorum COMMIT **and** `stateMachine.applyBlock()` — receipts included. |
| `onViewChange(h)` | Fires when a view change takes effect (locally). |
| `phase` | `PBFTPhase`: `Idle → PrePrepared → Prepared → Committed`, then reset to `Idle`. |
| `currentView` / `currentSequence` | `bigint`s; sequence follows the leader's on accepted PRE-PREPARE. |
| `isLeader` / `currentLeader` | Round-robin over the set: `leaderForView(view)`. |

Round mechanics worth knowing: a replica accepts PRE-PREPARE only from the exact leader of the message's view, and only if the view matches its own and the block digest recomputes; PREPARE/COMMIT counting is per-digest with each node's own vote included, so a single-validator round completes inside `propose()`'s promise chain with no transport traffic at all.

View changes: the view timer resets on any progress; on expiry a node broadcasts `view-change` for `view + 1`, and at `quorumSize()` accumulated view-change messages everyone rotates, dropping any in-flight round. The new leader's block timer starts; there is no proof-carrying NEW-VIEW re-proposal — an in-flight block at rotation time is simply abandoned for re-proposal later.

## `ValidatorSet`

| Member | Behavior |
| --- | --- |
| `new ValidatorSet(keys?)` | Ordered list of 32-byte public keys. Order is consensus-critical. |
| `add(k)` / `remove(k)` / `has(k)` | Membership; `add` rejects duplicates (`false`). |
| `leaderForView(view)` | `keys[view % n]`; throws on an empty set. |
| `quorumSize()` / `maxFaults` | The table above. |
| `size` / `all()` / `at(i)` | Inspection. |

Every node must build its set with the **same keys in the same order** — leader election is positional, so a different order means nodes disagree about who may propose and nothing finalizes. Membership changes at runtime are your problem to coordinate (the repo's test harness exercises churn scenarios).

## Types

`PBFTConfig`, `PBFTPhase`, `NetworkTransport` (`broadcast` / `send` / `onMessage`), `ConsensusTimer` + `TimerHandle` (inject a mock for deterministic tests — the repo's `MockTimer` advances time manually), and the message union `ConsensusMessage` = `PrePrepareMessage | PrepareMessage | CommitMessage | ViewChangeMessage | NewViewMessage`.

Serialization gotcha: consensus messages carry `bigint`s and `Uint8Array`s, so `JSON.stringify` alone will throw or mangle. If your transport is JSON-based you need a replacer/reviver pair — `packages/consensus/test/helpers.ts` in the repo has a working one.

Runnable: `npm run example:05` prints the quorum table and drives a complete single-validator round from `propose()` through finalization.
