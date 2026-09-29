---
title: "JavaScript API and JS components"
description: "HTMLModules.load(), import() and bind(), the API at a glance, definitions, and JavaScript-authored components."
sidebar:
  order: 5
---

## JavaScript API

`@johnhenry/html-modules/browser` defines the elements and exposes the shared instance as `HTMLModules` (exported,
and on `globalThis`). `<html-import>` is a thin layer over it, so both share one cache and one set of rules. The
side-effect-free root entry point, `@johnhenry/html-modules`, exports everything else.

```js
import { HTMLModules } from '@johnhenry/html-modules/browser';

const ui = await HTMLModules.load('./ui.html');
// { card, button, theme, config, default, components }: shaped like a compiled ES module

await HTMLModules.import('./ui.html', { as: 'ui' });                                    // = <html-import as="ui">
await HTMLModules.import('./ui.html', { as: 'ui', delimiter: '-' });                    // = <html-import as="ui" delimiter="-">
await HTMLModules.import('./ui.html', { as: 'ui', conflict: 'reuse', errors: 'throw' });
const lazy = HTMLModules.import('./ui.html', { as: 'ui', load: 'lazy' });               // a handle: { ready, load(), cancel(), state }
await HTMLModules.import('./ui.html', { bindings: [{ export: 'card', element: 'x-card' }] });
HTMLModules.bind(ui, { as: 'admin' });                                                  // bind a loaded module
HTMLModules.resolve('./ui.html');                                                       // → absolute URL
HTMLModules.cache;                                                                      // Map<URL, Promise<namespace>>
```

A loaded namespace is frozen and has a null prototype. Named exports are camelCase (`fancy-button` →
`fancyButton`), `default` is present when the module has one, and `components` maps export names to component
definitions.

The API at a glance; every entry links to its reference:

| Area | Exports | Reference |
| --- | --- | --- |
| Instances | `createHTMLModules(options)`, the instance's `load`, `import`, `bind`, `resolve`, `cache`, `options`, `base`; `defineHTMLModuleElements()` | [JavaScript API](/html-modules/api/javascript/) |
| Elements | `HTMLImport`, `HTMLBinding`, `HTMLExport`, `HTMLImportSettings`, `HTMLModuleSettings` (from `/browser`) | [Elements](/html-modules/api/elements/) |
| Definitions | `defineHTMLComponent`, `HTMLComponent`, `defineHTMLStylesheet`, `HTMLStylesheet`, `isHTMLComponent`, `isHTMLStylesheet`, `isStylesheet`, `isElementLike` | [Runtime](/html-modules/api/runtime/) |
| Binding and registration | `bindModule`, `applyBinding`, `registerComponents`, `defineElement`, `toComponent`, `lookupExport`, `componentsOf`, `manifest`, `adoptStylesheet` | [Runtime](/html-modules/api/runtime/) |
| Module records | `readHTMLModule`, `scanHTMLModule`, `recordFromRaw`, `moduleImportOptions` | [Records](/html-modules/api/records/) |
| Settings | `IMPORT_DEFAULTS`, `EXPORT_DEFAULTS`, `readImportSettings`, `readModuleSettings`, `readImportOptions`, `resolveImportOptions` | [Records](/html-modules/api/records/#settings-vocabulary) |
| Names | `DELIMITER`, `bindingName`, `parseBindingName`, `isValidDelimiter`, `isValidElementName`, `elementNameProblem`, `isKebabName`, `camelCase`, `kebabCase` | [Names](/html-modules/api/names/) |
| Lazy loading | `lazyTargets`, `watchLazy`, `componentRoot` | [JavaScript API](/html-modules/api/javascript/#lazy-loading) |
| Loader | `createLoader`, `linkHTMLModule`, `createNamespace` | [JavaScript API](/html-modules/api/javascript/#createloaderoptions) |
| Compiler | `compileHTMLModule`, `compileRecord`, `rewriteSpecifier`, `rebaseSpecifier`, the `html-module` CLI | [Compiler](/html-modules/api/compiler/) |

**Definitions** (`src/runtime.js`, also `@johnhenry/html-modules/runtime`) are the shared representation. The loader
and the compiler both produce them with `defineHTMLComponent()`:

```js
import { defineHTMLComponent } from '@johnhenry/html-modules/runtime';

const card = defineHTMLComponent({
  name: 'card',                        // identity
  template: '<article><slot></slot></article>',
  shadow: 'open',                      // or 'closed'
  delegatesFocus: false,
  styles: [':host { display: block }'],
  imports: [],                         // [{ module, from, as?, bindings? }] bound before registration
});
card.define('my-card');                // → the registered class
card.element;                          // the base class, to extend
```

## JavaScript-authored components

`<html-import>` takes JS modules too, loaded with native `import()`. A JS module says which exports are components;
nothing else is ever registered, so `export const VERSION = "2.1"` never becomes `<ui--version>`.

```js
// ui.js: either a components manifest …
export const components = { 'custom-card': CustomCard, 'fancy-button': FancyButton };

// … or exports made with defineHTMLComponent()
export const customCard = defineHTMLComponent(CustomCard);
```

```html
<html-import src="./ui.js" as="ui"></html-import>   <!-- <ui--custom-card>, <ui--fancy-button> -->
```

A plain class needs no manifest when the page names it: `<html-binding export="Counter" element="x-counter">`. To
give an HTML template JavaScript behaviour, extend its definition's `element` and export the result:

```js
const { likeView } = await HTMLModules.load(new URL('./like-view.html', import.meta.url).href);
export class LikeButton extends likeView.element { connectedCallback() { /* … */ } }
export const components = { 'like-button': defineHTMLComponent({ element: LikeButton, imports: likeView.imports }) };
```

HTML modules can re-export JS components too: `<html-export src="./widgets.js" name="counter" import="Counter">`.
