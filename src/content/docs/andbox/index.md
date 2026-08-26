---
title: "andbox"
description: "Run JavaScript in its own Web Worker context with capability-gated RPC, import maps, rate limits, and hard-kill timeouts — zero dependencies. Not a security sandbox."
---

andbox runs JavaScript in a dedicated Web Worker with a structured bridge back to the host. Code in that Worker can call host-provided "capabilities" via RPC, use import-mapped packages, and define virtual modules -- all with configurable rate limits, timeouts, and hard-kill semantics.

**andbox's job is running code in its own context with a clean RPC surface, not containing adversarial code.** The Worker boundary keeps well-behaved code from touching the DOM or host globals by accident, and gives you rate limits, timeouts, and a kill switch for code you trust but don't want to block on or grant unrestricted access to. It is **not** a security sandbox — code that specifically tries to escape can reach `fetch`/`WebSocket`/`Worker` directly, and the capability gate can be bypassed via the prototype chain. See [Security model](#security-model) before using andbox to run code you don't trust.

Zero dependencies. Uses only Web Workers and standard browser APIs.

> Previously published as `andbox` (last unscoped version 0.1.1). Same
> library, same API — the scoped package restarts its version line at
> 0.0.0: a new address and era, not a maturity signal.

## Install

```bash
npm install @johnhenry/andbox
```

Or via CDN (no bundler needed):

```js
import { createSandbox } from 'https://esm.sh/@johnhenry/andbox';
```

## Quick Start

```js
import { createSandbox } from '@johnhenry/andbox';

const sandbox = await createSandbox({
  capabilities: {
    readFile: async (path) => { /* host-side file read */ },
    writeFile: async (path, content) => { /* host-side file write */ },
  },
  importMap: {
    imports: {
      'lodash': 'https://esm.sh/lodash',
    },
  },
  onConsole: (level, ...args) => console.log(`[sandbox:${level}]`, ...args),
});

// Evaluate code in the sandbox
const result = await sandbox.evaluate(`
  const greeting = 'Hello from the sandbox!';
  console.log(greeting);

  // Call a host capability
  const content = await host.call('readFile', '/etc/hostname');
  return content;
`);

// Define a virtual module
await sandbox.defineModule('utils', `
  export function add(a, b) { return a + b; }
`);

// Import the virtual module from sandbox code
await sandbox.evaluate(`
  const { add } = await sandboxImport('utils');
  return add(2, 3); // 5
`);

// Clean up
await sandbox.dispose();
```

## Execution modes

andbox supports three execution modes:

- **`worker`** (default) -- Runs in a dedicated Worker with an RPC bridge, import maps, virtual modules, and hard-kill timeout semantics. See [Security model](#security-model) for what this does and doesn't protect against.
- **`inline`** -- Same-thread execution via AsyncFunction. Lighter weight, no Worker overhead, no isolation at all -- code runs with full access to the calling context. Only for code you already trust.
- **`data-uri`** -- Dynamic `import()` via Blob URL. Module-level separation without a Worker. Supports globals injection.

```js
// Inline mode (no Worker)
const inline = createSandbox({ mode: 'inline', globals: { math: Math } });
const result = await inline.execute('return math.sqrt(16)');

// Data-URI mode
const dataUri = createSandbox({ mode: 'data-uri', globals: { x: 42 } });
const result = await dataUri.execute('print(x)');
```


## Execution model

Code runs inside a Web Worker created from a Blob URL. This gets you, for free, against code that isn't specifically trying to defeat it:

- **No DOM access** -- Workers are inherently isolated from the document
- **No direct host object references** -- only what's explicitly passed in (capabilities, globals, import map entries) is reachable, so ordinary code can't accidentally touch host-side state
- **Hard kill** -- on timeout, the Worker is `terminate()`d and a fresh one is created for the next call
- **Virtual modules** -- modules defined via `defineModule()` are available via `sandboxImport()`
- **Capability rate limits** -- `gateCapabilities()` caps calls/concurrency/payload size per capability, for cooperative callers

## Security model

andbox is **not** a boundary against code that is actively trying to escape it. If you're running code you don't fully trust, every item below is a confirmed way sandboxed code can act outside what `capabilities`/`policy`/`createNetworkFetch` appear to allow:

- **Worker-global APIs are directly reachable, regardless of `capabilities`.** Sandboxed code executes in a real Worker global scope, so `fetch`, `WebSocket`, `Worker` (nested workers), `importScripts`, `indexedDB`, and `self.postMessage` are all callable directly — omitting a `fetch` capability does not block network access.
- **`gateCapabilities()`'s check can be bypassed via the prototype chain.** `host.call('constructor', ...)` resolves through `Object.prototype` to the real global `Object` constructor, bypassing the capability allowlist, rate limits, and call accounting entirely.
- **`createNetworkFetch()`'s allowlist is not redirect-safe.** It checks the request hostname before the fetch, not the final response URL — an allowlisted host that redirects (an open redirector, or a compromised endpoint) can steer the request anywhere.
- **`sandboxImport()` will load and execute an arbitrary remote URL.** Any `http(s)://` specifier is passed straight to `import()` with no allowlist, independent of any network policy configured for capabilities.
- **A timeout stops message delivery, not in-flight host-side effects.** If a capability call with a real side effect (a write, an API call) is in flight when the timeout fires, that side effect still completes on the host even though the Worker is killed.

If you need to run untrusted/adversarial code safely, andbox alone is not sufficient — pair it with OS-level isolation (a separate process/container with its own network and filesystem restrictions) or use a purpose-built sandboxing runtime. Capability gating and rate limits here are for organizing and throttling code you already trust, not for containing code you don't.

## Status

Small and stable: 16 tests, zero runtime dependencies, Node ≥ 24 (browser use
needs only standard Web Worker APIs). Runnable examples live in the repo's
[`examples/`](https://github.com/johnhenry/andbox/tree/main/examples)
directory — note they require a Worker-capable runtime, documented there.

## License

MIT

## Source

[github.com/johnhenry/andbox](https://github.com/johnhenry/andbox)
