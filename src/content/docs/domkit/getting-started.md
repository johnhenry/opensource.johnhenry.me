---
title: "Getting started"
description: "Build a small page with domkit, one step at a time: add an element, style it, react to it, put it in a form, and add a theme switch."
sidebar:
  order: 1
---

In this tutorial you'll build a small settings page from plain HTML: tabs,
a stylable list in a form, and a theme switch. You need a text editor and a
browser. There's nothing to install.

## 1. One element, one script tag

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My settings</title>
    <script type="module" src="https://esm.sh/@johnhenry/domkit/tabbed-ui/global.mjs"></script>
  </head>
  <body>
    <tabbed-ui>
      <div>
        <button>Profile</button>
        <button>Appearance</button>
      </div>
      <section>Profile settings go here.</section>
      <section>Appearance settings go here.</section>
    </tabbed-ui>
  </body>
</html>
```

Open it in a browser (any static server works; module scripts don't load
from `file://`). Click the tabs, then click one and use <kbd>←</kbd>
<kbd>→</kbd>. The first child became the tab list, the other children
became panels, and the keyboard support and ARIA roles were added for you.
Notice what you *didn't* write: no ids, no `role`s, no script.

## 2. Style it with ordinary CSS

Add domkit's optional stylesheet, and adjust it with a custom property:

```html
<link rel="stylesheet" href="https://esm.sh/@johnhenry/domkit/tabbed-ui/index.css" />
<style>
  tabbed-ui { --domkit-tab-accent: rebeccapurple; }
</style>
```

The selected tab now has an underline, and it's purple. Everything is in
the light DOM, so any selector works: `[role="tab"][aria-selected="true"]`
is the selected tab, and hidden panels carry the `hidden` attribute.

## 3. React to it like a native element

Add an id, and listen for `change`, the same event a `<select>` fires:

```html
<tabbed-ui id="tabs"> … </tabbed-ui>
<script type="module">
  document.getElementById("tabs").addEventListener("change", (event) => {
    console.log("now showing tab", event.target.selectedIndex);
  });
</script>
```

Click a tab and check the console. Then try
`document.getElementById("tabs").selectedIndex = 1` in the console: the
tab switches, but no `change` is logged. Like native controls, domkit
elements only fire `change` for things the user did.

## 4. Put it in a form

Replace the Appearance panel's text with a form containing a
`<stylable-select>`, and load its script and stylesheet:

```html
<script type="module" src="https://esm.sh/@johnhenry/domkit/stylable-select/global.mjs"></script>
<link rel="stylesheet" href="https://esm.sh/@johnhenry/domkit/stylable-select/index.css" />
```

```html
<section>
  <form id="appearance">
    <label for="font">Font size</label>
    <stylable-select id="font" name="font-size" required>
      <option value="small">Small</option>
      <option value="medium" selected>Medium</option>
      <option value="large">Large</option>
    </stylable-select>
    <button>Save</button>
  </form>
</section>
<script type="module">
  document.getElementById("appearance").addEventListener("submit", (event) => {
    event.preventDefault();
    console.log(Object.fromEntries(new FormData(event.target)));
  });
</script>
```

Choose a size and press Save: the console shows `{ "font-size": "large" }`.
The element submitted its value like a native control. Its `<label>`
names it for screen readers, and `required`, `form.reset()`, and
`<fieldset disabled>` all work too. Style the options however you like,
for example `option:checked { font-weight: bold }`.

## 5. Add a theme switch

One more element, and no script at all:

```html
<script type="module" src="https://esm.sh/@johnhenry/domkit/cyclable/class-cycler/global.mjs"></script>
<style>
  :root { color-scheme: light dark; }
  html.light { color-scheme: light; }
  html.dark { color-scheme: dark; }
</style>

<class-cycler target="html" classes="system,light,dark" storage-key="theme">
  <button value="system">System</button>
  <button value="light">Light</button>
  <button value="dark">Dark</button>
</class-cycler>
```

Pick Dark and reload: the choice is remembered. Open the page in a second
tab and switch themes in one of them, and the other follows. The buttons
get `aria-pressed`, so they read as a toggle group.

## What you built

A tabbed settings page with a stylable form control and a persistent theme
switch, written as HTML. Each element behaved like a built-in one: it was
styled with CSS, read and set through properties, reported changes with
native events, and took part in the form. That's the contract every domkit
element keeps (see [Principles](/domkit/principles/)).

Next:

- [Recipes](/domkit/recipes/): complete pages combining more elements,
  such as a command palette or a settings panel with drill-down screens.
- [Reference](/domkit/reference/): every attribute, property, and event.
