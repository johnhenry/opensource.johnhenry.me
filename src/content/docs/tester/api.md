---
title: "tester API"
description: "The tester runner, all twelve assertions with signatures and behavior, deepequal vs deepdeepequal, custom assertions, TAPRunner's run/print, and the TAP output format."
---

Three rules explain the whole library:

1. A **test** is a (possibly async) generator function that **yields**
   assertion results. It receives one argument: `plan`.
2. An **assertion** is an ordinary function that **returns** — never
   throws — either a message string (pass) or a `TestError` (fail).
3. A result is a failure exactly when it is `instanceof TestError`.
   Everything else passes.

Everything below is a consequence of those rules.

## Default export: `tester`

```javascript
import tester from "@johnhenry/tester";

tester(title, test, primaryTest = true) // → Promise<boolean>
tester(test)                            // title omitted
```

Runs `test` and prints TAP to the console. Resolves `true` if every
assertion passed. On failure it also sets `process.exitCode = 1` where
`process` exists (Node) — first shipped in `pop-quiz@1.0.1`; in the
browser the returned boolean is your only signal.

`primaryTest` controls the leading `TAP version 13` line. When a run
executes several test files, pass `false` for all but the first so the
header prints once.

### `plan(n)`

The test generator's single argument. Calling it — at most once, or it
throws — declares the expected assertion count, which controls the `1..n`
plan line (see [TAP output](#tap-output-format) for where it lands). It is
optional, and you can name the parameter anything (`plan`, `expect`,
`assertions`).

```javascript
await tester("planned", function* (plan) {
  plan(2);
  yield ok(true);
  yield ok(1);
});
```

## Assertions

All are named exports of the package root (also importable from
`@johnhenry/tester/assertions`). Every assertion accepts a trailing
`message` (reported on pass *and* fail, defaulting to a `"should ..."`
phrase) and an `operator` string (shown in TAP failure diagnostics). Yield
their results — don't just call them.

### `ok(actual, message?, operator?)` / `notok(actual, message?, operator?)`

Pass if `actual` is truthy (`ok`) or falsy (`notok`).

```javascript
yield ok(user.id, "user has an id");
yield notok(errors.length, "no validation errors");
```

### `equal(actual, expected, message?, operator?)` / `notequal(actual, unexpected, message?, operator?)`

Strict `===` / `!==` comparison. Two distinct objects with identical
contents are **not** `equal` (use the deep variants), and since
`NaN === NaN` is false, two NaNs fail `equal`.

```javascript
yield equal(add(2, 2), 4);
yield notequal(copy, original, "copy is a new reference");
```

### `deepequal(actual, expected, message?, operator?)`

Deep structural equality over primitives, arrays, plain objects (own
enumerable string keys), RegExp (source + flags), and objects with a
custom `valueOf`/`toString` such as Date. Constructors must match. Two
NaNs count as equal. On failure, diagnostics show `JSON.stringify` of both
sides.

Two blind spots, both silent — see the table below: Map/Set *contents* are
invisible to it, and circular references overflow the stack.

### `deepdeepequal(actual, expected, message?, operator?)`

Everything `deepequal` does, plus Map contents, Set contents
(order-insensitive, by deep membership), and circular references (a cycle
that lines up on both sides is equal instead of a crash). Failure
diagnostics use a Map/Set/circular-safe stringifier (`{"__map__": [...]}`,
`{"__set__": [...]}`).

```javascript
const a = new Map([["x", 1]]);
const b = new Map([["x", 2]]);
yield ok(deepdeepequal(a, b) instanceof TestError, "difference detected");
```

#### `deepequal` vs `deepdeepequal`

| Comparison | `deepequal` | `deepdeepequal` |
| --- | --- | --- |
| Primitives, arrays, plain objects (any key order) | yes | yes |
| `NaN` vs `NaN` | equal | equal |
| RegExp (source + flags), Date / custom `valueOf` | yes | yes |
| Map **contents** | **no — two different-content Maps compare as equal** (Map has no own enumerable string keys, so both look like `{}`) | yes — same size, same keys, values compared deeply |
| Set **contents** | **no — same silent false-equal as Map** | yes — same size, order-insensitive deep membership |
| Circular references | **no — infinite recursion (stack overflow)** | yes — matching cycles are equal |

The rule of thumb: if either side can contain a Map, a Set, or a cycle,
use `deepdeepequal`. Its extra cost (cycle bookkeeping, quadratic Set
matching) only matters on large structures.

### `throws(fn, message?, operator?)` / `doesnotthrow(fn, message?, operator?)`

Call `fn()` with no arguments and pass if it throws / doesn't. Both are
async and `await` the call, so rejecting async functions count as
throwing. Yield inside a test handles the returned promise for you.

```javascript
yield throws(() => JSON.parse("{nope"), "invalid JSON throws");
yield doesnotthrow(async () => await fetchConfig(), "config loads");
```

### `pass(message?)` / `fail(message?)`

Unconditional results — `pass` returns its message, `fail` returns a
`TestError`. Placeholders, reachability markers, TODO tests.

### `subtestpass(test, message?, operator?)` / `subtestfail(test, message?, operator?)`

Run a nested test (any generator of assertion results) and reduce it to a
single outer assertion. The subtest's own output is consumed silently —
it never appears in TAP.

- `subtestpass` passes iff **every** assertion in the subtest passes.
- `subtestfail` passes iff **every** assertion in the subtest fails —
  note: *all* of them, not "at least one". An empty subtest passes both,
  vacuously.

`subtestfail` is how you test an assertion — including one you wrote
yourself — by feeding it input it must reject:

```javascript
yield subtestfail(function* () {
  yield equal(1, 2);
}, "equal rejects unequal values");
```

## Writing your own assertion

Return the message on success; return (don't throw) a `TestError` on
failure. `TestError(message, val)` takes a diagnostics object whose
key-value pairs become the indented block under the `not ok` line —
conventionally `actual`, `expected`, and `operator`.

```javascript
import TestError from "@johnhenry/tester/testerror";

export default (actual, expected, message = "should be close", operator = "almost") =>
  Math.abs(actual - expected) < 1e-9
    ? message
    : new TestError(message, { actual, expected, operator });
```

By convention (followed by every bundled assertion) the last two
parameters are always the overridable `message` and `operator`, and each
module also exports its `DefaultMessage` string.

## TAPRunner: `run` and `print`

`@johnhenry/tester/TAPRunner` exports the machinery under the default
export.

```javascript
import { run, print } from "@johnhenry/tester/TAPRunner";
```

**`run(test, title?, resultPass?, resultFail?, resultCounts?, resultRange?)`**
is an async generator. Called with just a test, it yields the raw results
— message strings and `TestError`s — with no framing at all. That's the
form the subtest assertions use, and the escape hatch for building your
own reporter:

```javascript
for await (const result of run(myTest)) {
  if (result instanceof TestError) record(result);
}
```

The optional formatter arguments (`(output, index)` for pass/fail,
`(tests, pass, fail)` for counts, `(n)` for the plan line) turn the same
stream into text; the exported `TAPResultPass`, `TAPResultFail`,
`TAPResultCounts`, and `TAPResultRange` helpers are the TAP formatters
`print` plugs in.

**`print(test, title?, log?, logError?, logVersion?)`** is what the
package's default export delegates to: it drives `run` with the TAP
formatters and logs each line (`log` defaults to `console.log`). Returns
`Promise<boolean>` and sets `process.exitCode = 1` on failure where
`process` exists.

## TAP output format

tester emits a partial [TAP version 13](https://testanything.org/tap-specification.html)
stream:

```
TAP version 13                  ← once per run (primaryTest / logVersion)
my title                        ← the title, verbatim (no # prefix)
1..3                            ← plan line — see placement note below
ok 1 - should be truthy
not ok 2 - should be strictly equal
  ---                           ← diagnostics: the TestError's val object
    actual: 1
    expected: 2
    message: should be strictly equal
    operator: equal
  ...
ok 3 - should always pass
# tests 3
# pass  2
# fail  1
```

Placement of the `1..n` plan line: if the test called `plan(n)`, it's
emitted before the first result (with `n` as given); otherwise it's
emitted **after the last result**, using the actual count. Both are valid
TAP — parsers accept a trailing plan.

Divergences from full TAP worth knowing: the title is printed as a bare
line rather than a `# comment`, assertion numbering restarts at 1 for each
`tester(...)` call in the same process, and there's no `Bail out!`,
`# SKIP`, or `# TODO` support.
