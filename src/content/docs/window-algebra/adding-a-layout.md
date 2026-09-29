---
title: "Adding a new layout"
description: "A custom interpreter with no core change, or a genuinely new built-in layout: the pattern every built-in follows, with the docking tree as the worked example."
sidebar:
  order: 9
---

The docking tree (`{ type: "tree" }`, commit `7ef2291`, with a follow-up fix in `067191b`) is the best worked example in this package's own history. It is the most recent built-in layout, and it is the harder of the two kinds: it is **stateful**, like BSP, so its structure lives in the spec and has to stay in sync with the windows. Its tests are `test/tree.test.mjs`, and `demo/layouts.html` and `demo/desktop.html` show it running.

**Smallest: a custom interpreter, no core change.** If your layout is a pure function of the tiled ids, like "one big window and the rest in a column", register it under a new `type` with the manager's `layouts` option (or `derive(state, { layouts })`): `(spec, ids, context) → tree`, built from the primitives. `layout/set` accepts it, it serializes, drops fall back to reading order, and you can give it a drop interpreter with the `drops` option (`orderDrops(() => "y")`). The whole cost is the function. A built-in is warranted only when the layout needs **state that must survive between renders** (a tree, per-split sizes) or has to reach into commands the core owns (seeding, keyboard neighbour order, `layout/to-tree`, `layout/resize-split`).

**A genuinely new built-in layout: the docking `tree`.** Each existing layout follows the same small pattern:

1. **`src/layouts/<name>.mjs`**: the pure helpers. `treeToLayout` interprets the stored structure as primitives. A stateless layout needs only this function (see `columns` in `src/layouts/index.mjs`). Re-export it from `src/layouts/index.mjs`.
2. **`src/state/derive.mjs`**: a `LAYOUTS` entry, `(spec, ids, context) → tree`, a copy of `bsp`'s own.
3. **`src/state/drops.mjs`**: a `DROPS` entry, `orderDrops(axis)` for an order-based layout, or `{ ops, apply }` for a stateful one (`treeDrops` beside `bspDrops`).
4. **The one part that isn't boilerplate: keeping stored structure honest.** `treeReconcile(spec.tree, ids)` runs inside the interpreter and the drop interpreter, dropping leaves for windows that are gone and appending new ones. Because of it, `window/create`, `window/close`, `window/set-mode` and every other command need **zero** awareness that the tree exists: the stored tree is repaired lazily whenever it is read. BSP does the same thing eagerly (`bspAdd`/`bspDrop` in `src/state/update.mjs`), which is why it touches more commands. What remains in `src/state/update.mjs` is seeding (`layout/set` fills an absent `tree` from the current order), the `layout/to-tree` conversion, and a `layout/resize-split` branch if it is resizable (emit `resize: { path, weights }` on each row/column, and teach `readSplitWeights` in `src/browser/input.mjs` its path scheme).

Why the keyboard commands need care: `067191b` fixed `window/swap-next` and `window/move-before` on tree workspaces. `swapWindows` and `neighbourOrder` special-cased only `bsp`, so swaps reordered `ws.windows` but not the tree, and nothing visibly moved. A new stateful layout must add its branch to `swapWindows`, `neighbourOrder` and `moveRelative` in `src/state/drops.mjs`, and a test that swaps a nested leaf.

**Tests.** Everything above is pure, so `test/tree.test.mjs` runs in plain Node with no DOM: the helpers, `derive`, `layout/set` and `layout/to-tree`, `layout/resize-split`, `window/drop` per zone, the keyboard commands, and undo/replay/serialization. Add the layout to `demo/layouts.html` and to the checklist in `demo/shared/coverage.mjs`.

A layout **modifier** (`smart-gaps`, `mirror`, …) is the other extension point, for decorating an existing layout rather than adding one. It is one `MODIFIERS` entry, plus an `applyModifiersToOps` case if it changes screen axes. See [Layouts › Layout modifiers](/window-algebra/api/layouts/#layout-modifiers).
