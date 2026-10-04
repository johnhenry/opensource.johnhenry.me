---
title: "Core"
description: "@johnhenry/raijin-core — the state machine, transaction/block types, SHA-256 + Merkle hashing, and canonical binary encoding."
---

**`@johnhenry/raijin-core`** is the bottom of the dependency graph: types (`Transaction`, `Block`, `Account`, receipts), the deterministic state transition function (`StateMachine`), a reference `StateStore` (`InMemoryStateStore`), SHA-256/Merkle hashing, and the canonical binary encoding that signatures and hashes are computed over. Zero dependencies; only `globalThis.crypto.subtle`.

```sh
npm install @johnhenry/raijin-core
```

## Traps first

- **Everything that hashes is async** — `crypto.subtle` forces it. `hash`, `merkleRoot`, `stateRoot`, `applyTransaction` all return promises; there is no sync path.
- **`tx.data[0]` is the transaction type.** Empty `data` defaults to `Transfer` (0x01). Of the 15 `TransactionType` values, only `Transfer` and `ReputationAttest` (0x02) execute real logic — the other 13 are placeholders that just increment the sender's nonce and report success. Don't build on `EscrowCreate` expecting escrow.
- **Reverts are receipts, not exceptions.** Bad signature, wrong nonce, insufficient balance — all come back as `{ status: 'revert', revertReason }`. A reverted transaction leaves state untouched (executors check preconditions before any write) and does **not** consume the sender's nonce.
- **`applyBlock` has no block-level atomicity.** Reverted transactions stay in the block alongside their receipts; the rest of the block proceeds. Don't assume all-or-nothing.
- **`InMemoryStateStore.root()` is a flat hash of sorted entries, not a Merkle trie.** Perfect for "do two nodes agree" equality checks; useless for inclusion proofs.
- **`merkleRoot` has no domain separation** and duplicates the last leaf at odd levels; a single leaf is returned as-is, unhashed. Fine for its use here; don't reuse it where second-preimage tricks matter.

## `StateMachine`

```js
import { StateMachine, InMemoryStateStore } from '@johnhenry/raijin-core'

const sm = new StateMachine(new InMemoryStateStore(), verifier) // verifier: { verify(msg, sig, pubkey) }

const receipt = await sm.applyTransaction(signedTx, 0)
// { txHash, status: 'success' | 'revert', revertReason?, index }
```

Per transaction: verify signature over `encodeTx(tx)` → check `tx.nonce` equals the sender account's nonce → dispatch on `tx.data[0]` → write accounts. `Transfer` debits/credits `value`; `ReputationAttest` moves one reputation point from sender to target (you must have reputation to give it).

| Method | Signature | Notes |
| --- | --- | --- |
| `applyTransaction` | `(tx, index) → Promise<TransactionReceipt>` | The receipt's `txHash` is `hash(encodeTx(tx))` — unsigned encoding. |
| `applyBlock` | `(block) → Promise<TransactionReceipt[]>` | Sequential `applyTransaction` over `block.transactions`. |
| `getAccount` | `(address) → Promise<Account>` | Unknown address ⇒ `{ balance: 0n, nonce: 0n, reputation: 0n }`. |
| `stateRoot` | `() → Promise<Uint8Array>` | Delegates to `store.root()`. |

Genesis funding is a raw store write under the `'account:'` namespace — see the fence in [Getting started](/raijin/getting-started/) or `examples/02-state-machine.mjs`.

## Types and interfaces

| Export | Shape / role |
| --- | --- |
| `Transaction` | `{ from, nonce, to, value, data, signature, chainId }` — keys are 32-byte `Uint8Array`s, amounts `bigint`; `to: null` for system ops |
| `Block` / `BlockHeader` | header: `{ number, parentHash, stateRoot, txRoot, receiptRoot, timestamp, proposer }` + `transactions`, `signatures` |
| `Account` | `{ balance, nonce, reputation }`, all `bigint` |
| `TransactionReceipt` | `{ txHash, status, revertReason?, index }` |
| `TransactionType` | enum `0x01`–`0x0f`; see trap above |
| `StateStore` | `get/put/delete/root/snapshot/revert` — implement over IndexedDB/OPFS for persistence |
| `StateSnapshot` | `{ id: number }`, from `store.snapshot()` |
| `SignatureVerifier` | `{ verify(message, signature, publicKey): Promise<boolean> }` |
| `TransactionSigner` | `{ publicKey, sign(message) }` — `Wallet` in the SDK implements this |

`InMemoryStateStore` implements `StateStore` over a `Map` with working `snapshot()`/`revert()` (revert also discards later snapshots) and a `size` getter. It's the right choice for tests and demos, and explicitly not for real state.

## Hashing

```js
import { hash, hashString, merkleRoot, equal, toHex, fromHex } from '@johnhenry/raijin-core'

const root = await merkleRoot([await hashString('tx-a'), await hashString('tx-b')])
equal(fromHex(toHex(root)), root) // true
```

`hash`/`hashString` are SHA-256 (32 bytes). `merkleRoot([])` is `hash(empty)`; leaf order changes the root. `equal` is byte-wise (not constant-time); `toHex`/`fromHex` are lowercase-hex round-trips.

## Canonical encoding

The encoding module is why signatures and hashes are stable across nodes: LEB128 varints for `bigint`s, length-prefixed byte arrays, fixed field order.

| Function | Purpose |
| --- | --- |
| `encodeTx(tx)` | Everything **except** the signature — the exact bytes wallets sign and receipts hash |
| `encodeTxSigned(tx)` | `encodeTx` + signature — what block producers hash into `txRoot` |
| `encodeAccount` / `decodeAccount` | Account ↔ bytes, used for state storage |
| `encodeBigInt` / `decodeBigInt` | LEB128; decoder returns `[value, bytesConsumed]` |
| `encodeBytes` / `decodeBytes` | Length-prefixed; same pair-return convention |

Note the two tx hashes in play: receipts use `hash(encodeTx(tx))`, the validator's FIFO mempool and `txRoot` use `hash(encodeTxSigned(tx))`. Match against the right one.

## Errors

`RaijinError` (base), `InvalidTransactionError`, `InvalidBlockError`, `StateError`, `InsufficientBalanceError`. These are for out-of-band failures — the state machine's normal failure channel is revert receipts, so don't wrap `applyTransaction` in try/catch expecting these.

Runnable: `npm run example:01` (hashing/Merkle) and `npm run example:02` (state machine + reverts) in the repo.
