---
title: "Data"
description: "Where a plot's rows come from: tables (long or grid), datalists, JSON, or .data, by one rule; read once and watched once."
sidebar:
  order: 1
---

## One rule

Every element that takes data, the plot and any layer with rows of its
own, follows the same order:

1. **`.data`**, set from script, wins, until `src` changes or it's set to
   `null`.
2. Else **`src="#id"`** names a source in the page. Only an `#id` for now:
   anything else fires `error`.
3. Else a **source inside the element**.
4. Else a layer uses **its plot's rows**.

A layer with rows of its own still draws on the plot's scales, and those
scales cover every layer's rows: a "mean" layer with one row widens the
axis to fit it.

## Tables

A **long table** has a row per data point, and its header cells name the
fields:

```html
<table>
  <thead><tr><th>city</th><th>month</th><th>mm</th></tr></thead>
  <tbody><tr><td>Rome</td><td>Jan</td><td>67</td></tr></tbody>
</table>
```

A **grid table** has a row per item and a column per category, the way a
heatmap is usually written out. Say how to read it with `column-field` and
`value-field`:

```html
<data-plot column-field="month" value-field="mm">
  <table>
    <thead><tr><th>city</th><th>Jan</th><th>Mar</th></tr></thead>
    <tbody><tr><th>Rome</th><td>67</td><td>58</td></tr></tbody>
  </table>
  …
</data-plot>
```

Each cell becomes a row: `{ city: "Rome", month: "Jan", mm: 67 }`. The
top-left header names the row labels; empty cells are skipped.

**A cell can show one thing and carry another:** `data-value`, or the
native `<data value="1200000">$1.2M</data>` and
`<time datetime="2026-10-04">Oct 4</time>`. Numeric text becomes a number
("1,200" too).

## Datalists

A `<datalist>` holds data without showing it. Each `<option>` is a row with
`label`, `value`, and a field per `data-*` attribute (`data-start-week` is
`startWeek`, as `dataset` names it):

```html
<datalist id="plan">
  <option label="Build" data-team="Engineering" data-start="5" data-end="12"></option>
</datalist>
<data-plot src="#plan" aria-label="Project plan">…</data-plot>
```

Because a datalist isn't read aloud, label the plot (see below).

## JSON

`<script type="application/json">` with an array of objects (or of arrays,
keyed `"0"`, `"1"`, …). JSON is used as written; only tables and datalists
turn numeric text into numbers.

## Live

Each source element is read once and watched once, however many elements
use it. Editing it, by hand or from script, redraws every one of them.
Bad JSON fires `error` and keeps the last drawing.

## Accessibility follows the data

When the data is a readable table (inside the plot, or visible in the
page), the drawing is hidden from assistive technology: the table already
says it. Otherwise the drawing must say it: an `aria-label` (or
`aria-labelledby`) makes it `role="img"`, and without one there's a console
warning. A `role` you set yourself is left alone.
