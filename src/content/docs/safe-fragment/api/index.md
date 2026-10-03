---
title: "API reference"
description: "The complete reference for @johnhenry/safe-fragment: every runtime export and type exported from the package root, and the pages that detail them."
sidebar:
  label: "Overview"
  order: 100
---

The complete reference for `@johnhenry/safe-fragment`, checked against `src/index.ts`. The guide pages are the guided tour; this
is the lookup table. There is a single entry point, `@johnhenry/safe-fragment` (plus `./package.json`), shipped as ESM and CJS.
Importing it never touches `window`, `document`, `HTMLElement` or `customElements`.

:::note[Published]
`0.0.0` is on npm (2026-10-03). Its security review was signed off by the maintainer on 2026-10-01
([safe-fragment#1](https://github.com/johnhenry/safe-fragment/issues/1)).
:::

| Page | Covers |
| --- | --- |
| [Element](/safe-fragment/api/element/) | `registerSafeFragment`, `getSafeFragmentElementClass`, `createSafeFragmentElementClass`, `registerExampleSandbox`, the element interface, event types, and the fetch capability. |
| [Profiles](/safe-fragment/api/profiles/) | `registerProfile`, `unregisterProfile`, `deriveProfile`, `getProfile`, `listProfiles`, the profile types, built-in names, custom-element name helpers. |
| [Errors](/safe-fragment/api/errors/) | `SafeFragmentError`, `isSafeFragmentError`, and every error code. |
| [URL policy](/safe-fragment/api/url-policy/) | `checkUrl` and its constants. |
| [Registry](/safe-fragment/api/registry/) | The profile registry and the shared state: how profiles are stored and found. |

For the sanitizer functions see [Sanitizing without the element](/safe-fragment/sanitize-api/).

## Runtime exports

Every value exported from the package root (25 in all).

| Export | Kind | Page |
| --- | --- | --- |
| `registerSafeFragment(options?)` | function | [Element](/safe-fragment/api/element/#registersafefragmentoptions) |
| `getSafeFragmentElementClass(htmlElementBase?)` | function | [Element](/safe-fragment/api/element/#getsafefragmentelementclasshtmlelementbase) |
| `createSafeFragmentElementClass(HTMLElementBase, deps)` | function | [Element](/safe-fragment/api/element/#createsafefragmentelementclasshtmlelementbase-deps) |
| `registerExampleSandbox(options?)` | function | [Element](/safe-fragment/api/element/#registerexamplesandboxoptions) |
| `DEFAULT_FETCH_CAPABILITY` | constant | [Element](/safe-fragment/api/element/#fetchcapability) |
| `registerProfile(definition)` | function | [Profiles](/safe-fragment/api/profiles/#registerprofiledefinition) |
| `unregisterProfile(name)` | function | [Profiles](/safe-fragment/api/profiles/#unregisterprofilename) |
| `deriveProfile(base, overrides)` | function | [Profiles](/safe-fragment/api/profiles/#deriveprofilebase-overrides) |
| `getProfile(name)` | function | [Profiles](/safe-fragment/api/profiles/#getprofilename) |
| `listProfiles()` | function | [Profiles](/safe-fragment/api/profiles/#listprofiles) |
| `RESERVED_CUSTOM_ELEMENT_NAMES` | constant | [Profiles](/safe-fragment/api/profiles/#custom-element-name-helpers) |
| `isValidCustomElementName(name)` | function | [Profiles](/safe-fragment/api/profiles/#custom-element-name-helpers) |
| `PLAIN_TEXT_V1`, `ARTICLE_V1`, `UI_V1`, `EMAIL_V1`, `COMPONENT_TEMPLATE_V1` | constants (name strings) | [Profiles](/safe-fragment/api/profiles/#built-in-profile-names) |
| `sanitizeToFragment(html, options)` | function | [Sanitize API](/safe-fragment/sanitize-api/#sanitizetofragmenthtml-options) |
| `sanitizeToFragmentSync(html, options)` | function | [Sanitize API](/safe-fragment/sanitize-api/#sanitizetofragmentsynchtml-options) |
| `preloadSanitizer(options?)` | function | [Sanitize API](/safe-fragment/sanitize-api/#preloadsanitizeroptions) |
| `SafeFragmentError` | class | [Errors](/safe-fragment/api/errors/#safefragmenterror) |
| `isSafeFragmentError(value)` | function | [Errors](/safe-fragment/api/errors/#issafefragmenterrorvalue) |
| `checkUrl(rawValue, allowedSchemes, base?)` | function | [URL policy](/safe-fragment/api/url-policy/) |
| `SAFE_DEFAULT_URL_SCHEMES` | constant | [URL policy](/safe-fragment/api/url-policy/#constants) |
| `RELATIVE_URL_SCHEME` | constant | [URL policy](/safe-fragment/api/url-policy/#constants) |

The five constants `PLAIN_TEXT_V1`, `ARTICLE_V1`, `UI_V1`, `EMAIL_V1` and `COMPONENT_TEMPLATE_V1` are counted individually above.

## Type exports

| Type | Page |
| --- | --- |
| `SafeFragmentElement`, `SafeFragmentEventMap` | [Element](/safe-fragment/api/element/#types) |
| `SafeFragmentElementDeps`, `RegisterSafeFragmentOptions`, `RegisterExampleSandboxOptions`, `FetchCapability` | [Element](/safe-fragment/api/element/#types) |
| `RenderMode`, `RenderScope`, `IdPolicy`, `SourceKind`, `RenderResult` | [Element](/safe-fragment/api/element/#types) |
| `BeforeRenderDetail`, `RenderDetail`, `RejectDetail`, `ActionDetail`, `LinkDetail`, `ClearDetail` | [Element](/safe-fragment/api/element/#types) |
| `SanitizerEngineKind`, `SanitizationNote`, `SanitizationReport` | [Element](/safe-fragment/api/element/#types) |
| `SanitizeToFragmentOptions`, `SanitizeToFragmentResult`, `PreloadSanitizerOptions` | [Sanitize API](/safe-fragment/sanitize-api/) |
| `DOMPurifyFactory`, `DOMPurifyLoader`, `DOMPurifyLike` | [Sanitize API](/safe-fragment/sanitize-api/#loaddompurify) |
| `ProfileDefinition`, `CustomElementAllowlistEntry`, `DeriveProfileOverrides`, `BuiltInProfileName` | [Profiles](/safe-fragment/api/profiles/#types) |
| `SafeFragmentErrorCode` | [Errors](/safe-fragment/api/errors/) |
| `UrlCheckResult` | [URL policy](/safe-fragment/api/url-policy/#types) |
