---
title: Backends
description: The three laya-js tensor backends — native MLX, WebGPU and the CPU reference — the async op contract they share, f16 vs f32, how exact each one is, and how fast.
sidebar:
  order: 3
---

Every backend implements one op contract, `Backend` from `@johnhenry/tensor-backend`. Each one passes the same conformance suite, whose golden cases come from Python MLX. Backends are **passed explicitly**; there is no global default. `load(…, { backend })` accepts either a `Backend` instance, which you then own, or one of `"auto"`, `"mlx"`, `"webgpu"` and `"cpu"`. Which runtime gets which backend is on the [Runtimes](/laya-js/runtimes/) page.

- **`backend: "auto"`** tries MLX first, then WebGPU, then CPU (in browsers: WebGPU, then CPU).
- **`dtype: "f16"` is the default.** The CPU backend computes in f32, and so does WebGPU without `shader-f16`; `agent.dtype` reports which one is in use.

## The contract (`@johnhenry/tensor-backend` 0.3)

**Transfers are async in both directions.** Since 0.2, `fromHost` returns a Promise, like `read`:

```ts
import { createMlxBackend } from "@johnhenry/backend-mlx";

const mlx = createMlxBackend(); // { device: "gpu" } by default
const x = await mlx.fromHost({ dtype: "f16", shape: [2, 3], data: new Float16Array([1, 2, 3, 4, 5, 6]) });
const y = mlx.scope(() => mlx.softmax(mlx.scale(x, 2), -1)); // lazy graph; intermediates freed
console.log(await mlx.read(y)); // evaluates on the GPU, then copies to the host
mlx.dispose(y);
mlx.dispose(x);
```

Batch independent uploads with `Promise.all`. Ops themselves stay synchronous, so code inside `scope` or a `compile`d function must upload its constants beforehand, or derive them on the device with the `zerosLike` / `onesLike` / `fullLike` helpers.

The contract has three layers:

