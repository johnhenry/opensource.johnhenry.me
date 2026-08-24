---
title: "API"
description: "parse, serialize, helper constructors, and RFC-strict error handling."
---

## `parse(fieldValue, fieldType)`

```javascript
import * as HTTPFields from "@johnhenry/http-fields";

HTTPFields.parse('a, (b c);q=0.5', "list");
HTTPFields.parse('cache=hit, ttl=545', "dictionary");
HTTPFields.parse(':SGVsbG8=:;label="greeting"', "item");
```

`fieldType` is one of `"list"`, `"dictionary"`, `"item"` — you must know which
top-level type a header is defined as (its RFC says). There is no guessing
mode, because the same bytes can be valid as more than one type.

Every member carries `{ value, parameters }`; inner lists nest an array in
`value`. See the [type table](/http-fields/#how-types-map-to-json) for how each
bare type is represented.

## `serialize(jsonValue, fieldType)`

The inverse. Produces canonical wire form — parse → serialize → parse is
stable, and the serializer enforces the same constraints as the parser
(integer range, decimal precision, ASCII-only strings, token grammar), so
invalid structures throw rather than emitting invalid headers.

## Helper constructors

For building values without hand-writing the wrappers:

```javascript
const { token, binary, date, displayString } = HTTPFields;

HTTPFields.serialize(
  [{ value: token("application/json"), parameters: { q: 0.9 } }],
  "list"
);
```

TypeScript users get full definitions plus runtime type guards
(`isToken`, `isBinary`, …) — the `examples/typescript-usage.ts` file in the
repo is the canonical consumer.

## Error handling

RFC 8941 §4.2 requires strict failure: one bad member fails the entire field.

```javascript
try {
  HTTPFields.parse("invalid[syntax", "list");
} catch (error) {
  // Correct recovery per spec: behave as if the header was not present.
}
```

Common causes: invalid token characters, unterminated quotes, numbers out of
range (integers beyond ±999,999,999,999,999; decimals past 12 integer / 3
fractional digits), bad base64, malformed inner lists or parameters.

The trap: **do not** "salvage" the parseable prefix of a bad field. Two
implementations that disagree about salvage behavior are a request-smuggling
vector — strictness here is a security property, not pedantry.
