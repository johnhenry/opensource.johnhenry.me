---
title: "Getting started"
description: "Register <safe-fragment>, render your first untrusted markup, and set up the dompurify import map on pages with no bundler."
sidebar:
  order: 1
---

:::caution[Not yet on npm]
The package is unpublished and awaiting independent security review
([safe-fragment#1](https://github.com/johnhenry/safe-fragment/issues/1)). Until a release exists, work from a clone of the
[repository](https://github.com/johnhenry/safe-fragment). The commands below are what installation will look like once it is published.
:::

## Install

```bash
npm install @johnhenry/safe-fragment
```

**Provenance.** This is a new package: never published under any other name, and `0.0.0` is the unreleased development
version, so there is no earlier name or version to migrate from.

`dompurify` (pinned to an exact version) is a normal dependency, installed automatically. It is loaded lazily, only on browsers
without `Element.setHTML` (Safari today) or when you force the fallback. The shipped ESM and CJS output targets evergreen
browsers; Node 26 or newer is only the toolchain (`devEngines`).

## Register the element

```js
import { registerSafeFragment } from "@johnhenry/safe-fragment";

// Call once, from browser-executed code. It never happens as an import side effect.
registerSafeFragment();
```

`registerSafeFragment()` is idempotent for a tag name, and throws `UNSUPPORTED_ENVIRONMENT` where there is no DOM. Its options
(`fetch`, `maxInputLength`, `loadDOMPurify`, `tagName`) are in the [API reference](/safe-fragment/api/element/).

## First render

Set the `.html` property from script:

```html
<safe-fragment profile="article-v1" id="post"></safe-fragment>
<script type="module">
  document.getElementById("post").html = await fetch("/api/posts/42").then((r) => r.text());
</script>
```

Or declaratively, through a `<template>` child. `<template>` content is inert until explicitly read, so the browser never
eagerly parses it as live markup:

```html
<safe-fragment profile="article-v1">
  <template>
    <p>Hello <strong>world</strong>. <img src="x" onerror="alert(1)" /></p>
  </template>
</safe-fragment>
```

The `onerror` attribute is removed and nothing executes. The `profile` attribute is **required**: there is no default profile,
and a missing or unknown one rejects with `UNKNOWN_PROFILE`. See [the element](/safe-fragment/element/) for the source
precedence and [profiles](/safe-fragment/profiles/) for choosing one.

To see what a render changed, listen for `safe-fragment:render`, whose `detail.report` is a `SanitizationReport`:

```js
post.addEventListener("safe-fragment:render", (e) => console.log(e.detail.report.removedAttributes));
```

## No bundler: the import map

The fallback engine does `import("dompurify")`, a bare specifier. With a bundler it just resolves. With none (a static page,
`<script type="module">`), map it, **pinning the exact version this release pins**:

```html
<script type="importmap">
  {
    "imports": {
      "dompurify": "https://cdn.jsdelivr.net/npm/dompurify@3.4.16/dist/purify.es.mjs"
    }
  }
</script>
```

or hand safe-fragment the factory yourself:

```js
registerSafeFragment({
  loadDOMPurify: () => import("https://cdn.jsdelivr.net/npm/dompurify@3.4.16/dist/purify.es.mjs").then((m) => m.default),
});
```

If neither is in place and the browser needs the fallback, rendering rejects with `SANITIZER_UNAVAILABLE`, whose message says
exactly this. Call `await preloadSanitizer()` at startup to pay the load once and surface the problem early. It resolves
`"native"` without loading anything where `setHTML` exists, and it is what makes the synchronous API usable on Safari. See
[the sanitize API](/safe-fragment/sanitize-api/).

**With [mport](https://github.com/johnhenry/mport):** on raw-file CDNs (jsDelivr, unpkg) the generated import map only contains
the entry points you ask for, so list `dompurify` explicitly:

```bash
npx @johnhenry/mport build @johnhenry/safe-fragment@0 dompurify@3.4.16
```

Use the exact version this release pins. Every page in the repository's [examples](/safe-fragment/examples/) carries an import
map for it.
