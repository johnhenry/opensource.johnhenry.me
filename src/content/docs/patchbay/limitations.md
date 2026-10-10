---
title: "Limitations and traps"
description: "What patchbay leaves to you (a CSS-transform canvas, no node model, wires that don't route, no touch pinch) and how to test its gestures headlessly when happy-dom drops wheel modifiers and has no layout."
sidebar:
  order: 5
---

## Limitations

- **It's a CSS transform.** Zooming scales your DOM, so text is re-rasterized (crisp in modern browsers) and very large
  worlds at very small zoom still lay out every node; cull off-screen nodes with `visibleRect()` if you have thousands.
- **No node model.** Positions, selection, snapping and undo are yours. `coordinates` plugs into a window manager that
  has them: [window-algebra](/window-algebra/)'s renderer and input adapter accept a coordinates hook from 0.1.1
  ([window-algebra#9](https://github.com/johnhenry/window-algebra/pull/9), not merged as of 2026-10-09).
- **Wires don't route around things.** They're single cubics; with many crossing wires, you get spaghetti, as on a real
  patch bay.
- **Multi-touch pinch** relies on the browser's Ctrl-wheel translation of trackpad pinches; two-finger touch-screen pinch
  is not implemented yet.

## Traps

The gesture traps (the stage consumes the wheel, `wheel: "zoom"` makes pinch pan, keyboard needs the stage itself
focused, `panOnDrag` replaces every default) are on the [Viewport](/patchbay/viewport/#traps-in-the-gestures) page. The
rest:

- **`data-patchbay-ignore` is checked with `closest()` from the event target, and only counts inside the stage.** Put it
  on the scrollable element or an ancestor of it within the stage; an ancestor outside the stage has no effect.
- **Every conversion goes through the container's client rect.** Code that subtracts `getBoundingClientRect()` of
  anything else breaks when the stage isn't at the page origin. Use `coordinates`.
- **Wires don't redraw themselves.** Call `wires.schedule()` after anything moves, including after the nodes' own
  layout changes size (a card that grew moves its ports).
- **One `attachViewport()` per stage.** Each call adds its own listeners; call `detach()` before attaching again (for
  example on hot reload), or wheel events get handled twice.

## Testing without a browser

The viewport math and `wirePath()` need no DOM and test under plain Node. The gesture code does, and
[happy-dom](https://github.com/capricorn86/happy-dom) differs from real browsers in two ways that matter here:

- **Its `WheelEvent` drops `ctrlKey`, `metaKey`, `clientX` and `clientY` from the init dictionary** (they read as
  `undefined`), while `deltaX`/`deltaY` survive. A test that dispatches `new WheelEvent("wheel", { ctrlKey: true, ... })`
  is not testing a Ctrl wheel. Copy the lost fields back onto the event before dispatching it:

  ```js
  const wheel = (target, init) => {
    const event = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
    const full = { ctrlKey: false, metaKey: false, clientX: 0, clientY: 0, ...init };
    for (const [key, value] of Object.entries(full)) {
      if (event[key] !== value) Object.defineProperty(event, key, { value });
    }
    return target.dispatchEvent(event);
  };
  ```

  Before release, the same gap made a missing `ctrlKey` read as a zoom gesture; the handler now coerces modifiers with
  `Boolean()`, so an `undefined` modifier means "not held".
- **It has no layout.** Every client rect is empty, so give the container a known rect in the test
  (`container.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600, ... })`) and don't rely on
  `anchorOf()` or `elementFromPoint`.

A headless test proves the logic, not the feel: mouse-wheel and trackpad deltas differ by about 30×. After changing
gesture code or `wheelZoomSpeed`, try a real mouse notch, a real pinch, and a scrollable `data-patchbay-ignore` panel in
the repository's browser example (`examples/04-cards-and-wires-in-a-browser/`).
