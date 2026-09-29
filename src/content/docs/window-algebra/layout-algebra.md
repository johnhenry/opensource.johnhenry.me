---
title: "The layout algebra"
description: "Eleven primitives build a serializable JSON tree; derived layouts and tree transforms are ordinary functions over it."
sidebar:
  order: 2
---

Every container and modifier takes an **options object first**, then its child or children. `view(id)` is the only exception.

| Kind | Primitive | Meaning | CSS realization |
| --- | --- | --- | --- |
| Leaf | `view(id)` | a presentation of a window/surface | `<wm-view>` with `container-type: size` |
| Container | `row(options, ...children)` | horizontal composition | flex row |
| Container | `column(options, ...children)` | vertical composition | flex column |
| Container | `grid(options, ...children)` | two-dimensional constraint space | CSS Grid (tracks, areas, auto-fit) |
| Container | `stack(options, ...children)` | children share one allocation (`active`, `chrome: "tabs"`) | one grid cell; inactive children `visibility: hidden` + `inert` |
| Container | `overlay(options, ...children)` | independent layers of the same region | one grid cell, z-ordered |
| Modifier | `place(options, child)` | position within the parent's allocation | `translate`, insets, grid lines/areas, self-alignment |
| Modifier | `size(options, child)` | allocation constraint (`weight`, `width`, `min`, `aspectRatio`, …) | flex, width/height, min/max, aspect-ratio |
| Modifier | `gap(options, child)` | separation between siblings | `gap` |
| Modifier | `inset(options, child)` | padding around an allocation | `padding` |
| Modifier | `anchor(options, child)` | position relative to another view, with `xdg_positioner`-style `flip`/`slide`/`resize`/`gravity` | CSS anchor positioning, with a JS fallback |

```js
import { overlay, inset, gap, row, column, size, anchor, view } from "@johnhenry/window-algebra";

const layout = overlay(
  {},
  inset({ all: 8 }, gap({ all: 8 },
    row({ align: "stretch" },
      size({ weight: 2 }, view("editor")),
      size({ weight: 1 }, column({}, view("browser"), view("terminal"))),
    ),
  )),
  anchor({ to: "editor", x: "center", y: "center" }, size({ width: 480, height: "content" }, view("dialog"))),
);
```

There are three layers, and keeping them apart stops convenience helpers from turning into primitives:

1. **Primitive constructors**: the eleven above.
2. **Derived layouts** (`src/layouts/`): `masterStack`, `columns`, `rows`, `monocle`, `tabs`, `autoGrid`, `fixedGrid`, `spiral`, `bspToLayout`, `treeToLayout`, and the sugar helpers `floating`, `centered`, `dock` and `hybrid`.
3. **Tree transforms**: `mirror`, `flip`, `rotate`, `reverse`, `mapViews`, `replace`, `remove`, `swap`, `find`, `views`, `walk`, `fold`, `transform`, `count`, `equals`.

Trees are deep-frozen and serializable; `validate` reports an invalid tree by path, and `fromJSON` round-trips one. Every option is in [Layout algebra](/window-algebra/api/algebra/).
