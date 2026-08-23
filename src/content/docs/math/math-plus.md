---
title: Math Plus
description: Seventeen focused packages for numeric computing — tensors, autograd, WASM and WebGPU kernels, dataframes, FFT, signal, image, and units.
---

Math Plus is a family, not a package. Install only what you need.

```bash
npm install @johnhenry/math-plus-tensor-core
```

Everything below is published independently under `@johnhenry/math-plus-*`, so a project that wants an FFT doesn't pull in a WebGPU backend or an ONNX runtime.

## Tensors

| Package | Purpose |
|---|---|
| `tensor-core` | Typed n-dimensional arrays — dtypes, strides and views, broadcasting, `.npy` I/O. Start here. |
| `tensor-autograd` | Reverse-mode automatic differentiation over `tensor-core` tensors |
| `tensor-compile` | Elementwise expression IR and fusion — trace once, execute fused |
| `tensor-wasm` | Rust→WASM CPU kernels, flat-numeric extern-C ABI with no wasm-bindgen marshalling on hot paths |
| `tensor-webgpu` | WebGPU GEMM, attention-adjacent primitives, and IR fusion. Chromium-family browsers only. |

## Data

| Package | Purpose |
|---|---|
| `frame-arrow` | Immutable, expression-oriented `Frame`/`Series` dataframes on Apache Arrow |
| `frame-parquet` | Parquet read/write into `frame-arrow`, built on hyparquet |
| `data` | Async dataset pipelines — a curated `data` namespace |

## Signal, media, and numerics

| Package | Purpose |
|---|---|
| `fft` | `ComplexTensor` plus `fft`/`ifft`/`rfft`/`irfft` |
| `signal` | `convolve`, `stft`/`istft`, `findPeaks`, `sosFilter`, `butter`, `resamplePoly` |
| `image` | resize and normalize tensor operations |

## Types, bridges, and infrastructure

| Package | Purpose |
|---|---|
| `scalar-types` | Re-exports `@johnhenry/math`'s `ComplexNumber`, `Rational`, `Decimal` with tensor-facing traits |
| `unit` | Unit and dimension scalar type — magnitude plus dimension metadata, parsing, formatting |
| `adapter-math` | Bridge between `@johnhenry/math`'s `Vector`/`Matrix` and the tensor side |
| `adapter-onnx` | ONNX Runtime Web wrapper — `onnx.load(source)` / `model.run(inputs)` |
| `mcp` | MCP server exposing symbolic evaluation and guarded tensor/linalg computation to agents |
| `telemetry` | Shared event schema and sink registry — a stable stream any UI can consume |

## On the WASM SIMD benchmark

`tensor-wasm` has a benchmark asserting SIMD kernels beat scalar ones. It is deliberately **not** chained into `npm test`.

The reason is measurement, not correctness: the same commit measured a 1.12× gain on one runner and 1.01× with zero variance on another. Any threshold low enough to pass the slower machine would also pass a real regression to parity, which makes the assertion worthless as a gate. It runs via `npm run test:bench` where a human reads the number.

## Not on npm

`johnhenry-math-plus-interop` publishes to **PyPI**, not npm, as the Python interop bridge (module `math_plus_interop`).
