---
title: "Decisions"
description: "The four architecture decision records behind safe-fragment: HTML as data, the native-plus-DOMPurify engines, Shadow DOM is not a boundary, and unwrap-or-drop for disallowed elements."
sidebar:
  order: 10
---

The four accepted ADRs, condensed. The full text is in
[`docs/adr/`](https://github.com/johnhenry/safe-fragment/tree/main/docs/adr) in the repository.

## ADR 0001: HTML is data, never code

**Status:** Accepted.

The most common way HTML-rendering libraries introduce XSS is treating an untrusted string as trusted markup at the moment it
touches the DOM (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `setHTMLUnsafe`). "Sanitize first, then assign" is the pattern
behind a long history of sanitizer-bypass CVEs, because the two steps can be forgotten, reordered or applied inconsistently.

**Decision.** Every input string is data to be parsed and filtered through an explicit allowlist:

- The unsafe sinks are **never called on untrusted input**, anywhere in the codebase. The sanitization pipeline is the only path
  from a string to DOM nodes.
- Parsing and sanitization always happen together, producing an inert, detached `DocumentFragment` that has been through the
  profile's allowlist before anything is inserted into a live document.
- Markup becomes visible DOM only through `<safe-fragment>`'s `render()` pipeline (or `sanitizeToFragment`).
- There is deliberately **no** "trusted", "unsafe" or "allowScripts" escape hatch in the public API. An application that needs a
  fully trusted fast path should assign that markup itself with the platform's APIs: an application-level decision with
  application-level trust boundaries.

**Consequences.** Every profile is a closed allowlist; anything not listed is removed. `plain-text-v1` never invokes an HTML
parser at all. `<example-sandbox>` is a deliberately separate component because it does the opposite on purpose: it runs real,
application-authored code in an isolated iframe, and must never be confused with `<safe-fragment>`.

## ADR 0002: Native sanitizer with a DOMPurify fallback, plus a shared allowlist pass

**Status:** Accepted. See ADR 0004 for the later decision on what happens to a disallowed element's content.

Neither engine is perfect alone: the native HTML Sanitizer API's coverage depends on the browser; DOMPurify is a third-party
dependency with its own bug surface and a fairly permissive default allowlist.

**Decision.**

- **Feature-detect** the native API at render time, never at module load, and prefer it when available.
- **Fall back to DOMPurify**, imported dynamically so importing the package in Node or SSR never triggers DOMPurify's module init.
- **Never use DOMPurify's defaults.** `ALLOWED_TAGS` and `ALLOWED_ATTR` are always passed explicitly, derived from the profile.
- **Neither engine's allowlist is the final word.** After either engine runs, `enforceProfile()` re-derives the exact allowed
  element, attribute and URL-scheme set from the profile, with real DOM APIs and **no regex against HTML or attribute strings**.
  This is the actual security boundary; the engines are a first pass.
- URL-scheme filtering uses the platform `URL` parser, not `ALLOWED_URI_REGEXP` or any regex.

**A real bug this design caught.** `KEEP_CONTENT: false` in DOMPurify also controls whether `#text` is implicitly allowed. With an
explicit `ALLOWED_TAGS` list it silently stripped every text node, producing `<p></p>` instead of `<p>hello</p>`. The cross-engine
equivalence test caught it before it shipped. `KEEP_CONTENT: true` is used now, and `enforceProfile` decides which *elements*
survive. It is the concrete argument for the two-layer design.

**Consequences.** `dompurify` is a real, declared, exact-pinned dependency. Sanitization is inherently async when the DOMPurify
path is taken, so the public async function is `Promise`-based for both engines. Cross-engine drift is a real, ongoing risk; the
shared pass and the equivalence test are mitigations, guaranteeing the same *security-relevant* outcome rather than byte-identical
output for every input.

## ADR 0003: Shadow DOM is not a security boundary

**Status:** Accepted.

`<safe-fragment scope="shadow">` renders into an open `ShadowRoot`. It is easy to read "shadow" as isolation like
`<iframe sandbox>`. It is not.

**Decision.** Shadow DOM is used **only** for style and markup encapsulation convenience, never as a security mechanism:

- **Script execution is identical either way.** Same privileges, same JavaScript realm, same `document`, `window`, cookies and
  storage. An open shadow root creates no new origin, realm or execution context.
- **Open shadow roots are trivially introspectable.** `element.shadowRoot` gives any script on the page full read and write
  access. The package offers no `closed` mode, precisely to avoid the false impression that it would help.
- **Event composition crosses the boundary.** Composed events like `click` bubble out into the light DOM, which is how
  `data-action` and link delegation work identically regardless of `scope`.
- The actual boundary is the **sanitization pipeline**, which runs before anything is inserted into light DOM or a shadow root.
  `scope` only changes where already-sanitized content is mounted.
- The one real isolation primitive in the codebase is `<example-sandbox>`'s `allow-same-origin`-less iframe.

**Consequences.** `scope="shadow"` is documented with an explicit "not a security boundary" callout. No future change should add
a `mode: "closed"` option on the theory that it adds safety, and any future feature that needs isolation must use a real primitive
(sandboxed iframe, Worker, separate origin), never shadow DOM.

## ADR 0004: One behavior for disallowed elements

**Status:** Accepted. Refines ADR 0002.

An element not in the active profile has to go, but what happened to its *content* differed between engines: native dropped the
whole subtree, DOMPurify with `KEEP_CONTENT: true` unwrapped it (except its own forbidden-contents set), and `enforceProfile`
dropped the subtree. So `<p>a <marquee>b <em>c</em></marquee></p>` rendered `a b c` on one engine and `a ` on the other, and the old
equivalence test compared a single hand-picked string, so nobody noticed. A security boundary whose output depends on the browser
cannot be reviewed once.

**Decision.** Both engines and `enforceProfile` implement one rule:

1. **Dangerous or raw-text containers drop their whole subtree**: `script`, `style`, `template`, `noscript`, `iframe`, `noembed`,
   `noframes`, `xmp`, `textarea`, `title`, `select`, `object`, `embed`, `svg`, `math`, plus `plaintext`, `applet`, `frame`,
   `frameset`, `head`. Their content is either not markup (where unwrapping would promote attacker-chosen source text into the
   document), lives in a different parsing mode, or is an embedding surface. Any element outside the HTML namespace is dropped
   with its subtree whatever its tag name.
2. **Every other non-allowed element is unwrapped**: the element goes, its text and (separately enforced) allowed descendants stay.
   This covers unknown elements, presentational ones (`marquee`, `font`, `center`), table cells in profiles without tables, and
   unregistered custom elements.

Both engines parse in a `<div>` of an inert document, body context, no loads. For DOMPurify that means `KEEP_CONTENT: true`,
`FORBID_CONTENTS` *replaced* by the list above, `FORCE_BODY: true`, and a hook that drops `is=` instead of force-removing the
element. For native, `removeElements` is set to the drop list and unlisted elements are left for `enforceProfile` to unwrap, because
the native default cannot express "unwrap unknown elements". After enforcement the fragment is rebuilt from fresh elements, so a
customized built-in's hidden `is` value cannot reach the document. The native config must use the current spec key names
(`removeElements`, `attributes`, `comments`, `dataAttributes`); the pre-2024 names are silently ignored by Chromium.

**Consequences.** `engine-equivalence` runs the whole XSS and benign corpora through both engines and compares a normalized DOM;
where a browser has no native engine (WebKit today) it is skipped with the reason in the test title. The reported reasons are
`element-unwrapped:not-in-profile`, `element-unwrapped:custom-element-not-registered`, `element-dropped:dangerous-container` and
`element-dropped:foreign-namespace`. Unwrapping is the more author-friendly behavior and matches the DOMPurify default; the cost is
that a disallowed element's text now appears, but for dangerous containers (the only place hostile text could hide) it does not.
