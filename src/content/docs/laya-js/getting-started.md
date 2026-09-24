---
title: Getting started
description: Install laya-js for Node, Bun, browsers or Deno, and ask a Laya checkpoint its first typed question, from code or from the shell.
sidebar:
  order: 1
---

## Install

**Node ≥ 24.** Types are stripped natively, so there is no build step. Install `@johnhenry/laya` plus the backend for your machine:

```bash
npm install @johnhenry/laya @johnhenry/backend-mlx      # Apple Silicon: native MLX
npm install @johnhenry/laya @johnhenry/backend-webgpu   # anywhere with a GPU: WebGPU via Dawn
npm install @johnhenry/laya                             # CPU reference only
```

Both GPU backends are optional peer dependencies. `laya` loads them with a dynamic `import()` only when they are selected.

On darwin/arm64, `@johnhenry/backend-mlx` pulls in two things:

- The prebuilt MLX 0.32.2 runtime, as the optional dependency `@johnhenry/backend-mlx-darwin-arm64` (a 64 MB download).
- `koffi`, a prebuilt N-API addon, for Node's FFI.

Nothing is compiled on your machine, and no install script runs.

**Bun ≥ 1.2.** Install the same packages with `bun add`. For MLX, Bun uses its built-in `bun:ffi` instead of koffi.

**Browsers.** Run `npm install @johnhenry/laya @johnhenry/backend-webgpu` and bundle as usual. The `browser` export condition swaps in the browser I/O: a Cache API model cache and `fetch`. Your bundler never sees `node:fs`, koffi or libmlxc. WebGPU needs Chrome or Edge 113+ (f16 from 120). Safari 26 and Firefox 141 are expected to work but are not verified.

**Deno.** The backend-agnostic packages (`tensor-backend`, `backend-cpu`, `backend-webgpu`, `modernbert`, `laya-core`, `pyjson`, `langdetect-lite`, `hf-cache`, `laya-presets`, `laya-router`) are prepared for JSR, but not yet published there. `@johnhenry/laya` itself and the MLX backend support only Node, Bun and browsers for now.

## Quick start

This is the laya-mlx README example, in JavaScript:

```ts
import { load } from "@johnhenry/laya";

const agent = await load("aac6fef/laya-mlx"); // MLX → WebGPU → CPU, whichever is available
const result = await agent.predict("I was billed twice. Please refund the duplicate.", {
  department: {
    type: "choice",
    instructions: "Who should handle this?",
    criteria: ["billing", "technical", "sales"],
  },
});
console.log(result.answers.department); // { type: "choice", choice: "billing", confidence, probabilities, … }
agent.dispose();
```

The first `load` downloads the checkpoint into the standard `~/.cache/huggingface/hub` layout, the same cache Python's `hf download` uses. Later runs are fully local, and `offline: true` guarantees that nothing touches the network. In a browser the weights go into the Cache API instead.

The three published checkpoints:

| Checkpoint | Encoder | Download |
|---|---|---|
| `aac6fef/laya-mlx`: English | ModernBERT-large, 421M | ≈ 804 MB |
| `aac6fef/laya-multilingual-mlx`: 1,800+ languages | mmBERT-base, 322M | ≈ 614 MB |
| `aac6fef/laya-typed-decisions-mlx`: fine-tuned for typed choice/score/yes-no | ModernBERT-large | ≈ 804 MB |

`@johnhenry/laya-router` picks between them by detected language and task. `predictShortlist` narrows a choice question with hundreds of options to the top *k* by embedding similarity before it asks the model.

## From the shell

```bash
npx @johnhenry/laya-cli predict \
  --state "I was billed twice. Please refund the duplicate." \
  --questions '{"department": {"type": "choice", "instructions": "Who should handle this?", "criteria": ["billing", "technical", "sales"]}}'
```

`laya predict` prints the same JSON that `laya-mlx predict` prints. With `--backend mlx`, the README example's output is byte-identical to the Python CLI's. `laya predict --route` picks the checkpoint by language. `laya bench` mirrors laya-mlx's benchmark worker.

## In the browser, without installing anything

- [Playground](https://johnhenry.github.io/laya-js/playground/): pick a checkpoint, edit the state, build questions and see a probability bar for every option.
- [Snake](https://johnhenry.github.io/laya-js/snake/): the laya-mlx Snake demo, where the model picks every move and a cycle-safety shield steps in when it would die.

Both demos share one Cache API store, so the weights download once for both. Their source is in the repo's [`examples/`](https://github.com/johnhenry/laya-js/tree/main/examples) directory.
