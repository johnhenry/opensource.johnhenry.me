---
title: "API"
description: "signal, computed, effect, createEffect, batch, untrack, DOM bindings, server-side streaming, scoped signals, and cross-tab broadcast signals."
---

## Core API

### `signal(initialValue)`

Creates a new signal with the given initial value.

```javascript
const name = signal('John');
console.log(name.value); // "John"
name.value = 'Jane';
console.log(name.value); // "Jane"
```

### `computed(deps, computeFn)`

Creates a computed signal that derives its value from other signals.

```javascript
const firstName = signal('John');
const lastName = signal('Doe');

const fullName = computed([firstName, lastName], async (first, last) => {
  return `${first} ${last}`;
});

console.log(fullName.value); // "John Doe"
firstName.value = 'Jane';
console.log(fullName.value); // "Jane Doe"
```

### `effect(signal, fn)`

Creates an effect that runs when a signal's value changes.

```javascript
const user = signal({ name: 'John', age: 30 });

const unsubscribe = effect(user, (value) => {
  console.log(`User updated: ${value.name}, ${value.age}`);
});

user.update(u => ({ ...u, age: 31 })); // Logs: "User updated: John, 31"

// Later, to clean up:
unsubscribe();
```

### `createEffect(fn)`

Creates an effect that automatically tracks signal dependencies.

```javascript
const count = signal(0);
const doubled = computed(count, async (value) => value * 2);

const cleanup = createEffect(() => {
  console.log(`Count: ${count.value}, Doubled: ${doubled.value}`);
});

count.value = 5; // Logs: "Count: 5, Doubled: 10"

// Later, to clean up:
cleanup();
```

### `batch(fn)`

Batches multiple signal updates to prevent intermediate re-renders.

```javascript
const firstName = signal('John');
const lastName = signal('Doe');
const age = signal(30);

// Without batching, this would trigger 3 separate updates
await batch(async () => {
  firstName.value = 'Jane';
  lastName.value = 'Smith';
  age.value = 28;
});
// Only one update happens after all changes are applied
```

### `untrack(fn)`

Runs a function without tracking dependencies.

```javascript
const count = signal(0);

createEffect(() => {
  // This will NOT create a dependency on count
  const value = untrack(() => count.value);
  console.log(`The count is ${value} (but won't update)`);

  // This WILL create a dependency
  console.log(`The count is ${count.value} (and will update)`);
});
```

## DOM integration

```javascript
import { signal } from '@johnhenry/signalle';
import { bind, bindAttribute, bindClass } from '@johnhenry/signalle/dom';

// Create a two-way binding with an input element
const nameInput = document.querySelector('#name-input');
const nameSignal = bind(nameInput, {
  property: 'value',
  events: ['input'],
  twoWay: true
});

// Bind a signal to an attribute
const imageElement = document.querySelector('#profile-image');
const imageSrc = signal('default.jpg');
bindAttribute(imageElement, 'src', imageSrc);

// Bind a signal to a class
const themeToggle = signal(false);
bindClass(document.body, 'dark-theme', themeToggle);
```

Available bindings:

- `bind(element, options)` — basic element binding
- `bindAll(bindings)` — bind multiple elements at once
- `computedBind(element, deps, computeFn, options)` — bind a computed value
- `bindAttribute(element, attribute, signal, render)` — bind to an
  attribute
- `bindClass(element, className, signal)` — toggle a class
- `bindStyle(element, property, signal, unit)` — bind to a style property
- `bindList(element, itemsSignal, renderItem)` — efficient list rendering

## Server-side streaming

```js
import { signal } from '@johnhenry/signalle';
import { toSSEResponse } from '@johnhenry/signalle/stream';

const feed = signal({ count: 0 });

// Returns a Response with Content-Type: text/event-stream
// that automatically pushes updates when the signal changes
const response = toSSEResponse(feed, {
  event: 'update',  // SSE event name (optional)
  cors: true         // Set CORS headers (optional, default false)
});
```

### `toSSEResponse(signal, options?)`

Creates a Server-Sent Events `Response` from a signal. The stream pushes a
new SSE message whenever the signal's value changes.

Options:

- `transform` (function) — transform the value before sending (default:
  `JSON.stringify`)
- `event` (string) — SSE event name
- `sendInitial` (boolean) — whether to send the signal's current value
  immediately (default: `true`)
- `cors` (boolean or string origin) — set CORS headers

### `toReadableStream(signal, options?)`

The lower-level primitive behind `toSSEResponse`: converts a signal into a
plain `ReadableStream<string>` of SSE-formatted chunks, for cases where you
need the stream itself rather than a full `Response`.

## Scoped signals

```js
import { createScope } from '@johnhenry/signalle/scope';

const scope = createScope();

const count = scope.signal(0);
const doubled = scope.computed(count, async (v) => v * 2);

