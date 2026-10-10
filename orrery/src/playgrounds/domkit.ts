import type { Playground } from '../registry';
import { playgrounds } from '../registry';
import { readState, writeState, copyLink } from '../state';
// Each global.mjs registers its element (customElements.define) on import.
import '@johnhenry/domkit/code-editor/global.mjs';
import '@johnhenry/domkit/tabbed-ui/global.mjs';
import '@johnhenry/domkit/infinite-combo-box/global.mjs';
import '@johnhenry/domkit/stylable-select/global.mjs';
import '@johnhenry/domkit/cyclable/attribute-cycler/global.mjs';
import '@johnhenry/domkit/hot-key/global.mjs';
import '@johnhenry/domkit/drill-menu/global.mjs';
import '@johnhenry/domkit/swipe-input/global.mjs';
import '@johnhenry/domkit/code-editor/index.css';
import '@johnhenry/domkit/tabbed-ui/index.css';
import '@johnhenry/domkit/infinite-combo-box/index.css';
import '@johnhenry/domkit/stylable-select/index.css';
import '@johnhenry/domkit/drill-menu/index.css';
import type CodeEditor from '@johnhenry/domkit/code-editor';
import type TabbedUI from '@johnhenry/domkit/tabbed-ui';
import type InfiniteComboBox from '@johnhenry/domkit/infinite-combo-box';
import type StylableSelect from '@johnhenry/domkit/stylable-select';
import type AttributeCycler from '@johnhenry/domkit/cyclable/attribute-cycler';
import type DrillMenu from '@johnhenry/domkit/drill-menu';
import './domkit.css';

/**
 * Domkit Workshop: @johnhenry/domkit's custom elements, live.
 *
 * Every widget below is the real element from the package, registered by its
 * own `global.mjs`. The controls beside each one only set the element's
 * attributes and properties (the same ones its readme documents); the
 * readouts only read its documented properties and events.
 */

const ID = 'domkit';

const SAMPLES: Record<string, string> = {
  js: `// Tab indents, Enter keeps indentation, brackets auto-close.
function orbit(planet, { period = 1 } = {}) {
  const angle = (Date.now() / 1000 / period) % (2 * Math.PI);
  return { x: Math.cos(angle), y: Math.sin(angle), planet };
}
`,
  css: `/* The same tokenizer colors CSS. */
.planet:hover {
  transform: scale(1.1) rotate(4deg);
  box-shadow: 0 0 24px var(--accent);
}
`,
  html: `<!-- ...and HTML -->
<tabbed-ui>
  <div><button>One</button><button>Two</button></div>
  <section>First</section>
  <section>Second</section>
</tabbed-ui>
`,
};

const LETTERS = [['α', 'Alpha'], ['β', 'Beta'], ['γ', 'Gamma'], ['δ', 'Delta'], ['ε', 'Epsilon'], ['ζ', 'Zeta'], ['η', 'Eta'], ['θ', 'Theta'], ['ι', 'Iota'], ['κ', 'Kappa'], ['λ', 'Lambda'], ['μ', 'Mu'], ['ν', 'Nu'], ['ξ', 'Xi'], ['ο', 'Omicron'], ['π', 'Pi'], ['ρ', 'Rho'], ['σ', 'Sigma'], ['τ', 'Tau'], ['υ', 'Upsilon'], ['φ', 'Phi'], ['χ', 'Chi'], ['ψ', 'Psi'], ['ω', 'Omega']];
const CONSTELLATIONS = [['And', 'Andromedae'], ['Aql', 'Aquilae'], ['Aqr', 'Aquarii'], ['Ari', 'Arietis'], ['Aur', 'Aurigae'], ['Boo', 'Bootis'], ['Cnc', 'Cancri'], ['CMa', 'Canis Majoris'], ['Cap', 'Capricorni'], ['Car', 'Carinae'], ['Cas', 'Cassiopeiae'], ['Cen', 'Centauri'], ['Cep', 'Cephei'], ['Cet', 'Ceti'], ['Cyg', 'Cygni'], ['Dra', 'Draconis'], ['Eri', 'Eridani'], ['Gem', 'Geminorum'], ['Her', 'Herculis'], ['Hya', 'Hydrae'], ['Leo', 'Leonis'], ['Lib', 'Librae'], ['Lyr', 'Lyrae'], ['Oph', 'Ophiuchi'], ['Ori', 'Orionis'], ['Peg', 'Pegasi'], ['Per', 'Persei'], ['Psc', 'Piscium'], ['Sco', 'Scorpii'], ['Sgr', 'Sagittarii'], ['Tau', 'Tauri'], ['UMa', 'Ursae Majoris'], ['Vir', 'Virginis']];
/** Every Greek letter × 33 constellations: 792 Bayer-style designations (generated, so not every one is a real star). */
const STARS = CONSTELLATIONS.flatMap(([abbr, gen]) => LETTERS.map(([sym, name]) => ({ value: `${name.slice(0, 3).toLowerCase()}-${abbr}`, label: `${sym} ${gen} · ${name} ${gen}` })));

