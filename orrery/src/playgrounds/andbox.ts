import type { Playground } from '../registry';
import { createSandbox as mkSandbox, gateCapabilities as gate } from '@johnhenry/andbox';
import type { Sandbox, GateStatsResult as GateStats } from '@johnhenry/andbox';
import { readState, writeState, copyLink } from '../state';
import './andbox.css';

// Persisted: preset id, timeout ms, rate limit (max calls), and the code
// itself when it's a small (<~2KB) edit away from the preset's own source.
const CODE_CAP = 2000;

/** Shorthand for the plain function shape andbox's capabilities/gate APIs take. */
type Cap = (...args: any[]) => any;

// ---- presets ---------------------------------------------------------------
interface Preset { id: string; label: string; timeout: number; maxCalls: number; code: string }

const PRESETS: Preset[] = [
  {
    id: 'paint', label: 'host capabilities · paint', timeout: 4000, maxCalls: 5000,
    code: `// Every host.* call below is an RPC: the worker posts a
// 'capabilityCall' message, the host page runs the function,
// and posts the result back. setPixel paints the canvas on the right.
const { plasma } = await sandboxImport('palette'); // a virtual module

await host.log('worker online — painting 32×32 plasma');
const seed = await host.random();
const t0 = await host.now();

for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) {
    await host.setPixel(x, y, plasma(x, y, seed));
  }
  await new Promise(r => setTimeout(r, 12)); // pace it so you can watch
}

const ms = (await host.now()) - t0;
await host.log(\`painted 1024 pixels in \${ms.toFixed(0)}ms\`);
return { pixels: 1024, ms: Math.round(ms), seed: +seed.toFixed(4) };`,
  },
  {
    id: 'compute', label: 'pure compute', timeout: 8000, maxCalls: 5000,
    code: `// Pure CPU inside the worker: no capabilities, just math.
// The host page keeps animating at full fps while this crunches.
const N = 5_000_000;
const sieve = new Uint8Array(N + 1);
let primes = 0, largest = 0;
for (let i = 2; i <= N; i++) {
  if (sieve[i]) continue;
  primes++; largest = i;
  for (let j = i * i; j <= N; j += i) sieve[j] = 1;
}
console.log(\`sieve done: \${primes} primes ≤ \${N}\`);

// Monte-Carlo π with a tiny xorshift PRNG (no host.random: zero RPC)
let s = 0x9e3779b9, inside = 0;
const rnd = () => ((s ^= s << 13, s ^= s >>> 17, s ^= s << 5) >>> 0) / 4294967296;
const SAMPLES = 4_000_000;
for (let i = 0; i < SAMPLES; i++) {
  const x = rnd(), y = rnd();
  if (x * x + y * y < 1) inside++;
}
console.log('π ≈', (4 * inside / SAMPLES).toFixed(5));

return { primes, largest, pi: +(4 * inside / SAMPLES).toFixed(5) };`,
  },
  {
    id: 'runaway', label: 'runaway loop · hard kill', timeout: 2500, maxCalls: 5000,
    code: `// Paint a warning stripe, then spin forever.
// There is no await inside the loop, so the worker's event loop is
// dead: it can't read messages, can't be asked nicely to stop.
// Only the host calling worker.terminate() ends this. Watch the
// timeout (or press Kill).
await host.log('painting a warning stripe…');
for (let x = 0; x < 32; x++) {
  await host.setPixel(x, 15, x % 4 < 2 ? '#ff3b6b' : '#1a0a12');
  await host.setPixel(x, 16, x % 4 < 2 ? '#1a0a12' : '#ff3b6b');
}
await host.log('entering while (true) { } — goodbye');

let n = 0;
while (true) { n++; }`,
  },
  {
    id: 'flood', label: 'rate-limit breach', timeout: 6000, maxCalls: 400,
    code: `// The host gates capabilities with gateCapabilities():
// at most "max calls" per run (400 for this preset).
// This code tries 32×32 = 1024 setPixel calls. Past the limit the
// gate throws on the HOST side and the error comes back over RPC.
let ok = 0, denied = 0, reason = '';
for (let i = 0; i < 1024; i++) {
  try {
    await host.setPixel(i % 32, i >> 5, \`hsl(\${(i * 7) % 360} 90% 62%)\`);
    ok++;
  } catch (e) {
    denied++;
    reason ||= e.message;
  }
  if (i % 32 === 31) await new Promise(r => setTimeout(r, 10));
}
console.warn(\`\${denied} calls bounced off the gate\`);
return { ok, denied, reason };`,
  },
];

