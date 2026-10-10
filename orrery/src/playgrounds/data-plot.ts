import type { Playground } from '../registry';
import '@johnhenry/data-plot/global.mjs'; // registers <data-plot>, <plot-marks>, <plot-line>, <plot-axis>, <plot-legend>, <chernoff-face>
import '@johnhenry/data-plot/index.css';
import '@johnhenry/data-plot/chernoff-face/index.css';
import type DataPlot from '@johnhenry/data-plot/data-plot';
import type PlotMarks from '@johnhenry/data-plot/plot-marks';
import { receive, handoffBanner } from '../bus';
import { readState, writeState, copyLink } from '../state';
import './data-plot.css';

/**
 * Data Plot Studio: @johnhenry/data-plot, live.
 *
 * The plot's data is the visible, editable <table> under it (`src="#dp-data"`):
 * edit a cell and the package's own MutationObserver redraws. Layers are the
 * package's real elements, toggled in and out of the frame, and every channel
 * select only sets a layer attribute. Nothing here computes a scale or a
 * position: `plot.scales` is read back after each `render` event.
 */

const ID = 'data-plot';
type Row = Record<string, string | number>;
type LayerId = 'dots' | 'bars' | 'line' | 'faces' | 'legend';
interface Preset {
  label: string;
  rows: Row[];
  x: string; y: string; color: string; size: string;
  layers: LayerId[];
  yDomain?: string;
  xDomain?: string;
  xLabel?: string; yLabel?: string;
  faces?: { smile: string; brow: string; eyes: string };
  note: string;
}

const PRESETS: Record<string, Preset> = {
  cities: {
    label: 'rain vs sun (scatter)',
    rows: [
      { city: 'Lisbon', continent: 'Europe', rain: 690, sun: 2800, people: 0.5 },
      { city: 'Oslo', continent: 'Europe', rain: 760, sun: 1670, people: 0.7 },
      { city: 'London', continent: 'Europe', rain: 600, sun: 1410, people: 8.9 },
      { city: 'Mumbai', continent: 'Asia', rain: 2200, sun: 2580, people: 20.4 },
      { city: 'Tokyo', continent: 'Asia', rain: 1530, sun: 1880, people: 37.4 },
      { city: 'Singapore', continent: 'Asia', rain: 2340, sun: 2020, people: 5.6 },
      { city: 'Lima', continent: 'Americas', rain: 16, sun: 1230, people: 10.7 },
      { city: 'Seattle', continent: 'Americas', rain: 950, sun: 2170, people: 0.7 },
      { city: 'Phoenix', continent: 'Americas', rain: 200, sun: 3870, people: 1.6 },
      { city: 'Cairo', continent: 'Africa', rain: 18, sun: 3450, people: 21.3 },
      { city: 'Lagos', continent: 'Africa', rain: 1500, sun: 1850, people: 15.4 },
    ],
    x: 'rain', y: 'sun', color: 'continent', size: 'people', layers: ['dots', 'legend'], xLabel: 'rain (mm/yr)', yLabel: 'sun (h/yr)',
    note: 'Numbers on x and y get linear scales rounded to nice ticks; text on color gets the categorical palette; people sets --size (0–1), which the default dot CSS turns into a diameter.',
  },
  temps: {
    label: 'temperature by month (lines)',
    rows: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].flatMap((month, i) => [
      { month, city: 'Oslo', c: Math.round((-4 + 11 * Math.sin(((i - 3.2) / 12) * 2 * Math.PI) + 7) * 10) / 10 },
      { month, city: 'Lisbon', c: Math.round((17 + 6 * Math.sin(((i - 3.4) / 12) * 2 * Math.PI)) * 10) / 10 },
      { month, city: 'Sydney', c: Math.round((18 - 5 * Math.sin(((i - 3.3) / 12) * 2 * Math.PI)) * 10) / 10 },
    ]),
    x: 'month', y: 'c', color: 'city', size: '', layers: ['line', 'dots', 'legend'], yLabel: '°C',
    note: 'Text on x makes a banded scale (one band per month, in order of appearance). plot-line splits the rows into one series per color value; the dots are a second layer on the same scales.',
  },
  commits: {
    label: 'commits per day (bars)',
    rows: [{ day: 'Mon', commits: 12, team: 'core' }, { day: 'Tue', commits: 19, team: 'core' }, { day: 'Wed', commits: 7, team: 'docs' }, { day: 'Thu', commits: 23, team: 'core' }, { day: 'Fri', commits: 16, team: 'docs' }, { day: 'Sat', commits: 4, team: 'docs' }, { day: 'Sun', commits: 2, team: 'core' }],
    x: 'day', y: 'commits', color: 'team', size: '', layers: ['bars', 'legend'], yDomain: '0 auto', yLabel: 'commits',
    note: 'A bar is a mark that CSS stretches down to the axis: block-size: calc(var(--y) * 100%), inline-size: calc(var(--bandwidth) * 100%). y-domain="0 auto" pins the bottom of the scale at zero. The bars are built from script with marks.mark = (row, previous) => element.',
  },
  teams: {
    label: 'teams as Chernoff faces',
    rows: [
      { team: 'Atlas', velocity: 3, morale: 7, risk: 0.2, focus: 0.8 },
      { team: 'Borealis', velocity: 8, morale: 3, risk: 0.9, focus: 0.3 },
      { team: 'Cygnus', velocity: 6, morale: 8, risk: 0.4, focus: 0.9 },
      { team: 'Draco', velocity: 2, morale: 2, risk: 0.7, focus: 0.2 },
      { team: 'Eridanus', velocity: 9, morale: 9, risk: 0.1, focus: 0.6 },
      { team: 'Fornax', velocity: 5, morale: 5, risk: 0.5, focus: 0.5 },
    ],
    x: 'velocity', y: 'morale', color: '', size: '', layers: ['faces'], xDomain: '0 10', yDomain: '0 10', xLabel: 'velocity', yLabel: 'morale',
    faces: { smile: 'morale', brow: 'risk', eyes: 'focus' },
    note: 'Each mark is a <chernoff-face> stamped from a template: :smile="morale" binds a field scaled 0–1 across the data, aria-label="{team}" fills in the raw value. Edit a team\'s risk and watch its brows.',
  },
};

