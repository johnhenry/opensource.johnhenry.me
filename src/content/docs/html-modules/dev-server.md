---
title: "Dev server, hot reload and Vite"
description: "html-module dev serves and watches a directory and hot reloads open pages; HTMLModules.hotReload() swaps components under live elements; the Vite plugin does the same for imported modules."
sidebar:
  order: 8
---

```sh
html-module dev ./site          # serve a directory, watch it, hot reload open pages (no dependencies)
```

`html-module dev [dir]` is a static server over `node:http` and `fs.watch` that pushes file changes to open pages over
Server-Sent Events. When an HTML module changes, the page calls `HTMLModules.hotReload(url)`: the module is fetched
again and its components and styles are swapped **under live elements**. Custom element definitions cannot be
redefined, so registered classes delegate to a swappable definition: a template change re-stamps each element's shadow
root in place (host, listeners and light DOM are kept; bindings re-bound) and a style change swaps the adopted
stylesheet. A change that cannot be applied to live elements (exports added or removed, a changed shadow mode,
`form-associated`, new observed attributes, changed imports) reloads the page; a module with a syntax error changes
nothing and shows an overlay. The full reference, including what is and is not swapped, is
[Dev server, hot reload and Vite](/html-modules/api/dev/).

For modules imported from JavaScript there is a Vite plugin, with the same in-place HMR:

```js
// vite.config.js
import htmlModules from '@johnhenry/html-modules/vite';
export default { plugins: [htmlModules()] };

// main.js
import { customCard } from './ui.html';   // compiled with the same compiler as the CLI
customCard.define('x-card');
```

`vite` is a dev dependency of this package only; `npm install @johnhenry/html-modules` adds no runtime dependency.

The example `examples/07-hot-reload-swaps-components-under-live-elements.mjs` shows `HTMLModules.hotReload()` re-stamping
a live element in place, and a shadow-mode change coming back as `reload: true`. See [Examples](/html-modules/examples/).
