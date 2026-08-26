---
title: 'Math Plus: interop & telemetry'
description: The MCP server for agents, the Python-side bridge on PyPI, and the shared telemetry stream — three packages on three different release channels.
---

Three packages, three release channels: `mcp` and `telemetry` ship to npm/JSR like the rest of the family; `interop-python` ships to **PyPI** and has no `package.json` at all.

| Package | Channel | What it is |
|---|---|---|
| `@johnhenry/math-plus-mcp` | npm + JSR | MCP server: symbolic CAS + guarded numeric tools for agents. stdio only. |
| `johnhenry-math-plus-interop` | **PyPI** (module `math_plus_interop`) | Python-side Arrow IPC / Parquet / npy helpers pairing with the JS frame/tensor packages |
| `@johnhenry/math-plus-telemetry` | npm + JSR | Shared training-event schema + sink registry, zero-cost no-op default |

## mcp: a closed vocabulary, on purpose

```bash
npx math-plus-mcp                                # stdio; no HTTP/SSE transport
claude mcp add math-plus -- npx math-plus-mcp
```

Nine tools: six `symbolic_*` (parse/simplify/differentiate/integrate/solve/
evaluate, backed by `@johnhenry/math`'s CAS), plus `linalg_solve`,
`tensor_pipeline`, and `stats_summary`. The numeric side is a **closed op
table** — `tensor_pipeline`'s entire vocabulary is 13 ops (`sum, mean, min,
max, abs, exp, log, sqrt, neg, transpose, reshape, addScalar, mulScalar`),
and the source comment is explicit: *"there is deliberately no generic
escape hatch."*

Know before wiring it up:

- **Nothing is configurable at runtime — there are no env vars.** The
  1,000,000-element cap and the 16-step pipeline cap are compile-time
  constants, enforced after *every* pipeline step (intermediates count).
- Every failure is an `isError` tool result, never a protocol exception —
  what an agent host actually wants.
- It's embeddable: `buildServer()` + the SDK's `InMemoryTransport` gives
  you the full wire path in-process (the repo's `examples/09-mcp-tools.mjs`
  does exactly this).
- For a *stateful* agent-drivable surface — sessions, reactive cells —
  that's a different project: [`math-grapher`](/math/math-grapher/).

## interop-python: the bridge, and the NaN trap it exists to fix

```bash
pip install johnhenry-math-plus-interop   # Python >=3.11; pyarrow+pandas+numpy are HARD deps
```

Eight functions: `read_ipc`/`write_ipc` (pairs with `frame-arrow`'s
`toIPC`/`fromIPC`), `read_parquet`/`write_parquet` (pairs with
`frame-parquet`), `load_npy`/`save_npy`/`load_npz`/`save_npz` (pairs with
`tensor-core`'s `.npy` I/O). Verified by a bidirectional conformance suite —
JS writes/Python reads and Python writes/JS reads, from one committed set of
fixtures.

- **The NaN-vs-null trap (issue #103):** pyarrow's default `from_pandas`
  conversion silently collapses genuine NaN floats into Arrow *nulls* —
  "not-a-number" and "missing" are different things. `write_ipc`/
  `write_parquet` rebuild plain float columns with `from_pandas=False` so a
  NaN round-trips as NaN. This is the package's single most load-bearing
  behavior.
- Readers return `pd.ArrowDtype` columns (so nullable ints don't silently
  become float64) — which means **`is None` doesn't detect nulls; use
  `pd.isna`**, and cast booleans explicitly.
- **The npy asymmetry:** NumPy will happily `save` big-endian or
  Fortran-order arrays that the JS reader **rejects** (little-endian,
  C-order, no f16/bf16 — v1 scope). The Python helpers don't validate this
  for you.
- Argument orders differ deliberately: `write_ipc(df, path)` but
  `save_npy(path, array)` (matching `numpy.save`).
- Parquet `filters` here are **pyarrow tuples** (`[("id", ">", 3)]`) — not
  a translation of the JS side's Mongo-style `$gt` shapes. The two pushdown
  APIs are different by design; translating between them is explicitly out
  of v1 scope.
- Also explicitly out of scope, with receipts: the Arrow C Data
  Interface/PyCapsule zero-copy bridge (deferred until a native Node addon
  exists) and `__dataframe__()` (rejected — pandas 4.0 removes it).

## telemetry: one global slot, honest about its costs

```ts
import { setSink } from '@johnhenry/math-plus-telemetry';
setSink((e) => console.log(e.type, e)); // that's the whole opt-in
```

A discriminated-union event schema (`run.start` / `metric` /
`tensor.summary` / `artifact` / `trace`) with a null-object default sink.
Two producers today: `tensor-autograd` (a `backward` trace span;
`optim/gradNorm` from every optimizer) and `tensor-wasm`'s arena allocator
(`wasm/alloc.bytes` + `wasm/alloc.calls`). The differentiated goal isn't
loss curves — it's JS↔WASM memory-residency accounting, a cost Python
tooling can't see because NumPy never crosses that boundary.

- **`setSink` replaces — it's a single global slot, not a registry.** Two
  consumers can't coexist; there's no unsubscribe token; always
  `setSink(null)` in a `finally`.
- **Installing any sink switches on real work globally**: the optimizers
  only *compute* the grad norm when `hasSink()` is true, and the allocator
  starts emitting per-alloc. A sink installed "just for loss curves" pays
  for everything.
- Two time bases: `metric.time` is `Date.now()`, trace spans use
  `performance.now()` — don't compare them.
- `TensorSummary` structurally cannot carry raw tensor values — summaries
  (shape/dtype/min/max/mean/std/finite-fraction), never dumps, by default.
