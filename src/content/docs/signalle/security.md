---
title: "Security model"
description: "generateWorkerCode() does not parse, sandbox, or validate its input in any way — it is plain string interpolation into a JS source string, equivalent to eval() with a Worker/Blob indirection on top."
---

`generateWorkerCode(signalCode, name?)` (in `@johnhenry/signalle/broadcast`) does not
parse, sandbox, or validate `signalCode` in any way. It is plain string
interpolation into a JS source string:

```js
export function generateWorkerCode(signalCode, name = "createBroadcastSignal") {
  return `
    ${BroadcastSignal.toString()}
    const ${name} = ${createBroadcastSignal.toString()};
    ${signalCode}
    `;
}
```

Whatever `signalCode` contains becomes the literal body of the generated
script, which the [API page](/signalle/api/#generateworkercodesignalcode-name)'s
own usage example then runs by wrapping it in a `Blob` and handing it to
`new Worker(URL.createObjectURL(blob))`. There is no intermediate
evaluation step and no capability restriction — this is equivalent to
`eval()`, just with an extra Worker/Blob indirection on top.

## What that Worker gets you, same as any Worker

- **No DOM access** — Workers are inherently isolated from the document.
- Nothing else. Unlike a sandbox, nothing here restricts what the
  generated code can call once it's running: `fetch`, `WebSocket`,
  `importScripts`, `indexedDB`, nested `Worker`s, and `postMessage` back to
  the page that created it are all directly reachable from inside
  `signalCode`, because `generateWorkerCode()` performs zero capability
  gating — it only concatenates strings.

## What this means in practice

- **Never pass untrusted or user-supplied input into
  `generateWorkerCode()`,** whether as the whole `signalCode` argument or
  interpolated into it (e.g. building the string from a URL parameter, a
  database value, or anything else an attacker could influence). Doing so
  is arbitrary code execution in that Worker's context, with network and
  storage access, and a live channel back to the page via `postMessage`.
- `name` is interpolated the same way (`const ${name} = ...`) — treat it
  as a fixed identifier you choose in code, not as a value derived from
  external input.
- `generateWorkerCode()` is meant for splicing together
  developer-authored strings/templates at build- or call-time (the
  documented use case: shipping a bundler-free worker script), not for
  running code whose content you don't already control.

If you need to run code you don't fully trust, this function is the wrong
tool — reach for a real sandboxing layer (e.g.
[`@johnhenry/andbox`](https://github.com/johnhenry/andbox), which
documents its own, narrower set of guarantees and gaps) instead of
`generateWorkerCode()`.
