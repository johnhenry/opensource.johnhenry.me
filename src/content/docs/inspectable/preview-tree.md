---
title: "The preview tree"
description: "The shape of an inspectable preview node, every type it can have, and how depth and size limits, cycles, getters, promises and hostile values show up in it."
sidebar:
  order: 1
---

```js
serialize({ a: [1, 2], f(x) {}, e: new TypeError("bad") }, { depth: 2 });
// {
//   type: "object", text: "{…}", name: "Object", size: 3,
//   entries: [
//     { key: "a", value: { type: "array", text: "[2]", size: 2, entries: [...] } },
//     { key: "f", value: { type: "function", text: "ƒ f(x)", kind: "function", source: "f(x) {}" } },
//     { key: "e", value: { type: "error", text: "TypeError: bad", source: "TypeError: bad\n    at …", entries: [...] } },
//   ]
// }
```

## Fields

Every node has `type` and `text`. Others appear when they apply:

| Field | Meaning |
| --- | --- |
| `type` | One of the types below. |
| `text` | A one-line display string (`[3]`, `Map(2)`, `'hi'`, `ƒ add(a, b)`). |
| `value` | Clone-safe primitives only: booleans, finite numbers, strings (possibly truncated). `NaN`, `-0` and `Infinity` are text-only because JSON can't hold them; so are `bigint` and `symbol`. |
| `name` | Constructor, class, function or error name. |
| `size` | `length` / `size` / `byteLength`. For strings, the full length before truncation. |
| `entries` | Children included inline, as `{ key, value }`. A `Map` key is itself a node; other keys are strings. |
| `more` | How many children (or, for a string, characters) the limits cut. |
| `handle` | Pass it to `expand()` to fetch the children later. |
| `source` | Function source, error stack, element markup; all truncated. |
| `kind` | For functions: `function`, `arrow`, `async`, `generator`, `class`. |

## Types

`undefined` `null` `boolean` `number` `bigint` `string` `symbol` `function` `array` `object` `map` `set` `date`
`regexp` `error` `promise` `typedarray` `arraybuffer` `dataview` `url` `module` `weak` `element` `getter` `circular`
`unreadable`.

## How things show up

**Depth and handles.** `depth` levels of children are included inline (default 1). An expandable value at the depth
limit gets a `handle` instead of `entries`; `inspector.expand(handle)` returns its children one level down, and their
own expandable children get new handles. The stateless `serialize()` strips every handle, so nothing past `depth` can be
fetched later.

**Limits.** `maxEntries` (default 100) caps children per level, with the rest counted in `more`. `maxString` (default
2000) truncates strings: `value` and `text` end in `…`, `size` is the original length, and `more` is the number of
characters cut (the ellipsis is not counted). `maxSource` (default 400) truncates function source and element markup;
error stacks get four times that.

**Functions** show `text` like `ƒ add(a, b)`, `async (x) => …` or `class Foo`, with `kind` and truncated `source`. A
function with own enumerable properties (static members, attached data) always gets a `handle`, at any depth, and
expanding it lists those properties.

**Errors** list `message`, `cause` (when set), `errors` (for an `AggregateError`) and any other own enumerable properties
as entries; the stack is in `source`.

**Promises** preview as `{ type: "promise", text: "Promise" }` with no state: serialization is synchronous and can't
observe it. Use [`promiseState()`](/inspectable/api/#promisestatepromise--wait--0-) first.

**Getters.** Own accessor properties appear as `{ type: "getter", text: "(…)" }` and are never invoked. Getters on a
prototype (a class's `get` members) don't appear at all, because only own properties are listed.

**Hidden properties.** Non-enumerable own properties are skipped (except on module namespaces). Enumerable symbol keys
are included, labelled `[Symbol(name)]`.

**Cycles.** A value that is its own ancestor on the path being serialized becomes `{ type: "circular", text: "[Circular]" }`.
The same object reached twice by different paths is not a cycle and is previewed twice. Each `expand()` call starts a
new path, so a reference back to an ancestor above the expanded node shows as an ordinary node (with a handle at the
depth limit), not as `circular`; it can't loop, because expansion stops at `depth`.

**Hostile values.** Anything that throws while being read (a revoked Proxy, a throwing trap, a property that throws on
access) becomes `{ type: "unreadable", text: "<threw …>" }` and the rest of the preview carries on.

**Arrays** show holes as `<empty>` and list non-index own properties after the elements. **Weak collections** are
opaque (`WeakMap {}`). **DOM nodes** become `element`, with a `#id.class` summary in `text` and truncated `outerHTML`
in `source`; they are only recognized where a global `Node` exists.

## Clone and JSON safety

The output contains only strings, finite numbers, booleans, arrays and plain objects, so it can go through
`structuredClone`, `JSON.stringify` and `postMessage` unchanged. That holds for `expand()` results too.