const STATE_DEFAULTS = { preset: PRESETS[0].id, timeout: PRESETS[0].timeout, max: PRESETS[0].maxCalls, code: '' };

const PALETTE_MODULE = `
export function plasma(x, y, seed) {
  const v = Math.sin(x / 4 + seed * 6) + Math.sin(y / 5 - seed * 3)
          + Math.sin((x + y) / 6) + Math.sin(Math.hypot(x - 16, y - 16) / 3);
  const h = (330 + v * 45 + 360) % 360;
  return \`hsl(\${h.toFixed(0)} 85% \${(52 + v * 7).toFixed(0)}%)\`;
}`;

/** Lets sandbox code write host.log(...) instead of host.call('log', ...). */
const wrapCode = (code: string) =>
  `return (async (host) => {\n${code}\n})(new Proxy(host, { get: (t, k) => (k in t ? t[k] : (...a) => t.call(k, ...a)) }));`;

const GRID = 32;
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const fmtArg = (a: unknown) => {
  if (typeof a === 'string') return JSON.stringify(a.length > 48 ? a.slice(0, 48) + '…' : a);
  if (typeof a === 'number') return Number.isInteger(a) ? String(a) : a.toFixed(4);
  try { return JSON.stringify(a) ?? String(a); } catch { return String(a); }
};

type Kind = 'sys' | 'call' | 'deny' | 'console' | 'kill' | 'result' | 'error';
interface LogRow { t: number; kind: Kind; key: string; text: string; count: number }
type PKind = 'req' | 'res' | 'deny' | 'con';
interface Particle { born: number; kind: PKind }
type WState = 'booting' | 'idle' | 'running' | 'killed' | 'done' | 'error';

