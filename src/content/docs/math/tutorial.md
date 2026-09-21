---
title: "Tutorial: your first iteration pipeline"
description: "Install @johnhenry/iteration, build one composed transducer pipeline, and run one bounded-concurrency async pipeline — no build step, plain Node."
---

The `@johnhenry/math` family has several packages; this tutorial picks one approachable entry point and works through it end to end: `@johnhenry/iteration`. It's the most mature package in the family (shipped for years under two earlier names) and the one most people reach for first — sync and async iterator algebra with zero runtime dependencies. If you came here for the math package itself (complex numbers, symbolic calculus, linear algebra over arbitrary structures), see [its own examples](https://github.com/johnhenry/math/tree/main/examples) once you're done — the install and run steps are the same shape.

Takes about 5 minutes. Plain Node, no build step, no TypeScript required (though it's fully typed if you use it).

## 1. Install

```sh
npm install @johnhenry/iteration
```

## 2. A composed pipeline, no intermediate arrays

Create `pipeline.mjs`:

```js
import { transduceSync } from "@johnhenry/iteration";
import { pairwiseSync } from "@johnhenry/iteration/itertools";
import { filter, map, take } from "@johnhenry/iteration/transducers";

// One composed transformation: add 2, keep the odd ones, take the first 4.
// transduceSync fuses all three steps into a single pass — no array is
// allocated between map, filter, and take.
const transformation = transduceSync(
  map((x) => x + 2),
  filter((x) => x % 2),
  take(4),
);
console.log([...transformation([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]);

// Python-itertools-parity helpers work on any iterable, lazily.
console.log([...pairwiseSync([1, 2, 3, 4])]);
```

Run it:

```sh
node pipeline.mjs
```

You should see:

```
[ 3, 5, 7, 9 ]
[ [ 1, 2 ], [ 2, 3 ], [ 3, 4 ] ]
```

Trace it by hand to check: `1..10`, add 2 → `3..12`, keep odd → `3,5,7,9,11`, take 4 → `3,5,7,9`. That's the first line. The second is every adjacent pair from `[1,2,3,4]`.

## 3. Bounded concurrency on the async side

The library is half sync, half async, with a matching API on both sides. Create `async-pipeline.mjs`:

```js
import { mapConcurrentAsync } from "@johnhenry/iteration";

// Six "tasks" with different delays, run at most 3 at a time, results
// collected in ORIGINAL INPUT ORDER even though they finish out of order.
const delays = [30, 10, 20, 40, 5, 15];
const results = [];
for await (const r of mapConcurrentAsync(
  (ms) => new Promise((resolve) => setTimeout(() => resolve(ms), ms)),
  delays,
  { concurrency: 3 },
)) {
  results.push(r);
}
console.log(results);
```

Run it:

```sh
node async-pipeline.mjs
```

You should see:

```
[ 30, 10, 20, 40, 5, 15 ]
```

Note that's the *input* order, not the order the delays would finish in (`5` finishes fastest, `40` slowest) — `mapConcurrentAsync` runs up to 3 promises in flight at once but reassembles results positionally, so you get input-order output without giving up concurrency.

## What just happened

- `transduceSync` composes `map`/`filter`/`take` into one function that walks the source iterable exactly once — the same idea as `Array.prototype.map().filter()` but without building an intermediate array at each step, and it works the same way over async iterables (`transduceAsync`, not shown here).
- `pairwiseSync` is one of a full Python-`itertools`-parity set (`chain`, `cycle`, `islice`, `groupby`, `tee`, `product`, `permutations`, …) available under `@johnhenry/iteration/itertools` for both sync and async iterables.
- `mapConcurrentAsync` is the library's answer to "run N async things at once without unbounded fan-out" — a common hand-rolled pattern here handled correctly, including preserving input order under concurrency.

## Where to go next

- [`@johnhenry/iteration`](/math/iteration/) — this page's full reference.
- [`packages/iteration/docs/`](https://github.com/johnhenry/math/tree/main/packages/iteration/docs) — a full Diátaxis tree plus a 1100-line reference, including channels and cancellation, not covered here.
- [Which package do I want?](https://github.com/johnhenry/math#which-package-do-i-want) — if you're actually here to do mathematics (complex numbers, symbolic calculus, linear algebra) rather than iterate over things, `@johnhenry/math` itself is the package you want; its own [`examples/`](https://github.com/johnhenry/math/tree/main/examples) are the next stop.
