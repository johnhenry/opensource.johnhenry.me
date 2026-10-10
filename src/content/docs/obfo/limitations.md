---
title: "Limitations and traps"
description: "What obfo does with forms you didn't write, what it doesn't read, what fill and observe can't do, and how to test it without a browser."
sidebar:
  order: 6
---

## Forms you didn't write

obfo never evaluates, renders or fetches anything: it reads `value`, `checked`, `files` and text, and builds plain
objects and arrays. It doesn't validate anything either. A form whose markup comes from someone else can still:

- **choose every key**, including `constructor`, `toString` and `__proto__`. A field named `__proto__` becomes an
  ordinary own property (obfo defines keys rather than assigning them), so it can't replace the result's prototype;
  other surprising keys are yours to reject.
- **choose every value**, regardless of `required`, `pattern`, `min`, `max` or `maxlength`. Check the result, or call
  `form.reportValidity()` before reading.
- **throw.** A missing key, a `bigint` cast on non-integer text or a `file` cast on a text input throws; with
  `observe`, pass `onError`. Containers are read recursively, so thousands of nested containers throw a `RangeError`.

## What isn't read

- **Custom form-associated elements** (`ElementInternals`) and `contenteditable` regions without `data-obfo-value`.
  Only `input`, `textarea`, `select` and `data-obfo-value` elements carry values.
- **Inputs outside the element**, even ones associated with the form through their `form` attribute.
- Nothing is skipped for being **disabled** (unlike `FormData`): a disabled input is read like any other.

## What `fill` and `observe` can't do

- `fill` skips file inputs and checkboxes or radios read without a boolean cast, and never adds or removes elements.
  See [Writing a form](/obfo/fill/#what-it-skips).
- `observe` hears events, not property writes, and reads structure changes only on the next event. See
  [Live values](/obfo/observe/#what-it-doesnt-hear).

## Testing without a browser

obfo uses no DOM globals (element kinds come from `localName`; `Event` and timers from the element's own window), so it
runs under Node against [happy-dom](https://github.com/capricorn86/happy-dom) without installing anything on
`globalThis`. Its own suite does exactly that, and three differences from a browser matter when you test code built on
it:

- **Events are synchronous.** happy-dom runs no microtasks between an `input` and a `change` dispatched from a test, so
  a test can't show the double call a microtask-based coalescer made in a real browser. obfo's Playwright suite
  (Chromium, Firefox, WebKit) is where that was found.
- **`innerText` keeps whitespace** a browser collapses, so `data-obfo-value` text differs.
- **No file picker.** Set files with `new window.DataTransfer()` and `input.files = transfer.files`.
