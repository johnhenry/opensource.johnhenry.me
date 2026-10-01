---
title: "Probing and health"
description: "The probe modes and what each records, HealthRegistry, and the circuit breaker's half-open behaviour."
sidebar:
  order: 105
---

## Probing

| `probe` | Behaviour | Health | Trace |
|---|---|---|---|
| `"head"` (default) | `fetch(url, { method: "HEAD", redirect: "follow" })`; on 405 or 501, a `GET`. Non-OK is a failure. | success with latency, or failure | `probe` then `ok` / `fail` / `aborted` |
| `"import"` | `importer(url)`; the module is returned in `Resolution.module`. | as above | as above; late race losers are `aborted` / `lost the race` |
| `"none"` | nothing is checked; the first eligible provider in the strategy's order is chosen (in a `race()`, whichever selection settles first) | **none recorded** | `selected` |
| function `(url, { provider, signal }) => Promise<{ module? } \| void>` | yours; resolve for success, reject for failure | as above | as above |

A probe proves availability, not correctness: a `HEAD` 200 does not mean the file is an
ES module whose own imports will resolve. `"none"` is for build-time routing where you
trust the table; it records no health data because nothing was checked.

## Health and the circuit breaker

### HealthRegistry

```ts
new HealthRegistry({ failures? = 3, reset? = 30000, now? = Date.now }?)
```

Per-provider (keyed by provider `name`) counts and a circuit breaker. `reset` is
milliseconds or a string: `"500ms"`, `"30s"`, `"1m"`, or a bare number of milliseconds
(`TypeError` for anything else).

| Member | Meaning |
|---|---|
| `success(name, ms?, { keepStreak? }?)` | `ok++`, streak reset to 0, circuit closed; `ms` updates the smoothed latency (`0.7 × previous + 0.3 × ms`). With `keepStreak: true` it counts the success but leaves the streak and circuit alone |
| `settle(name)` | streak reset to 0, circuit closed: a deferred success was confirmed |
| `failure(name)` | `fail++`, `streak++`; when `streak >= failures` the circuit opens until `now() + reset` |
| `isOpen(name)` | the circuit is open now: `streak >= threshold` and `now() < lastFailure + reset` |
| `scoped({ failures?, reset?, now? }?)` | a view of the same state judged by other settings (what `fallback({ providers, circuitBreaker })` uses) |
| `successRate(name)` | `(ok + 1) / (ok + fail + 1)`; 1 for an unknown provider |
| `latency(name)` | smoothed latency, or `undefined` |
| `snapshot()` | `{ [name]: { ok, fail, streak, latency, openUntil, healthy } }` for every provider that has recorded a success or failure; `healthy` is `!isOpen` |
| `threshold`, `reset`, `now` | the resolved options |

When `reset` has passed the circuit is closed again, but the streak is not reset, so the
next failure reopens it immediately (a half-open state); a success closes it for good.
Reading health never creates an entry.

What records health: probe outcomes (not with `probe: "none"`), `verified()` mismatches,
and `router.import()` import failures. Aborted race losers do not.

Inside `router.import()` a passing probe does **not** reset the failure streak (it records
`success(name, ms, { keepStreak: true })`); only a completed import calls `settle()`. So a
mirror that answers the probe but whose module fails to load (syntax error, bad exports)
accumulates failures and its circuit opens after `failures` imports in a row. `resolve()`
and `build()` never import, so a passing probe still resets the streak there.
