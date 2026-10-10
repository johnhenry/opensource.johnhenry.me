---
title: "Typed values"
description: "cast: \"auto\": numbers for number and range inputs, booleans for checkboxes, a radio group as its checked value, multiple selects as arrays, dates as strings, files as File arrays."
sidebar:
  order: 2
---

`obfo(form, { cast: "auto" })`, or `data-obfo-cast="auto"` on one element, reads each input by its type:

| Element | Value |
| --- | --- |
| `type="number"`, `type="range"` | A number; an empty input is `null`, not `0`. |
| `type="checkbox"` | `true` or `false`. |
| `type="radio"` | Radios sharing a name in a `{}` container are one key: the checked radio's `value`, or `null` when none is checked. |
| `select multiple` | An array of the selected options' values. |
| `type="date"`, `time`, `datetime-local`, `month`, `week` | The value string, as the input holds it (`"2000-01-01"`). |
| `type="file"` | An array of `File`s, empty when nothing is chosen. |
| `data-obfo-value` elements, everything else | The text or value string. |

```html
<form id="fo" data-obfo-container="{}">
  <input name="age" type="number" value="20" />
  <input name="subscribe" type="checkbox" checked />
  <input name="size" type="radio" value="s" />
  <input name="size" type="radio" value="m" checked />
  <select name="tags" multiple>
    <option selected>js</option>
    <option>css</option>
    <option selected>html</option>
  </select>
  <input name="born" type="date" value="2000-01-01" />
</form>
```

```js
obfo(document.getElementById("fo"), { cast: "auto" });
// { age: 20, subscribe: true, size: "m", tags: ["js", "html"], born: "2000-01-01" }

obfo(document.getElementById("fo"));
// { age: "20", subscribe: "on", size: "m", tags: "js", born: "2000-01-01" }
// (the original behavior: strings, the checkbox's value whatever its state,
//  the last radio's value, the select's first selected option)
```

## Why it is opt-in

obfo has always read strings, and forms written for it rely on that. `cast: "auto"` changes values without touching the
markup, so it is an option rather than a new default; an element's own `data-obfo-cast` still wins over it, which lets
you keep one field a string (`data-obfo-cast="string"`) or make one a `Date` (`data-obfo-cast="date"`).

## Details

- **Dates stay strings.** `auto` keeps what the input holds, so the value is stable, serializable and timezone-free. An
  empty `data-obfo-cast` on a date input, by contrast, gives `new Date(value)`, which is UTC midnight for a date and
  local time for a `datetime-local` string.
- **Files are arrays of `File`.** Unlike the `files` cast (a live `FileList`), `auto` copies them into an array. `File`
  objects are structured-cloneable, so the whole result can be posted to a Worker; `JSON.stringify` turns each into
  `{}`.
- **Radios in a `[]` container** push only the checked one, so array indexes there don't line up with the inputs. Keep
  radio groups in `{}` containers.
- **Checkboxes are booleans, not lists.** Several checkboxes with the same name in a `{}` container overwrite each other.
  For a set of choices, give each checkbox its own name, or put them in a `[]` container (an array of booleans) or use a
  multiple select.
