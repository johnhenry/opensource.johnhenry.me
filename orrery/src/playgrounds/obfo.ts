import type { Playground } from '../registry';
import obfo, { fill, observe, formFromObject, type Cast, type JsonValue } from '@johnhenry/obfo';
import { readState, writeState, copyLink } from '../state';
import { handoffButton } from '../bus';
import './obfo.css';

/**
 * Form Lab: @johnhenry/obfo, live.
 *
 * Every value on this page comes from the real package: `obfo()` reads the
 * form, `observe()` re-reads it on every edit, `fill()` writes JSON back into
 * it, and `formFromObject()` builds a brand-new form from JSON. Nothing here
 * re-implements the walking or the casts; the cast table at the bottom is
 * computed by calling `obfo()` on tiny one-field forms.
 */

const ID = 'obfo';

const PROFILE_FORM = `<label class="fl-f">name <input name="name" value="Ada Lovelace"></label>
<label class="fl-f">age <input name="age" type="number" value="36"></label>
<label class="fl-f">volume <input name="volume" type="range" min="0" max="100" value="70"></label>
<label class="fl-check"><input name="subscribe" type="checkbox" checked> subscribe</label>
<fieldset class="fl-radios"><legend>plan (radio)</legend>
  <label><input type="radio" name="plan" value="free"> free</label>
  <label><input type="radio" name="plan" value="pro" checked> pro</label>
  <label><input type="radio" name="plan" value="team"> team</label>
</fieldset>
<label class="fl-f">languages (select multiple)
  <select name="languages" multiple size="4">
    <option selected>js</option><option>css</option><option selected>html</option><option>wasm</option>
  </select>
</label>
<label class="fl-f">born <input name="born" type="date" value="1815-12-10"></label>
<fieldset class="fl-box" data-obfo-container="{}" data-obfo-name="address">
  <legend>address <code>{}</code></legend>
  <label class="fl-f">street <input name="street" value="12 St James's Square"></label>
  <label class="fl-f">city <input name="city" value="London"></label>
  <fieldset class="fl-box" data-obfo-container="{}" data-obfo-name="geo">
    <legend>geo <code>{}</code></legend>
    <label class="fl-f">lat <input name="lat" type="number" step="any" value="51.507"></label>
    <label class="fl-f">lng <input name="lng" type="number" step="any" value="-0.134"></label>
  </fieldset>
</fieldset>
<fieldset class="fl-box" data-obfo-container="[]" data-obfo-name="tags">
  <legend>tags <code>[]</code></legend>
  <input value="mathematics"> <input value="engines"> <input value="poetry">
</fieldset>
<fieldset class="fl-box" data-obfo-container="[]" data-obfo-name="projects">
  <legend>projects <code>[]</code> of <code>{}</code></legend>
  <div class="fl-row" data-obfo-container="{}">
    <input name="title" value="Notes on the Analytical Engine"> <input name="year" type="number" value="1843">
    <label class="fl-check"><input name="published" type="checkbox" checked> published</label>
  </div>
  <div class="fl-row" data-obfo-container="{}">
    <input name="title" value="Flyology"> <input name="year" type="number" value="1828">
    <label class="fl-check"><input name="published" type="checkbox"> published</label>
  </div>
</fieldset>
<label class="fl-f">bio (textarea) <textarea name="bio" rows="2">Wrote the first published program.
Called herself an "analyst (&amp; metaphysician)".</textarea></label>
<p class="fl-note" data-obfo-value data-obfo-name="note">a &lt;p data-obfo-value&gt;: text that reads as a value</p>
<button type="submit">buttons are ignored</button>`;

const FILL_DEFAULT = `{
  "name": "Grace Hopper",
  "age": 85,
  "subscribe": false,
  "plan": "team",
  "languages": ["css", "wasm"],
  "address": { "city": "Arlington", "geo": { "lat": 38.88, "lng": -77.1 } },
  "tags": ["compilers", "COBOL"],
  "projects": [{ "title": "A-0 System", "year": 1952, "published": true }]
}`;

