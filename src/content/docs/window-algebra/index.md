---
title: "window-algebra"
description: "A functional window manager for browser applications: a pure core, a layout algebra compiled to CSS, drag-and-drop that edits structure, docking, and an effectful DOM edge."
sidebar:
  order: 0
---

**`@johnhenry/window-algebra`** is a functional window manager for browser applications.
It is not a drop-in desktop replacement. It is a small set of parts you can put together
into a floating, tiling, tabbed, docking or hybrid window manager.

```
command → update (pure) → state → derive (pure) → layout tree → compile (pure) → render tree → DOM
```

- **State is immutable data.** `update(state, command)` returns
  `{ state, events, effects }` and never touches the DOM, timers, the clock or
  randomness. A bad command is rejected with an event, never thrown.
- **Layout is an algebra.** Eleven primitives build a JSON tree. Named layouts such as
  `masterStack`, `bsp` and the docking `tree` are ordinary functions that return those
  primitives.
- **CSS is the layout engine.** Tiled windows get flex weights, grid tracks and anchor
  relationships instead of pixel rectangles. The browser works out the geometry, and
  every window is a container-query container.
- **The DOM is an effectful backend, not the source of truth.** The renderer reconciles
  a keyed render tree, so a window keeps its element, and its mounted surface, when the
  layout changes around it.

Zero dependencies. ESM only. The core runs in Node, workers and browsers.

```js
import { createState, update, derive, compile, presentationContext, toHTML } from "@johnhenry/window-algebra";

let state = createState({ layout: { type: "master-stack", ratio: 0.6 }, config: { gap: 8 } });
for (const id of ["editor", "terminal", "browser"]) state = update(state, { type: "window/create", id }).state;

const tree = derive(state);                                     // a JSON layout-algebra tree
const html = toHTML(compile(tree, presentationContext(state))); // flex: 0.6 1 0 …, no pixels
```

> **Provenance:** a new package, never published under another name. `0.0.0` is its
> first version under any name, not a sign of immaturity. It is not on npm yet; the
> source is at [github.com/johnhenry/window-algebra](https://github.com/johnhenry/window-algebra).

## What's here

**Guides**

- [Getting started](/window-algebra/getting-started/): install, import maps for a
  no-build page, the pure core, and a browser window manager.
- [The layout algebra](/window-algebra/layout-algebra/): the eleven primitives, derived
  layouts and tree transforms.
- [State, commands and events](/window-algebra/state-commands-events/): the
  `{ state, events, effects }` protocol and the 58 built-in commands.
- [Layouts, modifiers and drag-and-drop](/window-algebra/layouts-and-drag-and-drop/):
  layout specs, resizable splits, modifiers, and structural drops.
- [Policy at a glance](/window-algebra/policy/): the window-manager policy borrowed from
  xmonad, i3/sway, EWMH, ICCCM and Wayland.
- [compile and the browser](/window-algebra/compile-and-the-browser/): the render tree,
  the DOM renderer, input, surfaces, pop-outs, and the React and custom-element
  bindings.
- [Examples](/window-algebra/examples/): six self-verifying Node scripts and eleven
  browser demo pages.
- [Limitations and traps](/window-algebra/limitations/): read this before shipping.
- [Adding a new layout](/window-algebra/adding-a-layout/).
- [Design document](/window-algebra/design/): the PRD, prior art and open questions.

**[API reference](/window-algebra/api/)**: every public export, verified against the
source and tests: [state](/window-algebra/api/state/),
[commands](/window-algebra/api/commands/), [events and effects](/window-algebra/api/events/),
[queries](/window-algebra/api/queries/), [the layout algebra](/window-algebra/api/algebra/),
[layouts and modifiers](/window-algebra/api/layouts/),
[drag and drop](/window-algebra/api/drops/), [compile and CSS](/window-algebra/api/compile/),
[geometry and interaction](/window-algebra/api/geometry/),
[the manager](/window-algebra/api/manager/), [browser adapters](/window-algebra/api/browser/),
[framework bindings](/window-algebra/api/bindings/),
[versioning and migration](/window-algebra/api/versioning/) and
[errors](/window-algebra/api/errors/).

Source: [github.com/johnhenry/window-algebra](https://github.com/johnhenry/window-algebra). MIT licensed.

## Family

window-algebra is one of three zero-build, browser-first ESM libraries in this family.
None of them depends on another. They fit together at the page level:

- **[html-modules](/html-modules/)**: declarative HTML modules.
  `<html-import src="./ui.html" as="ui">` turns each `<html-export>` in an ordinary HTML
  file into a native custom element (`<ui--card>`). Those elements are exactly what
  window-algebra's surfaces host: `htmlSurface(document.createElement("ui--card"))` (or
  a `lazySurface` that creates one on first mount) puts an HTML-module component in a
  window. window-algebra only ever calls `mount(target)`/`unmount()`, so it needs no
  knowledge of how the element was defined. Neither package depends on the other. See
  [Surfaces](/window-algebra/api/browser/#surfaces) here and html-modules'
  [Lazy loading](/html-modules/settings-and-lazy-loading/#lazy-loading) for how a lazy
  import behaves inside a window.
- **[mport](/mport/)**: routes JavaScript imports across CDNs and compiles the result to a
  standard import map. A no-build page using window-algebra needs an import-map entry for
  each entry point it imports (see [Getting started](/window-algebra/getting-started/)),
  and for anything it loads alongside, such as React for the `/react` binding, which the
  repository's `demo/react.html` currently fetches from esm.sh by a hard-coded URL. mport
  can produce that map with fallback across mirrors, instead of hand-written URLs. There
  is no dependency in either direction; the browser only sees the resulting import map.
  See mport's [Import maps, lockfiles and the CLI](/mport/import-maps-and-cli/).
