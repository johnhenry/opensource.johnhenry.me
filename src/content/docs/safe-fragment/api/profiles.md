---
title: "Profiles API"
description: "Reference for registerProfile, unregisterProfile, deriveProfile, getProfile, listProfiles, ProfileDefinition, the built-in name constants and the custom-element helpers."
sidebar:
  order: 102
---

For the built-in profiles, versioning and patterns, see [Profiles](/safe-fragment/profiles/). All of these read and write the
[registry](/safe-fragment/api/registry/).

## `registerProfile(definition)`

Registers a **new** profile under `definition.name`. Validates, stores a deeply frozen copy and returns it. Throws
`SafeFragmentError` with `INVALID_PROFILE`, or `PROFILE_MISMATCH` when the name's `-v<N>` suffix disagrees with `version`. Built-in
profiles can never be replaced, and an already-registered name must be unregistered first.

Validation requires: `name` 1 to 64 chars of lowercase letters, digits, `-`, `_`, `.` starting with a letter; integer
`version >= 1`; `mode` of `"html"` or `"text"`; lowercase `elements` mapping each tag to an array of lowercase attribute names;
string arrays for `urlAttributes`, `urlSchemes` and `allowedDataAttributes`; boolean `allowStyleAttribute` (must be `false`) and
`blockRelativeAutoLoadUrls`; and an array of `customElements`. It refuses the elements, attributes, schemes and names listed on
[Profiles](/safe-fragment/profiles/#registerprofile).

## `unregisterProfile(name)`

Removes a profile added with `registerProfile`; returns whether it existed. Built-ins throw `INVALID_PROFILE`, as does a non-string
argument.

## `deriveProfile(base, overrides)`

Builds, but does **not** register, a new definition from a registered base (a name or a `ProfileDefinition`) plus overrides. Pure:
the base is never modified. Throws `INVALID_PROFILE` for an unknown base, missing `overrides.name`, or a name equal to the base's.
Pass the result to `registerProfile`.

`DeriveProfileOverrides`:

| Field | Behavior |
| --- | --- |
| `name` | **Required.** Must differ from the base's. |
| `version` | Defaults to the base's version, which must then match the name's `-v<N>` suffix. |
| `elements` | Replaces the base's element map. |
| `addElements` | Extra elements merged over the base's. |
| `urlAttributes` | Replaces the base's. |
| `urlSchemes` | Replaces the base's. |
| `allowedDataAttributes` | Replaces the base's. |
| `customElements` | Exact tags or `prefix-*` patterns; **replaces** the base's list. |
| `blockRelativeAutoLoadUrls` | Overrides the base's flag. |

The derived `mode` is always the base's, and `allowStyleAttribute` is always `false`.

## `getProfile(name)`

Returns the frozen `ProfileDefinition`, or `undefined` for an unknown profile.

## `listProfiles()`

Returns every registered profile name: the built-ins plus anything added with `registerProfile`.

## Types

### `ProfileDefinition`

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | Stable identifier, for example `"article-v1"`. |
| `version` | `number` | Integer revision (>= 1); must agree with a `-v<N>` name suffix. |
| `mode` | `"text" \| "html"` | `"text"` profiles never parse HTML. |
| `elements` | `Record<string, readonly string[]>` | Allowed elements and, per element, the attributes it may carry (lowercase). |
| `urlAttributes` | `readonly string[]` | Extra attribute names to treat as URL-valued. The well-known URL attributes are always checked regardless. |
| `urlSchemes` | `readonly string[]` | Allowed schemes: the literal `"relative"`, or schemes with a colon (`"https:"`, `"mailto:"`). |
| `allowedDataAttributes` | `readonly string[]` | The only `data-*` names allowed, as full lowercase names. No wildcard. |
| `allowStyleAttribute` | `boolean` | Always `false` in a registrable profile. |
| `customElements` | `readonly CustomElementAllowlistEntry[]` | Custom elements kept; empty means none. |
| `blockRelativeAutoLoadUrls` | `boolean` | Reject relative URLs on auto-loading attributes (`img src`, `srcset`, `poster`, ...). |

### `CustomElementAllowlistEntry`

`{ tag: string; attributes: readonly string[] }`. `tag` is a lowercase hyphenated name (`"my-widget"`) or a prefix pattern ending in
`*` (`"ui--*"`). Exact matches win, then the longest matching prefix.

### `BuiltInProfileName`

`"plain-text-v1" | "article-v1" | "ui-v1" | "email-v1" | "component-template-v1"`.

## Built-in profile names

`PLAIN_TEXT_V1 = "plain-text-v1"`, `ARTICLE_V1 = "article-v1"`, `UI_V1 = "ui-v1"`, `EMAIL_V1 = "email-v1"`, `COMPONENT_TEMPLATE_V1 = "component-template-v1"`. These are **strings, not
definitions**, for autocomplete and typo protection; read a definition with `getProfile(ARTICLE_V1)`. Built-ins are frozen and
cannot be modified.

## Custom-element name helpers

- **`RESERVED_CUSTOM_ELEMENT_NAMES`**: a frozen array of names that match the custom-element grammar but are reserved by the HTML
  and SVG/MathML specs and can never be custom elements: `annotation-xml`, `color-profile`, `font-face`, `font-face-src`,
  `font-face-uri`, `font-face-format`, `font-face-name`, `missing-glyph`.
- **`isValidCustomElementName(name)`**: true for a syntactically valid custom-element name (lowercase ASCII start, a hyphen, no
  ASCII uppercase, a conservative character set), excluding reserved names. A character scan, not a regex.
