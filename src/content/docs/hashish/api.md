---
title: "API"
description: "Constructor options, addDocument/query and the rest of the Hashish instance API, exporting/importing/migrating an index, and storage adapters."
---

## `new Hashish(options?)`

| option | default | description |
| --- | --- | --- |
| `storage` | `MemoryStorage` | A `StorageAdapter` instance. Defaults to an in-process `Map`. |
| `shingleSize` | `5` | Shingle (n-gram) length. |
| `shingleUnit` | `'char'` | Shingle over characters or `'word'`s. |
| `numberOfHashFunctions` | `120` | MinHash signature length. More = more accurate similarity estimates. |
| `bucketSize` | `4` | Default rows-per-band for `query()`; smaller = higher recall / lower precision. |
| `seed` | random | Seed the hash-function generator for reproducible signatures across runs. |

## `hashish.addDocument(id, text): Promise<void>`

Indexes a document under `id`. Throws on an empty document, or one too
short to produce even a single shingle (e.g. whitespace-only text under
word shingling).

## `hashish.query({ id | text, bucketSize?, rerank?, minSimilarity?, limit? }): Promise<QueryResult[]>`

Finds candidate documents similar to the given indexed `id` or raw `text`.

- `bucketSize` overrides the instance default for this query only — LSH
  buckets are stored per signature-position, so you can loosen or tighten
  it per query without re-indexing.
- `rerank: true` re-scores every LSH candidate by **exact** Jaccard
  similarity of shingle sets (more expensive, but precise) and sorts
  results descending by `similarity`.
- `minSimilarity` (with `rerank`) drops candidates below the threshold.
- `limit` caps the number of results.

Without `rerank`, `similarity` is omitted from results — those are
unscored LSH candidates (fast, approximate, may include false positives).

## Other methods

- `hashish.getDocument(id): Promise<string | undefined>`
- `hashish.getSignature(id): Promise<number[] | undefined>` — the raw
  MinHash signature stored for `id`.
- `hashish.hasDocument(id): Promise<boolean>`
- `hashish.removeDocument(id): Promise<void>`
- `hashish.documentIds(): Promise<DocumentId[]>`
- `hashish.size(): Promise<number>`
- `hashish.similarity(textA, textB): number` — exact Jaccard similarity,
  independent of the index.
- `hashish.estimateSimilarity(idA, idB): Promise<number>` — MinHash's
  *estimated* similarity between two indexed documents, from comparing
  their signatures (fast, approximate).
- `hashish.clear(): Promise<void>`

Also exported: `estimateSimilarity(signatureA, signatureB): number`, the
underlying pure function — the fraction of positions at which two raw
signatures agree. This is what a signature is actually useful for: a
single signature value is meaningless on its own (it's just a hash
output), but `P(signatureA[i] === signatureB[i])` equals the Jaccard
similarity of the documents it was computed from, so the agreement rate
across all positions approximates it.

## Exporting, importing, and migrating an index

```ts
// portable snapshot: config + every document's raw text, works with any storage backend
const dump = await hashish.exportIndex()
const restored = await Hashish.importIndex(dump) // re-shingles + re-hashes everything

// move an existing index straight to a different storage backend
const migrated = await hashish.migrateTo(new RedisStorage(new Redis()))
```

`exportIndex()`/`importIndex()` round-trip by replaying `addDocument()` for
every document, so they work between *any* two storage backends.
Signatures only come back byte-identical if you set `seed` on the original
`Hashish` — without it, the rebuilt index is still fully correct, just
hashed with fresh random seeds. `migrateTo()` is shorthand for
`Hashish.importIndex(await hashish.exportIndex(), destination)`.

If you're moving between two `MemoryStorage` instances (e.g. serializing
to disk and back) and want to skip re-hashing entirely, dump the storage
itself instead:

```ts
import { MemoryStorage } from '@johnhenry/hashish'

const json = JSON.stringify(hashish.storage) // MemoryStorage defines toJSON()
const restoredStorage = MemoryStorage.fromJSON(JSON.parse(json))
const restored = new Hashish({ ...originalOptions, storage: restoredStorage })
```

This only round-trips into another `MemoryStorage` — it's a dump of that
adapter's internal representation, not a portable format. A Redis-backed
index doesn't need an equivalent: pointing another process at the same
Redis instance already gives you a shared, durable index.

## Storage adapters

```ts
import { Hashish, MemoryStorage, RedisStorage } from '@johnhenry/hashish'

// default — in-process, not shared across restarts or other processes
new Hashish({ storage: new MemoryStorage() })

// share an index across processes / persist it, using any client you've already configured
import Redis from 'ioredis'
new Hashish({ storage: new RedisStorage(new Redis()) })
```

`RedisStorage` is duck-typed against a minimal `RedisLikeClient` interface
(`get`, `set`, `del`, `sadd`, `srem`, `smembers`, `keys`) rather than
depending on `ioredis` directly — pass in an `ioredis`, `node-redis`, or
any compatible client.

Implement `StorageAdapter` (see `src/types.ts` in the repo) to plug in
another backend (SQL, DynamoDB, etc).
