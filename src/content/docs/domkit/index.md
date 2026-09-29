---
title: "domkit"
description: "A toolkit of ~35 independent DOM/HTML-component modules — custom-element authoring, responsive containers, shadow-DOM widgets, and DOM/React interop glue. Depends on @johnhenry/domable for the underlying conversions."
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
> the cluster — see the repo's `CHANGELOG.md` for the full history. `lib`
> itself is unaffected: its own copies of these modules keep existing at
> their original published URLs, per its own no-deletion policy.

See the repo's [`demo/`](https://github.com/johnhenry/domkit/tree/main/demo)
for a live gallery running most of these modules at once, each isolated in
its own iframe.

## Install

```sh
npm install @johnhenry/domkit
```

```js
import { shadowOpen } from "@johnhenry/domable/simple-element";
import defineComponent from "@johnhenry/domkit/define-component.component/index.mjs";
```

or, in a browser with no build step, via a CDN:

```html
<script
  type="module"
  src="https://esm.sh/@johnhenry/domkit/query-container.component/global.mjs"
></script>
```

## Modules

### Foundation

`simple-element`, `create-element`, `text-to-DOM-nodes`/`DOM-nodes-to-text`
now live in [`@johnhenry/domable`](/domable/) — a real npm dependency of
this package, not a local copy (see [Family](#family)). What remains here:

| Module | Description |
|---|---|
| `create-mutable-nodelist` | A push/pop/shift/unshift-able `NodeList`-like collection |
| `live-query-selector` | An auto-updating live collection matching a selector, with a `.stop()` to disconnect it |

### Defining custom elements

| Module | Description |
|---|---|
| `definetag` | Curried `customElements.define` wrapper |
| `define-component.component` | Load a module by URL, register its export as a custom element |
| `define-component-by-content.component` | Define a custom element from an inline HTML string attribute |
| `polyfill-window.component` | Load a module by URL, assign its export to a global (not a custom-element registrar) |

### Responsive containers

| Module | Description |
|---|---|
| `query-container.component` | Swap the rendered child element by media query |
| `attribute-provider.component` | Apply classes/styles/attributes to children by media query |

### Shadow DOM / slots

| Module | Description |
|---|---|
| `shadow-dom.element` | Deprecated alias for domable's `simple-element` `shadowOpen` |
| `internal-timer.component` | A pause/frame-timer element (shadow-DOM+slot plumbing) |

### Widgets

`class-cycler.component`, `class-cycler.button.component`,
`hotkey-modal.dialog.component`, `menu-component.component` (with a
`hash.mjs` location-hash companion), `stylable-select.component`,
`tabbed-ui.component`, `infinite-combo.component`, `event-consumer.component`,
`code-color.component`.

### Visual/canvas experiments

`canvasrenderer.component`, `animate-paths.component`, `pixelshader.component`,
`imagedata-emitter.component`, `xy-grapher`, `chernoff-face`, `brains` —
demo/experiment-grade custom elements (canvas rendering, SVG path
animation, pixel shaders, generative graphics).

### DOM ⇄ React interop

`domToReact`/`reactToDom` live in [`@johnhenry/domable`](/domable/), not
here.

| Module | Description |
|---|---|
| `mounts` | Framework-agnostic DOM mount-point helpers (Solid/Vue/React) |
| `hydratable` | A generic async hydration mixin |

### Support utilities

`clamp`, `pause`, `pauseframespersecond`, `localstorage-cycler`,
`localstorage-class-cycler` — small helpers a handful of the modules above
depend on.

## Family

- [`domable`](/domable/) — the DOM ⇄ text ⇄ React conversion primitives
  this package depends on (`simple-element`, `create-element`, `text-to-dom`/
  `dom-to-text`, `react-to-dom`/`dom-to-react`). domable is upstream of
  domkit, not the reverse — domkit carries a hard npm dependency on it
  rather than vendoring a second copy.

## License

MIT

## Source

[github.com/johnhenry/domkit](https://github.com/johnhenry/domkit)
