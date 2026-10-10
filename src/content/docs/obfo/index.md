---
title: "obfo"
description: "Convert HTML forms into nested JavaScript objects and back: read a form as an object, fill a form from one, observe a form's object as it is edited, and generate a form for a JSON value."
sidebar:
  order: 0
---

**`@johnhenry/obfo`** (Object Form) converts HTML forms into nested JavaScript objects, and back. It reads the structure
you mark up with a few `data-obfo-*` attributes: `{}` and `[]` containers become objects and arrays, inputs become
values, and everything else (labels, headings, layout `div`s) is looked through. The same structure works in the other
direction: `fill` writes an object into a form, `observe` reports the form's object every time it is edited, and
`formFromObject` builds a form for a JSON value.

Zero dependencies. ESM. Runs wherever there is a DOM: browsers, iframes (another realm), and Node 26 or newer
(`engines`) with happy-dom or a similar DOM.

## Traps

Read these before the API. None of them is visible from the type signatures.

- **The root needs a container.** A form without `data-obfo-container` (and without the `container` option) reads as
  `null`, not as an object. Pass `{ container: "{}" }` for plain forms.
- **Every direct child of a `{}` container needs a key.** An input with neither `name` nor `data-obfo-name` makes `obfo`
  throw, and so does a nested container without `data-obfo-name`. Elements in a `[]` container need no key; their names
  are ignored.
- **By default every value is a string, whatever the input.** A checkbox reads its `value` (`"on"`) whether it is
  checked or not, a radio group reads the last radio's value, a number input reads `"20"`. That is obfo's original
  behavior and it stays the default; pass `{ cast: "auto" }` for numbers, booleans, radio groups and arrays
  ([Typed values](/obfo/typed-values/)).
- **`data-obfo-cast` with no value is not `cast: "auto"`.** An empty cast uses the input's `type` as the cast, so a date
  input becomes a `Date` and an empty number input becomes `0`; `auto` keeps dates as strings and reads an empty number
  as `null`.
- **`fill` can't write everything `obfo` reads.** File inputs can't be set by script, and a checkbox read without a
  boolean cast has no state to restore, so both are skipped. Read and fill with the same options.
- **`observe` hears events, not property writes.** `input.value = "x"` from script fires nothing. Use
  `fill(form, value, { dispatch: true })` or dispatch an `input` event.

More in [Limitations and traps](/obfo/limitations/).

## Install

```sh
npm install @johnhenry/obfo
```

Not yet on npm: the first publish of `@johnhenry/obfo` is pending. The published package is still the unscoped
[`obfo`](https://www.npmjs.com/package/obfo) 0.0.9, which reads forms but has none of `fill`, `observe`,
`formFromObject` or `cast: "auto"`.

**Provenance:** previously published as `obfo`, last unscoped version 0.0.9 (2024-07-27). `@johnhenry/obfo` restarts at
`0.0.0` under the family's convention for adopted packages, so the number means "new address", not "new code". Under
npm's caret rules `^0.0.0` matches only `0.0.0`, so pin exactly until a deliberate `0.1.0`.

## Quick start

```html
<form id="profile" data-obfo-container="{}">
  <label>Name <input name="name" value="Jon" /></label>
  <label>Age <input name="age" type="number" value="20" /></label>
  <fieldset data-obfo-container="[]" data-obfo-name="tags">
    <input value="js" />
    <input value="css" />
  </fieldset>
</form>
```

```js
import obfo, { fill, observe } from "@johnhenry/obfo";

const form = document.getElementById("profile");

obfo(form); // { name: "Jon", age: "20", tags: ["js", "css"] }
obfo(form, { cast: "auto" }); // { name: "Jon", age: 20, tags: ["js", "css"] }

fill(form, { age: 21 }, { cast: "auto" }); // writes one field, leaves the rest

const stop = observe(form, (value) => console.log(value), { cast: "auto" });
// ...the user types; each edit logs the whole object once
stop();
```

## The pages here

- [Reading a form](/obfo/reading/): containers, keys, `data-obfo-value`, every `data-obfo-cast`, buttons and the
  submitter, and `obfo`'s options.
- [Typed values](/obfo/typed-values/): what `cast: "auto"` reads from each kind of input.
- [Writing a form](/obfo/fill/): `fill`, how each cast is inverted, and what it skips.
- [Live values](/obfo/observe/): `observe`, its timing, and its options.
- [Generating a form](/obfo/form-from-object/): `formFromObject` for a plain JSON value.
- [Limitations and traps](/obfo/limitations/): untrusted forms, what isn't read, and testing without a browser.

## Examples

The [repository](https://github.com/johnhenry/obfo)'s `examples/` directory holds runnable examples that assert what
they show (`npm run examples`, Node 26 with happy-dom):

| Example | Demonstrates |
| --- | --- |
| `01-a-form-reads-as-a-nested-object.mjs` | `{}` and `[]` containers read as one nested object; labels, headings and a `fieldset`'s `legend` are looked through, and the submit button is ignored unless passed as `options.submit`. |
| `02-auto-cast-gives-numbers-booleans-and-arrays.mjs` | `cast: "auto"` reads numbers, booleans, a radio group's checked value and a multiple select's array, while an element's own `data-obfo-cast` still wins; without it every value is the string obfo 0.0.9 returned. |
| `03-fill-is-the-inverse-of-obfo.mjs` | `fill` writes a value that `obfo` reads back unchanged, and a partial value changes only the fields it names. |
| `04-observe-reports-the-object-as-the-form-is-edited.mjs` | `observe` reports the typed object after each edit, makes one call for a checkbox's `input` + `change`, and goes quiet after unsubscribing. |
| `05-a-form-generated-from-json-reads-back-as-the-same-json.mjs` | `formFromObject` builds a form that `obfo` reads back as the same JSON with no options; an HTML-looking string stays text. |

`examples/demo.html` is a larger browser page, read on submit and live with `observe`.

## Family

obfo turns a form into a value the rest of a reactive page can use. It has no dependencies, and none of these packages
depend on it; they meet in the app.

- **[signalle](/signalle/)**: `observe(form, (value) => { formValue.value = value }, { immediate: true })` keeps a
  signalle `signal` equal to the form's object, so `computed`s and `effect`s downstream update as the user types.
- **[dataflow](/dataflow/)**: for a form that feeds other computations, store the value `observe` reports and call
  `flow.invalidate(id)` in the same callback; dataflow reruns the form's dependents in order and drops stale runs.

Built for the form panes planned for miso, a natto.dev-style spatial notebook: a pane renders a form, and its value is
the form's object.

Source: [github.com/johnhenry/obfo](https://github.com/johnhenry/obfo).
