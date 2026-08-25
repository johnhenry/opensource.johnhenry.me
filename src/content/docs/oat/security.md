---
title: Security model
description: What's actually verified, the M6 unsafe-HTML break-glass path, trust-on-first-use, and the Trusted Types policy.
---

The receiver never delivers unverified bytes to the host application. Every artifact carries a digest, checked unconditionally, plus an optional Ed25519 signature.

## Four outcomes, always

A sender may *propose* a UI, but the receiver always owns rendering. There are exactly four outcomes:

- **reject** — verification failed, or the receiver's policy rejects it outright
- **downgrade** — falls back to a plain, unproposed rendering
- **accept-safe** — sanitized, receiver-rendered (the normal path)
- **accept-unsafe** — the M6 break-glass profile (below), reachable only under a specific, deliberately narrow set of conditions

## M6: the unsafe-HTML break-glass path

`checkSandboxEligibility()` requires **all** of the following, or it downgrades to the fallback view:

1. A verified signature
2. The signer's public key on the receiver's **explicit** `trustedPublicKeys` list — a valid signature alone only proves *some* key signed it, not that it's a key you trust
3. The receiver deployment has separately opted in via `allowUnsafeHtml`

If eligible, the content runs inside a `sandbox="allow-scripts"` iframe with **none** of `allow-same-origin`, `allow-forms`, `allow-popups`, `allow-downloads`, or `allow-top-navigation` — plus a typed, rate-limited `postMessage` bridge, a high-visibility opt-in prompt, and a persistent kill switch.

**Known limitation, and how it's handled:** the sandbox's tokens don't gate self-navigation — a real gap in the browser's iframe sandbox model, not this library's bug. The host detects it out-of-band (watching for a second `load` event after the initial `srcdoc` render, which shouldn't happen) and tears the frame down immediately rather than let an un-enforced-CSP frame keep running.

## Trust-on-first-use (TOFU)

Because a signature carries its signer's public key inline, there's no separate key-exchange handshake — but that also means *any* key can sign, so trust has to be established somewhere. With `requireExplicitTrust` set, a digest-valid, signature-valid artifact from a key not yet on `trustedPublicKeys` doesn't silently pass or silently fail — it surfaces as `oat-unknown-sender`, and your app resolves it explicitly:

```ts
receiver.addEventListener('oat-unknown-sender', (e) => {
  // show e.detail's key fingerprint to the user, e.g. via
  // @johnhenry/oat-ui's renderTrustPrompt()
});
// then one of:
receiver.trustSenderAndContinue();
receiver.rejectUnknownSender();
```

`@johnhenry/oat-ui` ships `renderTrustPrompt()` for exactly this — a "confirm public key: …" fingerprint prompt.

## Capabilities aren't authority

Effective capabilities are always `sender requested ∩ receiver policy ∩ user-approved grants`. A capability grant is a typed, receiver-mediated request the receiver's own app code chooses to act on — never remote code, never a DOM handle back to the sender. `checkCapability()` is meant to be re-checked at the point of use (e.g. right before building a downloadable `.ics` file), not trusted from the original grant payload.

## Side-effecting bootstrap functions enforce their own signature check

`extractReleaseManifest`, `extractWebrtcBootstrapPayload`, and the `createAnswerArtifact`/`applyAnswerArtifact` pair (in `@johnhenry/oat-bootstrap`) trigger real side effects — an HTTP fetch, applying live WebRTC session data — so they refuse to run on anything without an affirmatively verified signature themselves, rather than trusting every caller to check first. Release-manifest URLs are additionally restricted to `https:` by default (`allowedUrlSchemes`) as an SSRF guard, mirroring the same allowlist approach `@johnhenry/oat-ui`'s sanitizer uses.

## Trusted Types

Hosts running `Content-Security-Policy: require-trusted-types-for 'script'` need to add `trusted-types oat-sandbox-srcdoc` (or `trusted-types *`) to their policy, or the M6 iframe's `srcdoc` assignment breaks under that CSP. The policy is defined in `@johnhenry/oat-ui`'s `trusted-types.ts` — this isn't optional configuration, it's required for M6 to function at all under a strict Trusted Types policy.
