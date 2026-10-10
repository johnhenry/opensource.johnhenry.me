---
title: "API"
description: "createElement()/hyperscript (attributes, properties, listeners, style objects, flattened children), per-tag shorthands, domToText, simple-element, and dom-to-hyperscript."
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

- **`tag` is optional.** Omit it (or pass a child as the first argument
  instead) and you get a `DocumentFragment` of children back, with no
  wrapping element. `_` is shorthand for exactly that: `_(...)` ==
  `createElement(...)`.
- **`props` is optional.** Anything child-shaped (a string, number, `Node`,
  array, ...) passed as the second argument is treated as the first child
  instead.
- **`props.children`**, if present, is prepended to any positional children
  — for compatibility with JSX transforms that pass children this way.

### Props: attributes, properties, listeners

```javascript
const field = createElement("input", {
  type: "checkbox",
  required: true,                  // attribute: required=""
  disabled: isLocked,              // attribute only when true; false/null/undefined omit it
  "aria-checked": false,           // aria-*/data-*: booleans are written as "true"/"false"
  class: ["toggle", isOn && "on"], // falsy entries skipped; or { toggle: true, on: isOn }
  style: { color: "red", "--size": 2 },
  ".checked": isOn,                // DOM property, not an attribute
  ".indeterminate": isMixed,
  onchange: (e) => save(e.target.checked),            // listener for "change"
  "@my-event": [(e) => log(e.detail), { once: true }], // listener, verbatim type + options
});
```

| Key | Meaning |
| --- | --- |
| `".name"` | Sets the DOM **property** `element.name = value`, as-is (objects stay objects; `false`/`null` are assigned, not skipped). Never an attribute. |
| `"@type"` | `element.addEventListener(type, ...)`, with `type` used **verbatim** (case and hyphens kept, for custom events). The value is a function, an `EventListener` object (`{ handleEvent }`), or `[listener, options]`; `null`/`undefined`/`false` add nothing. A **string** value is still an attribute (as it was before), for template libraries such as Alpine.js that read `@click="..."` attributes. |
| `on<Event>` with a **function** value | `element.addEventListener(event.toLowerCase(), fn)` — `onclick` and `onClick` both listen for `click`. Never written as an inline-handler attribute. A **string** `on*` value is still an ordinary attribute. |
| `class` | A string (set as-is), an array of strings (falsy entries skipped, the rest added via `classList.add()`), or a `{ name: boolean }` object (truthy names added). |
| `style` | A string (set as-is) or an object: `kebab-case` and `--custom` keys go through `style.setProperty()`, `camelCase` keys through `style[key] =`; `null`/`undefined`/`false` entries are skipped. Values are stringified — no automatic `px`. |
| `children` | Prepended to the positional children. |
| anything else | An attribute: `null`/`undefined`/`false` omit it, `true` sets it to `""` (a boolean attribute), any other value goes through `setAttribute()` (stringified). Exception: `aria-*`/`data-*` booleans are written as `"true"`/`"false"`, since those are string-valued attributes where `""` would mean something else. |

Applied in this order: attributes and listeners, then children, then
properties — so `createElement("select", { ".value": "b" }, ...options)`
selects an option that already exists, and an `<input type="range">`'s
`.value` is clamped against `min`/`max` that are already set.

