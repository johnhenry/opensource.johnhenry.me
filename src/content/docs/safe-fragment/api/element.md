---
title: "Element API"
description: "Reference for registerSafeFragment, getSafeFragmentElementClass, createSafeFragmentElementClass, registerExampleSandbox, the SafeFragmentElement interface, event and report types, and FetchCapability."
sidebar:
  order: 101
---

For behavior and examples see [The `<safe-fragment>` element](/safe-fragment/element/).

## `registerSafeFragment(options?)`

Registers the `<safe-fragment>` custom element. It must be called explicitly from browser-executed code; importing the package
never does it. **Idempotent** for a tag name: if the tag is already defined it returns without doing anything. Throws
`UNSUPPORTED_ENVIRONMENT` if there is no DOM.

`RegisterSafeFragmentOptions`:

| Option | Default | Meaning |
| --- | --- | --- |
| `tagName` | `"safe-fragment"` | Custom element tag name. Override only for naming collisions or testing. |
| `fetch` | disabled | `Partial<FetchCapability>`: the [`src` remote-fetch capability](/safe-fragment/remote-src/). |
| `loadDOMPurify` | none | A `DOMPurifyLoader` supplying the fallback engine's factory, for pages with no bundler or import map. Also becomes the app-wide loader. |
| `maxInputLength` | `1000000` | Longest markup string accepted per render, in UTF-16 code units; longer sources reject with `SOURCE_TOO_LARGE`. |
| `document` | ambient | Explicit `Document` override, mainly for tests that build their own realm. |
| `customElementRegistry` | ambient | Explicit `CustomElementRegistry` override. |
| `htmlElementBase` | ambient | Explicit `HTMLElement` base class override. |

## `getSafeFragmentElementClass(htmlElementBase?)`

Returns the `<safe-fragment>` element class for the ambient (or given) realm, built with **default** options and cached per
`HTMLElement` base. Use it to subclass, to `customElements.define` the element yourself, or to `instanceof`-check one.
`registerSafeFragment()` builds its own class with your `fetch` and `maxInputLength` options and is the usual route. Throws
`UNSUPPORTED_ENVIRONMENT` without an `HTMLElement` base.

## `createSafeFragmentElementClass(HTMLElementBase, deps)`

The factory behind both. Takes the `HTMLElement` base class as a parameter instead of a top-level `class ... extends HTMLElement`,
so the module never dereferences `HTMLElement` at evaluation time (which would throw in Node or SSR). `deps` is a
`SafeFragmentElementDeps`: `{ fetchCapability: FetchCapability, maxInputLength?: number }`. Returns a constructor with the
`observedAttributes` `profile`, `src`, `render-mode`, `scope`, `id-policy`, `content`, `disabled`, `strict`, `loading`.

## `registerExampleSandbox(options?)`

Registers `<example-sandbox>`, independently of `registerSafeFragment()`. Idempotent, and throws `UNSUPPORTED_ENVIRONMENT` without
a DOM. See [`<example-sandbox>`](/safe-fragment/example-sandbox/).

`RegisterExampleSandboxOptions`: `tagName` (default `"example-sandbox"`), `trustedTypesPolicyName` (default
`"safe-fragment-sandbox"`), and the `document`, `customElementRegistry` and `htmlElementBase` overrides.

## `FetchCapability`

The shape of `registerSafeFragment({ fetch })`, with `DEFAULT_FETCH_CAPABILITY` as the frozen default.

| Field | Type | `DEFAULT_FETCH_CAPABILITY` |
| --- | --- | --- |
| `enabled` | `boolean` | `false` |
| `allowedOrigins` | `readonly string[]` | `[]` |
| `maxBytes` | `number` | `250000` |
| `timeoutMs` | `number` | `8000` |
| `followRedirects` | `boolean` | `false` |

## Types

### `SafeFragmentElement`

Extends `HTMLElement`.

| Member | Type |
| --- | --- |
| `html` | `string \| null` |
| `source` | `string \| null` (reflects `src`) |
| `profile` | `string` |
| `renderMode` | `RenderMode` |
| `scope` | `RenderScope` |
| `idPolicy` | `IdPolicy` (reflects `id-policy`: `"prefix"` or `"keep-in-shadow"`; the latter needs `scope="shadow"`, else the render rejects with `INVALID_OPTION`) |
| `loading` | `"eager" \| "lazy"` |
| `disabled`, `debug`, `strict` | `boolean` |
| `sourceKind` | read-only `SourceKind \| "none" \| "ambiguous"` |
| `render()`, `refresh()` | `Promise<RenderResult>` |
| `clear()` | `void` |
| `getRenderedRoot()` | `Element \| null` |

Typed `addEventListener` and `removeEventListener` overloads use `SafeFragmentEventMap`. The package also augments
`HTMLElementTagNameMap` so `"safe-fragment"` maps to `SafeFragmentElement`.

### `SafeFragmentEventMap`

| Event | Detail type |
| --- | --- |
| `safe-fragment:before-render` | `BeforeRenderDetail` |
| `safe-fragment:render` | `RenderDetail` |
| `safe-fragment:reject` | `RejectDetail` |
| `safe-fragment:action` | `ActionDetail` |
| `safe-fragment:link` | `LinkDetail` |
| `safe-fragment:clear` | `ClearDetail` |
| `safe-fragment:disabled` | `null` |

### Scalar types

- `RenderMode`: `"replace" | "once" | "manual"`.
- `RenderScope`: `"light" | "shadow"`.
- `IdPolicy`: `"prefix" | "keep-in-shadow"`.
- `SanitizerEngineKind`: `"native" | "dompurify"`.
- `SourceKind`: `"html-property" | "template-child" | "src" | "content-attribute"`.

### Result and detail types

- **`RenderResult`**: `{ status: "rendered" | "rejected" | "superseded" | "disabled"; error?: SafeFragmentError; report?: SanitizationReport }`.
  `error` is set for `rejected`, `disabled`, and for a `superseded` render whose fetch was cut short; `report` is set when `rendered`.
- **`SanitizationReport`**: `{ profile, engine, removedElements, removedAttributes, rewrittenUrls, durationMs, inputLength, outputLength, truncated }`.
  `outputLength` is an approximation; `truncated` is true if the input was truncated before sanitization (for example a `src`
  size cap). It never carries the full raw or sanitized markup.
- **`SanitizationNote`**: `{ tag: string; attribute?: string; reason: string; snippet?: string }`. `snippet` is a short, truncated
  excerpt of the offending value.
- **`BeforeRenderDetail`**: `{ profile: string; sourceKind: SourceKind }`.
- **`RenderDetail`**: `{ report: SanitizationReport; root: Node }`.
- **`RejectDetail`**: `{ code: SafeFragmentErrorCode; message: string; details?: Record<string, unknown> }`.
- **`ActionDetail`**: `{ action: string; element: Element; originalEvent: Event }`.
- **`LinkDetail`**: `{ href: string; target: string | null; element: HTMLAnchorElement; originalEvent: MouseEvent }`.
- **`ClearDetail`**: `{ reason: "clear" | "disabled" | "rejected" }`.
