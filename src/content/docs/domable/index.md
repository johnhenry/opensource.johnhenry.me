---
title: "domable"
description: "Convert between HTML text, real DOM nodes, and React-element-shaped objects; build DOM directly with a createElement()-style hyperscript API; turn HTML strings (or DOM nodes) into Custom Element classes."
---

**`@johnhenry/domable`** converts between three representations of markup —
HTML text, real DOM nodes, and React-element-shaped plain objects — and
builds DOM directly with a `createElement()`-style hyperscript API. It can
also turn an HTML string (or an existing `Node`) into a Custom Element
class.

> **Provenance:** this package consolidates six previously-standalone
> modules from [`johnhenry/lib`](https://github.com/johnhenry/lib) —
> `text-to-DOM-nodes`, `DOM-nodes-to-text`, `create-element`,
> `simple-element`, `react-to-dom`, and `dom-to-React` — which already
> depended on each other via relative sibling imports. Merging them into one
> real package removed that cross-repo reach, and testing all six together
> for the first time (most had no tests at all before) surfaced several
> real, previously-undetected bugs. This is not a line-for-line port —
> see [Bugs found while merging](/domable/bugs-found-while-merging/) for
> the full list, with root causes.

No runtime dependencies. Every module is written against standard browser
globals (`document`, `DOMParser`, `Node`, `customElements`, …) and runs
unmodified in a browser; tests run under Node against a real DOM
implementation ([jsdom](https://github.com/jsdom/jsdom), not a mock).

## Install

```sh
npm install @johnhenry/domable
```

## The conversion matrix

Three representations — **Text** (an HTML string), **DOM** (a real
`Node`), and **React** (a plain object shaped like
`React.createElement()`'s own output) — and a function for every arrow
between them:

```
            -> Text        -> DOM              -> React
Text        (itself)       textToDom            textToReact
DOM         domToText      (itself)              domToReact
React       reactToText    reactToDom            (itself)
```

`textToReact`/`reactToText` are thin compositions of the other four, not
reimplementations — they stay correct automatically if the underlying
conversions change.

```javascript
import { textToDom, domToText, domToReact, reactToDom } from "@johnhenry/domable";

const frag = textToDom("<div>hi</div>");   // -> DocumentFragment
domToText(frag.firstChild);                 // -> '<div>hi</div>'

const react = domToReact(frag.firstChild);  // -> {$$typeof, type: "div", props: {...}}
reactToDom(react).outerHTML;                // -> '<div>hi</div>'
```

React itself is never imported or required — `domToReact`/`reactToDom`
produce and consume plain objects matching the real shape
`React.createElement()` returns (`$$typeof: Symbol.for("react.element")`,
etc.), so the result is usable anywhere a real React element is (passed to
`ReactDOM.render()`, diffed by React itself, …) without this package ever
depending on React.

## The pages here

- [API](/domable/api/) — `createElement`/hyperscript, per-tag shorthands,
  `domToText`, `simple-element`, and `dom-to-hyperscript`
- [Bugs found while merging](/domable/bugs-found-while-merging/) — real
  defects the six original modules had, undetected until they were tested
  together

## License

MIT

## Source

[github.com/johnhenry/domable](https://github.com/johnhenry/domable)
