---
title: "Decisions"
description: "The seven architecture decision records behind safe-fragment: HTML as data, the native-plus-DOMPurify engines, Shadow DOM is not a boundary, unwrap-or-drop for disallowed elements, component templates and idPolicy, why style is a non-goal, and no Trusted Types gated sink."
sidebar:
  order: 10
---

The seven accepted ADRs, condensed. The full text is in
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

## ADR 0005: Component templates: a composition profile, and ids kept only inside a shadow root

**Status:** Accepted. Resolves the `<slot>`/`part` and `id` items of [safe-fragment#11](https://github.com/johnhenry/safe-fragment/issues/11).

A web component's template is markup the component clones into its own shadow root. Sanitizing it needed three things the
built-ins did not offer: `<slot>` and the `part`/`slot`/`exportparts` attributes (reachable only through an undocumented
hand-written derived profile); author ids left alone (every surviving `id` is rewritten to `user-content-<id>`, which closes DOM
clobbering but breaks a component whose own script or stylesheet uses `#id` or `form-control="#id"`, even though nothing inside a
shadow root is reachable through `window` or `document` named access); and `<style>` (ADR 0006).

**Decision.**

- **A built-in `component-template-v1`:** `ui-v1` plus `<slot name>` and `part`, `slot`, `exportparts` on every allowed element.
  Everything else (URL schemes, `data-action`, forced `type="button"`, no forms, SVG or `style`) is `ui-v1`'s by construction.
  Custom elements are not part of it: built-ins are immutable and the right prefix is the caller's decision, so the documented
  recipe is `deriveProfile("component-template-v1", { name, customElements: [...] })`. `slot` and `part` are not a bypass surface:
  they are inert token lists that accept no URL and run nothing; `part` is a styling hook the host stylesheet can target, the same
  class of exposure as `class`.
- **An opt-in `idPolicy: "keep-in-shadow"`,** judged safe with a hard precondition. Named access on `window` and `document` does not
  cross a shadow boundary. `<safe-fragment>` enforces the precondition: `id-policy="keep-in-shadow"` is honored only with
  `scope="shadow"`, and with `scope="light"` the render is **rejected** with `INVALID_OPTION`, never silently downgraded to
  prefixing. `sanitizeToFragment` cannot know where the caller inserts the fragment, so the option is explicit, its name carries
  the condition, an unknown value throws `INVALID_OPTION`, and the default stays `"prefix"`. Residual risk, documented: a kept id
  can collide with an id the component itself looks up, and it removes clobbering protection if the fragment is later inserted
  into light DOM. Everything else (attribute allowlist, URL checks, rebuild) still runs.
- **`name` is namespaced separately, always,** on elements that create named properties (`img`, `form`, `iframe`, `object`,
  `embed`, `a`, `area`, form controls). No built-in allows it, but a derived profile can. This replaces DOMPurify's
  `SANITIZE_DOM`, now off: it dropped any id or name value that collides with a `document` or form property (`<slot name="title">`,
  `<p id="title">`) on the DOMPurify engine only, so the same template rendered differently in Safari.
- **DOMPurify `ALLOW_UNKNOWN_PROTOCOLS: true`.** DOMPurify dropped any non-URL attribute whose value merely looked like `scheme:`
  (`exportparts="a:b"`, `data-action="cart:add"`) while the native engine kept it. `javascript:`, `vbscript:` and `data:` values are
  still refused, and every URL-valued attribute goes through `checkUrl` in `enforceProfile`, the actual scheme gate for both engines.

**Consequences.** Component templates are expressible without a bespoke profile, and the two engines agree on them. There is a new
error code, `INVALID_OPTION`. `http:` links are still dropped (`https:`, `mailto:` and relative only), and form controls are still
excluded.

## ADR 0006: `<style>` is a non-goal

**Status:** Accepted for 0.0.0. Reopen with an independent review ([safe-fragment#1](https://github.com/johnhenry/safe-fragment/issues/1))
in hand. Leaves the `<style>` item of [safe-fragment#11](https://github.com/johnhenry/safe-fragment/issues/11) open as a documented
non-goal.

A component template commonly carries its own `<style>`, and shadow DOM is what makes that safe to write. Today `<style>` is
dropped with its content, identically in both engines, and `registerProfile` refuses it. Supporting it means sanitizing CSS, and
HTML sanitizers are not CSS sanitizers. A CSSOM-based one (no regex is allowed in this project) would have to cover every
URL-bearing construct (`url()`, `image-set()`, `src()`, `@import`, `@font-face`, `cursor`, `mask`, `border-image`, `content`, and
whatever fetches next year) by property and function-name allowlist, indirection through custom properties and `var()`, attacks that
need no network (UI redress with `position: fixed` and `pointer-events`, `:host`/`::slotted`/`::part` reaching outside the
component, attribute-selector and `:has()` probing), and parser differentials across engines. That is a different, larger security
surface than the rest of the package, and shipping one that is "mostly right" before the first independent review is worse than
shipping none.

**Decision.** `<style>` is out of scope: no profile option, no `sanitizeStyle()`, no stylesheet string handling. It stays dropped,
`registerProfile` still refuses it, and the `style` attribute is still refused.

**What to do instead.** Keep component stylesheets **outside** the sanitized template, as trusted, application-authored CSS
(`shadowRoot.adoptedStyleSheets = [sheet]` with a constructed `CSSStyleSheet`, or a `<style>` the component creates itself), and
sanitize only the markup with `component-template-v1`. A stylesheet from a source less trusted than the component is a trust
decision this package does not make for you.

**Consequences.** Loaders such as html-modules keep treating `<html-export><style>` as unsanitized, exactly as trusted as the
module's script. Any revisit is a separate, opt-in, CSSOM-based design with its own adversarial corpus and an independent review,
not a flag on an existing profile.

## ADR 0007: No Trusted-Types-gated sink is ever touched, even for the report

**Status:** Accepted. Supersedes the `DOMParser` baseline of the native report described in
[safe-fragment#8](https://github.com/johnhenry/safe-fragment/issues/8); resolves
[safe-fragment#12](https://github.com/johnhenry/safe-fragment/issues/12).

The native Sanitizer API reports nothing about what it removed, so the native path's `SanitizationReport` was built by parsing the
input a second time with `DOMParser#parseFromString` and diffing the inventories against the engine's output. Under
`require-trusted-types-for 'script'`, `parseFromString` is a gated sink: a string passed to it is a blocked action, a
`securitypolicyviolation` event and (with `report-uri` or `report-to`) a CSP report, **on every sanitization, including benign
input**. The code caught the `TypeError` and fell back to a second `setHTML`, so the output was right, but a page that treats
violation reports as alerts was alerted for every template. There is no way to find out whether Trusted Types is enforced without
triggering the violation, and creating our own policy would violate any CSP whose `trusted-types` list does not name it.

**Decision.** The library never calls a Trusted-Types-gated sink with a string, anywhere. The native report's baseline is a second
`setHTML` with a permissive, blocklist-free config in the same inert document (`setHTML` is not gated).

**Consequences.**

- Sanitizing under an enforcing CSP produces **zero** violations in every engine; a test listens for `securitypolicyviolation` on
  an enforcing frame and asserts none. Behavior no longer depends on whether Trusted Types is enforced.
- The native report lists what **the profile's config** removed (elements outside the profile, dangerous containers,
  non-allowlisted attributes) but not what the engine removes unconditionally: `<script>`, `<iframe>`, `on*` handlers,
  `javascript:` URLs. Every safe `setHTML` strips these before we can look, and the only way to see them is a gated parse. The
  DOMPurify path's report does list them. The engines therefore agree on benign input (empty) and on everything the profile removes,
  and differ only in these engine-baseline removals. `enforceProfile` still removes anything either engine misses, so the security
  outcome is unaffected; only the diagnostic is less complete.
- This closes safe-fragment#8 as a documented limitation.
