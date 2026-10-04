---
title: "Getting started"
description: "The smallest working raijin node, driven through @johnhenry/raijin-sdk — Wallet, RaijinClient, and ClientTransport."
---

The smallest real thing you can build is a one-validator chain in a single process, driven through the SDK. It's genuinely end-to-end — real Ed25519 keys, real signature verification, real consensus (with a quorum of 1) — and it runs in Node ≥ 24 or any modern browser. This page is also the `@johnhenry/raijin-sdk` API reference; the package exports exactly four names: `Wallet`, `RaijinClient`, `ClientTransport`, `BuildTxOptions`.

```sh
npm install @johnhenry/raijin-sdk @johnhenry/raijin-validator @johnhenry/raijin-core
```

## 1. Keys and signature verification

`Wallet` wraps Web Crypto Ed25519. Verification isn't built in anywhere — you inject a `SignatureVerifier` into the node:

```js
import { Wallet } from '@johnhenry/raijin-sdk'

const validatorWallet = await Wallet.generate()
const userWallet = await Wallet.generate()   // publicKey (32 bytes) is the address

const ed25519Verifier = {
  async verify(message, signature, publicKey) {
    const key = await crypto.subtle.importKey(
      'raw', publicKey, { name: 'Ed25519' }, false, ['verify'])
    return crypto.subtle.verify({ name: 'Ed25519' }, key, signature, message)
  },
}
```

## 2. A node with a funded genesis account

Accounts live in the injected `StateStore` under `'account:' + publicKey` keys — genesis funding is just a store write before the node starts:

```js
import { InMemoryStateStore, encodeAccount } from '@johnhenry/raijin-core'
import { ValidatorNode } from '@johnhenry/raijin-validator'

const store = new InMemoryStateStore()
const prefix = new TextEncoder().encode('account:')
await store.put(
  new Uint8Array([...prefix, ...userWallet.publicKey]),
  encodeAccount({ balance: 1_000n, nonce: 0n, reputation: 0n }),
)

const node = new ValidatorNode({
  identity: {
    publicKey: validatorWallet.publicKey,
    sign: (msg) => validatorWallet.sign(msg),
    verify: ed25519Verifier,
  },
  transport: { broadcast() {}, send() {}, onMessage() {} }, // single node: no peers
  timer: { set: (ms, cb) => setTimeout(cb, ms), clear: clearTimeout },
  store,
  validators: [validatorWallet.publicKey], // must include self, or nothing finalizes
  blockTime: 500,
})
node.start()
```

With one validator, quorum is 1: every `blockTime` tick the node drains its mempool, proposes, and finalizes its own block immediately.

## 3. A transport, then the client

`RaijinClient` talks through a `ClientTransport` you implement — that's the network boundary. In-process it's a few lines; over HTTP or WebRTC it's the same four methods:

```js
import { RaijinClient } from '@johnhenry/raijin-sdk'
import { hash, encodeTx, equal } from '@johnhenry/raijin-core'

const transport = {
  async submitTransaction(tx) {
    const want = await hash(encodeTx(tx))     // receipts hash the unsigned encoding
    const receipt = new Promise((resolve) =>
      node.onBlockFinalized((_b, receipts) => {
        const r = receipts.find((r) => equal(r.txHash, want))
        if (r) resolve(r)
      }))
    await node.submitTransaction(tx)
    return receipt
  },
  getAccount: (addr) => node.stateMachine.getAccount(addr),
  async getBlock(n) {
    return node.latestBlock?.header.number === n ? node.latestBlock : null
  },
  onBlock(handler) { node.onBlockFinalized((b) => handler(b)); return () => {} },
}

const client = new RaijinClient(transport)
```

## 4. Send a transaction

```js
const account = await client.getAccount(userWallet.publicKey)

const tx = await userWallet.buildTx({
  to: merchantPublicKey,   // Uint8Array(32) — or null for system ops
  value: 250n,
  nonce: account.nonce,    // nonce management is yours; wrong nonce ⇒ revert receipt
})

const receipt = await client.submitTransaction(tx)
receipt.status // 'success' — or 'revert' with receipt.revertReason
```

The complete runnable script — including subscribing to blocks and demonstrating that a post-signing mutation produces an `'invalid signature'` revert — is [`examples/07-sdk-end-to-end.mjs`](https://github.com/johnhenry/raijin/blob/main/examples/07-sdk-end-to-end.mjs) in the repo (`npm run example:07`).

## SDK API reference

### `Wallet` — key management and tx building

| Member | Signature | Notes |
| --- | --- | --- |
| `Wallet.generate()` | `→ Promise<Wallet>` | New Ed25519 keypair. Throws where Web Crypto lacks Ed25519 (pre-20 Node, old browsers). |
| `Wallet.fromKey(pkcs8)` | `(Uint8Array) → Promise<Wallet>` | Import a PKCS8 private key; public key is derived. |
| `wallet.publicKey` | `Uint8Array` | 32 raw bytes — this is the address everywhere in raijin. |
| `wallet.sign(message)` | `→ Promise<Uint8Array>` | 64-byte deterministic Ed25519 signature. |
| `wallet.buildTx(opts)` | `(BuildTxOptions) → Promise<Transaction>` | Builds and signs. `BuildTxOptions = { to, value, nonce, data?, chainId? }`; `chainId` defaults to `1n`, `data` to empty. |
| `wallet.exportPrivateKey()` | `→ Promise<Uint8Array>` | PKCS8; round-trips through `fromKey`. |

Two signing facts worth engraving: the signature covers `encodeTx(tx)` — every field *except* the signature — so any post-`buildTx` mutation invalidates it; and `hash(encodeTx(tx))` is the `txHash` receipts carry, which is how you correlate submissions to results. Note the state machine reads `tx.data[0]` as the transaction type; empty `data` means plain transfer.

### `RaijinClient` — typed pass-through to your transport

`submitTransaction(tx)`, `getAccount(address)` (unknown addresses return zero accounts, not errors), `getBlock(number)` (`null` if missing), and `subscribe(handler)` which returns its own unsubscribe function. All reliability semantics — timeouts, retries, which validator you're actually talking to — belong to your `ClientTransport`, not the client.

## Where next

Multiple validators means a real `NetworkTransport` and identical `validators` arrays on every node — read [Consensus](/raijin/consensus/) for the quorum math (nothing is Byzantine-tolerant below 4) and [Architecture](/raijin/architecture/) for the full block lifecycle before you scale past one.
