---
title: "Settings and lazy loading"
description: "<html-import-settings> and <html-module-settings>, their lexical scope and precedence, and load=\"lazy\"."
sidebar:
  order: 4
---

## Settings

Two optional elements set defaults for one document. They are an extension beyond the PRD (which fixes `--` and has
no settings element).

```html
<html-import-settings delimiter="-" base="./vendor/ui@2/" conflict="reuse" load="lazy" errors="throw"></html-import-settings>

<html-import src="./kit.html" as="ui"></html-import>                     <!-- ./vendor/ui@2/kit.html, <ui-button>, lazy, … -->
<html-import src="./icons.html" as="icon" load="eager"></html-import>   <!-- an attribute overrides the settings -->
```

```html
<!-- inside an HTML module -->
<html-module-settings shadow="closed" delegates-focus></html-module-settings>
<html-export name="safe"><template>…</template></html-export>                                     <!-- closed, delegates focus -->
<html-export name="glass" shadow="open" delegates-focus="false"><template>…</template></html-export>
```

- **`<html-import-settings>`** (`delimiter`, `base`, `conflict`, `load`, `errors`): defaults for the `<html-import>`
  elements of the document it is in. `base` is a base URL for resolving every relative `<html-import src>` (and
  `<html-export src>` re-exports, in a module), resolved against the document's own URL (not `<base href>`); nothing
  else is affected.
- **`<html-module-settings>`** (`shadow`, `delegates-focus`): defaults for a module's component exports, baked into
  each definition so runtime-loaded and compiled modules agree. In a page it is an error: a page has no exports.
- **Scope is lexical.** A page's settings apply only to that page's imports; a module's only to that module. Page
  settings and instance options never leak into modules.
- **Placement.** Before every `<html-import>` (or `<html-export>`), at most one of each per document. In a page a
  late or second one is an `error` event on that element and is ignored; in a module it is a `SyntaxError`.
- **Invalid values** are errors that list the valid values. In a page, an invalid `<html-import-settings>` fails
  every import of that page rather than letting them run with other options.
- **Precedence**, for each option:

  | | Pages | Inside modules |
  | --- | --- | --- |
  | 1 | the `<html-import>` attribute | the `<html-import>` attribute |
  | 2 | the document's `<html-import-settings>` | the module's `<html-import-settings>` |
  | 3 | `createHTMLModules({ delimiter, base, conflict, load, errors })` | (never) |
  | 4 | built-in defaults: `--`, no base, `error`, `eager`, `event` | built-in defaults |

  The JavaScript API (`HTMLModules.import()`, `bind()`) is not in any document: its call options override the
  instance options, and document settings do not apply to it.

The full rules are in [HTML syntax](/html-modules/api/html-syntax/#html-import-settings).

## Lazy loading

With `load="lazy"` (on an import, or for a document in `<html-import-settings>`), nothing is fetched until one of the
import's tags is actually used. Then the module loads, its tags are registered, and the waiting elements upgrade in
place.

```html
<html-import-settings load="lazy"></html-import-settings>
<html-import src="./ui.html" as="ui"></html-import>                  <!-- fetched when the first <ui--…> appears -->
<html-import src="./tip.html">                                     <!-- fetched when a <my-tip> appears -->
  <html-binding export="default" element="my-tip"></html-binding>
</html-import>
```

- **What it waits for.** A namespace import waits for any tag starting with `<as><delimiter>`; an import with
  `<html-binding>` children waits for exactly the tags they bind. An import with nothing to wait for loads only when
  `el.load()` is called.
- **Where it looks.** The document (one `MutationObserver` per window, plus a scan of what is already there), and
  every shadow root created by an html-modules component, open or closed. What it does *not* see is listed under
  [Honest limitations](/html-modules/limitations/).
- **API.** `el.ready` resolves when the module has been loaded and bound; `el.load()` forces loading; `el.module`
  waits; `el.state` is `waiting` until then. Disconnecting a waiting import cancels the watching; reconnecting
  resumes it.
- **In modules**, a module's own lazy import loads when one of its tags first appears (typically in one of its
  components' shadow roots). A lazy module import cannot `adopt` a stylesheet.
- **JavaScript.** `HTMLModules.import(src, { as, load: 'lazy' })` returns a handle right away instead of a promise:
  `{ ready, load(), cancel(), state }`.
- **The compiler does not lazy-load**: compiled dependencies are static `import`s.

Full detail: [Lazy loading](/html-modules/api/javascript/#lazy-loading).
