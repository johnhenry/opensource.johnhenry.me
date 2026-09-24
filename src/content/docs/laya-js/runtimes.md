---
title: Runtimes
description: Running laya-js on Node, Bun, Deno and in browsers — which backends each runtime gets, how MLX is loaded (koffi, bun:ffi, Deno.dlopen), permissions, and what is tested.
sidebar:
  order: 2
---

The same packages run on four runtimes. What differs is how the native MLX library is loaded, where WebGPU comes from, and where the model cache lives.

| Runtime | MLX | WebGPU | CPU |
|---|---|---|---|
| Node ≥ 24, macOS arm64 | f32, f16 (bf16 storage), via `koffi` | f32, f16 (Dawn → Metal) | f32 |
| Node ≥ 24, Linux / Windows | — | f32, f16 where Dawn finds an adapter | f32 |
| Bun ≥ 1.2 | as Node, via `bun:ffi` | as Node (same Dawn addon) | f32 |
| Deno 2 | as Node, via `Deno.dlopen`; `laya` parity tested | f32, f16 (built-in wgpu); the backend is tested, `laya` is not | f32 |
| Chrome / Edge ≥ 113 | — | f32; f16 from 120 (`shader-f16`) | f32 |
| Safari 26, Firefox ≥ 141 | — | expected to work, not verified | f32 |

`load(…, { backend: "auto" })` tries MLX first (macOS arm64 with a loadable libmlxc), then WebGPU (if an adapter is available), then CPU. In browsers the order is WebGPU, then CPU.

## Node

Node ≥ 24 strips TypeScript types natively, and the published packages ship built JavaScript, so there is no build step either way.

- **MLX** goes through [`koffi`](https://koffi.dev), a prebuilt N-API addon that comes as an optional dependency. The MLX 0.32.2 libraries come from the optional dependency `@johnhenry/backend-mlx-darwin-arm64` (64 MB), installed on darwin/arm64 only. On any other platform `backend-mlx` still installs, but `createMlxBackend` throws, and `auto` moves on.
- **WebGPU** goes through [Dawn](https://github.com/dawn-gpu/node-webgpu), the `webgpu` npm package.
- **Model cache**: `~/.cache/huggingface/hub`, shared with Python's `huggingface_hub`.
- Don't run with `--conditions=source`: under that condition the packages export their TypeScript sources, and Node does not strip types inside `node_modules`.

## Bun

Bun ≥ 1.2 installs the same packages with `bun add`. MLX uses the built-in `bun:ffi`; its per-op dispatch cost is the lowest of the three runtimes (0.55 µs, against 0.80 µs on Node and 0.40 µs in Python). WebGPU uses the same Dawn addon as Node, and measures within ±3% of it.

## Deno

Deno 2 runs both GPU backends.

- **MLX**: since `backend-mlx` 0.3, a `Deno.dlopen` loader sits next to the koffi and `bun:ffi` ones, with the same mlx-c signatures and both mlx-c ABIs. It dispatches at Node's speed. Run with `--allow-ffi`, plus `--allow-read` and `--allow-env` so it can locate the library.
- **Native libraries**: in an npm install, the platform package is found in `node_modules`. Otherwise add it yourself with `deno add npm:@johnhenry/backend-mlx-darwin-arm64` (Deno also looks in its npm cache), or point `LAYA_MLXC_PATH` at a libmlxc.
- **WebGPU** uses Deno's built-in wgpu through `navigator.gpu`, with `shader-f16` on Apple. There are no subgroup matrices there, so Linears use the portable tiled kernel (about 1.3 TFLOP/s on the M2, against about 1.95 through Dawn).
- **`@johnhenry/laya`** runs from an npm install with `--conditions=source` (Deno strips the types). On MLX, `predict` matches Python exactly on all three checkpoints, and the backend conformance suite passes in f32, f16 and bf16 (tested on Deno 2.9.7).

```bash
deno run --allow-ffi --allow-read --allow-env --allow-net --conditions=source main.ts
```

**JSR.** Every package except `laya`, `laya-cli` and the native bundle has a `jsr.json` and is set up for JSR trusted publishing, but none is published there yet. `laya` stays npm-only because it picks its I/O module per runtime with a package.json `imports` split (`#io`) that JSR can't express.

## Browsers

Install `@johnhenry/laya` and `@johnhenry/backend-webgpu`, then bundle as usual. The `browser` export condition swaps in `io-browser.ts`:

- a Hub repo is downloaded with `fetch` and cached in the Cache API; a URL path such as `/models/laya-mlx-q8/` is read with Range requests and not cached;
- only WebGPU and CPU are available, and there are no `node:` imports.

Bundlers that honour the `browser` condition (Vite, esbuild with `platform: "browser"`, webpack) never see `node:fs`, koffi or libmlxc. `backend-webgpu`'s internal `#dawn` import resolves to a stub in browser builds, so the Dawn addon stays out of the bundle too.

WebGPU needs Chrome or Edge 113+, with f16 from 120. Chromium also exposes the subgroup-matrix feature behind `--enable-unsafe-webgpu`; without it the backend uses the portable kernels. Safari 26 and Firefox 141 are expected to work but are not verified.

The browser loader is tested in Node against a local HTTP server and bundle-checked with Bun. The [live demos](https://johnhenry.github.io/laya-js/) are the real-browser check: the [playground](https://johnhenry.github.io/laya-js/playground/) and [Snake](https://johnhenry.github.io/laya-js/snake/) run the full model on WebGPU.
