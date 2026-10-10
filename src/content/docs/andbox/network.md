---
title: "Mediated network"
description: "The network option (andbox 0.1.3): a global fetch inside the sandbox that sends every request to a function on the host, through the capability gate, with an optional host allowlist."
sidebar:
  order: 3
---

Worker mode removes `fetch` from the sandbox. Code you hand a capability to can call `host.call(...)`, but a library
imported into the sandbox (`d3.json()`, `ky`, an API client) calls the **global** `fetch` and fails. The `network`
option (0.1.3, [andbox#39](https://github.com/johnhenry/andbox/issues/39)) installs a global `fetch` in the sandbox that
sends every request to a function on the host, which decides what happens:

```js
import { createSandbox } from '@johnhenry/andbox';

const sandbox = await createSandbox({
  network: {
    // Runs on the host for every request the sandbox makes. Same signature as fetch.
    async fetch(url, init) {
      console.log(init.method, url);              // you see every request
      return fetch(url, { ...init, referrerPolicy: 'no-referrer' }); // init.credentials is 'omit'
    },
    // allowedHosts: ['api.example.com'],         // optional: an allowlist in front of it
  },
  policy: { capabilities: { fetch: { maxCalls: 100 } } }, // the usual gate applies
});

await sandbox.defineModule('lib', `export const getJSON = async (u) => (await fetch(u)).json();`);
await sandbox.evaluate(`
  const { getJSON } = await sandboxImport('lib'); // knows nothing about andbox
  return getJSON('https://api.example.com/items');
`);
```

Without the option nothing changes: worker modes still have no `fetch`.

## Options

| `network` field | Type | Default | Description |
|---|---|---|---|
| `fetch` | `(url, init) => Response \| { status, headers, body, ... }` | -- | Host function for every sandbox request. Required unless `allowedHosts` is given. |
| `allowedHosts` | `string[]` | -- | Put [`createNetworkFetch(allowedHosts, fetch)`](/andbox/api/#createnetworkfetchallowedhosts-fetchfn) in front: other hosts and any redirect are refused. Without `fetch` it wraps the host's own `fetch`. Must not be empty. |
| `credentials` | `'omit' \| 'same-origin' \| 'include'` | `'omit'` | What the host passes as `init.credentials`. The sandbox cannot change it. |

## Inside the sandbox

`fetch(input, init)` resolves relative URLs against `baseURL`, refuses anything that is not `http:`/`https:` with a
`TypeError`, lets the platform normalise the method, headers and body (strings, typed arrays, `Blob`, `FormData`,
`URLSearchParams`, a `Request`), and sends only the URL, method, header pairs, body and `redirect` mode to the host.
`credentials`, `mode`, `cache`, `referrer` and the other `RequestInit` fields are dropped. It resolves with a real
`Response` (`status`, `statusText`, `headers`, `url`, `redirected`, `json()`/`text()`/`arrayBuffer()`/`body`). A host
error rejects with `TypeError('fetch failed: ...')`, and `init.signal` rejects the call with `AbortError`. Everything else
on the worker-mode lockdown list (`XMLHttpRequest`, `WebSocket`, `EventSource`, `WebTransport`, `importScripts`, ...)
stays removed.

## On the host

The request becomes an ordinary capability named `fetch`, so it goes through the capability gate and `policy` like any
other: `policy.capabilities.fetch` limits it, `stats().gate.perCapability.fetch` counts it, and binary bodies travel as
base64, so `maxArgBytes` counts them.

The host side treats the request as untrusted input, because evaluated code can also call `host.call('fetch', url, init)`
directly. It checks the URL again (http(s) only), validates the method, header pairs, body and `redirect`, and then
calls your function as `fetch(url, init)` with:

- `init.headers` a `Headers`,
- `init.body` a string or `Uint8Array`,
- `init.credentials` set by the host (`network.credentials`),
- `init.signal` aborted when the sandbox is terminated.

Your function is called without a `this`, so `network: { fetch }` with the platform's own `fetch` works. Return a
`Response`, or a plain `{ status, statusText, headers, body, url, redirected }` (`body` a string, `ArrayBuffer`, typed
array or `Blob`). `Set-Cookie` is never passed to the sandbox, and opaque or error responses (`status` outside 200-599)
reject.

## Modes

- **`worker` and `node-worker`:** the shim is the only `fetch` the code can reach by name.
- **`iframe`:** it replaces the frame's own `fetch`, but the frame still has its other network APIs (`XMLHttpRequest`,
  `WebSocket`, `<img>`, `import()`). Add `csp: "connect-src 'none'"` (and `default-src` as needed) to leave the host
  function as the only way to fetch; the shim talks to the host over a `MessagePort`, which CSP does not affect. See
  [`mode: 'iframe'`](/andbox/iframe-mode/).
- **`wasm`, `inline`, `data-uri` and `service-worker`** throw if `network` is given. In `wasm`, expose a capability and
  use `host.call()`.
- Passing both `network` and a capability named `fetch` throws.

## Limits

- The response body is buffered on the host and copied into the sandbox: no streaming. Enforce size limits in your
  function, for example from `content-length` and `arrayBuffer().byteLength`.
- Aborting the sandbox-side `signal` rejects the call immediately but does not cancel the host request; terminating the
  sandbox does (`init.signal`).
- The rebuilt `Response` has `type: 'default'`.

## What it narrows, and what it doesn't

`network` narrows `fetch` to what your host function allows. That is a policy point for well-behaved code and the
libraries it imports, not a wall:

- In worker mode, the platform `import()` operator can still fetch (and run) arbitrary URLs and carry data out in them,
  as can `sandboxImport()` unless `allowedImportHosts` restricts it.
- In iframe mode, the frame's own `XMLHttpRequest`, `WebSocket`, `<img>`, `<form>` and `import()` remain unless `csp`
  blocks them.
- Your function talks to the network on the sandbox's behalf, with the host's network position: a server-side host can
  reach your internal network. Validate URLs there, or use `allowedHosts`, and do not forward the sandbox's headers to
  hosts that trust them blindly.

See the [Security model](/andbox/#security-model).
