---
title: "Writing a form"
description: "fill(element, value, options): write a nested object into a form, the inverse of obfo. Partial values, how each cast is inverted, what is skipped, and dispatch: true."
sidebar:
  order: 3
---

`fill(element, value, options?)` walks the same structure `obfo` reads and writes `value` into it, then returns
`element`. Read back with the same options, a filled form gives you the value you wrote.

```js
import obfo, { fill } from "@johnhenry/obfo";

fill(form, { name: "Ada", age: 36, admin: true, tags: ["math", "engines"] }, { cast: "auto" });
obfo(form, { cast: "auto" }); // { name: "Ada", age: 36, admin: true, tags: ["math", "engines"] }
```

Pass the read options you read with (`cast`, `container`, `submit`): they decide which elements are walked and how each
value is inverted.

## What it writes

- **Only what is present.** Keys missing from `value`, and array indexes past its end, leave their inputs as they are,
  so `fill(form, { age: 37 })` changes one field. Only own properties count: an input named `constructor` or `toString`
  is not filled from `Object.prototype`.
- **No new elements.** An array container holds as many values as it has inputs; extra items are ignored. A value whose
  shape doesn't match (a string where the form has a container) is ignored rather than thrown.
- **Text for text.** `null` and `undefined` clear a text input; anything else is `String(value)`. `data-obfo-value`
  elements get `textContent`, never HTML.

## How each cast is inverted

| Read as | `fill` does |
| --- | --- |
| `checkbox` / `radio` cast, or `auto` on a checkbox | Sets `checked` from the value's truthiness. On a non-toggle input, sets a truthy (`"on"`) or empty value. |
| `auto` on a radio | Checks the radio whose `value` equals the value; `null` unchecks the group. |
| A multiple select (any cast) | Selects exactly the listed values. |
| A `Date` value | Formats it for the input: `YYYY-MM-DD` for `date` (UTC, as `new Date("YYYY-MM-DD")` reads it), `YYYY-MM` for `month`, local `HH:MM` for `time` and local `YYYY-MM-DDTHH:MM` for `datetime-local`; an ISO string elsewhere. |
| `number`, `bigint`, `string`, `auto` on text | `String(value)`. |

## What it skips

- **File inputs.** Browsers don't let script set them.
- **`null` and `undefined` casts.** There is no value to write.
- **Checkboxes and radios without a boolean cast.** Read with the default cast, a checkbox reads its `value` whatever
  its state, so a read value says nothing about `checked`: `fill` leaves them alone rather than check every box on a
  round trip. Read and fill them with `cast: "auto"` or `data-obfo-cast="checkbox"`.
- **Buttons**, except the one passed as `options.submit`.

## Events: `dispatch: true`

By default `fill` fires no events, so code that listens for edits (including [`observe`](/obfo/observe/)) doesn't hear
it, and a value written by the app doesn't loop back as a user edit. `{ dispatch: true }` fires `input` and then
`change` (both bubbling, created from the element's own window) on every element whose value actually changed.
