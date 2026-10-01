---
title: "The compiler"
description: "Turn an HTML module into an ordinary ES module that imports only the runtime, from the CLI or from JavaScript."
sidebar:
  order: 6
---

Browsers cannot `import` an `.html` file, and this library does not try to make them (no service worker, no custom
loader). Instead, an optional compiler turns an HTML module into an ordinary ES module:

```sh
npm install --save-dev @johnhenry/html-modules
npx html-module ui.html                                              # → ui.js
npx html-module ui.html -o dist/ui.js
npx html-module a.html b.html --runtime ./vendor/html-modules/runtime.js
npx html-module ui.html --format register --as ui                    # → ui.register.js, registers <ui--…> on import
npx html-module ui.html --format register --as ui --delimiter -      # registers <ui-…>
npx html-module ui.html --format register --as ui --conflict reuse   # keeps tags that are already defined
npx html-module ui.html --stdout
```

(Without installing first: `npx -p @johnhenry/html-modules html-module ui.html`. A bare `npx html-module` outside a
project that has the package installed would look for an npm package *named* `html-module`, which is not this one.)

```js
import { compileHTMLModule } from '@johnhenry/html-modules/compiler';
const js = compileHTMLModule(source, { url: 'ui.html' });                       // runtime: "@johnhenry/html-modules/runtime"
const reg = compileHTMLModule(source, { format: 'register', as: 'ui', delimiter: '-' });
```

The output imports only the runtime and exports the same definitions the runtime loader would build:

```js
// ui.js (abridged)
import { defineHTMLComponent, manifest } from "@johnhenry/html-modules/runtime";
const $x_card = defineHTMLComponent({ name: "card", template: "<article>…</article>", shadow: "open", … });
const $components = manifest({ "card": $x_card }, []);
export { $x_card as card, $components as components };
```

- **Nothing registers on import.** `import { card } from './ui.js'; card.define('my-card')`, or
  `<html-import src="./ui.js" as="ui">`, which reads the `components` manifest. `--format register` is the sugar
  that registers every component on import (under `--as`, or under the export names, which must then be valid custom
  element names).
- **Default exports** compile to `export default`.
- **Dependencies** (`<html-import>`, `<html-export src>`) become static imports with `.html` rewritten to `.js`, so
  compile those modules too. A module's `<html-import-settings base>` is applied first, keeping specifiers
  relative. Star re-exports become `export * from`.
- **Settings.** `<html-module-settings>` defaults are baked into each definition; `<html-import-settings>` options
  are carried into `$imports`, which the runtime binds with. `load="lazy"` does not make compiled code lazy.
- The compiler reads source with a small dependency-free scanner that follows the HTML tokenizer (comments, raw-text
  elements, script escapes, character references, end-tag scoping) and produces the same module record as the
  browser's DOM reader. It is tested against every example and, with a seeded fuzz, against parse5. Pass `parse` to
  use a DOM parser instead.
- Runtime-loaded and compiled modules render identically; the test suite and the compiler example check this.

Every option, the CLI flags and exit codes, and a full generated module: [Compiler and CLI](/html-modules/api/compiler/).
