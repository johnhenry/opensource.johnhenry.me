---
title: "Strategies"
description: "fallback, race, adaptive, prefer, verified and cache: composable nodes that decide which provider serves an artifact, and how candidates are probed."
sidebar:
  order: 5
---

Strategies are nodes that can be nested inside each other in any combination:

```js
route("npm:*",
  fallback(
    cache(),
    race(verified(esmSh()), verified(jsDelivr({ esm: true }))),
    unpkg(),
  ),
);
```

| # | Strategy | What it does |
|---|---|---|
| 1 | static: a single provider | Always the same destination. Use `probe: "none"` for a pure build-time mapping |
| 2 | `fallback(a, b, c)` | Try each in order. Nodes that can't serve the request are skipped (wrong registry, wrong build, excluded, circuit open) |
| 3 | `race(a, b, c)` | Probe all at once. The first **success** wins and the others are aborted. One fast failure no longer sinks the race |
| 4 | `adaptive([a, 5], weighted(b, 3), c)` | Order by weight × success rate ÷ latency, then fall back through that order. Deterministic for a given health state |
| 5 | build locking (from the lockfile) | The same artifact from many mirrors: only mirrors with the same `build` may serve a locked package |
| 6 | `fallback({ providers, circuitBreaker: { failures: 3, reset: "30s" } })`, or the router's `circuitBreaker` option | Health-aware failover. After *n* failures in a row a provider is skipped until `reset` has passed |
| 7 | `prefer({ browser: esmSh(), raw: jsDelivr(), default: unpkg() })`, or the `capabilities` option | Choose by target or capability. `resolve(spec, { target: "raw" })` |
| | `verified(node)` | Fetches the chosen URL, computes its SRI hash, and rejects on a mismatch with the lockfile (or `integrity`). Wrap each mirror so a bad one fails over: `race(verified(a), verified(b))` |
| | `cache({ store, ttl? })` | Reuses remembered resolutions without probing or any network request, keyed by the specifier as written (works offline). `store` is a `Map` (the default) or `localStorage`; `ttl` expires records |

## Probing

How the router checks that a candidate URL is available:

| `probe` | Behaviour |
|---|---|
| `"head"` (default) | `HEAD` request, falling back to `GET` on 405/501. Works in Node, so it suits build time |
| `"import"` | Actually `import()`s the URL and returns the module. Browser or Deno |
| `"none"` | Trust the first candidate. Static routing; records no health data |
| function | `(url, { provider, signal }) => Promise<{ module? }>` |
