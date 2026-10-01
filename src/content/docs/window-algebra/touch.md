---
title: "Touch and pen gestures"
description: "attachInput({ touch }): pinch to resize, swipe between tabs and workspaces, long-press for a context action, and the touch-action CSS each needs."
sidebar:
  order: 6.3
---

Everything in the pointer adapter is pointer-event based, so a finger or a pen already drags a floating window (its title bar sets `touch-action: none`) and drags a tiled window or a tab after a still long press. `touch` adds the gestures a mouse has no equivalent for. It is opt-in: without it nothing below is recognised, and a mouse is never touched by any of it.

```js
attachInput({ root, wm, touch: true });
attachInput({
  root, wm,
  touch: {
    pinch: true,
    swipe: { tabs: true, workspaces: false },
    contextMenu: (press) => openMenu(press),
    contextDelay: 500, slop: 10, swipeDistance: 48, workspaceSwipeDistance: 64,
  },
});
```

`touch: true` means pinch, tab swipes and a `contextMenu` that dispatches a bubbling `wm-contextmenu` event. Workspace swipes are off by default.

| Gesture | Pointers | Result |
| --- | --- | --- |
| Pinch | two touches on one floating window | `window/resize` per move with one shared `gesture` token (one undo step), honouring constraints |
| Tab swipe | one touch or pen, a horizontal stroke on a tab strip | `window/focus` on the next or previous tab, no wrap |
| Workspace swipe | two touches moving together horizontally | `workspace/activate` on the next or previous workspace of the stage's output |
| Long press | one touch or pen held still on a window | the `contextMenu` action; the native menu is suppressed |

A second finger always ends a single-finger gesture in progress, then starts a pinch or a workspace swipe. The pure math is exported as `createPinch`, `updatePinch` and `swipeOf`.

## touch-action

The browser keeps the touch gestures that `touch-action` allows, so each gesture needs its own rule. The adapter sets `data-wm-touch` on the root and `BASE_CSS` maps it: floating windows get `touch-action: none` (pinch), tab strips `pan-y`, the stage `pan-y` (workspace swipes). Without `BASE_CSS`, set the same rules yourself. The cost is that with `pinch` a floating window's own content cannot be panned by touch, and with workspace swipes nothing inside the stage scrolls horizontally by touch.

Under `config.direction: "rtl"` swipes mirror (see [Right-to-left layouts](/window-algebra/rtl/)).

Touch is driven with real multi-touch only in Chromium in the end-to-end suite. Full reference: [Browser adapters › Touch and pen](/window-algebra/api/browser/#touch-and-pen). Try it in `demo/touch.html`.
