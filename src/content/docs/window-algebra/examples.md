---
title: "Examples"
description: "Six self-verifying Node scripts over the pure core, the interactive browser demos with their capability checklist, and the tests and benchmark that back them."
sidebar:
  order: 7
---

Two kinds of example live in the window-algebra repository.

- **`examples/`:** runnable, self-verifying Node scripts. Each one asserts the behavior it demonstrates and exits 0 on success, so `npm run examples` doubles as a smoke test (CI runs it). They exercise the pure core only (`update`, `derive`, `compile`, the manager, geometry). That is the same code that runs in the browser; only the DOM renderer and the pointer adapter are left out.
- **`demo/`:** interactive browser pages. They exercise the DOM renderer, the input adapter, surfaces, pop-outs, cross-tab sync, the command palette, touch gestures, right-to-left layout, theming and the framework bindings, which need a real browser. They are listed [below](/window-algebra/examples/#browser-demos-demo) and are **not** part of `npm run examples`.

| Example | Demonstrates |
| --- | --- |
| `01-state-derives-a-tree-that-compiles-to-css.mjs` | The whole pure pipeline runs in Node: `update` returns `{ state, events, effects }` and leaves the old state alone, `derive` produces a JSON layout tree, and `compile` turns a master-stack into `flex: 0.6 1 0` / `0.4 1 0` weights and a grid into `repeat(auto-fit, minmax(240px, 1fr))`. It produces CSS relationships, not pixel rectangles. |
| `02-bad-commands-are-rejected-and-history-replays.mjs` | Bad input (a duplicate id, an unknown window, command or layer, a `null` command, a layout no interpreter knows) becomes a `command/rejected` event and leaves state untouched (same reference). Nothing is thrown. A drag of 11 `window/move` commands sharing a `gesture` token undoes in one step. `replay(wm.origin, wm.log)` equals `wm.getState()`. `simulate()` changes nothing. |
| `03-a-drop-edits-structure-per-layout.mjs` | `window/drop` means different things per layout: insert before/after in `columns`/`rows`, split in `bsp`, add-as-tab in the docking `tree`. A `reflect-x` modifier flips `left` to mean "after". `config.drag.tiled: "swap"` rejects inserts (`zone-disabled`), a pinned window rejects the drag (`not-draggable`), and a custom layout gets its own interpreter via `createDropHandler`. |
| `04-saved-state-migrates-and-newer-state-is-refused.mjs` | `serialize()`/`load()` round-trips exactly. An unversioned (version 0) state migrates through `0 → 1 → 2`: drag settings, the urgent list and a single default output are backfilled, and the result works with `update`. A state from a newer build is refused (`future-version`), as is invalid JSON; `wm.load()` then fires `state/load-rejected` and keeps its current state. A successful `load()` reports the focus change too: `state/loaded`, then `window/focused`. |
| `05-rules-scratchpad-urgency-and-outputs-are-pure-policy.mjs` | Policy is decided in the pure core. Window rules fill in fields at `window/create`, and the caller's explicit fields win. Malformed rules are rejected. The scratchpad hides a window and brings it back floating and centered. `focus/urgent` crosses workspaces and clears the hint. Focusing a window behind a modal is redirected to the modal. Two outputs each derive their own workspace, and an output cannot give away its last workspace. |
| `06-popup-snap-and-size-hint-math-needs-no-dom.mjs` | `positionPopup` flips a menu above an anchor near the bottom edge only when `flip` allows that axis; `slide` and `resize` move it back into the stage or shrink it to fit. Snap zones resolve to halves and quarters, magnetism pulls an edge within 8 px onto a neighbour, and terminal-style size increments round 650×390 to 81×24 cells. Resizing a 16:9 window from its east edge adjusts the height. |

## Running

```sh
npm run examples      # run all in sequence
npm run example:01    # run one
node examples/01-state-derives-a-tree-that-compiles-to-css.mjs
```

The examples import the package by its own name (`@johnhenry/window-algebra`). Node resolves that to this checkout through the `exports` field (package self-reference), so they run unchanged when copied into a project that has the package installed.

## Runtime requirements (honest edition)

These examples run under **plain Node >= 26**, with no browser and no dependencies. They cover everything in the pure core. They deliberately do **not** cover the DOM renderer (`createDomRenderer`), the pointer/keyboard adapter (`attachInput`), pop-outs (`attachPopouts`), animation (View Transitions) or the React and custom-element bindings. Those need a real `document`, pointer events and layout. The unit tests cover their logic headlessly against a small fake DOM (`test/helpers/fake-dom.mjs`; see `test/browser.test.mjs`, `test/drag-input.test.mjs`, `test/popouts.test.mjs`, `test/react-bindings.test.mjs`, `test/element-bindings.test.mjs`), and the browser demos below exercise them for real.

## Browser demos (`demo/`)

Serve the repository root with any static server (for example `python3 -m http.server`) and open `/demo/`. ES modules don't load from `file://`. The hub page, `demo/index.html`, links every page and renders a capability checklist (`demo/shared/coverage.mjs`) showing which page exercises each primitive, transform, layout, command, rejection, policy, surface and event. Every page except `react.html` works offline.

| Example | Demonstrates |
| --- | --- |
| `demo/index.html` | The hub: links every page and computes the capability checklist from what each page declares it covers. |
| `demo/basic.html` | The minimal quick start: a manager, a DOM renderer, the input adapter and lazy surfaces. |
| `demo/playground.html` | Edit a layout tree as JSON or with constructors, apply every transform, and read the compiled CSS, `toHTML` output and render tree beside a live preview. |
| `demo/layouts.html` | Every derived layout (plus two custom interpreters) switchable live, small multiples of all of them at once, and divider drag via `updateRatio`. |
| `demo/desktop.html` | Workspaces, floating and tiled windows, dock panels, the 7 stacking layers, focus vs raise, nested modals with focus redirection, every role, keyboard shortcuts, snap zones, pop-out (with a "block next pop-out" toggle for the `popup-blocked` path) and the `animate` toggle. |
| `demo/console.html` | Compose any command, see a gallery of every rejection and the events and effects of each dispatch, plus undo/redo, a replay scrubber, serialize/restore, versioning and migration. |
| `demo/surfaces.html` | html, lazy, iframe (`srcdoc`) and canvas surfaces keep their state while windows move through layouts. |
| `demo/geometry.html` | Requested vs measured geometry, constraints on tiled windows, size hints (aspect ratio, width/height increments) with a live "80×24" cell readout, container queries, CSS anchors vs the forced JS fallback, and positioner rules (`gravity`/`flip`/`slide`/`resize`) with a "pin near a corner" overflow trigger. |
| `demo/palette.html` | The command palette: Ctrl/Cmd+Shift+P (or `createPalette({ wm })`) lists the commands that apply to the current state, filters them by fuzzy text, prompts for payload fields and dispatches. Shows the dispatched commands. |
| `demo/sync.html` | Cross-tab sync. Open the page in two tabs and change windows in either: `attachSync({ wm })` broadcasts a versioned state snapshot over a `BroadcastChannel`; last writer wins by Lamport clock, undo and redo sync, pop-outs stay in their tab. Shows this tab's id, clock and peers. |
| `demo/chrome.html` | The built-in window chrome (`chrome: true`): title bar with icon, title and buttons, resize grips, double-click to maximize, pop-out, right-to-left and touch sizing; scanned by the axe tests. |
| `demo/touch.html` | Touch and pen gestures through `attachInput({ touch })`: pinch a floating window to resize it, swipe on the tab strip to switch tabs, two-finger swipe to switch workspace, long-press a window for its menu. Has buttons for the same actions. |
| `demo/theming.html` | A theme editor over the `--wa-*` tokens: override any token, try presets, and read the overrides in effect and the computed token values. |
| `demo/rtl.html` | A right-to-left stage: `dir` on the root drives `config.direction` through `attachDirection`, and layouts, floating `x`, drop zones, arrow keys, splitters and snap zones mirror. |
| `demo/ide.html` | A realistic IDE built from the pieces: a custom grid-areas layout, tab stacks, a command palette, context menus, toasts, three workspaces and session persistence. |
| `demo/outputs.html` | Multiple outputs (sway-style displays): two stages side by side, each with its own workspaces, renderer and input adapter (`output` option), driven by one manager. Move workspaces between outputs and watch `focus/next` cross both. |
| `demo/element.html` | The `<wa-stage>` custom element: no framework, no build step, fully offline. |
| `demo/react.html` | The React bindings: `useWindowManager`, `useWindowState`, and `WindowManagerStage` with window content as React portals (and `stageRef` for its handles). **Loads React from esm.sh, so it needs network access.** |

## Tests and benchmark

`npm test` runs the pure core and the DOM adapters against a fake DOM (Node). `npm run test:types` type-checks a usage file against the shipped declarations. `npm run test:browser` drives the demo pages in **Chromium, Firefox and WebKit** with Playwright (keyboard tab navigation, floating move/resize by keyboard, drag-and-drop docking with real pointer events, focus following visible windows, pop-out, frame-coalesced commits, RTL, the command palette, touch gestures, cross-tab sync) and scans every demo page with axe-core, light and dark, which must find no serious or critical violation. CI runs the browser suite as its own `browser` job.

`npm run bench` (non-gating; `bench/run.mjs`) measures the pure core in Node and a real drag in browsers. The numbers below come from one run on an Apple M-series laptop, Node 24, with other work running, so read them as orders of magnitude and compare runs on your own machine. Browser frame times are paced at one pointer move per frame (a 60 Hz mouse); the drag drives a floating window across a stage of 100 views (`bench/drag.html`).

Throughput, 50 windows (master-stack), mixed commands:

| step | ops/s | µs/op |
| --- | ---: | ---: |
| update | 145,752 | 6.86 |
| update + derive | 21,403 | 46.72 |
| update + derive + compile | 8,744 | 114 |

Median time per call (ms):

| layout | derive 10 | +compile 10 | derive 100 | +compile 100 | derive 500 | +compile 500 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| master-stack | 0.01 | 0.03 | 0.07 | 0.20 | 0.53 | 1.27 |
| columns | 0.01 | 0.03 | 0.08 | 0.27 | 0.50 | 1.59 |
| rows | 0.01 | 0.02 | 0.08 | 0.26 | 0.49 | 1.59 |
| grid | 0.01 | 0.02 | 0.08 | 0.20 | 0.51 | 1.22 |
| spiral | 0.02 | 0.05 | 0.24 | 0.54 | 1.71 | 3.68 |
| bsp | 0.03 | 0.05 | 0.30 | 0.66 | 2.57 | 4.60 |
| tree | 0.01 | 0.03 | 0.09 | 0.30 | 0.57 | 1.77 |
| tabs | 0.01 | 0.03 | 0.09 | 0.29 | 0.59 | 1.78 |

Drag frame time, a floating window dragged over a stage of 100 windows (ms between frames):

| browser | windows | frames | p50 | p95 | max | frames over 20 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| chromium | 100 | 242 | 16.70 | 16.70 | 33.40 | 1 |
| webkit | 100 | 120 | 17.00 | 18.00 | 35.00 | 1 |

Writing the bench found two super-linear spots in deep trees, now fixed: `bspReconcile` was cubic (a 500-window BSP `derive` took about 340 ms, now about 3 ms) and `compile` built a view list per splitter (a 500-window spiral compile took about 90 ms, now about 4 ms).

`demo/shared/kit.mjs`, `demo/shared/style.css` and `demo/shared/coverage.mjs` are the demos' shared chrome, stylesheet (light/dark, phone-width layouts, reduced-motion-aware transitions) and checklist data.
