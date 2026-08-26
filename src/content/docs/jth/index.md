---
title: "jth"
description: "A stack-based programming language that compiles to JavaScript — CLI, compiler, runtime, stdlib, REPL, and embedding packages under @johnhenry/jth-*."
---

**`@johnhenry/jth`** is the CLI for jth, a stack-based programming language
that compiles to JavaScript. You push values onto a stack; operators pop their
arguments, do their work, and push results back. The whole language is that
model plus ~110 standard operators, blocks, user definitions, and a compiler
that emits plain JavaScript modules you can run with node — no runtime
installation required in the output.

> The CLI was previously published as `jth-lang@0.4.0`, itself renamed from
> `jth-cli@0.1.0` (the unscoped npm name `jth` belongs to someone else, hence
> the detour). The eight supporting packages were previously published
> unscoped, each at `0.4.0` (`jth-runtime`, `jth-compiler`, …). Everything now
> lives under the `@johnhenry` scope and versions restarted at 0.0.0 on
> import — a new era, not a maturity signal.

## Install

```sh
npm install -g @johnhenry/jth
```

The package is `@johnhenry/jth`; the binary it installs is `jth`. Without a
global install, `npx @johnhenry/jth run file.jth` works — the package has a
single bin, so npx picks it up. Do **not** run `npx jth`: that resolves the
unscoped `jth` package, which is someone else's.

## Ten lines of jth

```jth
"Hello, World!" peek;          // log the top of the stack
2 3 + 4 * peek;                // (2 + 3) * 4 = 20

#[ dupe * ] :square;           // define an operator from a block
5 square peek;                 // 25

[1 2 3 4 5] #[ 2 * ] map peek; // [2, 4, 6, 8, 10]

1 2 3 4 5 Σ peek;              // 15 — variadic: consumes the whole stack
#[ "odd" ] #[ "even" ] 10 2 % 0 = if peek;  // "even"
```

Save it as `taste.jth`, then `jth run taste.jth`.

## Write the false branch first

`if` pops a condition, a true-block, and a false-block — which means in source
order you write the *false* block first, then the true block, then the
condition: `#[ false-branch ] #[ true-branch ] condition if`. Getting this
backwards is the classic first-hour mistake. The [tutorial](/jth/tutorial/)
covers the `if`/`elseif`/`else` chain form that avoids the nesting entirely.

## Expect variadic operators to eat the whole stack

`Σ`, `Π`, `min`, `max`, `mean`, `median`, `mode`, `collect`, `flatten`, and
`__` consume **every** value on the stack, not two. `1 2 3 4 Σ` is `10`, and
anything you left on the stack from earlier is gone into the result. Isolate
variadic math with `clear` or by structuring your program so the stack holds
only what the operator should see.

## Read `N op` as "N op x", not "x op N"

Dynamic operators prefix a number to an operator: `3+`, `2log`, `3-`. The
prefix number is the **left** operand — `20 3-` computes `3 - 20 = -17`, not
`17`. Commutative operators (`+`, `*`) hide this; `-`, `/`, `%`, `**`, and
`log` do not.

## The package family

| Package | What it is |
|---|---|
| `@johnhenry/jth` | The CLI (binary `jth`): run, compile, bundle, REPL |
| `@johnhenry/jth-compiler` | Lexer, parser, code generator — jth source in, JavaScript out |
| `@johnhenry/jth-runtime` | Stack VM: `Stack`, `processN`, `op()`, the operator registry |
| `@johnhenry/jth-stdlib` | The ~110 standard operators; importing it registers them globally |
| `@johnhenry/jth-eval` | Embeddable evaluation for JS hosts: `evalJth()`, `JthContext`, sandboxing |
| `@johnhenry/jth-repl` | The interactive REPL (also embeddable) |
| `@johnhenry/jth-html` | Opt-in HTML DSL operators (`h-tag`, `h-text`, …) |
| `@johnhenry/jth-ai` | JS-only Ollama helpers that produce stack operators |
| `@johnhenry/jth-types` | Shared tokens, AST nodes, and error hierarchy |

See [Packages](/jth/packages/) for which one you actually want.

## The pages here

- [Tutorial](/jth/tutorial/) — the language from zero: values, the stack, blocks, definitions, control flow, modules
- [Operators](/jth/operators/) — the full operator reference, table by table
- [Packages](/jth/packages/) — which of the nine packages you want, and what depends on what
- [CLI](/jth/cli/) — `jth run`, `jth compile`, bundled vs. bare output, the REPL
- [Embedding](/jth/embedding/) — using jth from JavaScript hosts: jth-eval, jth-runtime, jth-html
- [Stdlib](/jth/stdlib/) — the standard library as a package: loading, registry behavior, categories
- [Examples](/jth/examples/) — annotated index of the runnable programs in the repo

## Status

Active and tested — 1082 tests across unit, end-to-end CLI, and a
pack-and-install smoke suite, all green in CI on Node 20 and 22. The
language itself is young and its surface still moves between releases; the
0.0.0 version is a scope-adoption restart, but treat the whole family as
pre-1.0 software: pin versions, read the changelog, don't build your product's
core on it yet.

Source: [github.com/johnhenry/jth](https://github.com/johnhenry/jth)
