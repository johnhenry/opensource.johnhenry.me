---
title: "domkit"
description: "Custom elements that behave like native HTML — tabs, stylable selects, autocomplete, drill-down menus, media-query containers, theme switches, syntax highlighting, charts, and pixel effects. One script tag each, no build step, no dependencies."
sidebar:
  order: 0
---

**`@johnhenry/domkit`** is a set of custom elements and DOM utilities for
people writing HTML without a build step. Add one `<script>` tag, write
the element, and it behaves like a native one: attributes, properties,
events, forms, `hidden`, keyboard, and accessibility all work the way they
do for built-in elements. Each is tested in Chromium, Firefox, and WebKit.

```html
<script type="module" src="https://esm.sh/@johnhenry/domkit/tabbed-ui/global.mjs"></script>

<tabbed-ui>
  <div><button>One</button><button>Two</button></div>
  <section>First panel</section>
  <section>Second panel</section>
</tabbed-ui>
```

New here? Start with **[Getting started](/domkit/getting-started/)**, then
browse the **[Recipes](/domkit/recipes/)**. The
**[Reference](/domkit/reference/)** lists every attribute, property, and
event, and **[Principles](/domkit/principles/)** explains the contract
every element keeps.

## Install

No install is needed: every module loads from a CDN as
`https://esm.sh/@johnhenry/domkit/<module>/global.mjs`. With npm:

```sh
npm install @johnhenry/domkit
```

```js
import "@johnhenry/domkit/tabbed-ui/global.mjs"; // registers <tabbed-ui>
import TabbedUI from "@johnhenry/domkit/tabbed-ui"; // or just the class
```

domkit has no dependencies, so no import map is needed. It ships
TypeScript declarations, a `custom-elements.json` manifest, and VS Code
autocomplete data (`vscode.html-custom-data.json`).

## Elements

### Interface pieces

| Element | What it's for |
|---|---|
| [`<tabbed-ui>`](https://github.com/johnhenry/domkit/tree/main/src/tabbed-ui) | Accessible tabs from plain children |
| [`<stylable-select>`](https://github.com/johnhenry/domkit/tree/main/src/stylable-select) | A listbox you can fully style, with a native `<select>`'s API, forms, and keyboard |
| [`<infinite-combo-box>`](https://github.com/johnhenry/domkit/tree/main/src/infinite-combo-box) | Autocomplete: filters its own options, or searches a URL or function as you type, paging in more results as you scroll |
| [`<hot-key>`](https://github.com/johnhenry/domkit/tree/main/src/hot-key) | Keyboard shortcuts that toggle a native `<dialog>` or popover, or run any invoker command |
| [`<drill-menu>`](https://github.com/johnhenry/domkit/tree/main/src/drill-menu) | A list that drills into sub-screens and back, optionally synced to the URL |
| [`<code-color>`](https://github.com/johnhenry/domkit/tree/main/src/code-color) | Syntax highlighting that never changes your markup |

### Responding to screen and container size

| Element | What it's for |
|---|---|
| [`<query-container>`](https://github.com/johnhenry/domkit/tree/main/src/matchable/query-container) | Change the element that wraps content (`ul` → `ol`) by media query, or by its container's size |
| [`<attribute-provider>`](https://github.com/johnhenry/domkit/tree/main/src/matchable/attribute-provider) | Add classes, styles, and attributes to children by media or container query, and restore them |

### State, loading, and timing

| Element | What it's for |
|---|---|
| [`<attribute-cycler>`](https://github.com/johnhenry/domkit/tree/main/src/cyclable/attribute-cycler) | Theme and density switches: buttons that cycle a persisted class or attribute, synced across tabs |
| [`<define-component>`](https://github.com/johnhenry/domkit/tree/main/src/definable/define-component) | Register a custom element in HTML, from a module's export or from a `<template>` |
| [`<polyfill-window>`](https://github.com/johnhenry/domkit/tree/main/src/definable/polyfill-window) | Load a module onto `window` unless it's already there |
| [`<frame-timer>`](https://github.com/johnhenry/domkit/tree/main/src/frame-timer) | A clock: steady `tick` events with `play()`/`pause()` |

### Functions

[`live-query-selector`](https://github.com/johnhenry/domkit/tree/main/src/live-query-selector),
[`delay`](https://github.com/johnhenry/domkit/tree/main/src/delay) (milliseconds, or one frame at a given `fps`),
[`clamp`](https://github.com/johnhenry/domkit/tree/main/src/clamp),
[`until-window-load`](https://github.com/johnhenry/domkit/tree/main/src/definable/until-window-load),
[`hydratable`](https://github.com/johnhenry/domkit/tree/main/src/hydratable) and
[`mounts`](https://github.com/johnhenry/domkit/tree/main/src/hydratable/mounts)
(app bootstrap), and the
[`localstorage-cycler`](https://github.com/johnhenry/domkit/tree/main/src/cyclable/localstorage-cycler)
engine behind `<attribute-cycler>`.

### Data and graphics

| Element | What it's for |
|---|---|
| [`<scatter-plot>`](https://github.com/johnhenry/domkit/tree/main/src/scatter-plot) | A scatter plot of a point you design, styled with ordinary CSS |
| [`<chernoff-face>`](https://github.com/johnhenry/domkit/tree/main/src/chernoff-face) | A face whose features show data, each a number from 0 to 1 |
| [`<draw-svg>`](https://github.com/johnhenry/domkit/tree/main/src/draw-svg) | SVG strokes that draw themselves in, CSP-safe and reduced-motion aware |

### Pixel effects

Put an image, video, or canvas in a `<pixel-canvas>` and list effects
like CSS `filter`, left to right:

```html
<pixel-canvas width="160" effects="adjust(contrast 1.3) palette(gameboy, ordered)">
  <img src="photo.jpg" alt="Our cat">
</pixel-canvas>
```

| Effect | What it does |
|---|---|
| `mosaic(size)` | Pixelate into blocks |
| `palette(colors, dither)` | Limit to a palette (Game Boy, PICO-8, 1-bit, any colors), with dithering |
| `grid(size, color, line)` | Grid lines between cells |
| `adjust(brightness, contrast, saturation, hue)` | Tone and color, like the CSS filter functions |
| `halftone(size, angle, ink, paper)` | Printed dots |
| `outline(threshold, ink, paper)` | Line art from edges |
| `crt(scanlines, mask, glow)` | An old screen |
| `chroma-key(color, tolerance, softness)` | Make a color transparent (green screen) |

Every effect is also an element (`<pixel-mosaic size="4">`, …) to wrap
around the source, handy for switching one on and off. Write your own
with `definePixelEffect()`, which registers both forms. See the
[pixelable readme](https://github.com/johnhenry/domkit/blob/main/src/pixelable/readme.md) and
[`<pixel-canvas>`](https://github.com/johnhenry/domkit/tree/main/src/pixelable/pixel-canvas).

## Stability

Every module follows semver from 0.1.0: while the
version is `0.x`, breaking changes only land in a minor release, and are
always listed in the
[changelog](https://github.com/johnhenry/domkit/blob/main/CHANGELOG.md).
The repo's live gallery
([`demo/`](https://github.com/johnhenry/domkit/tree/main/demo)) runs every
module, and [`examples/`](https://github.com/johnhenry/domkit/tree/main/examples)
holds the recipes.

## Family

- [`domable`](/domable/) converts between HTML text, DOM nodes, and
  React-element-shaped objects. domkit used to depend on it, and is now
  dependency-free.

## Source

[github.com/johnhenry/domkit](https://github.com/johnhenry/domkit) · MIT
