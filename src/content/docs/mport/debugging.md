---
title: "Debugging: traces and events"
description: "Every resolution carries a trace of what was tried; stream events with onEvent and read provider health."
sidebar:
  order: 8
---

Every resolution carries a trace of what was tried:

```js
const r = await router.resolve("react@^19");
r.trace;
// [ { type: "lookup",   provider: "npm registry", url: "npm:react@^19" },
//   { type: "resolved", provider: "npm registry", version: "19.2.0", ms: 38 },
//   { type: "probe", provider: "esm.sh",   url: "https://esm.sh/react@19.2.0" },
//   { type: "fail",  provider: "esm.sh",   ms: 212, error: "… responded 503" },
//   { type: "skip",  provider: "jspm",     reason: 'serves build "jspm", locked to "npm"' },
//   { type: "probe", provider: "jsdelivr", url: "…" },
//   { type: "ok",    provider: "jsdelivr", ms: 41 } ]
```

Event types are `lookup` / `resolved` (a registry lookup that turned a range into a version), `probe`, `ok`, `fail`, `skip` (with a `reason`), `aborted` (a race loser; an `import` probe that finishes after the race was decided is reported as `aborted` with `reason: "lost the race"`), and `selected` (with `probe: "none"`: the provider was chosen without checking the URL, so no health data is recorded either). Failed resolutions attach the same list as `error.trace`. The full table: [API › Trace events](/mport/api/trace-and-errors/#trace-events).

Resolutions that can't happen at all, such as an unknown package, an unknown dist-tag or an impossible range, reject with a single `ResolutionError`. No CDN is blamed or put in its circuit.

To stream events, pass `onEvent` to `createRouter` or to a single `resolve`/`import` call. `router.import()` also reports `{ type: "fail", phase: "import" }` when a resolved URL fails to load and it moves to another mirror.

`router.health.snapshot()` returns per-provider counts, latency and circuit state. Pass `health: otherRouter.health` to `createRouter` to share that state between routers.

In the v1 API, `MPortURL` returns this as a third tuple element, so existing destructuring keeps working:

```js
const [module, url, info] = await MPortURL()("lodash-es@4.17.21/lodash.js");
info.provider; // "ga.jspm.io/npm:"
info.trace;    // every probe in the race
```
