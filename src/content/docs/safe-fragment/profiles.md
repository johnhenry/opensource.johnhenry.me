---
title: "Profiles"
description: "The five built-in profiles (including component-template-v1 and idPolicy), versioning and immutability, registerProfile and deriveProfile, custom-element prefix patterns, and how to add a new profile."
sidebar:
  order: 3
---

A profile is a versioned, immutable allowlist: which elements may appear, which attributes each element may carry, which URL
schemes are acceptable, and a handful of structural policies. The version is part of the name (`article-v1`) and restated in the
numeric `version` field. A future `article-v2` would be a distinct, opt-in profile, never a silent behavior change under an
existing name. A name whose `-v<N>` suffix disagrees with `version` is rejected with `PROFILE_MISMATCH`.

## Built-in profiles

| Profile | Status | Summary |
| --- | --- | --- |
| `plain-text-v1` | Fully implemented, tested | No HTML parsing at all: `textContent` only. |
| `article-v1` | Fully implemented, tested | Rich read-mostly content: prose, headings, lists, tables, links, images. |
| `ui-v1` | Fully implemented, tested | Layout and interactive elements, `data-action` delegation, forced `type="button"`. Derive a profile to add custom elements. |
| `component-template-v1` | Fully implemented, tested | `ui-v1` plus `<slot>` and `part`/`slot`/`exportparts`, for a web component's template. Opt-in `idPolicy: "keep-in-shadow"`. No `<style>`. |
| `email-v1` | **Scaffold** ([safe-fragment#2](https://github.com/johnhenry/safe-fragment/issues/2)) | Restrictive table-layout-friendly subset; blocks relative auto-loading URLs; no `cid:`, VML or MSO-comment handling yet. |

The exported constants `PLAIN_TEXT_V1`, `ARTICLE_V1`, `UI_V1`, `EMAIL_V1` and `COMPONENT_TEMPLATE_V1` are **name strings**, not definitions. Read a
definition with `getProfile(ARTICLE_V1)`.

### `plain-text-v1`

No HTML parsing at all: input is always rendered via `textContent`. Use it whenever content genuinely never needs markup
(usernames, plain-text comments, log lines). No HTML parser ever runs on the input, by construction.

### `article-v1`

Rich, read-mostly text content: paragraphs, headings, lists, tables, links, images, inline formatting, blockquotes, `<time>`.
No `class` or `style`, no forms, no scripting elements, no custom elements, no SVG or MathML. URL-valued attributes (`href`,
`src`, `cite`) accept only `https:`, `mailto:` and relative URLs. `target` survives only as `_blank`, and a kept target always
gets `rel="noopener noreferrer"` forced, overwriting whatever `rel` the markup carried.

**Trap:** relative URLs are allowed on `img src`, so `<img src="/logout">` makes the browser issue a credentialed same-origin
GET the moment the content renders ([safe-fragment#6](https://github.com/johnhenry/safe-fragment/issues/6)). If that matters,
derive a profile with `blockRelativeAutoLoadUrls: true`, which is what `email-v1` does by default.

### `ui-v1`

Structural and interactive application UI: layout containers (`div`, `section`, `nav`, ...), `button`s and `label`s, with a
smaller, more conservative element set than `article-v1`. Custom elements are not allowed as shipped; derive a profile to allow
some. The only `data-*` attribute `ui-v1` allows is `data-action`: there is no wildcard, because framework handler attributes
like `data-hx-on:click` are code by another name. `<button>`s are always forced to `type="button"`. `data-action` is read by
`<safe-fragment>`'s click delegation and dispatched as a `safe-fragment:action` event, letting markup *request* behavior without
ever supplying code. `class` is allowed ([safe-fragment#7](https://github.com/johnhenry/safe-fragment/issues/7) tracks the
host-selector risk), and it has the same relative-URL risk as `article-v1` (#6).

It deliberately excludes forms (`<form>`, `<input>`, `<select>`, `<textarea>`, `<button type="submit">`) and SVG/MathML for v1:
both are well-documented sanitizer-bypass surfaces (`formaction` hijacking; `<svg onload>` and `xlink:href` `javascript:` abuse)
that add a lot of allowlist surface for a use case ("clickable region dispatches an app action") that does not need them.

### `component-template-v1`

The markup of a web component's template: what you are about to clone into a shadow root. It is `ui-v1` (same elements and
attributes, same URL schemes, `data-action`, forced `type="button"`, ids namespaced by default) plus shadow-DOM composition:

- `<slot>` with `name`;
- `part`, `slot` and `exportparts` on every allowed element.

Nothing else differs. In particular, still removed (each by design):

| Input | Result |
| --- | --- |
| `<style>` | Dropped with its content. Not supported ([ADR 0006](/safe-fragment/decisions/#adr-0006-style-is-a-non-goal)): keep stylesheets outside the sanitized template ([below](#styles)). |
| `style="..."`, `srcset`, `data-*` other than `data-action` | Removed. |
| `<form>`, `<input>`, `<select>`, `<textarea>` | Unwrapped. Form-associated components: the control must come from your own code, or derive a profile and accept the surface. |
| SVG, MathML | Dropped ([safe-fragment#3](https://github.com/johnhenry/safe-fragment/issues/3)). |
| `http:` links, including `//host` when the page is served over `http:` | Removed: schemes are `https:`, `mailto:` and relative. Correct, but surprising on a local `http:` dev page. |
| `id` and every reference to it | Rewritten to `user-content-<id>` unless you opt in to `idPolicy: "keep-in-shadow"` ([below](#ids-inside-a-shadow-root)). |

Custom elements are not part of the built-in (it is immutable and the prefix is yours to choose). The recipe:

```ts
import { registerProfile, deriveProfile, COMPONENT_TEMPLATE_V1 } from "@johnhenry/safe-fragment";

registerProfile(
  deriveProfile(COMPONENT_TEMPLATE_V1, {
    name: "my-app-template-v1",
    customElements: [
      // list part/slot/exportparts yourself: a custom element's attributes are exactly what you say
      { tag: "my-app-*", attributes: ["part", "slot", "exportparts", "class", "id", "variant"] },
    ],
  }),
);
```

#### Ids inside a shadow root

By default every `id` becomes `user-content-<id>` and every reference to it (`for`, `aria-controls`, `aria-labelledby`,
`aria-describedby`, `aria-owns`, `href="#x"`, ...) is rewritten with it. A component whose own script or stylesheet uses `#id`
(or `form-control="#id"`) stops matching. That rewrite exists to stop DOM clobbering of `window` and `document`, which cannot
happen to content inside a shadow root, so there is an opt-in:

```ts
// the caller guarantees the fragment goes into a shadow root
const { fragment } = await sanitizeToFragment(html, { profile: "component-template-v1", idPolicy: "keep-in-shadow" });
shadowRoot.append(fragment);
```

```html
<safe-fragment profile="component-template-v1" scope="shadow" id-policy="keep-in-shadow"></safe-fragment>
```

`<safe-fragment>` enforces the precondition: `id-policy="keep-in-shadow"` with `scope="light"` rejects with `INVALID_OPTION`.
`sanitizeToFragment` cannot, so the guarantee is yours: inserted into light DOM or the document, a kept id can clobber `window`
and `document` properties. Everything else is still enforced. See [ADR 0005](/safe-fragment/decisions/#adr-0005-component-templates-a-composition-profile-and-ids-kept-only-inside-a-shadow-root) for the residual risk.

#### Styles

`<style>` is a non-goal ([ADR 0006](/safe-fragment/decisions/#adr-0006-style-is-a-non-goal)). Author component CSS outside the sanitized markup, as trusted code:

```ts
const sheet = new CSSStyleSheet();
sheet.replaceSync(componentCss); // application-authored, not from the template
shadowRoot.adoptedStyleSheets = [sheet];
shadowRoot.append(fragment);
```

### `email-v1`

**A scaffold, not fully hardened.** A restrictive subset covering the table-based layout patterns real HTML email relies on:
no forms, no scripting elements, no embeds, iframes or objects, no custom elements, no `style`. It shares `article-v1`'s
URL-scheme policy and, unlike it, sets `blockRelativeAutoLoadUrls: true`: a relative `img src`, `srcset` or `poster` is removed.
It does **not** yet special-case `cid:` (inline attachment) URLs, VML (`<v:*>`), or MSO conditional comments, and the adversarial
corpus only runs its shared cross-profile fixtures against it. Treat it as a starting point, not a battle-tested profile
([safe-fragment#2](https://github.com/johnhenry/safe-fragment/issues/2)).

### Why no `class` or `style`

`style` is excluded from every v1 profile outright: inline CSS can smuggle `url(javascript:...)`-style payloads and, more subtly,
CSS can be used for exfiltration and UI-redress attacks that have nothing to do with `javascript:` URLs. Rather than build a safe
CSS allowlist for v1, the attribute is removed unconditionally. `class` is excluded from `article-v1` and `email-v1` (read-mostly
profiles with no legitimate need for it) but allowed in `ui-v1`, where practical component styling needs it; the residual risk is
that a `class` value could coincidentally match a selector in the host page's stylesheet.

## Versioning and immutability

The five built-ins are deeply frozen. Nothing can modify them. A change to a shipped profile's output is a **new version**
(`foo-v2`), never an edit to `foo-v1`. To change behavior in your application, derive a new profile under a new name.

## `registerProfile`

```ts
import { registerProfile } from "@johnhenry/safe-fragment";

const mine = registerProfile({
  name: "comment-v1",
  version: 1,
  mode: "html",
  elements: { p: [], em: [], a: ["href", "title"] },
  urlAttributes: [],
  urlSchemes: ["relative", "https:"],
  allowedDataAttributes: [],
  allowStyleAttribute: false,
  customElements: [],
  blockRelativeAutoLoadUrls: false,
});
```

`registerProfile(definition)` validates and stores a deeply frozen copy and returns it. Invalid input throws a
`SafeFragmentError` (`INVALID_PROFILE`, or `PROFILE_MISMATCH` for a name and version disagreement), never a raw `TypeError`.
It refuses:

- dangerous elements (`script`, `style`, `template`, `iframe`, `object`, `embed`, `svg`, `math`, `base`, `meta`, `link`, ...);
- `on*`, `style`, `formaction`, `srcdoc`, `action` and `xlink:href` attributes;
- `javascript:`, `data:`, `vbscript:`, `file:` and `blob:` schemes;
- `allowStyleAttribute: true`, and wildcard `data-*` names;
- custom-element tags without a hyphen or with reserved names (`font-face`, `annotation-xml`, `color-profile`, `missing-glyph`, ...);
- a profile `name` that is not 1 to 64 characters of lowercase letters, digits, `-`, `_` or `.`, starting with a letter;
- any name that is already registered, built-ins included.

`unregisterProfile(name)` removes a profile you registered and returns whether it existed; built-ins cannot be unregistered.
`getProfile(name)` returns a definition or `undefined`, and `listProfiles()` returns every registered name. A registered profile
is visible to `<safe-fragment profile="...">`, to `sanitizeToFragment` and, via a `globalThis`-keyed shared store, to both the
ESM and CJS builds of the package.

## `deriveProfile` and prefix patterns

`deriveProfile(base, overrides)` builds, **without registering or mutating anything**, a new definition from an existing profile.
This is how you add custom elements, `data-*` names or a scheme to a built-in:

```ts
import { registerProfile, deriveProfile } from "@johnhenry/safe-fragment";

registerProfile(
  deriveProfile("ui-v1", {
    name: "my-ui-v1",
    customElements: [
      { tag: "rating-stars", attributes: ["value", "max"] },
      { tag: "ui--*", attributes: ["role"] }, // prefix pattern: ui--card, ui--stat, ...
    ],
    allowedDataAttributes: ["data-action", "data-id"],
  }),
);
// <safe-fragment profile="my-ui-v1"> ...
```

- Custom-element entries are exact tags or **prefix patterns** ending in `*` (`ui--*`). Exact matches win, then the longest
  prefix. A pattern must be a hyphenated lowercase prefix followed by a single `*`.
- `customElements` **replaces** the base's list; `elements` replaces the base's element map, while `addElements` merges extra
  elements over it.
- Any hyphenated tag not matched by an entry is **unwrapped** (its text and allowed descendants stay; see
  [ADR 0004](/safe-fragment/decisions/#adr-0004-one-behavior-for-disallowed-elements)).
- URL-valued attributes on custom elements (`src`, `href`, `srcset`, ...) are checked against the profile's `urlSchemes` like any
  other.
- The new `name` must differ from the base's, and when it changes the `-v<N>` suffix you must also set `version`, or
  registration fails with `PROFILE_MISMATCH`.
- What your custom elements do with the sanitized attribute values they receive is your code, and your responsibility.

## Adding a new profile

**In your application** (no fork needed): derive from a built-in, give it a new name that ends in `-v<N>` with a matching
`version`, and register it before the first render. A profile can only narrow or extend within the validated envelope (no
dangerous elements, `on*` or `style`, or dangerous schemes).

```ts
registerProfile(deriveProfile("article-v1", { name: "comments-v1", version: 1, urlSchemes: ["relative", "https:"] }));
```

**In the repository** (a new built-in `foo-v1`):

1. Add `src/profiles/foo-v1.ts` exporting a deeply frozen `FOO_V1_PROFILE` (the shape is `ProfileDefinition` in
   `src/policy/profile.ts`; copy the closest existing profile).
2. Add it to the seed list in `src/policy/registry.ts` and export its name-string constant (`FOO_V1`) from `src/index.ts`.
3. Add it to the invariants in `test/unit/profiles.test.ts` (no dangerous scheme or element, no `style`, no `on*`).
4. Add fixtures to `test/fixtures/xss-corpus.ts` **and** `test/fixtures/benign-corpus.ts`. The equivalence suite runs both
   through both engines, and the benign corpus is what catches a sanitizer that deletes everything.
5. Document it and add a `CHANGELOG.md` entry. A change to a shipped profile's output is a new version (`foo-v2`), never an edit
   to `foo-v1`.
