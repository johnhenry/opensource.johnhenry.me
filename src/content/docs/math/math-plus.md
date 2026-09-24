---
title: Math Plus
description: Twenty-one focused packages for numeric computing — tensors, autograd, WASM kernels, WebGPU and MLX devices, safetensors, dataframes, FFT, signal, image, and units.
---

Math Plus is a family, not a package. Install only what you need.

```bash
npm install @johnhenry/math-plus-tensor-core
```

Everything below is published independently under `@johnhenry/math-plus-*`, so a project that wants an FFT doesn't pull in a WebGPU backend or an ONNX runtime.

## The pages here

The clusters each get a page of their own — the tables below are the map; the cluster pages are where the traps live:

- [Tensors](/math/math-plus-tensor/) — tensor-core, autograd, compile, WASM, the WebGPU / MLX / CPU device packages, safetensors and the canonical erf, and how to actually pick a backend (spoiler: there is no `setBackend()`; devices are explicit, and a measured rule decides when a GEMM is worth sending to WebGPU)
- [Signal & media](/math/math-plus-signal/) — fft, signal, image, and every deliberate NumPy/SciPy convention deviation in one table
- [Data](/math/math-plus-data/) — frame-arrow, frame-parquet, data, scalar-types, and the bigint/null/laziness traps
- [Interop & telemetry](/math/math-plus-interop/) — mcp, the PyPI-side Python bridge, telemetry

Each package also has a full README in the [repo](https://github.com/johnhenry/math-plus), and `examples/` there has a runnable walkthrough per cluster.

## Tensors

| Package | Purpose |
|---|---|
| `tensor-core` | Typed n-dimensional arrays — dtypes, strides and views, broadcasting, `.npy` I/O. Start here. |
| `tensor-autograd` | Reverse-mode automatic differentiation over `tensor-core` tensors |
| `tensor-compile` | Elementwise expression IR and fusion — trace once, execute fused |
| `tensor-wasm` | Rust→WASM CPU kernels, flat-numeric extern-C ABI with no wasm-bindgen marshalling on hot paths; a blocked SIMD GEMM (~37 GFLOP/s at 1024³ on an M2) |
| `tensor-webgpu` | WebGPU device facade over laya-js's `@johnhenry/backend-webgpu`: GEMM, fused attention, IR fusion. Browsers, Deno, and Node/Bun via Dawn. |
| `tensor-mlx` | Experimental MLX (Metal) device over `@johnhenry/backend-mlx`, with explicit async transfers. Apple Silicon; Node, Bun, Deno. |
| `tensor-cpu` | The CPU reference `Backend` for the `@johnhenry/tensor-backend` contract, on tensor-core's kernels |
| `safetensors` | safetensors reader/writer with lazy file, Blob and HTTP-Range reads |
| `special` | The one canonical double-precision `erf`/`erfc`/GELU, shared by tensor-core and frame-arrow |

Details, backend selection, [RFC 0001](/math/math-plus-tensor/#the-device-contract-rfc-0001)'s device decision, and traps: [the tensor cluster page](/math/math-plus-tensor/).

The device packages share their contract and runtimes with [laya-js](/laya-js/): `tensor-webgpu` and `tensor-mlx` sit on its `backend-webgpu` and `backend-mlx`, and its `backend-cpu` re-exports `tensor-cpu`.

## Data

| Package | Purpose |
|---|---|
| `frame-arrow` | Immutable, expression-oriented `Frame`/`Series` dataframes on Apache Arrow |
| `frame-parquet` | Parquet read/write into `frame-arrow`, built on hyparquet |
| `data` | Async dataset pipelines — a curated `data` namespace |

Details and traps: [the data cluster page](/math/math-plus-data/) (`scalar-types` is covered there too).

## Signal, media, and numerics

| Package | Purpose |
|---|---|
| `fft` | `ComplexTensor` plus `fft`/`ifft`/`rfft`/`irfft` |
| `signal` | `convolve`, `stft`/`istft`, `findPeaks`, `sosFilter`, `butter`, `resamplePoly` |
| `image` | resize and normalize tensor operations |

Details and the NumPy/SciPy deviation table: [the signal & media cluster page](/math/math-plus-signal/).

## Types, bridges, and infrastructure

| Package | Purpose |
|---|---|
| `scalar-types` | Re-exports `@johnhenry/math`'s `ComplexNumber`, `Rational`, `Decimal` with tensor-facing traits |
| `unit` | Unit and dimension scalar type — magnitude plus dimension metadata, parsing, formatting |
| `adapter-math` | Bridge between `@johnhenry/math`'s `Vector`/`Matrix` and the tensor side |
| `adapter-onnx` | ONNX Runtime Web wrapper — `onnx.load(source)` / `model.run(inputs)` |
| `mcp` | MCP server exposing symbolic evaluation and guarded tensor/linalg computation to agents |
| `telemetry` | Shared event schema and sink registry — a stable stream any UI can consume |

`mcp`, `telemetry`, and the Python bridge get a page: [interop & telemetry](/math/math-plus-interop/).

## On the WASM SIMD benchmark

`tensor-wasm` has a benchmark asserting SIMD kernels beat scalar ones. It is deliberately **not** chained into `npm test`.

The reason is measurement, not correctness: the same commit measured a 1.12× gain on one runner and 1.01× with zero variance on another. Any threshold low enough to pass the slower machine would also pass a real regression to parity, which makes the assertion worthless as a gate. It runs via `npm run test:bench` where a human reads the number.

## Not on npm

`johnhenry-math-plus-interop` publishes to **PyPI**, not npm, as the Python interop bridge (module `math_plus_interop`).
