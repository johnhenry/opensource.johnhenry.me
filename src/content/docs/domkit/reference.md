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
| `reset()` | Forget the stored value and go back to the default (the `value` attribute as first written, or the first value), without an event. |

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

**Properties**

| Property | Type | Description |
|---|---|---|
| `activeQueries` (read-only) | `string[]` | The media (or container) queries that currently match, across `classes`, `styles`, and `attributes`, without duplicates. |

**Events**

| Event | Description |
|---|---|
| `change` | A query started or stopped matching (the viewport or container changed), so `activeQueries` changed and the children were updated. |

## `<chernoff-face>`

A face whose features show data: each is a number from 0 to 1. [Guide](https://github.com/johnhenry/domkit/blob/main/src/chernoff-face/readme.md) · module `@johnhenry/domkit/chernoff-face`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `face-width` |  | `number` | 0 narrow … 1 wide. Default 0.5, like every feature. |
| `eye-size` |  | `number` | 0 small … 1 large eyes. |
| `eye-spacing` |  | `number` | 0 close … 1 far-apart eyes. |
| `pupil-size` |  | `number` | 0 small … 1 large pupils. |
| `gaze` |  | `number` | 0 looking left … 1 looking right. |
| `brow-slant` |  | `number` | 0 angry … 1 worried brows. |
| `nose-length` |  | `number` | 0 short … 1 long nose. |
| `mouth-width` |  | `number` | 0 narrow … 1 wide mouth. |
| `smile` |  | `number` | 0 frown … 1 smile. |
| `mouth-open` |  | `number` | 0 closed … 1 open mouth. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `features` | `Record<string, number>` | Every feature's current value (0–1), keyed in camelCase (`{ eyeSize: 0.5, smile: 0.9, … }`). Setting it writes the matching attributes; keys you leave out are unchanged. |

**CSS custom properties**

| Property | Description |
|---|---|
| `--domkit-face-fill` | Fill of the face (index.css). |
| `--domkit-face-stroke` | Line color (index.css; defaults to currentColor). |

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

## `<draw-svg>`

Self-drawing SVG strokes, CSP-safe and reduced-motion aware. [Guide](https://github.com/johnhenry/domkit/blob/main/src/draw-svg/readme.md) · module `@johnhenry/domkit/draw-svg`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `duration` |  | `string` | How long each shape takes to draw: `2s`, `400ms`, or milliseconds. Default `2s`. |
| `delay` |  | `string` | Wait before the first shape starts. Default `0`. |
| `stagger` |  | `string` | Extra delay for each next shape, so they draw one after another. Default `0` (together). |
| `easing` |  | `string` | A CSS easing function. Default `ease-in-out`. |
| `iterations` |  | `string` | How many times to draw: a number or `infinite`. Default `1`. |
| `direction` |  | `string` | `normal`, `reverse`, `alternate`, or `alternate-reverse`, as in CSS animations. |
| `erase` |  | `boolean` | After drawing in, keep going until the stroke has wiped itself out from its start. |
| `select` |  | `string` | Which shapes to animate, as a selector. Default: every path, line, polyline, polygon, circle, ellipse, and rect. |
| `paused` | `paused` | `boolean` | Whether it's paused. Reflects; write it in markup to start paused (strokes hidden). |
| `start` |  | `string` | `visible`: wait to play until the drawing scrolls into view. Default: play on connect. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `paused` (read-only) | `boolean` | Whether it's paused. |
| `shapes` (read-only) | `SVGGeometryElement[]` | The shapes being animated. |

**Methods**

| Method | Description |
|---|---|
| `play()` | Start or resume drawing. |
| `pause()` | Pause where it is. |
| `restart()` | Draw again from the start (and play, unless paused). |

**Events**

| Event | Description |
|---|---|
| `play` | It started or resumed. |
| `pause` | It paused. |
| `ended` | Every shape finished drawing (not for `iterations="infinite"`). Invoker commands: `--play`, `--pause`, `--toggle`, and `--restart` (`<button commandfor="logo" command="--restart">`). |

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
| `pause` | The timer paused. Invoker commands: `--play`, `--pause`, and `--toggle` (`<button commandfor="clock" command="--toggle">`). |
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

## `<pixel-adjust>`

A pixel effect: brightness, contrast, saturation, and hue. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-adjust/readme.md) · module `@johnhenry/domkit/pixelable/pixel-adjust`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `brightness` |  | `number` | Multiplier: 1 is unchanged, 0 is black. Default 1. |
| `contrast` |  | `number` | Multiplier around mid-gray: 1 is unchanged, 0 is flat gray. Default 1. |
| `saturation` |  | `number` | Multiplier: 1 is unchanged, 0 is grayscale. Default 1. |
| `hue` |  | `number` | Rotation in degrees. Default 0. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-canvas>`

Pixel effects on any image, video, canvas, or pixel sprite. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-canvas/readme.md) · module `@johnhenry/domkit/pixelable/pixel-canvas`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `width` | `width` | `number` | Working width in pixels: the source is scaled to it (keeping its aspect ratio) before the effects run. Smaller is faster and chunkier. Default: the source's own width. |
| `height` | `height` | `number` | Working height, if `width` isn't given. |
| `effects` | `effects` | `string` | Effects to apply, in order, like CSS `filter`: `mosaic(4) palette(gameboy, ordered) adjust(contrast 1.3)`. They run after any effect elements inside. |
| `swatches` | `swatches` | `number` | Publish the result's N most common colors as `--pixel-swatch-1` … `--pixel-swatch-N` custom properties (and the `palette` property). Default: none. |
| `swatches-target` | `swatchesTarget` | `string` | A selector for more elements to set those custom properties on (for example `html`, to theme the page). They're always set on the `<pixel-canvas>` itself. |
| `fps` |  | `number` | Redraw at this rate, so effects that change over time (`glitch`, `wave`, your own) animate even on a still image. Without it, it redraws only when something changes (or every frame of a playing video). |
| `paused` | `paused` | `boolean` | Stops the clock effects animate by, and the `fps` redraws. Reflects; write it in markup to start paused. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `time` (read-only) | `number` | Seconds on the clock that effects animate by. It runs while the element is connected and not paused (and, for visitors who prefer reduced motion, only once `play()` is called). |
| `paused` (read-only) | `boolean` | Whether the clock is paused. |
| `source` (read-only) | `Element \| null` | The image, video, canvas, or `<pixel-sprite>` being drawn: the first one inside. |
| `effectElements` (read-only) | `Element[]` | The effect elements wrapped around the source, in the order they run (innermost first). Disabled ones are included. |
| `effects` | `string` | Mirrors the `effects` attribute. |
| `swatches` | `number` | How many swatches to publish. Mirrors the `swatches` attribute. |
| `swatchesTarget` | `string` | Mirrors the `swatches-target` attribute. |
| `palette` (read-only) | `string[]` | With `swatches`: the result's most common colors, as `#rrggbb`, most common first. Empty otherwise. |
| `canvas` (read-only) | `HTMLCanvasElement` | The canvas showing the result (in the shadow root). |
| `width` | `number` | Mirrors the `width` attribute. |
| `height` | `number` | Mirrors the `height` attribute. |

**Methods**

| Method | Description |
|---|---|
| `play()` | Start or resume the clock (and the `fps` redraws). |
| `pause()` | Pause the clock where it is. |
| `render()` | Draw now, instead of on the next frame. Returns whether it drew. |
| `toBlob(type, quality)` | The result as an image file, like `HTMLCanvasElement.toBlob()`. |
| `toDataURL(type, quality)` | The result as a data: URL, like `HTMLCanvasElement.toDataURL()`. |

**Events**

| Event | Description |
|---|---|
| `play` | The clock started or resumed. |
| `pause` | The clock paused. |
| `load` | The first frame of a source was drawn. |
| `palettechange` | With `swatches`: the published colors changed. |
| `error` | The source can't be read (for example, a cross-origin image without CORS) or an effect threw: an `ErrorEvent`, and the original content is shown instead. Also fired, once per name, for an unknown effect in `effects`, which is skipped. |

## `<pixel-chroma-key>`

A pixel effect: make a color transparent (green screen). [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-chroma-key/readme.md) · module `@johnhenry/domkit/pixelable/pixel-chroma-key`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `color` |  | `string` | The color to remove, any CSS color. Default `lime`. |
| `tolerance` |  | `number` | How different a color can be and still be removed, 0–1. Default 0.3. |
| `softness` |  | `number` | A fade beyond the tolerance, 0–1, for smooth edges. Default 0.1. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-crt>`

A pixel effect: an old CRT screen. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-crt/readme.md) · module `@johnhenry/domkit/pixelable/pixel-crt`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `scanlines` |  | `number` | How much alternate rows are darkened, 0–1. Default 0.35. |
| `mask` |  | `number` | Strength of the color stripe mask, 0–1. Default 0.25. |
| `glow` |  | `number` | Overall brightness boost. Default 1.15. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-glitch>`

A pixel effect: animated digital glitches. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-glitch/readme.md) · module `@johnhenry/domkit/pixelable/pixel-glitch`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `amount` |  | `number` | How broken, 0 (none) to 1. Default 0.3. |
| `rate` |  | `number` | New glitches per second of the canvas clock. Default 8. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-grid>`

A pixel effect: grid lines between cells. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-grid/readme.md) · module `@johnhenry/domkit/pixelable/pixel-grid`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `size` |  | `number` | Cell size, in the working image's pixels. Default 8. |
| `color` |  | `string` | Line color, any CSS color (transparency blends). Default `rgb(0 0 0 / 0.35)`. |
| `line` |  | `number` | Line thickness in pixels. Default 1. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-halftone>`

