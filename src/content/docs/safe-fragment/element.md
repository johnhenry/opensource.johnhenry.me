---
title: "The <safe-fragment> element"
description: "Attributes, properties, methods, events and the render() result of the <safe-fragment> custom element, including source precedence and lifecycle."
sidebar:
  order: 2
---

`<safe-fragment>` renders one markup source under one named profile. It never assigns untrusted strings through an unsafe sink;
the string goes through the [sanitization pipeline](/safe-fragment/security/) and only the resulting profile-conformant
fragment reaches the live DOM. Define it with `registerSafeFragment()` ([Getting started](/safe-fragment/getting-started/)).

## Attributes and properties

Every attribute has a property and every property reflects its attribute. Enumerated values are matched case-insensitively.
Properties set before the element was upgraded (frameworks, scripts that ran before `registerSafeFragment()`) are replayed
through the setters on first connect.

| Attribute | Property | Notes |
| --- | --- | --- |
| `profile` | `.profile` | **Required.** Name of a registered profile (`plain-text-v1`, `article-v1`, `ui-v1`, `email-v1`, `component-template-v1`, or one you registered). There is no default. |
| none | `.html` | Highest-precedence markup source. `undefined` behaves like `null`; a non-string is rejected with `INVALID_SOURCE`. Setting it schedules a render. |
| `src` | `.source` | URL to fetch markup from. Disabled by default; see [Remote `src`](/safe-fragment/remote-src/). |
| `content` | none | Legacy, lowest-precedence source. Emits a `console.warn` when used. |
| `render-mode` | `.renderMode` | `"replace"` (default), `"once"` or `"manual"`. `clear()` and disabling reset `once`, so a later change renders again. |
| `scope` | `.scope` | `"light"` (default) or `"shadow"`. Switching scope removes the stale wrapper. Shadow DOM is a styling convenience, not a boundary: see [ADR 0003](/safe-fragment/decisions/#adr-0003-shadow-dom-is-not-a-security-boundary). |
| `id-policy` | `.idPolicy` | `"prefix"` (default) or `"keep-in-shadow"`. The latter keeps author ids and is honored only with `scope="shadow"`; otherwise the render rejects with `INVALID_OPTION`. See [Ids inside a shadow root](/safe-fragment/profiles/#ids-inside-a-shadow-root). |
| `loading` | `.loading` | `"eager"` (default) or `"lazy"`, which defers a `src` fetch until the element intersects the viewport. A changed `src` goes back through the gate; a reconnect re-arms it. |
| `disabled` | `.disabled` | Clears the content, cancels any in-flight render and suspends rendering. |
| `strict` | `.strict` | When present, more than one simultaneous markup source is an `AMBIGUOUS_SOURCE` rejection instead of silently picking by precedence. |
| `debug` | `.debug` | `console.warn`s the code and message of every `reject` event. |
| none | `.sourceKind` | Read-only: which source `render()` would use now (`html-property`, `template-child`, `src`, `content-attribute`, `none`, `ambiguous`). |

### Source precedence

Highest first: the `.html` property, then a `<template>` child, then `src`, then the legacy `content` attribute. Edits to a
`<template>` source child (its content, or the template being added, removed or replaced) are observed and re-render, subject
to `render-mode`. With `strict`, more than one present source rejects instead.

### Render modes

- `replace` (default): every source, profile or scope change schedules a re-render.
- `once`: renders once; `clear()` or disabling resets it so a later change renders again.
- `manual`: nothing renders until you call `render()`.

A profile, `src`, `content`, `scope` or `.html` change, or a `<template>` edit, invalidates a render already in flight in
**every** render mode, so a manual-mode `render()` cannot land content produced under a looser profile.

## Methods

- **`render(): Promise<RenderResult>`**: an explicit render. It works in `render-mode="manual"` and supersedes a queued
  automatic render. It **never rejects**; it resolves with the [result described below](#the-render-result).
- **`refresh(): Promise<RenderResult>`**: an alias of `render()`, kept because it reads better where you re-fetch a `src`.
  Identical behavior, including in `render-mode="once"`.
- **`clear(): void`**: empties the rendered root, cancels any in-flight render (nothing already started can land afterwards)
  and resets `once` mode.
- **`getRenderedRoot(): Element | null`**: the wrapper element holding the rendered content: a dedicated child (marked with a
  `data-safe-fragment-root` attribute), not the host itself and not the shadow root. `null` before the first render.

## The render result

`render()` resolves with `{ status, error?, report? }`:

| `status` | Meaning |
| --- | --- |
| `rendered` | The sanitized content is in the DOM; `report` is the `SanitizationReport`. |
| `rejected` | Nothing was rendered; `error` is a `SafeFragmentError` and a `safe-fragment:reject` event fired. **Previously rendered content is cleared**, so content never stays on screen under a profile or source the element no longer claims. The exception: when a `before-render` listener vetoed the render (`RENDER_ABORTED`), existing content is left alone. |
| `superseded` | A newer render, `clear()`, disabling or a disconnect overtook it. `error` is `FETCH_SUPERSEDED` or `FETCH_ABORTED` when a fetch was cut short. No event fires. |
| `disabled` | The element is disabled: `error.code === "DISABLED"`, also dispatched as `reject`. |

A `SanitizationReport` lists `removedElements`, `removedAttributes` and `rewrittenUrls` (each a note with `tag`, optional
`attribute`, a stable `reason` and a truncated `snippet`), plus `profile`, `engine` (`"native"` or `"dompurify"`),
`durationMs`, `inputLength`, an **approximate** `outputLength`, and `truncated`. It never includes the full original or
sanitized markup. See [API: element](/safe-fragment/api/element/) for the types.

## Events

All events bubble and are namespaced `safe-fragment:*`.

| Event | Cancelable | Detail |
| --- | --- | --- |
| `safe-fragment:before-render` | Yes | `{ profile, sourceKind }`. `preventDefault()` vetoes the render. |
| `safe-fragment:render` | No | `{ report: SanitizationReport, root: Node }` |
| `safe-fragment:reject` | No | `{ code, message, details? }`; see [Error codes](/safe-fragment/api/errors/). |
| `safe-fragment:clear` | No | `{ reason: "clear" \| "disabled" \| "rejected" }`: rendered content was removed. |
| `safe-fragment:disabled` | No | none: the element was just disabled. |
| `safe-fragment:action` | No | `{ action, element, originalEvent }`: `data-action` delegation (any profile that allows it, i.e. `ui-v1`). Works under `scope="shadow"` via `composedPath()`. |
| `safe-fragment:link` | No | `{ href, target, element, originalEvent }`: fires before a rendered `<a>` navigates. Call `preventDefault()` on `originalEvent` to intercept (for example SPA routing). |

`before-render` fires once a render actually starts with a valid source and profile; it never fires for `NO_SOURCE`,
`INVALID_SOURCE`, `UNKNOWN_PROFILE` and the like. `FETCH_ABORTED` and `FETCH_SUPERSEDED` are reported through `render()`'s
result only, never as events: an abort you caused is not a failure.

## Lifecycle

- Moving an element within the DOM (or re-attaching it) does not re-render or refetch when its source, profile and scope are
  unchanged.
- An element moved to another document (a pop-out window) re-arms its observers against the new window.
- `src` fetches and `IntersectionObserver`s are torn down on disconnect and when the element's own window fires `pagehide`
  (removing an `<iframe>` does not run `disconnectedCallback` for what is inside it).
- `loading="lazy"` falls back to eager rendering when `IntersectionObserver` is missing, rather than never rendering.

## TypeScript

The package ships types for the element: the `SafeFragmentElement` interface, a `SafeFragmentEventMap` so
`el.addEventListener("safe-fragment:render", (e) => e.detail.report)` is typed, and an `HTMLElementTagNameMap` augmentation, so
`document.createElement("safe-fragment")` returns a `SafeFragmentElement`. The class itself is exported as
`createSafeFragmentElementClass(HTMLElement, deps)` and `getSafeFragmentElementClass()`.
