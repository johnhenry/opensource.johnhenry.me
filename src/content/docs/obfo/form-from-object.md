---
title: "Generating a form"
description: "formFromObject(value, options): a simple form for a plain JSON value that obfo reads back as the same value, with data set as attributes and text, never HTML."
sidebar:
  order: 5
---

`formFromObject(value, options?)` builds a simple form for a plain JSON value, and `obfo` reads it back as the same
value with no options:

```js
import obfo, { formFromObject } from "@johnhenry/obfo";

const form = formFromObject({ title: "Notes", count: 3, done: false, tags: ["a", "b"], owner: null });
document.body.append(form);
obfo(form); // { title: "Notes", count: 3, done: false, tags: ["a", "b"], owner: null }
```

## What it builds

| Value | Element |
| --- | --- |
| object | A `fieldset` with `data-obfo-container="{}"` and a `legend` (the root is the `form` itself). |
| array | A `fieldset` with `data-obfo-container="[]"`; items are labelled `[0]`, `[1]`, ... |
| string | `input type="text"`, or a `textarea` when it contains a line break. |
| number | `input type="number" step="any"` with `data-obfo-cast="number"`. |
| boolean | `input type="checkbox"` with `data-obfo-cast="checkbox"`. |
| `null` | `input type="hidden"` with `data-obfo-cast="null"`. |

Every leaf is wrapped in a `label` with its key, and carries `name` and `data-obfo-name`. Because each input carries
the cast that reads it back, the form round-trips under the default cast and under `cast: "auto"` alike, and
[`fill`](/obfo/fill/) can write a new value of the same shape into it.

## Rules

- **The root must be a plain object or an array.** A primitive, a class instance or a `Date` at the root throws a
  `TypeError`.
- **Only JSON.** Keys whose value is `undefined` are left out and `undefined` array items become `null`, as
  `JSON.stringify` does. Anything else that isn't JSON (a `Date`, a `Map`, `NaN`, `Infinity`, a function, a `bigint`, a
  symbol) throws a `TypeError` naming its path (`a.b[1] is NaN`).
- **Data never becomes markup.** Keys and values are set with `setAttribute` and `textContent`, never parsed as HTML. A
  key named `__proto__` round-trips as an ordinary own property.
- **A document is needed.** `options.document` is the document to create elements in; it defaults to the global
  `document`, and in Node you pass a happy-dom or jsdom document.
- **Line breaks normalize.** A `textarea` returns `\n` for line breaks, so a lone `\r` doesn't survive.

The form is unstyled and has no submit button: a starting point for an "input form generated from data", to style,
`fill` and `observe`.
