---
title: "mode: 'iframe'"
description: "Run sandboxed code in an opaque-origin <iframe sandbox=\"allow-scripts\"> with its own window and document, so it can render DOM, with the same evaluate/host.call API as worker mode. Browser only."
sidebar:
  order: 2
---

`mode: 'iframe'` (0.1.2) runs evaluated code in a sandboxed `<iframe>` instead of a Worker, for code that needs a real
DOM: a notebook pane that draws a chart, plays a canvas animation, or renders HTML. It is the cross-origin-iframe option
[andbox#10](https://github.com/johnhenry/andbox/issues/10) named next to [`mode: 'wasm'`](/andbox/wasm-mode/). The frame
is created from `srcdoc` with `sandbox="allow-scripts"` and **no** `allow-same-origin`, so the browser gives it an
opaque origin: it cannot read your page, your cookies or your storage. Browser only.

```js
import { createSandbox } from '@johnhenry/andbox';

const pane = await createSandbox({
  mode: 'iframe',
  container: document.querySelector('#pane'),    // where the frame goes (default: offscreen in <body>)
  html: '<style>body { margin: 0 }</style>',      // initial body markup
  capabilities: { data: () => [3, 7, 4, 9] },
  onConsole: (level, ...args) => console.log(`[pane:${level}]`, ...args),
  onFrame: (iframe) => { iframe.className = 'pane-frame'; }, // every new frame, before it is attached
});

await pane.evaluate(`
  const canvas = document.createElement('canvas');   // the frame's own document
  document.body.append(canvas);
  const values = await host.call('data');
  // ... draw, animate ...
  return values.length;
`);

pane.iframe.style.height = '300px'; // the live element; size it like any other
```

## Same contract as worker mode

`evaluate(code, opts)` wraps the code in an async IIFE and resolves with what it `return`s, by structured clone (`Map`,
`Date`, typed arrays survive; a DOM node rejects with `DataCloneError`). `host.call(name, ...args)` goes through the same
capability gate and `policy`, and capabilities get the same `this.signal`. `sandboxImport()` resolves virtual modules
(`defineModule()`), the `importMap`, and remote URLs under the same `allowedImportHosts` rules. `console.*` is forwarded
to `onConsole` (sandbox-level or per call). `timeoutMs`/`defaultTimeoutMs` and an `AbortSignal` hard-kill the frame (it
is removed and a fresh one created) and reject with the same `TimeoutError` / `AbortError` as worker mode. `stats()`,
`dispose()` and `isDisposed()` are unchanged.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `container` | `Element` | offscreen in `document.body` | Element the frame is appended to. A restarted frame takes its predecessor's place instead. |
| `html` | `string` | `''` | Initial `<body>` markup of every new frame. |
| `csp` | `string` | -- | Content-Security-Policy for the frame (`<meta http-equiv>`); must allow `'unsafe-eval'` if it restricts scripts. |
| `iframeSandbox` | `string[]` | `[]` | Extra sandbox tokens (`allow-scripts` is always set); `'allow-same-origin'` throws unless `dangerouslyAllowSameOrigin`. |
| `dangerouslyAllowSameOrigin` | `boolean` | `false` | Permit `'allow-same-origin'`, which removes the origin boundary. |
| `onFrame` | `(iframe) => void` | -- | Called with every new frame (the first and after each restart) before it is attached. |

The returned sandbox adds `iframe`: the live `HTMLIFrameElement`, replaced after a restart and `null` after
`dispose()`.

## Differences from worker mode

- **The code has a full browser window.** `window`, `document`, `fetch`, timers and `requestAnimationFrame` are the
  frame's own; nothing is deleted or shadowed (the worker-mode lockdown does not apply, the origin boundary does).
  `document.body.append(...)` renders where you mounted the frame. With [`network`](/andbox/network/), `fetch` is
  replaced by the host-backed one.
- **`sandbox.iframe` is the live element, and it changes.** A timeout, an abort, or the frame navigating or reloading
  itself replaces it with a new element in the same place, with the same attributes (`class`, `style`, `width`, ...);
  everything the old document held is gone. Use `onFrame(iframe)` for setup you need on every frame.
- **Do not move the element in the DOM.** Re-parenting an iframe reloads its document. andbox notices (the pending call
  rejects with `Sandbox iframe unloaded ...`) and the next call gets a fresh frame, but state is lost. Pass `container`
  (or place the frame in `onFrame`) instead.
- **Remote modules are cross-origin requests.** The frame's origin is `null`, so a module URL must be served with
  `Access-Control-Allow-Origin` (CDNs such as esm.sh do). A relative `sandboxImport('./x.js')` resolves against
  `baseURL` (default: your page URL) and needs the same header.
- **`csp`** is injected as `<meta http-equiv="Content-Security-Policy">` after andbox's bootstrap script. `evaluate()`
  compiles code with `new Function`, so a policy that restricts scripts must allow `'unsafe-eval'`, plus `blob:` for
  `defineModule()` modules and the hosts you import from. For example,
  `"default-src 'none'; script-src 'unsafe-eval' blob: https://esm.sh; img-src data:"` leaves the frame no network
  except module imports from esm.sh.
- **`iframeSandbox: ['allow-forms', 'allow-popups', ...]`** adds sandbox tokens. `'allow-same-origin'` is refused:
  combined with `allow-scripts` it puts the frame in your origin, where it can reach your page and storage and delete its
  own `sandbox` attribute. `dangerouslyAllowSameOrigin: true` permits it for code you trust completely.
- **Browser only.** Without a DOM (Node, a Worker) `createSandbox({ mode: 'iframe' })` rejects. `workerFactory`,
  `nodeWorker` and the wasm limits do not apply; `untrusted: true` still means `mode: 'wasm'`.
- **Startup is bounded** by `defaultTimeoutMs`: a frame that never completes its handshake (for example a `container`
  that is not in a document) rejects `createSandbox()` and is removed.

## Synchronous infinite loops

An `await`-based hang (a promise that never settles, a long `setInterval`) is always killed on time. A synchronous
`while (true) {}` can only be killed when the browser runs the frame on another thread:

- **Desktop Chrome** (site isolation on, the default) runs a sandboxed frame in its own renderer process. The timeout
  fires on time, the frame is removed, and the next call gets a new frame in milliseconds, **provided no other sandboxed
  frame from your site shares that process**. Chrome groups them by site, so while another andbox iframe (or any other
  opaque-origin frame from your site) is alive, the looping process cannot be shut down: the replacement frame lands in
  it and its startup times out, and those other frames stop responding too.
- **WebKit (Safari's engine) and Chromium without full site isolation** run the frame on the host page's main thread. A
  synchronous infinite loop freezes your page, the timeout cannot fire, and the browser's own "page unresponsive"
  handling is the only way out. Chrome on Android, which does not isolate every site, is expected to behave the same;
  Firefox was not measured for 0.1.2.

Use `mode: 'wasm'` (fuel and deadline inside the engine) or `worker` mode for code that may spin, and `iframe` mode for
code that needs the DOM. The repo's
[`examples/09-iframe-browser/`](https://github.com/johnhenry/andbox/tree/main/examples/09-iframe-browser) is a working
two-pane notebook demo.

## What the origin boundary does and does not cover

The browser enforces it: the frame's code gets `SecurityError` for `parent.document`, `top.location`,
`parent.localStorage` and its own `localStorage`, has no access to your cookies, and shares no objects with your page.
Everything crossing the boundary is structured-cloned over a `MessagePort`, handed over only after a handshake bound to
that frame's own `contentWindow` and a per-frame random token. The contract runs in Chromium, Firefox and WebKit.

Still yours:

- **Network.** The frame has `fetch`, `WebSocket`, `import()`, `<img>`, `<form>` and so on, as a `null`-origin client: it
  can exfiltrate anything it was given or computed. Pass a `csp` (`default-src 'none'` plus what the code needs) to
  restrict it.
- **CPU and memory.** See [Synchronous infinite loops](#synchronous-infinite-loops). There is no memory cap.
- **Same process in some browsers.** Where the frame is not site-isolated it shares a process with your page: the origin
  boundary still holds for JavaScript, but a browser memory-safety bug or a Spectre-style read is not stopped by a
  process boundary.
- **What you enable.** Every `iframeSandbox` token is a capability: `allow-popups` lets it open windows, `allow-forms`
  submit forms, `allow-top-navigation` navigate your page, `allow-modals` show dialogs.
- **The UI it draws.** It controls those pixels and can draw a convincing fake login form. Keep frames visibly framed as
  untrusted content.
- **What you grant and what you accept.** Capabilities are as reachable as in any other mode, and results are values
  from untrusted code.

See the [Security model](/andbox/#security-model) for every mode.
