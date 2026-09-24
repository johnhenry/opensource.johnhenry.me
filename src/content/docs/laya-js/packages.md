---
title: Packages
description: All 13 laya-js packages on npm — what each is for, what it depends on, and its license (MIT for original code, Apache-2.0 with NOTICE for code ported from laya-mlx / Laya).
sidebar:
  order: 3
---

All packages are on npm under `@johnhenry/*`. Each one has its own README with the full API and a `## Limitations` section; the links below go to them.

## Laya

These packages port code from laya-mlx and Laya, so they are **Apache-2.0** and ship a NOTICE file.

| Package | What it is |
|---|---|
| [`@johnhenry/laya`](https://github.com/johnhenry/laya-js/tree/main/packages/laya) | `load()` / `predict()` / `createAgent()` / shortlist. A port of laya-mlx's `Agent`, `load` and `shortlist.py`. |
| [`@johnhenry/laya-core`](https://github.com/johnhenry/laya-js/tree/main/packages/laya-core) | The logic that needs no tensors: validation, prompts, tokenization, collation, calibration, result formatting. |
| [`@johnhenry/laya-router`](https://github.com/johnhenry/laya-js/tree/main/packages/laya-router) | Routes by language and task across the three checkpoints (`router.py`). |
| [`@johnhenry/laya-presets`](https://github.com/johnhenry/laya-js/tree/main/packages/laya-presets) | Ready-made question sets and email cleaning (`presets.py`, `email.py`). |
| [`@johnhenry/laya-cli`](https://github.com/johnhenry/laya-js/tree/main/packages/laya-cli) | The `laya` command: `laya predict`, `laya bench`. |
| [`@johnhenry/modernbert`](https://github.com/johnhenry/laya-js/tree/main/packages/modernbert) | ModernBERT / mmBERT encoder on any backend, from safetensors weights. |
| [`@johnhenry/langdetect-lite`](https://github.com/johnhenry/laya-js/tree/main/packages/langdetect-lite) | Script and Latin-language detection with no model (`lang.py`). |

## Tensor backends

Original code, **MIT**.

| Package | What it is |
|---|---|
| [`@johnhenry/tensor-backend`](https://github.com/johnhenry/laya-js/tree/main/packages/tensor-backend) | The op contract, plus a conformance suite whose golden cases come from Python MLX. |
| [`@johnhenry/backend-cpu`](https://github.com/johnhenry/laya-js/tree/main/packages/backend-cpu) | Pure-TypeScript f32 reference. |
| [`@johnhenry/backend-mlx`](https://github.com/johnhenry/laya-js/tree/main/packages/backend-mlx) | Native MLX through mlx-c (`bun:ffi` / `koffi`). |
| [`@johnhenry/backend-mlx-darwin-arm64`](https://github.com/johnhenry/laya-js/tree/main/packages/backend-mlx-darwin-arm64) | The prebuilt MLX 0.32.2 runtime, an optional dependency of backend-mlx. MIT: it contains Apple's MLX binaries, unmodified. |
| [`@johnhenry/backend-webgpu`](https://github.com/johnhenry/laya-js/tree/main/packages/backend-webgpu) | WGSL kernels with f16 and flash attention, for browsers, Deno, and Node/Bun through Dawn. |

## Building blocks

Original code, **MIT**. Both are usable without Laya.

| Package | What it is |
|---|---|
| [`@johnhenry/hf-cache`](https://github.com/johnhenry/laya-js/tree/main/packages/hf-cache) | Hugging Face Hub resolution plus a cache compatible with `huggingface_hub`: on disk in Node/Bun, in the Cache API in browsers. |
| [`@johnhenry/pyjson`](https://github.com/johnhenry/laya-js/tree/main/packages/pyjson) | CPython's `json.dumps`, `repr(float)` and `round()`, byte for byte. |

Safetensors reading is not in this repo. It comes from `@johnhenry/math-plus-safetensors` in [Math Plus](/math/math-plus/).

## Dependency order

From the leaves up:

1. `pyjson`, `tensor-backend`, `hf-cache`: no dependencies.
2. `langdetect-lite` and `laya-core`: depend on `pyjson`. `laya-core` also depends on `@huggingface/tokenizers`.
3. `backend-cpu`, `backend-mlx`, `backend-webgpu` and `modernbert`: depend on `tensor-backend`.
4. `laya`: depends on `laya-core`, `modernbert`, `hf-cache`, `backend-cpu` and `math-plus-safetensors`. `backend-mlx` and `backend-webgpu` are optional peer dependencies.
5. `laya-presets` and `laya-router`: depend on `laya-core`. The router also depends on `laya` and `langdetect-lite`.
6. `laya-cli`: depends on `laya` and `laya-router`.

## JSR

These packages are prepared for JSR, which publishes the TypeScript sources:

- `tensor-backend`
- `backend-cpu`
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

- `laya`: it chooses its I/O module per runtime (browser or Node) with a package.json `imports` split that JSR can't express.
- `laya-cli`: a Node/Bun command-line tool.
- `backend-mlx`: native FFI, with no `Deno.dlopen` adapter yet.
- `backend-mlx-darwin-arm64`: the native binaries.
