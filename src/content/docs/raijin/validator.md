---
title: "Validator"
description: "@johnhenry/raijin-validator — ValidatorNode composition root, BlockProducer, and the FIFO Mempool that is not raijin-mempool."
---

**`@johnhenry/raijin-validator`** is the composition root: `ValidatorNode` wires a `StateMachine`, a `PBFTConsensus`, a FIFO `Mempool`, and a `BlockProducer` into the running loop — accept transactions, build a block on the timer when leader, propose, finalize, apply state, prune the mempool. You inject identity, transport, timer, and storage; this package supplies the glue and nothing else.

```sh
npm install @johnhenry/raijin-validator
```

## Traps first

- **This `Mempool` is not `@johnhenry/raijin-mempool`.** Same class name, different animal: FIFO order (no fee ordering), **no signature verification**, and `add()` **throws** `'Mempool full'` instead of evicting. The fee-ordered pool is a separate, unintegrated package — comparison table below.
- **`submitTransaction()` accepts garbage.** Nothing is validated at submission; bad signatures, wrong nonces, and overspends surface later as `revert` receipts in the finalized block — after consuming mempool and block space. Pre-validate at your API edge if that matters.
- **`validators` must include this node's own public key.** Forget it and `isLeader` is never true; with a single node that means zero blocks, silently — the block-production loop swallows errors by design.
- **Headers don't commit to state.** `BlockProducer` computes a real `txRoot` but leaves `stateRoot`/`receiptRoot` zeroed, and `advance()` reuses the previous header's (zeroed) `stateRoot` as `parentHash`. Consensus agrees on transaction ordering; state agreement is by deterministic re-execution, not header commitment. See [Architecture](/raijin/architecture/).
- **Quorum below 4 validators is 1** ([Consensus](/raijin/consensus/)) — a lone node happily finalizes its own blocks, which is exactly what makes the quick start below work and exactly what you must not mistake for fault tolerance.

## `ValidatorNode`

```js
import { InMemoryStateStore } from '@johnhenry/raijin-core'
import { ValidatorNode } from '@johnhenry/raijin-validator'

const node = new ValidatorNode({
  identity: { publicKey, sign, verify },  // verify checks *transaction* signatures
  transport,                              // NetworkTransport; no-ops for a single node
  timer: { set: (ms, cb) => setTimeout(cb, ms), clear: clearTimeout },
  store: new InMemoryStateStore(),
  validators: [publicKey /* , peers… */], // same order on every node
  blockTime: 2000,                        // default
  maxTxPerBlock: 100,                     // default
  maxMempoolSize: 4096,                   // default
})

node.onBlockFinalized((block, receipts) => {})
node.start()
const txHashHex = await node.submitTransaction(signedTx)
```

| Member | Signature | Behavior |
| --- | --- | --- |
| `start()` / `stop()` | `() → void` | Idempotent; starts consensus and the block-production timer loop, stops both and clears timers. |
| `submitTransaction` | `(tx) → Promise<string>` | FIFO-enqueues; resolves to the hex of `hash(encodeTxSigned(tx))`. Throws only when the mempool is full. |
| `onBlockFinalized` | `(handler) → void` | `(block, receipts)` after every finalized block, post state-application and mempool pruning. |
| `latestBlock` | getter | Most recent finalized `Block` or `null`. |
| `running` | getter | Boolean. |
| `consensus` / `mempool` / `stateMachine` / `blockProducer` | getters | The wired internals, exposed on purpose — e.g. `node.stateMachine.getAccount(addr)` for queries, `node.blockProducer.produceBlock()` to force production in tests. |

The production loop: every `blockTime` the node calls `produceBlock()` and *swallows any error* — not being leader and an empty mempool are normal, so the loop stays quiet. When you need the failure, call `node.blockProducer.produceBlock()` yourself.

## `BlockProducer`

Config: `{ proposer, consensus, mempool, maxTxPerBlock? }`.

- `produceBlock(): Promise<Block | null>` — `null` if not leader or mempool empty; otherwise pulls up to `maxTxPerBlock` transactions, Merkle-roots `hash(encodeTxSigned(tx))` per tx into `txRoot`, stamps `timestamp: Date.now()`, and hands the block to `consensus.propose()`. Remember `propose()` throws if a round is already in flight.
- `advance(block): void` — post-finalization bookkeeping: `nextBlockNumber = number + 1`, parent linkage carried forward. `ValidatorNode` calls this for you.
- `nextBlockNumber: bigint` — starts at `1n`.

## `Mempool` (the FIFO one)

`new Mempool(maxSize = 4096)`:

- `add(tx): Promise<string>` — throws `'Mempool full'` at capacity; returns tx-hash hex. Keyed by hash of the *signed* encoding, so an identical signed tx submitted twice occupies one slot (and a re-signed variant occupies a second — no sender+nonce dedup here).
- `pending(limit?)` — insertion order. `remove(hashHex)`, `removeBatch(txs)`, `clear()`, `size`.

### Which mempool am I holding?

| | this package's `Mempool` | [`@johnhenry/raijin-mempool`](/raijin/mempool/) |
| --- | --- | --- |
| Ordering | FIFO | fee-descending |
| Verifies signatures | no | yes (injected) |
| Full-pool behavior | throws | evict lowest / reject |
| Dedup key | signed-tx hash | sender+nonce |
| Used by `ValidatorNode` | **yes** | no |

Runnable: `npm run example:06` is the full lifecycle — genesis funding, start, submit, timer-driven production, finalization, pruning, clean stop — with assertions at each step.
