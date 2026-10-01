---
title: "Strategies"
description: "fallback(), race(), adaptive(), weighted(), prefer(), verified(), cache() and sri(): signatures, behaviour and rejections."
sidebar:
  order: 104
---

Every node, provider or strategy, implements `select(request, ctx)` and resolves to a
selection or rejects. Strategies nest freely:

```js
fallback(cache(), race(verified(esmSh()), verified(jsDelivr({ esm: true }))), unpkg())
```

## fallback()

```ts
fallback(...nodes: Array<Node | Node[]>): Node
fallback({ providers: Node[], circuitBreaker?: { failures?, reset?, now? } }): Node
```

Tries each node in order and returns the first success. Arrays among the arguments are
flattened. A `ResolutionError` or an `AbortError` from a node is rethrown at once (no
other node could do better); once the caller's signal is aborted, the abort reason is
thrown instead of whatever the node rejected with. Otherwise errors are collected, and
when every node has failed or skipped the result is
`RoutingError("mport: no provider could serve <specifier>")` with `errors` in node order.

The object form gives the fallback its own circuit-breaker **settings** (`failures`,
`reset`, optionally `now`) over the router's health **state**: its nodes' successes and
failures are recorded in `router.health` (and in a shared `health`), on the router's `now`
clock unless `circuitBreaker.now` is given, and the fallback decides whether a circuit is
open using its own `failures`/`reset` (via `health.scoped()`). Used outside a router,
where there is no registry, it builds a private one.

## race()

```ts
race(...nodes: Array<Node | Node[]>): Node
```

Selects every node concurrently and returns the first **success** (`Promise.any`): a
fast failure does not end the race. The winner's return aborts the others' signal, so
fetch probes are cancelled and traced as `aborted`, and aborted probes record no health
failure. Import probes can't be cancelled; one that finishes after the race was decided
is traced as `aborted` with `reason: "lost the race"` (its success still counts in the
health registry). When every node fails: the caller's abort reason if aborted; otherwise
the first `ResolutionError` among the errors if there is one; otherwise
`RoutingError("mport: every provider failed for <specifier>")`.

## adaptive()

```ts
adaptive(...nodes: Array<Node | [Node, weight]>): Node
```

Orders nodes by `weight × successRate ÷ (1 + latency / 100)`, highest first, using the
health registry in effect (`weight` defaults to 1, `successRate` is
`(ok + 1) / (ok + fail + 1)`, `latency` is the smoothed latency in ms or 0 when unknown),
with ties in argument order, then runs `fallback()` over that order. Deterministic for a
given health state. `[node, weight]` pairs are shorthand for `weighted(node, weight)`.

## weighted()

```ts
weighted(node: Node, weight: number): Node
```

A copy of `node` with `weight`, for `adaptive()`.

## prefer()

```ts
prefer(byTarget: Record<string, Node>): Node
```

Picks the node for the current target (the `target` option of the call, else the
router's, default `"browser"`), else the `default` key. With neither it rejects with
`SkipError("prefer: nothing for target …")`, which is not traced. Targets are free-form
strings; `browser`, `raw` and `node` are conventions, not a fixed list.

## verified()

```ts
verified(node: Node, { algorithm? = "sha384" }?): Node
```

Selects through `node`, then **downloads** the selected URL with `GET` and computes its
SRI hash (`sha256`, `sha384` or `sha512`). The expected hash is `options.integrity` or
the lockfile entry's `integrity`.

- The download responds non-OK: rejects with `IntegrityError("… responded <status>")`.
  With the `"head"` probe this is the probe failing, so it is traced `fail` and counts
  against the provider's health; with another probe it is neither.
- The hash differs from the expected one: records a health failure, traces
  `{ type: "fail", phase: "integrity", provider, url, error: "expected …, got …" }`, and
  rejects with `IntegrityError`.
- Otherwise the selection carries `integrity`, which `build()` writes into the import
  map's `integrity` field and the lockfile.

With no expected hash it only records what it downloaded: trust on first use. Wrap each
mirror (`race(verified(a), verified(b))`) so a bad one fails over. With the default `"head"`
probe the download **is** the probe (one `GET` per candidate, traced `probe` → `ok`, health
recorded from it; a non-OK answer is a failed candidate), not a `HEAD` followed by a `GET`
of the same URL. With any other probe (`"import"`, a function) the probe runs first and the
download follows; `verified()` downloads even with `probe: "none"`. A cache hit inside
`verified()` is hashed again.

## cache()

```ts
cache({ store? = new Map(), name? = "cache", prefix? = "mport:", ttl? }?): Node
```

A node that serves remembered resolutions without probing. The router writes every
successful, non-cached resolution into **every** `cache()` node in its whole route
table (not only the route that served it), keyed by the **specifier as written** plus the
target, the matched route and any lockfile pin (never the resolved version, so a hit needs
no network). Each record holds the resolution and its artifact (`registry`, `version`,
`entry`), so a hit returns the same `registry`, `entry` and lock data as a miss. `ttl`
(milliseconds or `"30s"`/`"5m"`) expires records: an older one traces `skip` (reason
`expired`) and is re-resolved and overwritten; without `ttl` records never expire.
`store` is a `Map`, anything with `get`/`set`, or
a `Storage` such as `localStorage` (detected by `getItem`; values are JSON under
`prefix + key`, and storage errors are ignored).

On select: a miss traces `skip` (reason `miss`) and rejects with `SkipError`; a hit
whose build differs from a pinned build, or whose provider is excluded or has an open
circuit, rejects with `SkipError` without a trace event; otherwise it traces
`{ type: "ok", provider: <cache name>, url, cached: true }` and returns the stored
resolution with `cached: true`.

A hit makes no request at all, not even a registry lookup, so a `cache()` over a
persistent `store` serves `react@^19` while offline. The flip side: a range stays pinned to
whatever it resolved to until the record expires (`ttl`) or the store is cleared; a changed
lockfile pin is a different key.

## sri()

```ts
sri(data: BufferSource, algorithm? = "sha384"): Promise<string>
```

`"<algorithm>-<base64 digest>"` via `crypto.subtle`. Throws `TypeError` for an algorithm
other than `sha256`, `sha384`, `sha512`.
