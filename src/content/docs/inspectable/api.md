---
title: "API"
description: "createInspector, serialize, expand, release, toTable and promiseState from @johnhenry/inspectable; the single-file /serialize entry; renderPreview, renderTable and defineValueInspector from /element."
sidebar:
  order: 2
---

## `@johnhenry/inspectable` (no DOM)

| Export | Does |
| --- | --- |
| `createInspector({ depth = 1, maxEntries = 100, maxString = 2000, maxSource = 400 })` | An inspector with a handle registry. |
| `inspector.serialize(value, { depth, maxEntries, maxString, maxSource, scope })` | Preview with `depth` levels inline; deeper expandable values get a `handle` prefixed by `scope`. |
| `inspector.expand(handle, options)` | `{ entries, more }` one level down, or `undefined` once released. |
| `inspector.release(scope?)` | Drop every handle (or one scope's) so the values can be garbage collected. `inspector.size` counts live handles. |
| `serialize(value, options)` | Stateless preview; no handles in the output. |
| `toTable(value, { maxRows = 1000, maxColumns = 50 })` | `{ columns, index, rows, total }` for an array of objects, an array of arrays, or an object of objects; `undefined` otherwise. Cells are JSON primitives. |
| `promiseState(promise, { wait = 0 })` | `{ state: "fulfilled", value }`, `{ state: "rejected", reason }` or `{ state: "pending" }` after one macrotask turn. |

### `createInspector(defaults)`

The defaults apply to every `serialize` and `expand` call on this inspector unless a call overrides them. The inspector
holds a `Map` from handle to value: **every handle it hands out keeps its value reachable** until it is released.

### `inspector.serialize(value, options)`

`scope` is a string prefix for the handles this call creates (`"cell-1:"` followed by a counter). Without `scope`, handles
are prefixed `h:` and belong to no scope.

### `inspector.expand(handle, options)`

Returns `{ entries, more? }` for one level below the handle's value; pass `depth` for more levels. Children that are
themselves expandable get new handles in the same scope. Returns `undefined` for a handle that is unknown or was
released, which is what you'll get after a cell reran and released its scope while a viewer still had the old preview
open. Options are `depth`, `maxEntries`, `maxString` and `maxSource` (not `scope`).

### `inspector.release(scope?)`

- `release("cell-1")` drops the handles created with `scope: "cell-1"`.
- `release()` drops every handle, scoped or not. It is the only way to drop handles created without a scope.

`inspector.size` is the number of live handles, useful in a leak check.

### `serialize(value, options)`

A one-shot inspector: serializes, releases, and strips every `handle` from the output. Options as for
`inspector.serialize` without `scope`. Use it when the preview is all you'll ever show.

### `toTable(value, { maxRows, maxColumns })`

Returns `{ columns, index, rows, total }` or `undefined`.

- An **array of objects** gets the union of their keys as `columns`, in first-seen order; a record missing a key gets
  `null` in that cell.
- An **array of arrays** gets columns `"0"`, `"1"`, ... up to the widest row.
- An **object of objects** gets its keys as `index` (row labels); otherwise `index` is `null`.
- Cells are JSON primitives: `undefined` becomes `null`, a non-finite number its string (`"NaN"`), and any object the
  one-line `text` of its preview (`"{…}"`).
- `total` is the full row count; `rows` stops at `maxRows`, `columns` at `maxColumns`.
- Anything else (an empty array, a primitive, an array with a `null` or primitive row) returns `undefined`.

### `promiseState(promise, { wait = 0 })`

Races the promise against a `setTimeout(wait)`. It returns the settled `value` or `reason` itself, not a preview: if you
are about to send it across a realm boundary, serialize it first.

## `@johnhenry/inspectable/serialize`

The same serializer as a single file with no imports, for shipping into a Worker or sandbox as source text: for example
`sandbox.defineModule("inspectable", source)` in [andbox](/andbox/api/#sandboxdefinemodulename-source), or `?raw` in a
bundler. It exports what the root entry exports.

## `@johnhenry/inspectable/element` (DOM)

| Export | Does |
| --- | --- |
| `renderPreview(preview, { expand, document, open, rawStrings, label })` | Builds DOM for a preview node: a `<details>`/`<summary>` tree for expandable nodes, a `<span>` for leaves. `expand(handle)` is called the first time a collapsed node with a handle is opened. `open` opens the root; `rawStrings` shows a root string as plain wrapped text; `label` is a node placed before the value. |
| `renderTable(table, { document, caption })` | A `<table>` (with `<caption>`, a header row, and row headers when `index` is set) from a `toTable()` result. |
| `isExpandable(preview)` | True when a node has, or can fetch, children. |
| `ValueInspector` | The element class. |
| `defineValueInspector(tag = "value-inspector", registry)` | Registers the element under `tag` (a subclass for any other tag name). Safe to call twice. `registry` defaults to `globalThis.customElements`; it throws when there is none. |

Everything is built with `createElement` and `textContent`: no string from a preview is ever parsed as HTML. Importing
`/element` without a DOM is safe; calling these functions needs one (pass `document` for a document other than the
global one).

`@johnhenry/inspectable/global` calls `defineValueInspector()` on import.

TypeScript declarations ship for every entry point (`src/index.d.ts`, `src/element.d.ts`, `src/global.d.ts`).
