---
title: "mode: 'wasm'"
description: "andbox's mode for untrusted code: QuickJS-ng compiled to WebAssembly inside the Worker, with host.call as the only authority and real fuel, memory, stack and deadline limits."
sidebar:
  order: 1
---

`mode: 'wasm'` (added in 0.0.8, [andbox#21](https://github.com/johnhenry/andbox/issues/21)) is the mode for untrusted
code, and `createSandbox({ untrusted: true })` selects it. The code you `evaluate()` is not run by the Worker's
JavaScript engine at all: it runs in [QuickJS-ng](https://github.com/quickjs-ng/quickjs) compiled to WebAssembly, in the
same Worker (browser) or `worker_thread` (Node) andbox already uses. A fresh QuickJS runtime and context is created for
every `evaluate()`.

The engine has no `fetch`, `WebSocket`, `XMLHttpRequest`, `importScripts`, `indexedDB`, `postMessage`, `self`,
`Worker`, timers or `process`: they are not hidden, they simply do not exist in that engine. Its only way out is the
single native function behind `host.call(name, ...args)`, which goes through the same capability gate and `policy` as
worker mode. `sandboxImport()` and `import()` resolve **only** virtual modules (`defineModule()`); no URL is ever
fetched.

```js
import { createSandbox } from '@johnhenry/andbox';

const sandbox = await createSandbox({
  mode: 'wasm',                    // or: untrusted: true
  capabilities: { readFile: async (path) => { /* host side */ } },
  fuel: 50_000,                    // interrupt polls, deterministic (default: unlimited)
  memoryBytes: 32 * 1024 * 1024,   // JS heap cap (default 64 MiB)
  stackBytes: 128 * 1024,          // guest stack cap (default 128 KiB)
  deadlineMs: 2_000,               // cooperative wall-clock deadline (default: the call's timeoutMs)
});

await sandbox.evaluate('return await host.call("readFile", "/etc/hostname")');
```

`untrusted: true` throws if combined with another `mode`, and rejects instead of falling back to a Worker if wasm mode
is unavailable (for example when the engine is not installed).

## Installing the engine

The engine is an **optional** peer dependency, pinned to exact versions, so the default install stays
dependency-free:

```sh
npm install --save-exact quickjs-emscripten-core@0.32.0 @jitl/quickjs-ng-wasmfile-release-sync@0.32.0
```

Without them `createSandbox({ mode: 'wasm' })` rejects with `ERR_ANDBOX_ENGINE_MISSING` and the install command above.
Every other mode is unaffected.

**Node:** nothing else to do. andbox finds the installed packages and the `.wasm` file itself.

**Browser:** the Worker needs two files from your own origin: the engine as one ES module, and the `.wasm` file. Build
them once:

```sh
npx esbuild node_modules/@johnhenry/andbox/src/wasm-engine.mjs \
  --bundle --format=esm --platform=browser --minify --outfile=public/andbox-quickjs.mjs
cp node_modules/@jitl/quickjs-ng-wasmfile-release-sync/dist/emscripten-module.wasm public/andbox-quickjs.wasm
```

and point andbox at them (relative URLs resolve against `baseURL`, which defaults to the page URL):

```js
const sandbox = await createSandbox({
  mode: 'wasm',
  engineURL: '/andbox-quickjs.mjs',
  wasmURL: '/andbox-quickjs.wasm',
});
```

Or give them through the sandbox import map, so a page that already has one needs no new option:
`importMap: { imports: { '@johnhenry/andbox/wasm-engine': '/andbox-quickjs.mjs', '@johnhenry/andbox/wasm': '/andbox-quickjs.wasm' } }`.
Serve the `.wasm` as `application/wasm`. Size: about 54 KB for the engine module (15 KB gzipped) plus 528 KB for the
`.wasm` (248 KB gzipped). The repo's
[`examples/08-wasm-browser/`](https://github.com/johnhenry/andbox/tree/main/examples/08-wasm-browser) is a complete
build, server and headless-Chrome check.

## Limits

| Option (sandbox or per `evaluate()` call) | What it does | Reported as |
|---|---|---|
| `fuel` | Budget of interrupt-handler polls (QuickJS polls about once per 10,000 VM operations). Counted, not timed, so the same code stops at the same count on every run. `sandbox.stats().fuelUsed` shows the last call's count. Guest code cannot catch it. | `FuelExhaustedError`, `code: 'ERR_ANDBOX_FUEL_EXHAUSTED'` |
| `memoryBytes` | Cap on the guest JS heap plus QuickJS's own limit, which rejects any single allocation above it. The engine's whole linear memory also gets a hard maximum of about `2 * memoryBytes + 32 MiB`, which is what bounds `ArrayBuffer` and similar allocations. | `MemoryLimitError`, `code: 'ERR_ANDBOX_MEMORY_LIMIT'` |
| `stackBytes` | QuickJS call-stack cap. Overflow is an ordinary, catchable guest `RangeError`. | `RangeError` |
| `deadlineMs` | Wall-clock deadline for the whole call, including time spent awaiting host calls. The Worker survives; no respawn. Defaults to the call's `timeoutMs`. | `TimeoutError`, `code: 'ERR_ANDBOX_DEADLINE'` |
| `timeoutMs` | In this mode, the **backstop**: the host `terminate()`s the Worker `max(timeoutMs, deadlineMs) + 1000 ms` after the call starts. `AbortSignal` still terminates and restarts the Worker. | `TimeoutError` / `AbortError` |

`stats()` additionally returns `fuelUsed`, `peakMemoryBytes` (sampled) and `totalFuelUsed`. The error classes are plain
`Error`s with the `name` and `code` shown; `WASM_ERROR_CODES` exports the codes. An exception that escapes the engine
itself is reported as `EngineError` / `ERR_ANDBOX_ENGINE`, and the engine is reloaded for the next call.

## Differences from worker mode

- `host.call` arguments and results, and the value you `return`, are JSON-serialised (worker mode uses structured
  clone). `undefined`, functions (`'[Function]'`) and `BigInt` (as a string) are handled as in worker mode; `Map`,
  `Set`, `Date` and typed arrays are not preserved.
- Each `evaluate()` starts from a fresh global scope. Nothing set on `globalThis` survives; use `defineModule()` or the
  host for shared state.
- `sandboxImport()` is limited to virtual modules. An import-map entry that points at a URL does not make that URL
  loadable.
- Concurrent `evaluate()` calls on one sandbox share the Worker's single thread: a busy loop in one delays the others.
  Use one sandbox per tenant if that matters.
- `nodeWorker.permissions` is rejected with this mode for now (the Worker has to read the engine from disk). The other
  `nodeWorker` options work.
- `network` throws in this mode: expose a capability and use `host.call()` instead.
- A guest can catch the engine's out-of-memory error and keep running inside the cap; it cannot exceed the cap.
- `Date`, `Math.random` and `performance` exist in the guest (QuickJS provides them from the host clock).

## What it does not defend against

- **Bugs in QuickJS-ng or in the WebAssembly engine.** A memory-safety bug in QuickJS is confined to the module's linear
  memory, but a bug in the browser's WebAssembly implementation is a browser sandbox escape. Keep browsers and Node
  updated.
- **What your capabilities do.** `host.call` is the whole attack surface. Validate arguments host-side, and keep
  side-effecting capabilities idempotent: a deadline does not undo a host call already in flight
  ([andbox#35](https://github.com/johnhenry/andbox/issues/35)).
- **Timing and side channels.** `Date.now()` and `performance.now()` come from the host clock; andbox does not coarsen
  them.
- **Denial of service beyond the limits.** Fuel, memory and deadline bound one `evaluate()`; not how many you start, how
  big a capability result is, or CPU time spent inside the host while serving a call.
- **The host trusting the result.** Return values are plain JSON from untrusted code.

For hostile multi-tenant workloads on a server, add OS-level isolation as well. See the
[Security model](/andbox/#security-model) and [Threat model by mode](/andbox/#threat-model-by-mode).
