---
title: "signalle"
description: "A beautiful, modern JavaScript signals library with optional DOM integration — fine-grained reactivity with a simple API, plus server-side streaming, scoped isolation, and cross-tab broadcast signals."
---

**`signalle`** is a JavaScript signals library with optional DOM
integration. It provides fine-grained reactivity — only what changed
re-runs, not entire components — with a simple, intuitive API.

> Published on npm as unscoped `signalle` (not yet moved into the
> `@johnhenry` scope). Everything below uses that unscoped name.

- **Fine-grained reactivity**: only update what changed, not entire
  components
- **Framework agnostic**: works anywhere JavaScript runs
- **Optional DOM integration**: direct DOM bindings when you need them
- **Small footprint**, linked-list-based dependency tracking
- **TypeScript support**: full type definitions included

## Install

```sh
npm install signalle
```

## Quick start

```javascript
import { signal, computed, effect } from 'signalle';

// Create a signal with an initial value
const count = signal(0);

// Create a computed signal that depends on other signals
const doubled = computed(count, async (value) => value * 2);

// React to signal changes
effect(doubled, (value) => {
  console.log(`Doubled value: ${value}`);
});

// Update the signal
count.value = 5; // Logs: "Doubled value: 10"
```

## The pages here

- [API](/signalle/api/) — core signals API, DOM bindings,
  server-side streaming, scoped signals, and cross-tab broadcast signals
- [Security model](/signalle/security/) — the real, unclosed risk in
  `generateWorkerCode()`, stated plainly

## Architecture

Signalle is built with performance and simplicity in mind:

- **Linked lists for dependencies** — more efficient than Set-based
  approaches
- **Automatic dependency tracking** — optional auto-tracking for effects
- **Batching support** — prevent glitches with proper update batching
- **Lazy evaluation** — only recompute values when needed

## License

MIT

## Source

[github.com/johnhenry/signalle](https://github.com/johnhenry/signalle)
