---
title: "Trusted Types and CSP"
description: "Running safe-fragment under require-trusted-types-for 'script': the dompurify policy, the example-sandbox policy, and what the native path does."
sidebar:
  order: 6
---

`<safe-fragment>` works under a CSP with `require-trusted-types-for 'script'`.

## `<safe-fragment>`

- **The native path** uses `setHTML`, which is not gated by Trusted Types, so it needs no policy.
- **The DOMPurify path** registers one `dompurify` policy per window. Add `dompurify` to your `trusted-types` list.
  `'allow-duplicates'` is **not** needed, because exactly one DOMPurify instance is created per window and reused.

```http
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types dompurify
```

The one-instance-per-window rule is a fix, not a nicety: re-creating DOMPurify on every render used to re-register the policy,
so `trusted-types dompurify` without `'allow-duplicates'` broke every render after the first. If you call `preloadSanitizer()`
or pass `loadDOMPurify`, you are still using that single shared instance.

**Trap:** the native path's `SanitizationReport` cannot count the engine's own baseline removals under Trusted Types
([safe-fragment#8](https://github.com/johnhenry/safe-fragment/issues/8)). Treat the report's counts as a lower bound there. On the DOMPurify path the report is complete.

## `<example-sandbox>`

`<example-sandbox>` is a different component with its own policy name, `safe-fragment-sandbox`, configurable with
`registerExampleSandbox({ trustedTypesPolicyName })`. Add the name to `trusted-types`:

```http
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types dompurify safe-fragment-sandbox
```

The component creates that policy only to set the sandbox document and compile the code sample, both application-authored. If
the name is not allowed, you get an `example-sandbox:error` event and no iframe. See [`<example-sandbox>`](/safe-fragment/example-sandbox/).

## Other CSP notes

- Loading `dompurify` from a CDN through the [import map](/safe-fragment/getting-started/#no-bundler-the-import-map) is an ordinary
  module load, so your `script-src` has to allow that origin. A bundler avoids this.
- The [`src` fetch](/safe-fragment/remote-src/) is an ordinary page `fetch()`, so a `connect-src` directive applies to it as it
  would to any other request; `allowedOrigins` is safe-fragment's own allowlist on top of that, not a replacement for it.
- safe-fragment's guarantees do not depend on a CSP being present. Trusted Types and CSP are defense in depth around the
  sanitizer, which is the actual boundary ([Security model](/safe-fragment/security/)).
