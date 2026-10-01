---
title: "compile and the browser"
description: "From layout tree to render tree to DOM: the renderer, the input adapter, surfaces, schedulers, pop-outs, and the React and custom-element bindings."
sidebar:
  order: 6
---

`compile(tree, presentationContext(state))` returns a render tree of `{ tag, key, attrs, style, children }`. It carries ARIA roles (`group`, `dialog` + `aria-modal`, `tablist`/`tab`/`tabpanel`, `separator`), state attributes (`data-focused`, `data-wm-blocked`, `data-wm-urgent`, …) and view elements keyed `view:<id>`. `toHTML` serializes it for server rendering or snapshots. Because every view is a size container, applications adapt with container queries without knowing how they were laid out:

```css
@container wm-view (width < 400px) { .sidebar { display: none; } }
```

In the browser (`@johnhenry/window-algebra/browser`):

- **`createDomRenderer({ root, surfaceFor, anchorFallback?, animate? })`** reconciles top-down and moves views with `moveBefore()` where available, so iframes, focus and playing media survive layout changes. It measures geometry, positions anchors with JS where CSS anchor positioning is missing, and animates commits with View Transitions (`animate`), skipping gestures and `prefers-reduced-motion`.
- **`attachInput({ root, wm })`** turns pointer and keyboard input into commands: floating move/resize with magnetism and snap zones; tiled drags with a ghost preview rendered by the same derive → compile pipeline; tab and splitter drags; touch long-press; keyboard focus kept in sync with WM focus; a modal focus trap; roving-tabindex tabs and labelled splitters that work from the keyboard; and opt-in F6 cycling, keyboard moving and resizing of floating windows (Alt+Shift+Arrow, Ctrl+Alt+Shift+Arrow, `floatStep`) and `aria-live` narration. A strong focus ring is drawn, and `prefers-reduced-motion` switches off transitions and animations.
- **Surfaces** share one contract, `{ mount(target), unmount() }`: `htmlSurface`, `lazySurface`, `iframeSurface`, `canvasSurface`, plus `createSurfaceRegistry`.
- **`createFrameScheduler()`** coalesces commits to one per frame. It is the default for `<wa-stage>` and `WindowManagerStage`; pass `schedule: immediateScheduler` for synchronous commits.
- **`attachInput({ touch: true })`** (opt-in) adds touch and pen gestures: pinch to resize a floating window, swipe between tabs or workspaces, long-press for a context action. See [Touch and pen gestures](/window-algebra/touch/).
- **Right-to-left** (`config.direction: "rtl"`, or the page's `dir`): the whole stage mirrors, master on the right, columns, tab strips and grids right to left, floating `x` from the right edge, drop zones, keyboard arrows, splitters and snap zones mirrored. See [Right-to-left layouts](/window-algebra/rtl/).
- **`attachPopouts({ wm, renderer })`** pops a window out into a real browser window, carrying its live DOM there and back. `data-wm-command` buttons work inside the popup, and `window/pop-in` there carries the DOM back.
- **`createPalette({ wm })`** is a command palette: it lists the commands that make sense for the current state, filters them by fuzzy text, prompts for payload fields and dispatches. See [The command palette](/window-algebra/palette/).
- **`attachSync({ wm, channel })`** (opt-in) keeps the tabs of one origin in step over a `BroadcastChannel`. See [Cross-tab sync](/window-algebra/sync/).

**Theming.** Every colour, radius, spacing, focus ring, splitter, title bar and shadow in the library's CSS is a `--wa-*` custom property, with light and dark defaults (OS preference or `data-theme`) and a `prefers-contrast: more` variant; override any of them on `:root`. See [Theming](/window-algebra/theming/).

Every option and attribute is in [compile and CSS](/window-algebra/api/compile/) and [Browser adapters](/window-algebra/api/browser/).

## Framework bindings

Neither binding adds a dependency.

- **React** (`@johnhenry/window-algebra/react`): `createReactBindings(React)` returns `useWindowManager`, `useWindowState(wm, selector)` and `<WindowManagerStage wm renderSurface createPortal>`, which renders window content as React portals while the WM owns layout and chrome.
- **Custom element** (`@johnhenry/window-algebra/element`): `defineWindowAlgebraElement()` registers `<wa-stage>`, a manager, renderer and input adapter for as long as the element is connected. `.configure({ wm, surfaceFor })`, `.wm`. `attachStage(host, options)` is the reusable core.

See [Framework bindings](/window-algebra/api/bindings/).