A pixel effect: halftone dots, like print. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-halftone/readme.md) · module `@johnhenry/domkit/pixelable/pixel-halftone`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `size` |  | `number` | Cell size in pixels. Default 6. |
| `angle` |  | `number` | Grid angle in degrees. Default 45. |
| `ink` |  | `string` | Dot color, any CSS color, or `auto` for each cell's own color. Default black. |
| `paper` |  | `string` | Background color. Default white. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-mosaic>`

A pixel effect: pixelate into blocks of one color. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-mosaic/readme.md) · module `@johnhenry/domkit/pixelable/pixel-mosaic`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `size` |  | `number` | Block size, in the working image's pixels. Default 8. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-outline>`

A pixel effect: line art from edges. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-outline/readme.md) · module `@johnhenry/domkit/pixelable/pixel-outline`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `threshold` |  | `number` | Edge strength needed for a line, 0–1. Lower draws more lines. Default 0.2. |
| `ink` |  | `string` | Line color. Default black. |
| `paper` |  | `string` | Background color, or `none` to draw the lines over the image. Default white. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-palette>`

A pixel effect: limit colors to a palette, with dithering. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-palette/readme.md) · module `@johnhenry/domkit/pixelable/pixel-palette`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `colors` |  | `string` | A named palette (`1bit`, `gameboy`, `grayscale`, `cga`, `sepia`, `pico-8`), space-separated CSS colors, or `auto` (the image's own dominant colors). Default `1bit`. |
| `dither` |  | `string` | `none` (default), `floyd-steinberg` (error diffusion), or `ordered` (a 4×4 Bayer pattern). |
| `count` |  | `number` | With `colors="auto"`: how many colors to pick. Default 8. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `palette` (read-only) | `number[][]` | The resolved palette, as `[r, g, b]` triples. Empty for `auto`, which depends on the image (see `<pixel-canvas>`'s `palette`). |

## `<pixel-shader>`

A pixel effect written as a GLSL fragment shader, run on the GPU. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-shader/readme.md) · module `@johnhenry/domkit/pixelable/pixel-shader`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `disabled` |  | `boolean` | Pass the image through unchanged. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `source` (read-only) | `string` | The shader's code: the text of its `<script type="x-shader/x-fragment">` child. |

**Methods**

| Method | Description |
|---|---|
| `apply(image, context)` |  |

## `<pixel-sprite>`

Pixel art written as text, with animation frames. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-sprite/readme.md) · module `@johnhenry/domkit/pixelable/pixel-sprite`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `colors` |  | `string` | What each character means: `char color` pairs separated by `;` (`. transparent; # black; o gold`), or a named palette whose colors are numbered `0`–`9` then `a`–`z` (`pico-8`, the default; `gameboy`; `1bit`; …). `.` is transparent unless you say otherwise. |
| `fps` |  | `number` | Play the frames at this rate. Without it (or with one frame), it's still. |
| `paused` | `paused` | `boolean` | Whether the animation is paused. Reflects; write it in markup to start paused. |
| `alt` |  | `string` | A text alternative, as on `<img>`. An empty `alt` marks it decorative. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `canvas` (read-only) | `HTMLCanvasElement` | The canvas it's drawn on (in the shadow root), at one pixel per character. |
| `frames` (read-only) | `number` | How many frames there are. |
| `frame` | `number` | The frame showing, from 0. Setting it shows that frame (wrapping). |
| `paused` (read-only) | `boolean` | Whether the animation is paused. |
| `width` | `number` |  |
| `height` | `number` |  |

