---
title: "tester"
description: "A zero-dependency TAP testing framework that runs unchanged in Node, Deno, and the browser — tests are generators that yield assertion results."
---

**`@johnhenry/tester`** is a [tape](https://github.com/tape-testing/tape)-inspired
testing framework with a twist: a test is a (possibly async) generator
function that *yields* assertion results, and the runner prints them as
[TAP](https://testanything.org/). No test binary, no transforms, no
dependencies — the same file runs under `node`, `deno`, or a `<script type="module">`
tag. Assertions are ordinary functions that *return* (never throw) either a
message string (pass) or a `TestError` (fail), which is what makes the
browser story work and custom assertions one-liners.

> This project has had three npm addresses. Its working name was **Tester**,
> but the unscoped `tester` name was already taken, so it was published as
> **`pop-quiz`** (`0.0.0`–`0.0.7`, 2022–2025 — then `1.0.0`/`1.0.1` in July
> 2026 via a parallel publish from the vendored copy inside `johnhenry/lib`).
> It is now adopted into the scope as **`@johnhenry/tester`**, restarting at
> `0.0.0` — a new address and era, not a maturity signal. The unscoped
> `pop-quiz` versions remain on npm for existing consumers.

## Install

```sh
npm install @johnhenry/tester
```

## Quick start — including in the browser

The same code, verbatim, in all three environments. In Node or Deno, save
it as `example.test.mjs` and run it directly; in the browser, put it in a
module script (importing from a CDN) and watch the console:

```html
<script type="module">
  import tester, { ok, equal, deepequal, throws } from
    "https://cdn.jsdelivr.net/npm/@johnhenry/tester@0.0.0/index.mjs";

  await tester("quick start", function* (plan) {
    plan(4); // optional: declare the expected assertion count

    yield ok(globalThis, "a global object exists everywhere");
    yield equal("a" + "b", "ab", "strings concatenate");
    yield deepequal({ a: 1, b: [2] }, { b: [2], a: 1 }, "key order ignored");
    yield throws(() => JSON.parse("{nope"), "invalid JSON throws");
  });
</script>
```

Output (to the console, wherever the console is):

```
TAP version 13
quick start
1..4
ok 1 - a global object exists everywhere
ok 2 - strings concatenate
ok 3 - key order ignored
ok 4 - invalid JSON throws
# tests 4
# pass  4
# fail  0
```

`tester(...)` resolves to `true`/`false`, and in Node a failure also sets
the process exit code (see below). Assertions *return* their results and
the test *yields* them — nothing throws, so one failing assertion never
aborts the rest of the test.

## When NOT to use this

tester's niche is narrow and deliberate: **browser-runnable TAP with zero
dependencies**. Be honest with yourself about whether you're in it:

- **Testing Node-only code? Use `node:test`.** It ships with Node, needs
  zero dependencies too, and adds what tester doesn't have: file discovery
  (`node --test`), watch mode, coverage, mocking, timeouts, snapshot
  testing, and parallelism. tester has one runner function and twelve
  assertions.
- **Want a batteries-included framework?** Vitest/Jest give you a UI,
  module mocking, and an ecosystem. tester gives you TAP lines on a
  console.
- **Already on tape?** tape has a decade of ecosystem (reporters,
  `t.plan` conventions, stream composition). tester borrows its spirit,
  not its compatibility — the APIs are different.

What's left is exactly where tester earns its keep: the test must run *in
the page* (custom elements, layout, browser APIs) or identically across
Node/Deno/browser, you want TAP output a harness can parse, and you don't
want a test runner in your dependency tree at all. It's ~20 small files
you can read in one sitting; the [repo's own suite](https://github.com/johnhenry/tester)
is 20 assertions of it testing itself.

## The exit-code trap (fixed in pop-quiz 1.0.1)

Every version up to and including `pop-quiz@1.0.0` had a silent
CI-false-green bug: a test file full of **failing assertions still exited
`0`**. The TAP output showed `not ok` lines, but nothing set the process
exit code, so any CI step or shell script checking `$?` saw success.

`pop-quiz@1.0.1` (July 2026) fixed this — `print` now sets
`process.exitCode = 1` when any assertion fails — and `@johnhenry/tester@0.0.0`
includes the fix. If you're on unscoped `pop-quiz`, anything `<= 1.0.0`
will lie to your CI; upgrade, or at minimum parse the `# fail` line
yourself. (In the browser there is no process to exit; the returned
boolean is your signal.)

## The pages here

- [API](/tester/api/) — the default export, all twelve assertions
  (including the `deepequal` vs `deepdeepequal` capability table),
  writing your own assertions, `TAPRunner`'s `run`/`print`, and the exact
  TAP output format

Source: [github.com/johnhenry/tester](https://github.com/johnhenry/tester) ·
Runnable examples in [`examples/`](https://github.com/johnhenry/tester/tree/main/examples) —
each is self-checking and doubles as a CI smoke test.
