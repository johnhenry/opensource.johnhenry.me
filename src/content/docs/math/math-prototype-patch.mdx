---
title: '@johnhenry/math-prototype-patch'
description: An opt-in, collision-checked Number.prototype patch adding math's ComplexNumber fluent arithmetic to plain numbers.
---

```bash
npm install @johnhenry/math-prototype-patch
```

An **opt-in** patch of `Number.prototype` with [`@johnhenry/math`](/math/)'s `ComplexNumber` fluent arithmetic/trig methods, so a plain JS number can participate directly in complex arithmetic:

```ts
import { ComplexNumber } from '@johnhenry/math';
import { patchNumberPrototype } from '@johnhenry/math-prototype-patch';

patchNumberPrototype();

(3).add(new ComplexNumber(1, 2)); // ComplexNumber(4, 2) — instead of new ComplexNumber(3).add(...)
(2).power(ComplexNumber.I); // 2^i, ComplexNumber(0.7692389013, 0.6389612763)
```

## Read this before calling `patchNumberPrototype()`

`Number.prototype` is shared, process-wide, mutable state. Calling `patchNumberPrototype()` anywhere changes what `(3).add` means for **every module that runs afterward** — not just the file that called it, and not just code that imported this package. That's a categorically bigger risk than adding a method to `ComplexNumber` itself, which is exactly why this lives in a separate opt-in package rather than `@johnhenry/math` core ([design discussion](https://github.com/johnhenry/math/issues/28)).

Nothing runs on import — the mutation happens only when you explicitly call `patchNumberPrototype()`.

## Collision safety

Before patching, it checks every method name it's about to add against `Number.prototype`'s existing own properties. If **any** already exist — another library, a polyfill, a previous unrelated call — it throws `NumberPrototypeCollisionError` naming exactly which ones, and adds **nothing** (all-or-nothing, never a partial patch). Calling it again while *this* package's own patch is already active is a no-op, not a self-collision.

```ts
import { NumberPrototypeCollisionError, patchNumberPrototype } from '@johnhenry/math-prototype-patch';

try {
  patchNumberPrototype();
} catch (e) {
  if (e instanceof NumberPrototypeCollisionError) {
    console.error("Can't patch, already defined:", e.collidingNames);
  }
}
```

## Undoing it

```ts
import { unpatchNumberPrototype, isNumberPrototypePatched } from '@johnhenry/math-prototype-patch';

unpatchNumberPrototype(); // removes exactly what patchNumberPrototype() added; no-op if not patched
isNumberPrototypePatched(); // false
```

## Patched methods

`add`, `subtract`, `multiply`, `divide`, `power`, `conjugate`, `reciprocal`, `magnitude`, `angle`, `neg`, `sine`, `cosine`, `tangent`, `squareRoot`, `logarithm`, `toComplexNumber` — mirroring `ComplexNumber`'s own fluent surface. All are defined non-enumerable, so they won't show up in `for...in`/`Object.keys` over a number.

## TypeScript

Calling `patchNumberPrototype()` doesn't change what TypeScript thinks `Number.prototype` looks like. `(3).add(...)` won't type-check unless you *also* opt into the ambient type augmentation, as a separate import:

```ts
import '@johnhenry/math-prototype-patch/global'; // ambient `interface Number { add(...): ComplexNumber; ... }`
import { patchNumberPrototype } from '@johnhenry/math-prototype-patch';

patchNumberPrototype();
const z = (3).add(1); // now type-checks as ComplexNumber, no cast needed
```
