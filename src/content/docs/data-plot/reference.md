---
title: "Reference"
description: "Every data-plot element's attributes, properties, methods, events, and CSS custom properties, generated from the code."
sidebar:
  order: 3
---

<!-- Generated: copied from data-plot's docs/reference.md, which is generated from custom-elements.json. Re-copy it when data-plot changes. -->

Every stable element's attributes, properties, methods, events, and CSS custom properties, generated from the code. Each element's guide (linked) explains how to use it.

## `<chernoff-face>`

A face whose features show data: each is a number from 0 to 1. [Guide](https://github.com/johnhenry/data-plot/blob/main/src/chernoff-face/readme.md) · module `@johnhenry/data-plot/chernoff-face`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `face-width` |  | `number` | 0 narrow … 1 wide. Default 0.5, like every feature. |
| `eye-size` |  | `number` | 0 small … 1 large eyes. |
| `eye-spacing` |  | `number` | 0 close … 1 far-apart eyes. |
| `pupil-size` |  | `number` | 0 small … 1 large pupils. |
| `gaze` |  | `number` | 0 looking left … 1 looking right. |
| `brow-slant` |  | `number` | 0 angry … 1 worried brows. |
| `nose-length` |  | `number` | 0 short … 1 long nose. |
| `mouth-width` |  | `number` | 0 narrow … 1 wide mouth. |
| `smile` |  | `number` | 0 frown … 1 smile. |
| `mouth-open` |  | `number` | 0 closed … 1 open mouth. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `features` | `Record<string, number>` | Every feature's current value (0–1), keyed in camelCase (`{ eyeSize: 0.5, smile: 0.9, … }`). Setting it writes the matching attributes; keys you leave out are unchanged. |

**CSS custom properties**

| Property | Description |
|---|---|
| `--chernoff-face-fill` | Fill of the face (index.css). |
| `--chernoff-face-stroke` | Line color (index.css; defaults to currentColor). |

## `<data-plot>`

A plot's frame: data, scales, and the layers drawn in it. [Guide](https://github.com/johnhenry/data-plot/blob/main/src/data-plot/readme.md) · module `@johnhenry/data-plot/data-plot`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `src` | `src` | `string` | `#id` of a `<table>`, `<datalist>`, or `<script type="application/json">` in the page. Default: one inside the plot. |
| `x-domain` | `xDomain` | `string` | The x scale's ends, like `0 100` (`auto` keeps one end automatic). Numbers only. |
| `y-domain` | `yDomain` | `string` | The y scale's ends, like `0 auto`. |
| `x-padding` | `xPadding` | `number` | On a banded x scale, the share of each band left empty, 0–1. Default 0.2. |
| `y-padding` | `yPadding` | `number` | The same for a banded y scale. |
| `column-field` | `columnField` | `string` | With `value-field`, reads a grid table (a row per item, a column per category): its column headers become this field. |
| `value-field` | `valueField` | `string` | With `column-field`: the field each cell's value becomes. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `scales` | `Record<string, Function>` | The scales from the last draw, by channel (`x`, `y`, `color`, `size`). |
| `data` | `object[]` | The plot's rows: from `src`, a source inside it, or set here. Setting it (any iterable of objects or arrays) replots, until `src` changes or it's set to null. Changing the array in place needs `requestRender()`. |
| `src` | `string` | Mirrors the `src` attribute. |
| `xDomain` | `string` | Mirrors the `x-domain` attribute. |
| `yDomain` | `string` | Mirrors the `y-domain` attribute. |
| `xPadding` | `number` | Mirrors the `x-padding` attribute. |
| `yPadding` | `number` | Mirrors the `y-padding` attribute. |
| `columnField` | `string` | Mirrors the `column-field` attribute. |
| `valueField` | `string` | Mirrors the `value-field` attribute. |

**Methods**

| Method | Description |
|---|---|
| `requestRender()` | Redraws on the next microtask; several requests in one task draw once. |
| `render()` | Draws every layer now, then fires `render`. |

**Events**

| Event | Description |
|---|---|
| `render` | After every draw. |
| `error` | The data couldn't be read (bad JSON, or an unsupported `src`). An `ErrorEvent`; the previous data stays plotted. |

**CSS custom properties**

| Property | Description |
|---|---|
| `--plot-margin` | Space around the plotting area for axes, like `inset`. Default `16px 16px 32px 48px`. |
| `--plot-height` | Default height. Default `300px`. |

## `<plot-axis>`

Tick labels and gridlines for one of the plot's scales. [Guide](https://github.com/johnhenry/data-plot/blob/main/src/plot-axis/readme.md) · module `@johnhenry/data-plot/plot-axis`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `scale` | `scale` | `"x" \| "y"` | Which scale. Default `x`. |
| `ticks` | `ticks` | `number` | About how many ticks, on a numeric scale. Default (0): 6 for x, 5 for y. |
| `label` | `label` | `string` | A title for the axis. |
| `grid` | `grid` | `boolean` | Draw gridlines at the ticks. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `scale` | `string` | Mirrors the `scale` attribute. |
| `ticks` | `number` | Mirrors the `ticks` attribute. |
| `label` | `string` | Mirrors the `label` attribute. |
| `grid` | `boolean` | Mirrors the `grid` attribute. |
| `plot` (read-only) | `HTMLElement \| null` | The `<data-plot>` this layer is directly inside, or null. |

**Methods**

| Method | Description |
|---|---|
| `requestRender()` | Redraws soon: through its plot, or by itself when it can draw alone. Several requests in one task draw once. |

## `<plot-legend>`

A key to the plot's colors. [Guide](https://github.com/johnhenry/data-plot/blob/main/src/plot-legend/readme.md) · module `@johnhenry/data-plot/plot-legend`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `label` | `label` | `string` | A title for the legend. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `label` | `string` | Mirrors the `label` attribute. |
| `plot` (read-only) | `HTMLElement \| null` | The `<data-plot>` this layer is directly inside, or null. |

**Methods**

| Method | Description |
|---|---|
| `requestRender()` | Redraws soon: through its plot, or by itself when it can draw alone. Several requests in one task draw once. |

## `<plot-line>`

A line through the rows, one per series. [Guide](https://github.com/johnhenry/data-plot/blob/main/src/plot-line/readme.md) · module `@johnhenry/data-plot/plot-line`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `x` | `x` | `string` | Field for horizontal position. |
| `y` | `y` | `string` | Field for vertical position. |
| `color` | `color` | `string` | Field that splits the rows into series, each its own color. |
| `src` | `src` | `string` | `#id` of a `<table>`, `<datalist>`, or JSON `<script>` with this layer's own rows. Default: one inside it, else its plot's rows. |
| `column-field` | `columnField` | `string` | Reads a grid table, as on `<data-plot>`. |
| `value-field` | `valueField` | `string` | See `column-field`. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `x` | `string` | Mirrors the `x` attribute. |
| `y` | `string` | Mirrors the `y` attribute. |
| `color` | `string` | Mirrors the `color` attribute. |
| `src` | `string` | Mirrors the `src` attribute. |
| `columnField` | `string` | Mirrors the `column-field` attribute. |
| `valueField` | `string` | Mirrors the `value-field` attribute. |
| `data` | `object[]` | The rows drawn: its own (from `src`, a source inside it, or set here), else its plot's. Setting it replots, until `src` changes or it's set to null. Changing the array in place needs `requestRender()`. |
| `ownRows` (read-only) | `object[] \| null` | Its own rows, or null when it uses its plot's. |
| `readable` (read-only) | `boolean` | True when its own data is a table assistive technology can read. |
| `plot` (read-only) | `HTMLElement \| null` | The `<data-plot>` this layer is directly inside, or null. |

**Methods**

| Method | Description |
|---|---|
| `requestRender()` | Redraws soon: through its plot, or by itself when it can draw alone. Several requests in one task draw once. |

**Events**

| Event | Description |
|---|---|
| `render` | After it draws, when alone (inside a plot, the plot fires it). |
| `error` | Its own data couldn't be read. |

**CSS custom properties**

| Property | Description |
|---|---|
| `--color` | A series' color, set on its `<path>`. Default `currentColor`. |

## `<plot-marks>`

One element per row, from a template, placed with CSS custom properties. [Guide](https://github.com/johnhenry/data-plot/blob/main/src/plot-marks/readme.md) · module `@johnhenry/data-plot/plot-marks`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `x` | `x` | `string` | Field for horizontal position. Sets `--x` (0 left … 1 right) and, on a banded scale, `--bandwidth`. |
| `y` | `y` | `string` | Field for vertical position. Sets `--y` (0 bottom … 1 top) and `--bandheight`. |
| `x2` | `x2` | `string` | Field for the other end of a horizontal range, on x's scale. Sets `--x2`, and `--x-start`/`--x-length` (the range's left end and width), which the default CSS uses to stretch the mark. |
| `y2` | `y2` | `string` | Field for the other end of a vertical range. Sets `--y2`, `--y-start`, and `--y-length`. |
| `color` | `color` | `string` | Field for color. Sets `--color`. |
| `size` | `size` | `string` | Field for size. Sets `--size` (0 … 1). |
| `key` | `key` | `string` | Field that identifies a row across updates. Default: its position. |
| `repeat` | `repeat` | `string` | Field with a count: the row is stamped that many times (a unit or waffle chart). Each copy gets `--index` and `--count`. |
| `src` | `src` | `string` | `#id` of a `<table>`, `<datalist>`, or JSON `<script>` with this layer's own rows. Default: one inside it, else its plot's rows. |
| `column-field` | `columnField` | `string` | Reads a grid table, as on `<data-plot>`. |
| `value-field` | `valueField` | `string` | See `column-field`. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `mark` | `((row: object, previous?: Element) => Element) \| null` | Builds marks from script instead of a `<template>`: called as `mark(row, previous)` for each row, with the element that row had last time (or undefined); returns its element (the same one, to update it in place). Positions and colors are set on whatever it returns. Null goes back to the template. |
| `x` | `string` | Mirrors the `x` attribute. |
| `x2` | `string` | Mirrors the `x2` attribute. |
| `y` | `string` | Mirrors the `y` attribute. |
| `y2` | `string` | Mirrors the `y2` attribute. |
| `color` | `string` | Mirrors the `color` attribute. |
| `size` | `string` | Mirrors the `size` attribute. |
| `key` | `string` | Mirrors the `key` attribute. |
| `repeat` | `string` | Mirrors the `repeat` attribute. |
| `src` | `string` | Mirrors the `src` attribute. |
| `columnField` | `string` | Mirrors the `column-field` attribute. |
| `valueField` | `string` | Mirrors the `value-field` attribute. |
| `data` | `object[]` | The rows drawn: its own (from `src`, a source inside it, or set here), else its plot's. Setting it replots, until `src` changes or it's set to null. Changing the array in place needs `requestRender()`. |
| `ownRows` (read-only) | `object[] \| null` | Its own rows, or null when it uses its plot's. |
| `readable` (read-only) | `boolean` | True when its own data is a table assistive technology can read. |
| `plot` (read-only) | `HTMLElement \| null` | The `<data-plot>` this layer is directly inside, or null. |

**Methods**

| Method | Description |
|---|---|
| `requestRender()` | Redraws soon: through its plot, or by itself when it can draw alone. Several requests in one task draw once. |

**Events**

| Event | Description |
|---|---|
| `render` | After it draws, when alone (inside a plot, the plot fires it). |
| `error` | Its own data couldn't be read. |
