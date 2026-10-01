---
title: "Adding a new export kind"
description: "The library's real extension point: what an <html-export> can hold, decided in one function and consumed by two back ends. Plus the project layout."
sidebar:
  order: 11
---

An HTML module has four export kinds: **component** (a `<template>`), **stylesheet** (only `<style>`), **data**
(one JSON `<script>`) and **re-export** (`src`). The export kind is this library's real extension point: elements,
naming and binding are fixed by the PRD, but what an `<html-export>` can *hold* is decided in one function and
consumed by two back ends. The stylesheet kind is the best worked example in the package's history (it shipped with
the PRD implementation in `e597271`), because it is the one kind that needed its own runtime value, its own binding
behaviour (`adopt`) and its own exclusion from registration, all of which a new kind may need.

**Smallest: a new attribute or payload on an existing kind.** `record.js`'s `exportRecord()` is a chain of branches
by children shape; a new component attribute with concrete semantics (as `delegates-focus` was) is one more field in
the component branch, passed through `defineHTMLComponent()` by the loader and emitted by the compiler. A new JSON
MIME type is a change to one regular expression. And if the new thing is just a value, it is already a **data**
export: no new kind. The test that separates the two: *does the value need its own runtime type that bindings must
treat differently* (registered, adopted, or refused), which a JSON value cannot express?

**A genuinely new kind.** Every existing kind follows one pattern, so a new one does too:

1. **`src/record.js`**: a branch in `exportRecord()` that recognizes the new children shape and returns
   `{ kind: '<x>', name, default?, … }` (copy the stylesheet branch), plus its entry in the `ExportRecord` typedef.
   Its validation errors are `SyntaxError`s built with `describe(raw)` and `where`, like every other.
2. **`src/scan.js`**, only if the payload lives somewhere the scanner does not already capture (it keeps a direct
   child's `text` for raw-text elements and `html` for `<template>`). `rawOf()` in `record.js` is the DOM-side
   equivalent and must capture the same thing.
3. **`src/runtime.js`**: a value class and `define<X>()` (copy `HTMLStylesheet` / `defineHTMLStylesheet`), branded
   with a `Symbol.for('html-modules.<x>')` so copies of the library recognize each other, an `is<X>()` predicate, and
   a label in `kindOf()` so binding errors name the kind. If bindings treat it specially, that is a branch in
   `applyBinding()` (as `adopt` is for stylesheets). `manifest()` and `componentsOf()` exclude non-element values
   already.
4. **The one part that isn't boilerplate: the two back ends must build the same value.** `linkHTMLModule()` in
   `src/loader.js` (runtime) and `compileRecord()` in `src/compiler.js` (compiled output) each have a `switch
   (e.kind)`; add the case to both, and add the new `define<X>` to the compiler's helper imports. The module record is
   the contract between them: neither back end looks at HTML, so if the record is right and both cases construct the
   value from the same record fields, runtime-loaded and compiled modules cannot disagree. The `<html-export>`
   element itself needs nothing: exports are read from a module's source, never executed in place.

**Tests**, all against local files and linkedom, no browser or network: a record test in `test/format.test.js`
(both readers, and every new error message with the module URL), a case in `test/compiler.test.js`'s "runtime and
compiled definitions are equivalent", and an example module using the new kind under `examples/components/`, which
`test/examples.test.js` automatically runs through the DOM reader / scanner agreement check and the loader. Add a
line to `examples/04-invalid-modules-fail-with-a-named-syntax-error.mjs` for each new error.

Contrast with `@johnhenry/fileable`'s "Adding a new tag" section, where a new tag relabels itself so the rest of
the pipeline never learns it exists. Here the opposite holds: both back ends *must* learn the new kind, and the
shared record, plus the equivalence test, is what keeps them in step.

## Project layout

```
src/
  names.js         export names, namespaces and delimiters
  settings.js      the settings vocabulary, validation and precedence
  runtime.js       HTML Component Definitions → custom elements; binding (shared by runtime and compiled code)
  record.js        module records; readHTMLModule() from a DOM
  scan.js          scanHTMLModule() from source text
  loader.js        resolve, fetch, parse, cache, link dependencies
  lazy.js          lazy loading: what an import waits for, and the watcher
  html-modules.js  createHTMLModules(): load / import / bind
  elements.js      <html-import>, <html-binding>, <html-export>, and the settings elements
  compiler.js      compileHTMLModule()
  index.js         the side-effect-free root entry point
  browser.js       the one-script bootstrap
bin/html-module.js the compiler CLI
examples/          numbered Node examples (npm run examples) and the browser demo site (open /examples/)
test/              node:test suites (npm test), with linkedom as the test DOM
docs/api.md        the API reference (docs/api/*.md)
docs/GAP.md        the PRD mapped onto the code
```

```sh
npm test                    # node:test, with linkedom as the test DOM
npm run check               # every source file parses; entry points import
npm run examples            # the numbered Node examples, each self-verifying
npm run examples:compile    # regenerate examples/compiled/
```
