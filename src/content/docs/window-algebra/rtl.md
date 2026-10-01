---
title: "Right-to-left layouts"
description: "config.direction and attachDirection mirror the whole stage: layouts, floating x, drop zones, arrow keys, splitters and snap zones."
sidebar:
  order: 6.4
---

`config.direction: "rtl"` mirrors the whole stage. Set it with `createState({ config: { direction: "rtl" } })`, with `config/set`, or let the page's `dir` drive it with `attachDirection`. A layout spec and the tree `derive` builds from it are identical in both directions: the compiled root carries `dir="rtl"` and CSS does the flipping.

| Layout | In RTL |
| --- | --- |
| `master-stack` | the master is on the right |
| `columns` | the first window is the rightmost column |
| `tabs` | the tab strip reads right to left |
| `grid` | each row fills from the right |
| `spiral`, `bsp`, `tree` | every horizontal split mirrors |
| `floating` | each window's `x` is measured from the right edge |

`compile` emits logical insets (`inset-inline-start`/`-end`, `inset-block-*`) for `place`, and `anchor` sides and gravity are logical too. `window/drop` zones name the screen side the pointer is on, and the layout maps them to its own mirrored zone.

## In the browser

The input adapter works in screen terms, so every gesture does what it looks like: floating move, resize, snap zones, magnetism and pinch follow the pointer; drop zones and the tab-drag insertion point mirror; the left and right arrows swap on tabs and splitters; `Alt+Shift+←` still moves a floating window left on screen; swipes toward the inline-start edge go to the next tab or workspace.

`attachDirection({ wm, element })` (also `attachStage`'s `direction: "auto"`, the default) reads an explicit `dir` on the stage or an ancestor, or a computed `direction: rtl`, dispatches `config/set { direction }` when it differs, and watches `dir` changes. A page with no `dir` leaves the config alone. `pageDirection(element)` is the pure read. Cross-tab sync keeps the direction per tab.

## Caveats

Window content inherits `dir="rtl"` from the stage root, so set `dir="ltr"` on content that must not flip. A floating window's `placement.x` is measured from the right edge under RTL, so a saved placement does not carry across a direction change.

References: [Layouts › Right-to-left](/window-algebra/api/layouts/#right-to-left) and [Browser adapters › Right-to-left](/window-algebra/api/browser/#right-to-left). Try it in `demo/rtl.html`.
