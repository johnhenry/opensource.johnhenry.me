---
title: "Importing, namespaces and bindings"
description: "<html-import as>, asynchronous upgrade, namespace delimiters, selective imports with <html-binding>, and why a component's identity is not its tag."
sidebar:
  order: 3
---

## Importing

```html
<html-import src="./ui.html" as="ui"></html-import>
```

is the HTML counterpart of `import * as ui from "./ui.js"`. `as` names a namespace: every component export is
registered as `<as>--<export>`. Stylesheet and data exports are not elements and are not registered.

**Asynchronous upgrade.** Elements may appear before, or long after, the import that defines them. Until then they
are ordinary unknown elements (style them with `:not(:defined)`); when the module arrives, the browser upgrades them
in place. No `MutationObserver` is involved (except for [lazy imports](/html-modules/settings-and-lazy-loading/#lazy-loading), which watch for their first
element).

The same module can be imported under several namespaces (`as="shop"`, `as="admin"`); it is fetched and parsed once.
An import with no `as` and no bindings only loads the module, for its side effects or to warm the cache.

| `<html-import>` | |
| --- | --- |
| `src` | module URL: relative to the document (or its [`base`](/html-modules/settings-and-lazy-loading/#settings)), absolute, or a bare specifier resolved through the page's import map |
| `as` | namespace |
| `delimiter` | namespace delimiter for this import (default `--`) |
| `conflict` | `error` (default) or `reuse`: what to do when a tag is already defined by something else |
| `load` | `eager` (default) or `lazy`: fetch only when one of its tags is used |
| `errors` | `event` (default) or `throw`: also `reportError()` failures |
| `type` | `html` or `js`, to override detection by extension (`.html`/`.htm` are HTML; anything else is JS) |
| `el.ready` | Promise of `{ module, elements, bindings, tags }` once bound; rejects on failure |
| `el.module` | Promise of the module namespace (a lazy import waits rather than loading) |
| `el.load()` | load now, even a lazy import none of whose tags is in use; returns `el.ready` |
| `el.state` | `idle`, `waiting`, `loading`, `loaded` or `error` |
| `el.elements` / `el.bindings` / `el.tags` | registered tags → classes; bound export names → values; tags → `{ tag, namespace, export, reused? }` |
| `el.settings` / `el.delimiter` | the options in use, after precedence |
| `el.sanitize` | a function (or `false`) that sanitizes this import's component templates: a property only (a function cannot be an attribute); see [Security model](/html-modules/security/#sanitizing-templates-from-less-trusted-modules) |
| `el.src` / `as` / `type` / `integrity`, `el.delimiter` / `conflict` / `loadMode` / `errors` | properties for the attributes (`loadMode` is `load`, whose name the method has); a script can `createElement`, `append`, then set `src`: it starts after the script. Changing `src` after loading started fires an `error` event |
| `load` / `error` events | on the import; `error` has `detail.error` and bubbles |

Full detail: [Elements (DOM API)](/html-modules/api/elements/).

**The configuration elements render nothing but are not hidden.** `<html-import>`, `<html-binding>`, `<html-import-settings>` and
`<html-module-settings>` have no default style, so inside a grid or flex container (a `<body>` that is `display: grid`, say) each
one becomes a layout item and can leave a gap. Hide them: `html-import, html-binding, html-import-settings, html-module-settings { display: none }`.
(The library adds no stylesheet of its own, which is what keeps it usable under a strict `style-src`.)

## Namespaces and delimiters

A namespace import registers each component as `<namespace><delimiter><export>`. The delimiter is `--` by default,
and can be changed per import, for a whole document (`<html-import-settings delimiter="-">`), per call, or for a
whole `HTMLModules` instance:

```html
<html-import src="./ui.html" as="ui"></html-import>                  <!-- <ui--custom-card> -->
<html-import src="./ui.html" as="ui" delimiter="-"></html-import>    <!-- <ui-custom-card> -->
```

**Why `--` is the default.** A registered tag must be a valid custom element name, or native upgrade is lost.
Namespaces and export names are lower-case words joined by *single* hyphens, so `--` can never appear inside one:
every tag splits exactly one way. And `--` always supplies the hyphen a custom element name needs, so one-word
exports stay valid (`<ui--card>`). It also echoes CSS custom properties.

**Other delimiters.** A delimiter is one or more characters allowed in custom element names: lower-case letters,
digits, `-`, `.`, `_`, and the non-ASCII ranges of the spec. Whitespace, upper case and characters such as `:` are
rejected.

- **`-`** is compact and always valid, but ambiguous: `ui-custom-card` could be `custom-card` in `ui` or `card` in
  `ui-custom`. The runtime never parses a tag back into its parts: every binding records `{ tag, namespace, export }`
  (`el.tags`, and `tags` in the results of `bind()` and `import()`).
- **`.`** reads well, but `ui.card` has no hyphen, so **one-word exports become invalid** (see
  [Honest limitations](/html-modules/limitations/)).

**Inside modules**, an `<html-import>` uses `--` unless it (or the module's own `<html-import-settings>`) says
otherwise; the page's settings and the instance default do not apply there, so a module's templates always know the
tags they were written with. Every naming function is in [Names](/html-modules/api/names/).

## Selective imports: `<html-binding>`

The PRD specifies the whole-namespace import. As a deliberate extension, an `<html-import>` may have `<html-binding>`
children. With any children, **only** those exports are bound, which keeps the global, permanent custom element
registry free of components the page never uses.

```html
<html-import src="./ui.html" as="ui">
  <html-binding export="card"></html-binding>                          <!-- <ui--card> only -->
  <html-binding export="button" element="brand-button"></html-binding>  <!-- a tag you choose -->
  <html-binding export="button" element="save-button"></html-binding>   <!-- the same export, again -->
  <html-binding export="default" element="tip-box"></html-binding>      <!-- a default export needs element= -->
  <html-binding export="theme" adopt></html-binding>                   <!-- a stylesheet, adopted -->
  <html-binding export="config"></html-binding>                        <!-- data, on el.bindings.config -->
</html-import>

<html-import src="./counter.js">                                     <!-- a JS module -->
  <html-binding export="Counter" element="x-counter"></html-binding>
</html-import>
```

- **Always write the end tag.** HTML has no self-closing tags: `<html-binding export="card" />` does not close the
  element, so the binding after it becomes its child. That is an error (a `SyntaxError` in a module, an `error` event in
  a page), not a silent drop, and so is any other element child of an `<html-import>`.
- `element=` sets the tag, overriding `<as>--<export>`. It is the markup form of `definition.define(tag)`.
- `adopt` adopts a stylesheet export into the root that contains the import: the document, or a shadow root.
- A binding can be added at any time, before or after its module loads; it fires `load` (with `detail.tag`,
  `detail.element`, `detail.value`) or `error` (bubbling through the import). A failing binding does not stop the
  others.

## Identity vs registration name

A component's exported identity is not its tag. `ui.html`'s `card` has the identity `"card"` wherever it is bound;
the importer chooses the tag. A registry accepts a constructor only once, so every registration is a fresh subclass
of the definition's one base element:

```js
const ui = await HTMLModules.load('./ui.html');
ui.card.name;                          // "card"
ui.card.define('profile-card');        // one tag
ui.card.define('invoice-card');        // another; a different class, the same component
customElements.get('profile-card').component === ui.card;   // true
customElements.define('fancy-card', class extends ui.card.element { /* behaviour */ });
```

Defining the same definition under the same tag again is a no-op; defining a *different* component under a taken
tag throws (or, with `conflict: 'reuse'`, keeps the existing one).
