---
title: "code-editor"
description: "<code-editor>: an editable, syntax-highlighted code field that works like a <textarea>: form-associated, with a textarea's value, selection API, events and defaults, plus indent, auto-indent and auto-closed brackets on the native undo stack."
sidebar:
  order: 5
  label: "<code-editor>"
---

**`<code-editor>`** (module `@johnhenry/domkit/code-editor`, new in domkit 0.1.1) is an editable code field with syntax
highlighting for JavaScript, CSS and HTML that works like a `<textarea>`. It has a textarea's `value` and selection API,
submits with forms, and fires `input` and `change` at the same moments. On top of that it handles the keys you expect in
a code editor: Tab to indent, Enter to keep indentation, and auto-closed brackets and quotes. Every one of those edits
goes on the browser's own undo stack, so Ctrl/Cmd+Z undoes it like typing.

Highlighting is [`<code-color>`](/domkit/reference/#code-color)'s: the same tokenizer, the same `language` values and the same
`::highlight(domkit-*)` names, so one theme colors both. Each editor listens only to its own textarea and re-tokenizes
incrementally, so a page with hundreds of small editors stays cheap.

Every attribute, property, method and event is listed in the [Reference](/domkit/reference/); this page explains how
to use them.

## Usage

```html
<script type="module" src="https://esm.sh/@johnhenry/domkit/code-editor/global.mjs"></script>
<link rel="stylesheet" href="https://esm.sh/@johnhenry/domkit/code-editor/index.css" />

<form>
  <label for="code">Script</label>
  <code-editor id="code" name="code" language="js" rows="4">
<pre>function greet(name) {
  return `Hello, ${name}!`;
}</pre>
  </code-editor>
  <button>Save</button>
</form>
```

The initial text is the editor's content: a `<textarea>`, `<pre>` or `<code>` inside it, or plain text (with one leading
newline dropped, like a textarea). A `<pre>` (or the `<pre><code class="language-…">` a Markdown renderer emits) stays
readable before the script loads, and a `<textarea>` even stays editable; in either case write HTML escapes (`&lt;`) as
you normally would. A `value` attribute, if present, wins.

Read and write it like a textarea:

```js
import "@johnhenry/domkit/code-editor/global.mjs";

const editor = document.querySelector("code-editor");
editor.value = "console.log(1 + 1);"; // no events, like textarea.value
editor.addEventListener("input", () => preview(editor.value));
editor.setSelectionRange(0, 7);
```

## Forms

`<code-editor>` is form-associated, through `ElementInternals`. Inside a `<form>` it submits its value under `name`, a
`<label for>` labels it, and `form.reset()` restores `defaultValue` (the `value` attribute, else the initial text).
`required`, `disabled` (also inherited from a disabled `<fieldset>`) and `readonly` behave as on a textarea, and so do
`validity`, `checkValidity()`, `reportValidity()` and `setCustomValidity()`.

`input` fires when the user changes the value (typing, pasting, undo, or an editing key) and `change` when the field
loses focus with a different value than it had when it got focus. Both are fired from the element, so `event.target` is
the `<code-editor>`; they carry the textarea's `inputType` and `data`. Setting `value` or calling `setRangeText()` from
script fires nothing, as for a textarea.

## Defaults follow `<textarea>`

The element follows `<textarea>` wherever it can:

- **Height:** at least `rows` lines tall, default 2.
- **Wrapping:** long lines wrap when `wrap` is absent, `soft` or `hard`; `wrap="off"` scrolls them sideways.
- **Length and keyboard hints:** `maxlength`, `minlength`, `inputmode` and `enterkeyhint` are passed to the textarea
  and behave natively. Typing stops at `maxlength`, and `validity` reports `tooLong`/`tooShort` only for a value the
  user typed, as a textarea does.
- **`autofocus`** focuses the editor when it is first connected, if nothing else has focus.
- **Properties** mirror a textarea's: `maxLength`/`minLength` are `-1` when absent, `wrap` reflects the attribute as
  written (`""` when absent), `type` is `"textarea"`, and `textLength`, `selectionStart`, `selectionEnd`,
  `selectionDirection`, `setSelectionRange()`, `setRangeText()` and `select()` all work.

These are the deliberate exceptions:

- **It grows with its content.** A textarea stays at `rows` lines and scrolls; the editor treats `rows` as a minimum.
  Cap it with CSS and it scrolls, keeping the caret in view:

  ```css
  code-editor { max-height: 20lh; }
  ```

