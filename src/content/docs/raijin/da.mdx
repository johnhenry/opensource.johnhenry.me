---
title: "Data availability"
description: "@johnhenry/raijin-da — the DALayer interface, what commitments prove, LocalDA and CelestiaDA, the EthBlobDA stub, and encode/decode."
---

**`@johnhenry/raijin-da`** abstracts "post these bytes somewhere retrievable" behind one interface, `DALayer`, with three backends: `LocalDA` (in-memory, dev/tests), `CelestiaDA` (a Celestia light node's REST API), and `EthBlobDA` (EIP-4844 — a stub that throws). `encode()`/`decode()` handle compression framing for the payloads. `viem` is an optional peer dependency you only need if you implement the ETH path.

```sh
npm install @johnhenry/raijin-da
```

## What a commitment proves — and doesn't

`submit(data)` returns a `DACommitment`:

| Field | Meaning |
| --- | --- |
| `layer` | Backend name: `'local'`, `'celestia'`, `'eth-blobs'` |
| `height` | DA-layer block height at inclusion |
| `index` | Slot within that height (LocalDA: a counter; **CelestiaDA: always 0** — simplified) |
| `hash` | SHA-256 of the submitted bytes — the part that actually does work |

`verify(commitment)` retrieves what the backend has for that hash and re-hashes it. So it proves exactly one thing: *this backend currently serves bytes matching this content hash*. It does **not** prove inclusion at `height`/`index`, availability over time, or anything checkable without downloading the full data — there are no namespace proofs, no KZG, no sampling. Treat `height`/`index` as retrieval hints, not commitments. If you need real DA guarantees, this package is the interface to build them behind, not the guarantee itself.

Other traps:

- **`EthBlobDA` throws on all three methods.** It pins the interface and its error messages are a step-by-step implementation guide (viem blob sidecars, KZG setup, Beacon API retrieval). Also: Ethereum prunes blobs after ~18 days — the archival problem is yours.
- **`encode()` is environment-dependent.** If the optional `fflate` package can be imported, shrinkable payloads get deflated with an `RJC` magic prefix; otherwise everything is `RJR` raw. `decode()` of an `RJC` payload **throws when fflate is absent** — if any writer might compress, every reader needs fflate installed.
- **`retrieve()` throws on a miss; `verify()` returns `false`.** Same unknown-hash situation, different failure channels — don't catch around `verify`.

## `LocalDA`

```js
import { LocalDA, encode, decode } from '@johnhenry/raijin-da'

const da = new LocalDA()
const commitment = await da.submit(await encode(blockBytes))
const bytes = await decode(await da.retrieve(commitment))
await da.verify(commitment)                    // true
await da.verify({ ...commitment, hash: new Uint8Array(32) }) // false
```

Content-addressed in-memory store — resubmitting identical bytes lands on the same slot. Test conveniences: `nextBlock()` advances the reported height and resets the index (heights never move on their own), `size` counts stored blobs, `clear()` resets everything. No persistence, no network: its whole job is letting you develop the DA pipeline without infrastructure.

## `CelestiaDA`

```js
import { CelestiaDA } from '@johnhenry/raijin-da'

const da = new CelestiaDA({
  namespace: '00c0ffee00c0ffee',        // required — 8-byte hex namespace ID
  endpoint: 'http://localhost:26658',   // default; a *running light node*, not embedded
  authToken: process.env.CELESTIA_NODE_AUTH_TOKEN, // most nodes require one
})
```

`submit()` posts a PFB (pay-for-blob) to your namespace and returns the inclusion height; `retrieve()` fetches all blobs in the namespace at that height and returns the one whose hash matches the commitment; `verify()` is retrieve-and-rehash, mapping *any* failure — network included — to `false`. Fees/gas are currently fixed constants in the client. `CelestiaDAOptions` is exported for typing.

## `EthBlobDA`

Constructable (`EthBlobDAOptions`: `rpcUrl`, `beaconUrl`, `chainId` — defaults localhost:8545, localhost:5052, 1) but every method throws with implementation requirements. The source file (`packages/da/src/eth-blobs.ts`) contains a complete viem-based sketch: `toBlobs()`/`toBlobSidecars()`, KZG via c-kzg-4844, a type-3 transaction, and Beacon API retrieval. If you implement it, keep the `DACommitment.hash` semantics — content hash of the pre-blob bytes — so `verify()` stays uniform across backends.

## `encode(data)` / `decode(data)`

Framing for DA payloads: a 3-byte magic (`RJC` compressed / `RJR` raw) followed by the payload. Compression happens only when fflate is present *and* actually shrinks the bytes, so tiny or high-entropy payloads pass through raw even with fflate installed. `decode()` throws on truncated input, unknown magic, or compressed data without fflate. Round-trip is guaranteed: `decode(encode(x))` equals `x` in any single environment.

## Wiring it into a node

`ValidatorNode` does not call any of this — DA is not in the block path yet ([Architecture](/raijin/architecture/) explains where it's headed). The manual wiring is an `onBlockFinalized` handler: serialize the block, `encode()`, `submit()`, store the commitment wherever your app tracks block metadata.

Runnable: `npm run example:04` covers the whole surface including the forged-commitment case.
