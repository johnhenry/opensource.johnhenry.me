---
title: "<value-inspector>"
description: "The <value-inspector> element: its value and expand properties, open and raw-strings attributes, --inspectable-* theming, and what happens on re-render, failed expansion and released handles."
sidebar:
  order: 3
---

```js
import "@johnhenry/inspectable/global"; // registers <value-inspector>

const view = document.querySelector("value-inspector");
view.expand = (handle) => askWorker({ expand: handle }); // resolves to { entries, more }
view.value = preview;
```

| | |
| --- | --- |
| `value` property | A preview node. Setting it re-renders. |
| `expand` property | `async (handle) => ({ entries, more })`, called the first time a collapsed node with a `handle` is opened. |
| `open` attribute | Expand the root. |
| `raw-strings` attribute | Show a root string as plain, wrapped text instead of a quoted literal (good for text output). |
| CSS | `--inspectable-font`, `--inspectable-text`, `--inspectable-string`, `--inspectable-number`, `--inspectable-keyword`, `--inspectable-key`, `--inspectable-function`, `--inspectable-error`, `--inspectable-muted`, `--inspectable-focus`. Defaults use `light-dark()`, so they follow the page's `color-scheme`. |

The tree is native `<details>`/`<summary>`, so it is keyboard- and screen-reader-operable without extra script. It
renders into an open shadow root, so page selectors don't reach inside it: theme it through the custom properties.

## Traps

- **Every `value` assignment, and every change to `open` or `raw-strings`, rebuilds the whole tree.** Nodes the reader
  had opened close again, and children fetched through `expand` are fetched again when reopened. Don't re-assign the
  same preview just to refresh.
- **Each node calls `expand` at most once.** The first open of a collapsed node with a `handle` fetches; later toggles
  reuse the result. A failed fetch shows `(failed to expand: …)` and is not retried until the tree is rebuilt.
- **A released handle shows `(no longer available)`.** When `expand` resolves `undefined` (which is what
  `inspector.expand()` returns after `release()`), the node says so. Replace the preview when its cell reruns rather
  than leaving a stale one open.
- **No `expand`, no lazy children.** Without an `expand` property, opening a node that only has a `handle` shows
  `(not expandable here)`, as `renderPreview()` does without one; setting `expand` later re-renders. Previews from the
  stateless `serialize()` have no handles, so they never need one.
- **An element's markup is only in a tooltip.** For an `element` node, `source` goes into the `title` attribute and
  nowhere else. A function's source is in its tooltip and also shown as a block when the node is opened; an error's
  stack is shown when the error is opened.
- **Registering needs a DOM.** `@johnhenry/inspectable/global` throws in Node or a Worker. Import the root entry (or
  `/serialize`) there, and `/global` only on the page.

## Without the element

`renderPreview(preview, options)` from `@johnhenry/inspectable/element` returns the same tree as plain DOM (without the
shadow root and its default styles), and `renderTable(toTable(value))` renders record-shaped data as a `<table>`. See the
[API](/inspectable/api/#johnhenryinspectableelement-dom).

## A different tag name

`defineValueInspector("my-inspector")` registers a subclass under another name; calling it twice for the same tag is a
no-op.
