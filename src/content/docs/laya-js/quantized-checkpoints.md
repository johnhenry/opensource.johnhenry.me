---
title: Quantized checkpoints
description: q8 and q4 Laya checkpoints — writing them with laya quantize, loading them (quantized on the GPU or dequantized on load), accuracy against fp16, device memory, speed, and hosting.
sidebar:
  order: 4
---

laya-js can load Laya checkpoints whose large weight matrices are stored as 8-bit (**q8**) or 4-bit (**q4**) integers. They are a quarter to half the download, and on MLX and WebGPU they also take a quarter to half the GPU memory.

**In short:** q8 is a safe drop-in. It halves the download and the device memory and gave the same decisions as fp16 on every question of the parity set. q4 is 28% of the size, but it changes some answers; validate it on your own questions first.

No quantized checkpoints are published: you make them from the fp16 ones with `laya quantize`, and host them wherever you like.

## Making one

```bash
npx @johnhenry/laya-cli quantize --model aac6fef/laya-mlx --bits 8 --out ./laya-mlx-q8
npx @johnhenry/laya-cli quantize --model aac6fef/laya-mlx --bits 4 --out ./laya-mlx-q4
```

`--model` is a Hub repo (read through the Hugging Face cache) or a local checkpoint directory. The output is a complete checkpoint directory: the quantized `model.safetensors`, the configs and tokenizer copied unchanged, the source's `LICENSE` and `NOTICE`, and a README saying it is derived from the Apache-2.0 Laya checkpoint. Python laya-mlx cannot read it.

| flag | default | |
|---|---|---|
| `--bits 8\|4` | required | q8 or q4 |
| `--group-size <n\|row>` | 64 | values per scale along the input dimension |
| `--no-embeddings` | off | keep the token embedding in float |
| `--exclude <regex>` | — | keep matching tensors in float (repeatable) |
| `--q8 <regex>` | — | with `--bits 4`: store matching tensors as q8 (mixed precision) |
| `--no-refine` | off | q4: skip the least-squares refit |
| `--force` | off | overwrite an existing `model.safetensors` |

It takes about 10 s for q8 and 30 s for q4 on an M2, with a peak of about 1.1 GB. From code: `quantizeCheckpoint(model, opts)` in `@johnhenry/laya-cli`, or the browser-safe `quantizeSafetensors(lazyFile, opts)` in `@johnhenry/laya`, which returns the bytes.

## Loading one

Nothing changes in your code. `load()` reads the file's safetensors `__metadata__`, and when it finds `laya_quant` it hands the quantized tensors to the model:

```ts
import { load } from "@johnhenry/laya";

const agent = await load("./laya-mlx-q8");          // a directory, a Hub repo id, or an http(s) URL
console.log(agent.model.quantizedOnDevice);         // true on MLX and WebGPU
```

| `quantized` option | backend | what happens |
|---|---|---|
| `"device"` (default) | MLX, WebGPU | Linear weights and the token embedding **stay int8/int4 on the GPU**; the matrix multiplies dequantize inside the kernel |
| `"device"` (default) | CPU | falls back to `"dequantize"`: the CPU backend has no quantized kernels |
| `"dequantize"` | any | each tensor is dequantized on the host as it loads, to f16 (f32 on CPU), then uploaded as float |

