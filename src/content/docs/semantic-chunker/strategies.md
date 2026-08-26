---
title: "Strategies & tuning"
description: "The three chunkers, eleven boundary detection methods, chunk-size enforcement, split modes, and the bundled xenova/ollama embedding adapters."
---

Everything here operates on the same contract: a chunker is a factory that
takes options and returns an async generator; the generator takes a string
and yields `[text, embedding]` pairs.

```typescript
type EmbedFunction = (text: string) => number[] | Promise<number[]>;
type Chunker = (text: string) => AsyncGenerator<[string, number[]]>;
```

## `semantic(options)` — the default export

Segments the text, embeds each segment, computes the cosine-similarity
*dropoff* (`1 - similarity`) between each adjacent pair, asks a detection
method which dropoffs are significant, and cuts there. Each final chunk's
text is re-embedded, so expect one extra `embed` call per yielded chunk.

| Option | Default | What it does |
| --- | --- | --- |
| `embed` | null embedder | Your embedding function. Required for meaningful results — see the [no-embedder trap](/semantic-chunker/#no-embedder-means-no-boundaries--and-no-error) |
| `method` | `"SD"` | Boundary detection method (table below) |
| `methodOptions` | `{}` | Options for the chosen method |
| `zScoreThreshold` | `2` | Convenience shortcut for the default `"SD"` method's threshold |
| `splitMode` | `"sentence"` | `"sentence"`, `"paragraph"`, or `"markdown"` segmentation |
| `split` | `0` | Hard-split segments longer than this many characters (0 disables) |
| `overlap` | `0` | Trailing segments from the previous chunk prepended to the next |
| `maxChunkSize` | `0` | Split oversized chunks at their weakest interior point (0 disables) |
| `minChunkSize` | `0` | Merge undersized chunks into their most-similar neighbor (0 disables) |

## `sentence(options)`

One embedded chunk per segment. Takes `embed`, `split`, and `splitMode` with
the same meanings. No boundary detection — this is the first pass of
`semantic`, exposed directly.

## `full(options)`

The whole text as a single embedded chunk, or fixed `split`-character slices.
Takes `embed` and `split`.

## Split modes

| `splitMode` | Segments are | Notes |
| --- | --- | --- |
| `"sentence"` | Sentences via [compromise](https://github.com/spencermountain/compromise) | Default |
| `"paragraph"` | Blank-line-separated blocks | For plain prose |
| `"markdown"` | Headings, paragraphs, fenced code blocks | A heading always starts a new segment; fenced code blocks are never split in half |

Chunk text is reassembled by joining segments with a single space —
original whitespace, newlines, and blank lines between segments are **not**
preserved in the output chunks.

## Boundary detection methods

Pass `method` and `methodOptions` to `semantic()`. Dropoff values live in
`[0, 2]` (`1 - cosine`), and most methods flag *high* outliers — points of
unusual dissimilarity.

```javascript
const chunker = semantic({
  embed,
  method: "MAD",
  methodOptions: { madMultiplier: 3 },
});
```

| Method | Strategy | `methodOptions` (defaults) |
| --- | --- | --- |
| `"SD"` (default) | Z-score against mean/standard deviation | `zScoreThreshold` (2) |
| `"IQ"` | Interquartile-range outliers | `iqrMultiplier` (1.5) |
| `"MAD"` | Median absolute deviation outliers | `madMultiplier` (3) |
| `"PercentChange"` | Percentage drop vs the previous dropoff | `percentThreshold` (20) |
| `"MA"` | Deviation below a moving average | `windowSize` (3), `deviationThreshold` (1.5) |
| `"LM"` | Local minima detection | `sensitivity` (0.2) |
| `"CUSUM"` | Cumulative sum of deviations from the mean | `threshold` (5) |
| `"ChangePoint"` | Single change point maximizing mean difference | — |
| `"Hampel"` | Hampel filter (windowed median + MAD) | `windowSize` (7), `nSigma` (3) |
| `"ModifiedZScore"` | Modified z-score (median/MAD based) | `threshold` (3.5) |
| `"Agentic"` | Re-embeds segment text with a transformers.js model | `model` (`Xenova/all-MiniLM-L6-v2`), `threshold` (0.5), `windowSize` (2) |

Method-specific behavior worth knowing before you tune:

- **`SD` is one-sided; `MAD`, `IQ`, and `ModifiedZScore` are two-sided.**
  `SD` only flags unusually *high* dropoffs (real topic breaks). The robust
  methods flag deviation in *either* direction — an unusually similar pair
  can also become a boundary.
- **`PercentChange` flags the point *after* the drop.** It marks where the
  dropoff value fell sharply relative to its predecessor, not the spike
  itself — its boundaries land one segment later than `SD`'s on the same
  data.
- **`CUSUM`'s default threshold of 5 is large for dropoff data.** Dropoffs
  are bounded by 2 and typically hover well under 1, so the cumulative sum
  rarely reaches 5 on short-to-medium documents. If `CUSUM` finds nothing,
  drop `threshold` to well under 1 before concluding your document has no
  shifts.
- **`ChangePoint` returns at most one boundary** — the single strongest
  split. Use it to find the dominant topic shift, not to chunk a long
  document.
- **`Agentic` requires `@huggingface/transformers`** (optional peer, loaded
  lazily) and must not run in the same process as the `embed/xenova` adapter
  — see the [conflict trap](/semantic-chunker/#dont-mix-the-agentic-method-with-the-xenova-adapter).

The raw detection functions are exported for direct use:

```javascript
import { dropoffMethods } from "@johnhenry/semantic-chunker";

const boundaries = dropoffMethods.findSignificantDropoffsIQ(dropoffs, 1.5);
```

Each takes `{ index, dropoff }[]` and returns the sorted indices of
significant dropoffs.

## Tuning chunk sizes

For the default `"SD"` method, `zScoreThreshold` is the main dial: lower
values (0.5–1) cut more aggressively into smaller chunks; higher values
(2–2.5) demand stronger evidence and produce fewer, larger chunks.

Hard limits reshape the statistically-chosen boundaries afterward:

```javascript
const chunker = semantic({
  embed,
  maxChunkSize: 2000, // split chunks longer than 2000 characters
  minChunkSize: 200,  // merge chunks shorter than 200 characters
  overlap: 1,         // repeat each chunk's last segment in the next chunk
});
```

- `maxChunkSize` splits an oversized chunk at its highest-dropoff interior
  point, repeatedly, until compliant. A chunk consisting of a single segment
  is never split — one very long sentence can still exceed the limit.
- `minChunkSize` merges an undersized chunk across its lower-dropoff (more
  similar) boundary.
- **`minChunkSize` runs after `maxChunkSize`, so when the two conflict,
  `minChunkSize` wins** — a merge can recreate a chunk larger than
  `maxChunkSize`.
- `overlap` prepends the previous chunk's trailing segments without moving
  boundaries; overlapped text is included when the chunk is re-embedded.

## Embedding adapters

Two adapters ship as subpath imports. Each needs its optional peer
dependency installed; neither is loaded unless you import it.

| | `embed/xenova` | `embed/ollama` |
| --- | --- | --- |
| Import | `@johnhenry/semantic-chunker/embed/xenova` | `@johnhenry/semantic-chunker/embed/ollama` |
| Peer dependency | `@xenova/transformers` | `ollama` |
| Runs | In-process (onnxruntime) | Against a server at `localhost:11434` |
| Model | `Supabase/gte-small` (downloaded on first use) | `nomic-embed-text:latest` (must be pulled first) |
| Needs | Network on first run; `HF_ACCESS_TOKEN` env var if the model requires auth | A running `ollama serve` with the model pulled |

**The xenova adapter loads its model at import time** — the module has a
top-level `await pipeline(...)`, so `import "@johnhenry/semantic-chunker/embed/xenova"`
blocks until the model is loaded (first run: downloaded). Import it lazily
if startup latency matters, and don't import it in environments without
network access or a warm cache.

```javascript
import semantic from "@johnhenry/semantic-chunker";
import { embed } from "@johnhenry/semantic-chunker/embed/xenova";

const chunker = semantic({ embed, zScoreThreshold: 1 });
```

Or write your own — anything matching `(text) => number[] | Promise<number[]>`:

```javascript
const embed = async (text) => {
  const res = await fetch("https://your-embedding-api.example/embed", {
    method: "POST",
    body: JSON.stringify({ text }),
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
};
```

Whatever you choose, use **one embedder per run** — mixed vector dimensions
are silently accepted and silently wrong (see the
[dimension trap](/semantic-chunker/#dimension-mismatches-dont-throw)).
