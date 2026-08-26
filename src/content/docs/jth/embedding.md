---
title: "Embedding"
description: "Using jth from JavaScript hosts: jth-eval for evaluation with sandboxing, jth-runtime for driving the stack machine directly, jth-html for the HTML DSL."
---

Three layers, from highest to lowest:

| You want to… | Use |
|---|---|
| Evaluate jth source strings, maybe untrusted ones | `@johnhenry/jth-eval` |
| Keep a persistent stack across evaluations | `JthContext` (also jth-eval) |
| Drive the stack machine from JS with no jth syntax | `@johnhenry/jth-runtime` + `@johnhenry/jth-stdlib` |
| Compile jth source to JS text yourself | `@johnhenry/jth-compiler` |
| Generate HTML on the stack | `@johnhenry/jth-html` |

## jth-eval: one-shot evaluation

```ts
import { evalJth } from "@johnhenry/jth-eval";

const { value } = await evalJth("1 2 +;");                        // 3
const r = await evalJth("x y +;", { values: { x: 10, y: 20 } });  // 30
```

`evalJth(code, options?)` returns `{ value, stack, output }` — top of stack,
the full stack array, and captured `console.log` output (from `peek` etc.).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `values` | `Record<string, unknown>` | `{}` | Injected as zero-arity operators |
| `operators` | `Record<string, StackOperator>` | `{}` | Custom operators — build with `op(arity)(fn)` from jth-runtime |
| `stack` | `unknown[]` | `[]` | Pre-load the stack |
| `timeout` | `number` | `5000` | Max execution time in ms (rejects on expiry) |
| `sandbox` | `boolean \| "restricted" \| string[]` | `false` | See below |
| `captureOutput` | `boolean` | `true` | Capture `console.log` into `result.output` |

Importing `@johnhenry/jth-eval` loads `@johnhenry/jth-stdlib` — the standard
library gets registered in the global registry as a side effect.

## Sandboxing

Four modes, from open to closed:

| `sandbox` value | Meaning |
|-------|---------|
| `false` | Everything: all registered operators, inline JS allowed |
| `"restricted"` | All statically registered pure ops; side-effecting ops blocked (in the default stdlib: `peek`/`peek-all`) |
| `string[]` | Explicit allowlist of operator names |
| `true` | Bare mode: only your injected `values`/`operators` resolve |

Blocked operators throw `JthRuntimeError` with `code: "OP_NOT_ALLOWED"`;
unknown names throw `code: "UNKNOWN_OPERATOR"`.

Two rules that surprise people:

- **Inline JS (`((...))`) is rejected at compile time in every sandbox mode**
  — it would trivially escape any operator allowlist, so the whole program is
  rejected before a single statement runs.
- **Dynamic pattern operators (`3+`, `2log`, `***`) are denied in restricted
  mode** — an open-ended name family can't be enumerated into an allowlist.

Don't mistake the sandbox for OS-level isolation: it restricts which
*operators* a program may call. Evaluation still runs in-process with host JS
semantics — no memory limits, and the timeout (a `Promise.race`) can only cut
off a hot synchronous loop at statement boundaries.

## jth-eval: persistent contexts

`JthContext` keeps a stack and a scoped registry alive across `eval()` calls:

```ts
import { JthContext } from "@johnhenry/jth-eval";

const ctx = new JthContext({ timeout: 2000 });
await ctx.eval("1 2 +;");
await ctx.eval("10 *;");
ctx.pop();                                 // 30
ctx.define("pi", 3.14159);                 // named value
ctx.defineOp("add", 2, (a, b) => a + b);   // custom operator
ctx.dispose();                             // further use throws CONTEXT_DISPOSED
```

Also on the context: `push(...)`, `peek()`, `clear()`, `toArray()`, `length`.
Definitions made inside evaluated code (`:name`) go into the context's
`ScopedRegistry` overlay — writes stay local, reads fall back to the global
registry — so contexts don't pollute each other.

## jth-runtime: the machine itself

No jth syntax at this layer. You feed `processN` an array of items:
non-functions are pushed, functions execute against the stack. `op(arity)(fn)`
builds fixed-arity operators; `variadic(fn)` builds whole-stack ones.

```ts
import { Stack, processN, op, registry } from "@johnhenry/jth-runtime";
import "@johnhenry/jth-stdlib"; // registers the ~110 standard ops globally

const stack = new Stack();
await processN(stack, [2, 3, registry.resolve("+")]);
stack.peek(); // 5

registry.set("shout", op(1)((s) => [String(s).toUpperCase() + "!"]));
```

`processN` automatically goes async when any operator returns a Promise, and
respects the metadata annotations (`delay`, `persist`, `rewind`, `skip`,
`limit`) from `annotate()`. The `registry` here is the same global registry
compiled jth programs resolve against — anything you `set` becomes callable
from jth source run in the same process.

## jth-html: registered ops plus a JS API

From a `.jth` program, the HTML ops are opt-in via import directive (the
compiler preamble only auto-loads the stdlib):

```jth
::import "@johnhenry/jth-html";
#[ "Hello" h-text ] "h1" h-tag h-render peek;   // <h1>Hello</h1>
```

From JavaScript, `import "@johnhenry/jth-html"` registers the ops as a side
effect (or call `registerHTML()` explicitly), and the package also exports a
direct node-building API — `render`, `createElement`, `createText`,
`createRaw`, `createFragment`, `escapeHtml` — if you want the HTML tree
machinery without the stack. Text and attribute values are HTML-escaped on
render; `h-raw` output is not.

## jth-repl: an embeddable evaluator

Beyond `startRepl()` (the terminal UI), the REPL package exports a minimal
persistent evaluator with less machinery than `JthContext` — no timeouts or
sandboxing, just a stack that survives across calls:

```js
import { createEvaluator } from "@johnhenry/jth-repl/evaluator";

const ev = createEvaluator();
await ev.evaluate("10 20 +;");
ev.peek(); // 30
```

If you need timeouts, sandboxing, or injected operators, use
`@johnhenry/jth-eval` instead.
