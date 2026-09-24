---
title: Backends
description: The three laya-js tensor backends — native MLX, WebGPU and the CPU reference — which runtimes get which, f16 vs f32, and how exact each one is.
sidebar:
  order: 2
---

Every backend implements one op contract, `Backend` from `@johnhenry/tensor-backend`. Each one passes the same conformance suite, whose golden cases come from Python MLX. Backends are **passed explicitly**; there is no global default. `load(…, { backend })` accepts either a `Backend` instance, which you then own, or one of `"auto"`, `"mlx"`, `"webgpu"` and `"cpu"`.

| Runtime | MLX | WebGPU | CPU |
|---|---|---|---|
| Node ≥ 24, macOS arm64 | f32, f16 | f32, f16 (Dawn → Metal) | f32 |
| Node ≥ 24, Linux / Windows | — | f32, f16 where Dawn finds an adapter | f32 |
| Bun ≥ 1.2 | same as Node (`bun:ffi`) | same as Node (same Dawn addon) | f32 |
| Deno 2 | — (no `Deno.dlopen` adapter yet) | f32, f16 (built-in wgpu); the backend is tested, `laya` is not | f32 |
| Chrome / Edge ≥ 113 | — | f32; f16 from 120 (`shader-f16`) | f32 |
| Safari 26, Firefox ≥ 141 | — | expected to work, not verified | f32 |

- **`backend: "auto"`** tries MLX first (macOS arm64 with a loadable libmlxc), then WebGPU (if an adapter is available), then CPU. In browsers the order is WebGPU, then CPU.
- **`dtype: "f16"` is the default.** The CPU backend computes in f32, and so does WebGPU without `shader-f16`; `agent.dtype` reports which one is in use.

## `@johnhenry/backend-mlx`

Native [MLX](https://github.com/ml-explore/mlx) through [mlx-c](https://github.com/ml-explore/mlx-c), loaded with `koffi` on Node and with `bun:ffi` on Bun.

Python laya-mlx runs the same `libmlx` and the same Metal kernels, so results match it **bit for bit**, in fp16 as well as fp32. `compile: true` traces the forward pass with `mlx_compile`, once per input shape.

MLX op dispatch costs 0.80 µs per op on Node/koffi and 0.55 µs on Bun, against 0.40 µs in Python. GPU time is identical to Python's.

macOS on Apple Silicon only. MLX is pinned to 0.32.2, the version in the prebuilt bundle.

## `@johnhenry/backend-webgpu`

Hand-written WGSL kernels, including f16 and flash attention.

- **Browsers**: uses `navigator.gpu`.
- **Node and Bun**: uses [Dawn](https://github.com/dawn-gpu/node-webgpu) (the `webgpu` package).
- **Deno**: uses its built-in wgpu.

The package's internal `#dawn` import resolves to a stub in browser builds, so bundlers never see the Dawn addon.

f32 results are within 1e-4 of MLX. f16 results differ from the third decimal on, because the kernels are different, but they give the same argmax. Every op is its own dispatch: there is no graph fusion, and `compile` is MLX-only. The kernels are tuned on an Apple M2 and have not been tested on discrete or mobile GPUs.

## `@johnhenry/backend-cpu`

A pure-TypeScript f32 reference with no dependencies. The GPU backends are tested against it, and it matches Python on all 63 parity questions, with a maximum logit error of 4e-5.

It is exact but slow: tens of seconds per case on the large checkpoints. Use it as an oracle and a fallback, not as a production path.

## Writing your own

`@johnhenry/tensor-backend` exports the contract and the conformance suite. Any object that implements `Backend` and passes the suite can run `@johnhenry/modernbert` and `@johnhenry/laya`. The contract's dtype names and `HostTensor` layout match `@johnhenry/math-plus-tensor-core`, so `toMathPlusArgs` passes results to a [Math Plus](/math/math-plus-tensor/) `Tensor` without a copy.

## Speed

Median forward-pass time on an Apple M2 (fanless), English checkpoint, f16, batch size 1, cold GPU:

| tokens | 33 | 93 | 256 | 512 |
|---|---:|---:|---:|---:|
| MLX (JS) | 22.4 ms | 39.5 ms | 80.0 ms | 150.6 ms |
| WebGPU (Node/Dawn) | 25.1 ms | 57.4 ms | 139.7 ms | 278.9 ms |

JS on MLX runs at the same speed as Python. At longer inputs WebGPU takes 1.5–1.9× as long as MLX. The gap is GEMM throughput: WGSL can't use Apple's matrix units at full speed. The full grid and the thermal caveat for fanless machines are in [docs/RESULTS.md](https://github.com/johnhenry/laya-js/blob/main/docs/RESULTS.md).
