---
title: "Security model"
description: "What safe-fragment guarantees, the pipeline step by step, and what is still yours, with every known gap linked to its issue."
sidebar:
  order: 8
---

:::caution[Pending independent review]
This was built end-to-end by AI agents against specifications and audits, and passes its own test suite, but has **not** had
independent human security review ([safe-fragment#1](https://github.com/johnhenry/safe-fragment/issues/1)). Do not release or
rely on it for hostile content before that review.
:::

## Security model

**What safe-fragment guarantees:**

- **Untrusted strings never reach an unsafe DOM sink.** `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `setHTMLUnsafe` (and
  equivalents) are never called with unsanitized input anywhere in this codebase: parsing and allowlist enforcement always
  happen together, in an inert document, before anything touches a live one. See
  [ADR 0001](/safe-fragment/decisions/#adr-0001-html-is-data-never-code).
- **Every render goes through a closed, versioned allowlist**, not a denylist, enforced by `enforceProfile()`. An element or
  attribute not explicitly listed in the active profile is removed (raw-text and embedding containers with their whole subtree,
  other disallowed elements unwrapped, identically in both engines;
  [ADR 0004](/safe-fragment/decisions/#adr-0004-one-behavior-for-disallowed-elements)), never "escaped and left in place." The
  output is rebuilt from fresh nodes.
- **URL filtering uses the platform `URL` parser, never regex**, on every URL-valued attribute including custom-element
  attributes and every `srcset` candidate. `javascript:`, `data:`, `vbscript:`, and `file:` are rejected under every shipped
  profile (whitespace, entity and case-obfuscated variants included), and protocol-relative and backslash URLs inherit the
  *document's* scheme, not an assumed `https:`.
- **Two engines, one boundary.** The native Sanitizer API or a locked-down DOMPurify do the initial parse; the shared
  `enforceProfile()` pass then re-derives the allowed set from the profile. A corpus-wide test compares the two engines' output
  for the whole XSS corpus plus a benign corpus. See
  [ADR 0002](/safe-fragment/decisions/#adr-0002-native-sanitizer-with-a-dompurify-fallback-plus-a-shared-allowlist-pass).
- **`on*` attributes are always stripped**, even if a profile or custom element mistakenly lists one: a hardcoded backstop.
- **Reverse tabnabbing is closed:** `target` survives only as `_blank`, and a kept target always overwrites `rel` with
  `noopener noreferrer`.
- **DOM clobbering is closed:** every `id` is prefixed `user-content-` and every in-fragment reference rewritten, so content
  cannot create `window.scriptUrl` or shadow the host page's ids.
- **`ui-v1` is inert by construction:** `<button>` is forced to `type="button"`, and `data-*` is an explicit allowlist
  (`data-action`), never a wildcard (framework handler attributes like `data-hx-on:click` cannot ride through).
- **No "unsafe"/"trusted"/"allowScripts" escape hatch exists** anywhere in the public API. Built-in profiles are frozen; custom
  profiles are validated and cannot allow dangerous elements, `on*`/`style`, or dangerous schemes.
- **Importing this package never touches `window`/`document`/`HTMLElement`/`customElements`**: it is safe to `import` in Node or
  SSR.
- **The `src` fetch is disabled by default**, GET-only, same-origin unless allowlisted, redirect-refusing unless you opt in (and
  then re-validated), size-capped while streaming, time-limited until the body is read, and a stale fetch can never overwrite a
  newer render. See [Remote `src`](/safe-fragment/remote-src/).
- **Works under Trusted Types** (`require-trusted-types-for 'script'`): one DOMPurify instance, hence one `dompurify` policy, per
  window. See [Trusted Types and CSP](/safe-fragment/trusted-types-and-csp/).
- **Bounded input:** `maxInputLength` (default 1,000,000 characters) rejects oversized sources with `SOURCE_TOO_LARGE` before
  parsing.

**What is still yours:**

- **Choosing the right profile.** Rendering attacker-controlled content under `ui-v1` (which allows `class` and, if you derive it
  so, custom elements) when `article-v1` or `plain-text-v1` would do is a choice this library cannot make for you.
- **What your own custom elements do.** A derived profile lets your registered custom elements receive sanitized attribute
  values; what their `attributeChangedCallback` (or anything else) does with them is your code.
- **`<example-sandbox>`'s executable code is never sanitized, and is not meant to be.** It is a *separate* component for
  application-authored, trusted code samples; see [`<example-sandbox>`](/safe-fragment/example-sandbox/). Feeding it untrusted
  input is a misuse, not a bypass of `<safe-fragment>`.
- **Shadow DOM (`scope="shadow"`) is a styling convenience, not an isolation boundary**
  ([ADR 0003](/safe-fragment/decisions/#adr-0003-shadow-dom-is-not-a-security-boundary)).
- **Same-origin GETs from relative `img src`** under `article-v1`/`ui-v1`
  ([safe-fragment#6](https://github.com/johnhenry/safe-fragment/issues/6)) and **host selectors matched by `ui-v1` `class`
  values** ([safe-fragment#7](https://github.com/johnhenry/safe-fragment/issues/7)).
- **Cost under the size cap on the DOMPurify path**
  ([safe-fragment#5](https://github.com/johnhenry/safe-fragment/issues/5)): lower `maxInputLength` if you render attacker-sized
  content in Safari.
- **Content-level risks this library cannot see:** a syntactically valid phishing link is not a code-execution bug. See
  [What this package does not protect against](#what-this-package-does-not-protect-against) below.
- **The pending independent review** ([safe-fragment#1](https://github.com/johnhenry/safe-fragment/issues/1)), `email-v1`
  ([#2](https://github.com/johnhenry/safe-fragment/issues/2)), SVG/MathML
  ([#3](https://github.com/johnhenry/safe-fragment/issues/3)) and the moving native Sanitizer spec
  ([#4](https://github.com/johnhenry/safe-fragment/issues/4)).

## The pipeline, precisely

```
string -> size check -> engine (native setHTML | DOMPurify) -> enforceProfile() -> rebuild -> DocumentFragment
          "inert, roughly to profile,  "the actual allowlist"  "fresh nodes:     (detached; not yet
           in an inert document"                                 no hidden state"  inserted)
```

The same pipeline backs `<safe-fragment>` and the public `sanitizeToFragment()` and `sanitizeToFragmentSync()`.

1. **Source resolution.** Exactly one markup source per the documented precedence. In `strict` mode more than one is a hard
   `AMBIGUOUS_SOURCE` rejection. A non-string source is `INVALID_SOURCE` (never rendered as `[object Object]`).
2. **Profile resolution.** The `profile` must name a registered profile. An unknown or missing one is a hard `UNKNOWN_PROFILE`
   rejection: there is no implicit default, on purpose, because rendering *something* under a wrong-by-accident profile is worse
   than rendering nothing.
3. **`before-render`.** A cancelable event fires once the source and profile have validated, before any fetch or parse. A
   listener can veto with `preventDefault()` (`RENDER_ABORTED`; existing content is left alone).
4. **Fetch** (`src` only).
5. **Size check.** At most `maxInputLength` UTF-16 code units, else `SOURCE_TOO_LARGE`.
6. **Sanitization.** `mode: "text"` profiles become a single `Text` node, with no HTML parser invoked. `mode: "html"` profiles use
   native `setHTML` when available, otherwise DOMPurify configured with an explicit allowlist derived from the profile (never its
   own defaults). Both engines parse inside an **inert document** (no browsing context, so nothing loads or runs), in body
   context, so the same input yields the same tree in both. Neither config needs to be perfect: step 7 is the boundary. What the
   engine removed is reported (DOMPurify via its `removed` log; native via a diff against an inert second parse, with the
   Trusted Types caveat of [safe-fragment#8](https://github.com/johnhenry/safe-fragment/issues/8)).
7. **`enforceProfile()`**, the authoritative allowlist pass, run identically regardless of engine:
   - strips comments and walks every element;
   - drops dangerous containers (`script`, `style`, `template`, `noscript`, `iframe`, `noembed`, `noframes`, `xmp`, `textarea`,
     `title`, `select`, `object`, `embed`, `svg`, `math`, ...) and any element outside the HTML namespace **with their whole
     subtree**, and **unwraps** every other disallowed element (its text and allowed descendants stay);
   - removes any attribute not on the element's allowed list, with hard exceptions regardless of profile: any `on*` attribute plus
     `formaction`, `srcdoc`, `action` and `xlink:href` are always removed; `style` is removed unless `allowStyleAttribute` (which
     `registerProfile` refuses and no built-in sets); `data-*` is kept only when named in `allowedDataAttributes` or the element's
     own list;
   - **checks every URL-valued attribute** (`src`, `href`, `srcset`, `imagesrcset`, `poster`, `action`, `formaction`,
     `xlink:href`, `background`, `ping`, `cite`, `data`, ...) through `checkUrl()`, whatever the profile's own `urlAttributes`
     says, including on custom elements; every `srcset` candidate must pass and `ping` is checked per token; a disallowed or
     unparseable URL removes the attribute entirely rather than rewriting it to something "safe-looking";
   - resolves protocol-relative and backslash URLs against the document's own base, and rejects them where the base cannot resolve
     them (`about:blank`, `data:`);
   - removes **relative URLs on auto-loading attributes** when the profile sets `blockRelativeAutoLoadUrls`;
   - normalizes `target` and forces `rel`, forces `<button>` to `type="button"`, and prefixes ids (`user-content-`), rewriting
     in-fragment references (`href="#x"`, `for`, `aria-controls`, `aria-labelledby`, `aria-describedby`, `aria-owns`,
     `headers`, `list`, ...) consistently.
8. **Rebuild.** The enforced fragment is rebuilt from fresh `createElement` and `createTextNode` calls, copying only surviving
   attributes. A DOM node can carry hidden state no attribute check can see (a customized built-in's `is` value survives
   `removeAttribute("is")`), so after this pass the output is exactly the allowlisted tree.
9. **Insertion.** Only then does the profile-conformant fragment move into the live DOM, via `replaceChildren()` on a dedicated
   wrapper element. Nothing the engines parsed was ever in the live document, so no resource load started early.
10. **`render`** fires with the `SanitizationReport`; **`reject`** fires instead, with a stable code, if any step failed, and the
    previously rendered content is **cleared**.

## Cost and denial of service

- `maxInputLength` rejects larger strings with `SOURCE_TOO_LARGE` before any parsing. This bounds, but does not eliminate, the
  cost below. The `src` fetch has its own, smaller byte cap (default 250,000).
- **The DOMPurify fallback is quadratic in the number of removed nodes**: it detaches nodes one at a time, and a payload of
  100,000 removable elements was measured at 12 to 47 seconds on the main thread. Native `setHTML` does not have this profile.
  Safari (no `setHTML`) always takes the DOMPurify path. If you render attacker-sized content there, set a lower
  `maxInputLength`; [safe-fragment#5](https://github.com/johnhenry/safe-fragment/issues/5) tracks a real fix.

## What is logged, and what is not

`SanitizationReport` (and the `reject` event's detail) never include the full original or sanitized markup. Each note carries the
element tag, the attribute name if any, a short stable `reason`, and a `snippet` of the offending *value* truncated to 60
characters (engine-level removals carry no snippet). This is deliberate: a report is diagnostic data an application might log or
send to telemetry, and logging an attacker-controlled payload by default is itself a risk (log injection, oversized entries,
persisting exactly the payload a review would want redacted).

Reasons you will see: `removed-by-engine:native`, `removed-by-engine:dompurify`, `element-dropped:dangerous-container`,
`element-dropped:foreign-namespace`, `element-unwrapped:not-in-profile`, `element-unwrapped:custom-element-not-registered`,
`forbidden-attribute-class`, `style-attribute-disallowed`, `data-attribute-not-allowlisted`, `attribute-not-in-profile`,
`disallowed-url-scheme:<scheme>`, `relative-url-on-auto-load`. A note in `removedElements` means that element was removed;
unwrapped elements still have their children in the output.

## What this package does not protect against

- **CSS-based attacks via the `class` attribute.** `article-v1` and `email-v1` do not allow `class`; `ui-v1` does, with no attempt
  to validate class *names* against the host page's stylesheet ([safe-fragment#7](https://github.com/johnhenry/safe-fragment/issues/7)).
- **Same-origin GET side effects from relative image URLs** under `article-v1`/`ui-v1`
  ([safe-fragment#6](https://github.com/johnhenry/safe-fragment/issues/6)); opt in to `blockRelativeAutoLoadUrls` via
  `deriveProfile`.
- **Content-level phishing and social engineering.** A sanitized `<a href="https://evil-but-syntactically-fine.example/">Your
  Bank</a>` is not a code-execution bug, and the library does not try to detect it.
- **Unbounded cost under the size cap on the DOMPurify path**
  ([safe-fragment#5](https://github.com/johnhenry/safe-fragment/issues/5)).
- **Anything inside `<example-sandbox>`.** Its entire purpose is running real code; its only guarantee is iframe-level isolation
  from the host page, not from the code it runs.
- **What your own custom elements do** with the sanitized attributes they receive.
- **SVG/MathML** are not supported at all ([safe-fragment#3](https://github.com/johnhenry/safe-fragment/issues/3)), and `email-v1`
  is a scaffold ([safe-fragment#2](https://github.com/johnhenry/safe-fragment/issues/2)).
- **Anything the independent security review has not yet covered**
  ([safe-fragment#1](https://github.com/johnhenry/safe-fragment/issues/1)).

## What still needs human review

Before trusting this with real, adversarial user content:

- **Independent review of `src/sanitize/enforce.ts`, `src/sanitize/rebuild.ts` and `src/policy/url.ts`**: the actual security
  boundary; everything else is defense in depth around them. Also `src/policy/registry.ts` validation of custom profiles.
- **A wider adversarial corpus.** The XSS corpus covers the classes of attack named in the original spec (img/onerror,
  `javascript:` URLs, svg/onload, MathML `xlink:href`, obfuscated protocols, formaction, srcdoc, parser-confusion, inline style,
  custom-element abuse) plus clobbering, tabnabbing and srcset cases in their own suites, but is not exhaustive. An OWASP
  cheat-sheet cross-check and mXSS fuzzing against both engines would materially increase confidence.
- **Native Sanitizer API behavior per browser release** ([safe-fragment#4](https://github.com/johnhenry/safe-fragment/issues/4)).
  Verified in Chromium and WebKit locally and Firefox in CI; the equivalence test has one documented Firefox divergence
  (`noscript`, scripting-flag parse).
- **The DOMPurify version.** It is pinned to an exact version because profile output stability depends on it. A supply-chain
  review of the dependency is still a reasonable pre-production step.
- **The hard denylist** (`on*`, `formaction`, `srcdoc`, `action`, `xlink:href`) and the always-checked URL-attribute list, for
  completeness against attribute-based vectors.
- **The `email-v1` scaffold**, before it is used for anything beyond a starting point
  ([safe-fragment#2](https://github.com/johnhenry/safe-fragment/issues/2)).
