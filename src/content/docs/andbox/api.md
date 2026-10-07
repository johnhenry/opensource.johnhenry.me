---
title: "API reference"
description: "Full API reference for @johnhenry/andbox: createSandbox (browser Worker, Node worker thread, inline, data-uri, service-worker), capability gating, virtual module registry, network fetch allowlisting, stdio, and Worker utilities."
---

## API

### `createSandbox(options?)`

Creates a new runtime in its own execution context. Returns a promise (Worker mode, including Node worker threads) or object (inline/data-uri mode). Works in browsers and under Node 26 or newer (see [Running under Node](/andbox/#running-under-node)). See [Security model](/andbox/#security-model) for what Worker mode does and doesn't protect against.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | `'worker' \| 'node-worker' \| 'inline' \| 'data-uri' \| 'service-worker'` | `'worker'` | Execution mode; any other value throws. Under Node, `'worker'` selects `node-worker` when there is no global `Worker`. |
| `importMap` | `{ imports?, scopes? }` | `{}` | Import map for package resolution (Worker mode) |
| `capabilities` | `Record<string, Function>` | `{}` | Host functions callable via `host.call()` (Worker mode) |
| `defaultTimeoutMs` | `number` | `30000` | Default timeout for `evaluate()` |
| `baseURL` | `string` | `location.href` | Base URL for relative imports |
| `policy` | `GatePolicy` | -- | Rate limiting policy |
| `onConsole` | `(level, ...args) => void` | -- | Console output handler |
| `globals` | `Record<string, any>` | `{}` | Global variables (inline/data-uri modes) |
| `workerFactory` | `(source: string) => WorkerLike` | -- | Supply the Worker implementation yourself; overrides automatic selection. See `createNodeWorkerFactory()`. |
| `nodeWorker` | `NodeWorkerOptions` | -- | Node `worker_threads` options and opt-in hardening (below). Throws with a browser Worker or a custom `workerFactory`. |
| `unref` | `boolean` | `false` | Node only. Unref the thread while the sandbox is idle so it does not keep the process alive; it stays ref'd during startup, `evaluate()` and `defineModule()`. Ignored with a browser Worker. |

**Returns (Worker mode):** `Promise<{ evaluate, defineModule, dispose, stats, isDisposed }>`

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

**Inside sandbox code (Worker mode):**

- `host.call(name, ...args)` -- Call a host capability by name
- `sandboxImport(name)` -- Import a virtual module
- `console.log/warn/error/info` -- Forwarded to host `onConsole`

### `sandbox.defineModule(name, source)`

Defines a virtual module that sandbox code can import via `sandboxImport(name)`.

### `sandbox.dispose()`

Terminates the Worker and rejects all pending evaluations. Safe to call more than once. Under Node, a live worker thread keeps the process alive until `dispose()` (unless `unref: true`).

### `sandbox.stats()`

Returns runtime statistics including pending evaluations, virtual modules, and gate stats.

### `gateCapabilities(capabilities, policy?)`

Wraps host functions with rate limiting and payload caps for cooperative callers — not a defense against code specifically trying to bypass it (see [Security model](/andbox/#security-model); sandboxed code can still reach Worker-global APIs such as `fetch` directly). The gated object is built with `Object.create(null)`, so `host.call('constructor', ...)` does not resolve through the prototype chain.

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

Creates a fetch function that checks the request hostname against an allowlist before calling through. Useful for keeping cooperative code pointed at the hosts you intend. It is redirect-safe: requests use `redirect: 'manual'` and any redirect response is rejected rather than followed (see [Security model](/andbox/#security-model)).

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

### `makeWorkerSource()`

Returns the Worker script source code as a string (useful for custom Worker setups).

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
