---
title: "States and guarantees"
description: "dataflow's six node statuses, what every state object carries, and its five scheduling guarantees: glitch-free propagation, newest run wins, errors wait, manual nodes stay put, cycles are refused."
sidebar:
  order: 1
---

## States

| Status | Meaning |
| --- | --- |
| `idle` | Never run, or reset. |
| `waiting` | Asked to run, but an input is missing, errored, or hasn't run yet. Runs by itself once the input arrives. |
| `running` | `run` was called and hasn't settled. |
| `done` | The last run resolved. `state.result` holds what `run` returned. |
| `error` | The last run threw or rejected (`state.error`), or the node is on a dependency cycle (`state.cycle === true`). |

Every state also carries `version` (settled runs), `runId` (started runs) and `stale` (a manual node whose inputs or
definition changed since its last run).

Things the table doesn't say:

- **There is no "queued" status.** A queued node keeps showing its previous status (often `done`) until it starts
  `running`. If a UI needs a "queued" badge, track your own calls.
- **"Never run" and "asked to run" differ.** A node nobody asked to run stays `idle` when an input fails. A node that was
  queued (by `run`, `runAll` or an upstream change) becomes `waiting` instead, and runs once its input recovers.
- **`waiting` resolves only when an input settles `done`.** Adding a missing input with `set()` doesn't wake its
  dependents; running that input does.
- **`version` counts settled runs, errors included.** `runId` also moves when a run is superseded, the node is marked
  `waiting`, or the graph is `reset()`, so a late result can always be recognized as stale.
- **`result` is cleared on error** (`result: undefined`) and by `reset()`.
- **Listeners get a copy.** `onChange` and `subscribe` receive a snapshot of the state, and `get(id)` returns a copy too;
  mutating either changes nothing in the scheduler.

## Guarantees

- **Glitch-free.** A node never starts while anything upstream of it is queued or running. In a diamond (`a → b`,
  `a → c`, `b + c → d`), changing `a` runs `d` once, after both `b` and `c`.
- **Newest run wins.** Rerunning a node while a previous run is in flight aborts the previous run's `AbortSignal` and
  drops its result, even if it settles later. Write your side effects behind `if (!signal.aborted)`.
- **Errors don't cascade as errors.** When a node fails, its dependents become `waiting`, not `error`; only the node
  that broke shows an error, and the dependents rerun on their own once it's fixed.
- **Manual nodes stay put.** A node with `autorun: false` keeps its last result when inputs change, and is flagged
  `stale: true` until you `run` it.
- **Cycles are refused, not looped.** Every node on a cycle goes to `error` with `cycle: true` as soon as the edge is
  added, and comes back to `idle` when the cycle is broken. A self-dependency is a cycle.

What "newest run wins" does not cover:

- **It drops the result, not the work.** The superseded `run` keeps going until it checks `signal.aborted` (see
  [Limitations and traps](/dataflow/limitations/)).
- **Write-then-return races are yours.** In the quick start, `values.set(id, value)` is guarded by the signal. Without the
  guard, a slow stale run can still overwrite the value you keep elsewhere, even though dataflow drops its
  `state.result`. [Example 02](https://github.com/johnhenry/dataflow/tree/main/examples) is that case.

What a manual node does and doesn't do:

- `invalidate(id)` on a manual node marks it `stale` only if it is `done`. On an `idle` manual node it does nothing.
- `runAll({ all: false })` skips manual nodes; plain `runAll()` runs them too.
- `run(id)` runs any node, whatever its `autorun` flag, and its autorun dependents follow.