const cleanup = scope.createEffect(() => {
  console.log(`Count: ${count.value}, Doubled: ${doubled.value}`);
});

count.value = 5; // Logs: "Count: 5, Doubled: 10"

scope.dispose(); // Cleans up all effects created in this scope
```

### `createScope()`

Creates an isolated signal context, safe for multi-tenant / concurrent
server use (e.g. one scope per request). Returns:

- `scope.signal(initialValue)` — scope-isolated `signal()`
- `scope.computed(deps, fn)` — scope-isolated `computed()`
- `scope.effect(signal, fn)` — scope-isolated `effect()`
- `scope.createEffect(fn)` — scope-isolated `createEffect()` (see warning
  below)
- `scope.batch(fn)` — scope-isolated `batch()`
- `scope.untrack(fn)` — scope-isolated `untrack()`
- `scope.dispose()` — cleans up every effect created in this scope

### Auto-tracking isolation: use `scope.createEffect`, not the top-level `createEffect`

Signals, computeds, `effect()`, `batch()`, and `untrack()` created through
a scope are fully isolated from every other scope — they hold their own
independent state.

The **top-level `createEffect`** imported from `signalle` is different:
its automatic dependency tracking is implemented with a single tracker
shared by the whole process (a module-static field). Because of that, **it
will not auto-track signals created via `scope.signal()`/
`scope.computed()`** — reading a scoped signal inside a plain, top-level
`createEffect(...)` simply won't register a dependency. This is
intentional (it's what prevents scopes from leaking into each other), but
it means the top-level `createEffect` must never be used as your
auto-tracking mechanism for scoped signals, and is unsafe as an isolation
boundary between concurrent logical contexts (e.g. two concurrent server
requests) in general.

Use **`scope.createEffect(fn)`** instead whenever you need auto-tracking
inside a scope. It has its own independent tracker state per scope, so
multiple scopes' `createEffect` calls — even interleaved within the same
event-loop tick — never corrupt each other's dependency tracking.

## Broadcast signals

Signals that stay in sync across browser tabs, iframes, or workers via
`BroadcastChannel`.

```js
import { createBroadcastSignal } from '@johnhenry/signalle/broadcast';

// Every `createBroadcastSignal(initial, channelName)` call that shares the
// same channel name — in any tab, iframe, or worker — stays in sync.
const sharedCount = createBroadcastSignal(0, 'shared-count');

sharedCount.subscribe((value) => {
  console.log('Count is now:', value);
});

// Setting the value here also updates every other tab/worker listening on
// the 'shared-count' channel.
sharedCount.value = 1;

// Clean up: closes the underlying BroadcastChannel
sharedCount.dispose();
```

### `createBroadcastSignal(initialValue, channelName?)`

Creates a signal backed by a `BroadcastChannel`. Values are
`structuredClone`d before being compared/stored/broadcast, so they must be
structured-clone-safe (plain objects, arrays, primitives, etc. — no
functions or DOM nodes).

- `initialValue` — the signal's starting value (local to this instance
  until the first broadcast is received)
- `channelName` (optional) — the `BroadcastChannel` name to synchronize
  on; defaults to `'default-signal'`

Returns an object with `value` (get/set), `subscribe(fn)`, and
`dispose()`.

### `generateWorkerCode(signalCode, name?)`

Generates a self-contained string of worker code that embeds the
`BroadcastSignal` implementation plus a `createBroadcastSignal`-equivalent
factory (bound to `name`, default `'createBroadcastSignal'`), so it can be
dropped into a `Worker`/`Blob` URL without a bundler:

```js
import { generateWorkerCode } from '@johnhenry/signalle/broadcast';

const workerCode = generateWorkerCode(`
  const sharedCount = createBroadcastSignal(0, 'shared-count');
  sharedCount.subscribe((value) => postMessage(value));
`);

const blob = new Blob([workerCode], { type: 'application/javascript' });
const worker = new Worker(URL.createObjectURL(blob));
```

**Before using `generateWorkerCode()`, read the [Security
model](/signalle/security/) page.** It performs plain string
interpolation into a JS source string with no sandboxing — equivalent to
`eval()` with a Worker/Blob indirection on top.

## Exports

| Export | Description |
|--------|-------------|
| `signalle` | Core: `signal`, `computed`, `effect`, `createEffect`, `batch`, `untrack` |
| `signalle/dom` | DOM bindings: `bind`, `bindAll`, `computedBind`, `bindAttribute`, `bindClass`, `bindStyle`, `bindList` |
| `signalle/stream` | Server: `toReadableStream`, `toSSEResponse` |
| `signalle/scope` | Isolation: `createScope` (`SignalScope`) |
| `signalle/broadcast` | Cross-tab/worker sync: `createBroadcastSignal`, `generateWorkerCode` |
