import type { Playground } from '../registry';
import {
  createSignals,
  pointer,
  scroll,
  viewport,
  keyboard,
  date,
  random,
  input,
  cycle,
  gamepad,
  audio,
  microphoneAnalyser,
  type Signals,
} from '@johnhenry/css-signals';
import { readState, writeState, copyLink } from '../state';
import './signals.css';

// ---- deep-linkable state --------------------------------------------------
// Persisted: which widgets are expanded, the range input value, the cycle
// color index. NOT persisted: the microphone toggle (it re-requests a live
// device permission, so a shared link should never auto-enable it).
const WIDGET_IDS = ['spotlight', 'sprite', 'clock', 'ring', 'confetti', 'range', 'cycle', 'gamepad'] as const;
type WidgetId = (typeof WIDGET_IDS)[number];
const STATE_DEFAULTS = { size: 50, cycleIndex: 0, expanded: [...WIDGET_IDS] as WidgetId[] };

const PREFIX = 'room';
const WASD = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const CONFETTI_COUNT = 10; // one --room-random-{2i} / {2i+1} pair (x, y) per piece
const RANDOM_COUNT = CONFETTI_COUNT * 2;
const AUDIO_BINS = 8;
const SWATCHES = ['#ff6b6b', '#4dd0e1', '#ffd166', '#9b5de5', '#06d6a0'];

/** The actual CSS rules the planet ships, shown verbatim in the "stylesheet" panel. */
const STYLESHEET_SOURCE = `/* pointer() -> spotlight + tilt, pure var()/calc(), no JS per frame */
.pg-spotlight {
  background: radial-gradient(
    220px circle at calc(var(--room-pointer-x-progress) * 100%) calc(var(--room-pointer-y-progress) * 100%),
    color-mix(in srgb, var(--accent) 40%, transparent), transparent 70%
  );
}
.pg-tilt-card {
  transform: perspective(600px)
    rotateX(calc((0.5 - var(--room-pointer-y-progress)) * 24deg))
    rotateY(calc((var(--room-pointer-x-progress) - 0.5) * 24deg));
}

/* keyboard({ keys: [WASD] }) -> sprite translate, diagonals are a sum of two calc() products */
.pg-sprite {
  transform: translate3d(
    calc((var(--room-key-KeyD, 0) - var(--room-key-KeyA, 0)) * 70px),
    calc((var(--room-key-KeyS, 0) - var(--room-key-KeyW, 0)) * 70px),
    0
  );
}

/* date() -> analog clock hands, rotated straight from --room-date-* */
.pg-hand-hour   { transform: rotate(calc((var(--room-date-hour) + var(--room-date-minute) / 60) * 30deg)); }
.pg-hand-minute { transform: rotate(calc((var(--room-date-minute) + var(--room-date-second) / 60) * 6deg)); }
.pg-hand-second { transform: rotate(calc(var(--room-date-second) * 6deg)); }

/* scroll() -> a conic-gradient ring, no listener needed where scroll-driven animations exist */
.pg-ring {
  background: conic-gradient(var(--accent) calc(var(--room-scroll-y-progress, 0) * 360deg), var(--line) 0);
}

/* random() -> confetti scatter; --px/--py alias one of the pool per piece, re-rolled by reset() */
.pg-confetti span {
  left: calc(var(--px) * 92%);
  top: calc(var(--py) * 78%);
  background: hsl(calc(var(--px) * 360) 80% 60%);
  transform: rotate(calc(var(--py) * 360deg));
}

/* input() -> range slider resizes and recolors a shape, no change handler of our own */
.pg-blob {
  width: calc(var(--room-input-size, 50) * 1.6px);
  height: calc(var(--room-input-size, 50) * 1.6px);
  background: hsl(calc(var(--room-input-size, 50) * 3.6) 70% 55%);
}

/* cycle() -> click steps through data-signal-values; the swatch just reads the result */
.pg-swatch { background: var(--room-cycle-accent, #ff6b6b); }

/* gamepad() -> a dot nudged by the left stick, no JS position math */
.pg-pad-dot {
  transform: translate(calc(var(--room-gamepad-0-axis-0, 0) * 40px), calc(var(--room-gamepad-0-axis-1, 0) * 40px));
  opacity: calc(0.35 + var(--room-gamepad-0-connected, 0) * 0.65);
}

/* audio() -> bar heights from --room-audio-bin-{i}, aliased per bar via --lvl */
.pg-bars span { height: calc(var(--lvl, 0) * 100%); }
`;

