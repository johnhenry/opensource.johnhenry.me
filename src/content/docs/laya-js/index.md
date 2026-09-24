---
title: laya-js
description: Laya typed-decision models (choice / score / yes-no) in JavaScript — on native MLX, WebGPU, or a pure-TypeScript CPU reference, bit-identical to Python laya-mlx on MLX, with optional q8/q4 checkpoints.
sidebar:
  order: 0
---

laya-js runs the published [Laya](https://github.com/NandhaKishorM/laya) checkpoints in JavaScript. You give it a **state** (text or JSON) and a set of typed **questions**, and it returns calibrated answers:

- **choice**: pick one of N labels
- **score**: a position on an ordered scale
- **noul**: yes / no

It loads the fp16 safetensors that [laya-mlx](https://github.com/mizorewww/laya-mlx) publishes on Hugging Face, or smaller q8/q4 copies made with `laya quantize`. It runs them on:

- **native MLX**: Node, Bun and Deno on Apple Silicon, through its own mlx-c FFI binding.
- **WebGPU**: browsers, Deno, and Node/Bun through Dawn.
- **CPU**: a pure-TypeScript reference.

On MLX the answers are bit-identical to Python laya-mlx.

**Try it in the browser:** [the demos](https://johnhenry.github.io/laya-js/): the [playground](https://johnhenry.github.io/laya-js/playground/) and [Laya plays Snake](https://johnhenry.github.io/laya-js/snake/). Both run entirely on your GPU over WebGPU. The weights download once from Hugging Face; nothing is sent to a server.

## What's here

It is a family of 14 packages on npm under `@johnhenry/*`, not a single port. Most of the building blocks are useful without Laya: the tensor-backend contract, the three backends, the ModernBERT encoder, the Hugging Face cache, the language detector and the Python-compatible JSON.

- [Getting started](/laya-js/getting-started/): install, then ask your first question from code or the CLI.
- [Runtimes](/laya-js/runtimes/): Node, Bun, Deno and browsers, and which backend each one gets.
- [Backends](/laya-js/backends/): MLX, WebGPU and CPU; the async op contract; f16 vs f32; speed.
- [Quantized checkpoints](/laya-js/quantized-checkpoints/): q8 and q4, `laya quantize`, and what they cost in accuracy and save in memory.
- [Packages](/laya-js/packages/): all 14 packages, their current versions, and their licenses.

## What changed since 0.1

- **Async uploads** (`tensor-backend` 0.2): `backend.fromHost(...)` returns a Promise, like `read`. `load()` and `predict()` were already async and are unchanged; the lower-level `createAgent`, `loadDecisionModel` and `loadModernBert` now return Promises.
- **22 general-numerics ops** in the contract (`tensor-backend` 0.2): comparisons, logical ops, `sqrt`, `pow`, `erf`, `tanh`, `argmax`, `cumsum` and more. Every backend implements them natively.
- **MLX under Deno** (`backend-mlx` 0.3): a `Deno.dlopen` loader next to the koffi and `bun:ffi` ones. `@johnhenry/laya` parity passes under Deno 2.
- **Faster WebGPU** (`backend-webgpu` 0.3): 4–15% faster than 0.2 across the latency grid, plus runtime hooks (custom elementwise kernels, `wrapBuffer`, the exported `Runtime`) that math-plus builds on.
- **`backend-cpu` is now an alias** (0.3) that re-exports [`@johnhenry/math-plus-tensor-cpu`](/math/math-plus-tensor/).
- **Quantized checkpoints** (`laya` 0.2 and 0.3): `laya quantize --bits 8|4`, dequantize-on-load, and since 0.3 weights that stay quantized on the GPU: 52–55% of fp16 device memory for q8, 28% for q4.
- **Live demos** on [GitHub Pages](https://johnhenry.github.io/laya-js/), rebuilt on every push to `main`.
- **Provenance**: every package is published from GitHub Actions through npm trusted publishing, with a provenance attestation.

## Which package do I want?

| I want to... | Start with |
|---|---|
| Ask Laya typed questions from JS/TS | `@johnhenry/laya` (`load()` + `predict()`), plus a GPU backend next to it |
| Ask from a shell, benchmark a machine, or write a q8/q4 checkpoint | `@johnhenry/laya-cli` (`npx @johnhenry/laya-cli predict`, `laya quantize`) |
| Pick the English or multilingual checkpoint automatically | `@johnhenry/laya-router` |
| Use ready-made triage / email / moderation questions | `@johnhenry/laya-presets` |
| Run at native speed on Apple Silicon | `@johnhenry/backend-mlx` |
| Run on a GPU in the browser (or in Node/Bun/Deno) | `@johnhenry/backend-webgpu` |
| Run anywhere, slowly but exactly | `@johnhenry/backend-cpu` (or `@johnhenry/math-plus-tensor-cpu`, which it re-exports) |
| Write a new backend | `@johnhenry/tensor-backend`: the op contract plus a conformance suite |
| Run a ModernBERT / mmBERT encoder | `@johnhenry/modernbert` |
| Download and cache Hugging Face files like `huggingface_hub` | `@johnhenry/hf-cache` |
| Produce exactly Python's `json.dumps` / `round()` output | `@johnhenry/pyjson` |

## Results

All numbers come from one machine: an **Apple M2 with a 10-core GPU, fanless**, running macOS 27, Node 24.9, Bun 1.2.17 and MLX 0.32.2. It is not the M3 Max behind laya-mlx's own published figures, so compare against the Python number measured on the same M2, below.

:::caution[Thermal caveat]
A fanless M2 drops to about 35% of its cold GPU speed after roughly 10 s of sustained load, and recovers after about 5 s idle. Long-running benchmarks (`laya bench`, long Snake runs) measure the throttled machine. The latency numbers here idle 5 s before each cell and time for at most 1 s.
:::

**Parity with Python laya-mlx.** The laya-mlx validation set has 63 questions (16 cases, 8 languages). "argmax" is the chosen label, most likely score level or noul side; "exact" means the whole answer object, 4-decimal rounding included, deep-equals Python's. f32 runs are compared with Python's fp32 result (tolerance 1e-4), f16 runs with its fp16 result (0.02).

| checkpoint | MLX f32 | MLX f16 | WebGPU f32 | WebGPU f16 |
|---|---|---|---|---|
| English (`aac6fef/laya-mlx`, ModernBERT-large 421M) | 63/63 argmax, 63/63 exact | 63/63, 63/63 | 63/63, 62/63 (max \|Δp\| 1.0e-4) | 63/63, 13/63 (5.0e-3) |
| Multilingual (`aac6fef/laya-multilingual-mlx`, mmBERT-base 322M) | 63/63, 63/63 | 63/63, 63/63 | 63/63, 63/63 | 63/63, 26/63 (1.3e-3) |
| Typed decisions (`aac6fef/laya-typed-decisions-mlx`) | 63/63, 63/63 | 63/63, 63/63 | 63/63, 62/63 (1.0e-4) | 63/63, 16/63 (1.3e-3) |

All 12 configurations pick the same answer as Python on every question (756/756). The WebGPU f16 differences come from different f16 kernels, well inside laya-mlx's own 0.02 fp16 tolerance. The CPU reference also gets 63/63 on all three checkpoints (max logit error ≤ 4e-5), at 27–70 s per case.

**Speed.** English checkpoint, f16, batch 1, median forward-pass time in ms with a cold GPU:

| tokens | 16 | 33 | 64 | 93 | 128 | 256 | 512 |
|---|---:|---:|---:|---:|---:|---:|---:|
| MLX (JS) | 20.0 | 23.6 | 23.6 | 41.7 | 39.0 | 80.4 | 154.4 |
| WebGPU (Node/Dawn) | 14.6 | 24.1 | 37.9 | 53.8 | 67.2 | 130.2 | 252.2 |

Python laya-mlx's full `predict()` at 93 tokens takes 46.2 ms (P50) on the same machine: JS on MLX is at parity, because both call the same MLX kernels. WebGPU takes 1.3–1.7× as long as MLX from 64 tokens up; the gap is GEMM throughput (≈1.95 vs ≈3 TFLOP/s), since WGSL can't reach Apple's matrix units at full speed. Batch 3 and 16, the WebGPU 0.2 comparison and the Snake numbers are on the [Backends](/laya-js/backends/#speed) page and in [docs/RESULTS.md](https://github.com/johnhenry/laya-js/blob/main/docs/RESULTS.md).

**Quantized.** q8 keeps 63/63 argmax on all three checkpoints (max |Δp| ≤ 0.047) at half the download and half the device memory. q4 is 28% of the size but changes 1–5 of 63 answers per checkpoint. See [Quantized checkpoints](/laya-js/quantized-checkpoints/).

## Relationship to Math

laya-js is not part of the [Math](/math/) family, but the two now depend on each other in both directions:

- **laya-js uses math-plus.** Every checkpoint is read through `openSafetensors` from `@johnhenry/math-plus-safetensors`, the only safetensors implementation in either repo. `@johnhenry/tensor-backend` uses the same dtype names and `HostTensor` layout as `@johnhenry/math-plus-tensor-core`, so `toMathPlusArgs` hands results to `Tensor.fromTypedArray` without a copy. `@johnhenry/backend-cpu` is a re-export of `@johnhenry/math-plus-tensor-cpu`.
- **math-plus uses laya-js.** `@johnhenry/math-plus-tensor-webgpu` 0.3 is a facade over `@johnhenry/backend-webgpu` (one WebGPU runtime for both families), and the experimental `@johnhenry/math-plus-tensor-mlx` is built on `@johnhenry/backend-mlx`. Both depend on `@johnhenry/tensor-backend`.

## Licensing

Each package's license depends on where its code came from:

- **MIT**: original code. `tensor-backend`, `backend-cpu`, `backend-mlx`, `backend-webgpu`, `pyjson`, `hf-cache`. Also `backend-mlx-darwin-arm64`, which bundles Apple's MIT-licensed MLX binaries unmodified.
- **Apache-2.0, with a NOTICE file**: packages that port code from [laya-mlx](https://github.com/mizorewww/laya-mlx) and [Laya](https://github.com/NandhaKishorM/laya), both Apache-2.0. `laya-core`, `laya`, `laya-router`, `laya-presets`, `langdetect-lite`, `laya-cli`, `modernbert`.

Model weights are not distributed with any package, and neither are quantized copies. They download from Hugging Face under their own licenses. laya-js is an independent port, not an official Convai Innovations or Apple release.

## Source

[github.com/johnhenry/laya-js](https://github.com/johnhenry/laya-js): an npm workspaces monorepo with every package, the three examples (a terminal Snake, the browser Snake and the web playground), and the parity fixtures generated from Python.
