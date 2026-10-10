---
title: "API"
description: "createDataflow({ run, onChange, schedule }) and every graph method: set, delete, run, invalidate, runAll, reset, pause/resume, the read methods, order, subscribe and idle."
sidebar:
  order: 2
---

One export, `createDataflow` (also the default export). TypeScript declarations ship in `src/index.d.ts`.

```js
import { createDataflow } from "@johnhenry/dataflow";
```

## `createDataflow({ run, onChange?, schedule? })`

- `run(id, { runId, signal, deps })`: compute one node; may return a value or a promise. `deps` is the dependency list
  at the moment the run started. A synchronous throw is reported the same way as a rejection (the node goes to
  `error`).
- `onChange(id, state)`: called on every state change (also see `subscribe`).
- `schedule(fn)`: how flushes are deferred; default `queueMicrotask`.

`run` is required: `createDataflow` throws a `TypeError` without it.

Returns a graph object; mutating methods return it, so calls chain.

## Methods

| Method | Does |
| --- | --- |
| `set(id, { deps = [], autorun = true })` | Add a node, or replace its dependencies / autorun flag. Never runs anything by itself. |
| `delete(id)` | Remove a node; its dependents start waiting. |
| `run(id)` | Run now, whatever the autorun flag. Autorun dependents follow. |
| `invalidate(id)` | The definition changed: autorun nodes rerun, manual nodes become `stale`. |
| `runAll({ all = true, ids })` | Queue nodes in dependency order; `all: false` skips manual nodes. |
| `reset()` | Forget every result, abort in-flight runs (for example after the place your values live was restarted). |
| `pause()` / `resume()` / `paused` | Hold new runs; running ones still settle. |
| `get(id)`, `has(id)`, `deps(id)`, `autorun(id)`, `dependents(id)`, `ids()` | Read the graph. |
| `order(ids?)` | Topological order, dependencies first; nodes on a cycle are omitted. |
| `subscribe(fn)` | Listen to every change; returns an unsubscribe function. |
| `idle()` | Resolves once nothing is queued or running (or the graph is paused). |

## Details per method

**`set(id, options)`**. `id` must be a non-empty string (otherwise a `TypeError`). Duplicate ids in `deps` are dropped.
Adding a node emits its `idle` state. Replacing an existing node's `deps` or `autorun` does **not** rerun it, mark it
stale, or wake anything: call `invalidate(id)` or `run(id)` afterwards. Every `set` rechecks cycles, so an edge that
closes a cycle sends every node on it to `error` with `cycle: true` immediately. `deps` may name ids that don't exist
yet; such a node waits when asked to run.

**`delete(id)`**. Aborts the node's in-flight run, removes it, and marks its dependents (and everything downstream of
them) `waiting`, except nodes that have never run and were never queued, which stay `idle`. Deleting an unknown id is a
no-op.

**`run(id)` and `invalidate(id)`**. Both queue rather than run; the flush happens on the next `schedule` tick. Unknown
ids are ignored silently, as is `invalidate` on a node that sits on a cycle.

**`runAll({ all, ids })`**. `ids` restricts the set; dependencies of those ids are visited for ordering but only the
listed ids are queued.

**`reset()`**. Every node not on a cycle goes back to `idle` with `result`, `error` and `stale` cleared; in-flight runs
are aborted and their results dropped. Nodes on a cycle stay in `error`. Nothing is rerun: follow with `runAll()`.

**`pause()` / `resume()`**. While paused nothing new starts; runs already in flight still settle, and the dependents
they queue wait for `resume()`, which flushes everything queued meanwhile.

**`get(id)`**. A copy of the node's state, or `undefined` for an unknown id. `deps(id)` returns a copy of the list.
`autorun(id)` is `undefined` for an unknown id. `dependents(id)` lists direct dependents only.

**`subscribe(fn)`**. `fn(id, state)` is called for every state change of every node. The returned function removes the
listener (it returns `true` the first time, `false` after). Listeners run synchronously and an exception from one is not
caught; see [Limitations and traps](/dataflow/limitations/#a-throwing-listener-wedges-the-graph).

**`idle()`**. Polls on `setTimeout(0)` turns until nothing is queued and no node is `running`. It also resolves whenever
the graph is paused, with work still queued, so `await flow.idle()` after `pause()` does not mean "settled".
