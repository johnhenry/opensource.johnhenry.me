---
title: "Skipping"
description: "Skip values (dataflow 0.0.1): SKIP, skip(reason) and isSkip, the skipped status, how a skip spreads, consumesSkip and ctx.skipped, and the coalesce and if/else patterns."
sidebar:
  order: 2
---

A node can decline to produce a value: its `run` returns `SKIP` (or `skip(reason)`). That is how a branch says "not this
time": an if/else where only one side applies, a lookup that found nothing, a pane that's switched off. The node settles
as **`skipped`**, and so does every dependent, without running, until one that declared `consumesSkip` decides what to
do. Inspired by [Rivet's control-flow-excluded values](https://github.com/Ironclad/rivet/blob/main/packages/docs/docs/user-guide/control-flow.md).

New in 0.0.1, and additive: a graph that never skips behaves exactly as in 0.0.0. Under npm's caret rules `^0.0.0`
matches only `0.0.0`, so a dependent needs `^0.0.1` (or `0.0.1`) to get it.

```js
import { createDataflow, SKIP, skip, isSkip } from "@johnhenry/dataflow";

const values = new Map();
const formulas = {
  amount: () => 40,
  small: (n) => (n < 100 ? `small: ${n}` : skip("not small")),
  large: (n) => (n >= 100 ? `large: ${n}` : SKIP),
  approval: (large) => `approve ${large}`,
  message: (...inputs) => inputs.find((v) => v !== undefined) ?? SKIP, // coalesce
};

const flow = createDataflow({
  async run(id, { deps, skipped, signal }) {
    const inputs = deps.map((d) => (skipped.includes(d) ? undefined : values.get(d)));
    const value = await formulas[id](...inputs);
    if (!signal.aborted) isSkip(value) ? values.delete(id) : values.set(id, value);
    return value;
  },
});

flow
  .set("amount")
  .set("small", { deps: ["amount"] })
  .set("large", { deps: ["amount"] })
  .set("approval", { deps: ["large"] }) // skipped with "large", never runs
  .set("message", { deps: ["small", "large"], consumesSkip: true }); // runs anyway

flow.runAll();
await flow.idle();
flow.get("approval"); // { status: "skipped", skip: { source: "large", reason: undefined }, ... }
values.get("message"); // "small: 40"
```

The repository's [`examples/04-skip-values.mjs`](https://github.com/johnhenry/dataflow/blob/main/examples/04-skip-values.mjs)
is the same graph, asserted, including recovery when the other branch applies.

## `SKIP`, `skip(reason)`, `isSkip(value)`

| Export | What it is |
| --- | --- |
| `SKIP` | Return it from `run` (sync or async) to skip the node. It is `Symbol.for("@johnhenry/dataflow.skip")`, so two copies of the package agree. |
| `skip(reason?)` | A frozen skip that carries `reason` to `state.skip.reason` of the node and everything it spreads to. |
| `isSkip(value)` | `true` for `SKIP` and for what `skip(reason)` returns. |

A skipped node's state is `{ status: "skipped", skip: { source, reason }, ... }`: `source` is the node whose own run
returned the skip, `reason` what it passed to `skip` (`undefined` for a bare `SKIP`). `state.skip` is present only while
the status is `skipped`.

**`SKIP` can't cross `postMessage`.** A symbol isn't structured-cloneable, so code running in a Worker (an
[andbox](/andbox/) sandbox, say) can't return `SKIP` itself. Have it return its own marker, and map that marker to
`SKIP` in your `run`.

## The rules

- **A skip spreads.** When an input is `skipped`, a dependent becomes `skipped` too, without running, carrying the same
  `state.skip`. In a diamond the join is decided once, after every branch settled.
- **Consumers run anyway.** `set(id, { deps, consumesSkip: true })` runs the node even when inputs were skipped, and
  `ctx.skipped` lists them (it's `[]` for every other node). `consumesSkip: ["a", "b"]` handles skips on those inputs
  only; a skip on any other input still spreads. A consumer whose inputs were all skipped can return `SKIP` itself, and
  that skip spreads on from it.
- **Errors still win.** A node with an input that errored, is missing or hasn't run waits, as before, even if another
  input was skipped and even if it consumes skips. Fixing the error lets it resolve (run, or skip).
- **It recovers.** When the source produces a value again, the skipped dependents run normally and `state.skip` is gone.
- **Manual nodes stay put.** A `done` manual node whose input is skipped keeps its result and is flagged `stale`; running
  it then skips it without calling `run`. A skipped manual node whose input changes is flagged `stale` too, and reruns
  when asked.
- **Newest run wins**, for skips as for values: a superseded run's `SKIP` is dropped, and a skip spreading onto a running
  node aborts that run's signal and drops its result.
- **`version` counts runs.** A node whose own run returned `SKIP` settled a run (`version` +1). A node skipped because an
  input was skipped didn't run: `version` is unchanged and `runId` +1.
- **Cycles and `reset()` clear skip info**, like every other result.

## Patterns

**Coalesce.** A consumer that returns its first input not in `ctx.skipped`, or `SKIP` if there is none: `message` above.

**If/else.** Make the branches mutually exclusive (each skips unless its condition holds) and coalesce them. Downstream
of the branch that didn't apply, everything is `skipped`; downstream of the coalesce, everything runs.

**No first-to-finish race.** A node never starts while anything upstream is running (glitch-freedom), so a consumer
always sees every branch settled and can't take "whichever finishes first". A race of mutually exclusive branches
computes the same thing as if/else, so use that.

## Your values are yours

The scheduler doesn't hold values, so it can't clear the value you stored for a node before it was skipped. Drop it when
`run` returns a skip (as the example does with `values.delete(id)`) or when `onChange` reports `skipped`.

**TypeScript:** `Status` gains `"skipped"`, so a `switch` over `Status` that checks exhaustiveness needs a case for it.
New types: `Skip`, `SkipWithReason`, `SkipInfo`; `RunContext` gains `skipped`, and `set` options gain `consumesSkip`.
