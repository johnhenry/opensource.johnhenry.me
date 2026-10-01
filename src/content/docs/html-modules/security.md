---
title: "Security model"
description: "What html-modules guarantees (inert parsing, JSON as data, integrity pinning, Trusted Types and CSP), the opt-in template sanitizer, and what stays yours: a module URL is as trusted as a script src unless you sanitize it."
sidebar:
  order: 12
---

html-modules is a loader and a registrar, not a sandbox. It fetches markup you point it at, validates its shape, and
turns it into custom elements; whatever that markup (or a JavaScript module you import) does in the page is
done with your page's authority.

**What html-modules guarantees:**

- **Only declared exports are exports.** `readHTMLModule()` / `scanHTMLModule()` collect `<html-export>`,
  `<html-import>` and the settings elements, and `recordFromRaw()` rejects anything else a module could smuggle in
  (nesting, a second template, data mixed with a template). Everything else in the file is never evaluated:
  a module is parsed into a detached element of an inert, script-less `DOMParser` document (never connected, so
  nothing loads), and a `<script>` in a module does not run.
- **JSON data is data.** A data export is read with `JSON.parse` (and compiled to `JSON.parse(...)`), so a
  `"__proto__"` key is an own key and never reaches a prototype.
- **Fetched HTML can be pinned.** `integrity` (an `<html-import integrity>` attribute, or the `integrity` option of
  `HTMLModules.load()` / `import()`) is Subresource Integrity metadata, checked with `crypto.subtle.digest` against the
  bytes actually received: the strongest algorithm listed decides, and a mismatch rejects with `Integrity check
  failed for HTML module <url>` and is not cached. It fails closed: without `crypto.subtle`, or for a JavaScript
  module (which `import()` cannot verify), the load is refused.
- **Requests carry what you configure.** `credentials` and `mode` (`createHTMLModules()` options, overridable per
  `load()`) are passed to `fetch()` for HTML modules; by default html-modules adds nothing to the platform's
  defaults.