- **Required ops**: transfer and lifetime (`fromHost`, `read`, `dispose`, `scope`), shape, elementwise and reduction ops, and the fused transformer ops (`linear`, `layerNorm`, `rope`, `sdpa`, `gelu`).
- **General numerics** (0.2, 22 optional ops): `equal`, `notEqual`, `less`, `lessEqual`, `greater`, `greaterEqual`, `logicalAnd`, `logicalOr`, `logicalNot`, `sqrt`, `rsqrt`, `pow`, `neg`, `abs`, `tanh`, `sigmoid`, `erf`, `argmax`, `argmin`, `mean`, `min` and `cumsum`. Call them through their `compose.ts` helpers (`erf(b, x)`, `less(b, x, y)`, …), which use the backend's native kernel when it has one and a default composition otherwise. All three backends implement every one natively.
- **Quantized weights** (0.3, optional): `uploadQuantized`, `quantizedLinear` and `quantizedEmbedding`, used by [quantized checkpoints](/laya-js/quantized-checkpoints/#loading-one). A backend without them gets a composition that dequantizes on the device per call: correct, but with no memory saving.

The conformance suite runs 49 core cases, 54 numerics cases and 26 quantized cases, all generated with Python MLX on Metal, in f32 and f16, plus a bf16 pass for backends that support it.

## `@johnhenry/backend-mlx` 0.4

Native [MLX](https://github.com/ml-explore/mlx) through [mlx-c](https://github.com/ml-explore/mlx-c), over a binding of about 250 lines of our own. Node loads it with `koffi`, Bun with `bun:ffi` and Deno 2 with `Deno.dlopen`.

Python laya-mlx runs the same `libmlx` and the same Metal kernels, so results match it **bit for bit**, in fp16 as well as fp32. `compile: true` traces the forward pass with `mlx_compile`, once per input shape.

MLX op dispatch costs 0.80 µs per op on Node/koffi, 0.55 µs on Bun and the same as Node on Deno, against 0.40 µs in Python. GPU time is identical to Python's. Quantized weights run through `mlx_quantized_matmul`: q4 uploads as stored, and q8 is repacked into MLX's affine layout bit-exactly.

macOS on Apple Silicon only. MLX is pinned to 0.32.2, the version in the prebuilt bundle. The library is resolved at runtime, first match wins: `createMlxBackend({ libPath })`, then `$LAYA_MLXC_PATH`, then the platform package `@johnhenry/backend-mlx-darwin-arm64`, then a local `scripts/build-mlxc.sh` build. Why a custom binding rather than an existing one is recorded in [docs/mlx-binding-decision.md](https://github.com/johnhenry/laya-js/blob/main/docs/mlx-binding-decision.md).

## `@johnhenry/backend-webgpu` 0.4

Hand-written WGSL kernels, including f16 and flash attention.

- **Browsers**: uses `navigator.gpu`.
- **Node and Bun**: uses [Dawn](https://github.com/dawn-gpu/node-webgpu) (the `webgpu` package).
- **Deno**: uses its built-in wgpu.

f32 results are within 1e-4 of MLX. f16 results differ from the third decimal on, because the kernels are different, but they give the same argmax. Every op is its own dispatch: there is no graph fusion, and `compile` is MLX-only. The kernels are tuned on an Apple M2 and have not been tested on discrete or mobile GPUs.

**Performance work (0.3).** Linears with M > 64 use Dawn's experimental subgroup matrices (Metal `simdgroup_matrix`) with 64×64 tiles, reaching about 1.95 TFLOP/s in f16 on the M2, against about 1.75 in 0.2. A lowest-id buffer pool makes every bind group a cache hit, and the first submit after an idle GPU is smaller so the GPU starts sooner. `backend.tuneGemm(shapes)` measures the best Linear kernel per exact shape on your device, and its results can be saved and restored with the `gemmTuning` option.

**Runtime hooks (0.3.1).** These let other code share the backend's runtime; math-plus's `tensor-webgpu` 0.3 is built on them:

- `elementwise(expr, xs, { outDtype?, helpers? })`: a custom n-ary elementwise kernel with broadcasting, cached per expression;
- `empty(shape, dtype)`: a pooled, scope-tracked output tensor for custom kernels;
- `wrapBuffer(buffer, shape, dtype, offset?)`: a view of a `GPUBuffer` you own, never pooled or destroyed;
- the `Runtime`, `Storage` and kernel types are exported, with `rt.kernel` / `rt.dispatch`;
- `createWebGpuBackend({ device, adapter })` detects subgroup matrices on a device you pass in, and `sleepThresholdMs` trades CPU use against readback latency.

`sdpa` also respects `maxComputeWorkgroupStorageSize` since 0.3.1, so it runs on devices with the 16 KiB WebGPU default.

**Quantized weights (0.4).** q8/q4 matrices stay packed in a `u32` buffer with f16 scales, and every Linear kernel dequantizes while it loads each tile, accumulating in f32.

## `@johnhenry/backend-cpu` 0.3

A pure-TypeScript f32 reference. The GPU backends are tested against it, and it matches Python on all 63 parity questions, with a maximum logit error of 4e-5.

Since 0.3 it is a thin re-export of [`@johnhenry/math-plus-tensor-cpu`](/math/math-plus-tensor/), the CPU backend that math-plus now owns, built on math-plus tensor-core's kernels. `createCpuBackend`, `CpuTensor` and `CpuBackend` are unchanged; only the raw `gemmNT` export was removed. New code should depend on `@johnhenry/math-plus-tensor-cpu` directly; `backend-cpu` will be deprecated later.

It is exact but slow: tens of seconds per case on the large checkpoints. Use it as an oracle and a fallback, not as a production path. It has no quantized kernels, so quantized checkpoints are dequantized on the host when they load on it.

## Writing your own

`@johnhenry/tensor-backend` exports the contract and the conformance suite. Any object that implements `Backend` and passes the suite can run `@johnhenry/modernbert` and `@johnhenry/laya`. Make `fromHost` `async`; copying the host data at call time is fine. The contract's dtype names and `HostTensor` layout match `@johnhenry/math-plus-tensor-core`, so `toMathPlusArgs` passes results to a [Math Plus](/math/math-plus-tensor/) `Tensor` without a copy.

```ts
import { describe, it } from "node:test";
import { loadOpCases, runConformance, type TestApi } from "@johnhenry/tensor-backend/conformance";
import { createMyBackend } from "./my-backend.ts";

runConformance(() => createMyBackend(), loadOpCases(), { describe, it: it as unknown as TestApi["it"] });
```

`withoutOptionalOps(b)` runs the suite again with the optional ops removed, to check the default compositions on a real backend.

## Speed

Median forward-pass time in ms on an Apple M2 (10-core GPU, fanless), English checkpoint, f16, cold GPU. B is batch rows, and the column is tokens per row. WebGPU runs on Node through Dawn; Bun is within ±3%. "WebGPU 0.2" is the unmodified 0.2.0 backend, measured in the same process, interleaved cell by cell.

| B / tokens | 16 | 33 | 64 | 93 | 128 | 256 | 512 |
|---|---:|---:|---:|---:|---:|---:|---:|
| B=1 MLX (JS) | 20.0 | 23.6 | 23.6 | 41.7 | 39.0 | 80.4 | 154.4 |
| B=1 WebGPU | 14.6 | 24.1 | 37.9 | 53.8 | 67.2 | 130.2 | 252.2 |
| B=1 WebGPU 0.2 | 15.4 | 25.7 | 39.4 | 59.0 | 77.0 | 149.3 | 288.2 |
| B=3 MLX (JS) | 25.4 | 43.7 | 62.1 | 95.5 | 107.4 | 220.9 | 442.6 |
| B=3 WebGPU | 30.8 | 67.0 | 90.6 | 141.7 | 175.1 | 354.1 | 727.3 |
| B=16 MLX (JS) | 79.7 | 159.4 | 271.7 | 413.2 | 545.9 | 1118 | 2367 |
| B=16 WebGPU | 119.6 | 252.5 | 435.7 | 653.4 | 886.3 | 1821 | 3843 |

:::caution[Thermal caveat]
A fanless M2 drops to about 35% of its cold GPU speed after roughly 10 s of sustained load and recovers after about 5 s idle. The grid idles 5 s before each cell and times for at most 1 s; anything that loops for longer (`laya bench`, long Snake runs) measures the throttled machine.
:::

- **JS on MLX runs at Python's speed.** Python laya-mlx's full `predict()` at 93 tokens takes 46.2 ms (P50) on the same machine; the JS forward pass plus about 1 ms of prompt building and formatting lands at the same place.
- **WebGPU is 4–15% faster than 0.2**, and takes 1.3–1.7× as long as MLX from 64 tokens up. At those sizes the Linears are about 85% of GPU time, and MLX's GEMM runs at about 3 TFLOP/s against WebGPU's 1.95: WGSL can't reach Apple's matrix units at full speed, and Dawn only offers f16 accumulation for f16 inputs, which would break parity, so the kernels accumulate in f32. Host overhead is not the gap: profiled GPU time matches wall time within 2%.

**Snake** (multilingual checkpoint, 3 questions per move, B=3): 24.3 ms per decision on Node + MLX, 39.8 ms on Node + WebGPU, and about 43 ms mean in Python (a sustained, throttled run). Over sustained 600-step runs, Node + MLX and Python are equal within noise, and every run had zero deaths.

The full tables and how to rerun them are in [docs/RESULTS.md](https://github.com/johnhenry/laya-js/blob/main/docs/RESULTS.md).
