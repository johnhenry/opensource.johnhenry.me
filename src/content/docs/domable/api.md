---
title: "API"
description: "createElement()/hyperscript, per-tag shorthands, domToText, simple-element, and dom-to-hyperscript."
---

## `createElement` — a hyperscript DOM builder

`document.createElement`-alike that sets attributes and appends children in
one call, similar to React's
[JSX-less `React.createElement`](https://reactjs.org/docs/react-without-jsx.html):

```javascript
import createElement, { _ } from "@johnhenry/domable/create-element";

const list = createElement("ul", { id: "foo" },
  createElement("li", {}, "bar"),
  document.createElement("li"),
);
list.outerHTML;
// <ul id="foo"><li>bar</li><li></li></ul>
```

- **`tag` is optional.** Omit it (or pass a `Node`/string as the first
  argument instead) and you get a `DocumentFragment` of children back, with
  no wrapping element. `_` is shorthand for exactly that: `_(...)` ==
  `createElement(...)`.
- **`props` is optional.** A `Node` or string passed as the second argument
  is treated as the first child instead.
- **`props.class`** may be a string (set as-is) or an array of strings
  (added individually via `classList.add()`).
- **`props.children`**, if present, is prepended to any positional children
  — for compatibility with JSX transforms that pass children this way.
- String children become text nodes; `Node` children are appended as-is.

### SVG

```javascript
import { createSVGElement, SVG_NAMESPACE } from "@johnhenry/domable/create-element";
createSVGElement("circle", { r: "5" }).namespaceURI === SVG_NAMESPACE; // true
```

### Per-tag shorthands

Every HTML and SVG element has a shorthand function equivalent to
`createElement("tagname", ...)` / `createSVGElement("tagname", ...)`. Kept
on **separate subpaths**, not the main barrel — both tag sets independently
define common names (`a`, `audio`, `canvas`, `script`, `style`, `svg`,
`title`, `video`, …), so flattening them into one namespace would silently
collide:

```javascript
import { html, head, title, body, div, ul, li } from "@johnhenry/domable/html";
import { circle, path } from "@johnhenry/domable/svg";

html({ lang: "en" }, head({}, title({}, "Hello")), body({}, ul({}, li({}, "item"))));
```

`var` and `switch` are exported uppercased (`Var`, `Switch`) since both are
reserved words; hyphenated SVG tag names (`color-profile`, `font-face`, …)
are exported with underscores in place of hyphens (`color_profile`,
`font_face`).

## `domToText` — serializing DOM back to HTML, including shadow DOM

```javascript
import domToText from "@johnhenry/domable/dom-to-text";
domToText(document.querySelector("#list"));
```

Writes its own serializer rather than just joining `.outerHTML` strings,
specifically so it can round-trip what `simple-element` (below) builds:
`.outerHTML` never descends into shadow trees, so a shadow-DOM custom
element serialized that way would silently lose its entire contents.
`domToText`/`domToSource` (see `dom-to-hyperscript`, below) walk
`element.shadowRoot` and emit
[Declarative Shadow DOM](https://web.dev/articles/declarative-shadow-dom)
syntax (`<template shadowrootmode="open">...</template>`) instead. Uses the
native `Element#getHTML({serializableShadowRoots})` where available (newer
browsers), falling back to a manual walker everywhere else.

**Known limitation, not a bug**: a `mode: 'closed'` shadow root is
invisible to `element.shadowRoot` by design — there is no way for *any*
serializer, native or not, to recover closed shadow content it was never
handed. A closed custom element serializes as just its host tag, with no
shadow content — correct, expected behavior.

## `simple-element` — HTML text (or a `Node`) to a Custom Element class

```javascript
import { shadowOpen, shadowClosed, light, register } from "@johnhenry/domable/simple-element";

customElements.define("sample-element", shadowOpen`<div>I am HTML</div>`);
// or, as a regular function call:
customElements.define("sample-element", shadowOpen("<div>I am HTML</div>"));
// or, in one step:
register("sample-element", {})`<div>I am HTML</div>`;
```

- **`shadowOpen`** — accessible shadow root (`element.shadowRoot` returns
  the real root).
- **`shadowClosed`** — inaccessible shadow root (`element.shadowRoot`
  returns `null`).
- **`light`** — no shadow root at all; children go straight into light DOM.
- **`register(tagname, options, ...rest)`** — builds the class *and* calls
  `customElements.define()` in one step. `rest` is forwarded to `define()`
  after the class.
- **`constructSuperclass({HTML, shadowHTML, shadowMode, baseElement})`** —
  lower-level: independently control light-DOM and shadow-DOM content on
  the same element (e.g. a `<style>`-bearing shadow tree *and* light-DOM
  fallback content).

**`Node` input is accepted directly**, not just an HTML string — since
`create-element` already builds DOM trees directly, requiring a
serialize-then-reparse round trip through text just to turn one into a
Custom Element would be a pointless step now that the two live in the same
package. Each instantiated element gets its own `.cloneNode(true)` of the
input, so one source `Node` can safely back any number of custom elements.

```javascript
import createElement from "@johnhenry/domable/create-element";
import { light } from "@johnhenry/domable/simple-element";

const built = createElement("div", { class: "card" }, "built with createElement, not a string");
customElements.define("built-element", light(built));
```

### Composing / slots / styling

Use `<slot>` to let other elements embed content, and a `<style>` tag
(scoped to the shadow root, so it only affects this element) to style it —
see `simple-element.test.mjs` in the repo for real, running examples of
both, including named slots and the `::part()` pseudo-element for styling
parts of a shadow tree from outside it.

## `dom-to-hyperscript` — DOM to reconstructable source

`create-element` converts hyperscript calls *into* a DOM tree. Nothing in
the original six modules converted a DOM tree back *out* into that same
call shape — useful for devtools/codegen ("show me the `createElement()`
source that would rebuild this node").

```javascript
import domToHyperscript, { hyperscriptToSource, domToSource } from "@johnhenry/domable/dom-to-hyperscript";

const el = createElement("div", { id: "foo" }, createElement("span", {}, "hi"));

domToHyperscript(el);
// { tag: "div", props: { id: "foo" }, children: [{ tag: "span", props: {}, children: ["hi"] }] }

domToSource(el);
// 'createElement("div", {"id":"foo"}, createElement("span", {}, "hi"))'

domToSource(el, { indent: "  " }); // pretty-printed, multi-line
domToSource(el, { fn: "h" });      // call a different identifier, e.g. for a different hyperscript lib
```

Note: `domToHyperscript`'s `props` keeps `class` as `class` (targets
`create-element`'s own attribute convention) — unlike `domToReact`, which
translates it to `className` (targets React's convention). These are
deliberately different, matching what each conversion actually feeds into.

## Exports

| Export | Description |
|--------|-------------|
| `@johnhenry/domable` | The conversion matrix: `textToDom`, `domToText`, `domToReact`, `reactToDom`, `textToReact`, `reactToText` |
| `@johnhenry/domable/create-element` | `createElement`, `_`, `createSVGElement`, `SVG_NAMESPACE` |
| `@johnhenry/domable/html` | Per-tag shorthand functions for every HTML element |
| `@johnhenry/domable/svg` | Per-tag shorthand functions for every SVG element |
| `@johnhenry/domable/text-to-dom` | `textToDom` |
| `@johnhenry/domable/dom-to-text` | `domToText` |
| `@johnhenry/domable/dom-to-react` | `domToReact` |
| `@johnhenry/domable/react-to-dom` | `reactToDom` |
| `@johnhenry/domable/text-to-react` | `textToReact` |
| `@johnhenry/domable/react-to-text` | `reactToText` |
| `@johnhenry/domable/simple-element` | `shadowOpen`, `shadowClosed`, `light`, `register`, `constructSuperclass` |
| `@johnhenry/domable/dom-to-hyperscript` | `domToHyperscript`, `hyperscriptToSource`, `domToSource` |
