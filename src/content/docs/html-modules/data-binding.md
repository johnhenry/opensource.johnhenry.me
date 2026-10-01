---
title: "Data binding and forms"
description: "{{attribute}} bindings and props in templates, escaping and the URL and on* guards, and form-associated components with form-associated and form-control."
sidebar:
  order: 4
---

## Data binding

Templates are static by default. `{{attribute}}` makes a template read its host element's attributes, and
`props="…"` on the export makes attributes reflect as typed properties:

```html
<html-export name="user-card" props="name count:number open:boolean">
  <template>
    <h3>{{name}}</h3>
    <a href="/users/{{name}}" title="{{ name }} ({{count}} posts)">profile</a>
    <button disabled="{{off}}">Follow</button>
  </template>
</html-export>
```

```html
<ui--user-card name="Ada" count="3"></ui--user-card>
<script>
  const card = document.querySelector('ui--user-card');
  card.count = 4;                    // reflects to count="4"; only the nodes that mention `count` are patched
  card.setAttribute('name', 'Grace');
</script>
```

- **No `eval`, no expression language, no `innerHTML`.** A binding is only ever an attribute name, so it works under a
  strict CSP and Trusted Types. `{{a + b}}` is a `SyntaxError`.
- **Escaping.** Text bindings set a text node's `data`: markup in a value is shown, not parsed. A URL attribute
  (`href`, `src`, `action`, …) refuses `javascript:` / `vbscript:` / HTML `data:` URLs (the attribute is removed).
  `on*`, `style` and `srcdoc` are never bound (a `SyntaxError` when the component is registered).
- **Efficient updates.** The template is stamped once; an attribute change patches only the bound nodes that mention
  it, so the shadow root's elements are never re-created.
- **Compiled output binds identically** (it passes `props` to the same runtime).
- **Non-goals.** No loops or conditionals (use a JS component for those), no two-way binding, no object-valued
  props, no bindings in `<template>` nested in a template, none in server-rendered roots. Details and the exact
  rules: [HTML syntax](/html-modules/api/html-syntax/#data-binding-in-templates).

See it live: `examples/data.html`. The errors a malformed `props` or binding raises are in
[Errors](/html-modules/api/errors/).

## Form-associated components

`form-associated` on an export makes the component a real form control (`static formAssociated` and
`ElementInternals`): it appears in `FormData` under its `name`, validates (`:invalid`, `required`,
`setCustomValidity()`), is disabled by a disabled `<fieldset>`, and resets and restores with the form.

```html
<html-export name="text-field" form-associated form-control="input">
  <template><label><slot></slot> <input></label></template>
</html-export>

<form><ui--text-field name="who" value="Ada" required>Name</ui--text-field></form>
```

`form-control="input"` names the control in the template that carries the value and the validity (and makes the component delegate focus to it by default, so a browser can focus it when validation fails); without it the
element is the control (`el.value = …`, or `el.internals.setFormValue()`). `attachInternals()` is memoized on every
template class, so a closed shadow root (which needs the internals to be found) and your own subclass share the one
object the platform allows. **Enter** in a text-like `form-control` input submits the form as native implicit
submission does (the form's default button, a disabled one blocking it), and `form-role="submit"` / `"reset"` make a
component a submit or reset button (click, Enter and Space; it is the form's default button and the `submit` event's
`submitter`; a custom element cannot be `form.requestSubmit(button)`'s argument, so the library fires the event itself
and calls `form.submit()` unless it was cancelled). Not supported: non-string form values, radio-style groups,
`formaction` and friends on a component, engines without form-associated custom elements. Reference: [HTML syntax](/html-modules/api/html-syntax/#form-associated-components);
live: `examples/forms.html`.
