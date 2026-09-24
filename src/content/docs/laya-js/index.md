---
title: laya-js
description: Laya typed-decision models (choice / score / yes-no) in JavaScript — on native MLX, WebGPU, or a pure-TypeScript CPU reference, bit-identical to Python laya-mlx on MLX.
sidebar:
  order: 0
---

laya-js runs the published [Laya](https://github.com/NandhaKishorM/laya) checkpoints in JavaScript. You give it a **state** (text or JSON) and a set of typed **questions**, and it returns calibrated answers:

- **choice**: pick one of N labels
- **score**: a position on an ordered scale
- **noul**: yes / no

It loads the fp16 safetensors that [laya-mlx](https://github.com/mizorewww/laya-mlx) publishes on Hugging Face. It runs them on:

- **native MLX**: Node and Bun on Apple Silicon, through its own mlx-c FFI binding.
- **WebGPU**: browsers, Deno, and Node/Bun through Dawn.
- **CPU**: a pure-TypeScript reference.

On MLX the answers are bit-identical to Python laya-mlx.

**Try it in the browser:** [the playground](https://johnhenry.github.io/laya-js/playground/) and [Laya plays Snake](https://johnhenry.github.io/laya-js/snake/). Both run entirely on your GPU over WebGPU. The weights download once from Hugging Face; nothing is sent to a server.

## What's here

It is a family of 13 packages on npm under `@johnhenry/*`, not a single port. Most of the building blocks are useful without Laya: the tensor-backend contract, the three backends, the ModernBERT encoder, the Hugging Face cache, the language detector and the Python-compatible JSON.

- [Getting started](/laya-js/getting-started/): install for Node, Bun, browsers or Deno, then ask your first question from code or the CLI.
- [Backends](/laya-js/backends/): MLX, WebGPU and CPU; which runtime gets which; f16 vs f32.
- [Packages](/laya-js/packages/): all 13 packages, what each is for, and its license.

## Which package do I want?

| I want to... | Start with |
|---|---|
| Ask Laya typed questions from JS/TS | `@johnhenry/laya` (`load()` + `predict()`), plus a GPU backend next to it |
| Ask from a shell, or benchmark a machine | `@johnhenry/laya-cli` (`npx @johnhenry/laya-cli predict`) |
| Pick the English or multilingual checkpoint automatically | `@johnhenry/laya-router` |
| Use ready-made triage / email / moderation questions | `@johnhenry/laya-presets` |
| Run at native speed on Apple Silicon | `@johnhenry/backend-mlx` |
| Run on a GPU in the browser (or in Node/Bun/Deno) | `@johnhenry/backend-webgpu` |
| Run anywhere, slowly but exactly | `@johnhenry/backend-cpu` |
| Write a new backend | `@johnhenry/tensor-backend`: the op contract plus a conformance suite |
| Run a ModernBERT / mmBERT encoder | `@johnhenry/modernbert` |
| Download and cache Hugging Face files like `huggingface_hub` | `@johnhenry/hf-cache` |
| Produce exactly Python's `json.dumps` / `round()` output | `@johnhenry/pyjson` |

## Results

The laya-mlx validation set has 63 questions (16 cases, 8 languages). It was run on all three published checkpoints, on MLX and WebGPU, in both f32 and f16. All 12 configurations picked the same answer as Python on all 63 questions (756/756). On MLX, every configuration matched Python's answer objects exactly (63/63); the WebGPU f16 kernels differ from the third decimal on.

On an Apple M2 at 93 tokens, one forward pass takes 39.5 ms on MLX and 57.4 ms on WebGPU (Dawn). Python laya-mlx's `predict()` takes 46.2 ms on the same machine.

The full tables are in [docs/RESULTS.md](https://github.com/johnhenry/laya-js/blob/main/docs/RESULTS.md): the parity matrix, the latency grid by sequence length, the thermal caveat for fanless machines, and the Snake numbers.

## Relationship to Math

laya-js uses the [Math](/math/) family; it is not part of it. Every checkpoint is read through `openSafetensors` from `@johnhenry/math-plus-safetensors`, which is the only safetensors implementation in either repo. `@johnhenry/tensor-backend` uses the same dtype names and `HostTensor` layout as `@johnhenry/math-plus-tensor-core`, so its results go to `Tensor.fromTypedArray` without a copy.

## Licensing

Each package's license depends on where its code came from:

- **MIT**: original code. `tensor-backend`, `backend-cpu`, `backend-mlx`, `backend-webgpu`, `pyjson`, `hf-cache`. Also `backend-mlx-darwin-arm64`, which bundles Apple's MIT-licensed MLX binaries unmodified.
- **Apache-2.0, with a NOTICE file**: packages that port code from [laya-mlx](https://github.com/mizorewww/laya-mlx) and [Laya](https://github.com/NandhaKishorM/laya), both Apache-2.0. `laya-core`, `laya`, `laya-router`, `laya-presets`, `langdetect-lite`, `laya-cli`, `modernbert`.

Model weights are not distributed with any package. They download from Hugging Face under their own licenses. laya-js is an independent port, not an official Convai Innovations or Apple release.

## Source

[github.com/johnhenry/laya-js](https://github.com/johnhenry/laya-js): an npm workspaces monorepo with every package, the three examples (a terminal Snake, the browser Snake and the web playground), and the parity fixtures generated from Python.