const playground: Playground = {
  id: 'andbox',
  title: 'Andbox Cell',
  pkg: '@johnhenry/andbox',
  hue: 330,
  blurb: 'Run code in a Worker with host capabilities over RPC, rate limits and a kill switch.',
  docs: 'https://opensource.johnhenry.me/andbox/',
  mount(host) {
    const root = document.createElement('div');
    root.className = 'pg-andbox';
    root.innerHTML = `
      <div class="panel ab-bar">
        <div class="ab-presets">${PRESETS.map(p => `<button class="ab-preset" data-id="${p.id}" aria-pressed="false">${p.label}</button>`).join('')}</div>
        <div class="ab-controls">
          <button class="btn primary" data-act="run">▶ Run <span class="stat">⌘↵</span></button>
          <button class="btn kill" data-act="kill" disabled>■ Kill</button>
          <label class="field">timeout ms<input type="number" min="100" step="100" data-f="timeout"></label>
          <label class="field">max calls / run<input type="number" min="0" step="50" data-f="max"></label>
          <button class="btn ab-copy-link" type="button">🔗 copy link</button>
        </div>
        <span class="ab-status" data-state="booting">booting</span>
      </div>
      <div class="ab-main">
        <div class="panel">
          <h3 class="ab-h">sandboxed code <span class="stat">runs in a blob: Worker</span></h3>
          <textarea class="code" spellcheck="false" aria-label="sandbox code"></textarea>
        </div>
        <div class="ab-right">
          <div class="panel">
            <h3 class="ab-h">rpc wire <span class="stat" data-o="fps"></span></h3>
            <canvas class="ab-flow"></canvas>
          </div>
          <div class="panel">
            <h3 class="ab-h">host canvas <span class="stat">painted via host.setPixel()</span></h3>
            <div class="ab-paint">
              <canvas class="ab-pixels" width="${GRID}" height="${GRID}"></canvas>
              <div class="ab-nums">
                <span>elapsed</span><b data-o="elapsed">–</b>
                <span>calls ok</span><b class="ok" data-o="ok">0</b>
                <span>denied</span><b class="deny" data-o="deny">0</b>
                <span>console</span><b class="con" data-o="con">0</b>
                <span>kills</span><b class="deny" data-o="kills">0</b>
                <span>workers</span><b data-o="workers">0</b>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="ab-bottom">
        <div class="panel">
          <h3 class="ab-h">event log <span class="stat">consecutive identical calls coalesce ×n</span></h3>
          <div class="ab-log" role="log"></div>
        </div>
        <div class="panel">
          <h3 class="ab-h">result</h3>
          <pre class="code ab-result">–</pre>
        </div>
      </div>
      <div class="panel ab-explain">
        <h3 class="ab-h">what's happening</h3>
        <p><code>createSandbox()</code> builds the worker from a string (<code>makeWorkerSource()</code>) turned into a
        <code>blob:</code> URL and started as a classic <code>new Worker(url)</code>. That means no bundler worker plugin is needed:
        Vite just bundles the library's JS and the worker is minted at runtime. Each Run spins up a fresh sandbox, so rate-limit counters start at zero.</p>
        <p>The host exposes <code>log</code>, <code>random</code>, <code>now</code>, <code>setPixel</code> and <code>clear</code>. They're first wrapped by
        <code>gateCapabilities(caps, { limits: { maxCalls } })</code>, then instrumented so every RPC fires a pulse down the wire (pink = call, cyan = result,
        red = denied by the gate, violet = forwarded <code>console.*</code>). Inside the worker only <code>host.call(name, …args)</code> exists; this planet
        prepends a one-line Proxy so you can write <code>host.setPixel(x, y, c)</code>:</p>
        <pre class="code">${esc(wrapCode('/* your code */'))}</pre>
        <p><code>evaluate(code, { timeoutMs, signal })</code> races the worker. On timeout (or when Kill aborts the signal) andbox calls
        <code>worker.terminate()</code>, the only thing that can stop a <code>while (true)</code>, and boots a replacement worker. Note the fps counter:
        the page never stutters, because the runaway loop is burning a different thread.</p>
      </div>`;
    host.appendChild(root);

    const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
    const ta = $<HTMLTextAreaElement>('textarea');
    const runBtn = $<HTMLButtonElement>('[data-act=run]');
    const killBtn = $<HTMLButtonElement>('[data-act=kill]');
    const timeoutIn = $<HTMLInputElement>('[data-f=timeout]');
    const maxIn = $<HTMLInputElement>('[data-f=max]');
    const copyLinkBtn = $<HTMLButtonElement>('.ab-copy-link');
    const statusEl = $<HTMLElement>('.ab-status');
    const logEl = $<HTMLElement>('.ab-log');
    const resultEl = $<HTMLElement>('.ab-result');
    const flow = $<HTMLCanvasElement>('canvas.ab-flow');
    const px = $<HTMLCanvasElement>('canvas.ab-pixels');
    const pctx = px.getContext('2d')!;
    const out = (k: string) => $<HTMLElement>(`[data-o=${k}]`);

    let alive = true;
    let sandbox: Sandbox | null = null;
    let abort: AbortController | null = null;
    let runId = 0;
    let runStart = 0;
    let runEnd = 0;
    let wstate: WState = 'booting';
    let killFlash = 0;
    let hostFlash = 0, hostFlashDeny = false;
    let lastMsg = 0;
    const counts = { ok: 0, deny: 0, con: 0, kills: 0, workers: 0 };
    let innerGateStats: (() => GateStats) | null = null;

    // ---- log ----------------------------------------------------------
    const rows: LogRow[] = [];
    let logDirty = false;
    const now = () => (runStart ? performance.now() - runStart : 0);
    function log(kind: Kind, text: string, key = kind + ':' + text) {
      const last = rows[rows.length - 1];
      if (last && last.key === key && (kind === 'call' || kind === 'deny')) {
        last.count++; last.text = text; last.t = now();
      } else {
        rows.push({ t: now(), kind, key, text, count: 1 });
        if (rows.length > 300) rows.splice(0, rows.length - 300);
      }
      logDirty = true;
    }
    function renderLog() {
      if (!logDirty) return;
      logDirty = false;
      const stick = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
      logEl.innerHTML = rows.map(r => `<div class="row ${r.kind}"><span class="t">+${r.t.toFixed(1)}ms</span><span class="k">${r.kind}</span><span class="m">${esc(r.text)}${r.count > 1 ? `<span class="n">×${r.count}</span>` : ''}</span></div>`).join('');
      if (stick) logEl.scrollTop = logEl.scrollHeight;
    }

    function setState(s: WState, label?: string) {
      wstate = s;
      statusEl.dataset.state = s;
      statusEl.textContent = label ?? s;
      const busy = s === 'running' || s === 'booting';
      killBtn.disabled = !busy;
    }

    // ---- particles on the wire ----------------------------------------
    const particles: Particle[] = [];
    const spawn = (kind: PKind) => { if (particles.length < 220) particles.push({ born: performance.now(), kind }); };

    // ---- pixel canvas -------------------------------------------------
    function clearPixels(color = '#060a16') { pctx.fillStyle = color; pctx.fillRect(0, 0, GRID, GRID); }
    clearPixels();

    // ---- capabilities (host side) -------------------------------------
    const raw: Record<string, Cap> = {
      log: (...args: unknown[]) => { log('console', args.map(a => typeof a === 'string' ? a : fmtArg(a)).join(' '), 'hostlog' + Math.random()); },
      random: () => Math.random(),
      now: () => performance.now(),
      setPixel: (x: unknown, y: unknown, color: unknown) => {
        const xi = Number(x) | 0, yi = Number(y) | 0;
        if (xi < 0 || yi < 0 || xi >= GRID || yi >= GRID) throw new Error(`setPixel out of bounds (${x}, ${y})`);
        if (typeof color !== 'string' || color.length > 64) throw new Error('setPixel color must be a CSS color string');
        pctx.fillStyle = color;
        pctx.fillRect(xi, yi, 1, 1);
        return true;
      },
      clear: (color?: unknown) => { clearPixels(typeof color === 'string' ? color : undefined); return true; },
    };

    function instrument(gated: Record<string, Cap>, myRun: number): Record<string, Cap> {
      const outCaps: Record<string, Cap> = {};
      for (const name of Object.keys(raw)) {
        outCaps[name] = async (...args: unknown[]) => {
          const live = myRun === runId;
          if (live) { spawn('req'); lastMsg = performance.now(); }
          const sig = `${name}(${args.map(fmtArg).join(', ')})`;
          try {
            const v = await gated[name](...args);
            if (live) {
              counts.ok++; spawn('res'); hostFlash = performance.now(); hostFlashDeny = false;
              if (name !== 'log') log('call', v === undefined || v === true ? sig : `${sig} → ${fmtArg(v)}`, 'call:' + name);
            }
            return v;
          } catch (e) {
            if (live) {
              counts.deny++; spawn('deny'); hostFlash = performance.now(); hostFlashDeny = true;
              log('deny', `${sig} ✕ ${(e as Error).message}`, 'deny:' + name + (e as Error).message);
            }
            throw e;
          }
        };
      }
      return outCaps;
    }

    // ---- run / kill ---------------------------------------------------
    async function teardown() {
      abort?.abort();
      abort = null;
      const sb = sandbox;
      sandbox = null;
      if (sb) { try { await sb.dispose(); } catch { /* already gone */ } }
    }

    async function run() {
      const myRun = ++runId;
      await teardown();
      if (!alive || myRun !== runId) return;

      rows.length = 0; logDirty = true;
      counts.ok = counts.deny = counts.con = 0;
      particles.length = 0;
      clearPixels();
      resultEl.textContent = '…';
      runStart = performance.now(); runEnd = 0;
      const timeoutMs = Math.max(100, Number(timeoutIn.value) || 3000);
      const maxCalls = Math.max(0, Number(maxIn.value) | 0);

      setState('booting', 'spawning worker');
      const g = gate(raw, { limits: { maxCalls, maxConcurrent: 0 } });
      innerGateStats = g.stats;
      let sb: Sandbox;
      try {
        sb = await mkSandbox({
          capabilities: instrument(g.gated, myRun),
          defaultTimeoutMs: timeoutMs,
          policy: { limits: { maxConcurrent: 0 } }, // limits live in our own gate so we can see denials
          onConsole: (level, ...args) => {
            if (myRun !== runId) return;
            counts.con++; spawn('con'); lastMsg = performance.now();
            log('console', `console.${level}: ${args.join(' ')}`, 'con' + Math.random());
          },
        });
      } catch (e) {
        setState('error', 'spawn failed');
        resultEl.textContent = String((e as Error)?.stack ?? e);
        return;
      }
      if (!alive || myRun !== runId) { sb.dispose(); return; }
      sandbox = sb;
      counts.workers++;
      log('sys', `createSandbox() → blob: Worker up · maxCalls=${maxCalls || '∞'} · timeout=${timeoutMs}ms`);
      await sb.defineModule('palette', PALETTE_MODULE);
      log('sys', `defineModule('palette') · evaluate(${ta.value.length} chars)`);

      abort = new AbortController();
      setState('running');
      lastMsg = performance.now();
      try {
        const value = await sb.evaluate(wrapCode(ta.value), { timeoutMs, signal: abort.signal });
        if (myRun !== runId) return;
        runEnd = performance.now();
        log('result', `returned ${fmtArg(value)}`);
        setState('done', `done · ${(runEnd - runStart).toFixed(0)}ms`);
        resultEl.textContent = JSON.stringify(value, null, 2) ?? 'undefined';
      } catch (e) {
        if (myRun !== runId) return;
        runEnd = performance.now();
        const err = e as Error;
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
          counts.kills++; counts.workers++;
          killFlash = performance.now();
          const why = err.name === 'TimeoutError' ? `timeout after ${timeoutMs}ms` : 'Kill pressed (AbortSignal)';
          log('kill', `${why} → worker.terminate(); fresh worker booted`);
          setState('killed', err.name === 'TimeoutError' ? 'timed out · killed' : 'killed');
        } else {
          log('error', `${err.name}: ${err.message}`);
          setState('error', 'threw');
        }
        resultEl.textContent = `${err.name}: ${err.message}`;
      }
      const gs = innerGateStats?.();
      if (gs) {
        const txt = resultEl.textContent ?? '';
        resultEl.textContent = `${txt}\n\n// gateCapabilities().stats()\n${JSON.stringify({ totalCalls: gs.totalCalls, totalArgBytes: gs.totalArgBytes, perCapability: gs.perCapability }, null, 2)}`;
      }
      renderLog();
    }

    function kill() {
      if (abort) abort.abort();
    }

    // ---- flow canvas render loop --------------------------------------
    const fctx = flow.getContext('2d')!;
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = flow.clientWidth; H = flow.clientHeight;
      flow.width = Math.round(W * dpr); flow.height = Math.round(H * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(flow);
    resize();

    const COL: Record<PKind, string> = { req: '#ff5fb0', res: '#5fe3ff', deny: '#ff4040', con: '#c9a0ff' };
    const DUR = 520;
    let frames = 0, fpsT = performance.now(), fps = 0;
    let raf = 0;

    function rr(x: number, y: number, w: number, h: number, r: number) {
      fctx.beginPath();
      fctx.moveTo(x + r, y); fctx.arcTo(x + w, y, x + w, y + h, r); fctx.arcTo(x + w, y + h, x, y + h, r);
      fctx.arcTo(x, y + h, x, y, r); fctx.arcTo(x, y, x + w, y, r); fctx.closePath();
    }

    function draw(t: number) {
      raf = requestAnimationFrame(draw);
      frames++;
      if (t - fpsT >= 500) { fps = frames * 1000 / (t - fpsT); frames = 0; fpsT = t; out('fps').textContent = `main thread ${fps.toFixed(0)} fps`; }

      const c = fctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      const bw = Math.min(170, W * 0.3), bh = H - 36, by = 18;
      const wx = 12, hx = W - 12 - bw;
      const x0 = wx + bw, x1 = hx;
      const yReq = H / 2 - 16, yRes = H / 2 + 16;

      // wires
      c.setLineDash([4, 5]); c.lineWidth = 1;
      c.strokeStyle = '#ffffff22';
      c.beginPath(); c.moveTo(x0, yReq); c.lineTo(x1, yReq); c.moveTo(x0, yRes); c.lineTo(x1, yRes); c.stroke();
      c.setLineDash([]);
      c.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      c.fillStyle = '#ffffff55'; c.textAlign = 'center';
      if (x1 - x0 > 120) {
        c.fillText('capabilityCall →', (x0 + x1) / 2, yReq - 8);
        c.fillText('← capabilityResult', (x0 + x1) / 2, yRes + 16);
      }

      // particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const k = (t - p.born) / DUR;
        if (k >= 1) { particles.splice(i, 1); continue; }
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const toHost = p.kind === 'req' || p.kind === 'con';
        const x = toHost ? x0 + (x1 - x0) * e : x1 - (x1 - x0) * e;
        let y = toHost ? yReq : yRes;
        if (p.kind === 'deny') y = yRes + Math.sin(k * Math.PI) * 10;
        const col = COL[p.kind];
        c.shadowColor = col; c.shadowBlur = 12;
        c.fillStyle = col;
        c.beginPath(); c.arc(x, y, p.kind === 'con' ? 3 : 4, 0, Math.PI * 2); c.fill();
        // tail
        c.shadowBlur = 0;
        c.globalAlpha = 0.35;
        c.fillRect(toHost ? x - 18 : x, y - 1, 18, 2);
        c.globalAlpha = 1;
      }
      c.shadowBlur = 0;

      // worker box
      const killK = Math.max(0, 1 - (t - killFlash) / 1200);
      const stateCol: Record<WState, string> = { booting: '#5fe3ff', idle: '#ffffff33', running: '#ff5fb0', killed: '#ff4040', done: '#7dffb0', error: '#ff4040' };
      c.fillStyle = '#0b1122';
      rr(wx, by, bw, bh, 10); c.fill();
      c.lineWidth = wstate === 'running' ? 2 : 1.5;
      c.strokeStyle = stateCol[wstate];
      if (wstate === 'running') { c.shadowColor = stateCol.running; c.shadowBlur = 10 + 6 * Math.sin(t / 180); }
      c.stroke(); c.shadowBlur = 0;
      c.textAlign = 'left';
      c.fillStyle = '#fff'; c.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
      c.fillText('WORKER', wx + 12, by + 20);
      c.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      c.fillStyle = '#ffffff77';
      c.fillText('new Worker(blob:)', wx + 12, by + 35);
      const silent = wstate === 'running' ? t - lastMsg : 0;
      c.fillStyle = stateCol[wstate];
      const stLabel = wstate === 'running' ? (silent > 400 ? `busy · silent ${(silent / 1000).toFixed(1)}s` : 'running') : wstate;
      c.fillText(stLabel, wx + 12, by + bh - 14);
      if (wstate === 'running') {
        // spinner
        const cx = wx + bw - 22, cy = by + 20;
        c.strokeStyle = silent > 400 ? '#ffb13b' : '#ff5fb0'; c.lineWidth = 2;
        c.beginPath(); c.arc(cx, cy, 7, t / 120, t / 120 + Math.PI * 1.3); c.stroke();
      }
      if (killK > 0) {
        c.globalAlpha = killK;
        c.strokeStyle = '#ff4040'; c.lineWidth = 3;
        const m = 26, cx = wx + bw / 2, cy = by + bh / 2 + 4;
        c.beginPath(); c.moveTo(cx - m / 2, cy - m / 2); c.lineTo(cx + m / 2, cy + m / 2); c.moveTo(cx + m / 2, cy - m / 2); c.lineTo(cx - m / 2, cy + m / 2); c.stroke();
        c.fillStyle = '#ff4040'; c.textAlign = 'center'; c.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        c.fillText('terminate()', cx, cy + 30);
        c.globalAlpha = 1; c.textAlign = 'left';
      }

      // host box
      const hk = Math.max(0, 1 - (t - hostFlash) / 220);
      c.fillStyle = '#0b1122';
      rr(hx, by, bw, bh, 10); c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = hk > 0 ? (hostFlashDeny ? `rgba(255,64,64,${0.3 + 0.7 * hk})` : `rgba(95,227,255,${0.3 + 0.7 * hk})`) : '#ffffff33';
      c.stroke();
      c.fillStyle = '#fff'; c.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
      c.fillText('HOST', hx + 12, by + 20);
      c.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      c.fillStyle = '#ffffff77';
      c.fillText('main thread', hx + 12, by + 35);
      const caps = Object.keys(raw);
      caps.forEach((n, i) => { c.fillStyle = '#ff8cc6aa'; c.fillText(`· ${n}()`, hx + 12, by + 54 + i * 14); });
      c.fillStyle = fps > 50 ? '#7dffb0' : '#ffb13b';
      c.fillText(`${fps.toFixed(0)} fps`, hx + 12, by + bh - 14);

      // numbers
      out('ok').textContent = String(counts.ok);
      out('deny').textContent = String(counts.deny);
      out('con').textContent = String(counts.con);
      out('kills').textContent = String(counts.kills);
      out('workers').textContent = String(counts.workers);
      out('elapsed').textContent = runStart ? `${((runEnd || t) - runStart).toFixed(0)}ms` : '–';
      renderLog();
    }
    raf = requestAnimationFrame(draw);

    // ---- wiring -------------------------------------------------------
    function loadPreset(p: Preset) {
      ta.value = p.code;
      timeoutIn.value = String(p.timeout);
      maxIn.value = String(p.maxCalls);
      root.querySelectorAll<HTMLButtonElement>('.ab-preset').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === p.id)));
    }

    // ---- deep link: preset id, timeout, rate limit, and small code edits ----
    const state = readState(STATE_DEFAULTS);
    let currentPresetId = state.preset;
    const syncUrl = () => {
      const base = PRESETS.find(p => p.id === currentPresetId)?.code ?? '';
      const edited = ta.value !== base;
      state.preset = currentPresetId;
      state.timeout = Math.max(100, Number(timeoutIn.value) || STATE_DEFAULTS.timeout);
      state.max = Math.max(0, Number(maxIn.value) | 0);
      state.code = edited && ta.value.length <= CODE_CAP ? ta.value : '';
      writeState(state, STATE_DEFAULTS);
    };

    const onPreset = (e: Event) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ab-preset');
      if (!b) return;
      const p = PRESETS.find(x => x.id === b.dataset.id);
      if (p) { currentPresetId = p.id; loadPreset(p); syncUrl(); run(); }
    };
    const onRun = () => { run(); };
    const onKill = () => kill();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.setRangeText('  ', s, en, 'end');
      }
    };
    const onEdit = () => { root.querySelectorAll('.ab-preset').forEach(b => b.setAttribute('aria-pressed', 'false')); syncUrl(); };
    const onTimeoutChange = () => syncUrl();
    const onMaxChange = () => syncUrl();
    const onCopyLink = async () => {
      syncUrl();
      await new Promise((r) => setTimeout(r, 200)); // writeState is debounced
      await copyLink();
      copyLinkBtn.textContent = '✓ copied';
      setTimeout(() => { if (alive) copyLinkBtn.textContent = '🔗 copy link'; }, 1400);
    };
    const presetsEl = $<HTMLElement>('.ab-presets');
    presetsEl.addEventListener('click', onPreset);
    runBtn.addEventListener('click', onRun);
    killBtn.addEventListener('click', onKill);
    ta.addEventListener('keydown', onKey);
    ta.addEventListener('input', onEdit);
    timeoutIn.addEventListener('input', onTimeoutChange);
    maxIn.addEventListener('input', onMaxChange);
    copyLinkBtn.addEventListener('click', onCopyLink);

    // default state: the saved (or linked) preset, with any overrides from the URL
    const startPreset = PRESETS.find(p => p.id === state.preset) ?? PRESETS[0];
    currentPresetId = startPreset.id;
    loadPreset(startPreset);
    timeoutIn.value = String(state.timeout);
    maxIn.value = String(state.max);
    if (state.code) {
      ta.value = state.code;
      root.querySelectorAll<HTMLButtonElement>('.ab-preset').forEach(b => b.setAttribute('aria-pressed', 'false'));
    }
    setState('idle');
    run().catch(e => { resultEl.textContent = String(e); });

    return () => {
      alive = false;
      runId++;
      cancelAnimationFrame(raf);
      ro.disconnect();
      presetsEl.removeEventListener('click', onPreset);
      runBtn.removeEventListener('click', onRun);
      killBtn.removeEventListener('click', onKill);
      ta.removeEventListener('keydown', onKey);
      ta.removeEventListener('input', onEdit);
      timeoutIn.removeEventListener('input', onTimeoutChange);
      maxIn.removeEventListener('input', onMaxChange);
      copyLinkBtn.removeEventListener('click', onCopyLink);
      abort?.abort();
      abort = null;
      const sb = sandbox;
      sandbox = null;
      sb?.dispose().catch(() => {}); // terminates the worker + revokes its blob URL
      root.remove();
    };
  },
};
export default playground;