const GEN_PRESETS: Record<string, { label: string; value: JsonValue }> = {
  settings: {
    label: 'app settings',
    value: { theme: 'dark', fontSize: 14, autosave: true, recent: ['notes.md', 'todo.md'], editor: { tabSize: 2, wrap: false, ruler: null } },
  },
  recipe: {
    label: 'recipe',
    value: { title: 'Pancakes', serves: 4, vegetarian: true, ingredients: [{ item: 'flour', grams: 200 }, { item: 'milk', grams: 300 }, { item: 'eggs', grams: 100 }], method: 'Whisk.\nRest 10 min.\nFry.' },
  },
  points: {
    label: 'array of points',
    value: [{ x: 1, y: 2, label: 'a' }, { x: 3, y: 5, label: 'b' }, { x: 4, y: 1, label: 'c' }],
  },
};

const CAST_RULES: { label: string; html: string; note: string }[] = [
  { label: 'type="number"', html: '<input name="v" type="number" value="42">', note: 'a number' },
  { label: 'type="number" (empty)', html: '<input name="v" type="number" value="">', note: 'null, not 0' },
  { label: 'type="range"', html: '<input name="v" type="range" value="30">', note: 'a number' },
  { label: 'type="checkbox" checked', html: '<input name="v" type="checkbox" checked>', note: 'a boolean (checked)' },
  { label: 'type="checkbox"', html: '<input name="v" type="checkbox">', note: 'false, not "on"' },
  { label: 'radios sharing a name', html: '<input name="v" type="radio" value="s"><input name="v" type="radio" value="m" checked><input name="v" type="radio" value="l">', note: 'the checked one\'s value' },
  { label: 'select multiple', html: '<select name="v" multiple><option selected>js</option><option>css</option><option selected>html</option></select>', note: 'an array' },
  { label: 'type="date"', html: '<input name="v" type="date" value="2000-01-01">', note: 'the string as held' },
  { label: 'textarea', html: '<textarea name="v">two\nlines</textarea>', note: 'the text' },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const show = (v: unknown) => (v === undefined ? 'undefined' : JSON.stringify(v));

/** Flatten a value to path → leaf, for the "what changed" readout and the cast-mode diff. */
function flatten(v: unknown, prefix = '', out = new Map<string, unknown>()): Map<string, unknown> {
  if (v && typeof v === 'object' && !(v instanceof File)) {
    const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v as Record<string, unknown>);
    if (!entries.length) out.set(prefix || '(root)', v);
    for (const [k, x] of entries) flatten(x, Array.isArray(v) ? `${prefix}[${k}]` : prefix ? `${prefix}.${k}` : k, out);
  } else out.set(prefix || '(root)', v);
  return out;
}

/** Paths where `a` and `b` differ, recursing only while both sides are the same kind of container. */
function diffPaths(a: unknown, b: unknown, prefix = '', out: [string, unknown, unknown][] = []): [string, unknown, unknown][] {
  const kind = (v: unknown) => (Array.isArray(v) ? 'array' : v && typeof v === 'object' ? 'object' : 'leaf');
  if (kind(a) !== 'leaf' && kind(a) === kind(b)) {
    const isArr = Array.isArray(a);
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], isArr ? `${prefix}[${k}]` : prefix ? `${prefix}.${k}` : k, out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push([prefix || '(root)', a, b]);
  return out;
}

/** True when every leaf of `written` reads back identically from `read` (fill writes what is present and leaves the rest). */
function subsetMismatches(written: unknown, read: unknown): string[] {
  const r = flatten(read);
  const bad: string[] = [];
  for (const [path, value] of flatten(written)) if (JSON.stringify(r.get(path)) !== JSON.stringify(value)) bad.push(`${path}: wrote ${show(value)}, reads ${show(r.get(path))}`);
  return bad;
}