const playground: Playground = {
  id: 'signals',
  title: 'Signal Sky',
  pkg: '@johnhenry/css-signals',
  hue: 25,
  blurb: 'Pointer, scroll, time and keys become typed CSS variables. No JS in the styling loop.',
  docs: 'https://opensource.johnhenry.me/css-signals/',
  mount(host) {
    try {
      return buildRoom(host);
    } catch (err) {
      host.innerHTML = `<pre class="code">${escapeHtml(String((err as Error)?.stack ?? err))}</pre>`;
    }
  },
};
export default playground;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function buildRoom(host: HTMLElement): () => void {
  const state = readState(STATE_DEFAULTS);
  const isExpanded = (id: WidgetId) => state.expanded.includes(id);
  const fold = (id: WidgetId, label: string) =>
    `<button class="pg-fold" type="button" data-fold="${id}" aria-expanded="${isExpanded(id)}" title="collapse/expand this widget">${isExpanded(id) ? '−' : '+'}</button>` +
    `<span class="pg-fold-label" aria-hidden="true">${label}</span>`;
  const widgetClass = (id: WidgetId, extra = '') => `pg-widget ${extra} ${isExpanded(id) ? '' : 'collapsed'}`.trim();

  const confettiSpans = Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const x = i * 2;
    const y = i * 2 + 1;
    return `<span style="--px: var(--room-random-${x}); --py: var(--room-random-${y})"></span>`;
  }).join('');

  const swatchValues = SWATCHES.join(';');

  host.innerHTML = `
    <div class="pg-signals">
      <div class="pg-topbar">
        <p class="pg-hint">widgets you collapse, the size slider and the cycle color stay in the link below. The mic toggle never does.</p>
        <button class="btn pg-copy-link" type="button">🔗 copy link</button>
      </div>
      <div class="pg-stage panel">
        <div class="${widgetClass('spotlight', 'pg-spotlight-wrap')}" data-widget="spotlight">
          ${fold('spotlight', 'tilt + spotlight')}
          <div class="pg-spotlight">
            <div class="pg-tilt-card">
              <div class="pg-tilt-inner">
                <strong>tilt + spotlight</strong>
                <span>pointer-x/y-progress</span>
              </div>
            </div>
          </div>
        </div>

        <div class="${widgetClass('sprite', 'pg-sprite-field')}" data-widget="sprite">
          ${fold('sprite', 'WASD sprite')}
          <div class="pg-sprite" aria-hidden="true"></div>
          <p class="pg-hint">click here, then hold <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></p>
        </div>

        <div class="${widgetClass('clock', 'pg-clock-block')}" data-widget="clock">
          ${fold('clock', 'analog clock')}
          <div class="pg-clock-face">
            <div class="pg-hand pg-hand-hour"></div>
            <div class="pg-hand pg-hand-minute"></div>
            <div class="pg-hand pg-hand-second"></div>
            <div class="pg-clock-pin"></div>
          </div>
          <p class="pg-hint">date-hour/minute/second</p>
        </div>

        <div class="${widgetClass('ring', 'pg-ring-block')}" data-widget="ring">
          ${fold('ring', 'scroll ring')}
          <div class="pg-ring"><div class="pg-ring-hole"></div></div>
          <p class="pg-hint">scroll this page — scroll-y-progress</p>
        </div>

        <div class="${widgetClass('confetti', 'pg-confetti-block')}" data-widget="confetti">
          ${fold('confetti', 'confetti')}
          <div class="pg-confetti">${confettiSpans}</div>
          <button class="btn pg-reroll" type="button">re-roll random()</button>
        </div>

        <div class="${widgetClass('range', 'pg-range-block')}" data-widget="range">
          ${fold('range', 'size → shape')}
          <label class="field">
            size → shape
            <input type="range" data-signal="size" min="10" max="100" value="${state.size}">
          </label>
          <div class="pg-blob"></div>
        </div>

        <div class="${widgetClass('cycle', 'pg-cycle-block')}" data-widget="cycle">
          ${fold('cycle', 'cycle()')}
          <button class="pg-swatch" type="button" data-signal-cycle="accent" data-signal-values="${swatchValues}">
            click to cycle()
          </button>
        </div>

        <div class="${widgetClass('gamepad', 'pg-gamepad-block')}" data-widget="gamepad">
          ${fold('gamepad', 'gamepad stick')}
          <div class="pg-pad-arena"><div class="pg-pad-dot"></div></div>
          <p class="pg-hint">connect a gamepad, move the left stick</p>
        </div>
      </div>

      <aside class="pg-side">
        <div class="panel pg-audio-panel">
          <label class="pg-audio-toggle-row">
            <input type="checkbox" class="pg-audio-toggle">
            enable microphone visualizer (opt-in, off by default)
          </label>
          <div class="pg-bars">${Array.from({ length: AUDIO_BINS }, () => '<span></span>').join('')}</div>
          <p class="pg-hint pg-audio-status">microphone off</p>
        </div>

        <div class="panel pg-inspector">
          <h3>live inspector</h3>
          <p class="pg-hint">every <code>--room-*</code> property, read via <code>getComputedStyle</code> on an rAF loop — the one place this planet's JS reads a CSS value back.</p>
          <div class="pg-inspector-list"></div>
        </div>

        <div class="panel pg-stylesheet">
          <h3>stylesheet</h3>
          <p class="pg-hint">the actual rules driving every widget above. It's just <code>var()</code>.</p>
          <pre class="code pg-stylesheet-pre"></pre>
        </div>
      </aside>
    </div>
  `;

  const stage = host.querySelector<HTMLElement>('.pg-signals')!;
  const inspectorList = host.querySelector<HTMLElement>('.pg-inspector-list')!;
  const stylesheetPre = host.querySelector<HTMLElement>('.pg-stylesheet-pre')!;
  const rerollBtn = host.querySelector<HTMLButtonElement>('.pg-reroll')!;
  const audioToggle = host.querySelector<HTMLInputElement>('.pg-audio-toggle')!;
  const audioStatus = host.querySelector<HTMLElement>('.pg-audio-status')!;
  const bars = Array.from(host.querySelectorAll<HTMLElement>('.pg-bars span'));

  stylesheetPre.textContent = STYLESHEET_SOURCE;

  const randomSource = random({ count: RANDOM_COUNT, seed: 7 });
  const gamepadSource = gamepad({ limit: 1 });

  const signals: Signals = createSignals({ prefix: PREFIX, target: stage }).use(
    pointer(),
    scroll(),
    viewport(),
    keyboard({ keys: WASD }),
    date(),
    randomSource,
    input(),
    cycle(),
    gamepadSource,
  );

  // ---- deep link: fold state, range value, cycle index (never the mic) ----
  const syncUrl = () => writeState(state, STATE_DEFAULTS);

  const foldBtns = Array.from(host.querySelectorAll<HTMLButtonElement>('.pg-fold'));
  const onFoldClick = (e: Event) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const id = btn.dataset.fold as WidgetId;
    const widget = btn.closest<HTMLElement>('.pg-widget')!;
    const nowExpanded = !isExpanded(id);
    widget.classList.toggle('collapsed', !nowExpanded);
    btn.setAttribute('aria-expanded', String(nowExpanded));
    btn.textContent = nowExpanded ? '−' : '+';
    state.expanded = nowExpanded
      ? [...state.expanded, id]
      : state.expanded.filter((x) => x !== id);
    syncUrl();
  };
  for (const btn of foldBtns) btn.addEventListener('click', onFoldClick);

  const sizeInput = host.querySelector<HTMLInputElement>('input[data-signal="size"]')!;
  const onSizeInput = () => {
    state.size = Number(sizeInput.value) || STATE_DEFAULTS.size;
    syncUrl();
  };
  sizeInput.addEventListener('input', onSizeInput);

  // css-signals' cycle() tracks its own index internally and starts at 0 on
  // mount; replay saved clicks (guarded) to fast-forward it back to the
  // link's color without writing the state we're restoring from.
  const cycleBtn = host.querySelector<HTMLButtonElement>('.pg-swatch')!;
  let restoringCycle = false;
  let cycleIndex = 0;
  const onCycleClick = () => {
    if (restoringCycle) return;
    cycleIndex = (cycleIndex + 1) % SWATCHES.length;
    state.cycleIndex = cycleIndex;
    syncUrl();
  };
  cycleBtn.addEventListener('click', onCycleClick);
  if (state.cycleIndex > 0) {
    restoringCycle = true;
    for (let i = 0; i < state.cycleIndex % SWATCHES.length; i++) cycleBtn.click();
    cycleIndex = state.cycleIndex % SWATCHES.length;
    restoringCycle = false;
  }

  const copyLinkBtn = host.querySelector<HTMLButtonElement>('.pg-copy-link')!;
  const onCopyLink = async () => {
    syncUrl();
    await new Promise((r) => setTimeout(r, 200)); // writeState is debounced
    await copyLink();
    copyLinkBtn.textContent = '✓ copied';
    setTimeout(() => { copyLinkBtn.textContent = '🔗 copy link'; }, 1400);
  };
  copyLinkBtn.addEventListener('click', onCopyLink);

  // ---- Live inspector: the only place this planet reads a CSS value back into JS. ----
  const propertyKeys = [
    'pointer-x', 'pointer-y', 'pointer-x-progress', 'pointer-y-progress', 'pointer-down', 'pointer-inside',
    'scroll-x-progress', 'scroll-y-progress',
    'viewport-width', 'viewport-height',
    'key-alt', 'key-ctrl', 'key-meta', 'key-shift', 'key-KeyW', 'key-KeyA', 'key-KeyS', 'key-KeyD',
    'date-second', 'date-minute', 'date-hour', 'date-hour24', 'date-am', 'date-pm',
    'date-weekday', 'date-monthday', 'date-month', 'date-year',
    ...Array.from({ length: RANDOM_COUNT }, (_, i) => `random-${i}`),
    'input-size',
    'cycle-accent', 'cycle-accent-index',
    'gamepad-0-connected', 'gamepad-0-axis-0', 'gamepad-0-axis-1',
  ];
  const audioKeys = [
    'audio-level', 'audio-bass', 'audio-mid', 'audio-treble',
    ...Array.from({ length: AUDIO_BINS }, (_, i) => `audio-bin-${i}`),
  ];
  let includeAudioKeys = false;

  const inspectorRows = new Map<string, HTMLElement>();
  function ensureRow(key: string) {
    let row = inspectorRows.get(key);
    if (row) return row;
    row = document.createElement('div');
    row.className = 'pg-inspector-row';
    row.innerHTML = `<span class="pg-inspector-key">--${PREFIX}-${key}</span><span class="pg-inspector-val"></span>`;
    inspectorList.appendChild(row);
    inspectorRows.set(key, row);
    return row;
  }
  for (const key of propertyKeys) ensureRow(key);

  let raf = 0;
  function tick() {
    const style = getComputedStyle(stage);
    const keys = includeAudioKeys ? propertyKeys.concat(audioKeys) : propertyKeys;
    for (const key of keys) {
      const row = ensureRow(key);
      const val = style.getPropertyValue(`--${PREFIX}-${key}`).trim();
      const valEl = row.querySelector('.pg-inspector-val')!;
      valEl.textContent = val === '' ? '–' : val;
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  // ---- re-roll random() ----
  const onReroll = () => randomSource.reset();
  rerollBtn.addEventListener('click', onReroll);

  // ---- opt-in microphone audio() ----
  let audioStop: (() => Promise<void>) | null = null;
  let audioBusy = false;
  const onAudioToggle = async () => {
    if (audioBusy) return;
    if (audioToggle.checked) {
      audioBusy = true;
      audioStatus.textContent = 'requesting microphone…';
      try {
        const mic = await microphoneAnalyser();
        audioStop = mic.stop;
        signals.use(audio({ analyser: mic.analyser, bins: AUDIO_BINS }));
        for (let i = 0; i < AUDIO_BINS; i++) bars[i].style.setProperty('--lvl', `var(--room-audio-bin-${i}, 0)`);
        includeAudioKeys = true;
        audioStatus.textContent = 'microphone live';
      } catch (err) {
        audioToggle.checked = false;
        audioStatus.textContent = `microphone denied: ${(err as Error)?.message ?? err}`;
      } finally {
        audioBusy = false;
      }
    } else {
      audioBusy = true;
      try {
        await audioStop?.();
      } finally {
        audioStop = null;
        includeAudioKeys = false;
        for (const bar of bars) bar.style.removeProperty('--lvl');
        audioStatus.textContent = 'microphone off';
        audioBusy = false;
      }
    }
  };
  audioToggle.addEventListener('change', onAudioToggle);

  return () => {
    cancelAnimationFrame(raf);
    rerollBtn.removeEventListener('click', onReroll);
    for (const btn of foldBtns) btn.removeEventListener('click', onFoldClick);
    sizeInput.removeEventListener('input', onSizeInput);
    cycleBtn.removeEventListener('click', onCycleClick);
    copyLinkBtn.removeEventListener('click', onCopyLink);
    audioToggle.removeEventListener('change', onAudioToggle);
    audioStop?.(); // release the microphone stream and close the AudioContext for real
    signals.dispose();
  };
}
