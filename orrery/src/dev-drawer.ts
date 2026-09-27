/**
 * Dev tools floating widget — one self-mounting corner widget hosting every
 * "site-wide dock" module that used to mount its own floating toggle+panel
 * (telemetry, HAR recorder, almanac, conductor, identity panel, signal bus,
 * laya judge). Was briefly a header-toggled full-screen drawer with a tab
 * strip; reverted to a floating widget per request, now paged with </>
 * arrows (plus click-to-jump dots) instead of a tab bar, so there's still
 * only ever ONE floating widget on screen rather than seven.
 *
 * Why `registerDevTool()` still calls `tool.mount(container)` immediately
 * and synchronously: background effects like the HAR recorder's
 * fetch-patching or the telemetry dock's `setSink()` call have to keep
 * starting the moment the app loads, regardless of whether this widget has
 * ever been opened or which tool is currently paged into view — exactly as
 * when each dock mounted itself directly to `document.body`. Every
 * registered tool's pane exists in real DOM from its own
 * `registerDevTool()` call; the pager only toggles which one is visible.
 */
import './dev-drawer.css';

export interface DevTool {
  /** Stable id. */
  id: string;
  /** Shown next to the icon when this tool is the active page. */
  label: string;
  /** Optional glyph shown before the label. */
  icon?: string;
  /**
   * Build the tool's UI into `container` (a fresh `<div class="dev-tool-pane">`).
   * Called immediately and synchronously from `registerDevTool()` — do not
   * defer any side effects that used to run at mount-time. Return a cleanup
   * function if you allocate anything that should be torn down (not called
   * today — tools live for the app's whole lifetime, same as the standalone
   * docks they replaced — but stored for completeness).
   */
  mount(container: HTMLElement): void | (() => void);
}

interface Registered {
  tool: DevTool;
  pane: HTMLElement;
  dotBtn: HTMLButtonElement;
  cleanup?: () => void;
}

let root: HTMLElement | null = null;
let contentEl: HTMLElement | null = null;
let dotsEl: HTMLElement | null = null;
let currentIconEl: HTMLElement | null = null;
let currentLabelEl: HTMLElement | null = null;
const registered: Registered[] = [];
let activeIndex = 0;

/** Build the (initially collapsed) shell exactly once. Safe to call any number of times. */
function ensureShell(): void {
  if (root) return;

  root = document.createElement('div');
  root.className = 'dev-widget collapsed';
  root.innerHTML = `
    <button class="dw-handle" type="button" aria-expanded="false" title="Dev tools">
      <span class="dw-dot"></span>
      <span class="dw-title">Dev tools</span>
      <span class="dw-spacer"></span>
      <span class="dw-caret">&#9662;</span>
    </button>
    <div class="dw-body">
      <div class="dw-pager">
        <button class="dw-pager-btn dw-prev" type="button" title="Previous tool" aria-label="Previous tool">&#8249;</button>
        <span class="dw-current"><span class="dw-current-icon" data-el="dw-icon"></span><span class="dw-current-label" data-el="dw-label"></span></span>
        <button class="dw-pager-btn dw-next" type="button" title="Next tool" aria-label="Next tool">&#8250;</button>
      </div>
      <div class="dw-dots" data-el="dw-dots"></div>
      <div class="dw-content" data-el="dw-content"></div>
    </div>`;
  document.body.appendChild(root);

  const handle = root.querySelector<HTMLButtonElement>('.dw-handle')!;
  handle.addEventListener('click', () => {
    const collapsed = root!.classList.toggle('collapsed');
    handle.setAttribute('aria-expanded', String(!collapsed));
  });

  contentEl = root.querySelector('[data-el="dw-content"]') as HTMLElement;
  dotsEl = root.querySelector('[data-el="dw-dots"]') as HTMLElement;
  currentIconEl = root.querySelector('[data-el="dw-icon"]') as HTMLElement;
  currentLabelEl = root.querySelector('[data-el="dw-label"]') as HTMLElement;

  root.querySelector('.dw-prev')!.addEventListener('click', () => step(-1));
  root.querySelector('.dw-next')!.addEventListener('click', () => step(1));
}

function setActive(index: number): void {
  if (registered.length === 0) return;
  activeIndex = ((index % registered.length) + registered.length) % registered.length;
  registered.forEach((r, i) => {
    const active = i === activeIndex;
    r.pane.hidden = !active;
    r.dotBtn.classList.toggle('active', active);
    r.dotBtn.setAttribute('aria-current', String(active));
  });
  const cur = registered[activeIndex]!.tool;
  currentIconEl!.textContent = cur.icon ?? '';
  currentLabelEl!.textContent = cur.label;
}

function step(delta: number): void {
  setActive(activeIndex + delta);
}

/**
 * Register a dev tool: builds its pane, mounts it immediately (synchronously —
 * see the file-level comment for why), and adds it to the pager. Self-initializes
 * the shared widget shell on its own first call, so callers (main.ts's several
 * `mount*()` calls) need no particular ordering relative to each other.
 */
export function registerDevTool(tool: DevTool): void {
  ensureShell();
  if (registered.some((r) => r.tool.id === tool.id)) return; // idempotency guard, mirrors each dock's own `mounted` flag

  const pane = document.createElement('div');
  pane.className = 'dev-tool-pane';
  pane.dataset.toolId = tool.id;
  pane.hidden = true;
  contentEl!.appendChild(pane);

  const dotBtn = document.createElement('button');
  dotBtn.type = 'button';
  dotBtn.className = 'dw-dot-btn';
  dotBtn.title = tool.label;
  dotBtn.setAttribute('aria-label', `Jump to ${tool.label}`);
  const index = registered.length;
  dotBtn.addEventListener('click', () => setActive(index));
  dotsEl!.appendChild(dotBtn);

  const entry: Registered = { tool, pane, dotBtn };
  registered.push(entry);

  // Mount NOW, synchronously — the whole point of this module: a tool's
  // background effects (fetch patching, global sink installation, timers,
  // BroadcastChannel subscriptions, …) must start the instant the owning
  // module loads, regardless of whether the widget is ever opened or paged to.
  const cleanup = tool.mount(pane);
  if (typeof cleanup === 'function') entry.cleanup = cleanup;

  setActive(activeIndex); // repaint (registering after the first tool shifts nothing visible, but keeps dots/labels in sync)
}
