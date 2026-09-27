/**
 * Site-wide syntax highlighting: JavaScript, TypeScript, JSX, TSX, HTML,
 * CSS, JSON and YAML.
 *
 * Every `<pre class="code">` across `src/playgrounds/*.ts` (there are
 * dozens) and the "view source" drawer render real code/config as plain
 * escaped text. Rather than editing every playground file to call a
 * highlighter directly — which would collide with every other agent
 * touching those same files for unrelated visual fixes — this module
 * follows the same self-mounting pattern as `src/har-recorder.ts` and
 * `src/telemetry-dock.ts`: a single global installed once from `main.ts`
 * that watches the page generically and never touches a playground file.
 *
 * Mechanism: a `MutationObserver` on `document.body` (routes render into
 * `#app`, a descendant, so `subtree: true` covers every room and the
 * source drawer with no route-specific wiring) finds every
 * `pre.code` / `code[class*="language-"]` element as it's added to the DOM
 * and highlights it in place via Prism. A `WeakMap` of "last raw text
 * highlighted per element" guards against the observer re-triggering on
 * its own writes and lets an element whose content genuinely changes (a
 * room re-rendering the same `pre.code` node with new text) get
 * re-highlighted correctly.
 *
 * Engine: Prism core, chosen over a hand-rolled tokenizer once the scope
 * grew past JS/TS/JSON to include markup-shaped languages (HTML, CSS,
 * YAML) that a regex pass tuned for JS syntax can't safely cover — Prism's
 * per-language grammars are small (a few KB each), well-tested, and this
 * site already ships multi-megabyte chunks (rapier, three, transformers),
 * so the added weight is negligible. No canned Prism theme is imported:
 * `code-highlight.css` maps Prism's own `.token.*` classes onto Circuit's
 * `--sx-*` syntax tokens (already shipping separate light/dark values),
 * so highlighting follows this site's theme toggle instead of being
 * dark-only — exactly the class of bug the rest of this visual-audit pass
 * has been fixing everywhere else.
 */
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import './code-highlight.css';

// We drive highlighting ourselves from a MutationObserver, not Prism's own
// DOMContentLoaded auto-highlight-all-code-blocks behavior.
Prism.manual = true;

const SELECTOR = 'pre.code, code[class*="language-"]';

/** Aliases -> the grammar name Prism actually registered it under. */
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', javascript: 'javascript',
  jsx: 'jsx',
  ts: 'typescript', typescript: 'typescript',
  tsx: 'tsx',
  json: 'json', json5: 'json', jsonc: 'json',
  html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', markup: 'markup',
  css: 'css',
  yaml: 'yaml', yml: 'yaml',
};

function explicitLang(el: Element): string | null {
  const dataLang = el.getAttribute('data-lang');
  if (dataLang) return LANG_ALIASES[dataLang.trim().toLowerCase()] ?? null;
  const m = /language-([\w-]+)/.exec(el.className || '');
  return m ? (LANG_ALIASES[m[1].toLowerCase()] ?? null) : null;
}

/**
 * No `data-lang`/`language-*` class: this repo's `pre.code` convention is
 * used almost exclusively for JS/TS source and JSON payloads, so default to
 * `typescript` (a safe superset of plain JS). The one cheap, low-risk sniff
 * worth doing without an explicit tag: content that's obviously a markup
 * document (starts with `<`) gets `markup` instead, since running the JS/TS
 * grammar over real HTML/XML produces visibly wrong results while the
 * reverse (markup grammar over JS) rarely comes up here.
 */
function detectLang(el: Element, raw: string): string {
  const explicit = explicitLang(el);
  if (explicit) return explicit;
  return /^\s*</.test(raw) ? 'markup' : 'typescript';
}

/** Last raw text (pre-tokenization) highlighted per element. Doubles as the
 *  guard against the MutationObserver re-processing its own writes (Prism's
 *  output doesn't change `.textContent`, so a repeat pass over identical raw
 *  text is a no-op) and lets a node whose content genuinely changes get
 *  re-highlighted. */
const lastRaw = new WeakMap<Element, string>();

function processElement(el: Element): void {
  const raw = el.textContent ?? '';
  if (!raw.trim()) return;
  if (lastRaw.get(el) === raw) return;
  lastRaw.set(el, raw);

  const lang = detectLang(el, raw);
  const grammar = Prism.languages[lang];
  if (!grammar) return; // defensive: never crash a room over a missing grammar

  el.classList.remove(...[...el.classList].filter((c) => c.startsWith('language-')));
  el.classList.add(`language-${lang}`, 'tok-highlighted');
  el.innerHTML = Prism.highlight(raw, grammar, lang);
}

function scanRoot(root: ParentNode): void {
  if (root instanceof Element && root.matches(SELECTOR)) processElement(root);
  root.querySelectorAll(SELECTOR).forEach(processElement);
}

let installed = false;

/** Installs the site-wide highlighter once. Safe to call more than once
 *  (e.g. accidental double import) — a second call is a no-op. */
export function installCodeHighlighter(): void {
  if (installed) return;
  installed = true;

  scanRoot(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      mut.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) scanRoot(node as Element);
      });
      // A `pre.code`/`code[language-*]` element whose OWN children were
      // replaced (a room re-rendering the same node's innerHTML rather than
      // swapping in a new node) reports the mutation with `target` set to
      // that element itself — catch that case too, not just newly-added nodes.
      if (mut.type === 'childList' && mut.target instanceof Element && mut.target.matches(SELECTOR)) {
        processElement(mut.target);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Defensive re-scan on route changes — the observer above already catches
  // every room's code blocks and the source drawer as they're inserted, but
  // this costs nothing thanks to the `lastRaw` guard and protects against
  // any future render path the observer's childList/subtree watch might miss.
  window.addEventListener('hashchange', () => scanRoot(document.body));
}
