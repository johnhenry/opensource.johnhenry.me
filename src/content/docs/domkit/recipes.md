---
title: "Recipes"
description: "How to build a theme switcher, a command palette, a multi-screen settings form, a documentation page, and a game loop with domkit."
sidebar:
  order: 2
---

Each recipe is a complete page in the repo's
[`examples/`](https://github.com/johnhenry/domkit/tree/main/examples)
directory, written as plain HTML, and each is covered by a browser test.
Below are the essential parts. Run them locally with `npm run serve` in a
clone of the repo, then open `http://localhost:4719/examples/`.

## Theme switcher

**Goal:** light, dark, or system, remembered across visits and synced
across tabs. [Full page](https://github.com/johnhenry/domkit/blob/main/examples/theme-switcher.html)

```html
<class-cycler id="theme" target="html" classes="system,light,dark" storage-key="theme">
  <button type="button" value="system">System</button>
  <button type="button" value="light">Light</button>
  <button type="button" value="dark">Dark</button>
  <p>Current: <output></output></p>
</class-cycler>
<!-- anywhere else on the page -->
<button commandfor="theme" command="--next">Next theme</button>
```

```css
:root { color-scheme: light dark; }
html.light { color-scheme: light; }
html.dark { color-scheme: dark; }
```

Value buttons get `aria-pressed`, `<output>` shows the value, and invoker
commands let any button drive the switch.

## Command palette

**Goal:** <kbd>⌘K</kbd> opens a searchable list of commands.
[Full page](https://github.com/johnhenry/domkit/blob/main/examples/command-palette.html)

```html
<hotkey-dialog hotkey="mod+k /">
  <dialog id="palette-dialog" closedby="any" aria-label="Command palette">
    <infinite-combo-box id="palette" aria-label="Command" inline>
      <input autofocus placeholder="Type a command…" />
      <option value="top">Scroll to top</option>
      <option value="dark">Switch to dark theme</option>
    </infinite-combo-box>
  </dialog>
</hotkey-dialog>
```

```js
palette.addEventListener("change", () => {
  commands[palette.value]?.();
  document.getElementById("palette-dialog").close();
  palette.value = "";
});
```

The dialog stays native (focus trap, `::backdrop`, Esc). `closedby="any"`
gives light dismiss, polyfilled where needed. `mod` means ⌘ on Apple
platforms and Ctrl elsewhere. `inline` keeps the results in the dialog's
flow; without it, the list floats above the page like a native picker.

## Settings panel across screens

**Goal:** one form split into drill-down screens, where every control
submits, resets, and validates like a native one.
[Full page](https://github.com/johnhenry/domkit/blob/main/examples/settings-panel.html)

```html
<form>
  <drill-menu>
    <button type="button" data-key="profile">Profile</button>
    <button type="button" data-key="region">Language &amp; region</button>

    <section data-screen="profile">
      <label for="name">Display name</label>
      <input id="name" name="name" required />
      <button type="button" data-back>‹ Back</button>
    </section>

    <section data-screen="region">
      <label for="language">Language</label>
      <stylable-select id="language" name="language">
        <option value="en" selected>English</option>
        <option value="fr">Français</option>
      </stylable-select>
      <label for="tz">Time zone</label>
      <infinite-combo-box id="tz" name="timezone" value="Europe/London">
        <option>Europe/London</option>
        <option>Asia/Tokyo</option>
      </infinite-combo-box>
      <button type="button" data-back>‹ Back</button>
    </section>
  </drill-menu>
  <button>Save</button> <button type="reset">Reset</button>
</form>
```

Live `data-screen` sections keep their values as you move between
screens, and their fields submit with the form. If a required field in a
hidden screen is empty when the form is submitted, `drill-menu` opens that
screen so the browser can show its message.

## Documentation page

**Goal:** tabbed, highlighted code samples, and steps that adapt to the
screen. [Full page](https://github.com/johnhenry/domkit/blob/main/examples/documentation-page.html)

```html
<tabbed-ui>
  <div><button>HTML</button><button>JS</button></div>
  <code-color><pre><code class="language-html">…</code></pre></code-color>
  <code-color><pre><code class="language-js">…</code></pre></code-color>
</tabbed-ui>

<query-container default="ul" query="[(min-width: 640px)] ol.steps">
  <li>Add a script tag.</li>
  <li>Write the markup.</li>
</query-container>
```

`code-color` reads the `language-*` class that Markdown renderers emit,
so existing docs output works unchanged. The text is never modified,
because highlighting uses the CSS Custom Highlight API.

## Game loop

**Goal:** an animation loop with play/pause, without writing the loop.
[Full page](https://github.com/johnhenry/domkit/blob/main/examples/game-loop.html)

```html
<frame-timer id="clock" fps="60"></frame-timer>
<button onclick="clock.paused ? clock.play() : clock.pause()">Play/pause</button>
<script type="module">
  clock.addEventListener("tick", () => step()); // your physics
</script>
```

The clock rests while the tab is hidden, and skips the backlog when the
tab comes back instead of firing a burst.
