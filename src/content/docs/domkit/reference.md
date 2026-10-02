---
title: "Reference"
description: "Every domkit element's attributes, properties, methods, events, and CSS custom properties, generated from the code."
sidebar:
  order: 3
---

<!-- Generated: copied from domkit's docs/reference.md, which is generated from custom-elements.json. Re-copy it when domkit changes. -->

Every stable element's attributes, properties, methods, events, and CSS custom properties, generated from the code. Each element's guide (linked) explains how to use it.

## `<attribute-cycler>`

A persisted attribute or class switch (e.g. a theme toggle) driven by buttons. [Guide](https://github.com/johnhenry/domkit/blob/main/src/cyclable/attribute-cycler/readme.md) · module `@johnhenry/domkit/cyclable/attribute-cycler`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `values` | `values` | `string` | Comma-separated values to cycle through. An empty entry means "none": no class, or no attribute. |
| `attribute` | `attribute` | `string` | The attribute to set on the targets. Default `class`, where the value is one class among the target's others; any other attribute gets the value as its whole value. |
| `target` |  | `string` | Selector for the element(s) whose attribute is set. Default `html`. |
| `storage-key` | `storageKey` | `string` | localStorage key to persist under. Without it, the value isn't persisted. |
| `value` | `value` | `string` | The current value. Reflects; set it to choose the initial value when nothing is stored. |
| `disabled` | `disabled` | `boolean` | Its buttons are disabled, and invoker commands are ignored. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `values` (read-only) | `string[]` | The values to cycle through, in order. |
| `attribute` | `string` | The attribute set on the targets. Mirrors the `attribute` attribute. |
| `value` | `string` | The current value. Setting it applies and persists it, without an event. |
| `targets` (read-only) | `Element[]` | The elements whose attribute is set. |
| `disabled` | `boolean` | Mirrors the `disabled` attribute. |
| `storageKey` | `string` | Mirrors the `storage-key` attribute. |

**Methods**

| Method | Description |
|---|---|
| `next()` | Move to the next value (wrapping), without an event. |
| `previous()` | Move to the previous value (wrapping), without an event. |

**Events**

| Event | Description |
|---|---|
| `change` | The user changed the value with a button or command. |

## `<attribute-provider>`

Add classes, styles, and attributes to children by media query. [Guide](https://github.com/johnhenry/domkit/blob/main/src/matchable/attribute-provider/readme.md) · module `@johnhenry/domkit/matchable/attribute-provider`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `classes` |  | `string` | `[media query] class class \| …` sections. Bracket-less sections always apply. |
| `styles` |  | `string` | `[media query] property: value; … \| …` sections. |
| `attributes` |  | `string` | `[media query] name=value; name; name=null \| …` sections. `null` removes the attribute while the query matches. |
| `container` |  | `string` | Container mode: evaluate the queries against an element's size instead of the viewport. Empty = the parent element; otherwise a selector for the closest matching ancestor. |

## `<code-color>`

Syntax highlighting that never touches your markup. [Guide](https://github.com/johnhenry/domkit/blob/main/src/code-color/readme.md) · module `@johnhenry/domkit/code-color`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `language` | `language` | `string` | `js`, `css`, or `html` (plus aliases like `javascript`, `ts`, `json`, `xml`). Default: a `language-*` class on a `<code>` inside, else `html`. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `resolvedLanguage` (read-only) | `string \| null` | The language in effect: `js`, `css`, `html`, or null if unrecognized. |
| `language` | `string` | Mirrors the `language` attribute. |

**Methods**

| Method | Description |
|---|---|
| `tokens()` | The current token ranges, by type (for tests and tooling). |

## `<define-component>`

Register a custom element in HTML, from a module or from inline markup. [Guide](https://github.com/johnhenry/domkit/blob/main/src/definable/define-component/readme.md) · module `@johnhenry/domkit/definable/define-component`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `name` |  | `string` | The tag name to register. |
| `src` |  | `string` | URL of a module exporting the element class, resolved against the document's base URL. Not allowed with inline markup. |
| `import` |  | `string` | With `src`: the name of the export to register. Default `default`. |
| `content` |  | `string` | Inline markup, if there's no `<template>` child. Not allowed with `src`. |
| `mode` |  | `string` | With inline markup: `open` (default) or `closed` shadow root, or `none` to append the markup as light DOM. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `ready` (read-only) | `Promise<CustomElementConstructor>` | Resolves with the registered class once the element is defined; rejects if it couldn't be. |

**Events**

| Event | Description |
|---|---|
| `load` | The element is registered (or the name already was). |
| `error` | No source or two sources, an invalid name or mode, or (with `src`) the module failed to load, lacked the export, or the export isn't a class. An `ErrorEvent`. |

## `<drill-menu>`

A list that drills into sub-screens and back. [Guide](https://github.com/johnhenry/domkit/blob/main/src/drill-menu/readme.md) · module `@johnhenry/domkit/drill-menu`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `screen` | `screen` | `string` | Key of the screen currently shown (absent = the list). Reflects; set it to navigate. |
| `disabled` | `disabled` | `boolean` | Items can't be activated, leave the tab order, and are marked aria-disabled. `push()`/`pop()` still work from script. |
| `sync-hash` | `syncHash` | `boolean` | Mirror the current screen in `location.hash`, so links and the browser's Back button work. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `items` (read-only) | `Element[]` | The items: element children other than templates and the screen. |
| `screen` | `string \| null` | Key of the open screen, or null. Setting it navigates. |
| `disabled` | `boolean` | Mirrors the `disabled` attribute. |
| `syncHash` | `boolean` | Mirrors the `sync-hash` attribute. |

**Methods**

| Method | Description |
|---|---|
| `push(key, options)` | Show the screen of the item with this key (its `data-key`, or its position). Items without a template are leaves and can't be pushed. |
| `pop(options)` | Return to the list, restoring focus to the item that opened the screen. |

**Events**

| Event | Description |
|---|---|
| `push` | A screen was shown. `event.detail` is `{ key, item }`. |
| `pop` | The menu returned to the list. `event.detail` is `{ key, item }` for the screen that closed. |

## `<frame-timer>`

A frame-paced ticking clock with play/pause. [Guide](https://github.com/johnhenry/domkit/blob/main/src/frame-timer/readme.md) · module `@johnhenry/domkit/frame-timer`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `paused` | `paused` | `boolean` | Whether the timer is paused. Reflects; write it in markup to start paused. |
| `fps` | `fps` | `number` | Ticks per second. Default 60. Any positive number up to the display's refresh rate. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `fps` | `number` | Ticks per second. |
| `paused` (read-only) | `boolean` | Whether the timer is paused. |
| `ticks` | `number` | Ticks fired since the element was created (pausing keeps the count). |

**Methods**

| Method | Description |
|---|---|
| `play()` | Start or resume ticking. |
| `pause()` | Stop ticking (the count is kept). |

**Events**

| Event | Description |
|---|---|
| `play` | The timer started (or resumed). |
| `pause` | The timer paused. |
| `tick` | Once per period while playing. Read `ticks` for the count. |

## `<hot-key>`

Toggle a native dialog or popover, or run an invoker command, with a keyboard shortcut. [Guide](https://github.com/johnhenry/domkit/blob/main/src/hot-key/readme.md) · module `@johnhenry/domkit/hot-key`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `hotkey` | `hotkey` | `string` | One or more space-separated shortcuts, e.g. `mod+k /`. `mod` is ⌘ on Apple platforms and Ctrl elsewhere. |
| `commandfor` |  | `string` | The id of an element to send `command` to, as on a `<button>`. Without it, the shortcut toggles the `<dialog>` or popover inside. |
| `command` | `command` | `string` | With `commandfor`: the command to run, a built-in one (`show-modal`, `close`, `request-close`, `show-popover`, `hide-popover`, `toggle-popover`) or a custom `--name` (dispatched as a `command` event). |
| `non-modal` | `nonModal` | `boolean` | Open a dialog with `show()` instead of `showModal()`. |
| `disabled` | `disabled` | `boolean` | The shortcut does nothing. The dialog or popover itself is unaffected. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `target` (read-only) | `HTMLElement \| null` | The `<dialog>` or popover this element opens and closes: its first `<dialog>` or `[popover]` descendant. |
| `dialog` (read-only) | `HTMLDialogElement \| null` | The `<dialog>` this element controls, if its target is one. |
| `command` | `string` | Mirrors the `command` attribute. |
| `commandForElement` | `Element \| null` | The element `commandfor` names, like a button's `commandForElement`. |
| `hotkey` | `string` | Mirrors the `hotkey` attribute. |
| `disabled` | `boolean` | Mirrors the `disabled` attribute. |
| `nonModal` | `boolean` | Mirrors the `non-modal` attribute. |
| `open` (read-only) | `boolean` | Whether the dialog or popover is open. |

**Methods**

| Method | Description |
|---|---|
| `show()` | Open the dialog (modally, unless `non-modal`) or popover. |
| `close(returnValue)` | Close the dialog or popover. |
| `toggle()` | Open the dialog or popover if it's closed, close it if it's open. |
| `runCommand()` | Run `command` on the `commandfor` element, as a button would. Returns false if there's no such element or command. |

## `<infinite-combo-box>`

An accessible autocomplete with paged ("infinite") results. [Guide](https://github.com/johnhenry/domkit/blob/main/src/infinite-combo-box/readme.md) · module `@johnhenry/domkit/infinite-combo-box`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `placeholder` |  | `string` | Placeholder for the input. |
| `disabled` | `disabled` | `boolean` | Blocks interaction and form submission. Also inherited from a disabled fieldset. |
| `required` | `required` | `boolean` | The form is invalid until there's a value. |
| `open` | `open` | `boolean` | Whether the option list is showing. Reflects. |
| `value` | `value` | `string` | Initial value (the value of an option, or text with `allow-custom`). |
| `src` | `src` | `string` | URL template for remote options: `{query}` and `{cursor}` are replaced (missing ones are added as `?q=`/`?cursor=`). JSON (an array, or `{ options, next, total }`) or HTML (with an optional `data-next` element). |
| `inline` |  | `boolean` | Render the list in normal flow under the input, instead of as a floating popup in the top layer. |
| `name` | `name` | `string` | Name submitted with the form. |
| `debounce` |  | `number` | Milliseconds to wait after typing before searching. Default 0 for local options, 200 for `src`/`searchFunction`. |
| `page-size` |  | `number` | Show the element's own matching options this many at a time, loading more as the list scrolls. |
| `min-length` |  | `number` | Characters needed before searching. Default 0. |
| `allow-custom` | `allowCustom` | `boolean` | Typed text is a valid value even if it matches no option. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `value` | `string` | The current value: the chosen option's value, or the typed text with `allow-custom`. Setting it chooses the matching option (by value, then by label). Script changes don't fire events. |
| `text` | `string` | The text in the input. |
| `options` (read-only) | `Element[]` | The options currently in the list. |
| `hasMore` (read-only) | `boolean` | Whether the source has more results for the current query. |
| `selectedOption` (read-only) | `Element \| null` | The chosen option element, if it's in the list. |
| `selectedOptions` (read-only) | `Element[]` | The chosen option as a list (0 or 1 items), like a select's. |
| `selectedIndex` | `number` | Index of the chosen option among the options now in the list, or -1. Setting it chooses that option (-1 clears the value). Script changes don't fire events. |
| `length` (read-only) | `number` | Number of options now in the list. |
| `input` (read-only) | `HTMLInputElement \| null` | The inner `<input>` (generated, or the one you wrote as a child). |
| `searchFunction` | `((query: string, init: { signal: AbortSignal, cursor: string }) => unknown) \| null` | A function that produces options for a query, instead of filtering the child `<option>`s or fetching `src`: `async (query, { signal }) =>` an HTML string, an array of strings / `{ value, label }` / Nodes, or a Node. `signal` aborts when a newer search starts. To page results, return `{ options, next, total? }`: `next` is the cursor passed back as `cursor` for the following page (null when there are no more). |
| `open` | `boolean` | Mirrors the `open` attribute. |
| `name` | `string` | Mirrors the `name` attribute. |
| `src` | `string` | Mirrors the `src` attribute. |
| `allowCustom` | `boolean` | Mirrors the `allow-custom` attribute. |
| `disabled` | `boolean` | Mirrors the `disabled` attribute. |
| `required` | `boolean` | Mirrors the `required` attribute. |
| `form` (read-only) | `HTMLFormElement \| null` |  |
| `labels` (read-only) | `NodeList` |  |
| `validity` (read-only) | `ValidityState` |  |
| `validationMessage` (read-only) | `string` |  |
| `willValidate` (read-only) | `boolean` |  |
| `strings` | `Record<string, string \| Record<string, string>>` | The strings this element shows and announces (see DEFAULT_STRINGS). Setting it merges your values over the defaults, so you only pass the ones you change. |

**Methods**

| Method | Description |
|---|---|
| `loadMore()` | Load the next page of results for the current query (what scrolling to the end of the list does). Resolves when it's appended. |
| `item(index)` | The option at `index` in the list. |
| `checkValidity()` |  |
| `reportValidity()` |  |
| `setCustomValidity(message)` |  |
| `focus(options)` | Focus the input. |

**Events**

| Event | Description |
|---|---|
| `error` |  |
| `input` | The user changed the value (chose an option, or typed with `allow-custom`). |
| `change` | The user committed a new value (chose an option, or left the field after typing with `allow-custom`). |
| `toggle` | The list opened or closed (a ToggleEvent with `oldState`/`newState`, like a popover). |

**CSS custom properties**

| Property | Description |
|---|---|
| `--domkit-highlight` | Background of the active option (shared token; see theme.css). |
| `--domkit-surface` | Background of the popup list (shared token). |

## `<polyfill-window>`

Load a module's export onto window, in HTML. [Guide](https://github.com/johnhenry/domkit/blob/main/src/definable/polyfill-window/readme.md) · module `@johnhenry/domkit/definable/polyfill-window`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `name` |  | `string` | The global to assign (`window[name]`). |
| `src` |  | `string` | URL of the module, resolved against the document's base URL. |
| `import` |  | `string` | Name of the export to assign. Default `default`. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `ready` (read-only) | `Promise<unknown>` | Resolves with the global's value once it's in place. |

**Events**

| Event | Description |
|---|---|
| `error` | The module failed to load or lacked the export. An `ErrorEvent`. |
| `load` | The global is in place (assigned now, or already there). |

## `<query-container>`

Swap the element wrapping some content by media query. [Guide](https://github.com/johnhenry/domkit/blob/main/src/matchable/query-container/readme.md) · module `@johnhenry/domkit/matchable/query-container`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `default` |  | `string` | Wrapper when no query matches, as a simple selector (`ul`, `ol.steps`, `div#x[data-y=z]`). Defaults to the first section's. |
| `query` |  | `string` | `[media query] selector` sections separated by `\|`. The last matching section wins. |
| `container` |  | `string` | Container mode: evaluate the queries against an element's size instead of the viewport. Empty = the parent element; otherwise a selector for the closest matching ancestor. |

**Methods**

| Method | Description |
|---|---|
| `setInitial(selector)` |  |
| `setQueries(queries)` |  |
| `triggerQuery()` |  |
| `update()` |  |

## `<stylable-select>`

A fully stylable listbox that works like a native select. [Guide](https://github.com/johnhenry/domkit/blob/main/src/stylable-select/readme.md) · module `@johnhenry/domkit/stylable-select`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `disabled` | `disabled` | `boolean` | Blocks interaction and form submission. Also inherited from a disabled fieldset. |
| `required` | `required` | `boolean` | The form is invalid until an option is selected. |
| `multiple` | `multiple` | `boolean` | Allow selecting more than one option. |
| `size` | `size` | `number` | Number of visible rows (sets `--domkit-select-size`, used by index.css). |
| `name` | `name` | `string` | Name submitted with the form. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `options` (read-only) | `Element[]` | Every option, in document order (including those in groups). |
| `selectedOptions` (read-only) | `Element[]` | The selected options. |
| `selectedOption` (read-only) | `Element \| null` | The first selected option, or null (like infinite-combo-box's). |
| `selectedIndex` | `number` | Index of the first selected option, or -1. Setting it selects only that option. Script changes don't fire events. |
| `value` | `string` | Value of the first selected option, or "". Setting it selects the first option with that value (or nothing, if none matches). |
| `length` (read-only) | `number` | Number of options. |
| `type` (read-only) | `string` | "select-one" or "select-multiple", like a native select. |
| `name` | `string` | Mirrors the `name` attribute. |
| `multiple` | `boolean` | Mirrors the `multiple` attribute. |
| `disabled` | `boolean` | Mirrors the `disabled` attribute. |
| `required` | `boolean` | Mirrors the `required` attribute. |
| `size` | `number` | Mirrors the `size` attribute. |
| `form` (read-only) | `HTMLFormElement \| null` | The form this element belongs to. |
| `labels` (read-only) | `NodeList` | Labels associated with this element. |
| `validity` (read-only) | `ValidityState` |  |
| `validationMessage` (read-only) | `string` |  |
| `willValidate` (read-only) | `boolean` |  |

**Methods**

| Method | Description |
|---|---|
| `item(index)` | The option at `index`. |
| `checkValidity()` |  |
| `reportValidity()` |  |
| `setCustomValidity(message)` |  |

**Events**

| Event | Description |
|---|---|
| `input` | The user changed the selection. |
| `change` | The user changed the selection (fired right after `input`, like a native select). |

**CSS custom properties**

| Property | Description |
|---|---|
| `--domkit-select-size` | Visible rows, from the `size` attribute. |
| `--domkit-highlight` | Background of selected options (shared token; see theme.css). |
| `--domkit-focus-ring` | Focus outline (shared token). |

## `<tabbed-ui>`

Accessible tabs and panels from plain children. [Guide](https://github.com/johnhenry/domkit/blob/main/src/tabbed-ui/readme.md) · module `@johnhenry/domkit/tabbed-ui`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `selected-index` | `selectedIndex` | `number` | Index of the selected tab. Reflects the current selection. |
| `manual` | `manual` | `boolean` | Arrow keys move focus only; Enter/Space selects (manual activation). |
| `disabled` | `disabled` | `boolean` | No tab can be selected by the user, and the tabs leave the tab order. Panels stay as they are. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `disabled` | `boolean` | Mirrors the `disabled` attribute. |
| `tabList` (read-only) | `Element \| null` | The tab list: the child with role="tablist", else the first element child. |
| `tabs` (read-only) | `Element[]` | The tabs, in order. |
| `panels` (read-only) | `Element[]` | The panels, in order (every element child except the tab list). |
| `selectedIndex` | `number` | Index of the selected tab. Setting it does not fire `change`. |
| `manual` | `boolean` | With `manual`, arrow keys move focus and Enter/Space selects. |

**Events**

| Event | Description |
|---|---|
| `change` | The user selected a different tab (click or keyboard). Not fired for script changes. |

**CSS custom properties**

| Property | Description |
|---|---|
| `--domkit-tab-gap` | Space between tabs (index.css). |
| `--domkit-tab-padding` | Padding inside each tab (index.css). |
| `--domkit-accent` | Selected-tab indicator (shared token; see theme.css). |
| `--domkit-border` | Line under the tab list (shared token). |
| `--domkit-focus-ring` | Focus outline of tabs and panels (shared token). |
