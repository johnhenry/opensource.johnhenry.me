---
title: "State, commands and events"
description: "State is one immutable object; commands express intent, events record what happened, effects are values for the effectful shell."
sidebar:
  order: 3
---

State is one plain object: windows, workspaces, outputs, focus with history, per-layer stacking, `config`. A **command** expresses intent. **Events** record what actually happened, which can differ: focus may be redirected to a modal, or a duplicate id rejected. **Effects** (`render`, `focus`) are values for the effectful shell.

```js
import { createState, update, reduce, replay, derive, COMMANDS } from "@johnhenry/window-algebra";

let state = createState({ workspaces: ["main", "dev"] });
const out = update(state, { type: "window/create", id: "editor" });
// out.events  → [{ type: "window/created", id: "editor" }, { type: "window/focused", id: "editor", previous: null }]
// out.effects → [{ type: "render" }, { type: "focus", id: "editor" }]
```

The 58 built-in commands (`COMMANDS`), each documented with payload, events, effects and rejections in [Commands](/window-algebra/api/commands/):

- **Windows:** `window/create`, `window/close` (cascades to child windows), `window/focus`, `window/blur`, `focus/next`, `focus/previous`, `window/raise`, `window/lower`, `window/set-layer`, `window/move`, `window/resize`, `window/set-mode`, `window/toggle-floating`, `window/minimize`, `window/maximize`, `window/fullscreen`, `window/restore`, `window/toggle-maximize`, `window/toggle-fullscreen`, `window/pop-out`, `window/pop-in`, `window/set-title`, `window/set-constraints`, `window/swap`, `window/promote`, `window/move-to-workspace`, `window/set-urgent`, `focus/urgent`
- **Drag and drop:** `window/drop`, `window/detach`, `window/swap-next`, `window/swap-previous`, `window/move-before`, `window/move-after`, `window/set-draggable`
- **Scratchpad and sticky:** `window/to-scratchpad`, `scratchpad/toggle`, `window/from-scratchpad`, `window/set-sticky`, `window/toggle-sticky`
- **Workspaces:** `workspace/create`, `workspace/activate`, `workspace/remove`, `workspace/rename`, `workspace/reorder`
- **Outputs:** `output/create`, `output/remove`, `output/focus`, `output/reorder`, `workspace/move-to-output`
- **Layout:** `layout/set`, `layout/set-ratio`, `layout/rotate-split`, `layout/resize-split`, `layout/toggle`, `layout/to-tree`
- **Config and rules:** `config/set`, `rules/set`

Add your own with `update(state, command, { "my/command": handler })`, or pass `extensions` to `createWindowManager`. The 47 event types are catalogued in [Events](/window-algebra/api/events/), and the read-only queries (`isVisible`, `focusable`, `paintOrder`, `modalTarget`, …) in [Queries](/window-algebra/api/queries/).

`createWindowManager` wraps all of this imperatively: `wm.dispatch`, `wm.create`/`focus`/`close`/…, `subscribe`, undo/redo (with `history: { limit, ignore }` or a per-command `history: false` to keep focus and stacking changes out of undo, 0.1.3: see [Keeping commands out of undo](/window-algebra/api/manager/#keeping-commands-out-of-undo)), a command log where `replay(wm.origin, wm.log)` always equals `wm.getState()`, `serialize`/`load` with [migration](/window-algebra/api/versioning/), and one renderer per output. See [The manager](/window-algebra/api/manager/).
