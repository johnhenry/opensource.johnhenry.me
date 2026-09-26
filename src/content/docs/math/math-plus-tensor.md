---
title: 'math-plus: tensors'
description: The tensor cluster — tensor-core's typed n-D arrays, autograd, expression fusion, Rust→WASM kernels, the WebGPU / MLX / CPU device packages, safetensors, and the canonical erf — and how to actually pick a backend.
---

Nine packages. Four of them (`tensor-wasm`, `tensor-webgpu`, `tensor-mlx`, `tensor-cpu`) are ways to go faster or to run model code, and none of them swaps in underneath `Tensor`. Read [How do I pick a backend?](#how-do-i-pick-a-backend-read-this-first) before architecting anything around them.

| Package | Version | What it is |
|---|---|---|
| `@johnhenry/math-plus-tensor-core` | 0.2.1 | Typed n-D arrays: dtypes (including real f16/bf16 storage), strides/views, NumPy broadcasting, `.npy` I/O, seeded RNG. Pure JS; its one dependency is `special`. **Start here.** |
| `@johnhenry/math-plus-tensor-autograd` | 0.1.3 | Reverse-mode tape (`Variable`), `nn.*`, `optim.*` (SGD/Adam/AdamW/RMSprop, StepLR), trainer, checkpoints |
| `@johnhenry/math-plus-tensor-compile` | 0.1.3 | Elementwise expression IR + fusion — trace once, execute fused. Opt-in. The shared lowering target for WGSL. |
| `@johnhenry/math-plus-tensor-wasm` | 0.1.2 | Rust→WASM CPU kernels: SIMD, a blocked SIMD GEMM, arena allocator, zero-alloc `...Into` ops, opt-in Deno-native FFI |
| `@johnhenry/math-plus-tensor-webgpu` | 0.3.0 | WebGPU **device facade** over [`@johnhenry/backend-webgpu`](/laya-js/backends/): GEMM, fused attention, the tensor-backend ops, plus IR→WGSL fusion. Browsers, Deno, and Node/Bun through Dawn. |
| `@johnhenry/math-plus-tensor-mlx` | 0.2.1 | **Experimental.** MLX (Metal) device facade over [`@johnhenry/backend-mlx`](/laya-js/backends/): chainable device arrays with explicit async transfers. darwin/arm64 on Node, Bun and Deno 2. |
| `@johnhenry/math-plus-tensor-cpu` | 0.2.1 | The CPU reference `Backend` for the `@johnhenry/tensor-backend` contract: f32 compute on tensor-core's kernels, every optional op native. Node, Bun, Deno, browsers. |
| `@johnhenry/math-plus-safetensors` | 0.1.3 | safetensors reader/writer: validated headers, typed views (F16 as `Float16Array`), lazy reads from files, Blobs and HTTP Range requests. Zero deps. |
| `@johnhenry/math-plus-special` | 0.1.1 | The one canonical double-precision `erf`/`erfc`/GELU (SciPy-verified). Zero deps; used by tensor-core (which re-exports it), tensor-cpu and frame-arrow. |

```bash
npm install @johnhenry/math-plus-tensor-core
```

Every package here needs Node ≥ 24 (lowered from 26) and is also tested under Bun 1.2; runtime specifics are in the table above.

## How do I pick a backend? (Read this first)

**There is no `setBackend()` API. There is no automatic dispatch.** tensor-core's `Tensor` is the host type: the eager, strided, full-dtype reference that NumPy checks. Accelerators are separate **devices** that you create yourself, and data crosses between the host and a device only through explicit, async transfers (`await device.fromTensor(t)`, `await device.toTensor(x)`).

| Backend | Environment | How you opt in | Honest status |
|---|---|---|---|
| Pure JS (`tensor-core`) | Node ≥ 24, Bun, Deno, browsers | It's the default and only `Tensor` | The reference path. Everything else in the family (`fft`, `signal`, `image`, autograd, frames' `toTensor()`) runs on it. Contiguous inputs take flat, bit-identical fast paths; `matmul` is a 4×4 register-blocked GEMM. Single-threaded, no SIMD. |
| WASM (`tensor-wasm`) | Anywhere with WebAssembly | Explicitly import `Kernels`, write against `WasmTensor` — a *different type* (f32 only, 1-D/2-D ops, manual `free()`) | `matmulInto` runs a cache-blocked SIMD128 GEMM: **~37 GFLOP/s at 1024³** on an M2 (21.6× the old naive loop). Elementwise ops are 1.78× faster than JS at N=1e6 over **resident** buffers — and 2.27× *slower* if you copy in/out per call, which is why the API forces residency on you. |
| Native FFI (`tensor-wasm/native`) | Deno with `--allow-ffi` + a platform binary | `NativeKernels.load() ?? await Kernels.load()` — `load()` returns `undefined`, never throws | 1.2–5.3× over WASM depending on op; an opt-in `accelerate` build routes GEMM to Apple's `cblas_sgemm`. Binaries are CI artifacts, not published to npm. |
| WebGPU (`tensor-webgpu`) | Browsers (`navigator.gpu`), Deno (built-in WebGPU), Node ≥ 24 and Bun ≥ 1.2 (Dawn) | `const gpu = await createWebGpuDevice()`, then `gpu.backend.*` ops and `gpu.fuse` / `gpu.compile` | The same runtime laya-js runs its models on: subgroup-matrix, skinny and tiled GEMM kernels, fused flash attention. For a one-shot GEMM on host arrays, `chooseGemmBackend(m, n, k)` picks WebGPU only when **`m·n ≥ 256²` and `m·n·k ≥ 2²⁴`**, otherwise tensor-wasm (see [below](#the-gemm-threshold)). |
| MLX (`tensor-mlx`) | macOS on Apple Silicon: Node, Bun, Deno 2 | `const mlx = createMlxDevice()`, then `await mlx.fromTensor(t)` and chainable `MlxArray` ops | **Experimental** prototype for RFC 0001. Lazy MLX graph on the Metal GPU; no browser build (MLX needs FFI). |
| CPU `Backend` (`tensor-cpu`) | Anywhere | `createCpuBackend()`: a `Backend` for code written against `@johnhenry/tensor-backend` | Not an accelerator: the reference that model code (such as laya-js's ModernBERT encoder) runs on without a GPU. At least as fast as laya-js's old `backend-cpu`, which now re-exports it. |

The corollary: if you're not sure you need acceleration, you don't — stay on pure-JS `tensor-core` and you keep every sibling package compatible.

### The device contract (RFC 0001)

[RFC 0001](https://github.com/johnhenry/math-plus/blob/main/docs/rfcs/0001-device-backends.md) was **accepted with changes** on 2026-09-24. math-plus does not grow its own device abstraction; it depends on [`@johnhenry/tensor-backend`](/laya-js/backends/#the-contract-johnhenrytensor-backend-03), the op contract laya-js's backends implement, and on its shared conformance suite. The decisions:

- **Host vs device.** tensor-core's `Tensor` stays the host type and does not become a backend. Each accelerator gets a device package over the contract (`tensor-mlx`, `tensor-webgpu`).
- **Uploads are async** (the one change from the recommendation), so a transfer never looks synchronous in either direction. Devices may be lazy inside, as long as errors surface at the call site.
- **math-plus owns the CPU reference** (`tensor-cpu`, on tensor-core's kernels); laya-js's `@johnhenry/backend-cpu` is now a re-export of it.
- **One WebGPU runtime.** `@johnhenry/backend-webgpu` is the single WebGPU implementation; `tensor-webgpu` became a facade over it in 0.2, and the old API was removed in 0.3.
- **Deno** support came from a `Deno.dlopen` loader in `@johnhenry/backend-mlx`, so `tensor-mlx` now runs its suites under Deno 2 and is configured for JSR (not yet published there).
- **Contract growth goes upstream**: the 22 "general numerics" ops (comparisons, `sqrt`, `erf`, `argmax`, `cumsum`, …) went into tensor-backend itself, not into a fork.

Autograd on device arrays is still future work: `tensor-autograd` works on tensor-core `Tensor`s only.

## tensor-core traps

- **Default dtype is `f32`** everywhere (`from`, `zeros`, `arange`, ...);
  `random.randint` defaults to `i32`. Pass `{ dtype: "f64" }` for numeric
  work — most of the family's own tests do.
- **No implicit dtype promotion.** Mixing dtypes in any binary op, matmul,
  or comparison throws — `cast()` first. `div` on `i64` throws too. The
  one NumPy-matching exception: `mean`/`variance`/`std` of integer dtypes
  return `f64`.
- **`gelu()` is exact erf-GELU by default** (since 0.1.0), like PyTorch's
  `nn.GELU()`. Pass `gelu({ approximate: "tanh" })` for the old numbers;
  they differ by up to ~4.7e-4. `erf`/`erfc` are the canonical ones from
  `math-plus-special` (~1e-15 relative), re-exported unchanged.
- **f16/bf16 are storage dtypes** (raw bits in a `Uint16Array`, zero-copy
  with safetensors, ONNX Runtime and WebGPU). Since 0.1.0 values convert
  correctly: `from`/`full`/`random.*` encode, `at`/`toArray` decode, and
  `cast()` is bit-for-bit NumPy's `astype(float16)`. But **arithmetic,
  comparison, reduction, sort and matmul throw** on half dtypes — computing
  in f32 would be implicit promotion. Opt in explicitly with
  `withCompute("f32", [a, b], (a, b) => a.matmul(b).relu())`, which casts
  in, runs, and rounds back once when the region exits.
- **Views vs copies is a contract, not an optimization.**
  `reshape`/`permute`/`transpose`/`slice`/`select`/`broadcastTo`/`unfold`
  are views (`a.data === b.data` detects them); `take`/`gather`/`mask`/
  `cast`/`contiguous` copy. `cast()` *always* copies, even same-dtype, and
  integer casts truncate toward zero.
- **Fast paths are invisible except in time.** Contiguous inputs take flat
  typed-array kernels; strided views, BigInt dtypes and uncommon broadcast
  patterns take the general path. Both produce bit-identical results.
- **`.npy` I/O is little-endian, C-order only** — `fortran_order: True`
  throws, big-endian descrs throw. f16 round-trips as `<f2`; bf16 is written
  as `'<V2'` (the `ml_dtypes` convention) and read back only with
  `Tensor.fromNpy(bytes, { voidAs: "bf16" })`.
- **`/kernels` is for device packages.** The
  `@johnhenry/math-plus-tensor-core/kernels` subpath exposes the flat
  typed-array kernels under the fast paths (`gemmNT`, `softmaxAxis`,
  `linearNT`, `attention`, `layerNormRows`, …). `tensor-cpu` is built on
  them; ordinary code should use `Tensor`.

## autograd traps

- **Gradients accumulate** across `backward()` calls; `zeroGrad()` resets
  `.grad` to `null`. Only leaves get `.grad`; only scalar outputs may call
  `backward()` without an explicit `gradOutput`.
- **`nn.Linear` initializes at f64** — combined with no-implicit-promotion,
  f32 inputs throw. This bites hardest via
  [`math-plus-data`](/math/math-plus-data/)'s collate, which defaults to
  f32.
- **`trainer.fit(dataLoader)` ignores `config.epochs`** — one pass, since
  an arbitrary `AsyncIterable` isn't guaranteed re-iterable. Put epochs in
  the pipeline (`dataset.epochs(n)`).
- Checkpoints are a custom `"MPCK"` container, not `.npz`; `loadStateDict`
  is strict in both directions (missing *and* unexpected keys throw).
- `binaryCrossEntropy` is logits-based (BCEWithLogits reformulation) so
  saturated logits give finite losses and gradients rather than NaN.

## compile traps

- v1 is **elementwise/broadcast only** — no reductions, no matmul — and
  float-only with one shared dtype across inputs.
- `forward()` skips gradient bookkeeping entirely (~15× faster than the
  grad-carrying evaluator when you only want values); `asVariableOp()`
  plugs the fused op into the autograd tape with matching gradients.
- IR op `"gelu"` is exact GELU; the tanh form is its own op, `"gelu_tanh"`.
  Code that switches exhaustively over `UnaryOp` needs both cases.
- Step functions (`floor`/`round`/`sign`/...) and comparisons have zero
  gradient — correct, and a classic "why isn't my parameter moving" trap.

## wasm traps

- **Trap poisoning:** the first Rust panic (WASM trap) permanently poisons
  the whole `Kernels` instance — every later call throws, reads refuse
  possibly-corrupt memory, `free()` becomes a no-op. Recovery is a fresh
  `Kernels.load()`. IEEE division-by-zero does *not* poison (±Infinity/NaN,
  same as JS).
- SIMD is a second `.wasm` module (any v128 instruction fails validation
  wholesale on non-SIMD runtimes). It engages for stride-1 operands on
  `addInto`/`mulInto`, and for **any** strides in `matmulInto`'s GEMM.
  Results are bit-identical to scalar.
- **The GEMM is single-threaded, f32 only and has no FMA** (WASM SIMD128
  has none, and relaxed-SIMD is deliberately unused because it fails
  validation on Safari). `matmulInto` rejects a wrongly-shaped `out` with a
  `RangeError`, and `out` must not alias `a`/`b`.
- In a git clone the `.wasm` artifacts are **gitignored** — `npm run
  build:wasm` (Rust + lld) or `Kernels.load()` throws `ENOENT`. The
  published npm package ships them prebuilt.
- The SIMD benchmark is deliberately not in `npm test` — see the
  [family page](/math/math-plus/) for why.

## webgpu traps

- **The pre-0.2 API is gone** (removed in 0.3.0): `toWebGPU`, `GPUTensor`,
  `runGemm*`, `runAttention`, `runElementwiseWGSL`, the profiling
  functions and the `./dawn` subpath. Use `await gpu.fromTensor(t)` /
  `await gpu.toTensor(x)`, `gpu.backend.matmul` / `linear` / `sdpa`, and
  `gpu.fuse` / `gpu.compile`. The package README has the full
  replacement table.
- **No chainable array wrapper yet** (unlike `tensor-mlx`'s `MlxArray`):
  ops are called on `gpu.backend` with backend tensors.
- **Fusion is f32-only** and forward-only; inputs broadcast with NumPy's
  rules, up to rank 8, and each expression is one dispatch.
- **One runtime per `GPUDevice`.** Dispatches are batched and submitted
  later, so two runtimes on one device could reorder each other's work;
  `createWebGpuDevice({ device })` shares an existing backend and refuses a
  second one.
- Subgroup-matrix GEMM needs Dawn's experimental feature: in practice Apple
  GPUs, under Dawn (set automatically) or Chrome's
  `--enable-unsafe-webgpu`. Elsewhere the portable tiled kernel runs.
- `sdpa` takes a **bool** mask on `[B, H, L, D]` tensors; fully masked query
  rows are undefined.

### The GEMM threshold

`chooseGemmBackend(m, n, k?)` returns `"webgpu"` when the output has at
least `GEMM_ELEMENT_THRESHOLD` = 256² elements **and** the product does at
least `GEMM_WORK_THRESHOLD` = 2²⁴ multiply-adds, and `"wasm"` otherwise. It
prices a host-array call end to end (upload, `matmul` or `linear`,
readback) against tensor-wasm's SIMD GEMM.

For 0.3.0 it was re-measured on 43 shapes in Dawn, headless Chrome and a
real, visible Chromium without subgroup matrices, on an Apple M2. Dawn wins
from 160³, but both browsers lose at 192³, so the previous rule (`192²` and
`2²²`) was tightened: the new one sends no measured shape to a slower
WebGPU in any of the three, at the cost of leaving some WebGPU wins on
WASM. It is one machine's number, and it ignores residency — operands
already on the GPU make WebGPU cheaper at every size. Re-run the package's
`scripts/measure-gemm-threshold.ts` on your own hardware before trusting it.

## mlx traps

- **Experimental**, 0.x: the API may still change, and nothing else in
  math-plus re-exports it.
- **Uploads are async** (since 0.2): `await mlx.fromTensor(t)`; batch them
  with `Promise.all`. An upload can't be chained directly.
- **Device dtypes only:** f32, f16, bf16, i32 and bool. `f64` is refused
  (Metal has no float64) and so are the other integer dtypes; `cast()`
  first. There is no implicit promotion, and non-contiguous tensors are
  rejected.
- **Lazy execution:** ops build an MLX graph and return immediately. Shape
  errors still throw at the call site; the arithmetic runs at `eval()`,
  `toTensor()` or `toHost()`. Memory is freed by `dispose()` / `scope()`,
  not by the garbage collector.
- **Deno** needs `--allow-ffi --allow-read --allow-env`; the MLX libraries
  come from the `@johnhenry/backend-mlx-darwin-arm64` platform package or
  `LAYA_MLXC_PATH`.
- Results can differ from tensor-core's CPU results in the last ulps; f16
  is only checked to 2e-2 and bf16 to 5e-2.

## cpu, safetensors and special

- **`tensor-cpu`** computes in f32 (f16/bf16 host data is widened on
  upload) and implements every contract op except `compile`. It also hosts
  the `Tensor` ↔ `HostTensor` bridge (`hostFromTensor`, `tensorFromHost`)
  that `tensor-mlx` and `tensor-webgpu` share.
- **`safetensors`** validates headers like the reference implementation
  and writes files byte-identical to Python's `safetensors.serialize`. Open
  big checkpoints lazily with `openSafetensors()` over a file path, a
  `Blob`/`File` or an HTTP URL (Range requests, with a full-download
  fallback); only the tensors you ask for are read. tensor-core interop is
  an optional peer (`@johnhenry/math-plus-safetensors/tensor`). laya-js
  reads every checkpoint through it.
- **`special`** exists so the canonical `erf` has exactly one
  implementation. frame-arrow's `fn.erf()` switched to it from an
  Abramowitz & Stegun copy, so its results moved in the 7th decimal place.