**Why a `.` prefix for properties (rather than a `props: {}` bag or
guessing).** Whether a name is a property or an attribute can't be guessed
reliably: `value` exists as both, with different meanings (initial vs.
current), and a custom element's properties are whatever its class defines,
possibly not yet upgraded. So it's explicit, per key. A prefix keeps every
key flat in one object (no second, nested bag to merge), reserves no
ordinary attribute name (a bag would need a reserved key like `props`, which
also reads confusingly next to the function's own `props` argument), and is
the same sigil [lit](https://lit.dev/docs/templates/expressions/) uses
(`.value=${...}`), as `@` is its sigil for event listeners. No standard
HTML/SVG/MathML attribute name begins with `.` or `@`.

### Children

```javascript
createElement("ul", {},
  items.map((item) => createElement("li", {}, item.name)), // arrays flatten (recursively)
  showMore && createElement("li", {}, "more..."),          // false/null/undefined/true are skipped
  count,                                                     // numbers/bigints become text; 0 is rendered
);
```

- Strings, numbers and bigints become text nodes; `Node`s are appended
  as-is.
- `null`, `undefined`, `false` and `true` are skipped, so `cond && el`
  works.
- Arrays and other non-string iterables (a `NodeList`, a `Set`, a generator)
  are flattened, recursively. Everything is collected before anything is
  appended, so passing a live collection like `other.childNodes` moves all
  of its nodes, not every other one.

The same rules apply to `createSVGElement`, `createMathMLElement`, `_`,
every `/html` and `/svg` shorthand, and `reactToDom` (which builds through
`createElementNS`).

### SVG and MathML

```javascript
import { createSVGElement, SVG_NAMESPACE, createMathMLElement, MATHML_NAMESPACE } from "@johnhenry/domable/create-element";
createSVGElement("circle", { r: "5" }).namespaceURI === SVG_NAMESPACE; // true
createMathMLElement("mrow").namespaceURI === MATHML_NAMESPACE; // true
```

`reactToDom` (below) is namespace-aware too: a React-element-shaped `<svg>`
or `<math>` node, and everything nested inside it, is built in the correct
namespace automatically — you don't need `createSVGElement`/
`createMathMLElement` yourself unless you're building elements directly.

### Limitations

- **`createElement` builds; it doesn't update.** Listeners, properties and
  attributes are applied once, at creation. There's no diffing,
  re-rendering or listener removal — keep a reference and use the DOM
  directly, or pass `{ signal }` in an `"@type": [fn, { signal }]` listener's
  options and abort it.
- **No synthetic event system.** A function-valued `on<Event>` prop (from
  `createElement` or a React-shaped `onClick` through `reactToDom`) is a
  plain `addEventListener(event.toLowerCase(), fn)`. React event names that
  aren't just the DOM name in camelCase don't map: `onDoubleClick` listens
  for `doubleclick` (the DOM event is `dblclick` — use `ondblclick`), and
  React's `onChange` on an `<input>` fires per keystroke where the DOM
  `change` event fires on commit (use `onInput`). There is no
  capture-phase `onClickCapture` translation either; use
  `"@click": [fn, { capture: true }]`.
- **Listeners and properties aren't serialized.** They live on the DOM
  object, not in its markup, so `domToText`, `domToReact` and
  `domToHyperscript`/`domToSource` can't see them — a round trip through
  any of those keeps only attributes.
- **A `.property` on a custom element that isn't defined yet** becomes an
  own property of the (not-yet-upgraded) element, which shadows the class's
  setter once it upgrades. Define the element first, or have the class
  re-apply such properties on upgrade (the usual "lazy property" pattern).
- **No `px` for numbers in a `style` object.** `{ width: 10 }` sets
  `width: 10`, which the browser ignores; write `"10px"`. (Unitless
  properties like `opacity`, and `--custom` properties, are fine.)

### Changed in 0.0.2

Before 0.0.2 every prop went through `setAttribute` and every child through
`append()` as-is. Calls that relied on that output change: a function-valued
`on*` prop no longer writes a stringified attribute; `false`/`null`/`undefined`
attribute values (other than `aria-*`/`data-*` booleans) are omitted rather
than written as `"false"`/`"null"`/`"undefined"`, and `true` is `""` rather
than `"true"`; a `style` object no longer becomes `style="[object Object]"`;
`null`/`undefined`/boolean children are no longer rendered as text; and
`.`-prefixed keys and non-string `@`-prefixed keys are no longer attributes.
String `on*` and string `@*` values are still plain attributes. See the
[changelog](https://github.com/johnhenry/domable/blob/main/CHANGELOG.md).

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
| `@johnhenry/domable/create-element` | `createElement`, `_`, `createElementNS`, `createSVGElement`, `SVG_NAMESPACE`, `createMathMLElement`, `MATHML_NAMESPACE`, `fromString` |
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
