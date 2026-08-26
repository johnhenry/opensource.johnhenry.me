---
title: "semantic-chunker"
description: "Split text into semantically meaningful chunks by detecting similarity dropoffs between embedded segments — bring your own embedding function."
---

**`@johnhenry/semantic-chunker`** splits text into chunks that follow topic
boundaries instead of character counts. It segments a document (sentences,
paragraphs, or markdown blocks), embeds each segment with a function *you*
supply, measures cosine similarity between neighbors, and cuts wherever
similarity drops significantly — with eleven pluggable methods for deciding
what "significantly" means.

This is **not** an embedding model, and it doesn't bundle one. It's BYOE —
Bring Your Own Embedder: any `(text: string) => number[] | Promise<number[]>`
works, from an OpenAI API call to a local model. Two ready-made adapters ship
as optional subpath imports (`embed/xenova` for a local transformer,
`embed/ollama` for a local Ollama server), but their model dependencies are
optional peers you install yourself.

> Previously published as `semantic-chunker` (last release 0.0.4, now
> deprecated). Renamed to `@johnhenry/semantic-chunker` and restarted at
> 0.0.0 on import into the @johnhenry family — a new address and era, not a
> maturity signal.

## Install

```sh
npm install @johnhenry/semantic-chunker
```

Requires Node.js >= 20.6.0.

## Quick start

```javascript
import semantic from "@johnhenry/semantic-chunker";

const embed = async (text) => {
  /* return a number[] from your embedding model of choice */
};

const chunker = semantic({ embed, zScoreThreshold: 1 });

for await (const [text, embedding] of chunker(document)) {
  console.log({ text, embedding });
}
```

Every chunker is an async generator yielding `[text, embedding]` pairs. The
embedding on each yielded pair is a fresh embedding of the *whole chunk* —
the per-segment embeddings are only used internally for boundary detection.

## Which one do I want?

Three strategies share the same `[text, embedding]` output shape:

| Import | What it yields | Use when |
| --- | --- | --- |
| `semantic` (default export) | One chunk per detected topic | RAG / retrieval — you want chunks that hold one idea each |
| `sentence` | One chunk per sentence, paragraph, or markdown block | You want the raw segments, embedded, no regrouping |
| `full` | The whole text as one chunk (or fixed slices via `split`) | Short documents, or a baseline to compare against |

`sentence` and `full` never look at the embeddings — they work fine without
an embedder. Only `semantic` needs one, which leads to the first trap.

## Honest math: when naive splitting is fine

Semantic chunking isn't free — `semantic` makes one `embed` call per segment
plus one per emitted chunk, so a 300-sentence document costs 300+ embedding
calls before you've indexed anything. If your documents are short, uniform in
topic, or a reranker sits downstream anyway, fixed-size splitting with
overlap (`full({ split })` here, or any string slicer) is dramatically
cheaper and often retrieves nearly as well. `semantic` earns its cost on
long, topic-mixed documents where a fixed window would routinely cut ideas in
half. The repo's first example runs all three strategies on the same
document, so you can see the difference before paying for it.

## No embedder means no boundaries — and no error

`embed` defaults to a null embedder that returns `[]` for every text. Cosine
similarity between empty vectors is defined as 0, so every adjacent pair gets
an identical dropoff of 1 — a perfectly flat distribution in which no
statistical method finds an outlier. `semantic()` without a real `embed`
silently degrades to one giant chunk. If your "semantic" chunker is returning
the whole document, check that you actually passed `embed` before you touch
any threshold.

## Dimension mismatches don't throw

The internal dot product treats missing entries as zero, so comparing a
384-dimension vector against a 768-dimension one quietly computes a
truncated, deflated similarity instead of raising an error. If you switch
embedding models mid-corpus (or an API returns a short vector on error),
boundaries skew toward "everything is dissimilar" with no diagnostic. Keep
one embedder — one dimensionality — per run.

## Don't mix the `Agentic` method with the xenova adapter

The `"Agentic"` boundary method re-embeds segments via
`@huggingface/transformers` (v3). The bundled `embed/xenova` adapter uses
`@xenova/transformers` (v2). Their onnxruntime native bindings conflict in
the same process: once v3 has run inference, subsequent v2 inference **hangs
forever** — no error, no timeout. When using `"Agentic"`, build your
embedding function on `@huggingface/transformers` too, or use a non-onnx
embedder such as Ollama.

## Tiny inputs never split

Boundary detection is statistical: it flags *outliers* among the similarity
dropoffs. A two-sentence document has one dropoff — a distribution with zero
standard deviation, in which nothing is an outlier. Documents with only a
handful of segments come back as one chunk regardless of threshold. That's
correct behavior, not a bug: give the methods enough segments to establish
what "normal" similarity looks like.

## The pages here

- [Strategies & tuning](/semantic-chunker/strategies/) — the full API for
  all three chunkers, the eleven boundary detection methods and their
  options, chunk-size enforcement, overlap, split modes, and the two bundled
  embedding adapters

## Status

Small and stable: ~200 lines of library source with a 36-test offline unit
suite (deterministic mock embedder, fully predictable boundaries) plus gated
integration tests against real Xenova and Ollama embedders. CI runs the unit
suite and TypeScript checks on Node 20 and 22.

Source: [github.com/johnhenry/semantic-chunker](https://github.com/johnhenry/semantic-chunker) ·
Runnable examples in [`examples/`](https://github.com/johnhenry/semantic-chunker/tree/main/examples) —
each named for the behavior it demonstrates.
