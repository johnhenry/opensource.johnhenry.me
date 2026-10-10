---
title: "Reading a form"
description: "obfo(element, options): containers, keys, data-obfo-value, every data-obfo-cast, buttons and the submitter, and the cast, container, submit and parse options."
sidebar:
  order: 1
---

`obfo(element, options?)` reads `element` and returns its value. `element` is usually a form with
`data-obfo-container`, but any element works: called on a single input, `obfo` returns that input's value (and called
on a button, `undefined`).

## Containers: `data-obfo-container`

`data-obfo-container="{}"` makes an object, `data-obfo-container="[]"` an array. An element is a direct child of a
container when it is an input (`input`, `textarea`, `select`), has `data-obfo-value`, or has its own
`data-obfo-container`, and no other container sits between them. Everything else (`label`, `div`, `fieldset`, `legend`,
`h2`) is transparent: obfo looks through it at its children.

```html
<form id="fo" data-obfo-container="{}">
  <h1>Profile</h1>
  <label>First <input name="first" value="Jon" /></label>
  <fieldset data-obfo-container="{}" data-obfo-name="address">
    <legend>Address</legend>
    <input name="city" value="Anytown" />
  </fieldset>
  <div data-obfo-container="[]" data-obfo-name="tags">
    <input value="JavaScript" />
    <input value="HTML" />
  </div>
  <button type="submit">Save</button>
</form>
```

```js
obfo(document.getElementById("fo"));
// { first: "Jon", address: { city: "Anytown" }, tags: ["JavaScript", "HTML"] }
```

- **In a `{}` container** every direct child needs a key: its `name`, else its `data-obfo-name`. One with neither makes
  `obfo` throw `data-obfo-name is required for nested objects`. When two children share a key, the last one wins
  (radio groups read with `cast: "auto"` are the exception).
- **In a `[]` container** children are pushed in document order and their keys are ignored. Arrays of arrays and arrays
  of objects nest the same way.
- **The root needs a container.** Without `data-obfo-container` on the element you pass (and without the `container`
  option), `obfo` returns `null`.
- **A container value other than `{}` or `[]`** reads as `null`, and its children aren't read.

## Text values: `data-obfo-value`

`data-obfo-value` makes any element a value: its text (`innerText`, so a browser collapses whitespace the way it renders
it). Give it a `data-obfo-name` inside a `{}` container.

```html
<p data-obfo-value data-obfo-name="note">Call after <b>five</b></p>
```

reads as `note: "Call after five"`.

## Buttons and the submitter

Buttons never carry data: `button` elements and `input` elements of type `submit`, `image`, `button` and `reset` are
skipped. The exception is the button you pass as `options.submit`, read like an input, which is how a form with
several submit buttons tells you which one was used:

```js
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = obfo(form, { submit: event.submitter }); // includes the clicked button's name: value
});
```

`input type="button"` and `type="reset"` are skipped from `@johnhenry/obfo` 0.0.0 on; obfo 0.0.9 read their labels.

## Casts: `data-obfo-cast`

Without a cast, a value is the input's `value` string. `data-obfo-cast` changes that per element:

| Cast | Value |
| --- | --- |
| `string` | The value as is (the default). |
| `checkbox` / `radio` | On a checkbox or radio, its `checked` state; on anything else, `Boolean(value)`. |
| `number` | `Number(value)`, so an empty input reads as `0`. |
| `bigint` | `BigInt(value)`; throws a `SyntaxError` on text that isn't an integer. |
| `date` | `new Date(value)`. |
| `file` | On `input[type=file]`, the first `File` or `null`; throws on other elements. |
| `files` | On `input[type=file]`, its `FileList`; throws on other elements. |
| `null` | `null`. |
| `undefined` | `undefined` (the key is still present). |
| `auto` | A value typed by the input's `type`: see [Typed values](/obfo/typed-values/). |
| *(empty)* | The input's `type` used as the cast: a checkbox reads `checked`, a number input a number, a date input a `Date`; other types read their string. |

Any other cast name reads the plain string, unless your `parse` option handles it.

## Options

| Option | Default | Does |
| --- | --- | --- |
| `cast` | none | The cast for elements without `data-obfo-cast`. `"auto"` types the whole form. An element's own attribute always wins. |
| `container` | none | `"{}"` or `"[]"`: the container for a root element that has no `data-obfo-container`. The root's own attribute wins. |
| `submit` | none | The submitting button, read like an input instead of skipped. |
| `parse` | `defaultParse` | `(element, cast) => value`, called for every input. `cast` is the element's `data-obfo-cast`, else `options.cast`, else `null`. |

A custom `parse` can add casts of its own and fall back to the built-in ones:

```js
import obfo, { defaultParse } from "@johnhenry/obfo";

const parse = (element, cast) =>
  cast === "upper" ? element.value.toUpperCase() : defaultParse(element, cast);

obfo(form, { parse }); // inputs with data-obfo-cast="upper" read in capitals
```

`parse` decides values only. Which elements are read, and how radio groups collapse under `cast: "auto"`, is decided
before it is called.
