---
title: "domkit"
description: "Small, independent custom elements and DOM utilities that work straight from a CDN: tabs, stylable selects, search combos, media-query containers, persisted theme toggles, declarative loaders. No build step."
planet: domkit
---

**`@johnhenry/domkit`** is a set of small custom elements and DOM
utilities that work straight from a CDN, with no build step and no
framework. Every module is independent, so a page loads only what it uses.

```html
<script type="module" src="https://esm.sh/@johnhenry/domkit/tabbed-ui/global.mjs"></script>

<tabbed-ui>
  <div slot="tab-bar"><button>One</button><button>Two</button></div>
  <div>First panel</div>
  <div>Second panel</div>
</tabbed-ui>
```

Each module has its own README in the repo, with its full attribute, API,
and event reference. The tables below link to them.

## Install

```sh
npm install @johnhenry/domkit
```

```js
import "@johnhenry/domkit/tabbed-ui/global.mjs"; // registers <tabbed-ui>
import TabbedUI from "@johnhenry/domkit/tabbed-ui"; // or just the class
import liveQuerySelector from "@johnhenry/domkit/live-query-selector";
```

Or skip installing: every path above also works as
`https://esm.sh/@johnhenry/domkit/<path>`.

## Find what you need

### Interface pieces

| Module | What it's for | `global.mjs` registers |
|---|---|---|
| [tabbed-ui](https://github.com/johnhenry/domkit/tree/main/src/tabbed-ui) | Tabs and panels from plain children, matched by position | `<tabbed-ui>` |
| [stylable-select](https://github.com/johnhenry/domkit/tree/main/src/stylable-select) | A listbox whose options you can fully style | `<stylable-select>` |
| [infinite-combo](https://github.com/johnhenry/domkit/tree/main/src/infinite-combo) | Search-as-you-type combo box, with options from your async function | `<infinite-combo>` |
| [hotkey-modal-dialog](https://github.com/johnhenry/domkit/tree/main/src/hotkey-modal-dialog) | A `<dialog>` toggled by a keyboard shortcut ¹ | `<dialog is="hotkey-modal">` |
| [menu-component](https://github.com/johnhenry/domkit/tree/main/src/menu-component) | Keyboard-navigable menu that drills into sub-screens, optionally synced to `location.hash` | `<menu-component>` |
| [code-color](https://github.com/johnhenry/domkit/tree/main/src/code-color) | Syntax highlighting for HTML, CSS, or JS | `<code-color>` |

### Responding to screen size: `matchable/`

Both share one `[media query] value | …` grammar, documented in the
[matchable README](https://github.com/johnhenry/domkit/tree/main/src/matchable).

| Module | What it's for | `global.mjs` registers |
|---|---|---|
| [query-container](https://github.com/johnhenry/domkit/tree/main/src/matchable/query-container) | Change the element that wraps content (`ul` → `ol`, …) by media query | `<query-container>` |
| [attribute-provider](https://github.com/johnhenry/domkit/tree/main/src/matchable/attribute-provider) | Change children's classes, styles, and attributes by media query | `<attribute-provider>` |

### Remembering a user's choice (e.g. a theme toggle): `cyclable/`

| Module | What it's for | `global.mjs` registers |
|---|---|---|
| [class-cycler](https://github.com/johnhenry/domkit/tree/main/src/cyclable/class-cycler) | A global function that cycles a persisted class | `<class-cycler>` |
| [class-cycler-button](https://github.com/johnhenry/domkit/tree/main/src/cyclable/class-cycler-button) | A button that does the same on click ¹ | `<button is="class-cycler-button">` |
| [localstorage-class-cycler](https://github.com/johnhenry/domkit/tree/main/src/cyclable/localstorage-class-cycler) | The same, as a JS function | |
| [localstorage-cycler](https://github.com/johnhenry/domkit/tree/main/src/cyclable/localstorage-cycler) | The engine: a persisted value with `next`/`previous`/`peek`/`set` | |

### Wiring things up from markup instead of scripts: `definable/`

| Module | What it's for | `global.mjs` registers |
|---|---|---|
| [define-component](https://github.com/johnhenry/domkit/tree/main/src/definable/define-component) | Register a custom element from a module URL | `<define-component>` |
| [define-component-by-content](https://github.com/johnhenry/domkit/tree/main/src/definable/define-component-by-content) | Register a markup-only custom element from an HTML string | `<define-component-by-content>` |
| [polyfill-window](https://github.com/johnhenry/domkit/tree/main/src/definable/polyfill-window) | Load a module onto `window` | `<polyfill-window>` |
| [until-window-load](https://github.com/johnhenry/domkit/tree/main/src/definable/until-window-load) | Hide content until the page has loaded | (strips the `until-window-load` class) |
| [definetag](https://github.com/johnhenry/domkit/tree/main/src/definable/definetag) | Curried `customElements.define` | |
| [event-consumer](https://github.com/johnhenry/domkit/tree/main/src/event-consumer) | Handle (and by default stop) events with inline code | `<event-consumer>` |

### Timing, collections, and small helpers

| Module | What it's for | `global.mjs` registers |
|---|---|---|
| [delay](https://github.com/johnhenry/domkit/tree/main/src/delay) | `await delay(ms)` | |
| [frame-delay](https://github.com/johnhenry/domkit/tree/main/src/frame-delay) | `await frameDelay(fps)`: an animation-frame-paced wait | |
| [internal-timer](https://github.com/johnhenry/domkit/tree/main/src/internal-timer) | An element that emits `tick` events at a fixed rate, with pause/resume | `<internal-timer>` |
| [live-query-selector](https://github.com/johnhenry/domkit/tree/main/src/live-query-selector) | `querySelectorAll` that stays current | |
| [create-mutable-nodelist](https://github.com/johnhenry/domkit/tree/main/src/create-mutable-nodelist) | A real `NodeList` you can push to and pop from | |
| [clamp](https://github.com/johnhenry/domkit/tree/main/src/clamp) | `clamp(min, max)(value)` | |

### Bootstrapping an app: `hydratable/`

| Module | What it's for |
|---|---|
| [hydratable](https://github.com/johnhenry/domkit/tree/main/src/hydratable) | A run-once async `hydrate()` (with `dehydrate()` to undo it) for any object |
| [hydratable/mounts](https://github.com/johnhenry/domkit/tree/main/src/hydratable/mounts) | Find or create the element at the start/end of `<body>` to render an app into |

### Experimental: `experimental/`

Sketches without the stable modules' guarantees. Their APIs can change in
any release. A composable canvas pixel pipeline (`imagedata-emitter` →
`pixel-shader` → `canvas-renderer`), `animate-paths` (self-drawing SVG),
`xy-grapher` (CSS scatter plots), and `chernoff-face`. See the
[experimental README](https://github.com/johnhenry/domkit/tree/main/src/experimental).

### Deprecated

`shadow-dom` is an alias for [domable](/domable/)'s
`` shadowOpen`<slot />` ``. Use domable directly.

¹ A *customized built-in* (`is="…"`). These work in Chromium and Firefox
but **not Safari**, unless you add a polyfill such as
[`@ungap/custom-elements`](https://github.com/ungap/custom-elements).

## How the package is laid out

- **One directory per module.** Related modules are grouped one level
  deeper (`matchable/`, `cyclable/`, `definable/`, `hydratable/`,
  `experimental/`), and the group is part of the import path.
- **`@johnhenry/domkit/<module>`** imports the module's `index.mjs`: an
  element class (unregistered) or a function. **`global.mjs`** registers
  the element under the tag in the tables above. Import the class instead
  for a different tag name.
- **No root import, on purpose.** These modules share no state or API,
  and a barrel would make every page download all of them, especially
  from a CDN where nothing tree-shakes.
- **Source is what ships.** There's no build step: modern JS, ES modules
  only.

Three modules import [domable](/domable/) by bare name, and
`query-container` imports `parsel-js`. esm.sh and bundlers resolve those
for you. Serving the raw source to a browser needs an import map, as the
repo's demos show. `event-consumer` and `infinite-combo` compile inline
code with `new Function`, so a strict Content-Security-Policy needs
`unsafe-eval` for those two.

## Stability

Everything outside `experimental/` is documented, covered by the test
suite (`node:test` + happy-dom, plus a checker that every documented
import path resolves), and changed only with a changelog entry. The
package is still pre-1.0, so read the
[changelog](https://github.com/johnhenry/domkit/blob/main/CHANGELOG.md)
when upgrading. Module paths have changed in past releases.

The repo's [`demo/`](https://github.com/johnhenry/domkit/tree/main/demo)
is a live gallery running most modules at once, each in its own iframe.

## Family

- [`domable`](/domable/) converts between HTML text, DOM nodes, and
  React-element-shaped objects, and builds custom-element classes from
  HTML strings. domkit depends on it (`simple-element` and `text-to-dom`)
  rather than vendoring a copy.

## History

Extracted from [`johnhenry/lib`](https://github.com/johnhenry/lib)'s
hot-linked modules in September 2026, then consolidated over several
releases. Duplicates of domable were dropped, related modules were grouped
into families, and the experiments were separated out. A run of bugs was
fixed along the way, most of them found by actually running the modules
in a browser. The
[changelog](https://github.com/johnhenry/domkit/blob/main/CHANGELOG.md)
has the full account.

## License

MIT

## Source

[github.com/johnhenry/domkit](https://github.com/johnhenry/domkit)
