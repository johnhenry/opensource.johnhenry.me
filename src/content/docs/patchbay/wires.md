---
title: "Wires"
description: "patchbay's wires: wirePath() cubic path data, createWires() keyed SVG paths with frame-coalesced redraws, connectDrag() drag-to-connect with connect, drop and cancel outcomes, and anchorOf()."
sidebar:
  order: 3
---

| Export | Does |
| --- | --- |
| `wirePath(a, b, { from = "right", to = "left", curvature = 0.5, minHandle = 30 })` | SVG path data for a cubic from `a` to `b`, leaving `a` in direction `from` and arriving at `b` from side `to` (`right`, `left`, `up`, `down`). Pure. |
| `createWires({ svg, resolve, schedule })` | A keyed set of `<path>`s in a world-space `<svg>`. `resolve(endpoint)` maps an endpoint (a port id, an element, anything) to a world point; `undefined` hides the wire. Methods: `set(id, { from, to, className, shape, title })`, `delete`, `has`, `ids`, `element(id)`, `retain(ids)`, `update()` (now), `schedule()` (next frame, coalesced), `clear()`. |
| `connectDrag({ svg, event, from, toWorld, hitTest, onConnect, onDrop, onCancel, onHover, shape })` | Draws a pending wire from `from` to the pointer until release. Over a target (`hitTest` truthy): `onConnect(target, point)`; over empty space: `onDrop(point)`; Escape or pointercancel: `onCancel()`. `onHover(target)` fires as the target under the pointer changes. Returns `{ cancel }`. |
| `anchorOf(element, toWorld, { side, offset })` | A world point on a side of an element, measured from its client rect. |

## `wirePath(a, b, shape)`

`a` and `b` are world points. The two control points sit `max(minHandle, distance × curvature)` away from the ends, in
the `from` direction at `a` and on the `to` side of `b`, so a target behind its source still gets a wire that leaves
rightward and loops back in from the left. An unknown direction name falls back to the default (`right` for `from`,
`left` for `to`). Coordinates are rounded to two decimals. It touches no DOM.

## `createWires({ svg, resolve, schedule })`

- **The `<svg>` lives in world space**, inside the transformed world element, so wires pan and zoom with the content.
  `resolve` must return **world** points; the default `resolve` is the identity, for endpoints that already are
  `{ x, y }` points.
- **Wires don't follow things by themselves.** `set()` draws immediately; after that, call `update()` (now) or
  `schedule()` (once on the next frame, however many times you call it) whenever an endpoint moves.
  `schedule` defaults to `requestAnimationFrame`, falling back to `setTimeout(0)`.
- **`resolve` returning `undefined` for either end hides that wire** (`visibility="hidden"`) instead of removing it; it
  reappears on the next redraw that resolves both ends.
- **`set()` on an existing id updates it in place**: same `<path>`, new endpoints, class and title. `className` is
  added after `patchbay-wire`; `title` becomes an SVG `<title>` (a tooltip). The path also carries `data-wire="<id>"`.
- **`retain(ids)` deletes every wire not listed**, which makes syncing with a node graph one call:
  `wires.retain(edges.map(edgeId))` before re-`set`ting the current edges.
- **Only wires with a `title` receive pointer events with the stock stylesheet.** `patchbay.css` gives
  `.patchbay-wires` `pointer-events: none` so wires never block clicks on your content; a wire with a `title` gets
  `pointer-events: visibleStroke` so its tooltip shows. To make another wire clickable through `element(id)`, set
  `pointer-events: stroke` on its path. A drag that starts on a wire still pans, like empty canvas.

## `connectDrag(options)`

Call it from a `pointerdown` on a port. It draws a pending wire (class `patchbay-wire patchbay-wire-pending`, or
`className` if you pass one) and listens on the document, in the capture phase, until that pointer is released.

- `from` is a **world** point; `toWorld(clientX, clientY)` converts the pointer (pass `coordinates.toWorld`).
- `hitTest(clientX, clientY)` receives **client** coordinates, ready for `document.elementFromPoint`. Any value other than
  `undefined`, `null` or `false` counts as a target. `0` and `""` count too, so return `undefined` for "nothing here".
- On release over a target, `onConnect(target, worldPoint)`; over empty canvas, `onDrop(worldPoint)` (for example
  "create a node here"). Escape or `pointercancel` call `onCancel()`, as does the returned `cancel()`.
- `onHover(target)` runs whenever the target under the pointer changes, and once more with `undefined` when the drag
  ends over a target, so a highlight can be cleared in one place.
- Only the pointer from `event` is tracked; other pointers are ignored.

The pending wire is drawn inside your `svg`, so it pans and zooms with the world like every other wire. It doesn't stop
the viewport from panning: start it on a port element (content), not on the empty stage, so `attachViewport`'s default
drag-to-pan doesn't also fire.

## `anchorOf(element, toWorld, { side = "right", offset = 0 })`

Measures the element's client rect and converts the chosen point through `toWorld` (pass `coordinates.toWorld`).
`side` is `right`, `left`, `top`, `bottom` or `center` (anything else is treated as `center`); `offset` slides the point
along that side (vertically on `left`/`right`, horizontally on `top`/`bottom`). It is a good `resolve` for ports
rendered as DOM elements: `resolve: (portEl) => anchorOf(portEl, coordinates.toWorld)`. It needs layout: in a DOM without
one (happy-dom, jsdom) every rect is empty, so every anchor lands on the same point.
