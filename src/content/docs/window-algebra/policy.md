---
title: "Policy at a glance"
description: "The window-manager policy the built-in commands encode, borrowed from xmonad, i3/sway, EWMH, ICCCM and Wayland."
sidebar:
  order: 5
---

The built-in commands encode window-manager policy borrowed from xmonad, i3/sway, EWMH, ICCCM and Wayland. The [commands reference](/window-algebra/api/commands/#shared-behaviour) has the exact rules.

- **Requested vs actual geometry.** `window/move`/`window/resize` store a request; `derive` uses it only for floating windows. Constraints (`minWidth`, …) apply to tiled windows as CSS min/max.
- **Size hints (ICCCM).** `aspectRatio` (exact or `{ min, max }`) and terminal-style `widthIncrement`/`heightIncrement`, honoured by `constrainSize` for floating move/resize. `geometry.sizeToCells` gives a live "80×24".
- **Focus is not stacking.** Raising on focus is a policy (`config.focusRaises`). Stacking is per layer (`background`, `normal`, `top`, `modal`, `popover`, `notification`, `system`), and raising a window raises its descendants above it. Tiled windows paint above the background layer and beneath everything else (`paintOrder`).
- **The modal graph.** Focusing a window with an open modal descendant focuses the deepest modal instead. A blocked window's contents are `inert`, but the window itself stays hit-testable, so a click on it redirects focus instead of falling through.
- **Roles are semantic.** `dialog` anchors to its parent's centre, `menu`/`popover`/`tooltip` anchor by side, and `notification` sits in a corner: `derive` decides, not the application.
- **Rules** (`config.rules`, like `ManageHooks` or `for_window`) set `mode`, `layer`, `workspace`, … at `window/create`. The caller's explicit fields always win.
- **Scratchpad (i3), sticky (EWMH), urgency (EWMH/X11), pop-out (GoldenLayout/Dockview), multiple outputs (sway).** All of these are pure state: `window/to-scratchpad` + `scratchpad/toggle`; `window/set-sticky`; `window/set-urgent` + `focus/urgent`; `window/pop-out`/`pop-in`; and `output/*` with a per-output `derive(state, { output })`.
- **Gestures are one step.** Commands sharing a `gesture` token form one undo step and one log entry, so a whole drag undoes at once.
- **Selection is not an edit.** `history: { ignore: ["window/focus", "window/raise", …] }` (or `history: false` on one command) applies and logs a command without making it an undo step, so undo skips focus and stacking changes. See [Keeping commands out of undo](/window-algebra/api/manager/#keeping-commands-out-of-undo).
- **Versioned state.** Every state carries `STATE_VERSION`, `migrate` upgrades older ones, and a newer one is refused (`state/load-rejected`), never half-loaded.
