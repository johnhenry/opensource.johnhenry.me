---
title: "Limitations and traps"
description: "What window-algebra does not do, traps first: saved-state gaps, collapsed stages, frozen hidden tabs, extension handlers, modifiers and custom layouts, surfaces, pop-outs, sync, touch, RTL and progressive browser features."
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
- **Right-to-left mirrors the horizontal axis of the whole stage, not its content.** Window content inherits `dir="rtl"` from the stage root (set `dir="ltr"` on content that must not flip). A floating window's `placement.x` is measured from the right edge under `rtl`, so a saved placement does not carry across a direction change. The page's `dir` is followed through an explicit `dir` attribute (or computed `direction: rtl`); a page with none leaves `config.direction` alone.
- **The command palette lists commands, not targets.** It asks for the common payload fields only (`window/create` takes an id and a title, `layout/set` a layout type without options; JSON fields cover the rest), and `window/pop-out` opens a real browser window only when you give it your `attachPopouts` handle. Its default shortcut can be reserved by a browser (Firefox's private window), so it is configurable.
- **Browser coverage is real but not exhaustive.** Touch is driven with real multi-touch only in Chromium (Playwright has no multi-touch in Firefox or WebKit, where the same pointer streams are dispatched as synthetic `PointerEvent`s), and the end-to-end tests run on the demo pages, not on every combination of options.
- **The built-in chrome is one look with tokens, not a design system.** Its buttons use text glyphs (replaceable with `icons`), a scrolling body is made focusable when it resizes or commits, not when its content grows inside a fixed size, a window in a tab strip has no title bar of its own, and a hand-built title bar (`data-wm-handle`) stays fully supported next to it. In Safari, Tab skips buttons unless the user enables it, so the chrome buttons follow the browser's own rule. See [Window chrome](/window-algebra/window-chrome/).
- **A strict `style-src` blocks two inline sheets.** Setting `BASE_CSS` as a `<style>`'s text and the palette's injected `<style>` are inline styles; write `BASE_CSS` and `PALETTE_CSS` to a `.css` file and pass `injectStyles: false` to `createPalette`. See [Theming](/window-algebra/theming/#under-a-strict-content-security-policy).
- **Cross-tab sync is same-origin and last-writer-wins.** `attachSync` shares whole logical states over a `BroadcastChannel`; it is not collaboration between users, it does not merge concurrent edits (the loser's change is dropped), it syncs no surfaces or DOM, and pop-outs stay in the tab that opened them (peers see the window minimized). Two tabs that never changed anything share nothing, so seed them identically.
- **Touch gestures are opt-in and trade scrolling for recognition.** Pinch needs `touch-action: none` on floating windows (their content cannot be panned by touch) and the two-finger workspace swipe needs `pan-y` on the stage (nothing inside scrolls horizontally by touch). Pinch and the workspace swipe are touch-only, a pen being one pointer. Moving or docking a tiled window by touch still needs a still long press, so it does not compete with scrolling.
- **The bindings commit once per animation frame.** `<wa-stage>` and
  `WindowManagerStage` coalesce commits with `createFrameScheduler()`, so a hidden tab
  (which never runs `requestAnimationFrame`) does not repaint until it is shown again.
  Pass `schedule: immediateScheduler` for synchronous commits.

## Non-goals

Replacing an operating-system window manager or compositor, and multi-user
collaborative synchronization (the deterministic command log makes it possible, but it
is not built; syncing one user's tabs is `attachSync`).
A runtime dependency is also a non-goal: the bindings take React as an argument rather
than importing it. See the [design document](/window-algebra/design/#non-goals-v0).