- **Data binding cannot inject.** A `{{attribute}}` binding is only an attribute name: no expression is evaluated, text
  is set as a text node's `data` (never parsed as markup), URL attributes drop `javascript:` / `vbscript:` / HTML `data:`
  values, and `on*`, `style` and `srcdoc` are never bound. See [Data binding](/html-modules/data-binding/#data-binding).
- **Registration is all or nothing and never silent.** Tags are checked before any is registered, an existing tag is
  never redefined, and every failure is an `error` event, a rejection or a throw
  ([Errors](/html-modules/resolution-and-errors/#errors)).
- **Templates from a less-trusted origin can be sanitized, opt in.** `sanitize` is a function every component template
  passes through at load time, before any component is defined, so a module can be loaded with its `<img onerror>`,
  `javascript:` links, `<iframe srcdoc>`, handlers and `<script>` removed. html-modules ships the hook and an
  [adapter for `@johnhenry/safe-fragment`](#sanitizing-templates-from-less-trusted-modules); it fails closed (a sanitizer
  that throws means the module does not load) and it is off unless you set it.
- **Trusted Types and CSP are supported.** The two HTML sinks (`innerHTML` on a detached element for fetched modules,
  `template.innerHTML` for a component's template) go through a `trustedTypes` policy you pass, or a policy named
  `html-modules`; a `nonce` option covers the `<style>` fallback. html-modules inserts no `<script>` and uses no `eval`.
  See [Trusted Types and CSP](/html-modules/api/javascript/#trusted-types-and-csp).

**What is still yours:**

- **A module URL is as trusted as a `<script src>`, unless you opt in to sanitizing it.** By default templates are
  stamped into the page as real DOM, so a module you import can do what its markup can do: `<img src=x onerror="…">`,
  `<a href="javascript:…">`, `<iframe srcdoc="…">` and inline event handlers all execute (subject to your CSP). Import only
  modules you would load as a script, from origins you control or have pinned with `integrity`, or
  [sanitize their templates](#sanitizing-templates-from-less-trusted-modules); do not build a module's URL or source from user
  input.
- **The sanitizer covers templates, and nothing else.** A module's `<html-export><style>` stylesheets are not given to it
  (CSS can still leak state through `url()` requests and redress the UI), compiled output has no load step to hook, a
  sanitized module's JavaScript imports are refused rather than vetted, and what your own scripts later put in a shadow
  root is not sanitized. A sanitizer is only as good as its function: html-modules does not check what it returns beyond
  its type.
- **Importing JavaScript runs code.** `<html-import src="./x.js">` is a native `import()`: the module's top level
  runs with full page authority, and html-modules cannot verify it (use an import map `integrity` field, or a CSP
  `script-src` allowlist). Tracked in [html-modules#1](https://github.com/johnhenry/html-modules/issues/1).
- **`integrity` covers only what you give it.** Each import is pinned individually; a re-export or dependency
  without its own `integrity` is fetched unverified, and a module that is verified can still import a
  JavaScript module that is not. Compiled output is ordinary JavaScript: pin it as you pin any script. Pinning a
  whole module graph in one place is tracked in [html-modules#2](https://github.com/johnhenry/html-modules/issues/2).
- **CORS, cookies and CSP are the platform's.** `credentials: 'include'` sends cookies to whatever origin the
  module is on; html-modules does not add or relax any CORS check, and `connect-src` / `script-src` decide what may
  be fetched or imported.
- **Rendering untrusted data into a template is yours.** Templates are static markup; html-modules does not
  sanitize what your own scripts later put into a component's shadow DOM.

### Sanitizing templates from less-trusted modules

```js
import { HTMLModules } from '@johnhenry/html-modules/browser';
import { safeFragmentSanitizer } from '@johnhenry/html-modules/safe-fragment';
import * as safeFragment from '@johnhenry/safe-fragment';           // you bring it: it is a peer, not a dependency

HTMLModules.sanitize = safeFragmentSanitizer({ safeFragment, profile: { namespaces: ['ui'] } });   // every import
await HTMLModules.import('https://cdn.example/ui.html', { as: 'ui' });                             // its templates come out sanitized
await HTMLModules.import('./mine.html', { as: 'mine', sanitize: false });                          // opt one import out
document.addEventListener('html-modules:sanitize', (e) => console.warn('removed', e.detail.details.removed));
```

- **The hook** is `sanitize: (html, { def, url, window, report }) => string | TrustedHTML | DocumentFragment` (or a
  Promise of one). Set it on `createHTMLModules({ sanitize })`, assign `HTMLModules.sanitize`, pass it to
  `HTMLModules.import()` / `load()`, or set `el.sanitize` on an `<html-import>` made in script (a function cannot be an
  attribute, so there is no `<html-import-settings sanitize>`). `false` opts out. A `DocumentFragment` result is stamped without
  being parsed again.
- **It runs at load time**, in the loader, after the module record is read and before definitions are created: the runtime
  stamps templates synchronously, so an async sanitizer is awaited there, once per template, and nothing is registered
  until every template of the module is done. It receives each component's template and never the module source (which would
  strip `<html-export>` and `<html-import>`).
- **A sanitized module sanitizes what it imports**, with the same function, and **cannot import JavaScript**
  (`Refusing to import the JavaScript module … from a sanitized HTML module`). A module is cached per sanitizer, so the same URL can be
  imported both ways under different tags.
- **`{{attr}}` bindings survive** a sanitizer that leaves the text alone (safe-fragment does); the Trusted Types policy
  still wraps what is parsed, and a fragment never reaches an HTML sink.
- **Reports are events**: a sanitizer calls `report(details)`, and it arrives as `{ type: 'sanitize', url, name, details }` on
  `onEvent` and as `html-modules:sanitize` on the document. The safe-fragment adapter reports every element, attribute and URL its
  profile removed (the native Sanitizer API does not report what it strips by itself: `<script>`, `<iframe>`, handlers, `javascript:`; DOMPurify's report does).
- **What a template loses** depends on the profile. `registerTemplateProfile()` (what `profile: { namespaces: ['ui'] }` runs)
  derives safe-fragment's `component-template-v1` (`ui-v1` plus `<slot>`, `part`, `slot`, `exportparts`) and adds `ui--*` custom
  elements. Under it, or any safe-fragment profile, a template loses `<style>` (a safe-fragment non-goal, ADR 0006: the module's
  own stylesheets are outside the template and untouched), forms and their inputs (so a `form-associated` component loses its
  control), SVG, `style=""`, `data-*` beyond what you list, `http:` URLs. Its `id`s (and the `for`/`aria-*` references) are kept
  (`idPolicy: 'keep-in-shadow'`, the adapter's default, because html-modules stamps every template into a shadow root);
  `idPolicy: 'prefix'` rewrites them to `user-content-<id>`. Per-profile table:
  [Sanitizing templates](/html-modules/api/sanitize/#what-a-template-loses).
- **Trusted Types**: with `require-trusted-types-for 'script'`, safe-fragment's DOMPurify fallback needs `dompurify` in your
  `trusted-types` list next to `html-modules`; without it the module fails to load rather than loading unsanitized.

Reference: [Sanitizing templates](/html-modules/api/sanitize/) and the runnable example `examples/sanitize.html`.