**Methods**

| Method | Description |
|---|---|
| `play()` | Play the frames (at `fps`). |
| `pause()` | Pause on the current frame. |

**Events**

| Event | Description |
|---|---|
| `play` | The animation started or resumed. |
| `pause` | The animation paused. |
| `framechange` | It was redrawn: the frame advanced, or its pixels or colors changed. |

**CSS custom properties**

| Property | Description |
|---|---|
| `--domkit-sprite-scale` | How many screen pixels each sprite pixel takes. Default 8. |

## `<pixel-wave>`

A pixel effect: an animated wave. [Guide](https://github.com/johnhenry/domkit/blob/main/src/pixelable/pixel-wave/readme.md) · module `@johnhenry/domkit/pixelable/pixel-wave`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `amplitude` |  | `number` | How far rows move, in pixels. Default 4. |
| `wavelength` |  | `number` | Rows per wave. Default 32. |
| `speed` |  | `number` | Waves per second on the canvas clock (negative reverses). Default 0.5. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

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
| `default` | `default` | `string` | Wrapper when no query matches, as a simple selector (`ul`, `ol.steps`, `div#x[data-y=z]`). Defaults to the first section's. |
| `query` | `query` | `string` | `[media query] selector` sections separated by `\|`. The last matching section wins. |
| `container` |  | `string` | Container mode: evaluate the queries against an element's size instead of the viewport. Empty = the parent element; otherwise a selector for the closest matching ancestor. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `default` | `string` | Mirrors the `default` attribute. |
| `query` | `string` | Mirrors the `query` attribute. |
| `activeQueries` (read-only) | `string[]` | The media (or container) queries that currently match, in the order they're written. |
| `wrapper` (read-only) | `Element \| null` | The element currently wrapping the children. |

**Events**

| Event | Description |
|---|---|
| `change` | A query started or stopped matching (the viewport or container changed), so `activeQueries` changed. The wrapper may have been swapped. |

## `<scatter-plot>`

A scatter plot of a point template, styled with ordinary CSS. [Guide](https://github.com/johnhenry/domkit/blob/main/src/scatter-plot/readme.md) · module `@johnhenry/domkit/scatter-plot`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `data` | `data` | `string` | JSON array of points: `[x, y]` pairs, or `{ x, y, … }` objects whose other keys become attributes on that point. |
| `x-min` |  | `number` | The x value at the left edge. Default: the smallest x, or 0 if that's positive. |
| `x-max` |  | `number` | The x value at the right edge. Default: the largest x. |
| `y-min` |  | `number` | The y value at the bottom edge. Default: the smallest y, or 0 if that's positive. |
| `y-max` |  | `number` | The y value at the top edge. Default: the largest y. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `data` | `Array<[number, number] \| { x: number, y: number, [attribute: string]: unknown }>` | The points. Setting it replots (and doesn't touch the `data` attribute, so it can hold values JSON can't). |
| `domain` (read-only) | `{ xMin: number, xMax: number, yMin: number, yMax: number }` | The plotted range, after defaults: `{ xMin, xMax, yMin, yMax }`. |
| `points` (read-only) | `Element[]` | The point elements now plotted, in data order. |

**Events**

| Event | Description |
|---|---|
| `error` | The `data` attribute isn't a JSON array. An `ErrorEvent`; the previous data stays plotted. |

**CSS custom properties**

| Property | Description |
|---|---|
| `--domkit-point-size` | Size of the default point (index.css). |
| `--domkit-accent` | Color of the default point (shared token; see theme.css). |

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
| `namedItem(name)` | The first option whose `id` or `name` is `name`, like a select's. |
| `add(element, before)` | Add an option or optgroup, like a select's `add()`: before `before` (an option element or an index), or at the end. Throws a `NotFoundError` if `before` is an element that isn't in this list. |
| `remove(index)` | With an index, remove that option, like a select's `remove(index)`. With no argument, remove this element itself, as on any element. |
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
| `disabled` | `disabled` | `boolean` | No tab can be selected by the user (or by commands), and the tabs leave the tab order. Panels stay as they are. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `disabled` | `boolean` | Mirrors the `disabled` attribute. |
| `tabList` (read-only) | `Element \| null` | The tab list: the child with role="tablist", else the first element child. |
| `tabs` (read-only) | `Element[]` | The tabs, in order. |
| `panels` (read-only) | `Element[]` | The panels, in order (every element child except the tab list). |
| `selectedIndex` | `number` | Index of the selected tab. Setting it does not fire `change`. |
| `manual` | `boolean` | With `manual`, arrow keys move focus and Enter/Space selects. |

**Methods**

| Method | Description |
|---|---|
| `next()` | Select the next enabled tab (wrapping), without an event. |
| `previous()` | Select the previous enabled tab (wrapping), without an event. |

**Events**

| Event | Description |
|---|---|
| `change` | The user selected a different tab (click, keyboard, or an invoker command). Not fired for script changes. |

**CSS custom properties**

| Property | Description |
|---|---|
| `--domkit-tab-gap` | Space between tabs (index.css). |
| `--domkit-tab-padding` | Padding inside each tab (index.css). |
| `--domkit-accent` | Selected-tab indicator (shared token; see theme.css). |
| `--domkit-border` | Line under the tab list (shared token). |
| `--domkit-focus-ring` | Focus outline of tabs and panels (shared token). |
