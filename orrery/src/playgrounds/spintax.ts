import type { Playground } from '../registry';
// Issue #12 (types.d.ts didn't declare the default export at top level) is
// fixed as of 0.0.1 — `export default parse` now types correctly, so this
// planet imports the default export instead of the named one.
import parseSpintax, { count as spCount, choose as spChoose } from '@johnhenry/spintax';
import { handoffButton } from '../bus';
import { readState, writeState, copyLink } from '../state';
import './spintax.css';

// ---------------------------------------------------------------------------
// Template grammar — mirrors @johnhenry/spintax's own (non-nesting) `{...}`
// extraction exactly, so our count/choose previews always agree with the
// real library. We re-derive it rather than reach into library internals
// because the package only exports parse/count/choose/range/compile.
// ---------------------------------------------------------------------------

interface RangeMeta { start: number; end: number; step: number }

interface PatternInfo {
  raw: string;
  isBackref: boolean;
  refIndex: number | null;
  kind: 'range' | 'choices';
  choices?: string[];
  range?: RangeMeta;
  optionCount: number;
}

function subHelper(template: string): { patterns: string[]; literals: string[] } {
  const patterns: string[] = [];
  const literals: string[] = [];
  const re = /\{([^}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    literals.push(template.slice(last, m.index));
    patterns.push(m[1]);
    last = m.index + m[0].length;
  }
  literals.push(template.slice(last));
  return { patterns, literals };
}

function isRangePattern(pattern: string): boolean {
  const noWs = pattern.replace(/\s+/g, '');
  const trimmed = noWs.replace(/,+$/, '');
  if (!trimmed.includes(',')) return false;
  const parts = trimmed.split(',');
  if (parts.length < 2 || parts.length > 3) return false;
  return parts.every((p) => p !== '' && !Number.isNaN(parseFloat(p)) && Number.isFinite(Number(p)));
}

function parseRangePattern(pattern: string): [number, number, number] {
  const noWs = pattern.replace(/\s+/g, '');
  const trimmed = noWs.replace(/,+$/, '');
  const parts = trimmed.split(',').map((p) => parseFloat(p));
  return [parts[0], parts[1], parts.length > 2 ? parts[2] : 1];
}

/** Exact count of values RangeGenerator.values() would yield, without enumerating them. */
function rangeCount(start: number, end: number, step: number): number {
  if (step === 0) return start <= end ? Infinity : 0;
  if (step > 0 ? start > end : start < end === false && start > end) return 0;
  if (start > end) return 0;
  const n = Math.floor((end - start) / step) + 1;
  let total = Math.max(0, n);
  const rem = (end - start) % step;
  if (rem !== 0 && end > start + Math.floor((end - start) / step) * step) total += 1;
  return total;
}

/** The nth value RangeGenerator.values() would yield, without enumerating the rest. */
function rangeValueAt(range: RangeMeta, index: number): number {
  const { start, end, step } = range;
  const n = Math.floor((end - start) / step) + 1;
  if (index < n) return start + index * step;
  return end; // the extra "always include end" value
}

function analyzePatterns(template: string): { infos: PatternInfo[]; literals: string[] } {
  const { patterns, literals } = subHelper(template);
  const infos: PatternInfo[] = patterns.map((raw) => {
    const backrefMatch = raw.match(/^\$(\d+)$/);
    if (backrefMatch) {
      return { raw, isBackref: true, refIndex: parseInt(backrefMatch[1], 10), kind: 'choices', optionCount: 1 };
    }
    if (isRangePattern(raw)) {
      const [start, end, step] = parseRangePattern(raw);
      return { raw, isBackref: false, refIndex: null, kind: 'range', range: { start, end, step }, optionCount: rangeCount(start, end, step) };
    }
    const choices = raw.split('|');
    return { raw, isBackref: false, refIndex: null, kind: 'choices', choices, optionCount: choices.length };
  });
  return { infos, literals };
}

type Validation = { ok: true; infos: PatternInfo[]; literals: string[] } | { ok: false; message: string };

function validateTemplate(template: string): Validation {
  if (!template.trim()) return { ok: false, message: 'Type a template with a {choice|of|words} to get started.' };
  const { infos, literals } = analyzePatterns(template);
  for (const info of infos) {
    if (info.isBackref || info.kind !== 'range' || !info.range) continue;
    const { start, end, step } = info.range;
    if (step === 0) return { ok: false, message: `Range "{${info.raw}}" has a step of 0 — it would spin forever. Give it a non-zero step.` };
    if (step < 0 && start <= end) return { ok: false, message: `Range "{${info.raw}}" steps downward but start ≤ end, so it never reaches the end. Swap start/end or use a positive step.` };
  }
  const actualCount = infos.filter((i) => !i.isBackref).length;
  for (const info of infos) {
    if (info.isBackref && (info.refIndex === null || info.refIndex < 0 || info.refIndex >= actualCount)) {
      return { ok: false, message: `Back-reference {$${info.refIndex}} points past the ${actualCount} real choice group(s) in this template.` };
    }
  }
  return { ok: true, infos, literals };
}

function computeCount(template: string, infos: PatternInfo[]): number {
  let estimate = 1;
  for (const info of infos) if (!info.isBackref) estimate *= info.optionCount;
  // count() from the library enumerates ranges into arrays internally; that's fast for
  // modest totals but wasteful for huge ones, so we only reach for the real export when
  // it's cheap and fall back to the same arithmetic it uses otherwise.
  if (estimate <= 4_000_000 && Number.isFinite(estimate)) {
    try {
      return spCount(template);
    } catch {
      /* fall through to estimate */
    }
  }
  return estimate;
}

function estimateAvgLength(literals: string[], infos: PatternInfo[]): number {
  let len = literals.reduce((a, s) => a + s.length, 0);
  for (const info of infos) {
    if (info.isBackref) { len += 3; continue; }
    if (info.kind === 'choices' && info.choices) {
      len += info.choices.reduce((a, s) => a + s.length, 0) / info.choices.length;
    } else if (info.range) {
      len += String(Math.round((info.range.start + info.range.end) / 2)).length;
    }
  }
  return len;
}

function buildJoke(total: number, avgLen: number): string {
  if (!Number.isFinite(total)) return 'that would take forever to read. Literally.';
  const totalChars = total * avgLen;
  const CHARS_PER_SECOND = 17; // ~200 wpm, an average committed reader
  const seconds = totalChars / CHARS_PER_SECOND;
  const years = seconds / (60 * 60 * 24 * 365.25);
  if (years >= 1) {
    const precision = years < 10 ? 1 : 0;
    return `that would take about ${years.toLocaleString('en-US', { maximumFractionDigits: precision })} years to read — nonstop, no bathroom breaks.`;
  }
  const days = seconds / 86400;
  if (days >= 1) return `that would take about ${days.toLocaleString('en-US', { maximumFractionDigits: 1 })} days to read straight through.`;
  const minutes = seconds / 60;
  if (minutes >= 1) return `that would take about ${Math.round(minutes)} minute(s) to read straight through.`;
  return `that would take about ${Math.max(1, Math.round(seconds))}s to read straight through.`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DEPTH_COLORS = ['#d6337d', '#1d6fbf', '#9333d6', '#0f9d63', '#b45f06', '#1d8f8f'];

/** Colorizes `{...}` groups by bracket nesting depth for the read-only overlay. */
function buildHighlightHTML(text: string): string {
  let html = '';
  let openCount = 0;
  const stack: number[] = [];
  for (const ch of text) {
    if (ch === '{') {
      const color = DEPTH_COLORS[stack.length % DEPTH_COLORS.length];
      html += `<span class="grp" style="background:${color}2a;border-bottom:2px solid ${color}">${escapeHtml(ch)}`;
      stack.push(1);
      openCount++;
    } else if (ch === '}') {
      if (stack.length === 0) {
        html += `<span class="grp-err">${escapeHtml(ch)}</span>`;
      } else {
        html += `${escapeHtml(ch)}</span>`;
        stack.pop();
      }
    } else {
      html += escapeHtml(ch);
    }
  }
  while (stack.length > 0) { html += '</span>'; stack.pop(); }
  return openCount === 0 ? escapeHtml(text) : html;
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Topic-shifting document preset: every paragraph slot is ONE spintax group
// whose choices are whole paragraphs, one per topic. Picking a different topic
// per slot yields a multi-paragraph document whose subject changes at every
// paragraph break — exactly what a semantic chunker should cut on.
// ---------------------------------------------------------------------------

const TOPICS: { name: string; paras: string[] }[] = [
  {
    name: 'coffee',
    paras: [
      'Coffee begins as the seed of a cherry on the coffee plant. Farmers pick the ripe coffee cherries by hand, then dry or wash the beans before roasting. A light roast keeps the bright, fruity character of the coffee bean.',
      'Brewing coffee is a matter of water, grind, and time. Espresso forces hot water through finely ground coffee in seconds, while a French press steeps coarse coffee grounds for minutes. Every brew method pulls different flavors from the same roasted beans.',
      'Caffeine is the reason many people reach for coffee each morning. A single cup of brewed coffee holds roughly ninety milligrams of caffeine. Decaf coffee beans are steamed and rinsed to remove most of that caffeine before roasting.',
      'Cafes turned coffee into a social ritual. In old coffeehouses, merchants traded news over cups of coffee, and today baristas still pour latte art on espresso drinks. The coffee counter remains a daily meeting place.',
    ],
  },
  {
    name: 'volcanoes',
    paras: [
      'A volcano forms where molten rock called magma rises through the crust. When pressure builds, the volcano erupts, sending lava, ash, and volcanic gas into the sky. Most volcanoes sit along the edges of tectonic plates.',
      'Lava flows from a volcano can reach temperatures above one thousand degrees. Runny basalt lava spreads in wide rivers, while sticky lava piles into steep volcanic domes. Cooling lava hardens into new volcanic rock.',
      'Volcanic ash clouds are a serious hazard for aircraft. Fine ash from an eruption can melt inside jet engines and ground flights across whole continents. Geologists track volcano ash plumes with satellites and seismometers.',
      'Some volcanoes build entire islands. Hawaii rose from the sea as lava from a volcanic hotspot piled up layer after layer. Over millions of years the islands drift away from the hotspot and their volcanoes go quiet.',
    ],
  },
  {
    name: 'jazz',
    paras: [
      'Jazz grew up in New Orleans, where brass bands, blues, and ragtime collided. Early jazz musicians improvised melodies over a steady swing rhythm. The trumpet and clarinet often led the jazz ensemble.',
      'Improvisation is the heart of jazz. A jazz soloist invents a new melody over the chord changes of a tune, and every performance of that jazz standard sounds different. The rhythm section of piano, bass, and drums keeps the swing moving.',
      'Bebop pushed jazz toward fast tempos and complex harmony. Saxophone players like Charlie Parker played dazzling jazz solos in small clubs after midnight. Bebop turned jazz from dance music into music for listening.',
      'Jazz records spread the music around the world. Collectors traded jazz albums, and radio broadcasts carried swing bands into living planets. Today jazz festivals fill parks with saxophones, trumpets, and upright bass.',
    ],
  },
  {
    name: 'spaceflight',
    paras: [
      'A rocket reaches orbit by burning fuel fast enough to outrun gravity. The rocket sheds empty stages as it climbs, so the final stage carries the spacecraft into orbit. Launch windows depend on where the orbit needs to go.',
      'Astronauts aboard a space station live in constant free fall. The station orbits Earth every ninety minutes, so the crew sees sixteen sunrises a day. Astronauts exercise daily to protect bones and muscles in orbit.',
      'Landing a spacecraft on the Moon requires precise rocket burns. The lunar module fires its engine to slow its descent, then hovers while the astronauts pick a safe landing spot. No air on the Moon means no parachutes.',
      'Reusable rockets have changed the economics of spaceflight. A booster that lands upright after launch can fly again within weeks. Cheaper launches mean more satellites, more space telescopes, and more astronauts in orbit.',
    ],
  },
  {
    name: 'sourdough',
    paras: [
      'Sourdough bread rises without packaged yeast. A sourdough starter of flour and water collects wild yeast and bacteria from the air. Bakers feed the starter daily to keep the sourdough culture lively.',
      'Kneading and folding develop gluten in bread dough. Long folds stretch the sourdough into a strong, elastic dough that traps gas. The dough then proofs slowly overnight in a cool kitchen.',
      'A hot oven gives sourdough bread its crackling crust. Bakers score the loaf with a blade so the dough can expand, then bake the bread in a covered pot to trap steam. The crust browns while the crumb sets.',
      'Every sourdough loaf tastes of its starter and its flour. Whole wheat flour makes a denser, earthier bread, while white flour gives an open crumb. Many bakers keep the same sourdough starter alive for years.',
    ],
  },
];
const TOPIC_SLOTS = 4;
const TOPIC_TEMPLATE = Array.from({ length: TOPIC_SLOTS }, (_, k) => `{${TOPICS.map((t) => t.paras[k]).join('|')}}`).join('\n\n');

/** A random topic per paragraph, never repeating, so every paragraph break is a topic shift. */
function generateTopicDocument(): { document: string; topics: string[] } {
  const order = TOPICS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const indices = order.slice(0, TOPIC_SLOTS);
  const document = spChoose(TOPIC_TEMPLATE)(...indices);
  return { document, topics: indices.map((i) => TOPICS[i].name) };
}

/**
 * Pull up to `n` variants from parse()'s lazy iterator, keeping every k-th one
 * so the sample spans the whole space (capped at 200k pulls — the iterator is
 * lazy, so even a 1.5M-variant template only ever materializes `n` strings).
 */
function sampleVariants(template: string, total: number, n = 200): { variants: string[]; stride: number; pulled: number } {
  const it = parseSpintax(template)[Symbol.iterator]();
  const budget = Math.min(Number.isFinite(total) ? total : 200_000, 200_000);
  const stride = Math.max(1, Math.floor(budget / n));
  const variants: string[] = [];
  let pulled = 0;
  while (variants.length < n && pulled < 200_000) {
    const r = it.next();
    if (r.done) break;
    if (pulled % stride === 0) variants.push(r.value);
    pulled++;
  }
  return { variants, stride, pulled };
}

const PRESETS: { name: string; template: string }[] = [
  {
    name: 'Product description',
    template:
      'This {sleek|rugged|elegant|minimalist} {toaster|blender|desk lamp|backpack|watch} comes in {midnight black|ocean blue|sunset orange|forest green} and is {perfect|ideal|ready} for {your morning routine|weekend adventures|the modern home|gift-giving}.',
  },
  {
    name: 'Poem (back-references)',
    template:
      'Roses are {red|crimson|scarlet},\nviolets are {blue|indigo|violet}.\nRoses stay {$0} forever,\nand violets stay {$1} too.',
  },
  {
    name: 'Numeric range (1M+)',
    template: 'Booking confirmation #{100000,1650000}',
  },
  {
    name: 'Topic-shifting document',
    template: TOPIC_TEMPLATE,
  },
  {
    name: 'API paths (fuzz)',
    template: '/api/{v1|v2}/{users|posts|comments|notes}/{1,500}/{profile|edit|delete|$1}',
  },
];

/** Slugifies a variant string into a URL path segment sequence, for the Letterpress handoff. */
function toRequestPath(variant: string): string {
  const slug = variant
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((seg) => encodeURIComponent(seg).replace(/%2F/gi, '/'))
    .join('/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return '/' + (slug || 'x');
}

const playground: Playground = {
  id: 'spintax',
  title: 'Spintax Forge',
  pkg: '@johnhenry/spintax',
  hue: 300,
  blurb: 'Expand {red|green|blue} templates into millions of variants, lazily.',
  docs: 'https://opensource.johnhenry.me/spintax/',

  mount(host) {
    const root = document.createElement('div');
    root.className = 'pg-spintax';
    root.innerHTML = `
      <div class="panel">
        <div class="row-between">
          <h3>Template</h3>
          <div class="presets" id="sp-presets"></div>
        </div>
        <div class="editor-wrap">
          <pre class="hl-layer" id="sp-hl" aria-hidden="true"></pre>
          <textarea class="editor-input" id="sp-input" spellcheck="false" rows="4"></textarea>
        </div>
        <p class="legend">Braces are colored by nesting depth (spintax itself never nests a group — this is just so you can spot each <code>{…}</code> at a glance, and catch a stray unmatched brace, shown in red).</p>
        <div class="stats-row">
          <span class="stat">variants: <b id="sp-count">—</b></span>
          <span class="stat joke" id="sp-joke"></span>
        </div>
        <pre class="code error" id="sp-error" hidden></pre>
        <div class="handoff-row">
          <div class="handoff-list" id="sp-handoffs"></div>
          <button class="btn copy-link" id="sp-copy" title="Copy a link that reopens this exact template">🔗 copy link</button>
        </div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <h3>Roll the dice</h3>
          <p class="hint">Uses <code>choose()</code> to pick one random combination, spinning each slot like a slot machine before it settles.</p>
          <button class="btn primary" id="sp-roll">🎲 Roll the dice</button>
          <p class="dice-output" id="sp-dice"></p>
          <pre class="code error" id="sp-dice-error" hidden></pre>
        </div>

        <div class="panel">
          <h3>Stream all variants</h3>
          <p class="hint">Walks <code>parse()</code>'s lazy iterator in <code>requestAnimationFrame</code> batches. The list keeps only the most recent rows — the counter climbs, memory doesn't.</p>
          <div class="stream-controls">
            <button class="btn primary" id="sp-stream-start">▶ Stream</button>
            <button class="btn" id="sp-stream-pause" disabled>⏸ Pause</button>
          </div>
          <div class="stat stream-stats" id="sp-stream-stats">not streaming yet.</div>
          <div class="stream-list" id="sp-stream-list"></div>
          <pre class="code error" id="sp-stream-error" hidden></pre>
        </div>
      </div>

      <div class="panel">
        <h3>What's happening</h3>
        <p class="hint">
          <code>parse(template)</code> returns a lazy iterable — with a single <code>{...}</code> group (like the numeric-range
          preset) it never materializes anything, it just walks the range one step at a time. <code>count()</code> and
          <code>choose()</code> are eager about ranges internally (they build an array to work with), so this planet
          only calls them when the total is small enough to stay instant, and falls back to the same arithmetic
          otherwise. Back-references (<code>{$0}</code>) always resolve to the value already chosen for an earlier
          <code>{...}</code> group, so <code>{$0}</code> means "whatever the 1st real group picked."
        </p>
      </div>
    `;
    host.innerHTML = '';
    host.appendChild(root);

    const presetsEl = root.querySelector<HTMLDivElement>('#sp-presets')!;
    const hlLayer = root.querySelector<HTMLPreElement>('#sp-hl')!;
    const input = root.querySelector<HTMLTextAreaElement>('#sp-input')!;
    const countEl = root.querySelector<HTMLElement>('#sp-count')!;
    const jokeEl = root.querySelector<HTMLElement>('#sp-joke')!;
    const errorEl = root.querySelector<HTMLPreElement>('#sp-error')!;
    const rollBtn = root.querySelector<HTMLButtonElement>('#sp-roll')!;
    const diceOutput = root.querySelector<HTMLParagraphElement>('#sp-dice')!;
    const diceErrorEl = root.querySelector<HTMLPreElement>('#sp-dice-error')!;
    const streamStartBtn = root.querySelector<HTMLButtonElement>('#sp-stream-start')!;
    const streamPauseBtn = root.querySelector<HTMLButtonElement>('#sp-stream-pause')!;
    const streamStatsEl = root.querySelector<HTMLElement>('#sp-stream-stats')!;
    const streamListEl = root.querySelector<HTMLDivElement>('#sp-stream-list')!;
    const streamErrorEl = root.querySelector<HTMLPreElement>('#sp-stream-error')!;

    const copyBtn = root.querySelector<HTMLButtonElement>('#sp-copy')!;
    const handoffsEl = root.querySelector<HTMLDivElement>('#sp-handoffs')!;

    // Deep link: a preset is linked by index (`?p=2`), a hand-edited template verbatim (`?tpl=…`).
    const stateDefaults = { p: 0, tpl: '' };
    const stateFor = (tpl: string) => {
      const idx = PRESETS.findIndex((pr) => pr.template === tpl);
      return idx >= 0 ? { p: idx, tpl: '' } : { p: -1, tpl };
    };
    const saveState = (tpl: string) => writeState(stateFor(tpl), stateDefaults);
    const linked = readState(stateDefaults);
    const initialTemplate = linked.tpl || PRESETS[Number(linked.p)]?.template || PRESETS[0].template;

    let lastValidation: Validation | null = null;
    let debounceTimer: number | undefined;

    function setActionsEnabled(enabled: boolean) {
      rollBtn.disabled = !enabled;
      streamStartBtn.disabled = !enabled;
    }

    function syncHighlight(value: string) {
      hlLayer.innerHTML = buildHighlightHTML(value) || '​';
    }

    function refreshStats(value: string) {
      const validation = validateTemplate(value);
      lastValidation = validation;
      if (!validation.ok) {
        countEl.textContent = '—';
        jokeEl.textContent = '';
        errorEl.hidden = false;
        errorEl.textContent = validation.message;
        setActionsEnabled(false);
        return;
      }
      errorEl.hidden = true;
      setActionsEnabled(true);
      const total = computeCount(value, validation.infos);
      countEl.textContent = Number.isFinite(total) ? total.toLocaleString('en-US') : '∞';
      const avgLen = estimateAvgLength(validation.literals, validation.infos);
      jokeEl.textContent = buildJoke(total, avgLen);
    }

    function markActivePreset(tpl: string) {
      presetsEl.querySelectorAll<HTMLButtonElement>('.preset-btn').forEach((b, i) => b.classList.toggle('active', PRESETS[i]?.template === tpl));
    }

    function onInput() {
      const value = input.value;
      syncHighlight(value);
      markActivePreset(value);
      saveState(value);
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => refreshStats(value), 90);
    }

    function loadTemplate(tpl: string) {
      input.value = tpl;
      saveState(tpl);
      syncHighlight(tpl);
      refreshStats(tpl);
      diceOutput.textContent = '';
      diceErrorEl.hidden = true;
      resetStream();
    }

    input.addEventListener('input', onInput);
    input.addEventListener('scroll', () => {
      hlLayer.scrollTop = input.scrollTop;
      hlLayer.scrollLeft = input.scrollLeft;
    });

    PRESETS.forEach((preset, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn preset-btn';
      btn.textContent = preset.name;
      btn.addEventListener('click', () => {
        loadTemplate(preset.template);
        markActivePreset(preset.template);
      });
      void i;
      presetsEl.appendChild(btn);
    });

    // ---- Roll the dice --------------------------------------------------

    interface DiceSlotState {
      el: HTMLElement;
      info: PatternInfo;
      settleAt: number;
      settled: boolean;
      finalDisplay: string;
      mirrorOf: number;
    }

    let diceRafId = 0;
    let diceLastTick = 0;

    function stopDiceAnimation() {
      if (diceRafId) cancelAnimationFrame(diceRafId);
      diceRafId = 0;
    }

    function randomPreview(info: PatternInfo): string {
      if (info.kind === 'range' && info.range) {
        const idx = Math.floor(Math.random() * Math.max(1, info.optionCount));
        return String(rangeValueAt(info.range, idx));
      }
      const arr = info.choices ?? [''];
      return arr[Math.floor(Math.random() * arr.length)];
    }

    function rollDice() {
      diceErrorEl.hidden = true;
      const validation = lastValidation ?? validateTemplate(input.value);
      if (!validation.ok) {
        diceOutput.textContent = '';
        diceErrorEl.hidden = false;
        diceErrorEl.textContent = validation.message;
        return;
      }
      stopDiceAnimation();
      const { infos, literals } = validation;
      const template = input.value;

      const actualPositions: number[] = [];
      infos.forEach((info, i) => { if (!info.isBackref) actualPositions.push(i); });
      const finalChoiceIndices = actualPositions.map((i) => Math.floor(Math.random() * Math.max(1, infos[i].optionCount)));

      let finalString: string;
      try {
        const pick = spChoose(template);
        finalString = pick(...finalChoiceIndices);
      } catch (err) {
        diceErrorEl.hidden = false;
        diceErrorEl.textContent = `choose() failed: ${(err as Error)?.message ?? err}`;
        return;
      }
      void finalString; // the assembled string is rendered via slots below

      const resolved: string[] = new Array(infos.length);
      actualPositions.forEach((posIdx, k) => {
        const info = infos[posIdx];
        const idx = finalChoiceIndices[k];
        resolved[posIdx] = info.kind === 'range' && info.range ? String(rangeValueAt(info.range, idx)) : (info.choices ?? [''])[idx];
      });
      const refActualIndexOf = (refIndex: number): number => {
        let seen = 0;
        for (let j = 0; j < infos.length; j++) {
          if (!infos[j].isBackref) {
            if (seen === refIndex) return j;
            seen++;
          }
        }
        return -1;
      };
      infos.forEach((info, posIdx) => {
        if (!info.isBackref || info.refIndex === null) return;
        const refPos = refActualIndexOf(info.refIndex);
        resolved[posIdx] = refPos >= 0 ? resolved[refPos] : `{$${info.refIndex}}`;
      });

      let html = '';
      infos.forEach((_, i) => { html += escapeHtml(literals[i]) + `<span class="slot spinning" data-pos="${i}"></span>`; });
      html += escapeHtml(literals[literals.length - 1]);
      diceOutput.innerHTML = html;
      const slotEls = Array.from(diceOutput.querySelectorAll<HTMLElement>('.slot'));

      const states: DiceSlotState[] = infos.map((info, i) => ({
        el: slotEls[i],
        info,
        settleAt: 420 + i * 200,
        settled: false,
        finalDisplay: resolved[i],
        mirrorOf: info.isBackref && info.refIndex !== null ? refActualIndexOf(info.refIndex) : -1,
      }));
      states.forEach((s) => { if (s.info.isBackref && s.mirrorOf >= 0) s.settleAt = states[s.mirrorOf].settleAt; });

      const start = performance.now();
      diceLastTick = 0;
      const frame = (now: number) => {
        const elapsed = now - start;
        if (now - diceLastTick > 55) {
          diceLastTick = now;
          for (const s of states) {
            if (s.settled) continue;
            if (elapsed >= s.settleAt) {
              s.settled = true;
              s.el.textContent = s.finalDisplay;
              s.el.classList.remove('spinning');
              s.el.classList.add('settled');
              continue;
            }
            if (s.info.isBackref) {
              const ref = s.mirrorOf >= 0 ? states[s.mirrorOf] : null;
              s.el.textContent = ref?.el.textContent ?? '';
            } else {
              s.el.textContent = randomPreview(s.info);
            }
          }
        }
        diceRafId = states.some((s) => !s.settled) ? requestAnimationFrame(frame) : 0;
      };
      diceRafId = requestAnimationFrame(frame);
    }

    rollBtn.addEventListener('click', rollDice);

    // ---- Stream -----------------------------------------------------------

    interface StreamState {
      iterator: Iterator<string>;
      paused: boolean;
      done: boolean;
      count: number;
      total: number;
      startTime: number;
      rafId: number;
    }

    let streamState: StreamState | null = null;
    const STREAM_BATCH = 250;
    const STREAM_MAX_ROWS = 200;

    function updateStreamStats() {
      if (!streamState) { streamStatsEl.textContent = 'not streaming yet.'; return; }
      const elapsedS = Math.max(0.05, (performance.now() - streamState.startTime) / 1000);
      const rate = streamState.count / elapsedS;
      const totalLabel = Number.isFinite(streamState.total) ? streamState.total.toLocaleString('en-US') : '∞';
      const status = streamState.done ? 'done' : streamState.paused ? 'paused' : 'streaming';
      streamStatsEl.innerHTML =
        `<b>${streamState.count.toLocaleString('en-US')}</b> / ${totalLabel} pulled · ${Math.round(rate).toLocaleString('en-US')}/s · ` +
        `${streamListEl.children.length} rows in DOM (memory stays flat) · ${status}`;
    }

    function stopStreamLoop() {
      if (streamState?.rafId) cancelAnimationFrame(streamState.rafId);
    }

    function resetStream() {
      stopStreamLoop();
      streamState = null;
      streamListEl.innerHTML = '';
      streamPauseBtn.disabled = true;
      streamPauseBtn.textContent = '⏸ Pause';
      streamErrorEl.hidden = true;
      updateStreamStats();
    }

    function startStream() {
      streamErrorEl.hidden = true;
      const validation = lastValidation ?? validateTemplate(input.value);
      if (!validation.ok) {
        streamErrorEl.hidden = false;
        streamErrorEl.textContent = validation.message;
        return;
      }
      resetStream();
      const template = input.value;
      let iterableObj: Iterable<string>;
      try {
        iterableObj = parseSpintax(template);
      } catch (err) {
        streamErrorEl.hidden = false;
        streamErrorEl.textContent = `parse() failed: ${(err as Error)?.message ?? err}`;
        return;
      }
      const total = computeCount(template, validation.infos);
      streamState = {
        iterator: iterableObj[Symbol.iterator](),
        paused: false,
        done: false,
        count: 0,
        total,
        startTime: performance.now(),
        rafId: 0,
      };
      streamPauseBtn.disabled = false;
      streamPauseBtn.textContent = '⏸ Pause';

      const frame = () => {
        if (!streamState) return;
        if (streamState.paused) {
          streamState.rafId = requestAnimationFrame(frame);
          return;
        }
        const fragment = document.createDocumentFragment();
        let pulled = 0;
        let result: IteratorResult<string> | undefined;
        while (pulled < STREAM_BATCH) {
          result = streamState.iterator.next();
          if (result.done) break;
          const row = document.createElement('div');
          row.className = 'stream-row';
          row.textContent = result.value;
          fragment.appendChild(row);
          streamState.count++;
          pulled++;
        }
        streamListEl.appendChild(fragment);
        while (streamListEl.children.length > STREAM_MAX_ROWS) {
          streamListEl.removeChild(streamListEl.firstChild as ChildNode);
        }
        updateStreamStats();
        if (result?.done) {
          streamState.done = true;
          streamPauseBtn.disabled = true;
          updateStreamStats();
          return;
        }
        streamState.rafId = requestAnimationFrame(frame);
      };
      streamState.rafId = requestAnimationFrame(frame);
    }

    streamStartBtn.addEventListener('click', startStream);
    streamPauseBtn.addEventListener('click', () => {
      if (!streamState || streamState.done) return;
      streamState.paused = !streamState.paused;
      streamPauseBtn.textContent = streamState.paused ? '▶ Resume' : '⏸ Pause';
      updateStreamStats();
    });

    // ---- handoffs + deep link --------------------------------------------
    const toHashish = handoffButton({
      from: 'spintax',
      to: 'hashish',
      kind: 'spintax-variants',
      label: 'Send 200 variants to Hashish',
      getPayload: () => {
        const template = input.value;
        const v = validateTemplate(template);
        const total = v.ok ? computeCount(template, v.infos) : 0;
        const { variants, stride, pulled } = v.ok ? sampleVariants(template, total, 200) : { variants: [], stride: 1, pulled: 0 };
        return { template, variants, total: Number.isFinite(total) ? total : null, stride, pulled };
      },
    });
    toHashish.title = 'Samples 200 variants from parse()\'s lazy iterator (every k-th one) and indexes them in Hashish Lab';
    const toChunker = handoffButton({
      from: 'spintax',
      to: 'chunker',
      kind: 'spintax-document',
      label: 'Send as document to Chunker',
      getPayload: () => ({ template: TOPIC_TEMPLATE, ...generateTopicDocument() }),
    });
    toChunker.title = 'Rolls the "Topic-shifting document" preset (a different topic per paragraph) and chunks it in Chunker Scope';

    // ---- fuzz handoffs: sampled variants as test inputs / request paths ----
    const toTester = handoffButton({
      from: 'spintax',
      to: 'tester',
      kind: 'spintax-fuzz-variants',
      label: 'Send variants to Tester',
      getPayload: () => {
        const template = input.value;
        const v = validateTemplate(template);
        const total = v.ok ? computeCount(template, v.infos) : 0;
        const { variants, stride, pulled } = v.ok ? sampleVariants(template, total, 50) : { variants: [], stride: 1, pulled: 0 };
        return { template, variants, total: Number.isFinite(total) ? total : null, stride, pulled };
      },
    });
    toTester.title = 'Samples up to 50 variants from parse()\'s lazy iterator and queues them as fuzz inputs for the Tester Console';

    const toLetterpress = handoffButton({
      from: 'spintax',
      to: 'letterpress',
      kind: 'spintax-fuzz-paths',
      label: 'Send paths to Letterpress',
      getPayload: () => {
        const template = input.value;
        const v = validateTemplate(template);
        const total = v.ok ? computeCount(template, v.infos) : 0;
        const { variants } = v.ok ? sampleVariants(template, total, 50) : { variants: [] };
        const requests = variants.map((variant) => ({ method: 'GET', path: toRequestPath(variant) }));
        return { template, requests };
      },
    });
    toLetterpress.title = 'Slugifies up to 50 sampled variants into GET request paths, for fuzzing a Letterpress router (try the "API paths (fuzz)" preset)';

    handoffsEl.prepend(toHashish, toChunker, toTester, toLetterpress);

    const onCopy = async () => {
      saveState(input.value);
      await new Promise((r) => setTimeout(r, 180)); // let the debounced writeState land
      await copyLink();
      copyBtn.textContent = '✓ copied';
      setTimeout(() => { copyBtn.textContent = '🔗 copy link'; }, 1400);
    };
    copyBtn.addEventListener('click', onCopy);

    // ---- default state ----------------------------------------------------
    loadTemplate(initialTemplate);
    markActivePreset(initialTemplate);

    return () => {
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      stopDiceAnimation();
      stopStreamLoop();
      input.removeEventListener('input', onInput);
    };
  },
};

export default playground;
