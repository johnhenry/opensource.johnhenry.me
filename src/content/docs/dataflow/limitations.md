---
title: "Limitations and traps"
description: "What dataflow leaves to you: it doesn't store values (but keeps what run returns), cancellation is cooperative, no equality cut-off, linear scans, one process, and listeners that must not throw."
sidebar:
  order: 3
---

Traps first: the behavior you won't guess from the type signatures. Each was checked against the 0.0.0 source.

## It doesn't store values

That is deliberate, but it has two consequences.

- **"Rerun only if the value actually changed" (equality cut-off) is yours.** Every settled run queues every autorun
  dependent, even when it produced the same value as last time. Compare in your `run` (or in `onChange`) and return early
  if you need it.
- **What `run` returns is kept.** It becomes `state.result` and stays referenced until the next run of that node, an
  error, or `reset()`. Returning the value itself defeats the point when the value is large or must stay in another
  realm: return a preview or a token instead.

## Cancellation is cooperative

A superseded run's result is dropped and its signal aborts, but the scheduler can't stop code that ignores the signal.
The signal aborts when the run is superseded, when the node is deleted, when it becomes `waiting`, when it lands on a
cycle, and on `reset()`. Check `signal.aborted` before every side effect, and pass `signal` on to anything that accepts
one (`fetch`, for example).

If you need a hard kill, run in something you can terminate (a Worker), terminate it, and call `reset()` after
restarting it. With [andbox](/andbox/), a timeout that hard-kills the Worker takes every value with it; `reset()` then
`runAll()` recomputes them.

## Listeners run inside the scheduler

`onChange` and `subscribe` listeners are called synchronously, from inside `set()`, `run()` and every settlement, so keep
them cheap (schedule rendering rather than doing it inline). One that throws is reported through `reportError` (in a
browser, the console's uncaught-error path), like an `EventTarget` listener: the other listeners still run and scheduling
carries on.

## Scans are linear

Finding dependents walks every node; that is fine for hundreds or a few thousand nodes (a notebook, a spreadsheet tab),
not for a million-cell sheet.

## One process

The graph is in-memory and not shared across tabs or machines.

## Smaller traps

- **A queued node keeps its previous status** until it starts `running`; there is no "queued" state. See
  [States](/dataflow/states-and-guarantees/#states).
- **`set()` on an existing node doesn't rerun it**, even when its `deps` changed. Call `invalidate(id)`.
- **`idle()` resolves while paused**, even with work queued.
- **Unknown ids are ignored silently** by `run`, `invalidate` and `delete`; `get` returns `undefined`.
- **Run order within one flush follows queue order** among nodes whose inputs are ready; only upstream/downstream order
  is guaranteed. Use `order()` if you need a deterministic topological order for something else.
