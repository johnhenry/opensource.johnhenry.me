---
title: "Examples"
description: "Annotated index of the eleven runnable example programs in the jth repository, in learning order."
---

The repo ships eleven numbered example programs in
[`examples/`](https://github.com/johnhenry/jth/tree/main/examples), ordered as
a learning path. Every one runs in CI through the real CLI. To run them
yourself:

```sh
git clone https://github.com/johnhenry/jth && cd jth
npm ci && npm run build
npm run examples      # all of them, in order
npm run example:09    # just FizzBuzz
```

Or, with the CLI installed globally, `jth run examples/09-fizzbuzz.jth`.

## The programs

**[01-hello.jth](https://github.com/johnhenry/jth/tree/main/examples/01-hello.jth)** —
Hello World: push a string, `peek` it. Two tokens of ceremony, total.

**[02-arithmetic.jth](https://github.com/johnhenry/jth/tree/main/examples/02-arithmetic.jth)** —
The arithmetic operators, chained computation (`2 3 + 4 *` — the stack
replaces parentheses), increment/decrement, and `abs`/`sqrt`/`floor`/`ceil`.

**[03-arrays.jth](https://github.com/johnhenry/jth/tree/main/examples/03-arrays.jth)** —
The array toolkit end to end: literals, `push`/`pop`/`shift`/`unshift`, spread
(`...`) and `collect` as inverses, then `map`/`filter`/`reduce`/`fold` and two
`bend` unfolds (a range, powers of two). Also demonstrates the tidy-as-you-go
`drop` habit that keeps variadic operators honest.

**[04-definitions.jth](https://github.com/johnhenry/jth/tree/main/examples/04-definitions.jth)** —
Building vocabulary with `:name`: `square` and `cube`, a `PI` constant,
operators calling operators (`fourth-power`), and a `hypotenuse` built from
`square swap square + sqrt`.

**[05-dynamic-ops.jth](https://github.com/johnhenry/jth/tree/main/examples/05-dynamic-ops.jth)** —
Number-prefixed operators (`3+`, `2*`, `10log`) with the trap spelled out in
runnable form: the prefix is the *left* operand, so `20 3-` is `3 - 20 = -17`.
Ends with the pipeline style these were made for.

**[06-error-handling.jth](https://github.com/johnhenry/jth/tree/main/examples/06-error-handling.jth)** —
`try`/`throw`/`error?` as data flow: errors become stack values, and a
`check-error` definition branches on `error?` with the `swap`-into-`if`
pattern.

**[07-fibonacci.jth](https://github.com/johnhenry/jth/tree/main/examples/07-fibonacci.jth)** —
The built-in `fibonacci` step operator (`(a, b)` → `(b, a, a+b)`) driven by
`times`, with the `swap drop` idiom that trims the stack back to two values
each iteration.

**[08-factorial.jth](https://github.com/johnhenry/jth/tree/main/examples/08-factorial.jth)** —
Iterative factorial with a distinctly stack-flavored strategy: lay out
`n, n-1, …, 1` using `times`, then collapse the whole stack with variadic `Π`.

**[09-fizzbuzz.jth](https://github.com/johnhenry/jth/tree/main/examples/09-fizzbuzz.jth)** —
FizzBuzz 1–100 using the flat `if`/`elseif`/`else` chain — the canonical
multi-way-branch example, plus a counter loop built from `times`.

**[10-statistics.jth](https://github.com/johnhenry/jth/tree/main/examples/10-statistics.jth)** —
The variadic statistics set (`mean`, `median`, `mode`, `modes`) plus `Σ`, `Π`,
`min`, `max` — each demonstration starting from a fresh stack, because these
operators consume everything.

**[11-html.jth](https://github.com/johnhenry/jth/tree/main/examples/11-html.jth)** —
A complete HTML page built with `@johnhenry/jth-html`, demonstrating the
opt-in op-package mechanism (`::import "@johnhenry/jth-html";`), nested
`h-tag` blocks, `h-void` + `h-attrs` for `<meta charset>`, and `h-render`.
The CI end-to-end test asserts its exact output.

## Reading order

01 → 05 are the language core in dependency order; 06 adds failure handling;
07 → 10 are small algorithmic programs that exercise loops and variadic
operators; 11 shows a real DSL package. If you only skim three, make them 03
(arrays and higher-order blocks), 05 (the dynamic-operator trap), and 11 (how
jth programs pull in extra vocabularies).

The index with one-line summaries also lives in the repo at
[`examples/README.md`](https://github.com/johnhenry/jth/tree/main/examples/README.md).
