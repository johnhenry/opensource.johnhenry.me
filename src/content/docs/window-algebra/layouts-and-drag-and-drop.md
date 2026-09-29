---
title: "Layouts, modifiers and drag-and-drop"
description: "Layout specs as plain data, persistent resizable splits, xmonad-style modifiers, and drops that edit structure rather than pixels."
sidebar:
  order: 4
---

Layout specs are plain data: `{ type: "master-stack", ratio }`, `{ type: "columns" }`, `{ type: "rows" }`, `{ type: "grid", min: 300 }`, `{ type: "spiral" }`, `{ type: "monocle" }`, `{ type: "tabs" }`, `{ type: "floating" }`, and the two stateful ones, `{ type: "bsp", tree }` and the n-ary docking `{ type: "tree", tree }` (row/column/tabs containers, in the style of i3, Dockview and GoldenLayout; `layout/to-tree` converts any layout into one). Add your own interpreters with `derive(state, { layouts })` or the manager's `layouts` option.

- **Persistent, resizable splits.** `layout/resize-split` stores sizes in the spec (a ratio, a BSP node, per-depth spiral ratios, or `sizes` arrays). `compile` renders a `[data-wm-splitter]` handle between resizable children, which you drag or nudge with the arrow keys.
- **Layout modifiers**, xmonad-style and serializable: `modifiers: [{ type: "smart-gaps" | "no-gaps" | "mirror" | "reflect-x" | "reflect-y" | "max-windows", ... }]`. Toggle between two whole layouts with `layout/toggle`.
- **Drag and drop edits structure, not pixels.** `window/drop { id, target, zone }` means insert-before/after, swap, split or add-as-tab depending on the layout, through a `DROPS` registry of drop interpreters that you can extend. `config.drag` controls the modes, edge zone, preview, detaching to floating, dropping floating windows into the layout, cross-workspace drops and a too-small check. Pinned windows (`draggable: false`) stay put. Children travel with their parent.

Full detail: [Layouts and modifiers](/window-algebra/api/layouts/) and [Drag and drop](/window-algebra/api/drops/).
