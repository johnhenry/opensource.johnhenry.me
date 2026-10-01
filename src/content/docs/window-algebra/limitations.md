---
title: "Limitations and traps"
description: "What window-algebra does not do, traps first: saved-state gaps, collapsed stages, frozen hidden tabs, extension handlers, modifiers and custom layouts, surfaces, pop-outs and progressive browser features."
sidebar:
  order: 8
---

Traps first: behaviour that is deliberate and documented in the reference, but that you
will not guess from the API surface and that fails quietly. The broader limitations,
which follow from the design (a pure core with no pixels) and from uneven browser
support, come after.

## Traps

### State and commands

- **A version-1 saved state can lack `config.snap` and `config.urgency`.** Both keys
  entered the state without a version bump, and the `1 → 2` migration does not touch
  `config`, so a state saved before they existed loads without them. The library
  tolerates this, but your own code reading `state.config.snap.magnet` directly will
  throw. Read `{ ...DEFAULT_CONFIG.snap, ...state.config.snap }`, or dispatch
  `config/set { snap: { ...DEFAULT_CONFIG.snap } }` after loading. A bare
  `config/set { snap: {} }` stores an empty object, because `config/set` only merges
  into an **existing** plain object. See
  [Versioning](/window-algebra/api/versioning/).
- **Your extension handlers are not guarded.** Built-in commands reject bad input with a
  `command/rejected` event and never throw; `update` does not catch exceptions from your
  handlers. Keep them pure and total. An extension with the same `type` as a built-in
  **overrides** it, and `COMMANDS` still lists only the built-ins. To change what
  `window/drop` means for a layout, register a drop interpreter instead of overriding
  the command.
- **Gestures only coalesce consecutive commands.** Commands sharing a `gesture` token
  form one undo step and one log entry only while they arrive back to back; any other
  command in between splits the gesture.
- **`window/create` focuses the new window** unless you pass `focus: false`, or a rule
  sends it to a workspace other than the active one. A rule can also send it to a
  workspace that does not exist, which rejects the create as `unknown-workspace`.
- **Rejections leave history and the log untouched.** Only commands that change state
  are recorded, so a rejected or no-op command cannot be undone or replayed.

### Layouts and modifiers

- **An unknown modifier type is silently ignored** by `derive`; `layout/set` only checks
  that every entry is an object with a string `type`.
- **A custom modifier that changes screen axes does not remap drop zones.**
  `applyModifiersToOps` only knows the built-in modifiers.
- **Custom layout types are not resizable by `layout/resize-split`**, and they get the
  default reading-order drop interpreter unless you register one. To render splitters,
  put `resize: { path, weights }` on a row or column yourself and persist the weights.
- **A stateful custom layout needs a branch everywhere BSP has one.** `swapWindows`,
  `neighbourOrder` and `moveRelative` special-case stateful layouts; without a branch,
  swaps emit their events but nothing visibly moves. See
  [Adding a new layout](/window-algebra/adding-a-layout/).

### In the browser

- **The stage needs a size.** Tiled geometry is CSS's decision, so an unsized root
  lays out into nothing. The React stage host in particular collapses to 0 px without a
  height.
- **A hidden tab looks frozen.** `createFrameScheduler` commits on
  `requestAnimationFrame`, which a background tab never runs.
- **Browsers cache ES modules aggressively.** When you are checking a change, hard-reload
  with the cache disabled or you will be looking at the old module.
- **Keyboard focus and WM focus are two things kept in sync.** `attachInput` needs
  `subscribe` (or `wm`) to move DOM focus after a command-driven focus, and it never
  takes focus from a text field, select or `contenteditable` outside the stage.
- **A modal-blocked window is not itself `inert`, only its contents.** It stays
  hit-testable so a click on it redirects focus to the modal instead of falling through
  to the window underneath. Don't "fix" this by making the view inert.
- **Paint order is not `state.stack` order.** Tiled windows paint above the
  `background` layer and beneath everything else. Use `paintOrder`, never raw stacking
  order, for anything visual.
- **With several outputs, act on the stage's own workspace**
  (`outputActiveWorkspace(state, output)`), not `state.activeWorkspace`, which is the
  focused output's.

## Limitations

- **Several browser features are progressive, and the fallbacks differ.** CSS anchor
  positioning covers `flip` and an opposite-side `gravity`, but it has no equivalent for
  `slide`/`resize`, which work only under the JS fallback (`anchorFallback: true`,
  automatic where `CSS.supports("anchor-name: …")` is false). Without
  `Element.prototype.moveBefore`, a view moving between containers is re-inserted, and
  an iframe inside it reloads. Without View Transitions, `animate` is a no-op (by
  design, as it is under `prefers-reduced-motion`).
- **Pop-outs depend on the popup window.** `window.open` is subject to pop-up blockers:
  call `popOut` from a user gesture. A blocked popup is reported as a `popup-blocked`
  rejection, not an exception. Most browsers reload an iframe adopted into another
  document, so iframe state resets on the way out. A pop-in that doesn't go through
  `attachPopouts` (`window/restore`, undo) remounts the surface fresh instead of
  carrying the DOM back. A popped-out window is never the WM's focused window (focus is
  only given to windows on the stage), so focusing its popup clears the WM focus.
  Undoing a pop-out closes the popup; redoing it (or loading a saved state with a
  popped-out window) cannot reopen one without a user gesture, so `attachPopouts` pops
  the window back in instead of leaving it invisible.
- **The pure core has no pixels.** Tiled sizes are CSS's decision, so
  `config.drag.tooSmall: "reject"` is only enforced when a `geometry` estimate is
  supplied (the input adapter measures its ghost), size increments are advisory for
  tiled windows, and grid tracks are not resizable. `derive` and the renderer only see
  the layout; content that changes size without a commit needs `renderer.reposition()`
  for JS-positioned anchors, whose `ResizeObserver` watches only the stage root.
- **Some surfaces and observers are lazy.** A `lazySurface` builds on first mount and is
  never re-asked while its view stays rendered, so swapping a registry entry does not
  replace a mounted surface. `canvasSurface` repaints on resize only where
  `ResizeObserver` exists (it paints once otherwise). `<wa-stage>` creates a fresh
  manager on each connect or `configure()` unless you pass your own `wm`.
- **The pure `update` cannot know your custom layouts.** `layout/set` accepts any string
  `type`; `derive` falls back to `columns` for a type with no interpreter instead of
  throwing, and only the manager rejects it up front (`unknown-layout`). Stickiness is
  inherited by dialogs and popovers, and a workspace switch can still bring two
  fullscreen windows into view (a sticky one and one on the new workspace); only one is
  presented.
- **Keyboard accessibility is opt-in and partial.** Tabs and splitters work from the
  keyboard always; moving and resizing a floating window (Alt+Shift+Arrow,
  Ctrl+Alt+Shift+Arrow) needs `attachInput({ keyboard })`. Tabs use manual activation
  (arrows move focus, Enter/Space activates). Moves are not announced, and
  `workspace/rename` leaves `config.rules` that name the old id untouched.
- **The bindings commit once per animation frame.** `<wa-stage>` and
  `WindowManagerStage` coalesce commits with `createFrameScheduler()`, so a hidden tab
  (which never runs `requestAnimationFrame`) does not repaint until it is shown again.
  Pass `schedule: immediateScheduler` for synchronous commits.

## Non-goals

Replacing an operating-system window manager or compositor, and collaborative
synchronization (the deterministic command log makes it possible, but it is not built).
A runtime dependency is also a non-goal: the bindings take React as an argument rather
than importing it. See the [design document](/window-algebra/design/#non-goals-v0).
