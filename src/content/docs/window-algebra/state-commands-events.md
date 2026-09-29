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

The 51 built-in commands (`COMMANDS`), each documented with payload, events, effects and rejections in [Commands](/window-algebra/api/commands/):

- **Windows:** `window/create`, `window/close` (cascades to child windows), `window/focus`, `window/blur`, `focus/next`, `focus/previous`, `window/raise`, `window/lower`, `window/set-layer`, `window/move`, `window/resize`, `window/set-mode`, `window/toggle-floating`, `window/minimize`, `window/maximize`, `window/fullscreen`, `window/restore`, `window/pop-out`, `window/pop-in`, `window/set-title`, `window/set-constraints`, `window/swap`, `window/promote`, `window/move-to-workspace`, `window/set-urgent`, `focus/urgent`
- **Drag and drop:** `window/drop`, `window/detach`, `window/swap-next`, `window/swap-previous`, `window/move-before`, `window/move-after`, `window/set-draggable`
- **Scratchpad and sticky:** `window/to-scratchpad`, `scratchpad/toggle`, `window/set-sticky`
- **Workspaces:** `workspace/create`, `workspace/activate`, `workspace/remove`
- **Outputs:** `output/create`, `output/remove`, `output/focus`, `workspace/move-to-output`
- **Layout:** `layout/set`, `layout/set-ratio`, `layout/rotate-split`, `layout/resize-split`, `layout/toggle`, `layout/to-tree`
- **Config and rules:** `config/set`, `rules/set`

Add your own with `update(state, command, { "my/command": handler })`, or pass `extensions` to `createWindowManager`. The 44 event types are catalogued in [Events](/window-algebra/api/events/), and the read-only queries (`isVisible`, `focusable`, `paintOrder`, `modalTarget`, …) in [Queries](/window-algebra/api/queries/).

`createWindowManager` wraps all of this imperatively: `wm.dispatch`, `wm.create`/`focus`/`close`/…, `subscribe`, undo/redo, a command log where `replay(wm.origin, wm.log)` always equals `wm.getState()`, `serialize`/`load` with [migration](/window-algebra/api/versioning/), and one renderer per output. See [The manager](/window-algebra/api/manager/).
