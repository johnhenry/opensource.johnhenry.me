---
title: 'Math Plus: tensors'
description: The tensor cluster — tensor-core's typed n-D arrays, autograd, expression fusion, Rust→WASM kernels, and WebGPU — and how to actually pick a backend.
---

Five packages. Two of them (`tensor-wasm`, `tensor-webgpu`) are marketed as "acceleration," and the honest state of both is more interesting than the marketing — read [How do I pick a backend?](#how-do-i-pick-a-backend-read-this-first) before architecting anything around them.

| Package | What it is |
|---|---|
| `@johnhenry/math-plus-tensor-core` | Typed n-D arrays: dtypes, strides/views, NumPy broadcasting, `.npy` I/O, seeded RNG. Pure JS, zero deps. **Start here.** |
| `@johnhenry/math-plus-tensor-autograd` | Reverse-mode tape (`Variable`), `nn.*`, `optim.*` (SGD/Adam/AdamW/RMSprop, StepLR), trainer, checkpoints |
| `@johnhenry/math-plus-tensor-compile` | Elementwise expression IR + fusion — trace once, execute fused. Opt-in. |
| `@johnhenry/math-plus-tensor-wasm` | Rust→WASM CPU kernels: SIMD, arena allocator, zero-alloc `...Into` ops, opt-in Deno-native FFI |
| `@johnhenry/math-plus-tensor-webgpu` | WGSL GEMM, attention primitives, IR→WGSL fusion. Chromium-family browsers only. |

```bash
npm install @johnhenry/math-plus-tensor-core
```

## How do I pick a backend? (Read this first)

**There is no `setBackend()` API. There is no automatic dispatch.** The
"WASM kernels swap in underneath `Tensor`" seam described in tensor-core's
own header comment is intent, not implementation — the storage-model merge
is tracked separately and hasn't happened.

| Backend | Environment | How you opt in | Honest status |
|---|---|---|---|
| Pure JS (`tensor-core`) | Node ≥22.12, Deno, browsers | It's the default and only `Tensor` | The reference path. Everything else in the family (`fft`, `signal`, `image`, autograd, frames' `toTensor()`) runs on it. |
| WASM (`tensor-wasm`) | Anywhere with WebAssembly | Explicitly import `Kernels`, write against `WasmTensor` — a *different type* (f32 only, 1-D/2-D ops, manual `free()`) | 1.78× faster than JS at N=1e6 over **resident** buffers — and 2.27× *slower* if you copy in/out per call, which is why the API forces residency on you |
| Native FFI (`tensor-wasm/native`) | Deno with `--allow-ffi` + a platform binary | `NativeKernels.load() ?? await Kernels.load()` — `load()` returns `undefined`, never throws | 1.2–5.3× over WASM depending on op. Binaries are CI artifacts, not yet published to npm. |
| WebGPU (`tensor-webgpu`) | Chromium-family browsers (no plain Node; no polyfill bundled) | Free functions: `toWebGPU(tensor, device)`, `runGemmWGSL`, ... | `GEMM_ELEMENT_THRESHOLD` is `Infinity`: on the maintainer's measured hardware (integrated GPU, naive untiled shader), **WASM beat WebGPU at every size up to 768×768, by 5–10×**. A test pins this so recalibration is deliberate. Measure on *your* GPU before believing either side. |

The corollary: if you're not sure you need acceleration, you don't — stay
on pure-JS `tensor-core` and you keep every sibling package compatible.

## tensor-core traps

- **Default dtype is `f32`** everywhere (`from`, `zeros`, `arange`, ...);
  `random.randint` defaults to `i32`. Pass `{ dtype: "f64" }` for numeric
  work — most of the family's own tests do.
- **No implicit dtype promotion.** Mixing dtypes in any binary op, matmul,
  or comparison throws — `cast()` first. `div` on `i64` throws too. The
  one NumPy-matching exception: `mean`/`variance`/`std` of integer dtypes
  return `f64`.
- **Views vs copies is a contract, not an optimization.**
  `reshape`/`permute`/`transpose`/`slice`/`select`/`broadcastTo`/`unfold`
  are views (`a.data === b.data` detects them); `take`/`gather`/`mask`/
  `cast`/`contiguous` copy. `cast()` *always* copies, even same-dtype, and
  integer casts truncate toward zero.
- **`.npy` I/O is little-endian, C-order only** — `fortran_order: True`
  throws, big-endian descrs throw, and `f16`/`bf16` have no `.npy`
  representation at all. NumPy will happily *write* files this reader
  rejects.

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
- Step functions (`floor`/`round`/`sign`/...) and comparisons have zero
  gradient — correct, and a classic "why isn't my parameter moving" trap.

## wasm traps

- **Trap poisoning:** the first Rust panic (WASM trap) permanently poisons
  the whole `Kernels` instance — every later call throws, reads refuse
  possibly-corrupt memory, `free()` becomes a no-op. Recovery is a fresh
  `Kernels.load()`. IEEE division-by-zero does *not* poison (±Infinity/NaN,
  same as JS).
- SIMD is a second `.wasm` module (any v128 instruction fails validation
  wholesale on non-SIMD runtimes) and engages only for stride-1 operands
  on `addInto`/`mulInto`. Results are bit-identical to scalar.
- In a git clone the `.wasm` artifacts are **gitignored** — `npm run
  build:wasm` (Rust + lld) or `Kernels.load()` throws `ENOENT`. The
  published npm package ships them prebuilt.
- The SIMD benchmark is deliberately not in `npm test` — see the
  [family page](/math/math-plus/) for why.

## webgpu traps

- f32 only; contiguous only; `GPUBuffer`s are **manually freed**, including
  chain intermediates. `runQKT` is unscaled — apply `1/sqrt(dim)` yourself.
- `runElementwiseWGSL` doesn't broadcast; do it CPU-side first.
- WGSL `pow` is NaN for negative bases where JS isn't, and f32-epsilon
  comparisons can flip `select` branches — exactly the ops the GPU-vs-CPU
  fuzzer excludes on purpose.
