---
title: "Trusted Types and CSP"
description: "Running safe-fragment under require-trusted-types-for 'script': the dompurify policy, the example-sandbox policy, and what the native path does."
sidebar:
  order: 6
---

`<safe-fragment>` works under a CSP with `require-trusted-types-for 'script'`.

## `<safe-fragment>`

- **The native path** uses `setHTML`, which is not gated by Trusted Types, so it needs no policy. No sink that Trusted Types gates is
  ever called with a string, so sanitizing produces **zero** violations and CSP reports in every engine, including for the
  `SanitizationReport` (tested with a `securitypolicyviolation` listener; [safe-fragment#12](https://github.com/johnhenry/safe-fragment/issues/12), [ADR 0007](/safe-fragment/decisions/#adr-0007-no-trusted-types-gated-sink-is-ever-touched-even-for-the-report)).
- **The DOMPurify path** registers one `dompurify` policy per window. Add `dompurify` to your `trusted-types` list.
  `'allow-duplicates'` is **not** needed, because exactly one DOMPurify instance is created per window and reused.

```http
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types dompurify
```

The one-instance-per-window rule is a fix, not a nicety: re-creating DOMPurify on every render used to re-register the policy,
so `trusted-types dompurify` without `'allow-duplicates'` broke every render after the first. If you call `preloadSanitizer()`
or pass `loadDOMPurify`, you are still using that single shared instance.

**Trade-off:** to keep that promise, the native path's `SanitizationReport` does not count what the engine strips unconditionally
(`<script>`, `<iframe>`, `on*` handlers, `javascript:` URLs; [safe-fragment#8](https://github.com/johnhenry/safe-fragment/issues/8),
[ADR 0007](/safe-fragment/decisions/#adr-0007-no-trusted-types-gated-sink-is-ever-touched-even-for-the-report)). It lists everything the *profile* removed. Treat the report as a lower bound on the native path; on the DOMPurify path it also
includes those baseline removals. The security outcome is the same either way, because `enforceProfile` removes anything either engine misses.

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