const ALL_LAYERS: { id: LayerId; label: string }[] = [
  { id: 'dots', label: 'dots (plot-marks)' },
  { id: 'bars', label: 'bars (plot-marks + mark())' },
  { id: 'line', label: 'line (plot-line)' },
  { id: 'faces', label: 'faces (chernoff-face)' },
  { id: 'legend', label: 'legend (plot-legend)' },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const columnsOf = (rows: Row[]) => [...new Set(rows.flatMap((r) => Object.keys(r)))];

function describeScale(name: string, s: unknown): string {
  const sc = s as { type?: string; domain?: unknown[] } | undefined;
  if (!sc?.type) return '';
  const d = sc.domain ?? [];
  const dom = sc.type === 'linear' ? `[${d.map((v) => (typeof v === 'number' ? +v.toFixed(2) : v)).join(', ')}]` : `${d.length} values`;
  return `<span class="stat">${name} <b>${esc(sc.type)}</b> ${esc(dom)}</span>`;
}

const playground: Playground = {
  id: ID,
  title: 'Data Plot Studio',
  pkg: '@johnhenry/data-plot',
  hue: 13,
  blurb: 'Plots written as HTML: edit the table and the chart follows. Marks, lines, axes, legends and Chernoff faces, placed by CSS.',
  docs: 'https://opensource.johnhenry.me/data-plot/',
  mount(host) {
    const defaults = { p: 'cities', w: 100 };
    const st = readState(defaults);
    const offs: (() => void)[] = [];
    // A handoff's rows live only in this visit, so the deep link never points at them.
    const save = () => writeState({ ...st, p: st.p === 'handoff' ? defaults.p : st.p }, defaults);
    const on = (t: EventTarget, type: string, fn: (e: Event) => void) => { t.addEventListener(type, fn); offs.push(() => t.removeEventListener(type, fn)); };

    // A handoff (from Form Lab or Tensor Bench) becomes a one-off preset.
    const h = receive<{ rows: Row[]; x?: string; y?: string; color?: string; title?: string; yLabel?: string; line?: boolean }>(ID);
    const presets: Record<string, Preset> = { ...PRESETS };
    if (h && Array.isArray(h.payload?.rows) && h.payload.rows.length) {
      const rows = h.payload.rows.filter((r) => r && typeof r === 'object').slice(0, 500);
      const cols = columnsOf(rows);
      const nums = cols.filter((c) => rows.every((r) => typeof r[c] === 'number'));
      presets.handoff = {
        label: h.payload.title ?? `from #/${h.from}`,
        rows,
        x: h.payload.x ?? nums[0] ?? cols[0] ?? '',
        y: h.payload.y ?? nums[1] ?? nums[0] ?? cols[1] ?? '',
        color: h.payload.color ?? '',
        size: '',
        layers: h.payload.line ? ['line'] : ['dots'],
        yLabel: h.payload.yLabel,
        note: `These rows came from the ${h.from} planet over the handoff bus.`,
      };
      st.p = 'handoff';
    }
    if (!(st.p in presets)) st.p = 'cities';

    const root = document.createElement('div');
    root.className = 'pg-data-plot';
    root.innerHTML = `
      <div class="dp-top">
        <div class="dp-presets" data-presets></div>
        <button class="btn" data-copy>copy link</button>
      </div>
      <section class="panel dp-stage">
        <div class="dp-frame" data-frame>
          <data-plot src="#dp-data" data-plot></data-plot>
        </div>
        <div class="dp-readout"><span class="stat"><b data-renders>0</b> render events</span> <span data-scales></span></div>
        <div class="dp-sizing">
          <label class="field">container width <b data-w-v></b><input type="range" min="30" max="100" value="100" data-w></label>
          <label class="field">--plot-height <b data-h-v>320px</b><input type="range" min="180" max="520" value="320" data-h></label>
        </div>
        <p class="hint" data-note></p>
      </section>
      <div class="grid-2">
        <section class="panel">
          <h3>Data: the <code>&lt;table id="dp-data"&gt;</code> the plot reads</h3>
          <p class="hint">Click a cell and type. Numbers are numbers, text is text; the plot watches the table and redraws (marks keep their element, so they animate).</p>
          <div class="dp-table-wrap"><table id="dp-data" class="dp-table" data-table></table></div>
          <div class="dp-actions">
            <button class="btn" data-add>add a row</button>
            <button class="btn" data-del>remove the last row</button>
            <button class="btn primary" data-jiggle>jiggle the numbers</button>
          </div>
          <details class="dp-json"><summary>Edit as JSON</summary>
            <textarea class="code" data-json spellcheck="false" aria-label="rows as JSON"></textarea>
            <div class="dp-actions"><button class="btn" data-json-apply>rebuild the table from JSON</button></div>
            <pre class="code error" data-json-err hidden></pre>
          </details>
        </section>
        <section class="panel">
          <h3>Layers and channels</h3>
          <div class="dp-layers" data-layers></div>
          <div class="dp-channels">
            <label class="field">x <select data-ch="x"></select></label>
            <label class="field">y <select data-ch="y"></select></label>
            <label class="field">color <select data-ch="color"></select></label>
            <label class="field">size <select data-ch="size"></select></label>
          </div>
          <div class="dp-channels">
            <label class="field">x label <input data-axis-label="x"></label>
            <label class="field">y label <input data-axis-label="y"></label>
            <label class="field">y-domain <input data-ydomain placeholder="e.g. 0 auto"></label>
          </div>
          <div class="dp-checks">
            <label><input type="checkbox" data-grid="x"> x grid</label>
            <label><input type="checkbox" data-grid="y" checked> y grid</label>
          </div>
          <pre class="code dp-markup" data-markup></pre>
        </section>
      </div>
      <section class="panel what">
        <h3>What's happening</h3>
        <p><code>&lt;data-plot&gt;</code> is the frame. It reads its rows from <code>src="#dp-data"</code> (the table above), asks every layer inside it which fields it uses, and builds one scale per channel across all of them: linear for numbers, banded for text, a palette or ramp for color. Each layer then draws by setting custom properties (<code>--x</code>, <code>--y</code>, <code>--color</code>, <code>--size</code>, <code>--bandwidth</code>) on plain elements, and CSS places them. That is why the plot reflows when you drag the width slider without a single redraw: the render counter stays still.</p>
        <p>Because the data is a readable table on the page, the drawing is hidden from assistive technology; the table already says it. Everything is in the light DOM, and every default style is wrapped in <code>:where()</code>, so this planet's CSS restyles the marks with no specificity fights.</p>
      </section>`;
    host.appendChild(root);

    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
    if (h) root.prepend(handoffBanner(h, `${presets.handoff ? `${presets.handoff.rows.length} rows arrived and are plotted below.` : 'the payload had no rows to plot.'}`));

    const plot = $<DataPlot>('[data-plot]');
    const table = $<HTMLTableElement>('[data-table]');
    const frame = $('[data-frame]');

    /* ---- the layers: created once, moved in and out of the frame ---- */
    const axisX = document.createElement('plot-axis'); axisX.setAttribute('scale', 'x');
    const axisY = document.createElement('plot-axis'); axisY.setAttribute('scale', 'y'); axisY.setAttribute('grid', '');
    const dots = document.createElement('plot-marks') as PlotMarks;
    const bars = document.createElement('plot-marks') as PlotMarks; bars.classList.add('dp-bars');
    const line = document.createElement('plot-line');
    const faces = document.createElement('plot-marks') as PlotMarks; faces.classList.add('dp-faces');
    const legend = document.createElement('plot-legend');
    const LAYER_EL: Record<LayerId, HTMLElement> = { dots, bars, line, faces, legend };
    let active = new Set<LayerId>();
    let preset = presets[st.p];
    let ch = { x: '', y: '', color: '', size: '' };

    bars.mark = (row, previous) => {
      const el = (previous as HTMLElement | undefined) ?? document.createElement('div');
      el.className = 'dp-bar';
      el.title = `${row[ch.x]}: ${row[ch.y]}`;
      return el;
    };
    offs.push(() => { bars.mark = null; });

    function setFaceTemplate(f: Preset['faces']) {
      faces.replaceChildren();
      const t = document.createElement('template');
      const label = preset.rows[0] ? Object.keys(preset.rows[0])[0] : 'label';
      t.innerHTML = f
        ? `<chernoff-face :smile="${f.smile}" :brow-slant="${f.brow}" :eye-size="${f.eyes}" aria-label="{${label}}" title="{${label}}"></chernoff-face>`
        : `<chernoff-face :smile="${ch.y}" aria-label="{${label}}" title="{${label}}"></chernoff-face>`;
      faces.append(t);
    }

    function applyChannels() {
      for (const el of [dots, bars, faces]) {
        el.setAttribute('x', ch.x); el.setAttribute('y', ch.y);
        if (ch.color) el.setAttribute('color', ch.color); else el.removeAttribute('color');
        if (ch.size && el === dots) el.setAttribute('size', ch.size); else el.removeAttribute('size');
      }
      dots.setAttribute('key', columnsOf(preset.rows)[0] ?? '');
      line.setAttribute('x', ch.x); line.setAttribute('y', ch.y);
      if (ch.color) line.setAttribute('color', ch.color); else line.removeAttribute('color');
      legend.setAttribute('label', ch.color || '');
      plot.requestRender();
      renderMarkup();
    }

    function syncLayers() {
      const order: HTMLElement[] = [axisX, axisY, ...(['line', 'bars', 'dots', 'faces', 'legend'] as LayerId[]).filter((l) => active.has(l)).map((l) => LAYER_EL[l])];
      for (const el of [axisX, axisY, ...Object.values(LAYER_EL)]) if (!order.includes(el)) el.remove();
      for (const el of order) if (el.parentElement !== plot) plot.append(el);
      root.querySelectorAll<HTMLInputElement>('[data-layer]').forEach((c) => { c.checked = active.has(c.dataset.layer as LayerId); });
      renderMarkup();
    }

    function renderMarkup() {
      const tag = (el: Element) => `<${el.localName}${[...el.attributes].filter((a) => a.name !== 'class' && !a.name.startsWith('aria') && a.name !== 'role' && !a.name.startsWith('data-')).map((a) => (a.value === '' ? ` ${a.name}` : ` ${a.name}="${a.value}"`)).join('')}>`;
      const lines = [tag(plot)];
      for (const el of plot.children) {
        if (el.localName === 'plot-marks' && el === bars) lines.push(`  ${tag(el)}</plot-marks>  <!-- .mark = (row, prev) => div.dp-bar -->`);
        else if (el.localName === 'plot-marks' && el === faces) lines.push(`  ${tag(el)}\n    <template>${faces.querySelector('template')?.innerHTML ?? ''}</template>\n  </plot-marks>`);
        else lines.push(`  ${tag(el)}</${el.localName}>`);
      }
      lines.push('</data-plot>');
      $('[data-markup]').textContent = lines.join('\n');
    }

    /* ---- the table (the plot's source) ---- */
    function buildTable(rows: Row[]) {
      const cols = columnsOf(rows);
      table.innerHTML = `<thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td contenteditable="plaintext-only" spellcheck="false">${esc(String(r[c] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>`;
      $<HTMLTextAreaElement>('[data-json]').value = JSON.stringify(rows, null, 2);
      fillChannelSelects(cols);
    }
    function fillChannelSelects(cols: string[]) {
      root.querySelectorAll<HTMLSelectElement>('[data-ch]').forEach((sel) => {
        const k = sel.dataset.ch as keyof typeof ch;
        sel.innerHTML = `${k === 'color' || k === 'size' ? '<option value="">(none)</option>' : ''}${cols.map((c) => `<option>${esc(c)}</option>`).join('')}`;
        sel.value = ch[k];
      });
    }
    const readRows = (): Row[] => (plot.data as Row[]) ?? [];

    function loadPreset(id: string) {
      preset = presets[id];
      st.p = id;
      save();
      ch = { x: preset.x, y: preset.y, color: preset.color, size: preset.size };
      active = new Set(preset.layers);
      if (preset.yDomain) plot.setAttribute('y-domain', preset.yDomain); else plot.removeAttribute('y-domain');
      if (preset.xDomain) plot.setAttribute('x-domain', preset.xDomain); else plot.removeAttribute('x-domain');
      $<HTMLInputElement>('[data-ydomain]').value = preset.yDomain ?? '';
      axisX.setAttribute('label', preset.xLabel ?? preset.x); axisY.setAttribute('label', preset.yLabel ?? preset.y);
      $<HTMLInputElement>('[data-axis-label="x"]').value = axisX.getAttribute('label') ?? '';
      $<HTMLInputElement>('[data-axis-label="y"]').value = axisY.getAttribute('label') ?? '';
      setFaceTemplate(preset.faces);
      buildTable(preset.rows);
      syncLayers();
      applyChannels();
      $('[data-note]').textContent = preset.note;
      $('[data-presets]').innerHTML = Object.entries(presets).map(([k, p]) => `<button class="btn" data-preset="${k}" aria-pressed="${k === id}">${esc(p.label)}</button>`).join('');
    }

    /* ---- readouts ---- */
    let renders = 0;
    on(plot, 'render', () => {
      renders++;
      $('[data-renders]').textContent = String(renders);
      const s = plot.scales ?? {};
      $('[data-scales]').innerHTML = ['x', 'y', 'color', 'size'].map((k) => describeScale(k, s[k])).join(' ');
    });
    on(plot, 'error', (e) => { $('[data-scales]').innerHTML = `<span class="stat bad">error: ${esc((e as ErrorEvent).message ?? 'unreadable source')}</span>`; });

    /* ---- controls ---- */
    $('[data-layers]').innerHTML = ALL_LAYERS.map((l) => `<label><input type="checkbox" data-layer="${l.id}"> ${esc(l.label)}</label>`).join('');
    root.querySelectorAll<HTMLInputElement>('[data-layer]').forEach((c) => on(c, 'change', () => {
      const id = c.dataset.layer as LayerId;
      if (c.checked) active.add(id); else active.delete(id);
      syncLayers(); plot.requestRender();
    }));
    root.querySelectorAll<HTMLSelectElement>('[data-ch]').forEach((sel) => on(sel, 'change', () => {
      ch[sel.dataset.ch as keyof typeof ch] = sel.value;
      if (!preset.faces) setFaceTemplate(undefined);
      applyChannels();
    }));
    root.querySelectorAll<HTMLInputElement>('[data-axis-label]').forEach((inp) => on(inp, 'input', () => {
      (inp.dataset.axisLabel === 'x' ? axisX : axisY).setAttribute('label', inp.value); renderMarkup();
    }));
    on($('[data-ydomain]'), 'change', (e) => {
      const v = (e.target as HTMLInputElement).value.trim();
      if (v) plot.setAttribute('y-domain', v); else plot.removeAttribute('y-domain');
      renderMarkup();
    });
    root.querySelectorAll<HTMLInputElement>('[data-grid]').forEach((c) => on(c, 'change', () => {
      (c.dataset.grid === 'x' ? axisX : axisY).toggleAttribute('grid', c.checked); renderMarkup();
    }));
    on($('[data-presets]'), 'click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('[data-preset]');
      if (b) loadPreset(b.dataset.preset!);
    });
    on($('[data-add]'), 'click', () => {
      const rows = readRows();
      const last = rows[rows.length - 1] ?? {};
      const cols = columnsOf(preset.rows);
      const tr = document.createElement('tr');
      tr.innerHTML = cols.map((c) => {
        const v = last[c];
        const nv = typeof v === 'number' ? Math.round(v * (0.7 + Math.random() * 0.6) * 100) / 100 : `${v ?? ''}${typeof v === 'string' && c === cols[0] ? ' 2' : ''}`;
        return `<td contenteditable="plaintext-only" spellcheck="false">${esc(String(nv))}</td>`;
      }).join('');
      table.tBodies[0].append(tr);
    });
    on($('[data-del]'), 'click', () => { const b = table.tBodies[0]; if (b.rows.length > 1) b.lastElementChild!.remove(); });
    on($('[data-jiggle]'), 'click', () => {
      for (const td of table.querySelectorAll<HTMLTableCellElement>('tbody td')) {
        const n = Number(td.textContent);
        if (td.textContent!.trim() !== '' && Number.isFinite(n)) {
          const j = n * (0.75 + Math.random() * 0.5);
          td.textContent = String(Math.abs(n) < 2 ? Math.round(j * 100) / 100 : Math.round(j));
        }
      }
    });
    on($('[data-json-apply]'), 'click', () => {
      const err = $('[data-json-err]');
      try {
        const rows = JSON.parse($<HTMLTextAreaElement>('[data-json]').value);
        if (!Array.isArray(rows) || !rows.every((r) => r && typeof r === 'object' && !Array.isArray(r))) throw new Error('expected an array of row objects');
        err.hidden = true;
        preset = { ...preset, rows };
        buildTable(rows);
        applyChannels();
      } catch (e) { err.hidden = false; err.textContent = (e as Error).message; }
    });
    // Keep the JSON box in step with hand edits to the table.
    on(plot, 'render', () => {
      const ta = $<HTMLTextAreaElement>('[data-json]');
      if (document.activeElement !== ta) ta.value = JSON.stringify(readRows(), null, 2);
    });

    const wIn = $<HTMLInputElement>('[data-w]');
    const hIn = $<HTMLInputElement>('[data-h]');
    const applySize = () => {
      frame.style.width = `${wIn.value}%`;
      plot.style.setProperty('--plot-height', `${hIn.value}px`);
      $('[data-w-v]').textContent = `${wIn.value}%`;
      $('[data-h-v]').textContent = `${hIn.value}px`;
    };
    wIn.value = String(Math.max(30, Math.min(100, Number(st.w) || 100)));
    on(wIn, 'input', () => { applySize(); st.w = Number(wIn.value); save(); });
    on(hIn, 'input', applySize);
    applySize();
    on($('[data-copy]'), 'click', async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      await copyLink(); b.textContent = 'copied'; setTimeout(() => { b.textContent = 'copy link'; }, 1200);
    });

    loadPreset(st.p);
    return () => { for (const off of offs) { try { off(); } catch {} } root.remove(); };
  },
};

export default playground;
