---
title: "Getting started"
description: "Install @johnhenry/window-algebra, map its entry points for a no-build page, and run the pure core and a browser window manager."
sidebar:
  order: 1
---

## Install

```sh
npm install @johnhenry/window-algebra
```

:::note[Not on npm yet]
`@johnhenry/window-algebra` `0.0.0` is prepared but not yet published, so the install commands (and any `node_modules` or CDN paths) on these pages will not resolve until it is. Its source is at [github.com/johnhenry/window-algebra](https://github.com/johnhenry/window-algebra).
:::

**Provenance:** a new package, never published under another name. `0.0.0` is its first version under any name, not a sign of immaturity. Under npm's caret rules `^0.0.0` matches only `0.0.0`, so pin the exact version until a deliberate `0.1.0`.

Node ≥ 26 (`engines.node`) for the pure core in Node. In the browser, use it through a bundler, or with no build step through an import map. Import maps don't read `package.json` `exports`, so map each entry point you use to its file:

```html
<script type="importmap">
  {
    "imports": {
      "@johnhenry/window-algebra": "/node_modules/@johnhenry/window-algebra/src/index.mjs",
      "@johnhenry/window-algebra/browser": "/node_modules/@johnhenry/window-algebra/src/browser/index.mjs"
    }
  }
</script>
```

Entry points: `@johnhenry/window-algebra` (everything pure, plus the manager), `/browser` (renderer, input, surfaces, schedulers, pop-outs, cross-tab sync, the command palette), `/react`, `/element`, and the narrower `/algebra`, `/transforms`, `/layouts` and `/css`. See [the entry-point table](/window-algebra/api/#entry-points).

**TypeScript:** every entry point ships declarations (a `types` condition on each export), with `Command` and `Event` as discriminated unions keyed by `type` and exact payloads for all 58 commands. No build step and no `@types` package. See [TypeScript types](/window-algebra/api/types/).

## Quick start

**The pure core**, anywhere (Node, a worker, a test):

```js
import { createState, update, derive, compile, presentationContext, toHTML } from "@johnhenry/window-algebra";

let state = createState({ layout: { type: "master-stack", ratio: 0.6 }, config: { gap: 8 } });
for (const id of ["editor", "terminal", "browser"]) state = update(state, { type: "window/create", id }).state;

const out = update(state, { type: "window/focus", id: "nope" });
// out.events → [{ type: "command/rejected", command: "window/focus", id: "nope", reason: "unknown-window" }]

const tree = derive(state);                                 // a JSON layout-algebra tree
const html = toHTML(compile(tree, presentationContext(state))); // flex: 0.6 1 0 …, no pixels
```

**In the browser**, the manager drives a DOM renderer and an input adapter:

```js
import { createWindowManager, createState, BASE_CSS } from "@johnhenry/window-algebra";
import {
  createDomRenderer, attachInput, htmlSurface, createSurfaceRegistry, createFrameScheduler,
} from "@johnhenry/window-algebra/browser";

document.head.append(Object.assign(document.createElement("style"), { textContent: BASE_CSS }));
const root = document.querySelector("#desktop");          // give it a size
const surfaces = createSurfaceRegistry();
const wm = createWindowManager({
  state: createState({ layout: { type: "master-stack", ratio: 0.6 }, config: { gap: 6 } }),
  renderer: createDomRenderer({ root, surfaceFor: surfaces }),
  schedule: createFrameScheduler(), // many commands → one commit per frame
  history: true,                    // undo/redo for window management
});
attachInput({ root, wm });          // pointer, keyboard focus sync, drag and drop

surfaces.set("editor", htmlSurface(editorElement));
wm.create({ id: "editor", title: "Editor" });
wm.create({ id: "terminal", title: "Terminal" });
wm.create({ id: "calc", title: "Calculator", mode: "floating", placement: { x: 200, y: 100, width: 320, height: 240 } });

wm.setLayout({ type: "bsp" });
wm.undo();
```

A surface's markup opts into the pointer adapter: `data-wm-handle="move"` on a title bar, `data-wm-handle="resize-se"` on a grip, `data-wm-command="window/close"` on a button. See [Browser adapters › Markup contract](/window-algebra/api/browser/#markup-contract).
