---
title: "Resolution, caching and errors"
description: "How src resolves (import maps included), how modules are cached, and how failures are reported: nothing fails silently."
sidebar:
  order: 7
---

## Resolution and caching

- `src` resolves like a module specifier: relative to the importing document (or, inside a module, the importing
  module), or absolute. Bare specifiers go to `hostResolve`; in the browser that is `import.meta.resolve`, so the
  page's own `<script type="importmap">` applies. Import maps only map URLs; they never parse HTML. As in
  JavaScript, `ui.html` without `./` is a bare specifier.
- A document's `<html-import-settings base>` replaces the document (or module) URL as the base for its relative
  specifiers.
- Modules are cached by resolved URL as promises, so repeated and concurrent imports share one fetch and parse.
  Failed loads are evicted and can be retried.
- Circular dependencies between HTML modules are rejected with the cycle in the message, whether the modules load
  one after another or concurrently.

## Errors

Nothing fails silently. In markup, a failure is an `error` event (bubbling, composed, with `detail.error`) on the
element concerned, and a rejected `el.ready`; a failing `<html-binding>` fires on the binding and bubbles through its
import. In JavaScript it is a throw or a rejection. With `errors="throw"` it also reaches `reportError()` (the
console and `window.onerror`). Mistakes in a module's source are `SyntaxError`s naming the module, identical whether
the module is loaded or compiled. Some common ones:

| Situation | Error |
| --- | --- |
| Module fetch fails | `Error: Failed to fetch HTML module …: 404` |
| Invalid module (no template/style/JSON, duplicate or non-kebab name, two templates, bad `shadow`) | `SyntaxError` naming the module |
| A tag the delimiter makes invalid (`as="ui" delimiter="."` + `card`) | `SyntaxError: … <ui.card> is not a valid custom element name (it has no hyphen)` |
| Circular dependency | `Error: Circular HTML module dependency: a -> b -> a` |
| Tag already bound to a different component | `Error: Cannot bind <ui--card>: it is already defined by "card" from … (conflict="reuse" keeps the existing definition instead)` |
| Missing export | `SyntaxError: The requested module '…' does not provide an export named '…'` |
| `<html-import-settings>` after an `<html-import>` | `SyntaxError: <html-import-settings> must come before any <html-import> …` |

Every error, its exact message and where it is reported: [Errors](/html-modules/api/errors/).
