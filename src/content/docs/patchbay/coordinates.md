---
title: "Coordinates"
description: "patchbay's three coordinate spaces (client, screen, world), the formula between them, and which function takes which: the coordinates hook from attachViewport() and the viewport's own toWorld/toScreen."
sidebar:
  order: 1
---

- **Client** pixels are what pointer events report.
- **Screen** pixels are relative to the stage container's top-left.
- **World** units are your content's own, unscaled: put nodes at world positions and never think about zoom again.

`screen = world × zoom + (x, y)`, and so `world = (screen − (x, y)) / zoom`, where `x`, `y` and `zoom` are the
viewport's state.

## Which function takes which

| Function | From | To |
| --- | --- | --- |
| `coordinates.toWorld(clientX, clientY)` | client | world |
| `coordinates.toStage(clientX, clientY)` | client | world (an alias, for libraries that call the world a "stage") |
| `coordinates.toLocal(clientX, clientY)` | client | screen |
| `coordinates.scale()` | | the current zoom (screen pixels per world unit) |
| `viewport.toWorld({ x, y })` | screen | world |
| `viewport.toScreen({ x, y })` | world | screen |
| `viewport.zoomAt(point, factor)`, `viewport.zoomTo(zoom, point)` | screen point | |
| `anchorOf(element, toWorld, options)` | an element's client rect | world |
| `createWires`'s `resolve(endpoint)`, `connectDrag`'s `from` | | world |

`coordinates` is what `attachViewport()` returns. It measures the container's client rect on every call, so it stays
right when the stage moves on the page (scrolling, layout changes). Code that subtracts the rect of anything else breaks
as soon as the stage isn't at the page origin.

Two different signatures share the name `toWorld`: the `coordinates` one takes two numbers in client pixels, the
viewport's takes a `{ x, y }` point in screen pixels.

## Dragging content

Drag code that converts both the start and the current pointer through `coordinates.toWorld` moves content 1:1 with
the cursor at any zoom:

```js
card.addEventListener("pointerdown", (down) => {
  const start = coordinates.toWorld(down.clientX, down.clientY);
  const origin = { x: node.x, y: node.y };
  const move = (event) => {
    const now = coordinates.toWorld(event.clientX, event.clientY);
    node.x = origin.x + (now.x - start.x);
    node.y = origin.y + (now.y - start.y);
    placeCard(node); // yours
    wires.schedule();
  };
  card.setPointerCapture(down.pointerId);
  card.addEventListener("pointermove", move);
  card.addEventListener("pointerup", () => card.removeEventListener("pointermove", move), { once: true });
});
```

A primary-button drag that starts on a card doesn't pan the canvas: by default only drags that start on the empty stage
or the world element do (see [Viewport](/patchbay/viewport/#gestures-attachviewport)).
