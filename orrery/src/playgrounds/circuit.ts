import type { Playground } from '../registry';
import { playgrounds } from '../registry';
import { readState, writeState, copyLink } from '../state';
// palette.js's ONLY real API is a search/command-palette (createCommandPalette) —
// it has no color-generation or contrast helpers. We use the real export for a
// genuine "jump to a theme / section" command palette, and compute contrast
// ratios ourselves below (WCAG formula) since the library doesn't ship one.
// (Typed via src/types.d.ts's ambient declaration — see ROADMAP 4.6's chrome.ts, which needed the same import.)
import { createCommandPalette } from '@erisera-code/circuit/palette.js';
import '@erisera-code/circuit/palette.css';
import './circuit.css';

// ---------------------------------------------------------------------------
// The seven marks that ship in @erisera-code/circuit/marks/*
// ---------------------------------------------------------------------------
import matey from '../../node_modules/@erisera-code/circuit/src/marks/matey.svg?raw';
import circuitMark from '../../node_modules/@erisera-code/circuit/src/marks/circuit.svg?raw';
import objectify from '../../node_modules/@erisera-code/circuit/src/marks/objectify.svg?raw';
import andbox from '../../node_modules/@erisera-code/circuit/src/marks/andbox.svg?raw';
import mcpQuery from '../../node_modules/@erisera-code/circuit/src/marks/mcp-query.svg?raw';
import ecmanim from '../../node_modules/@erisera-code/circuit/src/marks/ecmanim.svg?raw';
import clawser from '../../node_modules/@erisera-code/circuit/src/marks/clawser.svg?raw';

const MARKS: Array<{ id: string; svg: string }> = [
  { id: 'matey', svg: matey },
  { id: 'circuit', svg: circuitMark },
  { id: 'objectify', svg: objectify },
  { id: 'andbox', svg: andbox },
  { id: 'mcp-query', svg: mcpQuery },
  { id: 'ecmanim', svg: ecmanim },
  { id: 'clawser', svg: clawser },
];

// ---------------------------------------------------------------------------
// The themes.css per-tool hue registry (kept in sync with the source comment)
// ---------------------------------------------------------------------------
const THEMES: Array<{ cls: string; hue: number }> = [
  { cls: 'theme-matey', hue: 25 },
  { cls: 'theme-objectify', hue: 70 },
  { cls: 'theme-andbox', hue: 95 },
  { cls: 'theme-mcp-query', hue: 250 },
  { cls: 'theme-ecmanim', hue: 285 },
  { cls: 'theme-clawser', hue: 340 },
];
/** themes.css's own doc comment: "Blocked union: [122°, 219°]." -- reserved for existing closed erisera products' ±20° buffers. */
const HUE_BLOCKED: [number, number] = [122, 219];
/**
 * Which ORRERY planet (registry.ts `id`) each themes.css class is really
 * "for" -- matey and clawser are erisera products with no ORRERY room
 * (nothing to check them against here), the rest are the OSS tools this
 * site actually runs live. See ROADMAP.md P0.4: planet hues have drifted
 * from this registry before (objectify 105 vs 70, andbox 330 vs 95, mcpq
 * 205 vs 250, ecmanim 45 vs 285, at the time that item was written).
 */
const THEME_ROOM_MAP: Record<string, string> = {
  'theme-objectify': 'objectify',
  'theme-andbox': 'andbox',
  'theme-mcp-query': 'mcpq',
  'theme-ecmanim': 'ecmanim',
};

