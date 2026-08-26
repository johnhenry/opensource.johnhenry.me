---
title: "Packages"
description: "Which of the nine @johnhenry/jth-* packages you want, what each one does, and how they depend on each other."
---

jth ships as nine packages from one monorepo, all under the `@johnhenry` npm
scope, all at the same restarted version line (0.0.0 on scope adoption; each
was previously published unscoped at 0.4.0).

| Package | Directory | What it is |
|---|---|---|
| `@johnhenry/jth` | `packages/jth-cli` | The CLI (binary `jth`): run, compile, bundle, launch the REPL |
| `@johnhenry/jth-compiler` | `packages/jth-compiler` | `lex` → `parse` → `generate` pipeline; `transform()` for one-shot source-to-JS |
| `@johnhenry/jth-runtime` | `packages/jth-runtime` | `Stack`, `processN`, the `op()`/`variadic()` builders, metadata annotations, the global operator `registry` |
| `@johnhenry/jth-stdlib` | `packages/jth-stdlib` | The ~110 standard operators; importing registers them globally |
| `@johnhenry/jth-eval` | `packages/jth-eval` | Embeddable evaluation: `evalJth()`, `JthContext`, `ScopedRegistry`, sandbox modes, timeouts |
| `@johnhenry/jth-repl` | `packages/jth-repl` | The interactive REPL (`startRepl()`) and an embeddable `createEvaluator()` |
| `@johnhenry/jth-html` | `packages/jth-html` | Opt-in HTML DSL: `h-tag`, `h-text`, `h-render`, dynamic `h-<tag>` shorthand |
| `@johnhenry/jth-ai` | `packages/jth-ai` | JS-only Ollama helpers — factories that produce stack operators |
| `@johnhenry/jth-types` | `packages/jth-types` | Shared tokens, AST constructors/interfaces, error hierarchy; no runtime logic |

## Which one do I want?

**Writing and running `.jth` programs** — install `@johnhenry/jth` globally
and stop reading. It depends on the compiler, runtime, stdlib, and REPL, so
one install gives you the whole toolchain. See [CLI](/jth/cli/).

**Evaluating jth code inside a JavaScript application** — `@johnhenry/jth-eval`.
It is the only package with a real evaluation API surface: injected values,
custom operators, timeouts, and sandbox modes for untrusted input. Reach for
the lower-level packages only if jth-eval's model doesn't fit. See
[Embedding](/jth/embedding/).

**Driving the stack machine directly from JS** — `@johnhenry/jth-runtime`
plus `@johnhenry/jth-stdlib`. You build item arrays yourself and feed them to
`processN`; there is no jth *syntax* involved at this layer unless you also
pull in the compiler.

**Compiling jth source to JavaScript text** (build tools, playgrounds,
codegen) — `@johnhenry/jth-compiler`. `transform(source)` returns a JS module
string; `lex`/`parse`/`generate` expose the stages individually.

**An interactive prompt** — the CLI's `jth repl` in a terminal, or
`@johnhenry/jth-repl` programmatically (`startRepl()`, or `createEvaluator()`
for a persistent stack without the terminal UI).

**Generating HTML from jth** — `@johnhenry/jth-html`, loaded from a program
with `::import "@johnhenry/jth-html";`. It is opt-in: the compiler preamble
only auto-loads the stdlib.

**Calling an LLM** — `@johnhenry/jth-ai`, but read its scope note first: it is
a JavaScript-only helper library. It registers **no** operator names in the
jth registry, and `::import "@johnhenry/jth-ai";` does nothing — network
access is deliberately kept out of the default jth vocabulary. Its exports are
factories (`createInfer`, `conversation`, `extractContent`) that produce stack
operators for you to drive from JS via `processN`. Requires the `ollama` peer
dependency and a running Ollama instance.

**Building tooling over jth's AST or errors** — `@johnhenry/jth-types`. Token
types, AST node constructors and interfaces, and the `JthError` hierarchy
(`JthLexerError`, `JthParserError`, `JthRuntimeError` with machine-readable
`code`s). Types and tiny constructors only.

## Dependency shape

Dependencies point strictly downward — `types` at the bottom, the CLI at the
top:

```
jth-types            (no dependencies)
  └─ jth-runtime
       ├─ jth-stdlib
       ├─ jth-compiler
       └─ jth-html
jth (CLI) ── compiler + runtime + stdlib + types + repl (+ esbuild for bundling)
jth-eval  ── compiler pipeline + stdlib
jth-ai    ── runtime-level helpers (peer: ollama)
```

Two registry side effects worth knowing when composing packages yourself:

- Importing `@johnhenry/jth-stdlib` registers the standard library into the
  **global** registry — as does importing `@johnhenry/jth-eval`, which loads
  the stdlib for you.
- Importing `@johnhenry/jth-html` likewise registers its `h-*` ops globally
  (or call its `registerHTML()` explicitly).

## Versions

All nine sit at `0.0.0` with `^0.0.0` internal ranges. Under npm's pre-1.0
caret rules `^0.0.0` matches only `0.0.0`, so the family moves in lockstep —
install matching versions and upgrade them together.
