---
title: "html-modules"
description: "Declarative HTML modules for the browser: write Web Components in ordinary HTML files, export them with <html-export>, and import them with <html-import as>. No build step, no custom loader, and an optional compiler to ES modules."
sidebar:
  order: 0
---

**`@johnhenry/html-modules`** is declarative HTML modules for the browser. Write Web
Components in ordinary HTML files, export them with `<html-export>`, and import them into
a page with `<html-import src="./ui.html" as="ui">`. Each export becomes a native custom
element under the import's namespace: `<ui--card>`, `<ui--button>`. There is no build
step and no custom JavaScript module loader. The same modules can be used from
JavaScript, mixed with JS-authored components, and optionally compiled to plain ES
modules.

```html
<script type="module" src="/node_modules/@johnhenry/html-modules/src/browser.js"></script>

<html-import src="./ui.html" as="ui"></html-import>

<ui--card>
  <h2 slot="title">Hello!</h2>
  An ordinary HTML file defined this element.
</ui--card>
```

```html
<!-- ui.html -->
<html-export name="card">
  <style>:host { display: block; border: 1px solid; padding: 1rem; }</style>
  <template>
    <article>
      <header><slot name="title"></slot></header>
      <slot></slot>
    </article>
  </template>
</html-export>
```

It implements the PRD *Declarative HTML Modules*;
[PRD coverage and extensions](/html-modules/prd-coverage/) maps each PRD section onto the
code and records the deliberate extensions (`<html-binding>`, a configurable delimiter,
the settings elements, lazy loading). Plain JavaScript ES modules, no runtime
dependencies.

> **Provenance:** a new package. It was developed locally as `web-module-graph` and
> renamed before it was ever published, so `0.0.0` is the first version under any name.
> The **unscoped** `html-modules` on npm is an unrelated package by another author;
> install the scoped name. It is not on npm yet, and its source repository will be linked
> here once it is published.

## What's here

**Guides**

- [Getting started](/html-modules/getting-started/): install, load the bootstrap, and
  write, import and use a module.
- [Writing HTML modules](/html-modules/writing-modules/): the four export kinds, default
  exports, and modules that import modules.
- [Importing, namespaces and bindings](/html-modules/importing/): `<html-import as>`,
  delimiters, `<html-binding>`, and identity vs registration name.
- [Settings and lazy loading](/html-modules/settings-and-lazy-loading/):
  `<html-import-settings>`, `<html-module-settings>`, precedence, and `load="lazy"`.
- [JavaScript API and JS components](/html-modules/javascript/): `HTMLModules.load()`,
  `import()`, `bind()`, definitions, and JavaScript-authored components.
- [The compiler](/html-modules/compiler/): HTML modules to plain ES modules, from the
  CLI or from code.
- [Resolution, caching and errors](/html-modules/resolution-and-errors/).
- [Examples](/html-modules/examples/): six self-verifying Node examples and a browser
  demo site with live checks.
- [Limitations and traps](/html-modules/limitations/): read this before shipping.
- [Adding a new export kind](/html-modules/adding-an-export-kind/), and the project
  layout.
- [PRD coverage and extensions](/html-modules/prd-coverage/).

**[API reference](/html-modules/api/)**: checked against the source and the tests:
[HTML syntax](/html-modules/api/html-syntax/),
[elements (DOM API)](/html-modules/api/elements/),
[the JavaScript API](/html-modules/api/javascript/),
[the runtime](/html-modules/api/runtime/),
[module records and settings](/html-modules/api/records/),
[names](/html-modules/api/names/), [the compiler and CLI](/html-modules/api/compiler/)
and [errors](/html-modules/api/errors/).

MIT licensed.