// ---------------------------------------------------------------------------
// Token groups, read straight off tokens.css
// ---------------------------------------------------------------------------
type Kind = 'color' | 'space' | 'radius' | 'shadow' | 'font';
const TOKEN_GROUPS: Array<{ name: string; kind: Kind; vars: string[] }> = [
  { name: 'Accent (rotates with --hue)', kind: 'color', vars: ['--accent', '--accent-hover', '--accent-soft', '--accent-border'] },
  { name: 'Semantic (fixed)', kind: 'color', vars: ['--success', '--success-soft', '--warning', '--warning-soft', '--error', '--error-soft', '--info', '--info-soft'] },
  { name: 'Neutrals (fixed, hue-stable)', kind: 'color', vars: ['--n-0', '--n-50', '--n-100', '--n-200', '--n-300', '--n-400', '--n-500', '--n-600', '--n-700', '--n-750', '--n-800', '--n-900'] },
  { name: 'Surfaces', kind: 'color', vars: ['--bg', '--bg-panel', '--bg-inset', '--ink', '--ink-2', '--ink-3', '--line', '--code-bg', '--code-ink'] },
  { name: 'Syntax (fixed)', kind: 'color', vars: ['--sx-kw', '--sx-str', '--sx-fn', '--sx-cm', '--sx-num', '--sx-tag', '--sx-attr', '--sx-punct', '--sx-type', '--sx-bool'] },
  { name: 'Type', kind: 'font', vars: ['--f-display', '--f-body', '--f-mono'] },
  { name: 'Spacing', kind: 'space', vars: ['--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6', '--sp-8', '--sp-10', '--sp-14', '--sp-20'] },
  { name: 'Radii', kind: 'radius', vars: ['--r-sm', '--r', '--r-lg', '--r-xl', '--r-2xl', '--r-full'] },
  { name: 'Shadows', kind: 'shadow', vars: ['--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-accent'] },
];

