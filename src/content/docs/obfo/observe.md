---
title: "Live values"
description: "observe(element, callback, options): call back with the form's object on input, change and reset, one call per edit; debounce, immediate, AbortSignal and onError."
sidebar:
  order: 4
---

`observe(element, callback, options?)` calls `callback(value, event)` with `obfo(element, options)` whenever the element
sees an `input`, `change` or `reset` event, and returns an unsubscribe function.

```js
import { observe } from "@johnhenry/obfo";

const stop = observe(form, (value, event) => render(value), { cast: "auto", immediate: true });
// later
stop();
```

## Timing

The call is made a task later (`setTimeout(0)` on the element's window), not synchronously and not in a microtask:

- **One edit, one call.** A checkbox click fires `input` and then `change`, and a browser runs microtasks between the two
  native events, so a microtask would call back twice. A task later, both have fired.
- **Resets read the reset values.** A `reset` event fires before the fields are reset; a task later they have been.
- `event` is the last event seen before the call (`null` for the `immediate` call).

## Options

| Option | Default | Does |
| --- | --- | --- |
| `debounce` | `0` | Milliseconds to wait for a pause in events before calling back: every event restarts the wait. |
| `immediate` | `false` | Also call back once, synchronously, with the current value. |
| `signal` | none | An `AbortSignal` that unsubscribes. An already-aborted signal never subscribes (and `immediate` doesn't fire). |
| `onError` | none | Receives an error thrown while reading (a child with no key, a `bigint` cast on text). Without it the error is thrown from the timer, where the browser reports it. |
| `cast`, `container`, `submit`, `parse` | | Passed to `obfo`. |

Unsubscribing also cancels a call that is already scheduled.

## What it doesn't hear

- **Property writes.** `input.value = "x"` or `input.checked = true` from script fires no event. Use
  `fill(form, value, { dispatch: true })`, or dispatch an `input` event yourself.
- **Structure changes.** Fields added or removed are read on the next event, not when they change. Call your callback
  yourself (or `obfo`) after changing the form's markup, or re-`observe` a replaced form.
- **Events outside the element.** Listeners are on `element`, so an input outside it (even one associated with the form
  through its `form` attribute) isn't heard, and isn't read either.

## Feeding something else

```js
// a signalle signal that always equals the form's object
const formValue = signal(null);
observe(form, (value) => { formValue.value = value; }, { cast: "auto", immediate: true });

// a dataflow node whose dependents rerun on every edit
let current;
observe(form, (value) => { current = value; flow.invalidate("form"); }, { cast: "auto", immediate: true });
```
