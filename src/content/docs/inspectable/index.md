---
title: "inspectable"
description: "Preview any JavaScript value (functions, cycles, Maps, errors, proxies) as a small structured-clone-safe tree, so a value living in a Worker or iframe can be shown elsewhere; plus a <value-inspector> element with lazy expansion."
sidebar:
  order: 0
---

:::caution[Not yet on npm]
`@johnhenry/inspectable` is a new package (0.0.0) and has not been published. Until it is, work from a clone of the
[repository](https://github.com/johnhenry/inspectable). The install command below is what installation will look like
once it is published.
:::

**`@johnhenry/inspectable`** shows a JavaScript value that lives somewhere else.

A REPL, a notebook cell or an agent's tool result often produces a value inside a Web Worker, a sandboxed iframe or
another process, and the page that wants to *show* it can't receive it: functions, class instances, cycles, proxies and
DOM nodes don't survive `postMessage`. inspectable turns any value into a small preview tree that does survive it
(structured-clone safe and JSON safe), keeps the value where it is, and lets the viewer fetch deeper levels lazily by
handle. A `<value-inspector>` element renders the tree.

Zero dependencies. ESM. The serializer touches no DOM, so it runs in Workers, iframes and Node (26 or newer,
`engines`).

## Traps

- **Serialize in the realm that owns the value, never on your page.** Previewing a Proxy runs its `ownKeys`,
  `getOwnPropertyDescriptor` and `getPrototypeOf` traps, reading a class name can run a `constructor` getter someone
  defined on a prototype, and functions go through `Function.prototype.toString`. That code belongs to whoever made the
  value. Run `serialize()` inside the Worker or iframe that already runs it.
- **Handles keep values alive** until `release()`. A long-lived inspector that never releases is a memory leak by
  design. Scope handles per cell or per result, and release the scope when the cell reruns.
- **`release(scope)` only drops handles created with that scope.** Handles from a `serialize()` call without `scope`
  are freed only by `release()` with no argument.
- **A promise's preview has no state.** The serializer is synchronous and can't read it. Await
  [`promiseState()`](/inspectable/api/#promisestatepromise--wait--0-) first, then serialize what it returns.
- **`text` is a description, not a parser-grade representation.** Don't `eval` or re-parse it.
- **Only own, enumerable properties appear.** Getters defined on a class prototype, and non-enumerable own properties,
  are not in the preview; own accessors show as `getter` without being called.

The [Security model](/inspectable/security/) has the full split between what inspectable guarantees and what is still
yours.

## Install

```sh
npm install @johnhenry/inspectable
```

**Provenance:** a new package, never published under another name. Under npm's caret rules `^0.0.0` matches only
`0.0.0`, so pin exactly until a deliberate `0.1.0`.

## Quick start

In the realm that owns the value (a Worker here):

```js
import { createInspector } from "@johnhenry/inspectable";

const inspector = createInspector({ depth: 1 });
const value = { greet: (name) => `hi ${name}`, nested: { deep: { answer: 42 } } };
value.self = value;

postMessage({ preview: inspector.serialize(value, { scope: "cell-1" }) });
onmessage = ({ data }) => {
  if (data.expand) postMessage({ children: inspector.expand(data.expand) });
  if (data.release) inspector.release("cell-1"); // the cell reran: let the old value go
};
```

On the page:

```js
import "@johnhenry/inspectable/global"; // registers <value-inspector>

const view = document.querySelector("value-inspector");
view.expand = (handle) => askWorker({ expand: handle }); // resolves to { entries, more }
view.value = preview; // from the worker
```

`askWorker` is yours: anything that posts the handle to the Worker and resolves with its reply. `serialize(value,
options)` is the stateless shortcut when nothing needs to be expanded later.

## Entry points

| Import | What it is |
| --- | --- |
| `@johnhenry/inspectable` | The serializer, no DOM: `createInspector`, `serialize`, `toTable`, `promiseState`. |
| `@johnhenry/inspectable/serialize` | The same serializer as a single file with no imports, for shipping into a Worker or sandbox as source text. |
| `@johnhenry/inspectable/element` | DOM rendering: `renderPreview`, `renderTable`, `isExpandable`, `ValueInspector`, `defineValueInspector`. Safe to import without a DOM; nothing is defined until you call `defineValueInspector()`. |
| `@johnhenry/inspectable/global` | Registers `<value-inspector>` as a side effect. Throws where there is no `customElements` registry (Node, a Worker). |

## The pages here

- [The preview tree](/inspectable/preview-tree/): the node shape, every type, and how limits, cycles and hostile values
  show up.
- [API](/inspectable/api/): `createInspector`, `serialize`, `expand`, `release`, `toTable`, `promiseState`, and the
  rendering functions.
- [`<value-inspector>`](/inspectable/value-inspector/): the element, its properties, attributes and theming.
- [Security model](/inspectable/security/): what is guaranteed and what is still yours.

## Examples

The repository's [`examples/`](https://github.com/johnhenry/inspectable/tree/main/examples) are runnable and assert what
they show (`npm run examples`, plain Node 26):

| Example | Demonstrates |
| --- | --- |
| `01-a-value-stays-in-its-worker-while-its-preview-crosses.mjs` | A value holding a function and a cycle stays in a real worker thread; only its structured-clone preview crosses, and a deeper level is fetched later by `handle` through `expand()`. |
| `02-hostile-values-cannot-break-a-preview.mjs` | `serialize()` never invokes getters, reports a revoked Proxy as `unreadable`, cuts cycles, caps a 100,000-item array at `maxEntries` with a `more` count, and always returns JSON-safe output. |
| `03-arrays-of-records-become-tables.mjs` | `toTable()` unions record keys into columns, fills gaps with `null`, and returns `undefined` for values that aren't table-shaped. |

Example 01 uses `node:worker_threads` as a stand-in for a browser Web Worker; the serializer is the same code in both.
The element needs a DOM, so it is covered by the repository's happy-dom tests rather than an example.

## Family

inspectable is the "show" step for values that live in someone else's realm. None of these is a dependency.

- **[andbox](/andbox/)**: where values live. Load `@johnhenry/inspectable/serialize` into the sandbox (andbox's
  [`defineModule`](/andbox/api/#sandboxdefinemodulename-source) or a remote `sandboxImport`), return
  `inspector.serialize(result)` from `sandbox.evaluate()`, and expose `expand` as another `evaluate` call; the value never
  leaves the Worker or iframe.
- **[dataflow](/dataflow/)**: a preview is a natural `run()` result. `state.result` of a notebook cell can be the preview
  the page renders with `<value-inspector>`, while the value itself stays in the sandbox.
- **[data-plot](/data-plot/)**: `toTable()` produces the columns and rows that a `<data-plot>`
  [`<table>` data source](/data-plot/data/#tables) is built from; `renderTable()` turns them into that table.
- **[patchbay](/patchbay/)**: the canvas a notebook's previews sit on. Put a scrollable inspector inside an element with
  `data-patchbay-ignore` so the wheel scrolls it instead of panning the canvas.

Built for miso, a natto.dev-style spatial notebook, where cell values live in an andbox Worker.

Source: [github.com/johnhenry/inspectable](https://github.com/johnhenry/inspectable).
