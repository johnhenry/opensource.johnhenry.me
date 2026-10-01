---
title: "safe-fragment"
description: "Web Components that render untrusted HTML into live DOM only through an explicit, versioned security profile: an allowlist of elements, attributes and URL schemes, sanitized by the native Sanitizer API or a locked-down DOMPurify."
sidebar:
  order: 0
---

:::caution[Status: not yet on npm]
`@johnhenry/safe-fragment` is **not yet on npm** and is **pending independent security review**
([safe-fragment#1](https://github.com/johnhenry/safe-fragment/issues/1)). `version` is pinned at `0.0.0`, and there is no npm
release and no GitHub release tag. Do not rely on it for hostile content until the review is done, and read
[Limitations and traps](/safe-fragment/limitations/) before using it for anything beyond experimentation. To report a suspected
sanitizer bypass, see the repository's
[SECURITY.md](https://github.com/johnhenry/safe-fragment/blob/main/SECURITY.md).
:::

**`@johnhenry/safe-fragment`** is a set of framework-agnostic, dependency-light Web Components for rendering HTML-like source
into live DOM **only** after applying an explicit, versioned security profile: an allowlist of elements, attributes, and URL
schemes. The first parse is done by the native
[HTML Sanitizer API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API) or a locked-down
[DOMPurify](https://github.com/cure53/DOMPurify) fallback, and a shared pass then re-derives the allowlist from the profile and
rebuilds the output from fresh nodes. The same pipeline is available without the element as `sanitizeToFragment()`.

This is **not** a generic `<inner-html>` wrapper. `<safe-fragment>` never assigns untrusted strings through `innerHTML`,
`outerHTML`, `insertAdjacentHTML`, `setHTMLUnsafe`, or any equivalent unsafe sink, and there is no "unsafe", "trusted" or
"allowScripts" escape hatch anywhere in the API.

```html
<safe-fragment profile="article-v1">
  <template>
    <p>Hello <strong>world</strong>. <img src="x" onerror="alert(1)" /></p>
  </template>
</safe-fragment>
<!-- Renders: <p>Hello <strong>world</strong>. <img src="x"></p>
     The onerror attribute is gone; nothing executes. -->

<script type="module">
  import { registerSafeFragment } from "@johnhenry/safe-fragment";
  registerSafeFragment(); // once, from browser-executed code
</script>
```

Importing the package never touches `window`, `document`, `HTMLElement` or `customElements`, so it is safe to import from
Node or SSR code; nothing is defined until you call `registerSafeFragment()`.

## What is in the box

| Piece | What it is |
| --- | --- |
| `<safe-fragment>` | The element. One markup source, one named profile, sanitized render, events. |
| Profiles | `plain-text-v1`, `article-v1`, `ui-v1` and the `email-v1` scaffold; versioned, frozen, and extensible by deriving your own. |
| `sanitizeToFragment()` | The same pipeline without the element: a detached, profile-conformant `DocumentFragment` plus a report. |
| `src` fetch | Optional remote markup, **disabled by default**, GET-only, origin-allowlisted, size- and time-capped. |
| `<example-sandbox>` | A *separate* component that runs application-authored, executable code in an `allow-scripts`-only iframe. Never for untrusted input. |

## Where to go next

- [Getting started](/safe-fragment/getting-started/): register the element, render something, and the no-bundler import map.
- [The `<safe-fragment>` element](/safe-fragment/element/): attributes, properties, methods, events and the `render()` result.
- [Profiles](/safe-fragment/profiles/): the built-ins, versioning, and deriving your own.
- [Security model](/safe-fragment/security/) and [Limitations and traps](/safe-fragment/limitations/): what is guaranteed and what is still yours.
- [API reference](/safe-fragment/api/): every export.

The source is on [GitHub](https://github.com/johnhenry/safe-fragment). There is no npm link because nothing has been published.
