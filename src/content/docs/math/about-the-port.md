---
title: "About the port"
description: "How the AS3-to-TypeScript port that became @johnhenry/math was done, the ~40 real bugs it found and fixed along the way, and the one place it deliberately preserved unverifiable original behavior instead of guessing."
---

`@johnhenry/math` began as a faithful port of the original Mallory
ActionScript 3 library, but it **fixed bugs rather than carrying them over**,
and it took advantage of modern JavaScript/TypeScript: ES classes, generics,
iterators, `Array` subclassing, tagged unions, and `.ts`-native execution.
Every module was translated **test-first** — a test was written against the
original's documented/intended behavior before its TypeScript equivalent
existed, which is how the bugs below were caught rather than silently
reproduced.

## A sampling of the ~40 bugs found and fixed

- **`RealMath.subtract` returned `a * b`.** (Yes, really.)
- **Order statistics were broken:** `sort` used the default *lexicographic*
  sort, so `minimum`/`maximum`/`median` were wrong for numbers.
- **`ComplexMath.divide`** compared `alpha.ivalue` (lowercase `v`, always
  `undefined`), so all eight directed-infinity results were dead code.
- **`ComplexMath.normalDistribution`** reciprocated the whole expression,
  putting the exponential in the denominator (wrong sign) — the normal PDF
  was inverted.
- **`solveN`** wasn't Newton's method — it assumed a derivative of 1 and
  diverged; now a real numeric Newton–Raphson.
- **`integrateN`** sampled at `2·x + interval`; **`differentiateN`** was a
  forward difference despite claiming to be symmetric.
- **`invertMatrix`** had no pivoting (divide-by-zero on a zero pivot); now
  uses partial pivoting (and a zero-pivot row swap in `Structure`, for
  finite fields).
- **`crossProduct`** read index 3 for the z-component and used truthiness
  tests that dropped zero components; **`powerMatrix`** never actually
  multiplied.
- **`Vector.setElement`** infinitely recursed on a falsy slot.
- **`ComplexNumber` string parsing** crashed on non-matches and couldn't
  round-trip negative imaginary parts; it also swallowed every `*`, so
  `"4*2"` parsed as `42`.
- **`StringEvaluator`** was uniformly right-associative
  (`10-2-3 → 11`); now left-associative for `+ - * / %` and
  right-associative for `^`.
- **`Polynomial.multiply`** referenced a non-existent `dimension.value`;
  **`Polynomial.antiderivative`** dropped its highest-degree term.
- **`IntegerMath.modulus`** recursed one step at a time (stack overflow);
  `primeFactors` infinite-looped on `0` and negatives.
- **`Structure`**'s matrix section was non-functional (static/instance
  confusion, undefined references) and is reconstructed as working generic
  linear algebra.
- `IntUtils` spelled "forty" and "ninety" as "fourty" and "ninty".

## Where the original had no verifiable intended behavior

One area — the Flash 3D ribbon geometry in `Graph3DUtils` — had no
recoverable specification: no test, no comment, no reference implementation
to check against, just a block of matrix math whose intended output couldn't
be independently verified. Rather than "fix" it by guesswork, the math is
ported **verbatim**, with an explicit note in the source marking it as such.
The Flash rendering utilities (`GraphUtils`/`Graph3DUtils`) more broadly now
return renderer-agnostic geometry — 2D paths, 3D meshes, as plain data —
instead of Flash display objects, since there's no Flash runtime to hand
those to anymore.

That distinction matters for how to read the rest of this history: everywhere
else, a fix means the original's *documented or inferable intent* was
identifiably violated by its own code, and the test written against that
intent is what proves the fix is correct — not a preference for "better"
math.

This is a snapshot of the port as it happened, not a description of
`@johnhenry/math`'s current API — the library has grown substantially since
(`CellGraph`, `Rotor4`, exact-fraction and interval arithmetic, and more; see
[the main page](/math/math/) for what's actually in it today).
