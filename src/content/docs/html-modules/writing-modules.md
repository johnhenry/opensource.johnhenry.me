---
title: "Writing HTML modules"
description: "Component, stylesheet, data and re-export exports; default exports and their spellings; modules that import modules."
sidebar:
  order: 2
---

An HTML module is an ordinary HTML file. Each `<html-export>` in it is a public export; everything else is private
to the file. Export names are lower-case words joined by single hyphens (`card`, `fancy-button`).

| Export | Markup | Value |
| --- | --- | --- |
| Component | `<html-export name="card"><template>…</template></html-export>` | an HTML Component Definition |
| Stylesheet | `<html-export name="dark"><style>…</style></html-export>` | an `HTMLStylesheet` |
| Data | `<html-export name="config"><script type="application/json">…</script></html-export>` | the parsed JSON |
| Default | `<html-export name="default">…</html-export>` (or a bare `name`) | the `default` export, like `export default` |
| Named and default | `<html-export name="card" default>…</html-export>` | `card`, and also `default`, like `export { card, card as default }` |
| Every component of another module | `<html-export src="./more.html"></html-export>` | like `export * from` |
| One export of another module | `<html-export src="./b.html" name="button" import="fancy-button"></html-export>` | like `export { fancyButton as button } from` |
| Several exports of another module | `<html-export src="./b.html" names="card, fancy-button as button"></html-export>` | like `export { card, fancyButton as button } from` |
| Another module as a namespace | `<html-export src="./icons.html" name="icon" import="*"></html-export>` | like `export * as icon from` |
| Another module's export as the default | `<html-export src="./b.html" name="default" import="card"></html-export>` | like `export { card as default } from` |

All the ESM re-export forms are covered; see [Re-exports](#re-exports).

A component export holds exactly one `<template>`, which is stamped into a shadow root, so native `<slot>`, named
slots and `part` work as usual. Its attributes are `shadow="open"` (default) or `shadow="closed"`, and
`delegates-focus`. `<style>` elements *beside* the template become the component's `styles`: one constructed
stylesheet per definition, adopted by every instance's shadow root. (`<style>` inside the template works too, but
is cloned into each instance.)

## Default exports

`name="default"` is the default export. It mirrors JavaScript's `export default`, and pairs with
`<html-binding export="default" element="…">` on the importing side:

```html
<html-export name="default"><template>…</template></html-export>        <!-- export default -->
<html-export name><template>…</template></html-export>                  <!-- the same: an empty name -->
<html-export name="card" default><template>…</template></html-export>   <!-- export { card, card as default } -->
```

- A **bare `name`** (an empty value) also means the default. Watch out for templating: a variable that renders as
  `name=""` silently becomes a default export. Write `name="default"` when you mean it.
- The **`default` attribute** is a modifier for a real name. On its own (`<html-export default>`) it is an error that
  points to `name="default"`, and `name="default" default` is an error too.
- A module has at most one default, however it is spelled. `default` and `components` cannot be named exports.
  A named re-export can be the default (see [Re-exports](#re-exports)); star re-exports never pass a default
  through, as in ESM.
- A default-only export has no identity of its own (its definition's `name` is `null`), is not in the `components`
  manifest, and is not registered by `as=`: the importer names it with `element=`.

## Re-exports

`<html-export src>` re-exports another module (HTML or JS), with a counterpart for every ESM form:

| ESM | HTML module |
| --- | --- |
| `export * from "./more.html"` | `<html-export src="./more.html"></html-export>` |
| `export { card } from "./b.html"` | `<html-export src="./b.html" name="card"></html-export>` |
| `export { fancyButton as button } from "./b.html"` | `<html-export src="./b.html" name="button" import="fancy-button"></html-export>` |
| `export { card, fancyButton as button } from "./b.html"` | `<html-export src="./b.html" names="card, fancy-button as button"></html-export>` |
| `export * as icon from "./icons.html"` | `<html-export src="./icons.html" name="icon" import="*"></html-export>` |
| `export { default } from "./b.html"` | `<html-export src="./b.html" name="default"></html-export>` |
| `export { card as default } from "./b.html"` | `<html-export src="./b.html" name="default" import="card"></html-export>` |
| `export { default as card } from "./b.html"` | `<html-export src="./b.html" name="card" import="default"></html-export>` |
| `export { card, card as default } from "./b.html"` | `<html-export src="./b.html" name="card" default></html-export>` |

- Re-exports keep identity: `barrel.button === b.fancyButton`. A missing name fails with ESM's message, `The
  requested module './b.html' does not provide an export named 'nope'`, and circular re-exports are rejected.
- A **namespace** re-export's components also join this module's manifest as `<name>--<export>`, so importing the
  barrel with `as="ui"` registers `<ui--icon--star>`, just as `<html-import as="icon">` writes `<icon--star>` inside
  a module.
- A **default** re-export works like any default-only export: it is not registered by `as=`, and the importer names
  it with `<html-binding export="default" element="…">`.
- Star re-exports follow `export *`: no `default`, local names win, and names two sources disagree on are left out.

## Modules that import modules

Modules can import other modules with the same `<html-import>` element a page uses. Those imports are private to the
module: they are bound when one of the module's components is registered, and a stylesheet the module adopts
applies inside the module's components only.

```html
<!-- rating.html -->
<html-import src="./icons.html" as="icon"></html-import>
<html-import src="./themes.html"><html-binding export="gold" adopt></html-binding></html-import>

<html-export name="stars">
  <template><icon--star></icon--star><icon--star></icon--star><icon--star></icon--star></template>
</html-export>
```

Every element and attribute, with its validation rules, is in [HTML syntax](/html-modules/api/html-syntax/).
