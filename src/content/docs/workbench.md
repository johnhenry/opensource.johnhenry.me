---
title: "Built with the family: workbench"
description: "A small app that proves mport, html-modules, window-algebra and safe-fragment meet at the import map: live, with a strict CSP and Trusted Types, tested on three engines."
---

**workbench** is a small, real app built to test one claim: that four of the `@johnhenry` browser libraries, which
depend on nothing from each other, **meet at the import map**. It is a tiling workbench with five tool windows (notes,
tasks, a data view, clips, settings), no bundler, a strict Content-Security-Policy with Trusted Types, and a Playwright suite
that runs on Chromium, Firefox and WebKit.

- **Live:** [johnhenry.github.io/workbench](https://johnhenry.github.io/workbench/) (GitHub Pages, deployed from CI)
- **Source:** [github.com/johnhenry/workbench](https://github.com/johnhenry/workbench)
- **In the Orrery:** [Untrusted Desk](/orrery/#/workbench), the desk and its untrusted notes as a live planet: window-algebra with undo/redo, keyboard-movable and pop-out windows, safe-fragment profiles and a strict-CSP, Trusted Types frame, with the components written as html-modules. The standalone above is the one with all four libraries and mport's import map, no bundler.
- **What it found:** [FINDINGS.md](https://github.com/johnhenry/workbench/blob/main/FINDINGS.md): every bug, gap and awkward
  API met while building it, each with a minimal repro, the library commit that fixed it or the issue that tracks it.

## Which library does what

| Library | Role in workbench |
| --- | --- |
| [mport](/mport/) | Builds the page's import map and lockfile at build time (`createRouter(...).build(specs, { graph: true, dependencies: true })`). The libraries are routed with `local()` and `installedRegistry()`, the app's own components with an app-owned prefix (`"@workbench/ui/"`), dayjs from esm.sh with an `integrity` hash for every file of its graph. It also renders the inline map with its CSP hash (`renderImportMapCsp()`), so `script-src` needs no nonce, and adds safe-fragment's `dompurify` dependency by reading its manifest. |
| [html-modules](/html-modules/) | Every component inside a window is an HTML module in an ordinary `.html` file: data-bound templates, form-associated fields, a shared kit module that the tool modules import. A bare `<html-import src="@workbench/ui/notes.html">` resolves through the import map. One module (the Clips tool's card) is loaded as *less trusted*, through the `sanitize` hook. |
| [window-algebra](/window-algebra/) | The shell: `<wa-stage>` with two layouts and floating windows, the built-in window chrome, drag, dock and reorder, the command palette, keyboard and touch input, RTL and theming through `--wa-*` tokens, persistence and cross-tab sync. A window's body is a plain custom element, so the shell needs no knowledge of how a component was defined. |
| [safe-fragment](/safe-fragment/) | Note bodies are untrusted rich text (pasted HTML). Each note card renders its body with `<safe-fragment profile="article-v1">`, and the Clips module's template goes through `safeFragmentSanitizer`. The sanitizer's report is shown in the UI. |

```
            build time (Node)                                  run time (browser)

  mport  ──►  index.html: CSP + import map  ───────────►  html-modules   window-algebra   safe-fragment
   │            "@johnhenry/*"  local()                     (components)    (the shell)      (note bodies)
   │            "@workbench/ui/" app prefix                       │              │                 │
   │            "dompurify" added by dependencies: true           └──────┬───────┘                 │
   └──► mport.lock.json                                                 ▼                         ▼
                                                              a window's body is a custom element;
                                                              safe-fragment is one more element in it
```

## Where the four meet

- **One shared map.** The import map is the only thing the libraries share. None imports another.
- **html-modules and safe-fragment** meet in two places, neither a dependency: the page passes safe-fragment to html-modules'
  [`safeFragmentSanitizer()`](/html-modules/api/sanitize/#the-safe-fragment-adapter) for modules from a less-trusted origin, and
  a `<safe-fragment>` is an ordinary custom element inside a trusted component's template.
- **Trusted Types.** safe-fragment uses the native Sanitizer API where it exists (Chromium, Firefox) and DOMPurify where it does not
  (WebKit). The page's CSP lists exactly the two policies, `trusted-types html-modules dompurify`; see
  [Trusted Types and CSP](/safe-fragment/trusted-types-and-csp/).
- **A subpath deploy.** The same build, run with a base (`--base /workbench/ --out dist`), copies the libraries into the artifact and
  rewrites the map, the CSP hash and the component prefix, so the site works at a subpath on GitHub Pages. See
  [Import maps, lockfiles and the CLI](/mport/import-maps-and-cli/).

## Tests

XSS payloads pasted into a note (an `<img onerror>`, `javascript:` links, `<svg>`, `srcset` tricks, a form with `formaction`)
never execute and nothing asks for the attacker's host, on the browser's own sanitizer and with `setHTML` removed so DOMPurify
runs on every engine. The less-trusted module's template is sanitized, there are no CSP or Trusted Types violation events, and
axe stays clean. A smoke suite runs against the deployed URL after each deploy.
