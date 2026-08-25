---
title: Math
description: Geometry, intervals, tensors, signals, and units — a core mathematics library plus a family of focused extensions.
---

Five separately published families, all MIT-licensed, all on npm under `@johnhenry/*`.

| Package | What it is |
|---|---|
| [`@johnhenry/math`](/math/math/) | The core library — geometry, linear algebra, complex numbers, intervals, rotors, symbolic evaluation |
| [`@johnhenry/math-plus-*`](/math/math-plus/) | 17 focused packages for numeric computing: tensors, autograd, WASM/WebGPU kernels, dataframes, FFT, signal, image, units |
| [`@johnhenry/math-grapher`](/math/math-grapher/) | A headless reactive-cell runtime, drivable by an AI agent over MCP |
| [`@johnhenry/iteration`](/math/iteration/) | Sync and async iterator algebra — transducers, itertools parity, bounded concurrency |
| [`@johnhenry/math-prototype-patch`](/math/math-prototype-patch/) | Opt-in `Number.prototype` patch adding `ComplexNumber`'s fluent arithmetic to plain numbers |

## Which one do I want?

**Doing mathematics** — geometry, complex arithmetic, exact rationals, interval bounds — start with `@johnhenry/math`.

**Doing numeric computing** — n-dimensional arrays, gradients, matrix multiplication on the GPU, reading Parquet — start with `math-plus-tensor-core` and add only the extensions you need. The family is deliberately granular so you don't ship a WebGPU backend to a project that just wants an FFT.

**Iterating over things** — lazily, asynchronously, with backpressure — `@johnhenry/iteration` is independent of the rest and has zero runtime dependencies.

## Versions

The math packages are early: most sit at `0.0.0` and use `^0.0.0` ranges internally. Under npm's pre-1.0 caret rules `^0.0.0` matches **only** `0.0.0` — it is not a range. Pin exact versions and expect a coordinated move to `0.1.x` before these are dependable in production.

`@johnhenry/iteration` is the mature one: it has shipped under three names across several years (see its page for the provenance).
