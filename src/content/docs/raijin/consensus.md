---
title: "Consensus"
description: "@johnhenry/raijin-consensus — the PBFT engine and ValidatorSet: quorum math, the message flow, view changes, and what is not verified."
---

**`@johnhenry/raijin-consensus`** implements a simplified PBFT: leader broadcasts PRE-PREPARE with a block, validators answer PREPARE then COMMIT, and finalization happens at `quorumSize()` commits, after which the block is applied to the injected `StateMachine`. Leader rotation is round-robin per view; view changes evict a stalled leader. Transport and time are injected interfaces, which is what makes the engine testable and browser-portable. Every vote the engine acts on is now signature-verified against a required, injected `verify` — see "What's authenticated" below before assuming otherwise.

```sh
npm install @johnhenry/raijin-consensus
```

## The quorum math — read before choosing n

`quorumSize()` returns `n − f` where `f = floor((n − 1) / 3)` — **not** the `2f + 1` this page used to claim; that formula agreed with `n − f` by coincidence at some validator counts and silently diverged at others:

| validators (n) | tolerated faults (f) | quorum (`n − f`) |
| --- | --- | --- |
| 1 | 0 | 1 |
| 2 | 0 | 2 |
| 3 | 0 | 3 |
| 4 | 1 | 3 |
| 5 | 1 | 4 |
| 6 | 1 | 5 |
| 7 | 2 | 5 |

Below `n = 4` there is still no fault *tolerance* at all — one dishonest or offline validator among 1–3 stalls the chain — but with the real `n − f` formula, quorum at `n = 2` or `n = 3` requires *every* validator, not a single one: there's no "a lone validator finalizes blocks alone" trap at those counts. Production reasoning should still start at `n = 4`, for tolerance rather than for this specific exploit.

## What's authenticated, and what's still yours

The engine used to collect vote signatures without checking them. It doesn't any more: every PRE-PREPARE, PREPARE, COMMIT, and VIEW-CHANGE it acts on is checked against the required, injected `verify` (`SignatureVerifier`) — a message that fails is dropped before it reaches any counter, and there is no unverified mode to fall back into. Each signature is scoped to `{phase, chainId, epoch, view, sequence, digest}` via `voteDigest()`, so it authorizes exactly one phase, of one round, at one sequence, on one chain, under one exact validator set — a vote cast before a membership change stops counting toward the quorum of the set that removed the signer.

Still yours: **delivery** (the engine never retries or orders messages — a lost PREPARE just times out into a view change); **the membership list itself** (the engine faithfully authenticates a vote from any validator you put in the `ValidatorSet`, sybil resistance is your problem); **confidentiality and DoS** (nothing here is encrypted, and verification happens per message, so an unauthenticated peer that can reach `onMessage` can still make you do work); and **no block building** (the leader's block timer is a no-op hook; something external must construct blocks and call `propose()` — in practice, `BlockProducer` from [`raijin-validator`](/raijin/validator/)).

## `PBFTConsensus`

```js
import { ed25519Verifier } from '@johnhenry/raijin-core'
import { PBFTConsensus, ValidatorSet, PBFTPhase } from '@johnhenry/raijin-consensus'

const consensus = new PBFTConsensus({
  identity: myPublicKey,                       // Uint8Array(32)
  chainId: 42n,                                // required, no default -- scopes every signature
  validators: new ValidatorSet([a, b, c, d]),  // same keys, same order, on every node
  transport,                                   // NetworkTransport
  timer: { set: (ms, cb) => setTimeout(cb, ms), clear: clearTimeout },
  stateMachine,                                // from @johnhenry/raijin-core
  sign: (msg) => wallet.sign(msg),
  verify: ed25519Verifier,                     // required -- every vote is checked with this
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

View changes: the view timer resets on any progress; on expiry a node broadcasts `view-change` for `view + 1`, and once `quorumSize()` validly-signed view-change messages from *distinct* senders accumulate, everyone rotates and the new leader takes over. A view change only ever moves forward — a message for a view at or below the current one is dropped, so a replayed quorum can't rewind a node. Carry-over across the rotation is **partial**: a new leader is blocked from proposing a *conflicting* block at a sequence that already reached a PREPARE quorum, but the original block isn't automatically re-proposed for you — full prepared-certificate carry-over (auto-re-proposing what was already prepared) is tracked as follow-up work in the repo, not shipped yet.

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
