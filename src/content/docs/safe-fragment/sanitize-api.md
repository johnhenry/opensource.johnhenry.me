---
title: "Sanitizing without the element"
description: "sanitizeToFragment, sanitizeToFragmentSync, preloadSanitizer and loadDOMPurify: the same pipeline as <safe-fragment>, as functions."
sidebar:
  order: 4
---

The pipeline behind `<safe-fragment>` is available as plain functions, for template systems and component runtimes that need a
sanitizer hook. Same pipeline, same guarantees, same `SanitizationReport`; the element is just one consumer of it.

```ts
import { sanitizeToFragment, sanitizeToFragmentSync, preloadSanitizer } from "@johnhenry/safe-fragment";

const { fragment, report } = await sanitizeToFragment(untrustedHtml, { profile: "article-v1" });
target.replaceChildren(fragment); // a detached, profile-conformant DocumentFragment

await preloadSanitizer(); // once, at startup
const sync = sanitizeToFragmentSync(untrustedHtml, { profile: "article-v1" });
```

The result's `fragment` is detached and fully profile-conformant: insert it with `append` or `replaceChildren`. It is never touched
by an unsafe sink.

## `sanitizeToFragment(html, options)`

Returns `Promise<{ fragment, report }>`. Throws a `SafeFragmentError` on failure; it never returns a partially sanitized result.

Options (`SanitizeToFragmentOptions`):

| Option | Meaning |
| --- | --- |
| `profile` | **Required.** Name of a registered profile. There is no default. A missing or empty value throws `INVALID_PROFILE`; an unregistered one throws `UNKNOWN_PROFILE`. |
| `document` | The document whose realm should be used (for example a pop-out's). Defaults to the ambient `document`; without any DOM it throws `UNSUPPORTED_ENVIRONMENT`. |
| `maxInputLength` | Largest accepted input in UTF-16 code units (default 1,000,000). Longer input throws `SOURCE_TOO_LARGE`. |
| `baseUrl` | Base URL that protocol-relative URLs inherit their scheme from. Defaults to `document.baseURI`. |
| `loadDOMPurify` | DOMPurify loader for this call; see [`loadDOMPurify`](#loaddompurify) below. |

The report lists what both the engine and `enforceProfile` removed (`removedElements`, `removedAttributes`, `rewrittenUrls`);
`outputLength` is an approximation.

## `sanitizeToFragmentSync(html, options)`

The synchronous variant. It works **only when no loading is needed**: the native Sanitizer API exists, or DOMPurify was already
prepared (`await preloadSanitizer()`, or an earlier async call). Otherwise it throws `SANITIZER_NOT_READY`. It fails closed: it
never degrades to an unsanitized or lesser path. It takes the same options except that `loadDOMPurify` is ignored, because a
synchronous call cannot load anything.

**Trap:** on Safari (no `setHTML`) the sync variant throws `SANITIZER_NOT_READY` until DOMPurify is ready. Call
`await preloadSanitizer()` at startup.

## `preloadSanitizer(options?)`

Prepares the sanitizer so the synchronous API works and the first render does not pay the DOMPurify load. Resolves with the
engine that will be used, `"native"` or `"dompurify"`. It rejects with `SANITIZER_UNAVAILABLE` (whose message says how to fix it)
if DOMPurify is needed but cannot be loaded, and with `UNSUPPORTED_ENVIRONMENT` where there is no `document`.

| Option | Meaning |
| --- | --- |
| `document` | The document whose window the sanitizer is prepared for. Defaults to the ambient `document`. |
| `loadDOMPurify` | Supplies DOMPurify for pages with no bundler or import map. Also becomes the app-wide loader. |
| `engine` | `"auto"` (default) does nothing when the native Sanitizer API exists. `"dompurify"` loads and instantiates DOMPurify regardless, so the sync API works even if you force the fallback. |

One DOMPurify instance is created per window and reused, so a Trusted Types `dompurify` policy is registered once; see
[Trusted Types and CSP](/safe-fragment/trusted-types-and-csp/).

## `loadDOMPurify`

`loadDOMPurify` is an option, not a function export. It is accepted by `registerSafeFragment`, `preloadSanitizer` and
`sanitizeToFragment`, and supplies the DOMPurify factory for pages with no bundler and no import map:

```ts
import { registerSafeFragment } from "@johnhenry/safe-fragment";

registerSafeFragment({
  loadDOMPurify: () => import("https://cdn.jsdelivr.net/npm/dompurify@3.4.16/dist/purify.es.mjs").then((m) => m.default),
});
```

It has the type `DOMPurifyLoader`: `() => Promise<DOMPurifyFactory>`, where a `DOMPurifyFactory` is `createDOMPurify`, the callable
default export of the `dompurify` module (`(window) => instance`). Without it, the bare specifier `dompurify` must resolve through
a bundler or an import map; if it does not, you get `SANITIZER_UNAVAILABLE`. Use the exact `dompurify` version the release
pins: profile output stability depends on it ([Getting started](/safe-fragment/getting-started/#no-bundler-the-import-map)).

Passing `loadDOMPurify` to `registerSafeFragment` or `preloadSanitizer` also sets it as the app-wide loader.

## Engines

`mode: "text"` profiles (`plain-text-v1`) skip the pipeline entirely: the string becomes a single `Text` node and no HTML parser
is invoked. `mode: "html"` profiles use the native Sanitizer API (`Element.prototype.setHTML`) when it exists and otherwise a
locked-down DOMPurify, then the shared `enforceProfile()` pass runs identically after either. See the
[Security model](/safe-fragment/security/) and [ADR 0002](/safe-fragment/decisions/#adr-0002-native-sanitizer-with-a-dompurify-fallback-plus-a-shared-allowlist-pass).
