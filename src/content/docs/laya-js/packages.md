---
title: Packages
description: All 14 laya-js packages on npm — current versions, what each is for, what it depends on, and its license (MIT for original code, Apache-2.0 with NOTICE for code ported from laya-mlx / Laya).
sidebar:
  order: 5
---

All packages are on npm under `@johnhenry/*`. Each one has its own README with the full API and a `## Limitations` section, and a CHANGELOG; the links below go to them. Versions are the latest on npm.

Every release is built and published by the repo's GitHub Actions release workflow through **npm trusted publishing** (OIDC, no long-lived token), so every current version carries an npm **provenance attestation** linking it to the commit and workflow run that built it (the first 0.1.0/0.1.1 releases, published from a local machine, do not).

## Laya

These packages port code from laya-mlx and Laya, so they are **Apache-2.0** and ship a NOTICE file.

| Package | Version | What it is |
|---|---|---|
| [`@johnhenry/laya`](https://github.com/johnhenry/laya-js/tree/main/packages/laya) | 0.3.0 | `load()` / `predict()` / `createAgent()` / shortlist, plus quantized-checkpoint loading and `quantizeSafetensors`. A port of laya-mlx's `Agent`, `load` and `shortlist.py`. |
| [`@johnhenry/laya-core`](https://github.com/johnhenry/laya-js/tree/main/packages/laya-core) | 0.1.1 | The logic that needs no tensors: validation, prompts, tokenization, collation, calibration, result formatting. |
| [`@johnhenry/laya-router`](https://github.com/johnhenry/laya-js/tree/main/packages/laya-router) | 0.1.4 | Routes by language and task across the three checkpoints (`router.py`). |
| [`@johnhenry/laya-presets`](https://github.com/johnhenry/laya-js/tree/main/packages/laya-presets) | 0.1.1 | Ready-made question sets and email cleaning (`presets.py`, `email.py`). |
| [`@johnhenry/laya-cli`](https://github.com/johnhenry/laya-js/tree/main/packages/laya-cli) | 0.3.0 | The `laya` command: `laya predict`, `laya bench`, `laya quantize`. |
| [`@johnhenry/modernbert`](https://github.com/johnhenry/laya-js/tree/main/packages/modernbert) | 0.3.0 | ModernBERT / mmBERT encoder on any backend, from safetensors weights, including quantized Linear weights. Loading and `forward` are async. |
| [`@johnhenry/langdetect-lite`](https://github.com/johnhenry/laya-js/tree/main/packages/langdetect-lite) | 0.1.1 | Script and Latin-language detection with no model (`lang.py`). |

## Tensor backends

Original code, **MIT**.

| Package | Version | What it is |
|---|---|---|
| [`@johnhenry/tensor-backend`](https://github.com/johnhenry/laya-js/tree/main/packages/tensor-backend) | 0.3.0 | The op contract (async uploads, 22 optional numerics ops, optional quantized ops), plus a conformance suite whose golden cases come from Python MLX. |
| [`@johnhenry/backend-cpu`](https://github.com/johnhenry/laya-js/tree/main/packages/backend-cpu) | 0.3.2 | Pure-TypeScript f32 reference. Since 0.3, a re-export of `@johnhenry/math-plus-tensor-cpu`. |
| [`@johnhenry/backend-mlx`](https://github.com/johnhenry/laya-js/tree/main/packages/backend-mlx) | 0.4.0 | Native MLX through mlx-c (`koffi` on Node, `bun:ffi` on Bun, `Deno.dlopen` on Deno). |
| [`@johnhenry/backend-mlx-darwin-arm64`](https://github.com/johnhenry/laya-js/tree/main/packages/backend-mlx-darwin-arm64) | 0.1.1 | The prebuilt MLX 0.32.2 runtime, an optional dependency of backend-mlx. MIT: it contains Apple's MLX binaries, unmodified. |
| [`@johnhenry/backend-webgpu`](https://github.com/johnhenry/laya-js/tree/main/packages/backend-webgpu) | 0.4.0 | WGSL kernels with f16, flash attention and quantized Linears, for browsers, Deno, and Node/Bun through Dawn. Exposes its runtime for custom kernels. |

## Building blocks

Original code, **MIT**. Both are usable without Laya.

| Package | Version | What it is |
|---|---|---|
| [`@johnhenry/hf-cache`](https://github.com/johnhenry/laya-js/tree/main/packages/hf-cache) | 0.1.2 | Hugging Face Hub resolution plus a cache compatible with `huggingface_hub`: on disk in Node/Bun, in the Cache API in browsers. |
| [`@johnhenry/pyjson`](https://github.com/johnhenry/laya-js/tree/main/packages/pyjson) | 0.1.2 | CPython's `json.dumps`, `repr(float)` and `round()`, byte for byte. |

Safetensors reading is not in this repo. It comes from `@johnhenry/math-plus-safetensors` in [Math Plus](/math/math-plus/).

## Dependency order

From the leaves up:

1. `pyjson`, `tensor-backend`, `hf-cache`: no dependencies.
2. `langdetect-lite` and `laya-core`: depend on `pyjson`. `laya-core` also depends on `@huggingface/tokenizers`.
3. `backend-cpu`, `backend-mlx`, `backend-webgpu` and `modernbert`: depend on `tensor-backend`. `backend-cpu` also depends on `@johnhenry/math-plus-tensor-cpu`, which it re-exports.
4. `laya`: depends on `laya-core`, `modernbert`, `hf-cache`, `backend-cpu` and `math-plus-safetensors`. `backend-mlx` and `backend-webgpu` are optional peer dependencies (`^0.2.0 || ^0.3.0 || ^0.4.0`).
5. `laya-presets` and `laya-router`: depend on `laya-core`. The router also depends on `laya` and `langdetect-lite`.
6. `laya-cli`: depends on `laya` and `laya-router`.

In the other direction, two math-plus packages build on laya-js backends: `@johnhenry/math-plus-tensor-webgpu` 0.3 is a facade over `backend-webgpu`, and the experimental `@johnhenry/math-plus-tensor-mlx` is built on `backend-mlx`.

## Upgrading

- **From 0.1**: device uploads are async. `load()` and `predict()` are unchanged. Await `backend.fromHost(...)`, `createAgent`, `loadDecisionModel`, `loadModernBert`, `encoder.forward` / `embed`, `model.forwardTensors` and `model.uploadBatch`. If you construct `DecisionWeights` by hand, add `constants`. Backend implementers: make `fromHost` `async`.
- **From 0.2**: additive. The quantized ops are optional, and `laya` 0.3 keeps quantized checkpoints on the device by default; pass `quantized: "dequantize"` for the 0.2 behaviour.
- **Peer ranges**: `laya` and `laya-cli` 0.3 accept `backend-mlx` and `backend-webgpu` 0.2, 0.3 or 0.4. Quantized weights stay on the device only with the 0.4 backends; older ones fall back to dequantizing on load.

## JSR

These packages have a `jsr.json` and are set up for JSR trusted publishing, which publishes the TypeScript sources:

- `tensor-backend`
- `backend-cpu`
- `backend-mlx`
- `backend-webgpu`
- `modernbert`
- `laya-core`
- `laya-presets`
- `laya-router`
- `pyjson`
- `langdetect-lite`
- `hf-cache`

None of them is on JSR yet.

These packages stay npm-only:

- `laya`: it chooses its I/O module per runtime (browser or Node) with a package.json `imports` split that JSR can't express. Under Deno, install it from npm.
- `laya-cli`: a Node/Bun command-line tool.
- `backend-mlx-darwin-arm64`: the native binaries. Deno users add it with `deno add npm:@johnhenry/backend-mlx-darwin-arm64`.