/** Keep the user's markup inert: no scripts, frames, or on* handlers (the markup box is local only and never put in the URL). */
function sanitize(html: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = html;
  t.content.querySelectorAll('script, iframe, object, embed, link, style, meta, base').forEach((n) => n.remove());
  t.content.querySelectorAll('*').forEach((n) => {
    for (const a of [...n.attributes]) if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
  });
  return t.content;
}

const playground: Playground = {
  id: ID,
  title: 'Form Lab',
  pkg: '@johnhenry/obfo',
  hue: 185,
  blurb: 'An HTML form read as a nested object while you type, written back from JSON, and generated from JSON.',
  docs: 'https://opensource.johnhenry.me/obfo/',
  mount(host) {
    const defaults = { cast: 'auto', gen: 'settings' };
    const st = readState(defaults);
    if (st.cast !== 'auto' && st.cast !== 'none') st.cast = 'auto';
    if (!(st.gen in GEN_PRESETS)) st.gen = 'settings';
    const opts = () => (st.cast === 'auto' ? { cast: 'auto' as Cast } : {});
    const offs: (() => void)[] = [];

    const root = document.createElement('div');
    root.className = 'pg-obfo';
    root.innerHTML = `
      <section class="panel fl-live">
        <div class="fl-head">
          <h3>1 · A form, read as an object while you type</h3>
          <div class="fl-seg" role="group" aria-label="cast mode">
            <button class="btn" data-cast="auto" aria-pressed="false"><code>{ cast: "auto" }</code></button>
            <button class="btn" data-cast="none" aria-pressed="false">no cast (strings)</button>
          </div>
          <button class="btn" data-copy title="Copy a link to this exact setup">copy link</button>
        </div>
        <div class="grid-2">
          <div>
            <form class="fl-form" data-obfo-container="{}" data-form>${PROFILE_FORM}</form>
            <details class="fl-markup">
              <summary>Edit the form's markup</summary>
              <p class="hint">Change the HTML (add a field, nest a <code>data-obfo-container</code>) and apply it. Scripts and <code>on*</code> attributes are stripped.</p>
              <textarea class="code" data-markup spellcheck="false"></textarea>
              <div class="fl-actions"><button class="btn primary" data-apply-markup>apply markup</button><button class="btn" data-restore-markup>restore the original</button></div>
            </details>
          </div>
          <div class="fl-out">
            <div class="fl-call"><code data-call></code></div>
            <pre class="code fl-json" data-live aria-live="polite"></pre>
            <p class="stat" data-change>edit a field…</p>
            <p class="stat"><b data-count>0</b> <code>observe()</code> callbacks · last event <b data-event>none yet</b></p>
            <details class="fl-diff" open>
              <summary>What <code>cast: "auto"</code> changes in this form</summary>
              <table class="fl-table" data-diff></table>
            </details>
            <pre class="code error" data-err hidden></pre>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>2 · <code>fill(form, object)</code>: JSON back into the same form</h3>
        <p class="hint"><code>fill</code> walks the same structure as <code>obfo</code> and writes what is present: keys you leave out keep their fields, arrays never grow, and with <code>{ dispatch: true }</code> it fires <code>input</code>/<code>change</code>, so the live object above updates too.</p>
        <div class="grid-2">
          <textarea class="code" data-fill spellcheck="false" aria-label="JSON to fill into the form"></textarea>
          <div>
            <div class="fl-actions">
              <button class="btn primary" data-do-fill>fill(form, value, { dispatch: true })</button>
              <button class="btn" data-take>copy the live object here</button>
              <button class="btn" data-reset>form.reset()</button>
            </div>
            <div class="fl-roundtrip" data-roundtrip>Press fill to write this JSON into the form above.</div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>3 · <code>formFromObject(json)</code>: a form generated from JSON</h3>
        <div class="fl-actions" data-gen-presets></div>
        <div class="grid-2">
          <div>
            <textarea class="code" data-gen spellcheck="false" aria-label="JSON to generate a form from"></textarea>
            <pre class="code error" data-gen-err hidden></pre>
          </div>
          <div>
            <div class="fl-generated" data-generated></div>
            <div class="fl-roundtrip" data-gen-check></div>
            <pre class="code fl-json small" data-gen-out></pre>
            <div class="fl-actions" data-gen-actions><button class="btn" data-gen-back>write the edited object back to the JSON</button></div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>The cast rules, computed live</h3>
        <p class="hint">Each row is a one-field form read twice by the real <code>obfo()</code>: with no options, and with <code>{ cast: "auto" }</code>.</p>
        <table class="fl-table fl-rules" data-rules><thead><tr><th>element</th><th>no cast</th><th><code>cast: "auto"</code></th><th></th></tr></thead><tbody></tbody></table>
      </section>

      <section class="panel what">
        <h3>What's happening</h3>
        <p>The form at the top is ordinary HTML with three kinds of <code>data-obfo-*</code> attributes. <code>data-obfo-container="{}"</code> and <code>"[]"</code> mark objects and arrays (a <code>fieldset</code> or <code>div</code> with a <code>data-obfo-name</code> becomes a key); every other wrapper (labels, legends, layout <code>div</code>s) is looked through; <code>data-obfo-value</code> reads a paragraph's text. <code>observe(form, cb, { cast, immediate: true })</code> calls back a task after each <code>input</code>, <code>change</code> or <code>reset</code>, so a checkbox click (input then change) is one update.</p>
        <p>Without a cast every value is a string, the way <code>FormData</code> would see it: the checkbox reads <code>"on"</code> whether or not it is checked, the radio group reads the last radio's value, and the multi-select only its first choice. <code>cast: "auto"</code> types each value by its input. <code>formFromObject</code> puts a per-input <code>data-obfo-cast</code> on what it builds, so its form reads back as the same JSON with no options at all.</p>
      </section>`;
    host.appendChild(root);

    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
    const form = $<HTMLFormElement>('[data-form]');
    const live = $('[data-live]');
    const callEl = $('[data-call]');
    const changeEl = $('[data-change]');
    const countEl = $('[data-count]');
    const eventEl = $('[data-event]');
    const diffEl = $<HTMLTableElement>('[data-diff]');
    const errEl = $('[data-err]');
    const markup = $<HTMLTextAreaElement>('[data-markup]');
    markup.value = PROFILE_FORM;
    form.addEventListener('submit', (e) => e.preventDefault());

    /* ---------- 1. live object ---------- */
    let count = 0;
    let prev: unknown = undefined;
    let stopObserve: () => void = () => {};

    function renderDiff() {
      try {
        const rows = diffPaths(obfo(form), obfo(form, { cast: 'auto' }));
        diffEl.innerHTML = rows.length
          ? `<thead><tr><th>path</th><th>no cast</th><th>auto</th></tr></thead><tbody>${rows.map(([k, a, b]) => `<tr><td><code>${esc(k)}</code></td><td><code>${esc(show(a))}</code></td><td><code>${esc(show(b))}</code></td></tr>`).join('')}</tbody>`
          : '<tbody><tr><td>No differences: every field here is text.</td></tr></tbody>';
      } catch (e) { diffEl.innerHTML = `<tbody><tr><td>${esc(String(e))}</td></tr></tbody>`; }
    }

    function onValue(value: unknown, event: Event | null) {
      errEl.hidden = true;
      count++;
      countEl.textContent = String(count);
      const t = event?.target as Element | null;
      eventEl.textContent = event ? `${event.type}${t && t !== form ? ` on ${t.getAttribute('name') ?? t.localName}` : ''}` : 'immediate';
      live.textContent = JSON.stringify(value, null, 2);
      if (prev !== undefined) {
        const changed = diffPaths(prev, value);
        changeEl.innerHTML = changed.length
          ? `changed: ${changed.slice(0, 4).map(([k, a, b]) => `<code>${esc(k)}</code> ${esc(show(a))} → <b>${esc(show(b))}</b>`).join(' · ')}${changed.length > 4 ? ` (+${changed.length - 4} more)` : ''}`
          : 'no value changed';
      }
      prev = value;
      renderDiff();
    }

    function startObserve() {
      stopObserve();
      prev = undefined;
      callEl.textContent = `observe(form, cb, { ${st.cast === 'auto' ? 'cast: "auto", ' : ''}immediate: true })`;
      root.querySelectorAll<HTMLButtonElement>('[data-cast]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cast === st.cast)));
      stopObserve = observe(form, onValue, {
        ...opts(),
        immediate: true,
        onError: (e) => { errEl.hidden = false; errEl.textContent = `obfo threw while reading: ${(e as Error)?.message ?? e}`; },
      });
    }
    try { startObserve(); } catch (e) { errEl.hidden = false; errEl.textContent = String(e); }
    offs.push(() => stopObserve());

    root.querySelectorAll<HTMLButtonElement>('[data-cast]').forEach((b) => b.addEventListener('click', () => {
      st.cast = b.dataset.cast as 'auto' | 'none';
      writeState(st, defaults);
      startObserve();
    }));
    $('[data-copy]').addEventListener('click', async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      await copyLink(); b.textContent = 'copied'; setTimeout(() => { b.textContent = 'copy link'; }, 1200);
    });
    function applyMarkup(html: string) {
      form.replaceChildren(sanitize(html));
      try { onValue(obfo(form, opts()), null); } catch (e) { errEl.hidden = false; errEl.textContent = `obfo threw: ${(e as Error).message}`; }
    }
    $('[data-apply-markup]').addEventListener('click', () => applyMarkup(markup.value));
    $('[data-restore-markup]').addEventListener('click', () => { markup.value = PROFILE_FORM; applyMarkup(PROFILE_FORM); });

    /* ---------- 2. fill ---------- */
    const fillBox = $<HTMLTextAreaElement>('[data-fill]');
    const rtEl = $('[data-roundtrip]');
    fillBox.value = FILL_DEFAULT;
    $('[data-do-fill]').addEventListener('click', () => {
      let value: unknown;
      try { value = JSON.parse(fillBox.value); } catch (e) {
        rtEl.className = 'fl-roundtrip bad'; rtEl.textContent = `Not JSON: ${(e as Error).message}`; return;
      }
      try {
        fill(form, value, { ...opts(), dispatch: true });
        const read = obfo(form, opts());
        const bad = subsetMismatches(value, read);
        rtEl.className = `fl-roundtrip ${bad.length ? 'warn' : 'ok'}`;
        rtEl.innerHTML = bad.length
          ? `<b>${bad.length} value${bad.length === 1 ? '' : 's'} did not read back:</b><ul>${bad.slice(0, 6).map((b) => `<li><code>${esc(b)}</code></li>`).join('')}</ul><p class="hint">${st.cast === 'auto' ? 'Usually a key the form has no field for, or an array longer than its inputs: fill never adds elements.' : 'With no cast, a checkbox has no state fill can restore, and numbers read back as strings. Switch to cast: "auto".'}</p>`
          : `<b>Round trip holds.</b> <code>obfo(form${st.cast === 'auto' ? ', { cast: "auto" }' : ''})</code> reads back every value you wrote (${flatten(value).size} leaves); fields you left out kept theirs.`;
      } catch (e) {
        rtEl.className = 'fl-roundtrip bad'; rtEl.textContent = `fill threw: ${(e as Error).message}`;
      }
    });
    $('[data-take]').addEventListener('click', () => { fillBox.value = JSON.stringify(obfo(form, opts()), null, 2); });
    $('[data-reset]').addEventListener('click', () => form.reset());

    /* ---------- 3. formFromObject ---------- */
    const genBox = $<HTMLTextAreaElement>('[data-gen]');
    const genErr = $('[data-gen-err]');
    const genHost = $('[data-generated]');
    const genOut = $('[data-gen-out]');
    const genCheck = $('[data-gen-check]');
    const presetsEl = $('[data-gen-presets]');
    let stopGen: () => void = () => {};
    let source: unknown = null;
    let lastGenValue: unknown = null;
    let toPlotSync: (() => void) | undefined;

    function renderPresets() {
      presetsEl.innerHTML = Object.entries(GEN_PRESETS).map(([k, p]) => `<button class="btn" data-preset="${k}" aria-pressed="${k === st.gen}">${esc(p.label)}</button>`).join('');
    }
    function generate() {
      stopGen();
      let value: unknown;
      try { value = JSON.parse(genBox.value); } catch (e) {
        genErr.hidden = false; genErr.textContent = `Not JSON yet: ${(e as Error).message}`; return;
      }
      try {
        const f = formFromObject(value as JsonValue[]);
        f.addEventListener('submit', (e) => e.preventDefault());
        genErr.hidden = true;
        source = value;
        genHost.replaceChildren(f);
        stopGen = observe(f, (v) => {
          lastGenValue = v;
          toPlotSync?.();
          genOut.textContent = `obfo(generatedForm) →\n${JSON.stringify(v, null, 2)}`;
          const same = JSON.stringify(v) === JSON.stringify(source);
          genCheck.className = `fl-roundtrip ${same ? 'ok' : 'warn'}`;
          genCheck.innerHTML = same
            ? '<b>Reads back as the same JSON</b>, with no options: each input carries its own <code>data-obfo-cast</code>.'
            : '<b>Edited.</b> The object below is what the form holds now; write it back to make it the new source.';
        }, { immediate: true });
      } catch (e) {
        genErr.hidden = false; genErr.textContent = `formFromObject threw: ${(e as Error).message}`;
      }
    }
    function loadPreset(k: string) {
      st.gen = k; writeState(st, defaults); renderPresets();
      genBox.value = JSON.stringify(GEN_PRESETS[k].value, null, 2);
      generate();
    }
    presetsEl.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('[data-preset]');
      if (b) loadPreset(b.dataset.preset!);
    });
    let genTimer = 0;
    genBox.addEventListener('input', () => { clearTimeout(genTimer); genTimer = window.setTimeout(generate, 250); });
    $('[data-gen-back]').addEventListener('click', () => { if (lastGenValue !== null) { genBox.value = JSON.stringify(lastGenValue, null, 2); generate(); } });
    // An array of flat rows (the "array of points" preset) can be plotted as-is.
    const isRows = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.length > 0 && v.every((r) => r && typeof r === 'object' && !Array.isArray(r) && Object.values(r).every((x) => x === null || typeof x !== 'object'));
    const toPlot = handoffButton({ from: ID, to: 'data-plot', kind: 'rows', label: 'Plot these rows in Data Plot Studio', getPayload: () => ({ rows: isRows(lastGenValue) ? lastGenValue : [], title: 'rows from Form Lab' }) });
    toPlot.title = 'Sends the generated form\'s current object (an array of flat rows) to the Data Plot planet';
    $('[data-gen-actions]').append(toPlot);
    const syncPlotButton = () => { toPlot.disabled = !isRows(lastGenValue); };
    toPlotSync = syncPlotButton;
    loadPreset(st.gen);
    syncPlotButton();
    offs.push(() => { stopGen(); clearTimeout(genTimer); });

    /* ---------- cast rules ---------- */
    const rulesBody = $<HTMLTableElement>('[data-rules]').tBodies[0];
    rulesBody.innerHTML = CAST_RULES.map((r) => {
      const f = document.createElement('form');
      f.setAttribute('data-obfo-container', '{}');
      f.innerHTML = r.html;
      let a = '', b = '';
      try { a = show(obfo<{ v: unknown }>(f).v); b = show(obfo<{ v: unknown }>(f, { cast: 'auto' }).v); } catch (e) { b = String(e); }
      return `<tr><td><code>${esc(r.label)}</code></td><td><code>${esc(a)}</code></td><td><code class="fl-auto">${esc(b)}</code></td><td class="hint">${esc(r.note)}</td></tr>`;
    }).join('');

    return () => { for (const off of offs) { try { off(); } catch {} } root.remove(); };
  },
};

export default playground;
