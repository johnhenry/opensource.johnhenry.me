---
title: "Mempool"
description: "@johnhenry/raijin-mempool — fee-ordered transaction pooling: the fee-byte convention, eviction rules, dedup, events, and gossip."
---

**`@johnhenry/raijin-mempool`** is the fee-ordered transaction pool: verify on entry (injected verifier), deduplicate by sender+nonce, order by fee for block building, evict the cheapest when full, optionally gossip accepted transactions to peers.

```sh
npm install @johnhenry/raijin-mempool
```

## The fee convention collides with the tx-type byte

`defaultFeeExtractor` reads the **first 8 bytes of `tx.data` as a big-endian uint64** (shorter data ⇒ fee `0n`). But [`raijin-core`'s state machine](/raijin/core/) reads `tx.data[0]` as the *transaction type*. One `data` layout cannot satisfy both defaults: a `Transfer` (`data[0] = 0x01`) gets a fee ≥ 2⁵⁶ under the default extractor, and an 8-byte fee prefix gets misread as a transaction type. If your transactions carry typed data — and in raijin they do — **supply your own `FeeExtractor`**, e.g. `(tx) => tx.value` for tip-style fees. (An inline comment in older type builds claims the default *is* `tx.value`; it isn't.)

Two more rules that decide disputes:

- **Eviction requires strictly higher fee.** When the pool is full, an incoming tx displaces the current cheapest only if its fee is strictly greater; equal fee is dropped as `'pool-full'`. The displaced tx is announced as `'evicted'`.
- **No replace-by-fee.** Identity is sender+nonce, so a re-submission with the same nonce and a juicier fee is a `'duplicate'`, full stop.

And a scoping fact: `ValidatorNode` in [`raijin-validator`](/raijin/validator/) does **not** use this class — it ships its own FIFO `Mempool` under the same name. This package is standalone until you wire it in yourself.

## `Mempool`

```js
import { Mempool, defaultFeeExtractor } from '@johnhenry/raijin-mempool'

const pool = new Mempool({
  verifier: async (tx) => verifySignature(tx),   // required
  maxSize: 4096,                                 // default
  feeExtractor: (tx) => tx.value,                // recommended override (see above)
  gossip: { broadcast: (tx) => channel.send(tx) }, // optional
})

pool.onAccepted((tx) => {})
pool.onDropped((tx, reason) => {})  // 'duplicate' | 'invalid-signature' | 'pool-full' | 'evicted'

const ok = await pool.submit(tx)          // boolean; accepted txs are also gossiped
const block = pool.pendingForProposer(100) // top-100 by fee
```

| Member | Signature | Behavior |
| --- | --- | --- |
| `submit` | `(tx) → Promise<boolean>` | Pipeline: dedup → verify → (if full) evict-or-reject → accept → gossip. Never throws for a bad tx; watch `onDropped`. |
| `remove` / `removeBatch` | `(tx) → boolean` / `(txs) → number` | Delete by sender+nonce identity — call after block inclusion. |
| `pending` | `() → Transaction[]` | Fee-descending, nonce-ascending on equal fee. Fresh array each call. |
| `pendingForProposer` | `(limit?) → Transaction[]` | Same ordering, truncated. |
| `has` / `hasNonce` | `(tx)` / `(sender, nonce) → boolean` | Membership by sender+nonce. |
| `size` | getter | Current count. |
| `onAccepted` / `onDropped` | `(handler) → void` | Synchronous event fan-out; drop handler gets the reason string. |

Rejected transactions are never gossiped — the gossip hook only fires on acceptance, so a mesh of pools won't amplify spam that fails your verifier.

## `orderByFee(txs, feeExtractor)`

The pure sorting core, exported separately: fee descending, tie-break by nonce ascending, returns a new array. Useful when you have transactions from somewhere else (another node's gossip, a test fixture) and just need block ordering without pool semantics.

## `defaultFeeExtractor(tx)`

The 8-byte big-endian `data`-prefix rule described up top. Encoding a fee that way from your side:

```js
function encodeFee(fee) {          // bigint → Uint8Array(8), big-endian
  const b = new Uint8Array(8)
  for (let i = 7; i >= 0; i--) { b[i] = Number(fee & 0xffn); fee >>= 8n }
  return b
}
```

## Types

`MempoolConfig` (`{ verifier, maxSize?, feeExtractor?, gossip? }`), `FeeExtractor` (`(tx) => bigint`), `TransactionVerifier` (`(tx) => Promise<boolean>`), `GossipTransport` (`{ broadcast(tx) }`), `MempoolEvents`.

Runnable: `npm run example:03` walks the fee ordering, the strict-inequality eviction, and the duplicate rejection with assertions on each.
