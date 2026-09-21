---
title: "css-signals"
description: "Publish live browser state — pointer, scroll, viewport, keyboard, time, gamepad, audio, form controls — as typed CSS custom properties under a runtime-configurable prefix. Native CSS where the browser can, batched JS where it can't."
sidebar:
  order: 1
---

**`@johnhenry/css-signals`** turns things only JavaScript can see into custom properties CSS can use: `--sig-pointer-x`, `--sig-scroll-y-progress`, `--sig-key-KeyW`, `--sig-date-hour`. Each one is registered as a typed `<number>` with an initial value, so `calc()`, typed `@function` parameters and `transition` all work on it. Where the browser can compute a value in CSS alone — scroll progress, via a scroll timeline — it does, and no listener runs.

> Rewrite of the `css-model` and `css-variables-*` modules in
> [`johnhenry/lib`](https://github.com/johnhenry/lib), which were never
> published to npm. There is no earlier release to restart from; `0.0.0` is the
> first version under any name, not a maturity signal.

## Install

```sh
npm install @johnhenry/css-signals
```

## Quick example

```js
import { createSignals, pointer, scroll, viewport } from "@johnhenry/css-signals";

const signals = createSignals({ prefix: "app" }).use(pointer(), scroll(), viewport());
```

```css
#progress { transform: scaleX(var(--app-scroll-y-progress)); }
#follower { left: calc(var(--app-pointer-x) * 1px); top: calc(var(--app-pointer-y) * 1px); }
#width::after { counter-set: w var(--app-viewport-width); content: counter(w) "px"; }
```

The prefix (`app` here, `sig` by default, or `""` for none) is a runtime argument. `signals.dispose()` removes every listener, observer, injected stylesheet and property it wrote.

## Read this before you build on it

These are the things you cannot recover from the source, or that fail quietly.

- **Nothing updates in a hidden tab.** Writes are batched to one per animation frame, and browsers do not run `requestAnimationFrame` in a hidden tab. A background tab, or a hidden browser pane in a test harness, simply holds its last values. That is deliberate, but it surprises people testing headlessly.
- **Names that depend on hardware or markup are registered lazily.** `key-{code}`, gamepad buttons, `input-{name}` and `cycle-{name}` are registered the first time they appear, so before that they are *unregistered* and read as invalid. Always give them a fallback: `var(--sig-key-KeyW, 0)`. (`keyboard({ keys: ["KeyW"] })` registers a key up front.)
- **The `@function` fallback is not "the line above".** In a browser without `@function`, a declaration containing `var()` is only checked at computed-value time, so it becomes `unset` rather than falling back to an earlier declaration. Gate it with `@supports` on a literal call. See [CSS](/css-signals/css/#helpers-and-the-supports-gate).
- **Native scroll progress owns `animation` on `:root`.** Its rule is in the cascade layer `css-signals`, so your own unlayered `:root { animation: … }` wins; the library then notices, drops its native rule, logs a warning, and computes progress in JS. It never replaces your animation. Several prefixes share one stylesheet.
- **Strings are registered as `*`, not `<string>`.** WebKit 18 rejects a registered `<string>` with any initial value. A registration the browser refuses does not throw: the core warns and the value still works, untyped.
- **A prefix means different CSS.** CSS cannot compute a property name, so a different prefix means different `@property` rules, keyframe names and function names. The runtime generates them; for a JS-free page, generate a file for your prefix (see [CSS](/css-signals/css/)).
- **`date()` uses ISO numbering.** Weekday is Monday = 1 … Sunday = 7 and month is 1–12, not the 0-based values `Date` gives you.
- **`gamepad` and `audio` are only unit-tested.** They need hardware and a user gesture, so they have run against fakes but not in a real browser.

## Where next

- [Sources](/css-signals/sources/) — every source, its properties, and how to write your own.
- [CSS](/css-signals/css/) — the prefix, static CSS, the `@function` helpers, smoothing with `transition`.
- [Browser support](/css-signals/browser-support/) — what is verified where, and how to run the check yourself.

## Source

[github.com/johnhenry/css-signals](https://github.com/johnhenry/css-signals).
