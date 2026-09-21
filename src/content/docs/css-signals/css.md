---
title: "CSS"
description: "The runtime prefix, generating static CSS for a JS-free page, the optional @function helpers and the @supports gate they need, and smoothing signals with plain transitions."
sidebar:
  order: 3
---

## The prefix

```js
createSignals({ prefix: "app" });  // --app-pointer-x
createSignals({ prefix: "" });     // --pointer-x
createSignals();                   // --sig-pointer-x   (default)
```

A prefix must be empty or a CSS identifier fragment (`[A-Za-z_][A-Za-z0-9_-]*`); anything else throws a `TypeError`. Two instances with different prefixes coexist in one document, and the same prefix twice is harmless.

Everything derived from the prefix — property names, `@property` registrations, keyframe names, function names — is generated at runtime, because CSS cannot compute a custom property's name.

## Static CSS for a JS-free page

To get the `@property` rules and the native scroll CSS without running any JS:

```sh
node node_modules/@johnhenry/css-signals/scripts/build-css.mjs --prefix app --out public/signals.css
```

`@johnhenry/css-signals/signals.css` is the same file for the default `sig` prefix. It covers scroll progress (pure CSS) but not pointer, viewport and the rest, which need JS. Only properties whose names are known ahead of time are emitted; key codes, pad buttons, input and cycle names are registered by the runtime.

## Helpers and the `@supports` gate

`@johnhenry/css-signals/utils.css` (or `functionsCss(prefix)` for another prefix) defines three `@function`s: `--sig-progress(v, min, max)` (clamped 0–1), `--sig-lerp(a, b, t)` and `--sig-map(v, in-min, in-max, out-min, out-max)`. They work on any values, not just signals.

`@function` is not in every browser, and the obvious fallback does not work:

```css
.bar { width: calc(var(--sig-pointer-x) * 0.4px); }
.bar { width: --sig-map(var(--sig-pointer-x), 0, 1000, 0px, 400px); }  /* NOT a fallback */
```

Where `@function` is missing, the second declaration contains `var()`, so the browser accepts it at parse time and only finds it invalid at computed-value time — at which point the property is `unset`, not the line above. (Firefox showed exactly this.) Gate it with `@supports`, using a literal call with **no `var()`** in it — with a `var()` inside, Firefox reports support it does not have:

```css
.bar { width: calc(var(--sig-pointer-x) * 0.4px); }                 /* everywhere */
@supports (width: --sig-map(1, 0, 1, 0px, 1px)) {                   /* where @function exists */
  .bar { width: --sig-map(var(--sig-pointer-x), 0, 1000, 0px, 400px); }
}
```

## Smoothing

Because the properties are registered, ordinary CSS transitions interpolate them. No animation loop is needed:

```css
:root {
  transition: --sig-pointer-x 200ms ease-out, --sig-pointer-y 200ms ease-out;
}
```

Honour `prefers-reduced-motion` yourself for these.

## Using the values

- A number becomes text with `counter-set: n var(--sig-x); content: counter(n)` (integers only).
- A quoted string from `input()` works directly in `content: var(--sig-input-name)`.