On the device, MLX runs `mlx_quantized_matmul` on the weights repacked into its affine layout (q4 uploads as stored; q8's sign bits are flipped, exactly), and WebGPU's Linear kernels dequantize while loading each tile, accumulating in f32. Dequantized on load, the model is the fp16 model with slightly perturbed weights, with fp16's memory and speed. Both modes give the same answers: every argmax and every q4 flip is identical, and probabilities differ by at most 5e-3.

## Accuracy

Measured on the 63-question parity set (16 cases) against Python's fp16 result, in f16:

| checkpoint | size (fp16 → q8 → q4) | q8 argmax / max \|Δp\| | q4 argmax / max \|Δp\| |
|---|---:|---|---|
| English | 842.6 → 434.8 → 237.5 MB | 63/63 / 0.043 (WebGPU 0.047) | 58/63 / 0.43 |
| Multilingual | 643.8 → 332.2 → 181.5 MB | 63/63 / 0.038 | 62/63 / 0.60 |
| Typed decisions | 842.6 → 434.8 → 237.5 MB | 63/63 / 0.022 | 58/63 / 0.25 |

q8 is 51.6% of the fp16 file and q4 28.2%. Transfer compression barely helps (gzip or brotli save 5–8%, for fp16 and quantized files alike), so the size win comes from the format.

Most q4 flips are close calls, or non-English text given to the English-only checkpoints. Two are not: English `hi q2` (a yes/no with a 0.36 margin, flipped from true to false) and multilingual `empty_state q0` (margin 0.22). Keeping attention, the embeddings or the outer layers at q8 (`--q8`) costs 3–7 points of size and does not rescue the flips. q4 genuinely changes the model.

## Memory and speed

Apple M2 (fanless), f16, each cell in a fresh process after 20 s idle. "Device memory" is MLX `memory().active` or WebGPU live bytes after load; "1 question" is the P50 of one short `predict`; "16 questions" is one `predict` of 16.

| English | device memory | load | 1 question P50 | 16 questions |
|---|---:|---:|---:|---:|
| MLX fp16 | 804 MiB | 0.4 s | 39.1 ms | 38.7 q/s |
| MLX q8 on device | 441 MiB (55%) | 0.6 s | 33.8 ms | 34.9 q/s |
| MLX q4 on device | 228 MiB (28%) | 0.1 s | 34.4 ms | 34.3 q/s |
| WebGPU fp16 | 891 MiB | 0.2 s | 53.4 ms | 25.2 q/s |
| WebGPU q8 on device | 460 MiB (52%) | 0.2 s | 58.0 ms | 22.1 q/s |
| WebGPU q4 on device | 251 MiB (28%) | 0.1 s | 60.6 ms | 21.6 q/s |

| Multilingual | device memory | load | 1 question P50 | 16 questions |
|---|---:|---:|---:|---:|
| MLX fp16 | 614 MiB | 0.8 s | 15.9 ms | 106.1 q/s |
| MLX q8 on device | 338 MiB (55%) | 1.1 s | 16.1 ms | 95.4 q/s |
| MLX q4 on device | 175 MiB (28%) | 0.6 s | 15.9 ms | 93.2 q/s |
| WebGPU fp16 | 635 MiB | 0.7 s | 22.4 ms | 68.4 q/s |
| WebGPU q8 on device | 328 MiB (52%) | 0.6 s | 24.4 ms | 59.0 q/s |
| WebGPU q4 on device | 179 MiB (28%) | 0.6 s | 25.5 ms | 57.5 q/s |

- **Resident weights shrink with the file**: 52–55% of fp16 for q8 and 28% for q4, on both backends. Dequantized on load, memory and speed are the fp16 row's.
- **Speed**: on MLX one short English question is 1.16× faster (batch 1 is memory-bound, and `quantized_matmul` reads fewer bytes); 16-question batches are 10–12% slower, since dequantizing inside the GEMM costs ALU time once it is compute-bound. WebGPU is 9–14% slower for one question and 12–16% slower for 16.
- **Load time** drops on the device path, because nothing is dequantized on the host: English q4 loads in 0.1 s.

These numbers come from the same fanless M2 as the rest of the [results](/laya-js/#results), with the same thermal caveat.

## Hosting

Any static host works if it answers `Range` requests for `model.safetensors`: every CDN, S3/R2/GCS, `npx serve`, GitHub Pages. If a server ignores `Range`, the file is downloaded once in full.

```ts
await load("https://example.com/models/laya-mlx-q4/"); // Node, Bun or browsers
await load("/models/laya-mlx-q4/");                    // a path in a web app
```

To publish on Hugging Face, upload the output directory as a new model repo (for example `huggingface-cli upload <you>/laya-mlx-q4 ./laya-mlx-q4`); then `load("<you>/laya-mlx-q4")` goes through the Hub cache like any other checkpoint. Publishing quantized copies of the Laya weights is up to the checkpoint owner.

## Format

The file is a standard safetensors file, so any safetensors reader can list its tensors. Each row of a quantized matrix is split into groups of 64 values, each with float16 parameters:

| scheme | weights | parameters | value |
|---|---|---|---|
| q8 (symmetric) | `I8`, q ∈ [−127, 127] | `W.scales` | w = q · scale |
| q4 (affine) | `U8`, two values per byte; q ∈ [0, 15] | `W.scales`, `W.biases` | w = q · scale + bias |

The encoder's Linear weights and token embedding, and the decision head's Linears, are quantized: 99.9% of the bytes. Norms, biases and small tensors stay float. The metadata keys, the fitting method (a range fit for q8, a least-squares refit for q4) and the on-device kernels are described in [docs/QUANTIZATION.md](https://github.com/johnhenry/laya-js/blob/main/docs/QUANTIZATION.md); every measurement is in [docs/RESULTS.md](https://github.com/johnhenry/laya-js/blob/main/docs/RESULTS.md#quantized-checkpoints).
