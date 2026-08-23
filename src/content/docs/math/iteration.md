---
title: '@johnhenry/iteration'
description: Sync and async iterator algebra for TypeScript — transducers, Python-itertools parity, bounded concurrency, cancellation, and backpressure-aware channels.
---

```bash
npm install @johnhenry/iteration
```

Zero runtime dependencies. The most mature library in this section — it has shipped under three names across several years.

## What's in it

**Transducers** — composable transformations that work identically over sync and async iterables, without allocating an intermediate array per step.

**itertools parity** — the Python `itertools` surface (`chain`, `cycle`, `islice`, `groupby`, `tee`, `product`, `permutations`, and the rest) in TypeScript, for both iterator flavours.

**Terminal consumers** — `reduce`, `collect`, `first`, `every`, and friends that end a pipeline.

**Bounded concurrency** — run an async pipeline N-at-a-time without unbounded fan-out.

**Cancellation and backpressure** — channels that respect a slow consumer rather than buffering without limit, and pipelines that stop promptly when cancelled.

## Provenance

The version number is fresh; the code isn't. This library has been renamed twice:

1. **`async-itertools`** — the original, now archived. The 1.x releases and the 2.0 milestones described above (transducer rewrite, cancellation, bounded concurrency, backpressure) all happened under that name.
2. **`mallory-iteration`** — absorbed into a pure-TypeScript monorepo, full git history preserved via `git subtree`.
3. **`@johnhenry/iteration`** — the current name, shipping from the [`johnhenry/math`](https://github.com/johnhenry/math) monorepo, restarted at `0.0.0` under the new scope.

If you're evaluating maturity from the version number, don't. Read the history instead.
