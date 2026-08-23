---
title: '@johnhenry/math'
description: Advanced college-level mathematics for TypeScript — geometry, linear algebra, complex numbers, intervals, and rotors.
---

```bash
npm install @johnhenry/math
```

A broad mathematics library in modern TypeScript, originally ported from an ActionScript 3 library and since extended well past it.

## What's in it

**Numbers** — `ComplexNumber`, `Rational` (exact fractions), `Decimal` (arbitrary precision), and `Interval`.

**Geometry** — points, lines, circles, polygons, angle computation, transforms, and constraint solving.

**Linear algebra** — `Vector` and `Matrix` with decompositions, plus `Rotor4` for 4-dimensional rotation (`exp`, `log`, `inverse`, `slerp`, `factor`, `renormalize`).

**Symbolic** — expression parsing and evaluation, differentiation, and simplification.

**Reactive** — `CellGraph`, a pull-based dependency graph with `set`/`define`/`get`/`hasValue`/`subscribeAll`/`transaction` and cycle detection via `CircularDependencyError`. It's the engine behind [`math-grapher`](/math/math-grapher/).

## Interval arithmetic rounds outward

`Interval` is not a convenience wrapper around two numbers. Every non-exact operation widens the result by roughly one unit-in-the-last-place per side, using `nextUp`/`nextafter`-style bit manipulation on the float representation.

That means a computed interval is a genuine enclosure: the true real-valued result is guaranteed to lie inside it, even after a long chain of operations accumulates rounding error. The bounds get looser than a naive implementation's — that looseness is the correctness.

## Angles beyond 180°

`interiorAngleRadians(a, vertex, c, mode)` takes an `AngleMode` of `"shorter" | "clickOrder" | "reflex"`, unified through `angleSweepRadians(theta1, theta2, mode)`.

The default `"shorter"` gives the conventional ≤180° interior angle. `"clickOrder"` sweeps from the first argument to the second in the order given, which can exceed 180°. `"reflex"` always takes the larger sweep. If you're measuring a reflex angle in a polygon, the default will quietly give you its complement.

## Related

`@johnhenry/math-prototype-patch` adds `ComplexNumber` fluent arithmetic onto `Number.prototype`. It is **opt-in, collision-checked, and deliberately never merged into core** — read its README before reaching for it.
