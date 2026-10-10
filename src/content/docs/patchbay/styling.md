---
title: "Styling"
description: "patchbay's optional stylesheet: a dot grid that pans and scales with the world, non-scaling wire strokes, and the --patchbay-* tokens with light-dark() defaults."
sidebar:
  order: 4
---

`@johnhenry/patchbay/patchbay.css` is optional: `.patchbay-stage` (a dot grid that pans and scales with the world),
`.patchbay-world`, `.patchbay-wires` and `.patchbay-wire` (`vector-effect: non-scaling-stroke`, so wires stay crisp at
any zoom). Tokens: `--patchbay-background`, `--patchbay-dot`, `--patchbay-grid`, `--patchbay-wire`,
`--patchbay-wire-width`, `--patchbay-wire-active`, with `light-dark()` defaults.

| Class | What the stylesheet gives it |
| --- | --- |
| `.patchbay-stage` | `position: relative`, `overflow: hidden`, `touch-action: none`, no focus outline, and the dot grid, positioned from `--patchbay-x` / `--patchbay-y` and sized by `--patchbay-grid` × `--patchbay-zoom`. A grabbing cursor while `data-patchbay-space` or `data-patchbay-panning` is set. |
| `.patchbay-world` | A zero-size, absolutely positioned box at the stage's top-left with `transform-origin: 0 0`. Your content overflows it, positioned in world units. |
| `.patchbay-wires` | A 1×1 px `<svg>` at the world's origin with `overflow: visible` and `pointer-events: none`. |
| `.patchbay-wire` | No fill; stroke `--patchbay-wire`, width `--patchbay-wire-width` (default `1.5px`), non-scaling. |
| `.patchbay-wire-pending` | The wire `connectDrag()` draws: stroke `--patchbay-wire-active`, dashed. |

The stage's custom properties (`--patchbay-x`, `--patchbay-y`, `--patchbay-zoom`) are set by `attachViewport()`
whether or not you load the stylesheet, so your own background or overlay CSS can follow the view too.

## Things to know

- **`light-dark()` defaults need a `color-scheme`.** Set `color-scheme: light dark` (or one of them) on the page or the
  stage, or the defaults stay on their light values.
- **The stage has no focus outline.** `outline: none` keeps the canvas clean, but the stage is focusable for keyboard
  zoom and pan; add your own `:focus-visible` style if keyboard users need to see where focus is.
- **`touch-action: none` hands every touch gesture on the stage to script.** Touch scrolling and browser pinch-zoom are
  off over it; patchbay pans on a touch drag that starts on the empty canvas, and has no two-finger pinch yet.
- **Wires ignore pointer events** (`pointer-events: none` on the `<svg>`, inherited by every path). Override it per path
  if wires need to be clickable.
- **A width that doesn't scale.** `vector-effect: non-scaling-stroke` keeps wires the same on-screen width at every zoom;
  remove it if you want wires to thicken as you zoom in.
