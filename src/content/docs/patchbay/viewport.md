---
title: "Viewport"
description: "createViewport() pan/zoom state and math (zoomAt, fit, centerOn, visibleRect, boundsOf) and attachViewport() gestures: wheel, pinch, drag, Space, keyboard and data-patchbay-ignore."
sidebar:
  order: 2
---

## State and math: `createViewport()`

`createViewport({ x = 0, y = 0, zoom = 1, minZoom = 0.1, maxZoom = 4 })` is pure state, no DOM. It throws a
`RangeError` unless `0 < minZoom <= maxZoom`.

| Member | Does |
| --- | --- |
| `x`, `y`, `zoom`, `get()`, `set({ x, y, zoom })` | Read or replace the transform (zoom is clamped; non-finite values throw). |
| `panBy(dx, dy)` | Move the world by a screen delta. |
| `zoomAt(screenPoint, factor)` / `zoomTo(zoom, screenPoint)` | Zoom keeping the world point under `screenPoint` fixed, even when clamped. |
| `toWorld(screenPoint)` / `toScreen(worldPoint)` | Convert. |
| `visibleRect(size)` | The world rectangle a container of `size` shows. |
| `fit(rect, size, { padding = 24, maxZoom = 1 })` | Center `rect` and zoom to fit, never zooming in past `maxZoom`. |
| `centerOn(worldPoint, size)` | Center a point, keeping the zoom. |
| `transform()` | The CSS `translate(...) scale(...)` for the world element. |
| `subscribe(fn)` | Called with `{ x, y, zoom }` on every change; returns an unsubscribe function. |

`boundsOf(rects)` unions world rectangles (feed it to `fit`).

Details the table leaves out:

- **`set()` with nothing new does nothing**, and doesn't notify subscribers. Every method above that moves the view goes
  through `set()`, so they all clamp and validate the same way.
- **`zoomTo(zoom, point)` defaults `point` to `{ x: 0, y: 0 }`**, the stage's top-left corner, not its center. Pass the
  center (`{ x: width / 2, y: height / 2 }`) for a "reset zoom" button.
- **`fit()`'s `maxZoom` defaults to 1**, so fitting a small group never magnifies it past 100%. Pass a larger value if
  you want it to.
- **`boundsOf([])` returns `undefined`**, and `fit(undefined, ...)` throws. Guard the empty canvas.
- **`size` is yours to measure.** `fit`, `centerOn` and `visibleRect` take `{ width, height }`; pass the container's
  client size.

## Gestures: `attachViewport()`

`attachViewport(viewport, { container, world, wheel = "pan", wheelZoomSpeed, panOnDrag, keyboard = true })` returns
`{ coordinates, detach }` and:

- **wheel** pans and ⌘+wheel zooms about the cursor; `wheel: "zoom"` swaps those two. Ctrl+wheel and trackpad pinch
  (which browsers report as a Ctrl wheel) always zoom, at the same rate as ⌘+wheel. A mouse-wheel notch is capped to a
  modest zoom step (about 1.35×) so it doesn't jump.
- **drag** pans when `panOnDrag(event)` returns true; by default the middle button, a drag with Space held, or a primary
  drag that starts on empty canvas: the stage, the world element or the wire layer (not on your content).
- **keyboard**, while the stage has focus: `+`/`=`/`-` zoom, `0` resets to 100%, arrows pan (Shift for bigger steps).
- **`data-patchbay-ignore`** on any element inside the stage gives it back its own wheel and drag: a scrollable output
  panel, a map, an interactive animation camera.
- applies `transform()` to `world` and sets `--patchbay-x`, `--patchbay-y` and `--patchbay-zoom` on the container.

`container` is required (a `TypeError` otherwise); `world` is optional, for when you apply the transform yourself.
`wheelZoomSpeed` defaults to `0.006`.

### Traps in the gestures

- **Every wheel event over the stage is consumed** (`preventDefault()`), unless it starts inside a
  `data-patchbay-ignore` element. A stage embedded in a scrolling page stops the page from scrolling under the pointer.
- **A real Ctrl+wheel is indistinguishable from a pinch.** Both always zoom, so under `wheel: "zoom"` the pan-instead
  modifier is ⌘, not Ctrl.
- **Mouse notches and pinches differ by about 30× in delta.** Every zoom event's delta is capped, so one mouse notch is a
  modest step; test a real mouse notch and a real pinch after changing `wheelZoomSpeed`.
- **`panOnDrag` replaces the default entirely.** Supply one and the middle button, Space and empty-canvas rules are gone
  unless your function reimplements them.
- **Keyboard shortcuts need the stage itself focused.** They're ignored when focus is on a descendant, and when Ctrl, ⌘
  or Alt is held (so the browser's own Ctrl+0 / Ctrl+= keep working).
- **Space is tracked on the whole document**, outside inputs, text areas, selects and contenteditable. While it is held
  the container gets `data-patchbay-space`; while a pan drag is active it gets `data-patchbay-panning` (the stylesheet
  uses both for a grabbing cursor).
- **`detach()` removes the listeners and the subscription**, but leaves the last transform on `world` and the custom
  properties on the container.
- **Two-finger touch-screen pinch is not implemented yet.** Pinch zoom relies on the browser's Ctrl-wheel translation
  of trackpad pinches.
