---
title: "Mediated network"
description: "The network option: a global fetch inside the sandbox that sends every request to a function on the host, through the capability gate, behind a required allowedHosts policy (a host list, a function, or '*')."
sidebar:
  order: 3
---

Worker mode removes `fetch` from the sandbox. Code you hand a capability to can call `host.call(...)`, but a library
imported into the sandbox (`d3.json()`, `ky`, an API client) calls the **global** `fetch` and fails. The `network`
option (0.1.3, [andbox#39](https://github.com/johnhenry/andbox/issues/39)) installs a global `fetch` in the sandbox that
sends every request to a function on the host, which decides what happens.

**No network unless you list hosts.** Since 0.2.0 ([andbox#43](https://github.com/johnhenry/andbox/issues/43))
`network.allowedHosts` is required, so setting `network` never means "every host" by accident:

```js
import { createSandbox } from '@johnhenry/andbox';

const sandbox = await createSandbox({
  network: {
    allowedHosts: ['api.example.com'],            // required: checked on the host before fetch is called
    // Optional. Runs on the host for every allowed request. Same signature as fetch.
    async fetch(url, init) {
      console.log(init.method, url);              // you see every request
      return fetch(url, { ...init, referrerPolicy: 'no-referrer' }); // init.credentials is 'omit'
    },
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
| `allowedHosts` | `string[] \| (url: URL) => boolean \| Promise<boolean> \| '*'` | **required** | Which hosts the sandbox may reach, checked on the host before `fetch` is called ([forms below](#allowedhosts)). Leaving it out makes `createSandbox()` throw `network.allowedHosts is required`, synchronously, before any Worker or frame starts. |
| `fetch` | `(url, init) => Response \| { status, headers, body, ... }` | the platform's global `fetch` | Host function for every request `allowedHosts` lets through. |
| `credentials` | `'omit' \| 'same-origin' \| 'include'` | `'omit'` | What the host passes as `init.credentials`. The sandbox cannot change it. |

## `allowedHosts`

One of three forms:

```js
// 1. A list of hostnames: the sandbox reaches these and nothing else.
network: { allowedHosts: ['api.example.com', 'cdn.example.com'] }

// 2. A function, asked on the host for every request (and every redirect hop):
//    for an allowlist that changes while the sandbox runs, like a notebook
//    that asks the user per host. Only `true` (or a promise of it) allows.
const approved = new Set(['api.example.com']);
network: { allowedHosts: (url) => approved.has(url.hostname) }

// 3. The explicit opt-in to any http(s) host. Your fetch is then the whole
//    policy, so use it with a fetch that enforces its own rules.
network: { allowedHosts: '*', fetch: myPolicyFetch }
```

- **A list** matches the request URL's hostname exactly: case-insensitive, normalised the way `URL` does it (IDN to
  punycode, so `'bücher.example'` matches; IPv4 forms to dotted decimal), on any port and either scheme. There is no
  subdomain or wildcard matching: `'example.com'` does not allow `api.example.com`, and `'api.example.com'` does not
  allow `example.com`. Write IPv6 in brackets (`'[::1]'`). An entry that could never match throws instead of silently
  denying: one with a scheme (`'https://api.example.com'`), a port (`'api.example.com:8080'`), a path, a wildcard
  (`'*.example.com'`), a bare IPv6 address (`'::1'`), or `['*']` (write `'*'`). An empty list throws too; to give the
  sandbox no network, leave `network` out. A list is
  [`createNetworkFetch()`](/andbox/api/#createnetworkfetchallowedhosts-fetchfn) in front of your `fetch`.
- **A function** gets a fresh `URL` (changing it does not change the request) and may be `async`. Anything other than
  `true` refuses, with `Network access denied: <host> is not allowed by network.allowedHosts`. If it throws, the
  sandbox's `fetch` rejects with `TypeError('fetch failed: …')` carrying that error's message, which is a good place for
  "allow this host in settings".
- **`'*'`** skips the host check (the URL must still be http(s)) and leaves everything else, redirects included, to
  your `fetch`. Without a `fetch`, it is the platform's `fetch` for any host. `network: { fetch, allowedHosts: '*' }`
  behaves exactly like 0.1.3's `network: { fetch }`.

## Redirects

- **With a list,** every request is made with `redirect: 'manual'` and any redirect response is refused, so an
  allowlisted host cannot send the request elsewhere.
- **With a function,** andbox follows redirects itself, hop by hop. Each request is made with `redirect: 'manual'`, and
  for every `Location` it asks your function again before requesting it: at most 20 hops; 301/302 after a `POST`, and
  303, become a `GET` without a body, as the Fetch standard does; `Authorization` is dropped when a hop changes origin.
  The sandbox sees the final `url` and `redirected: true`; `redirect: 'error'` from the sandbox rejects on a redirect
  and `redirect: 'manual'` returns it unfollowed.
- **In a browser, a function policy can't follow redirects over the page's own `fetch`.** The browser hides a manual
  redirect's target (an `opaqueredirect` response), so andbox can't check the next hop and the request **fails** rather
  than following it blindly. On Node, Deno and Bun, or with a `network.fetch` that returns the 3xx response, redirects
  are followed and checked.
- **With `'*'`,** your `fetch` receives the sandbox's `redirect` mode and decides; the platform `fetch` follows
  redirects to any host.

## On a server, the host function has the server's network position

With `node-worker` (or any server-side host), whatever `allowedHosts` lets through is fetched from inside your network:
`localhost`, private addresses, and cloud metadata endpoints such as `169.254.169.254` are reachable if the policy
allows them. Prefer a list. With a function or `'*'`, refuse private and link-local addresses yourself, and remember
that DNS can point a public name at one.

## Inside the sandbox

`fetch(input, init)` resolves relative URLs against `baseURL`, refuses anything that is not `http:`/`https:` with a
`TypeError`, lets the platform normalise the method, headers and body (strings, typed arrays, `Blob`, `FormData`,
`URLSearchParams`, a `Request`), and sends only the URL, method, header pairs, body and `redirect` mode to the host.
`credentials`, `mode`, `cache`, `referrer` and the other `RequestInit` fields are dropped. It resolves with a real
`Response` (`status`, `statusText`, `headers`, `url`, `redirected`, `json()`/`text()`/`arrayBuffer()`/`body`). A host
error or a refused host rejects with `TypeError('fetch failed: ...')`, and `init.signal` rejects the call with
`AbortError`. Everything else on the worker-mode lockdown list (`XMLHttpRequest`, `WebSocket`, `EventSource`,
`WebTransport`, `importScripts`, ...) stays removed.

## On the host

The request becomes an ordinary capability named `fetch`, so it goes through the capability gate and `policy` like any
other: `policy.capabilities.fetch` limits it, `stats().gate.perCapability.fetch` counts it, and binary bodies travel as
base64, so `maxArgBytes` counts them.

The host side treats the request as untrusted input, because evaluated code can also call `host.call('fetch', url, init)`
directly. It checks the URL again (http(s) only), validates the method, header pairs, body and `redirect`, checks the
host against `allowedHosts`, and then calls your function as `fetch(url, init)` with:

- `init.headers` a `Headers`,
- `init.body` a string or `Uint8Array`,
- `init.credentials` set by the host (`network.credentials`),
- `init.signal` aborted when the sandbox is terminated.

Your function is called without a `this`, so `network: { allowedHosts, fetch }` with the platform's own `fetch` works.
Return a `Response`, or a plain `{ status, statusText, headers, body, url, redirected }` (`body` a string, `ArrayBuffer`,
typed array or `Blob`). `Set-Cookie` is never passed to the sandbox, and opaque or error responses (`status` outside
200-599) reject.

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

`network` narrows `fetch` to what `allowedHosts` and your host function allow. That is a policy point for well-behaved
code and the libraries it imports, not a wall:

- In worker mode, the platform `import()` operator can still fetch (and run) arbitrary URLs and carry data out in them,
  as can `sandboxImport()` unless `allowedImportHosts` restricts it.
- In iframe mode, the frame's own `XMLHttpRequest`, `WebSocket`, `<img>`, `<form>` and `import()` remain unless `csp`
  blocks them.
- Your function talks to the network on the sandbox's behalf, with the host's network position (see
  [above](#on-a-server-the-host-function-has-the-servers-network-position)). Do not forward the sandbox's headers to
  hosts that trust them blindly.

See the [Security model](/andbox/#security-model).

## Upgrading from 0.1.3

`network: { fetch }` on its own now throws `network.allowedHosts is required`; the message shows the three forms. Add
one:

- `allowedHosts: ['api.example.com']` if you know the hosts;
- `allowedHosts: (url) => myPolicy.allows(url)` if the list changes while the sandbox runs;
- `allowedHosts: '*'` if your `fetch` already enforces its own policy (it then stays the whole policy, exactly as in
  0.1.3).

`network: { allowedHosts: [...] }` keeps 0.1.3's matching and still refuses every redirect; the only change is that
entries that could never match (above) now throw instead of silently denying. Nothing changes if you don't use
`network`. See the [0.2.0 changelog](https://github.com/johnhenry/andbox/blob/main/CHANGELOG.md).

**The standalone `createNetworkFetch()` is not changed:** with a missing or empty list it still allows every host
([andbox#44](https://github.com/johnhenry/andbox/issues/44)). Only `network.allowedHosts` is strict.
