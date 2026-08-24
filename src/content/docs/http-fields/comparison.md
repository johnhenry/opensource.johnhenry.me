---
title: "Comparison"
description: "vs structured-headers — and the one deliberate spec deviation each library chose."
---

The established alternative is
[`structured-headers`](https://www.npmjs.com/package/structured-headers).
Both are solid, zero-dependency implementations of the same RFCs; the
interesting difference is a corner of the spec where they made *opposite*
deliberate calls.

## The whole-number decimal problem

RFC 8941 requires `1.0` to survive a round-trip as a **decimal** — but
JavaScript has one number type, so `1.0` *is* `1`, and a naive serializer
emits the integer `1`. Each library picked a different loss:

- **structured-headers** keeps every number a plain `number`, and documents
  two deviations: the official vectors requiring `1.0` output are skipped,
  and `0.0025` rounds to `0.003` (float rounding instead of the spec's
  round-half-to-even).
- **`@johnhenry/http-fields`** wraps *only* whole-valued decimals —
  `parse("1.0", "item")` → `{ value: { type: "decimal", value: 1 } }` while
  `3.14` stays a plain number — and implements string-based
  round-half-to-even. The full official suite passes with **no skips**.

Neither call is wrong; they trade a wrapper type against two spec deviations.
If you need byte-exact canonical output (proxies, signatures, caches —
anywhere two implementations must agree), the no-skips property is the one
that matters.

## Shape of the API

```javascript
// @johnhenry/http-fields — one entry point, plain JSON
import { parse } from "@johnhenry/http-fields";
parse('"Hello world"; a="5"', "item");
// { value: "Hello world", parameters: { a: "5" } }
```

`structured-headers` exposes per-type functions returning RFC-shaped tuples
and `Map`s — closer to the spec's own model, further from what
`JSON.stringify`, deep-equal, and structured logging want.

## Choose which

- **structured-headers**: CommonJS builds, RFC-literal data structures,
  plain `number`s everywhere, longer production track record.
- **`@johnhenry/http-fields`**: full canonical conformance with no skipped
  vectors, plain-JSON structures, a single parse/serialize entry point, and
  the [typed header helpers](/http-fields/headers/).

Both run the official
[httpwg structured-field-tests](https://github.com/httpwg/structured-field-tests)
vectors. The comparison was performed against `structured-headers@2.0.3` and
`http-fields@0.1.0` and may drift as either evolves; the fuller version with
test-count methodology lives in the repo's
[COMPARISON.md](https://github.com/johnhenry/http-fields/blob/main/COMPARISON.md).
