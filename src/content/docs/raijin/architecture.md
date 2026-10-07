---
title: "Architecture"
description: "How the six raijin packages compose, the block lifecycle from transaction submission through PBFT to state commitment, and where DA fits."
---

raijin is a dependency diamond with `raijin-core` at the bottom and the SDK at the top:

```
raijin-sdk          (client API: Wallet, RaijinClient)
    |
raijin-validator    (composition root: ValidatorNode, BlockProducer; re-exports Mempool)
    |
    +-- raijin-consensus  (PBFT engine + ValidatorSet + byte-transport codec)
    |
    +-- raijin-mempool    (fee-ordered, signature-verifying pool)
    |
raijin-core         (state machine, blocks, transactions, hashing, encoding, wire codec, genesis, durable state)

raijin-da       → raijin-core   (data availability; standalone, NOT wired into validator yet)
```

Two things in that graph are worth stating up front:

- **`raijin-mempool` is integrated; `raijin-da` is not.** `ValidatorNode` runs the fee-ordered, sender+nonce-deduplicated, signature-verifying `Mempool` from `raijin-mempool` (the validator package just re-exports it); the simpler FIFO pool that used to live in the validator is gone. `raijin-da` is still a leaf: `ValidatorNode` does not post anything to a DA layer, and you wire the backends in yourself today.
- **Every boundary is an injected interface.** `StateStore` (storage; `KVBackend` underneath the persistent one), `CheckpointStore` (validator resume point), `NetworkTransport` (consensus messaging; `BytesTransport` + `codecTransport` for real byte channels), `GossipTransport` (the mempool's own propagation hook), `ConsensusTimer` (time), `SignatureVerifier`/`sign` (identity), `ClientTransport` (client↔node), `DALayer` (availability). The packages contain no I/O of their own — which is why the same code runs in a browser tab, a Worker, and Node.

## Block lifecycle

What happens between "user clicks send" and "balance updated", with the package responsible at each step:

1. **Build + sign** (`sdk`) — `Wallet.buildTx()` assembles `{ from, nonce, to, value, data, chainId }`, canonically encodes it with core's `encodeTx()`, and Ed25519-signs those bytes. The signature covers everything except itself.
2. **Submit** (`sdk` → your `ClientTransport` → `validator`) — `RaijinClient.submitTransaction()` crosses your transport; `ValidatorNode.submitTransaction()` hands the tx to the mempool, which verifies its signature, deduplicates by sender+nonce, and evicts the lowest-fee transaction if full. A bad signature, duplicate, or un-evictable full pool makes the call **throw**, so garbage never takes block space; a wrong *nonce* is still only caught at execution. Accepted transactions are also gossiped to the other validators (`tx-gossip`), so a client can submit to any of them.
3. **Produce** (`validator`) — on each `blockTime` tick, if `consensus.isLeader`, `BlockProducer` pulls up to `maxTxPerBlock` transactions in fee order (a sender's own transactions stay in nonce order), Merkle-roots their signed-encoding hashes into `txRoot`, and builds a header. `stateRoot` and `receiptRoot` are left zeroed.
4. **Propose** (`consensus`) — `propose(block)` hashes the serialized header into a digest, broadcasts PRE-PREPARE (and the leader's own PREPARE), and bumps the sequence number.
5. **PREPARE phase** (`consensus`, every validator) — on a PRE-PREPARE from the current view's leader with a matching digest, each validator broadcasts PREPARE. When a validator has `quorumSize()` prepares for the digest, it moves to *prepared*.
6. **COMMIT phase** (`consensus`) — prepared validators sign the digest and broadcast COMMIT. At `quorumSize()` commits the block is *committed*. (Every PRE-PREPARE/PREPARE/COMMIT/VIEW-CHANGE signature is checked against the injected `verify`, scoped to `{phase, chainId, epoch, view, sequence, digest}` — a message that fails is dropped before it reaches the quorum count at all.)
7. **Execute + finalize** (`consensus` → `core`) — the committed block goes to `StateMachine.applyBlock()`: per transaction, verify signature → check nonce → dispatch on `data[0]` → write accounts. Failures become `revert` receipts in place; there's no block-level rollback and none is needed, because executors check every precondition before writing. PBFT then fills the block's `stateRoot`/`receiptRoot` in with the real, post-execution values (left zeroed since step 3); the block hash of that completed header (`blockHash`) is what the next block's `parentHash` must equal.
8. **Advance** (`validator`) — `onBlockFinalized` fires; the node prunes included txs from the mempool, `BlockProducer.advance()` bumps the height and sets the parent hash, and (if a `checkpoint` is configured) the new chain tip is saved so a restart resumes here. The loop returns to step 3.

If the leader stalls instead: each validator's view timer (`viewTimeout`, default 10 s) expires, it broadcasts a view change for `view + 1`, and once `quorumSize()` view-change messages accumulate everyone rotates — `ValidatorSet.leaderForView()` is round-robin, so the next validator in the array takes over.

## What "state commitment" currently means

Be precise about what nodes agree on *before* a block runs versus *after*. The consensus digest — the thing PRE-PREPARE/PREPARE/COMMIT actually vote on — covers the *proposed* header, which commits to the transactions (`txRoot`) but leaves `stateRoot`/`receiptRoot` zeroed, since neither can be known before execution. So the vote itself is agreement on **transaction ordering**, not on the resulting state. But once the block runs, PBFT fills the *executed* header's `stateRoot`/`receiptRoot` in with the real values, and a child block's `parentHash` is the **block hash** of that completed parent header — `H(encodeBlockHeader(header))`, not the parent's state root as in earlier versions. So the chain that actually forms does commit to state (and to the parent's transactions, proposer and timestamp), retroactively, one block later; a node that computed a different state root would produce a header whose hash doesn't match what everyone else's `parentHash` expects. `StateMachine.stateRoot()` is deterministic: a Merkle root over the store's domain-tagged entries — a commitment, not a queryable trie, with no inclusion proofs. That determinism is what the repo's test harness checks directly, via its `NoForkChecker` and `BalanceConsistencyChecker`.

Where a chain *starts* is also explicit now: a `GenesisConfig` (chain id, ordered validators, initial accounts) derives block 0, whose hash the first real block's `parentHash` must equal. Genesis is not discovered trustlessly; a node is told the config, or at least the expected hash, out of band.

## Where DA fits

The intended shape: after finalization, the block is serialized, run through `da`'s `encode()` (magic header + optional deflate), and `submit()`ed to a `DALayer`, yielding a `DACommitment` (`{ layer, height, index, hash }`) that anyone can later `retrieve()`/`verify()` against. `LocalDA` implements this in memory for development, `CelestiaDA` against a Celestia light node, and `EthBlobDA` documents the EIP-4844 path but throws. Today you call this pipeline yourself from an `onBlockFinalized` handler; `ValidatorNode` does not do it for you. And remember the scope of `verify()`: it re-hashes what the backend serves — content integrity, not inclusion proof. See [Data availability](/raijin/da/).

## The test harness

The unpublished seventh package, `raijin-test-harness`, is how the multi-node claims get exercised: a `TestOrchestrator` runs real `ValidatorNode`s over a `PartitionableNetwork` (partition/heal/seeded-random delivery via `SeededPRNG`) with a shared mock timer, drives workloads (credit transfers, consensus blocks, membership churn), and then runs cluster-wide invariant checkers — no-fork, balance consistency, event-log integrity, gossip convergence. It stays unpublished because it imports the consensus package's test helpers by relative path and because multi-node timing tests are inherently flaky — the six publishable packages' own tests are the deterministic surface.
