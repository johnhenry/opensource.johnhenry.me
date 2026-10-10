---
title: "Security model"
description: "What inspectable guarantees when previewing values from code you don't trust (text-only rendering, plain-data previews, no own getters invoked, bounded output) and what is still yours (Proxy traps run, handles keep values alive)."
sidebar:
  order: 4
---

inspectable sits on a boundary: it reads values produced by code you may not trust and draws them on a page you do.

## What inspectable guarantees

- **Rendering never interprets text as markup.** Every label, key, string, function source and error stack is set with
  `textContent`; nothing is assigned through `innerHTML` or an equivalent sink, and no URL from a preview is ever
  loaded. A preview built from hostile data renders as inert text (covered by the "hostile strings render as text"
  test).
- **Previews are plain data.** The output contains only strings, finite numbers, booleans, arrays and plain objects, so
  it is safe to `structuredClone`, `JSON.stringify` and `postMessage`.
- **Own getters are not invoked.** Accessor properties are reported as `getter` without calling them (example 02).
- **A throwing value can't sink the preview.** Any exception while reading a value (a revoked Proxy, a throwing trap)
  becomes an `unreadable` node.
- **Output is bounded** by `depth`, `maxEntries`, `maxString` and `maxSource`.

## What is still yours

- **Serializing runs the value's realm's own code in a few places.** Proxy traps (`ownKeys`,
  `getOwnPropertyDescriptor`, `getPrototypeOf`) run when a Proxy is previewed, a prototype's `constructor` getter (if
  someone defined one) runs when the class name is read, and `Function.prototype.toString` runs on functions. Serialize
  inside the realm that already runs the untrusted code (the Worker or iframe), never by pulling the value into your
  page first.
- **Handles keep values alive** until `release()`. A long-lived inspector that never releases is a memory leak by
  design; scope handles per cell or per result.
- **`text` is a description, not a parser-grade representation.** Don't `eval` or re-parse it.

## What that means in practice

- **The boundary is the realm, not inspectable.** inspectable doesn't sandbox anything. Put the untrusted code and the
  serializer in a Worker or a sandboxed iframe (for example with [andbox](/andbox/)), and let only previews cross. The
  page renders them with [`<value-inspector>`](/inspectable/value-inspector/), which can't be made to run anything.
- **Bounded output is not bounded time.** The limits cap what is returned, not how long a hostile Proxy trap takes to
  run. A trap that loops forever hangs the realm doing the serializing, which is one more reason that realm should be one
  you can terminate.
- **A preview can still lie.** It shows what the value reported about itself: a Proxy can present any keys it likes, and
  `name` comes from the value's own constructor. Treat what it says as untrusted text, which is exactly how it is
  rendered.
