---
title: "hashish"
description: "Locality-Sensitive Hashing (MinHash) for fast, scalable approximate nearest-neighbor / similarity search over text. TypeScript, zero native dependencies, pluggable storage (in-memory or Redis)."
---

**`@johnhenry/hashish`** implements
[Locality-Sensitive Hashing](https://en.wikipedia.org/wiki/Locality-sensitive_hashing)
(LSH) for fast, scalable approximate nearest-neighbor / similarity search
over text. Documents are shingled, MinHashed, and bucketed with LSH banding
so that similar documents are cheap to find without comparing every pair.

> **Provenance:** `hashish` is a modernized fork of
> [`agtabesh/lsh-js`](https://github.com/agtabesh/lsh-js) (previously
> published under that same name), rewritten in TypeScript with a fixed
> banding algorithm, no native dependencies, and a pluggable storage layer.
> See the [repo's CHANGELOG](https://github.com/johnhenry/hashish/blob/main/CHANGELOG.md)
> for what changed and why — including the banding bug this fork fixes.

- **Zero native dependencies.** MurmurHash3 is implemented in pure JS (no
  `node-gyp`), works in Node, browsers, and edge runtimes.
- **Pluggable storage.** In-memory by default; bring your own
  Redis-compatible client to share an index across processes or survive
  restarts.
- **Correct LSH banding.** Buckets are keyed by signature *position*, not
  just by value.
- **TypeScript-first**, ESM + CJS builds, no bundled dependencies.

## Install

```sh
npm install @johnhenry/hashish
```

## Quick example

```ts
import { Hashish } from '@johnhenry/hashish'

const hashish = new Hashish({
  shingleSize: 5,
  numberOfHashFunctions: 120,
  bucketSize: 4, // rows per LSH band; lower = more recall, higher = more precision
})

await hashish.addDocument(1, 'the quick brown fox jumps over the lazy dog')
await hashish.addDocument(2, 'the quick brown fox jumps over the lazy dog again')
await hashish.addDocument(3, 'quarterly revenue projections indicate a modest increase')

// find documents similar to document 1
const byId = await hashish.query({ id: 1 })

// re-rank LSH candidates by exact Jaccard similarity, and drop weak matches
const ranked = await hashish.query({ id: 1, rerank: true, minSimilarity: 0.3, limit: 10 })
// => [{ id: 2, similarity: 0.87 }]
```

All index/query methods are async, so the same code works whether
`storage` is in-memory or a network-backed adapter like Redis.

## The pages here

- [API](/hashish/api/) — constructor options, `addDocument`/`query` and
  the rest of the instance API, exporting/importing/migrating an index,
  and storage adapters
- [How it works](/hashish/how-it-works/) — shingling, MinHashing, and LSH
  banding, explained

## Development

```sh
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

## License

MIT

## Source

[github.com/johnhenry/hashish](https://github.com/johnhenry/hashish)
