---
title: "Security model"
description: "What html-modules guarantees (inert parsing, JSON as data, integrity pinning, Trusted Types and CSP) and what stays yours: a module URL is as trusted as a script src."
sidebar:
  order: 10
---

html-modules is a loader and a registrar, not a sandbox. It fetches markup you point it at, validates its shape, and
turns it into custom elements; whatever that markup (or a JavaScript module you import) does in the page is
done with your page's authority.

**What html-modules guarantees:**

- **Only declared exports are exports.** `readHTMLModule()` / `scanHTMLModule()` collect `<html-export>`,
  `<html-import>` and the settings elements, and `recordFromRaw()` rejects anything else a module could smuggle in
  (nesting, a second template, data mixed with a template). Everything else in the file is never evaluated:
  modules are parsed with `DOMParser` into an inert document, so a `<script>` in a module does not run.
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
- **Registration is all or nothing and never silent.** Tags are checked before any is registered, an existing tag is
  never redefined, and every failure is an `error` event, a rejection or a throw
  ([Errors](/html-modules/resolution-and-errors/#errors)).
- **Trusted Types and CSP are supported.** The two HTML sinks (`DOMParser.parseFromString` for fetched modules,
  `template.innerHTML` for a component's template) go through a `trustedTypes` policy you pass, or a policy named
  `html-modules`; a `nonce` option covers the `<style>` fallback. html-modules inserts no `<script>` and uses no `eval`.
  See [Trusted Types and CSP](/html-modules/api/javascript/#trusted-types-and-csp).

**What is still yours:**

- **A module URL is as trusted as a `<script src>`.** Templates are stamped into the page as real DOM, so a module
  you import can do what its markup can do: `<img src=x onerror="…">`, `<a href="javascript:…">`,
  `<iframe srcdoc="…">` and inline event handlers all execute (subject to your CSP). Import only modules you would
  load as a script, from origins you control or have pinned with `integrity`; do not build a module's URL or source
  from user input. An opt-in sanitizer for less-trusted markup is tracked in [html-modules#3](https://github.com/johnhenry/html-modules/issues/3).
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
