---
title: "Marks and layers"
description: "What a mark receives (positions, bands, ranges, color, size), template bindings, building marks from script, and writing a new layer."
sidebar:
  order: 2
---

## What a mark gets

`<plot-marks>` stamps its `<template>` once per row (or a dot) and sets
custom properties on each copy:

| Custom property | From | Meaning |
|---|---|---|
| `--x`, `--y` | `x`, `y` | 0–1, from the left and from the bottom |
| `--bandwidth`, `--bandheight` | a banded x or y | The band's share of the width or height |
| `--x2`, `--x-start`, `--x-length` | `x2` | A range's other end, its left end, and its width |
| `--y2`, `--y-start`, `--y-length` | `y2` | The same, vertically |
| `--color` | `color` | A CSS color |
| `--size` | `size` | 0–1 |
| `--index`, `--count` | `repeat` | Which copy of the row, and how many |

The default CSS centers a mark on `--x`/`--y` and stretches a range between
its ends. Everything else is yours. A bar is a mark CSS stands on the axis:

```css
data-plot > plot-marks > .bar {
  bottom: 0;
  translate: -50% 0;
  block-size: calc(var(--y) * 100%);
  inline-size: calc(var(--bandwidth) * 100%);
  background: var(--color, steelblue);
}
```

A heatmap cell is `--bandwidth` by `--bandheight`; a Gantt bar is
`x="start" x2="end"`; a waffle chart is `repeat="count"` with no plot,
laid out by a CSS grid.

Rows keep their element between draws (by `key`, else by position), and
`--x`, `--y`, `--size`, and the range properties are registered, so a CSS
transition animates updates.

## Template bindings

- `:attr="field"` sets `attr` to the row's `field` scaled 0–1 (on the
  plot's scale when a channel already maps that field). That's how a
  glyph's features follow data: `<chernoff-face :smile="morale">`.
- `{field}`, in an attribute or in text, fills in the raw value:
  `title="{city}: {mm} mm"`.

## From script

The same API both ways: every attribute has a matching property
(`marks.x = "rain"`, `plot.yDomain = "0 auto"`), `.data` sets rows, and
`render` fires after each draw.

```js
marks.mark = (row, previous) => {
  const star = previous ?? Object.assign(document.createElement("span"), { textContent: "★" });
  star.title = row.name;
  return star; // the same element updates in place
};
```

## A new layer

Extend `PlotLayer` (draws only inside a plot) or `DataLayer` (can also bring
its own rows and draw alone), both exported. The plot calls `draw()` with
`{ rows, scales, unit, describedByTable }`; a layer that maps fields lists
them in `channels()` so the plot's scales cover its rows. Every child of
the frame (except sources and the legend) fills the plotting area, so a
layer draws inside it:

```js
import { PlotLayer } from "@johnhenry/data-plot";

// <plot-rule value="2000">: a horizontal reference line.
class PlotRule extends PlotLayer {
  static observedAttributes = ["value"];
  draw(context) {
    super.draw(context); // keeps aria-hidden in step with the data
    const y = context.scales.y?.(Number(this.getAttribute("value")));
    if (Number.isFinite(y)) this.style.setProperty("--y", String(y));
    if (!this.firstElementChild) this.append(document.createElement("span"));
  }
}
customElements.define("plot-rule", PlotRule);
```

```css
plot-rule > span { position: absolute; inset-inline: 0; bottom: calc(var(--y) * 100%); border-block-start: 2px dashed; }
```
