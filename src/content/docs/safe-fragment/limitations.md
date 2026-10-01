---
title: "Limitations and traps"
description: "Known gaps and traps in safe-fragment, traps first, each linked to its issue (#1 to #8), plus what is solid and what is not a goal."
sidebar:
  order: 9
---

Traps first: the gaps and surprises a reader cannot recover from the API alone. Each known gap has an issue. The package is
**unpublished and pending independent review**, so read this page before relying on it. The positive guarantees are on
[Security model](/safe-fragment/security/).

## Known gaps

Each has an issue in [johnhenry/safe-fragment](https://github.com/johnhenry/safe-fragment/issues).

- **No independent security review yet** ([safe-fragment#1](https://github.com/johnhenry/safe-fragment/issues/1)). Do not release
  or rely on this for hostile content before it.
- **`email-v1` is a scaffold**: `cid:`, Outlook VML and MSO conditional comments are unhandled, and it has no email-specific
  corpus ([safe-fragment#2](https://github.com/johnhenry/safe-fragment/issues/2)).
- **No SVG/MathML in any profile** ([safe-fragment#3](https://github.com/johnhenry/safe-fragment/issues/3)). They are dropped with
  their whole subtree.
- **The native Sanitizer API spec is still moving**; only Chromium (and, per CI, Firefox) ship `setHTML`, and Safari takes the
  DOMPurify path ([safe-fragment#4](https://github.com/johnhenry/safe-fragment/issues/4)).
- **DOMPurify's cost is quadratic in removed nodes**: `maxInputLength` bounds it, it does not remove it
  ([safe-fragment#5](https://github.com/johnhenry/safe-fragment/issues/5)). Lower it if you render attacker-sized content in
  Safari.
- **`article-v1`/`ui-v1` keep relative `img src`**, a credentialed same-origin GET the moment the content renders; opt in to
  `blockRelativeAutoLoadUrls` ([safe-fragment#6](https://github.com/johnhenry/safe-fragment/issues/6)).
- **`ui-v1` allows `class`**, which can match host selectors
  ([safe-fragment#7](https://github.com/johnhenry/safe-fragment/issues/7)).
- **The native path's report cannot count the engine's own baseline removals under Trusted Types**
  ([safe-fragment#8](https://github.com/johnhenry/safe-fragment/issues/8)); on DOMPurify it is complete.

## Traps

### Rendering

- **There is no default profile.** A missing or unknown `profile` rejects with `UNKNOWN_PROFILE`; nothing renders.
- **A rejected render clears what was on screen.** Content never stays under a profile or source the element no longer claims.
  The one exception is a `before-render` veto (`RENDER_ABORTED`), which leaves existing content alone.
- **`render()` never rejects.** Check `result.status`, not a `catch`. `superseded` is not a failure, and emits no event.
- **A disallowed element's text survives; a dangerous container's content never does.** `<marquee>b</marquee>` becomes `b`, but
  the contents of `<script>`, `<style>`, `<template>`, `<textarea>` and the like are dropped with the element
  ([ADR 0004](/safe-fragment/decisions/#adr-0004-one-behavior-for-disallowed-elements)).
- **Unregistered custom elements are unwrapped, not kept.** Allow them by deriving a profile, and register your element
  definitions yourself.
- **Ids are rewritten.** Every surviving `id` is prefixed `user-content-`, so `document.getElementById("x")` will not find
  content authored as `id="x"`.
- **`<button>` is always `type="button"`, `data-*` is an allowlist.** `data-action` is the only one `ui-v1` allows.
- **`scope="shadow"` is not isolation** ([ADR 0003](/safe-fragment/decisions/#adr-0003-shadow-dom-is-not-a-security-boundary)).
- **The legacy `content` attribute** is the lowest-precedence source and logs a `console.warn`.
- **`outputLength` in the report is approximate.**

### Sanitizer loading

- **No bundler, no import map: Safari renders nothing.** The fallback's `import("dompurify")` is a bare specifier. Without a
  mapping the render rejects with `SANITIZER_UNAVAILABLE`. See the
  [import map](/safe-fragment/getting-started/#no-bundler-the-import-map), and pin the exact `dompurify` version the release
  pins.
- **`sanitizeToFragmentSync` throws `SANITIZER_NOT_READY`** where no engine is ready synchronously. It fails closed. Call
  `await preloadSanitizer()` first.
- **On raw-file CDNs, list `dompurify` explicitly** when generating an import map with mport.

### Profiles

- **Built-in profiles cannot be modified or replaced.** `registerProfile` on a built-in or already-registered name throws
  `INVALID_PROFILE`; derive a new name.
- **A `-v<N>` name suffix must match `version`.** Changing the suffix when deriving without setting `version` fails with
  `PROFILE_MISMATCH`.
- **A profile can only narrow or extend within the validated envelope.** No dangerous elements, `on*`/`style`, or dangerous
  schemes can be registered, and there is no wildcard `data-*`.
- **`deriveProfile` replaces `customElements`** rather than merging them.

### Remote `src`

- **`src` is disabled by default.** Without the fetch capability enabled it rejects with `FETCH_DISABLED`.
- **Redirects are refused by default**, and with `followRedirects` the final origin is re-checked.
- **`FETCH_ABORTED` and `FETCH_SUPERSEDED` are only on the `render()` result**, never events: an abort you caused is not a
  failure.

### Packaging

- **Loading both the ESM and CJS builds is supported.** The profile registry, DOMPurify loader and instance cache live on a
  `Symbol.for` key on `globalThis` and are shared by both builds, so a profile registered through one is visible to the other,
  and `instanceof SafeFragmentError` works across them. Do not add other module-level mutable state if you fork.
- **`loading="lazy"` falls back to eager rendering** when `IntersectionObserver` is missing, rather than never rendering.

## What is solid

Implemented and covered by the Vitest Browser Mode suite (real Chromium, WebKit and Firefox; the Firefox run is CI-only), including
the adversarial XSS corpus and a benign-content corpus compared across both sanitization engines:

- The sanitizer pipeline (both engines, `enforceProfile`, rebuild), the report, and the public `sanitizeToFragment` API.
- `plain-text-v1`, `article-v1`, `ui-v1`; custom profiles via `registerProfile`.
- `<safe-fragment>`'s lifecycle, `render()` results, events, shadow and light scope, `loading="lazy"`.
- The `src` fetch capability model.
- `<example-sandbox>`, including a direct isolation-proof test and Trusted Types support.

"Solid" means tested by the project's own suite, not independently reviewed
([safe-fragment#1](https://github.com/johnhenry/safe-fragment/issues/1)).

## Not goals

- A trusted or unsafe fast path. Assign trusted markup yourself with the platform's own APIs, in your own code.
- Detecting phishing links and other content-level abuse.
- Isolating or sandboxing what your own custom elements do.
- Running or vetting executable code; that is `<example-sandbox>`, for trusted samples only.
