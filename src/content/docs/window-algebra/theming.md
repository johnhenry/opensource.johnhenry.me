---
title: "Theming"
description: "Every visual value in the library's CSS is a --wa-* custom property with light, dark and high-contrast defaults; override any of them."
sidebar:
  order: 6.2
---

Every visual value in the library's own CSS (`BASE_CSS`, the drag ghost and drop zone, the command palette) is a custom property from one small, documented set: `--wa-*`. Override any of them and the library follows.

```html
<style id="wa-base"></style>
<script type="module">
  import { BASE_CSS } from "@johnhenry/window-algebra/css";
  document.getElementById("wa-base").textContent = BASE_CSS; // THEME_CSS + the rules
</script>
<style>
  :root { --wa-color-accent: #d6336c; --wa-radius-md: 14px; --wa-space-md: 16px; }
  /* or theme one stage only: */
  #inspector { --wa-titlebar-bg: #1b2b20; --wa-titlebar-fg: #d8f3dc; }
</style>
```

`BASE_CSS` is `THEME_CSS` (the default theme) followed by `RULES_CSS` (the rules that read the tokens). Use `RULES_CSS` alone to supply every token yourself. The defaults are declared inside `:where()`, so they have zero specificity and a plain `:root { --wa-color-accent: hotpink }` wins wherever it appears.

:::caution[Breaking change from the first draft]
The `--wm-*` custom properties are gone and `--wa-*` replaces them: `--wm-focus-ring` is `--wa-focus-ring-color`, `--wm-ghost-radius` is `--wa-radius-md`, `--wm-transition-duration` is `--wa-transition-duration`, and so on. Nothing was published with the old names. `anchor-name: --wm-<id>` is a different thing (a CSS dashed ident for anchor positioning) and is unchanged.
:::

## Light, dark and high contrast

- With nothing set, the OS preference (`prefers-color-scheme`) picks light or dark.
- `data-theme="light"` or `"dark"` on `<html>`, or on any element wrapping a stage, forces that scheme.
- Under `@media (prefers-contrast: more)` the high-contrast value replaces the scheme's value for tokens that have one: black on white (or white on black), strong borders, no shadows, thicker focus rings and splitter lines.
- Under `@media (forced-colors: active)` the focus ring uses `Highlight` and splitter lines `CanvasText`.

The defaults are checked in `test/theme.test.mjs` against WCAG contrast ratios (4.5:1 for text, 7:1 under `prefers-contrast: more`, 3:1 for the focus ring) in all four combinations.

## The token groups

Colours (`--wa-color-*`, `--wa-border-width`), radii (`--wa-radius-*`), spacing (`--wa-space-*`), the focus ring (`--wa-focus-ring-*`), splitters (`--wa-splitter-*`), the title bar (`--wa-titlebar-*`), shadows (`--wa-shadow-*`), the drag preview (`--wa-ghost-*`, `--wa-zone-*`), type (`--wa-font*`) and motion (`--wa-transition-*`). `THEME_TOKENS` is the whole table as data (`{ [name]: { description, light, dark, hc? } }`) for a theme editor. The values for each token are in [Theming](/window-algebra/api/theming/#the-tokens).

The compiled render tree carries only layout in its inline styles, so theming never needs a re-render. Try it in `demo/theming.html`.
