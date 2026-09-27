/**
 * jth Conductor (ROADMAP §4.8).
 *
 * A persistent `@johnhenry/jth-eval` `JthContext` REPL (stack + registry
 * survive across lines, like a real shell) with four custom words bridging
 * other planets' libraries onto the jth stack:
 *   - `spin`   (template n -- variants)   @johnhenry/spintax's parse()
 *   - `recur`  (freq n -- isoStrings)     @johnhenry/temporals's recur()
 *   - `dedupe` (array -- array)           @johnhenry/hashish's MinHash primitives
 *   - `goto`   (payload targetId --)      src/bus.ts's send() -- hands the
 *              payload to another planet AND navigates there, same as any
 *              handoffButton() on this site.
 *
 * Two real bugs/gaps this file works around, discovered while building it
 * (documented here rather than silently patched over, per this repo's
 * convention — see e.g. src/playgrounds/domable.ts's "Fixed in domable
 * 0.0.1" comments):
 *
 *  1. `JthContext.defineOp(name, arity, fn)` wraps `fn` as
 *     `op(arity)((...args) => [fn(...args)])` — see
 *     node_modules/@johnhenry/jth-eval/dist/chunk-M6BT5V2L.js. `op()` itself
 *     DOES await a thenable return correctly, but only when `fn`'s return
 *     value IS the thenable; wrapping it in an array first (`[fn(...args)]`)
 *     produces a plain array synchronously, so `op()`'s `results.then`
 *     check never fires and an async `fn` ends up pushing its own
 *     un-awaited Promise object onto the stack instead of its resolved
 *     value. Verified empirically (see the test this file's author ran
 *     against `ctx.defineOp('x', 1, async (a) => a)`). Consequence for
 *     `dedupe`: it CANNOT be `async` and still compose inline in a
 *     pipeline like `… spin dedupe "chunker" goto`. Rather than reporting
 *     this upstream and blocking on it, `dedupe` here is built entirely
 *     from hashish's exported *synchronous* primitives
 *     (`murmurhash3_32`, `estimateSimilarity`) instead of the async
 *     `Hashish` class — which is only async because of its pluggable
 *     `StorageAdapter` (Map/Redis/…), not because MinHash itself needs to
 *     be. Real hashish code, real MinHash, zero `await`.
 *  2. jth-eval's sandbox blocks inline JS (`((...))`) at compile time in
 *     every sandbox mode, per its own README — verified true. Its README
 *     text this room's spec quoted also claims `::name` (a `::`-prefixed
 *     top-level value definition) is rejected the same way; empirically it
 *     is NOT — `evalJth('::x 5;', { sandbox: true })` resolves fine in
 *     every mode. The "sandbox self-test" panel below runs both probes
 *     live against whatever mode is selected, rather than asserting either
 *     claim — see its results for the real, current answer.
 *
 * "Run in a Worker for hard timeouts": `JthContext`'s own `timeout` is a
 * `Promise.race` (its README says so), so a runaway stdlib loop (`times`)
 * on the persistent context freezes the tab exactly like jth.ts's own
 * "legacy" main-thread toggle demonstrates. The persistent REPL above keeps
 * that soft timeout (it has to — `goto` needs this tab's real `location`,
 * which a Worker doesn't have). A second, separate lane below runs a
 * ONE-SHOT, stateless line in a real `@johnhenry/andbox` Worker — jth-eval
 * + spintax + temporals imported fresh from their published CDN mirrors,
 * exactly like src/playgrounds/jth.ts's own sandbox — so `worker.terminate()`
 * is available as a genuine hard kill. `goto`/`dedupe` aren't defined
 * there (no DOM, no `location`, and no point re-solving problem #1 above
 * inside a Worker too); `spin`/`recur` plus the full jth stdlib are.
 */
import { JthContext, evalJth, type SandboxOption } from '@johnhenry/jth-eval';
import { createSandbox as mkSandbox, type Sandbox } from '@johnhenry/andbox';
import { murmurhash3_32, estimateSimilarity } from '@johnhenry/hashish';
import { parse as spinParse, count as spinCount } from '@johnhenry/spintax';
import { Temporal } from 'temporal-polyfill';
import { recur, configureTemporal, type RecurRule } from '@johnhenry/temporals';
import { send } from './bus';
import { playgrounds } from './registry';
import { registerDevTool } from './dev-drawer';
import './conductor.css';