interface State extends Record<string, unknown> { hue: number }
const DEFAULTS: State = { hue: 25 };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------------------------------------------------------------------------
// WCAG relative-luminance / contrast-ratio math (not part of palette.js)
// ---------------------------------------------------------------------------
function srgbToLin(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function relLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
/** Resolve any CSS color (hex/hsl/rgb/named/var-computed) to [r,g,b,a] via a throwaway element. */
function resolveRGBA(colorValue: string): [number, number, number, number] {
  const probe = document.createElement('span');
  probe.style.color = colorValue;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color; // "rgb(r, g, b)" or "rgba(r, g, b, a)"
  document.body.removeChild(probe);
  const m = computed.match(/[\d.]+/g);
  if (!m || m.length < 3) return [0, 0, 0, 1];
  return [parseFloat(m[0]), parseFloat(m[1]), parseFloat(m[2]), m[3] !== undefined ? parseFloat(m[3]) : 1];
}
/** Alpha-composite a (possibly translucent) token color over an opaque backdrop, e.g. --success-soft over --bg-panel. */
function compositeOverBackdrop(rgba: [number, number, number, number], backdrop: [number, number, number]): [number, number, number] {
  const [r, g, b, a] = rgba;
  const [br, bg, bb] = backdrop;
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
}
function contrastRatio(fg: string, bg: string): number {
  // Tokens like --success-soft are translucent surface tints meant to sit on --bg-panel,
  // not opaque colors — composite both sides over that real backdrop before measuring.
  const [pbr, pbg, pbb] = resolveRGBA('var(--bg-panel)');
  const backdrop: [number, number, number] = [pbr, pbg, pbb];
  const [r1, g1, b1] = compositeOverBackdrop(resolveRGBA(fg), backdrop);
  const [r2, g2, b2] = compositeOverBackdrop(resolveRGBA(bg), backdrop);
  const L1 = relLuminance(r1, g1, b1);
  const L2 = relLuminance(r2, g2, b2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}
function grade(ratio: number): { cls: string; label: string } {
  if (ratio >= 7) return { cls: 'aaa', label: 'AAA' };
  if (ratio >= 4.5) return { cls: 'aa', label: 'AA' };
  return { cls: 'fail', label: 'FAIL' };
}

const playground: Playground = {
  id: 'circuit',
  title: 'Circuit Gallery',
  pkg: '@erisera-code/circuit',
  hue: 25,
  blurb: 'The design system under every planet: one hue changes, everything else holds. Spin the dial.',
  docs: 'https://opensource.johnhenry.me/circuit/',

  mount(host: HTMLElement) {
    const state = readState<State>(DEFAULTS);
    let hue = ((state.hue % 360) + 360) % 360;

    host.innerHTML = `
      <div class="pg-circuit" style="--hue:${hue}">
        <section class="panel" id="rules">
          <h2>The three rules</h2>
          <p class="hint">Circuit keeps every erisera surface coherent by changing exactly one thing per tool — the accent hue. Everything else is fixed. Spin the dial below: watch the accent row move while neutrals, semantic color and syntax highlighting hold still.</p>
          <div class="rules">
            <div class="rule"><b>Rule 1</b>Neutrals are hue-stable — the gray scale never rotates.</div>
            <div class="rule"><b>Rule 2</b>Semantic color (success/warning/error/info) never rotates.</div>
            <div class="rule"><b>Rule 3</b>Syntax highlighting never rotates.</div>
          </div>
        </section>

        <section class="panel" id="dial-section">
          <h2>Hue dial</h2>
          <p class="hint">Drag the slider, click a ring dot (one per ORRERY planet), or type a value. <code>--hue</code> is set live on this planet's root element only — every other planet stays on its own hue.</p>
          <div class="dial-wrap">
            <div class="dial" id="dial">
              <div class="needle" id="needle"></div>
              ${playgrounds.map((p) => {
                const a = (p.hue / 360) * 2 * Math.PI - Math.PI / 2;
                const cx = 50 + 43 * Math.cos(a);
                const cy = 50 + 43 * Math.sin(a);
                return `<div class="dot" data-hue="${p.hue}" data-id="${p.id}" title="${esc(p.title)} — ${p.hue}°" style="left:${cx}%;top:${cy}%;background:hsl(${p.hue} 90% 55%)"></div>`;
              }).join('')}
              <div class="dial-center"><span class="hv" id="hue-val">${hue}</span><span class="hl">deg</span></div>
            </div>
            <div class="dial-controls">
              <div class="row">
                <label class="field" style="flex:1"><span>--hue (0–360)</span>
                  <input type="range" id="hue-range" min="0" max="360" step="1" value="${hue}">
                </label>
              </div>
              <div class="row presets">
                ${playgrounds.map((p) => `<button data-hue="${p.hue}" title="${esc(p.title)}">${p.id} ${p.hue}°</button>`).join('')}
              </div>
              <div class="foot-row">
                <button class="btn" id="copy-link">copy link</button>
                <span class="copied" id="copied-msg" style="visibility:hidden">copied</span>
              </div>
            </div>
          </div>

          <div class="proof">
            <div class="proof-row"><span class="label moves">--accent ↻</span><div class="swatch-strip" id="row-accent"></div></div>
            <div class="proof-row"><span class="label still">neutrals ✓</span><div class="swatch-strip" id="row-neutral"></div></div>
            <div class="proof-row"><span class="label still">semantic ✓</span><div class="swatch-strip" id="row-semantic"></div></div>
            <div class="proof-row"><span class="label still">syntax ✓</span><div class="swatch-strip" id="row-syntax"></div></div>
          </div>
        </section>

        <section class="panel" id="tokens-section">
          <h2>Token table</h2>
          <p class="hint">Every custom property from <code>tokens.css</code>, grouped, with a live swatch and its computed value.</p>
          <div class="tok-groups" id="tok-groups"></div>
        </section>

        <section class="panel" id="components-section">
          <h2>Components, light &amp; dark</h2>
          <p class="hint">The same <code>components.css</code> markup, twice — one wrapper carries <code>.light</code>, the other <code>.dark</code>. Tokens.css supports scoping either class on any element, not just <code>&lt;html&gt;</code>. Every class below is a real selector from <code>components.css</code>: <code>c-header</code>, <code>c-side</code>, <code>c-btn</code>, <code>c-badge</code>, <code>c-field</code>, <code>c-tabbar</code>, <code>c-codebox</code>, <code>c-termbox</code>, <code>c-callout</code>, <code>c-paramlist</code>.</p>
          <div class="showcase-halves">
            <div class="showcase-half light" id="showcase-light"><div class="half-label">.light</div></div>
            <div class="showcase-half dark" id="showcase-dark"><div class="half-label">.dark</div></div>
          </div>
        </section>

        <section class="panel" id="audit-section">
          <h2>Hue registry check <span class="stat">P0.4</span></h2>
          <p class="hint">themes.css's own doc comment names a registry: every erisera product gets a <code>--hue</code> at least 20° from every other, and the union <code>[122°, 219°]</code> is reserved for existing closed products' buffers. This checks ORRERY's live <code>registry.ts</code> against that source of truth — the six <code>theme-*</code> classes above (skipping <code>matey</code>/<code>clawser</code>, which have no ORRERY planet) and every planet's hue against the blocked arc.</p>
          <div class="contrast-table audit-table" id="audit-table"></div>
        </section>

        <section class="panel" id="themes-section">
          <h2>Per-tool themes</h2>
          <p class="hint"><code>themes.css</code> ships one class per erisera tool, each just an override of <code>--hue</code>. Click a card to preview it on this page's dial.</p>
          <div class="theme-grid" id="theme-grid"></div>
        </section>

        <section class="panel" id="marks-section">
          <h2>Marks</h2>
          <p class="hint">Every SVG in <code>marks/*</code> — each drawn with a fixed <code>stroke</code>/<code>fill</code> of <code>hsl(25 95% 46%)</code> in the source file (the package's own default accent), shown here at native color.</p>
          <div class="marks-grid" id="marks-grid"></div>
        </section>

        <section class="panel" id="contrast-section">
          <h2>Contrast ratios</h2>
          <p class="hint"><code>palette.js</code> exports a command palette, not a contrast helper — so these ratios are computed here with the standard WCAG relative-luminance formula, against the <em>live</em> resolved colors (they update as you spin the dial).</p>
          <div class="contrast-table" id="contrast-table"></div>
          <div class="foot-row" style="margin-top:12px">
            <button class="btn" id="open-palette"><span class="kbd-hint">⌘K </span>open Circuit's own command palette</button>
            <span class="stat">real <code>createCommandPalette()</code> from <code>palette.js</code></span>
          </div>
        </section>
      </div>
    `;

    const root = host.querySelector<HTMLElement>('.pg-circuit')!;
    const dial = host.querySelector<HTMLElement>('#dial')!;
    const needle = host.querySelector<HTMLElement>('#needle')!;
    const hueVal = host.querySelector<HTMLElement>('#hue-val')!;
    const hueRange = host.querySelector<HTMLInputElement>('#hue-range')!;

    function setHue(h: number, persist: boolean) {
      hue = ((Math.round(h) % 360) + 360) % 360;
      root.style.setProperty('--hue', String(hue));
      hueVal.textContent = String(hue);
      hueRange.value = String(hue);
      needle.style.transform = `rotate(${hue}deg)`;
      dial.querySelectorAll<HTMLElement>('.dot').forEach((d) => {
        d.classList.toggle('here', Number(d.dataset.hue) === hue);
      });
      if (persist) writeState({ hue }, DEFAULTS);
      renderProofRows();
      renderTokenTable();
      renderContrast();
    }

    // ---- proof rows: accent moves, everything else visibly does not ----
    function renderProofRows() {
      const cs = getComputedStyle(root);
      const accentRow = host.querySelector<HTMLElement>('#row-accent')!;
      accentRow.innerHTML = ['--accent', '--accent-hover', '--accent-soft', '--accent-border']
        .map((v) => `<div class="swatch" style="background:${cs.getPropertyValue(v)}" title="${v}"></div>`).join('');
      const neutralRow = host.querySelector<HTMLElement>('#row-neutral')!;
      neutralRow.innerHTML = ['--n-100', '--n-300', '--n-500', '--n-700', '--n-900']
        .map((v) => `<div class="swatch sm" style="background:${cs.getPropertyValue(v)}" title="${v}"></div>`).join('');
      const semanticRow = host.querySelector<HTMLElement>('#row-semantic')!;
      semanticRow.innerHTML = ['--success', '--warning', '--error', '--info']
        .map((v) => `<div class="swatch sm" style="background:${cs.getPropertyValue(v)}" title="${v}"></div>`).join('');
      const syntaxRow = host.querySelector<HTMLElement>('#row-syntax')!;
      syntaxRow.innerHTML = ['--sx-kw', '--sx-str', '--sx-fn', '--sx-num', '--sx-tag', '--sx-attr', '--sx-type', '--sx-bool']
        .map((v) => `<div class="swatch sm" style="background:${cs.getPropertyValue(v)}" title="${v}"></div>`).join('');
    }

    // ---- token table ----
    function renderTokenTable() {
      const cs = getComputedStyle(root);
      const wrap = host.querySelector<HTMLElement>('#tok-groups')!;
      wrap.innerHTML = TOKEN_GROUPS.map((g) => `
        <div class="tok-group">
          <h3>${esc(g.name)}</h3>
          <div class="tok-grid">
            ${g.vars.map((v) => {
              const raw = cs.getPropertyValue(v).trim();
              // These are CSS custom-property NAMES (e.g. "--success"), not values — they must be
              // wrapped in var(...) to resolve. Emitting `style="background:${v}"` literally sets
              // `background: --success`, which is invalid CSS and paints nothing (P1 from the audit).
              if (g.kind === 'color') {
                return `<div class="tok-cell"><div class="tok-swatch" style="background:var(${v})"></div><div class="tok-meta"><span class="tok-name">${v}</span><span class="tok-val">${esc(raw)}</span></div></div>`;
              }
              if (g.kind === 'space') {
                return `<div class="tok-cell space"><div class="tok-swatch"><div class="bar" style="width:var(${v})"></div></div><div class="tok-meta"><span class="tok-name">${v}</span><span class="tok-val">${esc(raw)}</span></div></div>`;
              }
              if (g.kind === 'radius') {
                return `<div class="tok-cell radius"><div class="tok-swatch"><div class="box" style="border-radius:var(${v})"></div></div><div class="tok-meta"><span class="tok-name">${v}</span><span class="tok-val">${esc(raw)}</span></div></div>`;
              }
              if (g.kind === 'shadow') {
                return `<div class="tok-cell shadow"><div class="tok-swatch"><div class="box" style="box-shadow:var(${v})"></div></div><div class="tok-meta"><span class="tok-name">${v}</span><span class="tok-val">${esc(raw)}</span></div></div>`;
              }
              return `<div class="tok-cell font"><div class="tok-swatch" style="font-family:var(${v})">Aa 123</div><div class="tok-meta"><span class="tok-name">${v}</span><span class="tok-val">${esc(raw)}</span></div></div>`;
            }).join('')}
          </div>
        </div>
      `).join('');
    }

    // ---- components showcase, light + dark ----
    function componentsMarkup(): string {
      return `
        <header class="c-header">
          <div class="c-logo"><span class="co">erisera</span><span class="tool">circuit</span><span class="ver">v0.1.1</span></div>
          <nav><a href="#" aria-current="page">Guide</a><a href="#">API</a><a href="#">Examples</a></nav>
        </header>
        <div class="demo-row">
          <button class="c-btn primary">Primary</button>
          <button class="c-btn secondary">Secondary</button>
          <button class="c-btn ghost">Ghost</button>
        </div>
        <div class="demo-row">
          <span class="c-badge accent">accent</span>
          <span class="c-badge success">success</span>
          <span class="c-badge warning">warning</span>
          <span class="c-badge error">error</span>
          <span class="c-badge neutral">neutral</span>
        </div>
        <input class="c-field" placeholder="c-field input" />
        <div class="demo-card">
          <h4>Card</h4>
          <p>A .demo-card riding on --bg-panel / --line / --shadow-sm.</p>
        </div>
        <nav class="c-side">
          <h5>Getting started</h5>
          <ul><li><a class="on" href="#">Installation</a></li><li><a href="#">Quickstart</a></li></ul>
          <h5>Reference</h5>
          <ul><li><a href="#">API</a></li><li><a href="#">Tokens</a></li></ul>
        </nav>
        <div class="c-tabbar">
          <span class="tab on">Overview</span>
          <span class="tab">API</span>
          <span class="tab">Examples</span>
        </div>
        <div class="c-codebox">
          <div class="cap"><span>demo.ts</span><button class="cp">copy</button></div>
          <pre><span class="sx-kw">const</span> <span class="sx-fn">accent</span> = <span class="sx-str">'hsl(var(--hue) 95% 46%)'</span>;
<span class="sx-cm">// numbers and booleans stay fixed too</span>
<span class="sx-kw">const</span> n: <span class="sx-type">number</span> = <span class="sx-num">360</span>;
<span class="sx-kw">const</span> ok: <span class="sx-type">boolean</span> = <span class="sx-bool">true</span>;</pre>
        </div>
        <div class="c-termbox">
          <div class="twin"><i></i><i></i><i></i></div>
          <pre><span class="prompt">$</span> npm i @erisera-code/circuit
<span class="out">added 1 package in 312ms</span></pre>
        </div>
        <div class="c-callout tip">
          <span class="ic">TIP</span>
          <p>Spin the dial above — <b>--hue</b> is the only thing that moves.</p>
        </div>
        <div class="c-callout warning">
          <span class="ic">WARN</span>
          <p>Hues in the 122–219° arc are reserved — see the registry check below.</p>
        </div>
        <div class="c-paramlist">
          <div class="c-paramrow">
            <span class="pname">hue</span><span class="ptype">number</span><span class="pdefault">= 25</span>
            <span class="preq required">required</span>
            <span class="pdesc">Accent hue (0–360). Everything else on the page holds still.</span>
          </div>
          <div class="c-paramrow">
            <span class="pname">mount</span><span class="ptype">HTMLElement</span>
            <span class="preq optional">optional</span>
            <span class="pdesc">Root element a <code>createCommandPalette()</code> instance portals into.</span>
          </div>
        </div>
      `;
    }
    host.querySelector<HTMLElement>('#showcase-light')!.innerHTML += componentsMarkup();
    host.querySelector<HTMLElement>('#showcase-dark')!.innerHTML += componentsMarkup();
    // These are decorative (c-header / c-side markup real docs sites link with), not
    // in-app navigation -- keep clicks from touching the hash router.
    host.querySelectorAll<HTMLAnchorElement>('.showcase-half a').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));

    // ---- themes gallery ----
    const themeGrid = host.querySelector<HTMLElement>('#theme-grid')!;
    themeGrid.innerHTML = THEMES.map((t) => `
      <div class="theme-card" data-hue="${t.hue}">
        <div class="swatch-row">
          <span class="dot" style="background:hsl(${t.hue} 95% 46%)"></span>
          <span class="dot" style="background:hsl(${t.hue} 92% 58%)"></span>
        </div>
        <span class="tname">${t.cls}</span>
        <span class="thue">--hue: ${t.hue}</span>
      </div>
    `).join('');
    themeGrid.querySelectorAll<HTMLElement>('.theme-card').forEach((card) => {
      card.addEventListener('click', () => setHue(Number(card.dataset.hue), true));
    });

    // ---- marks grid ----
    const marksGrid = host.querySelector<HTMLElement>('#marks-grid')!;
    marksGrid.innerHTML = MARKS.map((m) => `<div class="mark-cell">${m.svg}<span>${esc(m.id)}.svg</span></div>`).join('');

    // ---- contrast ratios ----
    const CONTRAST_PAIRS: Array<[string, string, string]> = [
      ['--ink on --bg', 'var(--ink)', 'var(--bg)'],
      ['--ink-2 on --bg-panel', 'var(--ink-2)', 'var(--bg-panel)'],
      ['#fff on --accent', '#fff', 'var(--accent)'],
      ['--accent on --bg', 'var(--accent)', 'var(--bg)'],
      ['--code-ink on --code-bg', 'var(--code-ink)', 'var(--code-bg)'],
      ['--success on --success-soft', 'var(--success)', 'var(--success-soft)'],
      ['--error on --error-soft', 'var(--error)', 'var(--error-soft)'],
      ['--sx-cm on --code-bg', 'var(--sx-cm)', 'var(--code-bg)'],
    ];
    // CSS custom-property names ("--bg-panel") have real hyphens that the
    // line-breaking algorithm treats as break opportunities regardless of
    // word-break (keep-all only affects CJK text breaking, not Latin
    // hyphens) — in the ~20px-wide label column at phone width that split
    // names mid-token ("--bg-\npanel", issue #42 P2, M3). Swap the hyphens
    // *inside* each `--token-name` for U+2011 (non-breaking hyphen) so the
    // name can only wrap as a whole, while " on " between two names can
    // still break normally.
    const noBreakTokens = (s: string) => s.replace(/--[\w-]+/g, (m) => m.replace(/-/g, '‑'));
    function renderContrast() {
      const table = host.querySelector<HTMLElement>('#contrast-table')!;
      table.innerHTML = CONTRAST_PAIRS.map(([label, fg, bg]) => {
        const ratio = contrastRatio(fg, bg);
        const g = grade(ratio);
        return `<div class="contrast-row">
          <span class="pair">${noBreakTokens(esc(label))}</span>
          <span class="demo" style="color:${fg};background:${bg}">Aa Bb Cc</span>
          <span class="ratio">${ratio.toFixed(2)}:1</span>
          <span class="grade ${g.cls}">${g.label}</span>
        </div>`;
      }).join('');
    }

    // ---- hue registry audit (P0.4) ----
    function renderHueAudit() {
      const wrap = host.querySelector<HTMLElement>('#audit-table')!;
      const themeRows = THEMES.map((t) => {
        const roomId = THEME_ROOM_MAP[t.cls];
        if (!roomId) {
          return `<div class="contrast-row audit-row skip">
            <span class="pair">${esc(t.cls)}</span>
            <span class="demo">no ORRERY planet — closed/not run here</span>
            <span class="ratio">--hue: ${t.hue}°</span>
            <span class="grade aa">n/a</span>
          </div>`;
        }
        const room = playgrounds.find((p) => p.id === roomId);
        const match = !!room && room.hue === t.hue;
        return `<div class="contrast-row audit-row ${match ? 'ok' : 'bad'}">
          <span class="pair">${esc(t.cls)} ↔ #/${roomId}</span>
          <span class="demo">themes.css: ${t.hue}° · registry.ts: ${room ? `${room.hue}°` : 'missing'}</span>
          <span class="ratio"></span>
          <span class="grade ${match ? 'aaa' : 'fail'}">${match ? 'OK' : 'MISMATCH'}</span>
        </div>`;
      }).join('');
      const [lo, hi] = HUE_BLOCKED;
      const blocked = playgrounds.filter((p) => p.hue >= lo && p.hue <= hi);
      const blockedRows = blocked.length
        ? blocked.map((p) => `<div class="contrast-row audit-row bad">
            <span class="pair">#/${esc(p.id)}</span>
            <span class="demo">--hue: ${p.hue}° — inside the blocked ${lo}–${hi}° arc</span>
            <span class="ratio"></span>
            <span class="grade fail">BLOCKED</span>
          </div>`).join('')
        : `<div class="contrast-row audit-row ok">
            <span class="pair">blocked arc (${lo}°–${hi}°)</span>
            <span class="demo">no planet's hue falls inside it</span>
            <span class="ratio"></span>
            <span class="grade aaa">CLEAR</span>
          </div>`;
      wrap.innerHTML = themeRows + blockedRows;
    }
    renderHueAudit();

    setHue(hue, false);

    // ---- interactions ----
    let dragging = false;
    function angleToHue(clientX: number, clientY: number): number {
      const r = dial.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let deg = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;
      return deg;
    }
    function onDialPointer(e: PointerEvent) {
      setHue(angleToHue(e.clientX, e.clientY), true);
    }
    function onPointerDown(e: PointerEvent) {
      if ((e.target as HTMLElement).classList.contains('dot')) return; // let dot clicks resolve separately
      dragging = true;
      onDialPointer(e);
    }
    function onPointerMove(e: PointerEvent) { if (dragging) onDialPointer(e); }
    function onPointerUp() { dragging = false; }
    dial.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    dial.querySelectorAll<HTMLElement>('.dot').forEach((d) => {
      d.addEventListener('click', () => setHue(Number(d.dataset.hue), true));
    });

    function onRangeInput() { setHue(Number(hueRange.value), true); }
    hueRange.addEventListener('input', onRangeInput);

    const presetButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('.presets button'));
    presetButtons.forEach((b) => b.addEventListener('click', () => setHue(Number(b.dataset.hue), true)));

    const copyBtn = host.querySelector<HTMLButtonElement>('#copy-link')!;
    const copiedMsg = host.querySelector<HTMLElement>('#copied-msg')!;
    let copiedTimer: number | undefined;
    async function onCopyClick() {
      await copyLink();
      copiedMsg.style.visibility = 'visible';
      clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => { copiedMsg.style.visibility = 'hidden'; }, 1500);
    }
    copyBtn.addEventListener('click', onCopyClick);

    // ---- real command palette from palette.js ----
    const openPaletteBtn = host.querySelector<HTMLButtonElement>('#open-palette')!;
    const palette = createCommandPalette({
      mount: root,
      trigger: openPaletteBtn,
      pages: [
        { title: 'The three rules', path: 'circuit / rules', href: '#rules' },
        { title: 'Hue dial', path: 'circuit / dial', href: '#dial-section' },
        { title: 'Token table', path: 'circuit / tokens', href: '#tokens-section' },
        { title: 'Components, light & dark', path: 'circuit / components', href: '#components-section' },
        { title: 'Per-tool themes', path: 'circuit / themes', href: '#themes-section' },
        { title: 'Marks', path: 'circuit / marks', href: '#marks-section' },
        { title: 'Contrast ratios', path: 'circuit / contrast', href: '#contrast-section' },
      ],
      actions: THEMES.map((t) => ({
        title: `Preview ${t.cls} (--hue: ${t.hue})`,
        run: () => setHue(t.hue, true),
        feedback: `--hue → ${t.hue}`,
      })),
      openKey: '',
    });
    // href-based "pages" just navigate the real DOM anchors we defined above (id attrs already set).
    root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest?.('.c-presult');
      if (!a) return;
      const title = a.querySelector('.ptitle')?.textContent ?? '';
      const match = ['rules', 'dial-section', 'tokens-section', 'components-section', 'themes-section', 'marks-section', 'contrast-section']
        .find((id) => title.toLowerCase().includes(id.split('-')[0]));
      if (match) document.getElementById(match)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      dial.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      hueRange.removeEventListener('input', onRangeInput);
      copyBtn.removeEventListener('click', onCopyClick);
      clearTimeout(copiedTimer);
      palette.destroy();
    };
  },
};

export default playground;
