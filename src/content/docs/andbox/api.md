---
title: "API reference"
description: "Full API reference for @johnhenry/andbox: createSandbox (browser Worker, Node worker thread, wasm, iframe, inline, data-uri, service-worker), the network option, capability gating, virtual module registry, network fetch allowlisting, stdio, and Worker utilities."
sidebar:
  order: 4
---

## API

### `createSandbox(options?)`

Creates a new runtime in its own execution context. Returns a promise (Worker, wasm and iframe modes, including Node worker threads) or object (inline/data-uri mode). Works in browsers and under Node 26 or newer (see [Running under Node](/andbox/#running-under-node)). See [Security model](/andbox/#security-model) for what Worker mode does and doesn't protect against.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | `'worker' \| 'node-worker' \| 'wasm' \| 'iframe' \| 'inline' \| 'data-uri' \| 'service-worker'` | `'worker'` | Execution mode; any other value throws. Under Node, `'worker'` selects `node-worker` when there is no global `Worker`. |
| `importMap` | `{ imports?, scopes? }` | `{}` | Import map for package resolution (Worker mode) |
| `capabilities` | `Record<string, Function>` | `{}` | Host functions callable via `host.call()` (Worker mode) |
| `defaultTimeoutMs` | `number` | `30000` | Default timeout for `evaluate()` |
| `baseURL` | `string` | `location.href` | Base URL for relative imports |
| `allowedImportHosts` | `string[]` | unset | Restricts `sandboxImport()` of remote `http(s)` modules to these hostnames (plus `baseURL`'s own host). **Unset: remote imports are allowed** (0.1.1). Provided: only listed hosts; `[]` denies all remote imports. Import-map targets are host-authored and always allowed. |
| `untrusted` | `boolean` | `false` | Convenience for untrusted code: selects `mode: 'wasm'`. Throws if combined with another `mode`, and rejects (never falls back to a Worker) if wasm mode is unavailable. |
| `policy` | `GatePolicy` | -- | Rate limiting policy |
| `onConsole` | `(level, ...args) => void` | -- | Console output handler |
| `globals` | `Record<string, any>` | `{}` | Global variables (inline/data-uri modes) |
| `engineURL`, `wasmURL` | `string` | -- | `mode: 'wasm'`: same-origin URLs of the bundled engine module and the `.wasm` (optional under Node). See [Installing the engine](/andbox/wasm-mode/#installing-the-engine). |
| `fuel`, `memoryBytes`, `stackBytes`, `deadlineMs` | `number` | see [Limits](/andbox/wasm-mode/#limits) | `mode: 'wasm'` limits (also accepted per `evaluate()` call) |
| `container` | `Element` | offscreen in `document.body` | `mode: 'iframe'`: element the frame is appended to. A restarted frame takes its predecessor's place instead. |
| `html` | `string` | `''` | `mode: 'iframe'`: initial `<body>` markup of every new frame |
| `csp` | `string` | -- | `mode: 'iframe'`: Content-Security-Policy for the frame (`<meta http-equiv>`); must allow `'unsafe-eval'` if it restricts scripts |
| `iframeSandbox` | `string[]` | `[]` | `mode: 'iframe'`: extra sandbox tokens (`allow-scripts` is always set); `'allow-same-origin'` throws unless `dangerouslyAllowSameOrigin` |
| `dangerouslyAllowSameOrigin` | `boolean` | `false` | `mode: 'iframe'`: permit `'allow-same-origin'`, which removes the origin boundary |
| `onFrame` | `(iframe) => void` | -- | `mode: 'iframe'`: called with every new frame (first and after each restart) before it is attached |
| `network` | `{ fetch?, allowedHosts?, credentials? }` | unset | `worker`, `node-worker`, `iframe` (0.1.3): install a global `fetch` in the sandbox that sends every request through the host function (the gated `fetch` capability). **Unset: no `fetch` in worker modes.** Throws in other modes, or with a capability named `fetch`. See [Mediated network](/andbox/network/). |
| `workerFactory` | `(source: string) => WorkerLike` | -- | Supply the Worker implementation yourself; overrides automatic selection. See `createNodeWorkerFactory()`. |
| `nodeWorker` | `NodeWorkerOptions` | -- | Node `worker_threads` options and opt-in hardening (below). Throws with a browser Worker or a custom `workerFactory`. |
| `unref` | `boolean` | `false` | Node only. Unref the thread while the sandbox is idle so it does not keep the process alive; it stays ref'd during startup, `evaluate()` and `defineModule()`. Ignored with a browser Worker. |

**Returns (Worker mode):** `Promise<{ evaluate, defineModule, dispose, stats, isDisposed }>`. `mode: 'iframe'` adds `iframe`, the live `HTMLIFrameElement` (`null` after `dispose()`, replaced after a restart; see [`mode: 'iframe'`](/andbox/iframe-mode/)). In `mode: 'wasm'`, `stats()` also reports `fuelUsed`, `peakMemoryBytes` and `totalFuelUsed`.

**`nodeWorker` options (Node only):**

| Option | Type | Description |
|--------|------|-------------|
| `permissions` | `boolean` | Spawn the thread with Node's permission model (`--permission`), an isolated `env` (`{}` unless `env` is given), a default 256 MB heap cap, a stripped `process`, blocked `node:`/`file:` imports and captured stdio. Does not restrict network or CPU. |
| `env` | `Record<string, string>` | Environment for the thread. Default: a copy of `process.env` (or `{}` with `permissions`). |
| `maxMemoryMb` | `number` | Heap cap, as `resourceLimits.maxOldGenerationSizeMb`. |
| `resourceLimits` | `object` | Raw `worker_threads` resource limits, merged over `maxMemoryMb`. |
| `execArgv` | `string[]` | Extra thread flags, e.g. `['--allow-fs-read=/data']`. |
| `captureStdio` | `boolean` | Route thread stdout/stderr to `onConsole('stdout' \| 'stderr', text)`. Default: true with `permissions`. |

A worker thread is not a security boundary, with or without `permissions`; see [Security model](/andbox/#security-model).

### `sandbox.evaluate(code, opts?)`

Evaluates JavaScript code in the sandbox. The code is wrapped in an async IIFE -- use `return` to produce a result.

| Option | Type | Description |
|--------|------|-------------|
| `timeoutMs` | `number` | Override default timeout |
| `signal` | `AbortSignal` | Abort evaluation |
| `onConsole` | `(level, ...args) => void` | Per-call console handler |
| `fuel`, `memoryBytes`, `stackBytes`, `deadlineMs` | `number` | `mode: 'wasm'` only: per-call [limits](/andbox/wasm-mode/#limits) |

**Inside sandbox code (Worker, wasm and iframe modes):**

- `host.call(name, ...args)` -- Call a host capability by name
- `sandboxImport(name)` -- Import a virtual module (or, outside wasm mode, an import-mapped package or a remote URL allowed by `allowedImportHosts`)
- `console.log/warn/error/info` -- Forwarded to host `onConsole`
- `fetch(url, init)` -- Only with the [`network`](/andbox/network/) option: the host-backed shim

**Capabilities** are called with `this = { signal, name }` (0.0.10): `signal` aborts when the Worker (or frame) is terminated by a timeout, an aborted `evaluate()`, `dispose()` or a crash, and a late result is dropped. Write effectful capabilities as `function`s, not arrows, to receive it.

### `sandbox.defineModule(name, source)`

Defines a virtual module that sandbox code can import via `sandboxImport(name)`.

### `sandbox.dispose()`

Terminates the Worker (removes the frame in `mode: 'iframe'`) and rejects all pending evaluations. Safe to call more than once. Under Node, a live worker thread keeps the process alive until `dispose()` (unless `unref: true`).

### `sandbox.stats()`

Returns runtime statistics including pending evaluations, virtual modules, and gate stats.

### `gateCapabilities(capabilities, policy?)`

Wraps host functions with rate limiting and payload caps for cooperative callers — not a defense against code specifically trying to bypass it (see [Security model](/andbox/#security-model); sandboxed code in worker mode can still reach the network through the platform `import()` operator). The gated object is built with `Object.create(null)`, so `host.call('constructor', ...)` does not resolve through the prototype chain.

```js
import { gateCapabilities } from '@johnhenry/andbox';

const { gated, stats } = gateCapabilities(
  { fetch: async (url) => (await fetch(url)).text() },
  {
    limits: { maxCalls: 100, maxArgBytes: 1_000_000, maxConcurrent: 8 },
    capabilities: { fetch: { maxCalls: 50 } },
  }
);
```

### `resolveWithImportMap(specifier, importMap, parentURL?)`

Resolves a module specifier against an import map, following the browser import map algorithm.

### `createVirtualModuleRegistry(files?, options?)`

Takes a `path → source` map and mints one importable URL per entry: a `blob:` URL in a browser, or, under Node (which cannot `import()` a `blob:` URL), an `andbox-vfs://<id>/<path>?v=<n>` URL served by an in-thread module hook. `options.backend` is `'auto'` (default), `'blob'` or `'node'`; `options.importMap` supplies bare-specifier resolution.

```js
import { createVirtualModuleRegistry } from '@johnhenry/andbox';

const registry = createVirtualModuleRegistry({
  'index.js': 'import { add } from "./util.js"; export const result = add(2, 3);',
  'util.js': 'export function add(a, b) { return a + b; }',
});

registry.resolve('index.js');                       // importable URL, or null if unknown
registry.source('index.js');                        // the registered source text
registry.resolveSpecifier('./util.js', 'index.js');  // resolves relative to the importing file
registry.define('extra.js', 'export const x = 1;');  // register (or replace) a file at runtime
registry.dispose();                                  // revokes blob URLs / drops the Node files
```

The registry also has `has(path)`, `paths()` and `isDisposed()`. `resolveSpecifier(specifier, parentPath?)` tries import-map resolution first, then a relative-path (`./`, `../`) lookup against the registry's own files, and returns `null` if neither matched. **Under Node, relative imports just work:** `await import(registry.resolve('index.js'))` runs `index.js`, and its `./util.js` import is resolved by the hook (relative, bare-name, import map, cycles, extensionless and `index.js` lookups). **In a browser (`blob:` backend)** only resolution is solved, not automatic rewriting of `import` statements inside the source text: a literal `import "./util.js"` in blob-served source will not resolve on its own, so call `resolveSpecifier()` yourself and use the URL it returns. See [andbox#13](https://github.com/johnhenry/andbox/issues/13).

### `createNetworkFetch(allowedHosts?, fetchFn?)`

Creates a fetch function that checks the request hostname against an allowlist before calling through. Useful for keeping cooperative code pointed at the hosts you intend. It is redirect-safe: requests use `redirect: 'manual'` and any redirect response is rejected rather than followed (see [Security model](/andbox/#security-model)). It is what `network: { allowedHosts }` puts in front of the sandbox's `fetch`.

```js
import { createNetworkFetch } from '@johnhenry/andbox';

const gatedFetch = createNetworkFetch(['api.example.com']);
await gatedFetch('https://api.example.com/data'); // OK
await gatedFetch('https://evil.com/steal');        // throws
```

### `createStdio()`

Creates an async iterable stream for console output capture.

### `makeDeferred()`, `makeAbortError()`, `makeTimeoutError(ms)`

Promise and error utilities used internally, also available for consumers.

### `makeWorkerSource(options?)`

Returns the Worker script source code as a string (useful for custom Worker setups). `makeWorkerSource({ networkFetch: true })` is the variant `network` uses: `fetch` is the host-backed shim, which calls the host's `fetch` capability (your host must answer `capabilityCall` messages for it, as `createSandbox()` does). `makeWorkerSource()` with no options is unchanged.

### `WASM_ERROR_CODES`

A frozen map from `mode: 'wasm'`'s error names to their `code`s: `FuelExhaustedError` → `ERR_ANDBOX_FUEL_EXHAUSTED`, `MemoryLimitError` → `ERR_ANDBOX_MEMORY_LIMIT`, `TimeoutError` → `ERR_ANDBOX_DEADLINE` (the cooperative deadline), `EngineError` → `ERR_ANDBOX_ENGINE`. A missing engine rejects `createSandbox()` with `ERR_ANDBOX_ENGINE_MISSING`. See [Limits](/andbox/wasm-mode/#limits).

### `createNodeWorkerFactory(options?)`

Node only. Loads `node:worker_threads` and returns a promise of a synchronous factory `(source) => WorkerLike` that runs andbox's worker source in a thread. Takes the same options as `nodeWorker` above and is suitable for passing as `workerFactory`. You rarely need it directly: `createSandbox()` selects the Node implementation on its own.

### Service Worker mode

`createSandbox({ mode: 'service-worker', ... })` registers a Service Worker that backs a `path → content` map with real, same-origin, HTTP-shaped fetch and navigation semantics (andbox#14). It is not code execution: it hosts a small virtual multi-file site. Browser only; it rejects under Node.

| Option | Type | Description |
|--------|------|-------------|
| `scriptURL` | `string` | **Required.** A real same-origin `http(s)` URL where you already serve `makeServiceWorkerSource()`'s output; Service Worker registration does not accept `blob:` URLs. |
| `scope` | `string` | Path prefix to register under. Defaults to `scriptURL`'s own directory. |
| `files` | `Record<string, string \| { body, contentType?, status?, headers? }>` | Initial served-file map. |
| `registry` | `VirtualModuleRegistry` | A `createVirtualModuleRegistry()` instance to pull additional served content from. |
| `timeoutMs` | `number` | Max time to wait for the registration to become active before rejecting. |

Returns `Promise<{ scriptURL, scope, define(path, source, opts?), remove(path), dispose(), isDisposed() }>`. The promise resolves once the registration is active; don't navigate anything into `scope` before then. See [Security model](/andbox/#security-model).

```js
const site = await createSandbox({
  mode: 'service-worker',
  scriptURL: '/andbox-sw.js', // you serve makeServiceWorkerSource()'s output here
  scope: '/virtual/',
  files: { '/virtual/hello.html': { body: '<h1>Hello</h1>', contentType: 'text/html' } },
});
iframe.src = '/virtual/hello.html';
await site.define('/virtual/about.html', '<h1>About</h1>');
await site.dispose(); // unregisters the Service Worker
```

### `makeServiceWorkerSource()`

Returns the Service Worker script source as a string. Unlike `makeWorkerSource()`'s output, it must be served as a real same-origin file.

### `resolveServiceWorkerResponse(pathname, files)`

Given a request pathname and a served-file map (`Map` or plain object), returns the `Response` the Service Worker's `fetch` handler would produce, or `null` if the request should fall through to the network. The pure logic factored out of the generated script, for testing.
