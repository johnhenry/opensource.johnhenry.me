---
title: "domkit"
description: "A toolkit of DOM/HTML-component modules — custom-element authoring, responsive containers, shadow-DOM widgets, and DOM/React interop glue, organized into namespaced clusters. Depends on @johnhenry/domable for the underlying conversions."
planet: domkit
---

**`@johnhenry/domkit`** is a toolkit of small, independent DOM/HTML-component
modules — custom-element authoring primitives, responsive containers,
shadow-DOM widgets, a family of standalone interactive elements, and
DOM/React interop glue. Each module is its own directory, importable
individually; there is no single root import.

> **Provenance:** extracted from [`johnhenry/lib`](https://github.com/johnhenry/lib)'s
> `js/` directory, where these modules lived as individually-versioned,
> hot-linked source files. Consolidated into one real npm package after an
> audit found real duplication, drift, and several lifecycle bugs across
> the cluster. Six foundation modules that duplicated the already-published
> [`@johnhenry/domable`](/domable/) were dropped in favor of depending on it
> directly (`0.0.1`). Four more coherent clusters (`definable`, `matchable`,
> `cyclable`, `hydratable`) briefly existed as their own standalone npm
> packages (`0.0.3`) before coming back as namespaced subpaths of this one
> package instead (`0.0.4`) — running four separate repos for clusters
> this small cost more (CI/publish setups, secrets, release cadences,
> demo galleries to keep in sync) than it bought. `lib` itself is
> unaffected by any of this: its own copies of these modules keep existing
> at their original published URLs, per its own no-deletion policy. See
> the repo's `CHANGELOG.md` for the full history.

See the repo's [`demo/`](https://github.com/johnhenry/domkit/tree/main/demo)
for a live gallery running most of these modules at once, each isolated in
its own iframe.

## Install

```sh
npm install @johnhenry/domkit
```

```js
import { shadowOpen } from "@johnhenry/domable/simple-element";
import defineComponent from "@johnhenry/domkit/definable/define-component.component/index.mjs";
```

or, in a browser with no build step, via a CDN:

```html
<script
  type="module"
  src="https://esm.sh/@johnhenry/domkit/matchable/query-container.component/global.mjs"
></script>
```

## Modules

### Foundation

`simple-element`, `create-element`, `text-to-DOM-nodes`/`DOM-nodes-to-text`
live in [`@johnhenry/domable`](/domable/) — a real npm dependency of this
package, not a local copy (see [Family](#family)). What remains here:

| Module | Description |
|---|---|
| `create-mutable-nodelist` | A push/pop/shift/unshift-able `NodeList`-like collection |
| `live-query-selector` | An auto-updating live collection matching a selector, with a `.stop()` to disconnect it |

### `definable/` — defining custom elements

Four related ways to get behavior onto a page declaratively, from four
different kinds of source, plus the primitive they're built on.

| Module | Description |
|---|---|
| `definable/definetag` | Curried `customElements.define` wrapper |
| `definable/define-component.component` | Load a module by URL, register its export as a custom element |
| `definable/define-component-by-content.component` | Define a custom element from an inline HTML string attribute |
| `definable/polyfill-window.component` | Load a module by URL, assign its export to a global (not a custom-element registrar) |
| `definable/until-window-load` | Remove a "hidden until loaded" class once `window` fires `load` |

### `matchable/` — responsive containers

Two duals of the same idea — respond to a media query by swapping vs. by
styling — sharing a query grammar and a real `parsel-js` dependency.

| Module | Description |
|---|---|
| `matchable/query-container.component` | Swap the rendered child element by media query |
| `matchable/attribute-provider.component` | Apply classes/styles/attributes to children by media query |

### Shadow DOM / slots

| Module | Description |
|---|---|
| `shadow-dom.element` | Deprecated alias for domable's `simple-element` `shadowOpen` |
| `internal-timer.component` | A pause/frame-timer element (shadow-DOM+slot plumbing) |

### `cyclable/` — the class-cycler family, plus other widgets

One localStorage-backed cycling engine, a class-applying wrapper, and two
ready-made custom elements built on it.

| Module | Description |
|---|---|
| `cyclable/class-cycler.component` | Global-function class cycler |
| `cyclable/class-cycler.button.component` | Self-contained button variant |
| `cyclable/localstorage-class-cycler` | Applies a cycled value as a class on a given element |
| `cyclable/localstorage-cycler` | The base engine: cycle a localStorage value through a fixed list |

`hotkey-modal.dialog.component`, `menu-component.component` (with a
`hash.mjs` location-hash companion), `stylable-select.component`,
`tabbed-ui.component`, `infinite-combo.component`, `event-consumer.component`,
`code-color.component`.

### Visual/canvas experiments

`canvasrenderer.component`, `animate-paths.component`, `pixelshader.component`,
`imagedata-emitter.component`, `xy-grapher`, `chernoff-face`, `brains` —
demo/experiment-grade custom elements (canvas rendering, SVG path
animation, pixel shaders, generative graphics).

### `hydratable/` — DOM ⇄ React interop

`domToReact`/`reactToDom` live in [`@johnhenry/domable`](/domable/), not
here.

| Module | Description |
|---|---|
| `hydratable/mounts` | Framework-agnostic DOM mount-point helpers (Solid/Vue/React) |
| `hydratable` | A generic async hydration mixin |

### Support utilities

`clamp`, `pause`, `pauseframespersecond` — small helpers a handful of the
modules above depend on.

## Family

- [`domable`](/domable/) — the DOM ⇄ text ⇄ React conversion primitives
  this package depends on (`simple-element`, `create-element`, `text-to-dom`/
  `dom-to-text`, `react-to-dom`/`dom-to-react`). domable is genuinely
  independent (real TS types, jsdom tests, published before this cluster
  existed) and stays its own package — domkit carries a hard npm
  dependency on it rather than vendoring a second copy, and it's not
  folded in the way `definable`/`matchable`/`cyclable`/`hydratable` were.

## License

MIT

## Source

[github.com/johnhenry/domkit](https://github.com/johnhenry/domkit)
