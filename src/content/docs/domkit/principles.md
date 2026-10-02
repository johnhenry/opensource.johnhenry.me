---
title: "Principles"
description: "The contract every domkit element keeps: behave like a native element, work in forms, be accessible, style with CSS, compose, and survive any lifecycle."
sidebar:
  order: 4
---

domkit is for people writing HTML without a build step. Every element
should feel like a native one: you write a tag, the browser gives it
behavior, and everything you already know about HTML, CSS, forms, and
accessibility keeps working. This document is the contract each stable
module is held to. `test/browser/` checks it in Chromium, Firefox, and
WebKit.

When a rule here and a module disagree, the module is wrong.

## 1. HTML is the interface

- **One script tag is enough.** `global.mjs` registers the element, and
  everything else is attributes and children. No JavaScript is *required*
  to configure any stable element.
- **Content stays readable before the element upgrades.** Children are
  ordinary HTML that renders sensibly if the script is slow or fails, and
  the element only *enhances* it. Authors can use `:not(:defined)` to
  style the gap.
- **The tag name is the module name.** Only autonomous custom elements
  (`<x-y>`) are used, never customized built-ins (`is="…"`), which Safari
  doesn't support.

## 2. Behave like a native element

When a native element already has a convention, domkit follows it rather
than inventing one.

| Concern | The native convention to follow |
|---|---|
| Attributes vs. properties | Every attribute has a matching property. Booleans are presence-based (`disabled`, `open`), and kebab-case attributes map to camelCase properties (`selected-index` ↔ `selectedIndex`) |
| Reacting to changes | Every documented attribute takes effect whenever it changes, not only at connect. Children added, removed, or reordered later are picked up |
| Reflection | State the user can change (the selected tab, an open panel, a value) is reflected to an attribute, so CSS and `querySelector` can see it |
| Visibility | Hidden content gets the `hidden` attribute, never `style.display`, so author CSS stays in control and `[hidden]` rules keep working |
| Events | Native names and semantics: `input` for continuous change, `change` for a committed change, `toggle` for open/closed state, `select`/`invalid`/`reset` where those apply. All of them bubble. State is read from the element (`event.target.value`), and `detail` is a convenience, never the only source |
| Script-triggered changes | Setting a property or attribute from script does **not** fire `input`/`change`, just like `input.value = …` doesn't. Only user interaction does |
| Inline handlers | Events use native names wherever one fits (`change`, `input`, `toggle`, `play`, `pause`, `load`, `error`), so the browser's own handler attributes work on domkit elements with no extra code: `<tabbed-ui onchange="…">`, `<frame-timer onplay="…">`. An event with no native equivalent (`tick`, `push`, `pop`) gets a plain lowercase name and is used with `addEventListener`. No element evaluates attribute strings itself, so everything works under a strict Content-Security-Policy. Every inline-code feature has a script alternative |
| Disabled | Every interactive element supports `disabled`, with one meaning: no user interaction, out of the tab order, no events, still announced (`aria-disabled`), and styleable as `[disabled]`. Form-associated elements also match `:disabled` and inherit it from a `<fieldset disabled>`. Content the element shows (a tab panel) stays readable |

## 3. Forms just work

Any element that holds a value is **form-associated**
(`static formAssociated = true` + `ElementInternals`):

- `name` and `value` are submitted with the form and appear in `FormData`
  and `form.elements`.
- `<label for>` and wrapping `<label>`s work.
- `form.reset()` restores the initial value, the `required` and
  `setCustomValidity()` constraints participate in validation (`:invalid`,
  `reportValidity()`), and bfcache/autofill restore works
  (`formStateRestoreCallback`).

## 4. Accessible by construction

- Each widget follows its [WAI-ARIA Authoring Practices
  pattern](https://www.w3.org/WAI/ARIA/apg/patterns/): roles, states, and
  the full keyboard interaction, including roving `tabindex`,
  `Home`/`End`, and focus that is always visible.
- Roles and states are written as ARIA attributes (on the element and on
  the parts it manages), not only through `ElementInternals`, so every
  assistive technology, auditing tool, and test runner sees them. A role
  the author wrote is never overwritten.
- Arrow keys follow the reading direction: in right-to-left text, ←/→ swap
  meaning for every horizontal widget.
- Keyboard handlers only claim the keys they use and only `preventDefault`
  what they handle. They never stop propagation of keys they don't handle.

## 4½. Speaks the user's language

- Text an element shows or announces is replaceable (a `strings`
  property, or an inert `<script type="application/json" data-strings>`
  child), with plural forms (`Intl.PluralRules`) and number formatting
  (`Intl.NumberFormat`) for the element's `lang`.
- Validation messages are the browser's own localized ones, borrowed from
  native controls, never hard-coded.

## 5. Styled with ordinary CSS

- Light DOM by default, so children are styled like any other HTML.
  Where shadow DOM is necessary, generated parts are exposed with `part`,
  and theming uses CSS custom properties (`--domkit-…`).
- No hard-coded colors, fonts, or sizes in JavaScript. An optional
  `index.css` per module provides sensible defaults.
- **One set of shared tokens themes everything**: `--domkit-accent`,
  `--domkit-highlight`, `--domkit-border`, `--domkit-radius`,
  `--domkit-focus-ring`, `--domkit-surface`/`--domkit-surface-text`, and
  `--domkit-disabled-opacity`, defined in `theme.css`. Every `index.css`
  reads them, with `currentColor`-based fallbacks so it also works alone.
  An element only adds its own custom property for something no other
  element has (`--domkit-tab-gap`, `--domkit-select-size`).
- Internal state is also exposed as custom states (`:state(…)`) where
  attributes would be noisy.
- **Stylesheets never defeat `hidden`.** Any author rule that sets
  `display` beats the browser's `[hidden] { display: none }`, so every
  `display` declaration in a domkit stylesheet is scoped to
  `:not([hidden])`. One element can then hide another (a `tabbed-ui`
  panel containing a `code-color`) and it stays hidden.

## 6. Composable

- **Shared contracts across modules, modeled on the native ones.** Every
  element that holds options exposes them as real `<option>` (or
  `role="option"`) elements, with the same option-value rules, the same
  `options`/`value` members as `HTMLSelectElement`, the same
  `[data-active]`/`aria-selected` styling hooks, and the same
  `input`/`change` timing, and the same members (`value`, `options`,
  `selectedOption`, `selectedOptions`, `selectedIndex`, `length`,
  `item()`). `stylable-select` and `infinite-combo-box` are
  interchangeable for code that reads a value or styles options, and
  either can stand in for a native `<select>`.
- Elements nest and coexist: no globals unless documented, no fixed IDs,
  and nothing that assumes it's the only instance on the page.
- Platform features come first. Where the platform now covers a module's
  job (`<select>` with `appearance: base-select`, `<dialog closedby>`,
  `popover`, `command`/`commandfor`, container queries), the module is a
  thin layer over that feature, and its README says when you don't need it.

## 7. Robust lifecycle

- Connecting, disconnecting, reconnecting, and moving (both in one task)
  are all safe. Everything started on connect is stopped on disconnect and
  restarted on reconnect, and connecting twice never duplicates
  listeners, children, or loops.
- The element works however it was created: parsed with the page,
  inserted with `innerHTML`, built with `createElement` with attributes
  set in any order, or upgraded after its children already exist.

## 8. Verified in every engine

Each stable element has browser tests (`test/browser/`, Playwright) that
run in Chromium, Firefox, and WebKit, covering its attributes, events,
keyboard support, form behavior, and lifecycle. Fast `happy-dom` tests
(`test/*.test.mjs`) cover the logic and utilities.
