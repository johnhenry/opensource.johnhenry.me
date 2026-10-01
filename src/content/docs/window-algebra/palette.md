---
title: "The command palette"
description: "createPalette, <wa-palette> and attachStage({ palette }): a fuzzy-filtered, accessible list of every command that applies to the current state."
sidebar:
  order: 6.1
---

Commands are data, so a palette is a catalog plus a filter plus a UI. The catalog and the fuzzy matching are pure (exported from the root entry and tested in Node). `createPalette` is the UI, exported from `@johnhenry/window-algebra/browser`. `<wa-palette>` and `attachStage({ palette })` wrap it.

```js
import { createPalette } from "@johnhenry/window-algebra/browser";

const palette = createPalette({ wm });   // Ctrl/Cmd+Shift+P opens it
palette.open({ query: "close" });
```

`attachStage(host, { palette: true })` (off by default) creates a palette for the stage's manager. The `<wa-palette>` element, from `defineCommandPaletteElement` in `@johnhenry/window-algebra/element`, hosts one declaratively.

## What it does

1. **Lists** the commands that make sense for the current state: no "Close window" with no windows, no "Switch workspace" with one workspace, "Pop window back in" only when something is popped out. They are grouped and named for people, not as `window/close`.
2. **Filters** them by fuzzy text, matching the title first, then the command type, group and keywords. The matched letters are highlighted.
3. **Prompts** for the payload fields of the chosen command, one at a time: windows, workspaces, outputs, enums, booleans and layouts as a filterable list, the rest as validated text.
4. **Dispatches** `wm.dispatch(command)`. A rejected command keeps the palette open on its last field with the reason, so it can be corrected.

The catalog has one entry for each of the 58 built-in commands, and a test keeps it equal to `COMMANDS`. Add your own with the `catalog` option together with `extensions` on the manager.

## Accessibility

The palette is a WAI-ARIA 1.2 editable combobox with a listbox popup, inside a modal dialog. DOM focus never leaves the input; arrows and Page keys move the highlight, Enter chooses, Escape steps back one field, then to the command list, then closes. Focus returns to where it was on close. Results and outcomes are announced through a polite live region.

## Options worth knowing

- `shortcut`: `"Mod+Shift+P"` by default (`Mod` is Ctrl or Cmd); a string, a list, or `false`. Some browsers reserve a few chords, so it is configurable.
- `popouts`: an `attachPopouts` handle, so "Pop window out" opens a real browser window instead of only changing state.
- `exclude`, `layouts`, `labels` (for translation), `restoreFocus` and `injectStyles`. The palette's CSS reads only the `--wa-*` [theme tokens](/window-algebra/theming/).

## What it does not do

It lists commands, not their targets, and it asks only for the common payload fields: `window/create` takes an id and a title, and `layout/set` takes a layout type without options (a JSON field covers the rest). The pointer-driven commands (`window/drop`, `layout/resize-split`) are listed for completeness, but the palette cannot show their geometry.

Full reference, including the pure catalog functions (`paletteEntries`, `fuzzyMatch`, `fieldChoices`, `buildCommand`): [Command palette](/window-algebra/api/palette/). Try it in `demo/palette.html`.