- **Spellcheck, autocapitalize, autocorrect and autocomplete are off by default**, because code isn't prose. Set any of
  them on the element (`spellcheck="true"`, `autocapitalize="sentences"`, …) and it is passed to the textarea.
- **`wrap="hard"` wraps like `soft`**, but the submitted value is not hard-wrapped (the element submits its value
  itself).
- **No `cols` or `dirname`.** Size it with CSS.
- **Tab indents.** Escape, then Tab, moves focus out (see [Keyboard](#keyboard)).

## Keyboard

| Key | Does |
|---|---|
| Tab | Insert spaces to the next tab stop; with a selection, indent every selected line |
| Shift+Tab | Outdent the current line, or every selected line |
| Escape, then Tab (or Shift+Tab) | Move focus out of the editor, like CodeMirror. Any other key in between cancels it |
| Enter | New line with the current indentation; one level more after `{`, `[` or `(`; between a pair (`{\|}`), split it onto three lines |
| `(` `[` `{` `'` `"` `` ` `` | Insert the pair (or wrap the selection in it). Quotes don't pair next to a word character, nor brackets in front of one. `no-auto-close` turns this off |
| `)` `]` `}` `'` `"` `` ` `` | Next to the same character, move over it instead. A closing bracket typed as a line's first character outdents the line |
| Backspace | Between an empty pair, delete both; in leading spaces, delete back to the previous tab stop |

`tab-size` (default 2) sets the spaces per indent level. Because Tab is captured for indenting, a keyboard user leaves
the editor with Escape then Tab (WCAG 2.1.2); mention it near the editor if your users may not know the convention.
With `readonly` or `disabled`, Tab moves focus as usual.

### Shortcuts are yours

The editor never claims a key with Ctrl or Cmd held, so those keyboard events reach the element and its ancestors
uncanceled. Listen on the element for your own shortcuts:

```js
editor.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    run(editor.value);
  }
});
```

To take over a key the editor *does* handle (say, Enter), listen in the capture phase and call `preventDefault()`: the
editor skips any keydown that's already canceled.

```js
editor.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault(); // the editor won't auto-indent
    submit();
  }
}, { capture: true });
```

## Styling

`index.css` (optional) gives the editor a monospace font, a border, padding, scrolling and a focus ring on the whole
element, from domkit's shared tokens (`--domkit-focus-ring`, `--domkit-border`). It imports code-color's token colors;
restyle them with `::highlight(domkit-keyword)` and friends, as for `<code-color>`. `rows` sets
`--domkit-code-editor-rows`.

Style the element itself (font, padding, border, background, height). The textarea and the mirror inside inherit its
font and line height and must keep identical box styles, so don't give either its own padding, border or font.

## Why a textarea

The editing surface is a real `<textarea>`: yours, if you put one inside, or one the element makes (`editor.textarea`).
Its own text is transparent; an `aria-hidden` `<pre>` laid exactly over it paints the same text with the highlight
ranges. A textarea is what gets caret, selection, IME composition, mobile keyboards, native undo, plain-offset
selection and screen-reader semantics right in all three engines; an editable `<pre>` differs by engine in what Enter,
paste and deleting a line insert. The cost is keeping the mirror's text, font and wrapping identical to the textarea's,
which the element does with inline layout styles, so it works with no stylesheet.

## Notes

- **Browser support:** Chromium, Firefox and Safari. Highlighting needs the CSS Custom Highlight API (Chromium,
  Safari 17.2+, Firefox 140+); without it code is shown uncolored and editing is unaffected.
- **Undo grouping follows the engine.** In Chromium each of the editor's edits is its own undo step; WebKit merges
  consecutive keyboard edits into one, as it does for its own typing.
- **Setting `value` from script clears the browser's undo history**, as it does for a textarea.
- **Some virtual keyboards and IME composition get plain textarea behavior.** The editing keys work on keyboards that
  report keys in `keydown`; IMEs that report `"Unidentified"` (some Android keyboards) get no auto-closing or
  auto-indent, and everything else works.
- **Only `input` and `change` come from the element.** Other events (`keydown`, `select`, `focusin`, `focusout`) come
  from the inner textarea and bubble through the element.
- **Find-in-page may count a match twice:** once in the textarea, once in the mirror that paints it.
- **The tokenizer is code-color's:** small, never throws, not a parser. TypeScript and JSON are colored as JavaScript.

The element's own guide, with the generated API tables, is
[`src/code-editor/readme.md`](https://github.com/johnhenry/domkit/blob/main/src/code-editor/readme.md) in the repo.