/** The swipe surface sits inside each panel, not around the tabs: <swipe-input> captures the pointer, so a click on a button inside it is retargeted to the swipe-input itself. */
const MOONS: [string, string, number][] = [['Io', 'volcanic · 1.77 days', 40], ['Europa', 'ice shell · 3.55 days', 200], ['Ganymede', 'largest moon · 7.15 days', 280], ['Callisto', 'cratered · 16.7 days', 120]];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The element's opening tag, as it stands now (its own attributes; the ARIA wiring it adds is left out). */
function openingTag(el: Element): string {
  const attrs = [...el.attributes].filter((a) => !/^(role|aria-|tabindex|style|class|id$|data-)/.test(a.name)).map((a) => (a.value === '' ? ` ${a.name}` : ` ${a.name}="${a.value.length > 32 ? `${a.value.slice(0, 28).replace(/\n/g, '⏎')}…` : a.value}"`)).join('');
  return `<${el.localName}${attrs}>`;
}

function logger(list: HTMLElement, max = 8) {
  return (html: string) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="t">${new Date().toLocaleTimeString([], { hour12: false })}</span> ${html}`;
    list.prepend(li);
    while (list.children.length > max) list.lastElementChild!.remove();
  };
}

const playground: Playground = {
  id: ID,
  title: 'Domkit Workshop',
  pkg: '@johnhenry/domkit',
  hue: 13,
  blurb: 'Custom elements that behave like native ones: a form-associated code editor, tabs, a paged combo box, a stylable select, a theme cycler, hot keys and swipes.',
  docs: 'https://opensource.johnhenry.me/domkit/',
  mount(host) {
    const defaults = { tab: 0, lang: 'js', wrap: 'soft' };
    const st = readState(defaults);
    if (!(st.lang in SAMPLES)) st.lang = 'js';
    const offs: (() => void)[] = [];
    const on = (t: EventTarget, type: string, fn: (e: Event) => void) => { t.addEventListener(type, fn); offs.push(() => t.removeEventListener(type, fn)); };

    const planetOptions = playgrounds.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('');
    const richOptions = playgrounds.slice(0, 14).map((p) => `<div role="option" data-value="${p.id}"><span class="dk-sw" style="--h:${p.hue}"></span><span>${esc(p.title)}</span><small>${esc(p.pkg)}</small></div>`);

    const root = document.createElement('div');
    root.className = 'pg-domkit';
    root.innerHTML = `
      <div class="dk-bar">
        <p class="hint">The tabs below are themselves a <code>&lt;tabbed-ui&gt;</code>: <kbd>←</kbd> <kbd>→</kbd> <kbd>Home</kbd> <kbd>End</kbd> move between them. Press <kbd>?</kbd> for this planet's shortcuts (a <code>&lt;hot-key&gt;</code>).</p>
        <button class="btn" data-copy>copy link</button>
      </div>
      <tabbed-ui class="dk-tabs" data-dk-main>
        <div class="dk-tablist">
          <button data-tab="code-editor">&lt;code-editor&gt;</button>
          <button data-tab="combo">&lt;infinite-combo-box&gt;</button>
          <button data-tab="select">&lt;stylable-select&gt;</button>
          <button data-tab="cycler">&lt;attribute-cycler&gt;</button>
          <button data-tab="more">hot-key · drill-menu · swipe-input</button>
        </div>

        <section class="dk-panel" data-panel="code-editor">
          <div class="grid-2">
            <form class="dk-stage" data-ce-form>
              <label for="dk-code" class="dk-label">snippet <span class="hint">(a form field: <code>name="snippet"</code>)</span></label>
              <code-editor id="dk-code" name="snippet" language="${st.lang}" rows="8" required placeholder="Write some code…"></code-editor>
              <div class="dk-row">
                <button class="btn primary" type="submit">submit the form</button>
                <button class="btn" type="reset">form.reset()</button>
                <span class="stat" data-ce-valid></span>
              </div>
              <pre class="code dk-small" data-ce-submit>Submit to see the FormData the editor contributes.</pre>
            </form>
            <div class="dk-controls">
              <pre class="code dk-tag" data-ce-tag></pre>
              <div class="dk-row">
                <label class="field">language <select data-ce="language"><option>js</option><option>css</option><option>html</option><option value="json">json (as js)</option><option value="ts">ts (as js)</option></select></label>
                <label class="field">wrap <select data-ce="wrap"><option value="soft">soft (default)</option><option value="off">off (scroll sideways)</option></select></label>
              </div>
              <label class="field">placeholder <input data-ce="placeholder" value="Write some code…"></label>
              <div class="dk-row">
                <label class="field">rows <input data-ce="rows" type="number" min="1" max="30" value="8"></label>
                <label class="field">tab-size <input data-ce="tab-size" type="number" min="1" max="8" value="2"></label>
              </div>
              <div class="dk-checks">
                <label><input type="checkbox" data-ce-bool="required" checked> required</label>
                <label><input type="checkbox" data-ce-bool="readonly"> readonly</label>
                <label><input type="checkbox" data-ce-bool="disabled"> disabled</label>
                <label><input type="checkbox" data-ce-bool="no-auto-close"> no-auto-close</label>
              </div>
              <div class="dk-row"><button class="btn" data-ce-sample>load the sample for this language</button><button class="btn" data-ce-clear>value = ""</button></div>
              <p class="stat" data-ce-stats></p>
              <ul class="dk-log" data-ce-log></ul>
            </div>
          </div>
          <p class="hint">A real <code>&lt;textarea&gt;</code> does the editing (so caret, IME, undo and screen readers are the browser's own), with a mirror painting the highlights through the CSS Custom Highlight API. It is form-associated through <code>ElementInternals</code>: <code>new FormData(form)</code> includes it, <code>required</code> makes the form invalid while it is empty, and <code>form.reset()</code> restores its default. <kbd>Esc</kbd> then <kbd>Tab</kbd> moves focus out.</p>
        </section>

        <section class="dk-panel" data-panel="combo">
          <div class="grid-2">
            <form class="dk-stage" data-cb-form>
              <label for="dk-star" class="dk-label">star <span class="hint">(a <code>searchFunction</code> over ${STARS.length} designations, paged)</span></label>
              <infinite-combo-box id="dk-star" name="star" placeholder="Try “alpha”, “lyr”, or “ω”"></infinite-combo-box>
              <label for="dk-jump" class="dk-label">jump to a planet <span class="hint">(local <code>&lt;option&gt;</code>s, filtered by the element)</span></label>
              <infinite-combo-box id="dk-jump" name="planet" placeholder="Planet name…">${planetOptions}</infinite-combo-box>
              <p class="stat" data-cb-jump></p>
              <p class="stat" data-cb-form-data></p>
            </form>
            <div class="dk-controls">
              <pre class="code dk-tag" data-cb-tag></pre>
              <label class="field">simulated latency: <b data-cb-lat-v>300 ms</b><input type="range" min="0" max="1500" step="50" value="300" data-cb-lat></label>
              <div class="dk-row">
                <label class="field">page size <select data-cb-page><option>10</option><option selected>20</option><option>50</option></select></label>
                <label class="field">min-length <input type="number" min="0" max="4" value="0" data-cb="min-length"></label>
                <label class="field">debounce (ms) <input type="number" min="0" max="1000" step="50" value="200" data-cb="debounce"></label>
              </div>
              <div class="dk-checks">
                <label><input type="checkbox" data-cb-bool="allow-custom"> allow-custom</label>
                <label><input type="checkbox" data-cb-bool="inline"> inline (no popover)</label>
                <label><input type="checkbox" data-cb-bool="required"> required</label>
              </div>
              <p class="stat" data-cb-stats></p>
              <ul class="dk-log" data-cb-log></ul>
            </div>
          </div>
          <p class="hint">The search function gets <code>{ signal, cursor }</code> and returns <code>{ options, next, total }</code>. Typing again aborts the search in flight (raise the latency and watch for <em>aborted</em>), and the next page loads when the list scrolls or the keyboard reaches its end. The second box needs no script: it filters its own <code>&lt;option&gt;</code> children.</p>
        </section>

        <section class="dk-panel" data-panel="select">
          <div class="grid-2">
            <form class="dk-stage" data-ss-form>
              <label for="dk-select" class="dk-label">planets <span class="hint">(<code>role="option"</code> elements with rich content)</span></label>
              <stylable-select id="dk-select" name="planets" size="6">
                <optgroup label="inner orbits">${richOptions.slice(0, 7).join('')}</optgroup>
                <optgroup label="outer orbits">${richOptions.slice(7).join('')}</optgroup>
              </stylable-select>
            </form>
            <div class="dk-controls">
              <pre class="code dk-tag" data-ss-tag></pre>
              <div class="dk-checks">
                <label><input type="checkbox" data-ss-bool="multiple"> multiple</label>
                <label><input type="checkbox" data-ss-bool="required"> required</label>
                <label><input type="checkbox" data-ss-bool="disabled"> disabled</label>
              </div>
              <label class="field">size (visible rows) <input type="number" min="2" max="14" value="6" data-ss-size></label>
              <div class="dk-row">
                <button class="btn" data-ss-add>add(option)</button>
                <button class="btn" data-ss-remove>remove(0)</button>
                <button class="btn" data-ss-value>value = "${playgrounds[2].id}"</button>
              </div>
              <p class="stat" data-ss-stats></p>
              <ul class="dk-log" data-ss-log></ul>
            </div>
          </div>
          <p class="hint">It reads and writes like a native listbox <code>&lt;select&gt;</code>: <code>value</code>, <code>selectedIndex</code>, <code>selectedOptions</code>, <code>add()</code>/<code>remove()</code>, form data, <code>required</code>, and reset. Options can be any element with <code>role="option"</code>, so they hold markup a native option can't (yet). In <code>multiple</code> mode a click toggles an option.</p>
        </section>

        <section class="dk-panel" data-panel="cycler">
          <div class="grid-2">
            <div class="dk-stage">
              <div class="dk-tone-card" data-tone-target>
                <div class="dk-tone-sky"><span class="dk-tone-planet"></span><span class="dk-tone-moon"></span></div>
                <p><b>Preview card.</b> Its <code>data-tone</code> attribute is set by the cycler, and CSS does the rest.</p>
              </div>
              <attribute-cycler id="dk-tone" target="[data-tone-target]" attribute="data-tone" values="ember,tide,moss,dusk" storage-key="orrery:domkit:tone">
                <div class="dk-row">
                  <button type="button" data-cycle="previous" class="btn">‹ previous</button>
                  <button type="button" class="btn primary" data-ac-next>tone: <output></output> ›</button>
                  <button type="button" data-cycle="reset" class="btn">reset</button>
                </div>
                <div class="dk-row dk-pressed">
                  <button type="button" class="btn" value="ember">ember</button>
                  <button type="button" class="btn" value="tide">tide</button>
                  <button type="button" class="btn" value="moss">moss</button>
                  <button type="button" class="btn" value="dusk">dusk</button>
                </div>
              </attribute-cycler>
              <p class="hint">Buttons outside the element drive it with invoker commands (<code>commandfor="dk-tone" command="--next"</code>, native in current browsers):</p>
              <div class="dk-row">
                <button type="button" class="btn" commandfor="dk-tone" command="--previous">--previous</button>
                <button type="button" class="btn" commandfor="dk-tone" command="--next">--next</button>
                <button type="button" class="btn" commandfor="dk-tone" command="--set" value="dusk">--set dusk</button>
              </div>
              <hot-key hotkey="]" commandfor="dk-tone" command="--next"></hot-key>
              <hot-key hotkey="[" commandfor="dk-tone" command="--previous"></hot-key>
            </div>
            <div class="dk-controls">
              <pre class="code dk-tag" data-ac-tag></pre>
              <label class="field">values (comma-separated) <input data-ac-values value="ember,tide,moss,dusk"></label>
              <div class="dk-checks"><label><input type="checkbox" data-ac-disabled> disabled</label></div>
              <p class="stat" data-ac-stats></p>
              <ul class="dk-log" data-ac-log></ul>
            </div>
          </div>
          <p class="hint">The choice is stored in <code>localStorage</code> under <code>storage-key</code>, restored before anything is clicked, and kept in sync across tabs: open this planet in a second tab and cycle there. <kbd>[</kbd> and <kbd>]</kbd> are two <code>&lt;hot-key&gt;</code>s sending <code>--previous</code>/<code>--next</code> to it. It targets only the preview card here, not the site's own theme.</p>
        </section>

        <section class="dk-panel" data-panel="more">
          <div class="grid-2">
            <div class="dk-stage">
              <h4>&lt;drill-menu&gt;</h4>
              <drill-menu id="dk-drill" class="dk-drill">
                <button data-key="display">Display
                  <template>
                    <h5>Display</h5>
                    <label class="field">brightness <input type="range" min="0" max="100" value="60"></label>
                    <p class="hint">A <code>&lt;template&gt;</code> screen: cloned fresh each time, so this slider resets.</p>
                    <button class="btn" data-back>‹ back</button>
                  </template>
                </button>
                <button data-key="alerts">Notifications</button>
                <section data-screen="alerts">
                  <h5>Notifications</h5>
                  <label><input type="checkbox" checked> conjunction alerts</label><br>
                  <label><input type="checkbox"> test failures</label>
                  <p class="hint">A live <code>data-screen</code>: shown and hidden in place, so these checkboxes keep their state.</p>
                  <button class="btn" data-back>‹ back</button>
                </section>
                <a href="https://opensource.johnhenry.me/domkit/" target="_blank" rel="noopener">Docs ↗ (a leaf)</a>
              </drill-menu>
              <div class="dk-row">
                <button class="btn" data-drill-push>push("display")</button>
                <button class="btn" data-drill-pop>pop()</button>
              </div>
              <ul class="dk-log" data-drill-log></ul>
            </div>
            <div class="dk-stage">
              <h4>&lt;swipe-input&gt; driving a &lt;tabbed-ui&gt;</h4>
              <tabbed-ui id="dk-moons" class="dk-moons">
                <div><button>Io</button><button>Europa</button><button>Ganymede</button><button>Callisto</button></div>
                ${MOONS.map(([name, note, h]) => `<section style="--h:${h}"><swipe-input class="dk-swipe" commandfor="dk-moons" left="--next" right="--previous"><b>${name}</b><span>${note}</span></swipe-input></section>`).join('')}
              </tabbed-ui>
              <p class="hint">Swipe the card left or right (touch, pen or a mouse drag): each swipe sends <code>--next</code>/<code>--previous</code> to the tabs.</p>
              <ul class="dk-log" data-swipe-log></ul>
            </div>
          </div>
          <p class="hint"><code>&lt;hot-key&gt;</code> shortcuts without a modifier don't fire while you type in a field. Its dialog stays fully native: <code>showModal()</code>, focus trapping and return, and <code>closedby="any"</code> light dismiss (polyfilled where missing).</p>
        </section>
      </tabbed-ui>
      <hot-key hotkey="?" data-help>
        <dialog closedby="any" class="dk-dialog">
          <form method="dialog">
            <h4>Shortcuts on this planet</h4>
            <ul>
              <li><kbd>?</kbd> this dialog: a <code>&lt;hot-key&gt;</code> around a native <code>&lt;dialog&gt;</code></li>
              <li><kbd>[</kbd> / <kbd>]</kbd> previous / next tone: hot-keys with <code>commandfor</code></li>
              <li><kbd>←</kbd> <kbd>→</kbd> <kbd>Home</kbd> <kbd>End</kbd> on a tab: move between tabs</li>
              <li><kbd>Esc</kbd> then <kbd>Tab</kbd>: leave the code editor</li>
            </ul>
            <button class="btn">close</button>
          </form>
        </dialog>
      </hot-key>`;
    host.appendChild(root);

    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
    const tabs = $<TabbedUI>('[data-dk-main]');
    tabs.selectedIndex = Math.max(0, Math.min(4, Number(st.tab) || 0));
    on(tabs, 'change', () => { st.tab = tabs.selectedIndex; writeState(st, defaults); });
    on($('[data-copy]'), 'click', async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      await copyLink(); b.textContent = 'copied'; setTimeout(() => { b.textContent = 'copy link'; }, 1200);
    });

    /* ---------------- code-editor ---------------- */
    const ce = $<CodeEditor>('#dk-code');
    const ceForm = $<HTMLFormElement>('[data-ce-form]');
    const ceStats = $('[data-ce-stats]');
    const ceValid = $('[data-ce-valid]');
    const ceLog = logger($('[data-ce-log]'));
    ce.defaultValue = SAMPLES[st.lang] ?? SAMPLES.js;
    ce.value = ce.defaultValue;
    ce.setAttribute('wrap', st.wrap === 'off' ? 'off' : 'soft');
    $<HTMLSelectElement>('[data-ce="language"]').value = st.lang;
    $<HTMLSelectElement>('[data-ce="wrap"]').value = st.wrap === 'off' ? 'off' : 'soft';
    function ceRefresh() {
      $('[data-ce-tag]').textContent = openingTag(ce);
      const toks = ce.tokens();
      const kinds: Record<string, number> = {};
      for (const t of toks) kinds[t.type] = (kinds[t.type] ?? 0) + 1;
      const fd = new FormData(ceForm).get('snippet');
      ceStats.innerHTML = `resolvedLanguage <b>${ce.resolvedLanguage ?? 'null'}</b> · textLength <b>${ce.textLength}</b> · tokens <b>${toks.length}</b> (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}) · FormData.get("snippet") <b data-ce-fd>${fd === null ? 'null (not submitted)' : `${String(fd).length} chars`}</b>`;
      const valid = ce.checkValidity();
      ceValid.innerHTML = `validity.valid <b class="${valid ? 'ok' : 'bad'}" data-ce-validity>${valid}</b>${valid ? '' : ` · ${esc(ce.validationMessage)}`}`;
    }
    const ceObs = new MutationObserver(() => ceRefresh());
    ceObs.observe(ce, { attributes: true });
    offs.push(() => ceObs.disconnect());
    on(ce, 'input', (e) => { ceLog(`<b>input</b> ${esc((e as InputEvent).inputType || '')}`); ceRefresh(); });
    on(ce, 'change', () => { ceLog('<b>change</b> (committed on blur)'); ceRefresh(); });
    on(ce, 'invalid', () => ceLog('<b>invalid</b>'));
    on(ceForm, 'submit', (e) => {
      e.preventDefault();
      const entries = Object.fromEntries(new FormData(ceForm));
      $('[data-ce-submit]').textContent = `submit → new FormData(form):\n${JSON.stringify(entries, null, 2)}`;
      ceLog('<b>submit</b>');
    });
    on(ceForm, 'reset', () => { ceLog('<b>reset</b> → defaultValue'); setTimeout(ceRefresh); });
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-ce]').forEach((c) => on(c, 'input', () => {
      const attr = c.dataset.ce!;
      ce.setAttribute(attr, c.value);
      if (attr === 'language') { st.lang = c.value; writeState(st, defaults); }
      if (attr === 'wrap') { st.wrap = c.value; writeState(st, defaults); }
      ceRefresh();
    }));
    root.querySelectorAll<HTMLInputElement>('[data-ce-bool]').forEach((c) => on(c, 'change', () => { ce.toggleAttribute(c.dataset.ceBool!, c.checked); ceRefresh(); }));
    on($('[data-ce-sample]'), 'click', () => {
      const lang = ce.resolvedLanguage ?? 'js';
      ce.value = SAMPLES[lang] ?? SAMPLES.js; ce.defaultValue = ce.value; ceRefresh();
    });
    on($('[data-ce-clear]'), 'click', () => { ce.value = ''; ceRefresh(); });
    ceRefresh();
    const ceT = window.setTimeout(ceRefresh, 50);
    offs.push(() => clearTimeout(ceT));

    /* ---------------- infinite-combo-box ---------------- */
    const star = $<InfiniteComboBox>('#dk-star');
    const jump = $<InfiniteComboBox>('#dk-jump');
    const cbForm = $<HTMLFormElement>('[data-cb-form]');
    const cbLog = logger($('[data-cb-log]'), 10);
    const cbStats = $('[data-cb-stats]');
    const lat = $<HTMLInputElement>('[data-cb-lat]');
    const pageSel = $<HTMLSelectElement>('[data-cb-page]');
    let calls = 0;
    star.setAttribute('debounce', '200');
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const timers = new Set<number>();
    offs.push(() => { for (const t of timers) clearTimeout(t); });
    star.searchFunction = (query, { signal, cursor }) => new Promise((resolve, reject) => {
      const n = ++calls;
      const offset = Number(cursor) || 0;
      const size = Number(pageSel.value);
      cbLog(`#${n} search <code>${esc(JSON.stringify(query))}</code> cursor <code>${esc(JSON.stringify(cursor))}</code>`);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        const q = norm(query.trim());
        const hits = q ? STARS.filter((s) => norm(s.label).includes(q) || s.value.toLowerCase().includes(q)) : STARS;
        const page = hits.slice(offset, offset + size);
        const next = offset + size < hits.length ? String(offset + size) : null;
        cbLog(`#${n} → ${page.length} of ${hits.length}${next ? `, next cursor <code>"${next}"</code>` : ', no more'}`);
        resolve({ options: page, next, total: hits.length });
        setTimeout(cbRefresh, 0); // the readouts follow the list once the element has rendered the page
      }, Number(lat.value));
      timers.add(timer);
      signal.addEventListener('abort', () => {
        clearTimeout(timer); timers.delete(timer);
        cbLog(`#${n} <b class="bad">aborted</b> (a newer search started)`);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
    offs.push(() => { star.searchFunction = null; });
    function cbRefresh() {
      $('[data-cb-tag]').textContent = `${openingTag(star)}\n  .searchFunction = async (query, { signal, cursor }) => …`;
      $('[data-cb-lat-v]').textContent = `${lat.value} ms`;
      cbStats.innerHTML = `value <b data-cb-value>${esc(JSON.stringify(star.value))}</b> · text <b>${esc(JSON.stringify(star.text))}</b> · options loaded <b data-cb-length>${star.length}</b> · hasMore <b>${star.hasMore}</b> · open <b>${star.open}</b>`;
      const fd = new FormData(cbForm);
      $('[data-cb-form-data]').innerHTML = `form data: star <b>${esc(JSON.stringify(fd.get('star')))}</b> · planet <b>${esc(JSON.stringify(fd.get('planet')))}</b> · form valid <b>${cbForm.checkValidity()}</b>`;
    }
    for (const t of ['input', 'change', 'toggle']) on(star, t, () => { if (t !== 'toggle') cbLog(`<b>${t}</b> value=<code>${esc(JSON.stringify(star.value))}</code>`); cbRefresh(); });
    on(star, 'error', () => cbLog('<b class="bad">error</b>'));
    on(jump, 'change', () => {
      const p = playgrounds.find((x) => x.id === jump.value);
      $('[data-cb-jump]').innerHTML = p ? `chose <b>${esc(p.title)}</b>: <a href="#/${p.id}">go to #/${p.id} →</a>` : '';
      cbRefresh();
    });
    on(lat, 'input', cbRefresh);
    root.querySelectorAll<HTMLInputElement>('[data-cb]').forEach((c) => on(c, 'input', () => { star.setAttribute(c.dataset.cb!, c.value); cbRefresh(); }));
    root.querySelectorAll<HTMLInputElement>('[data-cb-bool]').forEach((c) => on(c, 'change', () => { star.toggleAttribute(c.dataset.cbBool!, c.checked); cbRefresh(); }));
    const cbObs = new MutationObserver(cbRefresh);
    cbObs.observe(star, { attributes: true, attributeFilter: ['min-length', 'debounce', 'allow-custom', 'inline', 'required', 'open'] });
    offs.push(() => cbObs.disconnect());
    cbRefresh();

    /* ---------------- stylable-select ---------------- */
    const ss = $<StylableSelect>('#dk-select');
    const ssForm = $<HTMLFormElement>('[data-ss-form]');
    const ssLog = logger($('[data-ss-log]'));
    let added = 14;
    function ssRefresh() {
      $('[data-ss-tag]').textContent = openingTag(ss);
      const fd = new FormData(ssForm).getAll('planets');
      $('[data-ss-stats]').innerHTML = `type <b>${ss.type}</b> · value <b data-ss-current>${esc(JSON.stringify(ss.value))}</b> · selectedIndex <b>${ss.selectedIndex}</b> · selectedOptions <b>${esc(JSON.stringify(ss.selectedOptions.map((o) => o.getAttribute('data-value'))))}</b> · length <b>${ss.length}</b> · FormData.getAll <b>${esc(JSON.stringify(fd))}</b> · valid <b>${ss.checkValidity()}</b>`;
    }
    on(ss, 'change', () => { ssLog(`<b>change</b> → ${esc(JSON.stringify(ss.selectedOptions.map((o) => o.getAttribute('data-value'))))}`); ssRefresh(); });
    on(ss, 'input', () => ssLog('<b>input</b>'));
    root.querySelectorAll<HTMLInputElement>('[data-ss-bool]').forEach((c) => on(c, 'change', () => { ss.toggleAttribute(c.dataset.ssBool!, c.checked); ssRefresh(); }));
    on($('[data-ss-size]'), 'input', (e) => { ss.setAttribute('size', (e.target as HTMLInputElement).value); ssRefresh(); });
    on($('[data-ss-add]'), 'click', () => {
      const p = playgrounds[added++ % playgrounds.length];
      const o = document.createElement('div');
      o.setAttribute('role', 'option'); o.dataset.value = p.id;
      o.innerHTML = `<span class="dk-sw" style="--h:${p.hue}"></span><span>${esc(p.title)}</span><small>${esc(p.pkg)}</small>`;
      ss.add(o); ssLog(`add(<code>${esc(p.id)}</code>)`); ssRefresh();
    });
    on($('[data-ss-remove]'), 'click', () => { if (ss.length) { ss.remove(0); ssLog('remove(0)'); ssRefresh(); } });
    on($('[data-ss-value]'), 'click', () => { ss.value = playgrounds[2].id; ssLog(`value = <code>"${esc(playgrounds[2].id)}"</code> (script: no event)`); ssRefresh(); });
    const ssObs = new MutationObserver(ssRefresh);
    ssObs.observe(ss, { attributes: true, attributeFilter: ['multiple', 'size', 'required', 'disabled'] });
    offs.push(() => ssObs.disconnect());
    ssRefresh();

    /* ---------------- attribute-cycler ---------------- */
    const ac = $<AttributeCycler>('#dk-tone');
    const acLog = logger($('[data-ac-log]'));
    function acRefresh() {
      $('[data-ac-tag]').textContent = openingTag(ac);
      let stored: string | null = null;
      try { stored = localStorage.getItem('orrery:domkit:tone'); } catch {}
      $('[data-ac-stats]').innerHTML = `value <b data-ac-value>${esc(JSON.stringify(ac.value))}</b> · values <b>${esc(JSON.stringify(ac.values))}</b> · targets <b>${ac.targets.length}</b> · localStorage <b>${esc(JSON.stringify(stored))}</b>`;
    }
    on(ac, 'change', () => { acLog(`<b>change</b> → <code>${esc(ac.value)}</code>`); acRefresh(); });
    on($('[data-ac-values]'), 'change', (e) => { ac.setAttribute('values', (e.target as HTMLInputElement).value); acRefresh(); });
    on($('[data-ac-disabled]'), 'change', (e) => { ac.disabled = (e.target as HTMLInputElement).checked; acRefresh(); });
    const acObs = new MutationObserver(acRefresh);
    acObs.observe(ac, { attributes: true });
    acObs.observe($('[data-tone-target]'), { attributes: true, attributeFilter: ['data-tone'] });
    offs.push(() => acObs.disconnect());
    acRefresh();

    /* ---------------- drill-menu + swipe-input ---------------- */
    const drill = $<DrillMenu>('#dk-drill');
    const drillLog = logger($('[data-drill-log]'), 5);
    on(drill, 'push', (e) => drillLog(`<b>push</b> ${esc(JSON.stringify((e as CustomEvent).detail?.key))} · screen=<code>${esc(String(drill.getAttribute('screen')))}</code>`));
    on(drill, 'pop', (e) => drillLog(`<b>pop</b> ${esc(JSON.stringify((e as CustomEvent).detail?.key))}`));
    on($('[data-drill-push]'), 'click', () => drill.push('display'));
    on($('[data-drill-pop]'), 'click', () => drill.pop());
    const swipeLog = logger($('[data-swipe-log]'), 5);
    on($('.dk-moons'), 'swipe', (e) => {
      const d = (e as CustomEvent<{ direction: string; distance: number }>).detail;
      swipeLog(`<b>swipe</b> ${esc(d.direction)} · ${Math.round(d.distance)}px`);
    });

    return () => { for (const off of offs) { try { off(); } catch {} } root.remove(); };
  },
};

export default playground;