type ZDT = Temporal.ZonedDateTime;
configureTemporal(Temporal); // idempotent; almanac.ts also does this — see its own comment

const FREQS = ['secondly', 'minutely', 'hourly', 'daily', 'weekly', 'monthly', 'yearly'] as const;

/* ------------------------------------------------------------ dedupe (sync, real hashish) */
function shingles(text: string, size = 4): string[] {
  const t = text.trim();
  if (t.length <= size) return [t];
  const out: string[] = [];
  for (let i = 0; i <= t.length - size; i++) out.push(t.slice(i, i + size));
  return out;
}
/** MinHash signature built directly from hashish's exported murmurhash3_32 — the same
 * hash family the real `Hashish` class uses internally, just driven synchronously here. */
function minhashSignature(text: string, n = 24): number[] {
  const grams = shingles(text);
  const sig = new Array(n).fill(Number.POSITIVE_INFINITY);
  for (let i = 0; i < n; i++) {
    const seed = (i + 1) * 0x9e3779b1;
    for (const g of grams) {
      const h = murmurhash3_32(g, seed);
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig.map((v) => (Number.isFinite(v) ? v : 0));
}
/** Greedy near-duplicate filter using hashish's own estimateSimilarity() over MinHash signatures. */
function dedupeStrings(items: unknown[], threshold = 0.6): unknown[] {
  const strs = items.map((v) => (typeof v === 'string' ? v : JSON.stringify(v)));
  const sigs = strs.map((s) => minhashSignature(s));
  const kept: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const dup = kept.some((k) => estimateSimilarity(sigs[k], sigs[i]) >= threshold);
    if (!dup) kept.push(i);
  }
  return kept.map((i) => items[i]);
}

/* ------------------------------------------------------------ spin (real spintax) */
function spinVariants(template: string, n: number): string[] {
  const total = spinCount(template);
  const want = Math.max(0, Math.min(Math.floor(n) || 0, total, 500));
  const out: string[] = [];
  for (const v of spinParse(template)) {
    if (out.length >= want) break;
    out.push(v);
  }
  return out;
}

/* ------------------------------------------------------------ recur (real temporals) */
function recurStrings(freq: string, n: number): string[] {
  if (!(FREQS as readonly string[]).includes(freq)) {
    throw new Error(`recur: unknown freq "${freq}" — expected one of ${FREQS.join(', ')}`);
  }
  const now = Temporal.Now.zonedDateTimeISO();
  const rule: RecurRule<ZDT> = { start: now, freq: freq as RecurRule<ZDT>['freq'], interval: 1 };
  return recur(rule).take(Math.max(0, Math.min(Math.floor(n) || 0, 2000))).toArray().map((t) => t.toString());
}

/* ------------------------------------------------------------ goto (real bus) */
function gotoRoom(payload: unknown, targetId: string): string {
  const known = playgrounds.some((p) => p.id === targetId);
  send('conductor', targetId, 'jth-conductor-array', payload);
  return known ? `→ #/${targetId} (handoff sent)` : `→ #/${targetId} (no such planet id in the registry — navigated anyway, handoff will sit unread)`;
}

interface Preset { label: string; src: string }
const PRESETS: Preset[] = [
  { label: 'spin', src: '"{red|blue|green} {cat|dog|fox}" 6 spin peek;' },
  { label: 'spin+dedupe', src: '"{a|a|b} {x|x|y}" 6 spin dedupe peek;' },
  { label: 'recur', src: '"daily" 4 recur peek;' },
  { label: 'spin→goto', src: '"{a|b} {x|y}" 4 spin dedupe "chunker" goto;' },
  { label: 'stack ops', src: '1 2 + 3 * peek;' },
  { label: 'runaway (soft timeout)', src: '0 #[ ++ ] 200000000 times; peek;' },
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function describeValue(v: unknown): string {
  if (v === undefined) return '(empty stack)';
  try { return JSON.stringify(v); } catch { return String(v); }
}

let mounted = false;

export function mountConductor(): void {
  if (mounted) return;
  mounted = true;

  // The dock used to be its own floating root (`.conductor-dock`) appended
  // to document.body, with a `.cd-handle` toggle button that collapsed it to
  // a small circle. Both are gone — this pane now lives inside the Dev
  // Drawer, whose own tab strip is the toggle. The "N on stack" readout that
  // used to live inside the removed handle is relocated next to the first
  // section's label.
  let root!: HTMLElement;
  registerDevTool({
    id: 'conductor',
    label: 'Conductor',
    icon: '🎛',
    mount(container) {
      root = container;
      root.classList.add('conductor-dock-pane');
      root.innerHTML = `
        <div class="cd-section">
          <div class="cd-row">
            <div class="cd-label">Sandbox (JthContext, persistent stack)</div>
            <span class="cd-spacer"></span>
            <span class="stat" data-el="cd-stacklen">0 on stack</span>
          </div>
          <div class="cd-row">
            <select data-el="cd-sandbox">
              <option value="false">false — full stdlib, inline JS allowed</option>
              <option value="true">true — bare (values/operators only)</option>
              <option value="restricted">restricted — stdlib minus peek/peek-all</option>
            </select>
            <button class="btn" type="button" data-el="cd-reset">reset context</button>
          </div>
        </div>
        <div class="cd-section">
          <div class="cd-label">Custom words: spin (spintax) · recur (temporals) · dedupe (hashish) · goto (bus)</div>
          <div class="cd-presets" data-el="cd-presets"></div>
          <div class="cd-input-row">
            <input type="text" data-el="cd-input" spellcheck="false" autocomplete="off" placeholder='"{a|b}" 4 spin peek;' />
            <button class="btn primary" type="button" data-el="cd-run">run</button>
          </div>
          <ul class="cd-log" data-el="cd-log"></ul>
          <div class="cd-label">stack (toArray())</div>
          <pre class="cd-stack" data-el="cd-stack">[]</pre>
        </div>
        <div class="cd-section">
          <div class="cd-label">Sandbox self-test (live, not asserted — see file comment)</div>
          <div class="cd-selftest" data-el="cd-selftest"></div>
        </div>
        <div class="cd-section">
          <div class="cd-label">Hard-timeout lane — one-shot, stateless, real andbox Worker (spin/recur + stdlib only, no goto/dedupe)</div>
          <div class="cd-input-row">
            <input type="text" data-el="cd-worker-input" spellcheck="false" autocomplete="off" value='0 #[ ++ ] 1000000000 times; peek;' />
            <button class="btn" type="button" data-el="cd-worker-run">run isolated</button>
            <button class="btn" type="button" data-el="cd-worker-kill" disabled>kill</button>
          </div>
          <div class="cd-worker-status" data-el="cd-worker-status">worker not started yet</div>
        </div>`;
    },
  });

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(`[data-el="${sel}"]`) as T;

  /* ---- persistent JthContext ------------------------------------------ */
  let ctx: JthContext;
  function wireOps(c: JthContext): void {
    c.defineOp('spin', 2, (template: unknown, n: unknown) => spinVariants(String(template), Number(n)));
    c.defineOp('recur', 2, (freq: unknown, n: unknown) => recurStrings(String(freq), Number(n)));
    c.defineOp('dedupe', 1, (arr: unknown) => dedupeStrings(Array.isArray(arr) ? arr : [arr]));
    c.defineOp('goto', 2, (payload: unknown, targetId: unknown) => gotoRoom(payload, String(targetId)));
  }
  function newContext(sandbox: SandboxOption): JthContext {
    const c = new JthContext({ sandbox, timeout: 4000 });
    wireOps(c);
    return c;
  }
  const sandboxSel = $<HTMLSelectElement>('cd-sandbox');
  function currentSandbox(): SandboxOption {
    const v = sandboxSel.value;
    return v === 'true' ? true : v === 'restricted' ? 'restricted' : false;
  }
  ctx = newContext(currentSandbox());

  const logEl = $<HTMLUListElement>('cd-log');
  const stackEl = $('cd-stack');
  const stackLenEl = $('cd-stacklen');
  function paintStack(): void {
    const arr = ctx.toArray();
    stackLenEl.textContent = `${arr.length} on stack`;
    stackEl.textContent = describeValue(arr);
  }
  function logLine(src: string, ok: boolean, text: string): void {
    const li = document.createElement('li');
    li.innerHTML = `<div class="src">jth&gt; ${esc(src)}</div><div class="${ok ? 'out' : 'err'}">${esc(text)}</div>`;
    logEl.appendChild(li);
    logEl.scrollTop = logEl.scrollHeight;
  }
  async function runLine(src: string): Promise<void> {
    if (!src.trim()) return;
    try {
      const result = await ctx.eval(src);
      const parts: string[] = [];
      if (result.output) parts.push(result.output.trimEnd());
      parts.push(`value: ${describeValue(result.value)}`);
      logLine(src, true, parts.join('\n'));
    } catch (err) {
      const e = err as Error & { code?: string };
      logLine(src, false, `${e?.name ?? 'Error'}${e?.code ? ` (${e.code})` : ''}: ${e?.message ?? String(err)}`);
    }
    paintStack();
  }
  paintStack();

  sandboxSel.addEventListener('change', () => {
    ctx.dispose();
    ctx = newContext(currentSandbox());
    logLine('# sandbox changed', true, `new JthContext({ sandbox: ${sandboxSel.value} }) — stack cleared`);
    paintStack();
    void runSelfTest();
  });
  $<HTMLButtonElement>('cd-reset').addEventListener('click', () => {
    ctx.dispose();
    ctx = newContext(currentSandbox());
    logEl.innerHTML = '';
    paintStack();
  });

  const input = $<HTMLInputElement>('cd-input');
  const runBtn = $<HTMLButtonElement>('cd-run');
  function submit(): void {
    const src = input.value;
    void runLine(src);
  }
  runBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  const presetsEl = $('cd-presets');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p.label;
    b.addEventListener('click', () => { input.value = p.src; input.focus(); });
    presetsEl.appendChild(b);
  }

  /* ---- sandbox self-test (live probes, not assertions) ----------------- */
  const selftestEl = $('cd-selftest');
  async function probe(label: string, code: string): Promise<string> {
    try {
      const r = await evalJth(code, { sandbox: currentSandbox(), timeout: 1500 });
      return `<span class="bad">${esc(label)}: allowed (value: ${esc(describeValue(r.value))})</span>`;
    } catch (err) {
      const e = err as Error & { code?: string };
      return `<span class="ok">${esc(label)}: rejected — ${esc(e?.code ?? e?.name ?? 'Error')}</span>`;
    }
  }
  async function runSelfTest(): Promise<void> {
    selftestEl.innerHTML = '<span class="stat">probing…</span>';
    const [a, b] = await Promise.all([
      probe('inline JS ((...))', '((s)=>s.push(1));'),
      probe('::name (value definition)', '::probeval 5;'),
    ]);
    selftestEl.innerHTML = `${a}${b}<span class="stat">against sandbox: ${sandboxSel.value}</span>`;
  }
  void runSelfTest();

  /* ---- hard-timeout Worker lane ----------------------------------------- */
  const JTH_EVAL_VERSION = '0.0.0';
  const SPINTAX_VERSION = '0.0.1';
  const TEMPORALS_VERSION = '0.0.1';
  const TEMPORAL_POLYFILL_VERSION = '0.3.2';
  const WORKER_IMPORT_MAP = {
    '@johnhenry/jth-eval': `https://esm.sh/@johnhenry/jth-eval@${JTH_EVAL_VERSION}`,
    '@johnhenry/spintax': `https://esm.sh/@johnhenry/spintax@${SPINTAX_VERSION}`,
    '@johnhenry/temporals': `https://esm.sh/@johnhenry/temporals@${TEMPORALS_VERSION}`,
    'temporal-polyfill': `https://esm.sh/temporal-polyfill@${TEMPORAL_POLYFILL_VERSION}`,
  };
  /** Runs standalone inside the andbox Worker: a fresh, stateless JthContext with spin/recur (no goto/dedupe — no DOM/location out there) plus the full jth stdlib (jth-eval's own import side effect). */
  const WORKER_PROGRAM = `
    const { JthContext } = await sandboxImport('@johnhenry/jth-eval');
    const { parse, count } = await sandboxImport('@johnhenry/spintax');
    const { recur, configureTemporal } = await sandboxImport('@johnhenry/temporals');
    const { Temporal } = await sandboxImport('temporal-polyfill');
    configureTemporal(Temporal);
    const ctx = new JthContext({ sandbox: false, timeout: 60000 });
    ctx.defineOp('spin', 2, (tpl, n) => {
      const want = Math.max(0, Math.min(Math.floor(n) || 0, count(tpl), 500));
      const out = [];
      for (const v of parse(tpl)) { if (out.length >= want) break; out.push(v); }
      return out;
    });
    ctx.defineOp('recur', 2, (freq, n) => {
      const now = Temporal.Now.zonedDateTimeISO();
      return recur({ start: now, freq, interval: 1 }).take(Math.max(0, Math.min(Math.floor(n) || 0, 2000))).toArray().map(String);
    });
    const result = await ctx.eval(__SRC__);
    return { value: result.value, stack: result.stack, output: result.output };
  `;

  let sandbox: Sandbox | null = null;
  let sandboxPromise: Promise<Sandbox> | null = null;
  const workerStatusEl = $('cd-worker-status');
  function ensureSandbox(): Promise<Sandbox> {
    if (sandbox) return Promise.resolve(sandbox);
    if (!sandboxPromise) {
      workerStatusEl.textContent = 'starting worker + fetching jth-eval/spintax/temporals from esm.sh…';
      sandboxPromise = mkSandbox({ importMap: { imports: WORKER_IMPORT_MAP }, defaultTimeoutMs: 8000 })
        .then((sb) => { sandbox = sb; workerStatusEl.textContent = 'worker ready'; return sb; })
        .catch((e) => { sandboxPromise = null; workerStatusEl.textContent = `worker failed to start: ${(e as Error).message}`; throw e; });
    }
    return sandboxPromise;
  }
  void ensureSandbox();

  const workerInput = $<HTMLInputElement>('cd-worker-input');
  const workerRunBtn = $<HTMLButtonElement>('cd-worker-run');
  const workerKillBtn = $<HTMLButtonElement>('cd-worker-kill');
  let runAbort: AbortController | null = null;

  workerRunBtn.addEventListener('click', async () => {
    workerRunBtn.disabled = true;
    workerKillBtn.disabled = false;
    workerStatusEl.textContent = 'running in Worker (5s hard timeout)…';
    const t0 = performance.now();
    runAbort = new AbortController();
    try {
      const sb = await ensureSandbox();
      const src = JSON.stringify(workerInput.value);
      const program = WORKER_PROGRAM.replace('__SRC__', src);
      const value = await sb.evaluate(program, { timeoutMs: 5000, signal: runAbort.signal });
      workerStatusEl.textContent = `ok in ${(performance.now() - t0).toFixed(0)}ms — ${describeValue(value)}`;
    } catch (err) {
      const msg = (err as Error)?.message?.toLowerCase() ?? '';
      const killed = msg.includes('timeout') || msg.includes('timed out') || (err as Error)?.name === 'AbortError' || (err as Error)?.name === 'TimeoutError';
      workerStatusEl.textContent = killed
        ? `killed after ${(performance.now() - t0).toFixed(0)}ms (worker.terminate()'d — main thread stayed responsive the whole time)`
        : `error: ${(err as Error)?.message ?? err}`;
      // A timed-out/killed Worker is torn down by andbox itself; drop our
      // reference so the next run gets a fresh one instead of reusing a dead sandbox.
      if (killed) { sandbox = null; sandboxPromise = null; }
    } finally {
      workerRunBtn.disabled = false;
      workerKillBtn.disabled = true;
      runAbort = null;
    }
  });
  workerKillBtn.addEventListener('click', () => { runAbort?.abort(); });
}
