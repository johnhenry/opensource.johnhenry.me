---
title: "Trace events and errors"
description: "Every trace event type with its fields, and every error mport throws or rejects with."
sidebar:
  order: 106
---

## Trace events

Every Resolution has a `trace`; every rejection from `resolve()` carries the same array
as `error.trace`; `onEvent` receives each event as it happens. Every event has
`at` (the router's `now()`).

| `type` | Emitted when | Fields |
|---|---|---|
| `lookup` | a registry lookup starts (not for exact versions, GitHub, pinned versions or `resolveVersions: false`) | `provider: "npm registry" \| "jsr registry"`, `url: "<registry>:<name>@<range or latest>"` (a label, not a URL) |
| `resolved` | the lookup chose a version | `provider`, `url`, `version`, `ms` |
| `fail` (no phase) | the lookup failed | `provider`, `url`, `ms`, `error` |
| `skip` | a provider declined without a request; a cache missed | `provider`, `reason` |
| `selected` | `probe: "none"` chose a provider without checking it | `provider`, `url` |
| `probe` | a probe starts | `provider`, `url` |
| `ok` | the probe succeeded, or a cache hit | `provider`, `url`, `ms`; cache hits: `cached: true`, no `ms` |
| `fail` (no phase) | the probe failed | `provider`, `url`, `ms`, `error` |
| `aborted` | a race loser's probe was cancelled, or finished after the race was decided | `provider`, `url`, `ms`; `reason: "lost the race"` for the late finisher |
| `fail`, `phase: "integrity"` | `verified()` got bytes with the wrong hash | `provider`, `url`, `error: "expected …, got …"` |
| `fail`, `phase: "import"` | `router.import()` failed to import a resolved URL. **`onEvent` only**, not in a trace. | `provider`, `url`, `error` |

A typical fallback where esm.sh is down:

```
lookup:npm registry → resolved:npm registry → probe:esm.sh → fail:esm.sh → skip:jsr (no npm support) → probe:jsdelivr → ok:jsdelivr
```

## Errors

| Error | Extends | Thrown or rejected when | Notes |
|---|---|---|---|
| `ResolutionError` | `Error` | a registry lookup fails: the fetch itself throws (in browsers an unknown npm package's 404 has no CORS header and looks like this; the message says so), the registry answers 404 (`not found in the registry`) or another non-OK status, no version satisfies the range, or the range is neither a dist-tag nor valid; `router.build()` meets an unroutable or unmatched specifier | Propagates through `fallback()` and `race()` at once: no provider is blamed or put in its circuit. The fetch case has the original error as `cause`. |
| `RoutingError` | `AggregateError` | `fallback()` or `race()` ran out of providers; `router.import()` exhausted its mirrors after an import failure | `errors` holds each provider's (or import's) error, `SkipError`s included |
| `SkipError` | `Error` | a node declined without trying | Normally ends up in a `RoutingError`'s `errors`; reaches the caller directly when the route is a single provider, cache or `prefer()` |
| `IntegrityError` | `Error` | `verified()` got a non-OK response or a hash mismatch | As above: collected by `fallback()` / `race()`, direct from a lone `verified()` |
| `TypeError` | | an invalid specifier ([parseSpecifier](/mport/api/specifiers/#parsespecifier)); a string inside a strategy; a non-node argument to a strategy; `provider()` without `url`; an unsupported `sri` algorithm; a bad duration string | Synchronous for strategy/provider construction |
| `Error` | | `jsr({ via: "jsr.io" })` without a path; a prefix specifier on `jsDelivr({ esm: true })`; the CLI's usage errors | |
| `signal.reason` | | the caller's `AbortSignal` aborted | Whatever you passed to `abort()` (a `DOMException` `AbortError` by default) |

`resolve()` attaches `trace` to whatever object it rejects with. All four mport classes
are exported, so `instanceof` works; `error.name` is the class name.
