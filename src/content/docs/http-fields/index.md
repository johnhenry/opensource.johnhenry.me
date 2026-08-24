---
title: "http-fields"
description: "Parse and serialize HTTP Structured Field Values (RFC 8941 & RFC 9651) — strict, zero-dependency, bidirectional."
---

**`@johnhenry/http-fields`** parses and serializes [HTTP Structured Field
Values](https://www.rfc-editor.org/rfc/rfc8941) — the shared grammar that
modern HTTP headers (`Priority`, `Cache-Status`, client hints, …) use instead
of inventing bespoke parsing rules per header. It implements RFC 8941
completely, plus the RFC 9651 extensions (Dates and Unicode Display Strings),
with strict parsing, bidirectional translation, zero dependencies, and full
TypeScript definitions.

> Previously published as `http-fields` (deprecated at 0.1.0). Same library,
> same API — the version line continues under the new name.

## Install

```sh
npm install @johnhenry/http-fields
```

## Quick start

```javascript
import * as HTTPFields from "@johnhenry/http-fields";

// Parse a header value — you say which top-level type it is
HTTPFields.parse('a, b;q=0.9, (c d)', "list");
HTTPFields.parse('key=value, flag', "dictionary");
HTTPFields.parse('"hello";charset="utf-8"', "item");

// Serialize back — canonical form, round-trip safe
HTTPFields.serialize([{ value: 42, parameters: {} }], "list"); // "42"
```

## How types map to JSON

The JSON representation is the heart of the library — most surprises live in
this table, so read it before anything else:

| Field type | Wire example | JSON representation |
| --- | --- | --- |
| Integer | `42` | `42` |
| Decimal | `3.14` | `3.14` |
| String | `"hello"` | `"hello"` |
| Token | `application/json` | `{ type: 'token', value: 'application/json' }` |
| Byte Sequence | `:SGVsbG8=:` | `{ type: 'binary', value: 'SGVsbG8=', decoded: 'Hello' }` |
| Boolean | `?1` / `?0` | `true` / `false` |
| Date (RFC 9651) | `@1672531200` | `{ type: 'date', value: Date }` |
| Display String (RFC 9651) | `%"Hello 世界"` | `{ type: 'displaystring', value: 'Hello 世界' }` |

Two traps worth knowing on day one:

- **Strings and Tokens are different types with different JSON shapes.** A
  quoted `"foo"` becomes a plain JS string; an unquoted token becomes a
  `{ type: 'token' }` wrapper. If you build a value with the wrong shape it
  will serialize as the wrong wire type — quoted when you meant bare, or
  rejected outright.
- **Strict errors are the spec, not a nuisance.** Per RFC 8941, *any* parse
  error fails the whole field, and the correct recovery is to treat the field
  as if it were absent — not to salvage a prefix.

## The pages here

- [API](/http-fields/api/) — `parse`, `serialize`, helpers, error handling
- [Header helpers](/http-fields/headers/) — typed parsers for Priority,
  Cache-Status, Accept-CH, Sec-CH-UA, No-Vary-Search
- [Comparison](/http-fields/comparison/) — vs `structured-headers`, including
  the one deliberate spec deviation each library makes

Source: [github.com/johnhenry/http-fields](https://github.com/johnhenry/http-fields) ·
The test suite runs the official
[httpwg structured-field-tests](https://github.com/httpwg/structured-field-tests)
vectors — 2,214 tests.
