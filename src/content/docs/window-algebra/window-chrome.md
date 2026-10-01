---
title: "Window chrome"
description: "chrome: true gives every window a title bar, buttons and resize grips: opt-in, accessible, themed by --wa-* tokens, right-to-left aware and touch-sized."
sidebar:
  order: 6.25
---

Every app that draws windows needs the same parts: a title bar with a title and buttons, a drag handle, resize grips. `chrome` ships them, built on the pointer adapter's markup contract, so there is nothing to re-implement. It is opt-in: without it a window is just its view element and your surface.

```js
import { createDomRenderer } from "@johnhenry/window-algebra/browser";

createDomRenderer({ root, surfaceFor, chrome: true });
createDomRenderer({ root, surfaceFor, chrome: { buttons: ["minimize", "maximize", "float", "popout", "close"] } });
// <wa-stage>.configure({ wm, surfaceFor, chrome }) and attachStage(host, { chrome }) take the same option
```

## What a window gets

Inside its view element, `[data-wa-chrome]` holds:

- a **title bar** (`data-wm-handle="move"`, double-click to maximize): an icon slot, the title (kept in step with the window's title on every commit; an untitled window shows its id) and a group of buttons;
- a **body**, where the window's surface mounts (`renderer.bodyFor(id)` returns it);
- **eight resize grips**, shown only while the window floats and is not maximized, minimized or popped out.

The buttons are minimize, maximize, float and close by default, plus an optional pop-out. Each is a real `<button>` that dispatches its command through the pointer adapter. A toggle is two buttons and CSS shows one, from the `data-mode` and `data-status` attributes `compile` writes on the view, so nothing is relabelled in JavaScript and the chrome keeps working inside a pop-out window. The pop-out button needs a pop-out handle: `attachStage` creates one by itself when `buttons` lists `"popout"` (exposed as `stage.popouts`); with your own wiring, pass `attachInput({ popouts })`.

## Options

`chrome` is `true` or an object:

| Option | What it does |
| --- | --- |
| `buttons` | Which buttons, in order: names from `CHROME_BUTTONS`, or `(id) => array` for per-window sets. An unknown name throws. |
| `icon` | `(id) => Node \| string \| null`: the icon slot at the start of the bar (text is set as text, never as HTML). |
| `icons` | A glyph per action, replacing the default characters. |
| `labels` | Accessible names per action, for translation. |
| `for` | `(id) => boolean`: return `false` to leave a window bare (a tooltip, a toast, a menu). |

`chromeSurface({ id, title, wm, body, buttons })` is the same chrome for one window as a surface, for a custom renderer. Do not combine it with `createDomRenderer({ chrome })`, which wraps every window itself.

## Accessible, themed, mirrored

- **Accessible.** Named buttons ("Close window: Editor"), keyboard operation, focus moves to the counterpart when a toggle hides the pressed button, and a body that scrolls becomes a focusable, labelled region.
- **Themed.** The CSS (`CHROME_CSS`, part of `RULES_CSS` and `BASE_CSS`) reads only `--wa-*` tokens: the `--wa-titlebar-*` colours, the focus ring, and five sizes, `--wa-chrome-bar-height`, `--wa-chrome-button-size`, `--wa-chrome-touch-target`, `--wa-chrome-grip-size` and `--wa-chrome-grip-touch`. See [Theming](/window-algebra/theming/).
- **Right-to-left.** It uses logical properties, so under `dir="rtl"` the icon and title come first on the right and the buttons sit at the left.
- **Touch-sized.** On coarse pointers the bar and buttons grow to 44 px and the grips get thicker; the bar and grips set `touch-action: none`.
- **Blocked windows.** A window blocked by a modal has its chrome inert.

## What it does not do

It is one look with tokens, not a design system. A window in a tab strip gets no title bar of its own (its tab is its title), a scrolling body is made focusable when it resizes or commits (not when its content grows inside a fixed size), and a hand-built title bar with `data-wm-handle` stays fully supported next to it. In Safari, Tab skips buttons unless the user enables it, so the buttons follow the browser's own rule.

Full reference: [Browser adapters › Window chrome](/window-algebra/api/browser/#window-chrome). Try it in `demo/chrome.html`.
