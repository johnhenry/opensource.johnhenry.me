---
title: "Architecture"
description: "How the six raijin packages compose, the block lifecycle from transaction submission through PBFT to state commitment, and where DA fits."
---

Raijin is a dependency diamond with `raijin-core` at the bottom and the SDK at the top:

```
raijin-sdk          (client API: Wallet, RaijinClient)
    |
raijin-validator    (composition root: ValidatorNode, BlockProducer, FIFO Mempool)
    |
    +-- raijin-consensus  (PBFT engine + ValidatorSet)
    |
raijin-core         (state machine, blocks, transactions, hashing, encoding)

raijin-mempool  → raijin-core   (fee-ordered pool; standalone, NOT wired into validator yet)
raijin-da       → raijin-core   (data availability; standalone, NOT wired into validator yet)
```

Two things in that graph surprise people, so up front:

- **`raijin-mempool` and `raijin-da` are leaves, not middleware.** `ValidatorNode` ships its own minimal FIFO mempool and does not post anything to a DA layer. The fee-ordered mempool and the DA backends are real, tested packages you wire in yourself today; integrating them into the validator is future work.
- **Every boundary is an injected interface.** `StateStore` (storage), `NetworkTransport` (consensus messaging), `GossipTransport` (tx propagation), `ConsensusTimer` (time), `SignatureVerifier`/`sign` (identity), `ClientTransport` (client↔node), `DALayer` (availability). The packages contain no I/O of their own — which is why the same code runs in a browser tab, a Worker, and Node.

## Block lifecycle

What happens between "user clicks send" and "balance updated", with the package responsible at each step:

1. **Build + sign** (`sdk`) — `Wallet.buildTx()` assembles `{ from, nonce, to, value, data, chainId }`, canonically encodes it with core's `encodeTx()`, and Ed25519-signs those bytes. The signature covers everything except itself.
2. **Submit** (`sdk` → your `ClientTransport` → `validator`) — `RaijinClient.submitTransaction()` crosses your transport; `ValidatorNode.submitTransaction()` drops the tx in the FIFO mempool unchecked. Validation is deferred to execution — garbage is accepted here and reverts later.
3. **Produce** (`validator`) — on each `blockTime` tick, if `consensus.isLeader`, `BlockProducer` pulls up to `maxTxPerBlock` transactions, Merkle-roots their signed-encoding hashes into `txRoot`, and builds a header. `stateRoot` and `receiptRoot` are left zeroed.
4. **Propose** (`consensus`) — `propose(block)` hashes the serialized header into a digest, broadcasts PRE-PREPARE (and the leader's own PREPARE), and bumps the sequence number.
5. **PREPARE phase** (`consensus`, every validator) — on a PRE-PREPARE from the current view's leader with a matching digest, each validator broadcasts PREPARE. When a validator has `quorumSize()` prepares for the digest, it moves to *prepared*.
6. **COMMIT phase** (`consensus`) — prepared validators sign the digest and broadcast COMMIT. At `quorumSize()` commits the block is *committed*. (The commit signatures ride along but are not verified — the quorum count is over claimed sender identities from your transport.)
7. **Execute + finalize** (`consensus` → `core`) — the committed block goes to `StateMachine.applyBlock()`: per transaction, verify signature → check nonce → dispatch on `data[0]` → write accounts. Failures become `revert` receipts in place; there's no block-level rollback and none is needed, because executors check every precondition before writing.
8. **Advance** (`validator`) — `onBlockFinalized` fires; the node prunes included txs from the mempool, `BlockProducer.advance()` bumps the height and carries parent linkage, and the loop returns to step 3.

If the leader stalls instead: each validator's view timer (`viewTimeout`, default 10 s) expires, it broadcasts a view change for `view + 1`, and once `quorumSize()` view-change messages accumulate everyone rotates — `ValidatorSet.leaderForView()` is round-robin, so the next validator in the array takes over.

## What "state commitment" currently means

Be precise about what nodes actually agree on. The consensus digest covers the block *header*; the header commits to the transactions (`txRoot`) but not to the resulting state (`stateRoot` is zeroed by the producer). So PBFT gives you agreement on **transaction ordering**, and identical state then follows from every node running the same deterministic state machine over the same ordered transactions — it is not *checked* via header commitments. `StateMachine.stateRoot()` exists and is deterministic (a flat hash over the sorted store, not a Merkle trie), so cross-node state comparison is possible — the repo's test harness does exactly that with its `NoForkChecker` and `BalanceConsistencyChecker` — it's just not part of consensus yet.

## Where DA fits

The intended shape: after finalization, the block is serialized, run through `da`'s `encode()` (magic header + optional deflate), and `submit()`ed to a `DALayer`, yielding a `DACommitment` (`{ layer, height, index, hash }`) that anyone can later `retrieve()`/`verify()` against. `LocalDA` implements this in memory for development, `CelestiaDA` against a Celestia light node, and `EthBlobDA` documents the EIP-4844 path but throws. Today you call this pipeline yourself from an `onBlockFinalized` handler; `ValidatorNode` does not do it for you. And remember the scope of `verify()`: it re-hashes what the backend serves — content integrity, not inclusion proof. See [Data availability](/raijin/da/).

## The test harness

The unpublished seventh package, `raijin-test-harness`, is how the multi-node claims get exercised: a `TestOrchestrator` runs real `ValidatorNode`s over a `PartitionableNetwork` (partition/heal/seeded-random delivery via `SeededPRNG`) with a shared mock timer, drives workloads (credit transfers, consensus blocks, membership churn), and then runs cluster-wide invariant checkers — no-fork, balance consistency, event-log integrity, gossip convergence. It stays unpublished because it imports the consensus package's test helpers by relative path and because multi-node timing tests are inherently flaky — the six publishable packages' 123 tests are the deterministic surface.
