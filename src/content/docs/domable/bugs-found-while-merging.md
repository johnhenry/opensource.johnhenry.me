---
title: "Bugs found while merging"
description: "Real, previously-undetected bugs in domable's six source modules, surfaced only once they were tested together for the first time — with root causes."
---

Most of `@johnhenry/domable`'s six source modules had no tests at all before
they were consolidated into this package. Testing them together for the
first time surfaced real bugs — fixed here, not silently ported:

- **`react-to-dom`**: referenced a bare `react.type`/`react.props` that was
  never in scope (the function's own parameter was destructured directly)
  — every call to the non-fragment path threw a `ReferenceError`.
- **`react-to-dom`**: a Fragment's `props.children` was assumed to already
  be an array, but real React (and `domToReact`) can hand back a *single*,
  non-array child — crashed on `.map()`.
- **`dom-to-React`**: a `DocumentFragment`'s children were pushed into a
  `children` array declared *after* that code ran — guaranteed
  `ReferenceError` the moment a fragment was converted.
- **`dom-to-React`**: attributes were read via
  `Object.entries(dom.attributes)` — `dom.attributes` is a `NamedNodeMap`,
  not a plain object, so this never actually produced `[name, value]`
  pairs; no attribute ever made it into `props`.
- **`text-to-DOM-nodes`**: parsed via `DOMParser(...).body.childNodes`. Per
  the HTML parsing spec, `<style>`/`<script>`/`<link>`/`<meta>`/`<title>`/
  `<base>` are parsed using "in head" rules *even inside a `<body>` context*
  — they silently end up in the parsed document's `<head>` and never appear
  in `.body.childNodes`. `simple-element`'s own README used a `<style>`-in-
  `shadowOpen` example as its lead "Styling Elements" demo — meaning that
  exact documented pattern silently produced no styling at all, in every
  browser, the whole time. Fixed by parsing into an `HTMLTemplateElement`'s
  `.content` instead (the standard technique for parsing an HTML *fragment*
  without element-specific top-of-document reinterpretation) — also
  simpler, since `.content` is already a real `DocumentFragment`.
- **`create-element`**: `createElement(oneNode)` (a single bare `Node`
  argument, nothing else) silently gained a second, bogus child from the
  `props = {}` default value being swept into the children array alongside
  the real one. Surfaced by `reactToDom`'s Fragment-with-one-child path.
- **`simple-element`**'s own (previously unexported, untested)
  `useShadow: false` branch appended light-DOM children directly inside the
  constructor — which the Custom Elements spec forbids (only shadow-DOM
  content is allowed synchronously during construction; real browsers
  enforce this too). Fixed by deferring light-DOM content to
  `connectedCallback()` (guarded against duplicating on reconnect).

None of these were reachable from any single module's own test suite (most
had none) — each surfaced only once another converted module fed it the
exact input shape it had never actually been exercised against.
