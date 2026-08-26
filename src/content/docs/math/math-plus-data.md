---
title: 'Math Plus: data'
description: Arrow-backed dataframes, Parquet with real pushdown, async dataset pipelines, and the scalar-type bridge — plus the bigint, null, and laziness traps.
---

Four packages in two disjoint halves that share no import edge: the Arrow dataframe pair (`frame-arrow` + `frame-parquet`) and the ML-pipeline pair (`data` + `scalar-types`). Their only common downstream is [`tensor-core`](/math/math-plus-tensor/).

| Package | What it is |
|---|---|
| `@johnhenry/math-plus-frame-arrow` | Immutable, lazy, expression-oriented `Frame`/`Series` on Apache Arrow |
| `@johnhenry/math-plus-frame-parquet` | Parquet read/write with genuine projection + predicate pushdown (hyparquet) |
| `@johnhenry/math-plus-data` | Async dataset pipelines: a curated `Dataset` facade over `@johnhenry/iteration` |
| `@johnhenry/math-plus-scalar-types` | Re-export of `@johnhenry/math` scalars + tensor-boundary converters |

```bash
npm install @johnhenry/math-plus-frame-arrow @johnhenry/math-plus-frame-parquet
```

## The three traps that bite everyone first

**int64 is `bigint`, and `JSON.stringify` throws on it.** CSV inference
makes integer columns int64; `fn.count()` returns `2n`; `toRows()` hands you
bigints. Use the exported `stringifyRows()` (bigints become strings) or
`bigintSafeReplacer`.

**Laziness has exact boundaries.** Plan-building (`select`, `filter`,
`groupBy`, `join`, ...) never executes. `schema`/`columns` never execute
either (metadata-only). `length`, `toRows()`, `toArrow()`, `toCSV()`,
`toIPC()`, `nullCount()`, `getSeries()`, `toTensor()` all collect
implicitly. A frame from `scanParquetLazy` throws on the sync accessors —
use `collectAsync()`.

**Nulls behave like SQL, not JS.** Comparisons on null return null, so null
rows never pass any filter — including `.eq()`. Null join keys never match,
*not even null-to-null under outer join* (issue #102). `sortBy` puts nulls
last in both directions. `fn.count()` counts nulls; `sum`/`mean` skip them;
`stddev` is sample (ddof=1).

## frame-arrow: what else to know

- Column pruning is real and observable — `select()` before collecting can
  avoid ever decoding an unsupported column. But **`join` doesn't prune**:
  both sides read all columns regardless of downstream `select`.
- Timestamps: exact bigint epochs via `toRows()`/`Series.toArray()`, but
  *inside expression evaluation* they pass through epoch-milliseconds — a
  `timestamp[us]` predicate silently loses sub-ms precision. `fn.month()`
  uses the UTC calendar.
- Arithmetic on a non-numeric column throws instead of writing NaN; bare
  aggregates outside `groupBy`/`.overAll()` throw — but only at collect
  time.
- Scalar math functions are spelled to match `@johnhenry/math`'s `Symbolic`
  names 1:1 — it's `ln`, not `log`.
- `toTensor()` needs `@johnhenry/math-plus-tensor-core` as an *optional*
  peer (dynamic import), rejects nulls ("`fillNull` first"), and promotes
  all columns to one dtype without range re-validation.

## frame-parquet: the pushdown is real, the footguns are upstream

The reason this package exists in its current shape: hyparquet-writer with
`codec: 'ZSTD'` and no registered compressor **silently writes uncompressed
bytes labeled ZSTD** — pyarrow then rejects the file. frame-parquet wires a
real WASM zstd encoder and validates codecs against an allow-list, and its
write path is verified against actual pyarrow, not just self-round-trip.

- `columns`/`filter` go straight to hyparquet: statistics-based row-group
  skipping plus column-chunk fetch avoidance, proven at the byte level in
  tests (filtered read < 30% of full-read bytes).
- **`initialFetchSize` matters for small files:** the default footer fetch
  is the last 512 KiB, so "reading metadata" on a small file reads the
  whole file and swamps the pushdown savings.
- `scanParquet` is **eager**; `scanParquetLazy` is lazy for row data but
  still reads every matched file's footer up front, and type-maps *every*
  column — one INT96/MAP column anywhere fails the lazy scan immediately,
  while the eager path can `select()` around it. Neither does file-level or
  Hive-partition skipping.
- Timestamps read back as raw bigints (deliberately overriding hyparquet's
  lossy `Date` parsers); dictionary columns write as plain STRING and read
  back `utf8`.
- Filters are hyparquet's Mongo-style shapes (`{ value: { $gt: 5 } }`) —
  **not** the same vocabulary as the Python side's pyarrow tuples; the two
  pushdown APIs are different by design (see
  [interop](/math/math-plus-interop/)).

## data: pipelines that feed the trainer

`fromAsync(source).map(...).shuffle({seed}).epochs(n, {reshuffle}).batch(16,
{collate: collate.xy({dtype: "f64"})})` produces exactly
tensor-autograd `trainer.fit`'s `Batch` shape.

- **One-shot vs re-iterable:** arrays are re-iterable; a bare
  `AsyncIterable` is one-shot — second pass throws with a factory hint, and
  `.epochs()` refuses one-shot sources up front. Pass
  `fromAsync(() => stream())`.
- **`collate` defaults to f32; `nn.Linear` is f64** — tensor-core has no
  implicit promotion, so pass `{ dtype: "f64" }` or the trainer throws.
- `shuffle()` stacked on `epochs()` shuffles the *concatenated* stream; use
  `epochs(n, { reshuffle: { seed } })` for per-epoch reshuffling.
- The facade is curated and test-enforced: no `count*`, no raw
  `group`/`reduce*` re-exports (naming collisions with dataframe
  vocabulary). Power users can import
  [`@johnhenry/iteration`](/math/iteration/) directly.

## scalar-types: the boundary, encoded

Boxed scalars (`ComplexNumber`, `Rational`, `Decimal`, `Interval`,
`Quaternion`) live only at tensor API edges, never in storage or kernels —
this package is where that rule lives, so a scalar-layer change moves one
package. One trap worth repeating: **don't equality-compare `Interval`s
after arithmetic** — `@johnhenry/math` outward-rounds every non-exact op by
~1 ULP per side to preserve containment, so even 1×3 comes back a hair
wider than exact. That same property makes `Interval` useful as a rounding
-error oracle for f32 GPU results.
