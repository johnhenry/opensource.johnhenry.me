---
title: Getting started
description: Install laya-js for Node, Bun, Deno or browsers, and ask a Laya checkpoint its first typed question, from code or from the shell.
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

Both GPU backends are optional peer dependencies (`laya` 0.3 accepts versions 0.2 through 0.4 of each). `laya` loads them with a dynamic `import()` only when they are selected.

On darwin/arm64, `@johnhenry/backend-mlx` pulls in two things:

- The prebuilt MLX 0.32.2 runtime, as the optional dependency `@johnhenry/backend-mlx-darwin-arm64` (a 64 MB download).
- `koffi`, a prebuilt N-API addon, for Node's FFI.

Nothing is compiled on your machine, and no install script runs.

**Bun ≥ 1.2.** Install the same packages with `bun add`. For MLX, Bun uses its built-in `bun:ffi` instead of koffi.

**Deno 2.** `@johnhenry/laya` runs under Deno from an npm install, with MLX loaded through `Deno.dlopen`; on MLX its answers match Python exactly on all three checkpoints.

**Browsers.** `npm install @johnhenry/laya @johnhenry/backend-webgpu` and bundle as usual; the `browser` export condition keeps `node:fs`, koffi and libmlxc out of the bundle.

The flags, permissions and per-runtime caveats for both are on the [Runtimes](/laya-js/runtimes/) page.

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

`load()` and `predict()` both return Promises. `load()` resolves once every weight is on the device: the uploads are started together and awaited once.

The first `load` downloads the checkpoint into the standard `~/.cache/huggingface/hub` layout, the same cache Python's `hf download` uses. Later runs are fully local, and `offline: true` guarantees that nothing touches the network. In a browser the weights go into the Cache API instead. `load()` also accepts a local directory, or an http(s) base URL whose weights it reads with Range requests, in Node and Bun as well as in browsers.

The three published checkpoints:

| Checkpoint | Encoder | Download |
|---|---|---|
| `aac6fef/laya-mlx`: English | ModernBERT-large, 421M | ≈ 843 MB |
| `aac6fef/laya-multilingual-mlx`: 1,800+ languages | mmBERT-base, 322M | ≈ 644 MB |
| `aac6fef/laya-typed-decisions-mlx`: fine-tuned for typed choice/score/yes-no | ModernBERT-large | ≈ 843 MB |

`@johnhenry/laya-router` picks between them by detected language and task. `predictShortlist` narrows a choice question with hundreds of options to the top *k* by embedding similarity before it asks the model.

To download half as much, make a q8 copy with `laya quantize` and load that instead; `load()` detects it by itself. See [Quantized checkpoints](/laya-js/quantized-checkpoints/).

### Useful `load` options

| option | default | |
|---|---|---|
| `backend` | `"auto"` | a `Backend` instance (you own it), or `"auto"` \| `"mlx"` \| `"webgpu"` \| `"cpu"` |
| `dtype` | `"f16"` | `"f16"` \| `"f32"`; `agent.dtype` reports what is actually used |
| `batchSize` | 16 | rows per forward pass |
| `compile` | false | trace the forward pass with `mlx_compile`, once per input shape (MLX only) |
| `quantized` | `"device"` | for q8/q4 checkpoints: keep the weights quantized on MLX/WebGPU, or `"dequantize"` on the host |
| `offline`, `revision`, `token`, `subfolder`, `onProgress`, `fetch` | | passed to `@johnhenry/hf-cache` |

### Lower-level API: now async

If you build the agent yourself instead of calling `load()`, note that device uploads have been async since `tensor-backend` 0.2 (`laya` 0.2):

```ts
const agent = await createAgent(parts);            // was synchronous in 0.1
const model = await loadDecisionModel(backend, { encoderConfig, agentConfig, weights, dtype });
const x = await backend.fromHost({ dtype: "f16", shape: [2, 3], data: new Float16Array(6) });
```

`forwardTensors`, `uploadBatch` and the function `compiled()` returns are async too. `forwardCore` stays synchronous, so it can still be traced by `compile`.

## From the shell

```bash
npx @johnhenry/laya-cli predict \
  --state "I was billed twice. Please refund the duplicate." \
  --questions '{"department": {"type": "choice", "instructions": "Who should handle this?", "criteria": ["billing", "technical", "sales"]}}'
```

`laya predict` prints the same JSON that `laya-mlx predict` prints. With `--backend mlx`, the README example's output is byte-identical to the Python CLI's. `laya predict --route` picks the checkpoint by language. `laya bench` mirrors laya-mlx's benchmark worker. `laya quantize --model <repo|dir> --bits 8|4 --out <dir>` writes a quantized checkpoint.

## In the browser, without installing anything

The [demos page](https://johnhenry.github.io/laya-js/) links both examples, deployed to GitHub Pages on every push to laya-js `main`:

- [Playground](https://johnhenry.github.io/laya-js/playground/): pick a checkpoint, edit the state, build questions and see a probability bar for every option.
- [Snake](https://johnhenry.github.io/laya-js/snake/): the laya-mlx Snake demo, where the model picks every move and a cycle-safety shield steps in when it would die.

Both need WebGPU (Chrome or Edge 113+) and share one Cache API store, so the weights download once for both. Their source is in the repo's [`examples/`](https://github.com/johnhenry/laya-js/tree/main/examples) directory.
