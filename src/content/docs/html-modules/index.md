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
> install the scoped name. It is not on npm yet; the source is at
> [github.com/johnhenry/html-modules](https://github.com/johnhenry/html-modules).

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
- [Security model](/html-modules/security/): what the library guarantees (inert parsing,
  `integrity`, Trusted Types and CSP) and what stays yours.
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

Source: [github.com/johnhenry/html-modules](https://github.com/johnhenry/html-modules). MIT licensed.

## Family

html-modules is the HTML-and-custom-elements layer of a browser stack whose neighbours
each own one concern; it depends on neither of these packages, and neither depends on
it.

- **[mport](/mport/)**: package and CDN routing is mport's job, not this library's. mport
  compiles package ranges to a standard import map (`router.build([...])` →
  `{ importMap, lock }`, or `npx mport build` → `importmap.json`). html-modules resolves
  a bare `<html-import src="@acme/ui/kit.html">` through `hostResolve`, which `/browser`
  sets to `import.meta.resolve`, so the page's import map applies: put the map mport
  generated (a prefix entry such as `"@acme/ui/": "https://…/"` covers HTML files too) in
  the page before `browser.js` loads, and bare HTML-module specifiers resolve through
  it. The same map can point `@johnhenry/html-modules/runtime` at one runtime copy. This
  library used to carry an mport adapter, routers and a lockfile; they were removed when
  it became html-modules. See mport's
  [Import maps, lockfiles and the CLI](/mport/import-maps-and-cli/).
- **[window-algebra](/window-algebra/)**: window-algebra's views host *surfaces*,
  `{ mount(target), unmount() }`, and its `htmlSurface(element)` simply appends an
  element. An html-modules component is a native custom element, so
  `htmlSurface(document.createElement('ui--card'))` is a window whose content upgrades
  when its import registers the tag. window-algebra's renderer creates no shadow roots,
  so when its stage is in the document's light DOM a lazy `<html-import>` sees the
  element as the window first mounts and loads the module then (a stage inside some
  other component's shadow root is out of lazy loading's sight; call `load()`). An
  `iframeSurface` is another document: the framed page needs its own `<html-import>`.
  See window-algebra's [Surfaces](/window-algebra/api/browser/#surfaces).
