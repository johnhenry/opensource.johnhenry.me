---
title: "Limitations and traps"
description: "What html-modules does not do, traps first: accidental default exports, bare specifiers, late settings, one runtime copy, permanent tag names, lazy loading's blind spots, and the non-goals."
sidebar:
  order: 9
---

Traps first: behaviour that is deliberate and documented in the reference, but easy to
trip over because the mistake looks like ordinary HTML. Nothing in html-modules fails
silently (a mistake is an exception, a rejection or an `error` event), but several of
these fail somewhere you might not be looking. The permanent limitations, which follow
from the custom elements platform, come after.

## Traps

### Writing modules

- **`name=""` is a default export.** A bare or empty `name` means the default, so a
  templating variable that renders as `name=""` silently turns a named export into the
  default one. Write `name="default"` when you mean it. The `default` attribute on its
  own (`<html-export default>`) is an error that points to `name="default"`.
- **A default-only export has no identity and is not registered by `as=`.** Its
  definition's `name` is `null` and it is not in the `components` manifest; the importer
  must name it with `<html-binding export="default" element="…">`.
- **`</script>` ends a script element, even inside a JSON string.** A data export
  containing `{"s": "</script>"}` breaks the element and surfaces as an "invalid JSON"
  `SyntaxError`. Write `"<\/script>"`, which is valid JSON.
- **`<style>` beside the template is shared; `<style>` inside it is copied.** Styles
  beside the `<template>` become one constructed stylesheet per definition, adopted by
  every instance; styles inside the template are cloned into each instance's shadow
  root.
- **A module's imports are private.** A stylesheet a module adopts applies inside that
  module's components only, never to the page, and a module's own lazy import cannot
  `adopt` at all.

### Importing and settings

- **`ui.html` is a bare specifier.** Exactly as in JavaScript, a `src` without `./` goes
  to the import map (`import.meta.resolve`), not to the document's folder, and fails with
  `TypeError: Unable to resolve bare specifier` when the map has no entry. Write
  `./ui.html`.
- **Settings must come first, and a late one is ignored.** An `<html-import-settings>`
  after an `<html-import>`, inserted after imports started, or a second one in the same
  document fires an `error` event on itself and changes nothing. Inside a module, the
  same mistakes are a `SyntaxError`.
- **An invalid `<html-import-settings>` fails every import of its page**, rather than
  letting them run with other options.
- **`base` is document-level only, and ignores `<base href>`.** `base` on an
  `<html-import>` is a `SyntaxError`; on `<html-import-settings>` it is resolved against
  the document's own URL, not its `<base href>`, and it only affects HTML-module
  specifiers.
- **Page settings and instance options never reach inside a module.** A module's own
  `<html-import>`s use `--` and the built-in defaults unless the module says otherwise,
  so a page-wide `delimiter="-"` does not change the tags a module's templates use.
- **Document settings never apply to the JavaScript API.** `HTMLModules.import()` and
  `bind()` are not in any document: only their call options and the instance options
  apply. And `HTMLModules.import()` never throws for bad options; it returns a rejected
  promise.
- **`HTMLModules.import(src, { load: 'lazy' })` returns a handle, not a promise**:
  `{ ready, load(), cancel(), state }`. Await `handle.ready`.
- **The compiler never lazy-loads.** Compiled dependencies are static `import`s;
  `load="lazy"` is carried along but does not make compiled code lazy.
- **`npx html-module` outside a project that has the package installed** looks for an npm
  package *named* `html-module`, which is not this one. Use
  `npx -p @johnhenry/html-modules html-module …`.

## Limitations

- **Custom element names are global and permanent, and scoped registries are not
  supported yet.** Once a tag is defined in a window it cannot be undefined or
  redefined: removing an `<html-import>` unregisters nothing, and a second version of a
  library needs its own namespace (or `conflict="reuse"`, which keeps the first). The
  runtime takes a `registry` option, but a component's shadow root is attached without
  one, so the tags inside its template resolve against the global registry. Scoped
  custom element registries are deferred until native support settles (see
  [Deferred](/html-modules/prd-coverage/#deferred)); selective `<html-binding>` imports
  are the way to keep the global registry small meanwhile.
- **Lazy loading only sees trees it can observe.** It watches the document and the
  shadow roots html-modules itself creates (open or closed). A tag used inside a shadow
  root made by other code (a JS component's own `attachShadow()`), in another document
  (an iframe), in `<template>` content not yet cloned into a watched tree, or in an
  element created but never inserted does not trigger the load. Call `el.load()` (or
  the handle's `load()`) for those; this is a property of `MutationObserver`, which
  cannot see into shadow roots it was not given.
- **A runtime copy and a compiled copy of the same module conflict.** Loading `ui.html`
  at runtime and importing a compiled `ui.js` gives two *different* definitions, so
  registering both under the same tags fails with `Cannot bind <…>: it is already
  defined …` unless one import says `conflict="reuse"` (the first definition wins) or
  they use different namespaces. Relatedly, load **one copy of the runtime** per page:
  two copies of `runtime.js` at different URLs (say, the page's from `node_modules` and
  a compiled module's from a CDN) still recognize each other's definitions, but keep
  separate registration bookkeeping, lazy-loading watchers and stylesheet caches, so
  conflict messages lose the "defined by" detail and lazy imports stop seeing the other
  copy's shadow roots. Map `@johnhenry/html-modules/runtime` to the same file the
  bootstrap uses (see [Getting started](/html-modules/getting-started/)).
- **The `.` (and `_`) delimiter cannot name one-word exports.** `.` is a legal custom
  element name character, but `ui.card` has no hyphen, so binding a one-word export
  under `delimiter="."` is a `SyntaxError` naming the tag; a namespace import checks
  every tag before registering any, so it fails whole. Two-word exports
  (`ui.custom-card`) work. `-` always works but makes tags ambiguous to read back (the
  runtime records `{ tag, namespace, export }` instead of parsing). `--` has neither
  problem, which is why it is the default.

## Non-goals

From the PRD: no custom JavaScript module loader; no direct `import … from "./ui.html"`
in JavaScript (use `HTMLModules.load()` or the [compiler](/html-modules/compiler/)); no
service workers; no bundler requirement; no framework; import maps are not responsible
for HTML. Package and CDN routing (version ranges, mirrors, lockfiles) is out of scope:
use [mport](/mport/), and point a page import map at what it
resolves.

Deferred PRD items (HTML Include, further export metadata, a `bundle` compiler format,
scoped registries) are listed with reasons in
[PRD coverage and extensions](/html-modules/prd-coverage/#deferred).
