---
title: "Stdlib"
description: "@johnhenry/jth-stdlib — the ~110 standard operators as a package: how it loads, what it registers, and the category map."
---

**`@johnhenry/jth-stdlib`** is the standard library of the jth language — the
~110 operators covered operator-by-operator in the
[operator reference](/jth/operators/). This page is about the *package*: how
it loads, what it does to the registry, and when you need to touch it at all.

```sh
npm install @johnhenry/jth-stdlib
```

## You usually don't import this yourself

Compiled jth programs import the stdlib automatically — the compiler preamble
emits the import, so `jth run` and `jth compile` output already have every
standard operator available. `@johnhenry/jth-eval` also loads it for you.

You import it explicitly in exactly one situation: driving
`@johnhenry/jth-runtime` directly from JavaScript.

## Importing registers globally — a side effect, on purpose

```js
import "@johnhenry/jth-stdlib";   // that's the whole API

import { Stack, processN, registry } from "@johnhenry/jth-runtime";
const stack = new Stack();
await processN(stack, [10, 3, registry.resolve("-")]);
stack.peek(); // 7
```

The import's side effect is the point: every operator lands in the **global**
registry from `@johnhenry/jth-runtime`. Consequences worth knowing:

- Importing it twice is harmless; not importing it means `registry.resolve`
  throws `UNKNOWN_OPERATOR` for even `+`.
- Everything in the process shares one registry. If you need per-evaluation
  vocabularies or allowlists, that's jth-eval's `ScopedRegistry` and sandbox
  modes — see [Embedding](/jth/embedding/#sandboxing).
- The registry distinguishes static names from *dynamic patterns*. The stdlib
  registers both: named operators like `map`, and pattern factories that make
  `3+`, `10log`, `***` work without pre-registering every numeral.

## Category map

Full tables with examples live in the [operator reference](/jth/operators/);
this is the shape of the library:

| Category | Examples |
|------------------|----------------------------------------------------|
| Arithmetic | `+`, `-`, `*`, `/`, `%`, `**`, `++`, `--`, `abs`, `sqrt` |
| Variadic math | `Σ`, `Π`, `min`, `max` |
| Stack | `swap`, `dupe`, `drop`, `over`, `rot`, `peek`, `clear`, `collect` |
| Comparison | `=`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `<=>` (aliases `eq?`, `lt?`, …) |
| Logic | `&&`, `\|\|`, `~~`/`not`, `xor`, `nand`, `nor` |
| Control flow | `if`, `elseif`, `else`, `times`, `while`, `until`, `break`, `when` |
| Error handling | `try`, `throw`, `error?` |
| String | `strcat`, `strseq`, `upper`, `lower`, `trim`, `len`, `starts?`, `ends?` |
| Type | `typeof`, `number?`, `string?`, `array?`, `nil?`, `empty?`, `contains?` |
| Array | `push`, `pop`, `shift`, `unshift`, `map`, `filter`, `reduce`, `fold`, `bend` |
| Dictionary | `keys`, `values`, `entries`, `merge`, `record` |
| Serialization | `into-json`, `from-json`, `into-lines`, `from-lines` |
| Combinators | `each`, `fanout`, `zip`, `compose` |
| Async | `_` (await), `__` (Promise.all) |
| Meta | `apply`/`exec`, `$`, `$$`, `<<-`, `->>` |
| Iterator | `iter`, `next`, `..` |
| Sequences | `fibonacci` |
| Statistics | `mean`, `median`, `mode`, `modes` |
| Hyperoperations | `***` (tetration), `****` (pentation) |
| Dynamic patterns | `2+`, `3*`, `10log`, … |

## What the stdlib deliberately leaves out

Console I/O is the stdlib's only contact with the world outside the stack —
`peek` and `peek-all` — which is why those two are exactly the set blocked by
jth-eval's `"restricted"` sandbox. There is no file, network, or process
access in the standard vocabulary. Network-facing operators (for example the
Ollama helpers in `@johnhenry/jth-ai`) are deliberately kept out of the
default vocabulary and must be wired in explicitly from the JS host; HTML
generation (`@johnhenry/jth-html`) is opt-in per program via
`::import "@johnhenry/jth-html";`.

> Previously published as `jth-stdlib@0.4.0`; now `@johnhenry/jth-stdlib`
> with the version restarted at 0.0.0 on scope adoption.
