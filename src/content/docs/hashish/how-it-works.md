---
title: "How it works"
description: "Shingling, MinHashing, and LSH banding — how hashish turns similarity search into cheap, sub-linear lookups."
---

1. **Shingling** — the document is split into overlapping n-grams
   (`shingleSize` characters, or words if `shingleUnit: 'word'`).
2. **MinHashing** — `numberOfHashFunctions` independent hash functions each
   record the minimum hash over the shingle set, producing a fixed-length
   signature whose position-wise agreement rate approximates the Jaccard
   similarity between documents.
3. **LSH banding** — the signature is split into bands of `bucketSize`
   consecutive positions. Two documents are *candidates* if they agree on
   every position within at least one band (an OR-of-ANDs), which is what
   makes lookups sub-linear instead of comparing every pair of documents.
4. **Optional re-ranking** — `rerank: true` computes exact Jaccard
   similarity on the (typically small) LSH candidate set, trading a little
   speed for precision.

## Benchmark

The repo ships a benchmark script:

```sh
npm run bench
```

See [`benchmarks/`](https://github.com/johnhenry/hashish/tree/main/benchmarks)
in the repo for the harness itself.
