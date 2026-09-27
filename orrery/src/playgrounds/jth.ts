import type { Playground } from '../registry';
import { transform, lex, parse, run } from '@johnhenry/jth-compiler';
import { Stack, processN, registry } from '@johnhenry/jth-runtime';
// Importing the standard library registers ~140 operators (+, dup, map, if, times…)
// into the global jth-runtime registry. Compiled programs resolve against it.
import '@johnhenry/jth-stdlib';
import { createSandbox as mkSandbox } from '@johnhenry/andbox';
import type { Sandbox } from '@johnhenry/andbox';
import { readState, writeState, copyLink } from '../state';
import './jth.css';

/* -------------------------------------------------------------- sandbox run */
// The "Run" pipeline used to execute compiled jth with `run()` from
// @johnhenry/jth-compiler directly on the main thread. That's fine for most
// programs, but jth's `times`/`while`/etc. loop synchronously in plain JS
// (see jth-stdlib's `timesOp`) with no `await` between iterations, so
// something like `1000000000 times` never yields — a `timeoutMs` race against
// it can't preempt it (the setTimeout callback can't run until the loop
// finishes), and the tab freezes solid. Moving execution into an
// @johnhenry/andbox Worker fixes this for real: `evaluate()`'s timeout (or a
// Kill click) calls `worker.terminate()`, the one thing that *can* stop a
// runaway synchronous loop, and the main thread — this UI, its rAF-free but
// still-live listeners — never blocks.
// Pinned to the installed @johnhenry/jth-runtime / jth-stdlib version. The
// sandbox worker can't resolve bare specifiers like "@johnhenry/jth-runtime"
// on its own (Workers don't get the page's import map, and andbox's own
// importMap option is only consulted for sandboxImport()'s *own* argument,
// not for import statements nested inside a dynamically-imported module) —
// so the compiled program below is rewritten to pull the runtime from its
// real, published CDN mirror instead. Same version, same package, just
// reached by an absolute URL the Worker's native `import()` can actually
// resolve without help.
const JTH_RUNTIME_VERSION = '0.0.0';
const RUNTIME_IMPORT_MAP = {
  '@johnhenry/jth-runtime': `https://esm.sh/@johnhenry/jth-runtime@${JTH_RUNTIME_VERSION}`,
  '@johnhenry/jth-stdlib': `https://esm.sh/@johnhenry/jth-stdlib@${JTH_RUNTIME_VERSION}`,
};

/**
 * Wrap the compiler's no-preamble JS body (`transform(src, { preamble: false })`)
 * so it runs standalone inside the sandbox: pull `Stack`/`processN`/`registry`
 * from the CDN-mirrored runtime via `sandboxImport()`, then run the body
 * exactly as jth-compiler's own preamble would've wired it up.
 *
 * One subtlety: jth-stdlib's own operators (e.g. `peek` → `console.log(...)`)
 * close over *their defining module's* global `console`, not any local
 * variable in scope where we happen to call them from. andbox's Worker only
 * forwards console output written through the `console` parameter it hands
 * to `evaluate()`'s own function scope (see andbox's worker-source.mjs) — so
 * without this, every `peek` inside the compiled program would print to the
 * (invisible, per-Worker) real console instead of reaching `onConsole`. We
 * fix that by reassigning the Worker's *global* `console` binding itself for
 * the duration of the run: since `console` in stdlib's operators resolves via
 * the scope chain to `globalThis.console` at call time (not at module-load
 * time), swapping that binding redirects them too.
 */
function sandboxProgram(bodyJs: string): string {
  const indented = bodyJs.split('\n').map((l) => (l ? `    ${l}` : l)).join('\n');
  return `  const __prevConsole = globalThis.console;
  globalThis.console = console;
  try {
    const { Stack, processN, registry } = await sandboxImport('@johnhenry/jth-runtime');
    await sandboxImport('@johnhenry/jth-stdlib');
    const stack = new Stack();
${indented}
    return stack.toArray().map((v) => {
      if (typeof v === 'function') return '#[ block ]';
      try { return JSON.parse(JSON.stringify(v)); } catch { return String(v); }
    });
  } finally {
    globalThis.console = __prevConsole;
  }`;
}

/* ------------------------------------------------------------------ presets */

interface Preset { id: string; label: string; src: string; note: string }

const PRESETS: Preset[] = [
  {
    id: 'hello',
    label: 'hello world',
    note: 'Literals are pushed; operators pop their inputs and push results. <code>peek</code> prints the top of the stack.',
    src: `// literals push themselves; operators pop & push
"Hello, " "world!" strcat peek;

// postfix arithmetic: (6 + 1) * 6
6 1 + 6 * peek;`,
  },
  {
    id: 'fib',
    label: 'fibonacci',
    note: 'A block <code>#[ … ]</code> is a quoted program. <code>times</code> runs it N times against the same stack: swap, print, over, add.',
    src: `// keep two numbers on the stack: a b
// each turn: print a, then replace with b (a+b)
0 1 #[ swap peek over + ] 12 times;`,
  },
  {
    id: 'fizz',
    label: 'FizzBuzz',
    note: '<code>if</code> / <code>elseif</code> / <code>else</code> each pop a condition and a block. <code>over</code> copies the counter up so each test leaves it intact.',
    src: `1
#[
  #[ "FizzBuzz" peek drop ] over 15 % 0 = if
  #[ "Fizz" peek drop ]     over 3 % 0 =  elseif
  #[ "Buzz" peek drop ]     over 5 % 0 =  elseif
  #[ peek ] else
  ++
] 15 times;`,
  },
  {
    id: 'str',
    label: 'strings',
    note: 'String words transform the top of the stack. <code>((…))</code> embeds raw JavaScript: here a function that receives the stack and reverses a string.',
    src: `"  jth compiles to javascript  " trim upper peek;

"stack" "-machine" strcat dup len peek drop peek;

// palindrome check with an inline-JS word
"racecar" dup ((s) => s.push([...s.pop()].reverse().join(""))) = peek;

"Hello" "World" strseq peek;`,
  },
  {
    id: 'word',
    label: 'user words',
    note: '<code>#[ … ] :name;</code> defines a new word in the registry. Step into <code>hypot</code> to watch it call <code>square</code> twice.',
    src: `// define new words from blocks
#[ dup * ] :square;
#[ square swap square + sqrt ] :hypot;

3 4 hypot peek;

// words compose with higher-order ops
[1 2 3 4 5] #[ square ] map peek;
[1 2 3 4 5] 0 #[ + ] reduce peek;`,
  },
  {
    id: 'runaway',
    label: 'runaway loop',
    note: '<code>times</code> loops in plain synchronous JS (see jth-stdlib\'s <code>timesOp</code>): no <code>await</code> ever runs between iterations, so a timeout race on the main thread can never preempt it. Sandboxed, the timeout (or Kill) <code>terminate()</code>s the worker instead — hard, immediate, and the tab never stops responding. Flip “run on main thread (legacy)” on to watch it actually freeze.',
    src: `// 1,000,000,000 increments with no yield point in between.
// In the andbox worker: killed by the timeout slider below (or Kill).
// On the main thread (legacy toggle): this really does freeze the tab —
// that's the bug this planet's andbox integration fixes.
0 #[ ++ ] 1000000000 times;
peek;`,
  },
];

/* ---------------------------------------------------------------- helpers */

type Node = { type: string; line?: number; column?: number; [k: string]: any };

interface Cell { text: string; kind: string }
interface Frame {
  label: string;
  line: number;
  column: number;
  depth: number;
  nested: boolean;
  stack: Cell[];
  out: string[];
  note: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const isThenable = (v: unknown): v is Promise<unknown> => !!v && typeof (v as any).then === 'function';

function fmt(v: unknown, deep = 0): Cell {
  if (v === null) return { text: 'null', kind: 'nil' };
  if (v === undefined) return { text: 'undefined', kind: 'nil' };
  switch (typeof v) {
    case 'string': return { text: JSON.stringify(v.length > 40 ? v.slice(0, 39) + '…' : v), kind: 'str' };
    case 'number': return { text: String(Math.round(v * 1e6) / 1e6), kind: 'num' };
    case 'bigint': return { text: `${v}n`, kind: 'num' };
    case 'boolean': return { text: String(v), kind: 'bool' };
    case 'function': {
      const name = (v as any)._name;
      return { text: name ? name : '#[ block ]', kind: 'fn' };
    }
  }
  if (Array.isArray(v)) {
    if (deep > 1) return { text: '[…]', kind: 'arr' };
    const inner = v.slice(0, 8).map((x) => fmt(x, deep + 1).text).join(' ');
    return { text: `[${inner}${v.length > 8 ? ' …' : ''}]`, kind: 'arr' };
  }
  if (v instanceof Error) return { text: `Error: ${v.message}`, kind: 'err' };
  try {
    const j = JSON.stringify(v);
    return { text: j.length > 40 ? j.slice(0, 39) + '…' : j, kind: 'obj' };
  } catch {
    return { text: Object.prototype.toString.call(v), kind: 'obj' };
  }
}

function nodeLabel(n: Node): string {
  switch (n.type) {
    case 'NumberLiteral': return String(n.value);
    case 'StringLiteral': return JSON.stringify(n.value);
    case 'BooleanLiteral': return String(n.value);
    case 'NullLiteral': return 'null';
    case 'UndefinedLiteral': return 'undefined';
    case 'OperatorCall': return n.args?.length ? `${n.name}(…)` : n.name;
    case 'BlockLiteral': return '#[ … ]';
    case 'ArrayLiteral': return '[ … ]';
    case 'JSObjectLiteral': return '{ … }';
    case 'InlineJSExpression': return '((js))';
    case 'Definition': return `:${n.name}`;
    case 'ValueDefinition': return `::${n.name}`;
    default: return n.type;
  }
}

/** Highlight compiled JS (strings, keywords, numbers, registry lookups). */
function highlightJS(js: string, activeLine: number | null): string {
  const lines = js.split('\n');
  return lines
    .map((raw) => {
      const toks = raw.split(/("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/);
      const html = toks
        .map((t, i) => {
          if (i % 2 === 1) return `<span class="s">${esc(t)}</span>`;
          return esc(t)
            .replace(/\b(import|from|const|await|return|if|throw|try|catch|typeof|new|async)\b/g, '<span class="k">$1</span>')
            .replace(/\b(processN|registry|stack|Stack)\b/g, '<span class="r">$1</span>')
            .replace(/(?<![\w.])(-?\d+(?:\.\d+)?)(?![\w])/g, '<span class="n">$1</span>');
        })
        .join('');
      const m = activeLine != null && new RegExp(`e\\.line = ${activeLine};`).test(raw);
      return `<span class="ln${m ? ' hot' : ''}">${html || ' '}</span>`;
    })
    .join('');
}

/* ------------------------------------------------------------------ tracer */

/**
 * The stepper: walk the jth AST and feed each item through the REAL runtime
 * (`processN` + operators from `registry`), snapshotting the stack after every
 * item. Blocks and user-defined words are re-created as traced functions so
 * stdlib control flow (if/times/map/while…) calls back into us and we can
 * record every nested step too.
 */
const MAX_FRAMES = 2500;

/**
 * Thrown by `record()` once the frame cap is hit, to unwind out of whatever
 * real stdlib loop is driving the trace (e.g. `timesOp`'s own synchronous
 * `for` loop over a huge count). Merely *not recording* past the cap isn't
 * enough on its own: `record()` no-oping still leaves the underlying
 * operator's loop running for its full count, calling back into our traced
 * block every iteration — for something like `1000000000 times` that's still
 * ~1e9 synchronous calls on the main thread. Throwing (a real JS exception,
 * caught below) breaks out of that loop immediately instead, which is the
 * only way to make MAX_FRAMES an actual execution bound rather than just a
 * memory bound.
 */
class TraceCapped extends Error {}

async function trace(ast: { body: Node[] }): Promise<{ frames: Frame[]; truncated: boolean; error: string | null }> {
  const main = new Stack();
  const frames: Frame[] = [];
  let truncated = false;
  let pendingOut: string[] = [];
  const vars: Record<string, unknown> = {};

  const snap = (s: Stack) => s.toArray().map((v) => fmt(v));

  const record = (s: Stack, n: Node, depth: number, before: Cell[]) => {
    if (frames.length >= MAX_FRAMES) { truncated = true; throw new TraceCapped(); }
    const after = snap(s);
    let k = 0;
    while (k < before.length && k < after.length && before[k].text === after[k].text && before[k].kind === after[k].kind) k++;
    const popped = before.length - k;
    const pushed = after.length - k;
    let note: string;
    if (n.type === 'BlockLiteral') note = 'push a quoted block (not run yet)';
    else if (n.type === 'Definition') note = popped ? `pop top → register word “${n.name}”` : `define word “${n.name}” from the block`;
    else if (n.type === 'OperatorCall') note = popped === 0 && pushed === 0 ? `${n.name}: stack unchanged` : `${n.name}: pop ${popped}, push ${pushed}`;
    else if (n.type === 'InlineJSExpression') note = `inline JS: pop ${popped}, push ${pushed}`;
    else note = `push ${after[after.length - 1]?.text ?? ''}`;
    frames.push({
      label: nodeLabel(n), line: n.line ?? 0, column: n.column ?? 0, depth, nested: s !== main,
      stack: after, out: pendingOut, note,
    });
    pendingOut = [];
  };

  // Build a runtime item for one AST node (mirrors jth-compiler's codegen).
  const build = (n: Node, depth: number): unknown => {
    switch (n.type) {
      case 'NumberLiteral': case 'StringLiteral': case 'BooleanLiteral':
      case 'NullLiteral': case 'UndefinedLiteral':
        return n.value;
      case 'OperatorCall': {
        const fn = registry.resolve(n.name);
        if (!n.args?.length) return fn;
        const args = n.args as Node[];
        return (s: Stack) => { for (const a of args) s.push(build(a, depth)); return fn(s); };
      }
      case 'BlockLiteral': {
        const block = makeBlock(n.body as Node[], depth + 1);
        return (s: Stack) => { s.push(block); };
      }
      case 'ArrayLiteral':
        return (n.elements as Node[]).map((e) => build(e, depth));
      case 'JSObjectLiteral': {
        const props = n.properties as any[];
        const o: Record<string, unknown> = {};
        if (props.length && props[0].key !== undefined) {
          for (const p of props) o[typeof p.key === 'string' ? p.key : String(build(p.key, depth))] = build(p.value, depth);
          return o;
        }
        if (props.length % 2 === 0) {
          for (let i = 0; i < props.length; i += 2) o[String(build(props[i], depth))] = build(props[i + 1], depth);
          return o;
        }
        return props.map((p) => build(p, depth));
      }
      case 'InlineJSExpression':
        // eslint-disable-next-line no-new-func
        return new Function('stack', 'processN', 'registry', ...Object.keys(vars), `return (${n.code});`)(
          main, processN, registry, ...Object.values(vars));
      case 'Definition':
        return (s: Stack) => { registry.set(n.name, s.pop() as any); };
      case 'ValueDefinition':
        return (s: Stack) => { vars[n.name] = s.pop(); };
      default:
        throw new Error(`Stepper cannot handle ${n.type}`);
    }
  };

  const stepOne = (s: Stack, n: Node, depth: number): void | Promise<void> => {
    const before = snap(s);
    const r = processN(s, [build(n, depth)]);
    if (isThenable(r)) return r.then(() => record(s, n, depth, before));
    record(s, n, depth, before);
  };

  const execSeq = (s: Stack, nodes: Node[], depth: number, i = 0): void | Promise<void> => {
    for (; i < nodes.length; i++) {
      const r = stepOne(s, nodes[i], depth);
      if (isThenable(r)) { const next = i + 1; return r.then(() => execSeq(s, nodes, depth, next)); }
    }
  };

  function makeBlock(body: Node[], depth: number) {
    return (s: Stack) => execSeq(s, body, depth);
  }

  const origLog = console.log;
  console.log = (...args: unknown[]) => { pendingOut.push(args.map(String).join(' ')); };
  let error: string | null = null;
  try {
    for (const stmt of ast.body) {
      const exprs = (stmt.expressions ?? []) as Node[];
      if (!exprs.length) continue;
      const last = exprs[exprs.length - 1];
      if (exprs.length === 1 && (last.type === 'Import' || last.type === 'Export')) continue;
      if (last.type === 'Definition' || last.type === 'ValueDefinition') {
        const body = exprs.slice(0, -1);
        if (last.type === 'Definition' && body.length === 1 && body[0].type === 'BlockLiteral') {
          const before = snap(main);
          registry.set(last.name, makeBlock(body[0].body as Node[], 1) as any);
          record(main, { ...last, type: 'Definition' }, 0, before);
          continue;
        }
        await execSeq(main, body, 0);
        await stepOne(main, last, 0);
        continue;
      }
      await execSeq(main, exprs, 0);
    }
  } catch (e: any) {
    if (!(e instanceof TraceCapped)) {
      error = `${e?.name ?? 'Error'}${e?.line != null ? ` at ${e.line}:${e.column ?? 0}` : ''}: ${e?.message ?? e}`;
    }
  } finally {
    console.log = origLog;
  }
  if (pendingOut.length && frames.length) frames[frames.length - 1].out.push(...pendingOut);
  return { frames, truncated, error };
}

/* ------------------------------------------------------------------ mount */

const playground: Playground = {
  id: 'jth',
  title: 'jth Stack Machine',
  pkg: '@johnhenry/jth-compiler',
  hue: 0,
  blurb: 'A stack language that compiles to JavaScript. Write it, compile it, run it, live.',
  docs: 'https://opensource.johnhenry.me/jth/',
  mount(host) {
    const root = document.createElement('div');
    root.className = 'pg-jth';
    root.innerHTML = `
      <div class="bar">
        <div class="presets"></div>
        <div class="stats">
          <span class="stat">tokens <b data-s="tokens">0</b></span>
          <span class="stat">statements <b data-s="stmts">0</b></span>
          <span class="stat">compile <b data-s="ms">0</b>ms</span>
          <span class="stat">operators <b data-s="ops">0</b></span>
        </div>
      </div>
      <div class="runbar">
        <label class="legacy"><input type="checkbox" class="legacy-input"> run on main thread <span class="hint">(legacy — can freeze the tab)</span></label>
        <label class="timeout-field">sandbox timeout
          <input type="range" class="timeout-input" min="200" max="8000" step="100" value="3000">
          <b data-s="timeoutms">3000</b>ms
        </label>
        <button class="btn kill" data-a="kill" disabled title="Abort the current sandbox run">■ Kill</button>
        <button class="btn copy-link" data-a="copylink" title="Copy a link to this program">copy link</button>
      </div>
      <div class="cols">
        <section class="col src">
          <header><span>jth source</span><span class="hint">edits recompile live</span></header>
          <div class="editor">
            <pre class="gutter" aria-hidden="true"></pre>
            <textarea class="code" spellcheck="false" wrap="off" autocomplete="off" autocapitalize="off"></textarea>
          </div>
          <div class="errbar" hidden></div>
          <p class="note"></p>
        </section>
        <section class="col js">
          <header><span>compiled JavaScript</span><span class="badge" hidden>stale</span></header>
          <pre class="code out-js"></pre>
        </section>
        <section class="col run">
          <header><span>program output</span><span class="hint" data-s="runms"></span></header>
          <pre class="code console"></pre>
          <header class="sm"><span>stack machine</span><span class="hint mode">runtime-traced</span></header>
          <div class="machine">
            <div class="tape"></div>
            <div class="stage">
              <div class="stackcol"><div class="floor">stack bottom</div></div>
              <div class="side">
                <div class="now"><span class="tok"></span><span class="pos"></span></div>
                <div class="what"></div>
                <div class="stepout"></div>
              </div>
            </div>
            <div class="controls">
              <button class="btn" data-a="reset" title="Back to start">⏮</button>
              <button class="btn" data-a="back" title="Step back">◀</button>
              <button class="btn primary" data-a="play" title="Play / pause">▶</button>
              <button class="btn" data-a="fwd" title="Step forward">▶|</button>
              <label class="speed">speed <input type="range" min="40" max="900" step="10" value="320"></label>
              <span class="stat">step <b data-s="step">0</b>/<b data-s="total">0</b></span>
            </div>
          </div>
        </section>
      </div>
      <details class="panel explain" open>
        <summary>What's happening</summary>
        <ol>
          <li><b>Lex → parse → generate.</b> Every keystroke (debounced) runs <code>transform(source, { preamble: true })</code> from <code>@johnhenry/jth-compiler</code>. The middle column is its real output: each statement becomes one <code>processN(stack, [...])</code> call, operators are looked up with <code>registry.resolve()</code>, blocks become arrow functions.</li>
          <li><b>Run.</b> By default the compiler's no-preamble output (<code>transform(source, { preamble: false })</code>) runs inside an <code>@johnhenry/andbox</code> sandbox — a real Worker, not the main thread. It <code>sandboxImport()</code>s <code>@johnhenry/jth-runtime</code> / <code>@johnhenry/jth-stdlib</code> from their CDN mirror (a Worker can't resolve bare package specifiers on its own), and <code>evaluate()</code>'s timeout — or the Kill button — <code>worker.terminate()</code>s it, which is the only thing that can stop a synchronous loop like <code>times</code> mid-flight. Toggle "run on main thread (legacy)" to go back to the old <code>run(source, { captureLog: true })</code> path and watch why that matters: it has a <code>timeoutMs</code> too, but a timer can't preempt code that never yields, so a runaway loop there freezes the whole tab.</li>
          <li><b>Step.</b> The stack machine walks the parser's AST and pushes each item through the runtime's own <code>processN</code> with the real registry operators, snapshotting the stack after every token. Blocks and user words are traced too, so you can watch <code>times</code>, <code>if</code> and <code>map</code> call back into them. Dashed boxes are an inner stack that <code>map</code>/<code>filter</code>/<code>reduce</code> create for each element. The stepper always runs on the main thread and is capped at 2,500 frames, so it stays safe even for the runaway preset.</li>
        </ol>
      </details>`;
    host.appendChild(root);

    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
    const ta = $<HTMLTextAreaElement>('textarea');
    const gutter = $('.gutter');
    const errbar = $('.errbar');
    const note = $('.note');
    const outJs = $('.out-js');
    const stale = $('.js .badge');
    const consoleEl = $('.console');
    const tape = $('.tape');
    const stackcol = $('.stackcol');
    const nowTok = $('.now .tok');
    const nowPos = $('.now .pos');
    const what = $('.what');
    const stepout = $('.stepout');
    const playBtn = $<HTMLButtonElement>('[data-a="play"]');
    const speed = $<HTMLInputElement>('.speed input');
    const legacyIn = $<HTMLInputElement>('.legacy-input');
    const timeoutIn = $<HTMLInputElement>('.timeout-input');
    const killBtn = $<HTMLButtonElement>('[data-a="kill"]');
    const copyLinkBtn = $<HTMLButtonElement>('[data-a="copylink"]');
    const stat = (k: string, v: string | number) => { const el = root.querySelector(`[data-s="${k}"]`); if (el) el.textContent = String(v); };

    stat('ops', registry.names().length);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    let disposed = false;
    let gen = 0;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let playTimer: ReturnType<typeof setTimeout> | null = null;
    let frames: Frame[] = [];
    let cur = -1;
    let errLine: number | null = null;
    let lastJs = '';
    let shown: Cell[] = [];
    let shownNested = false;
    let currentPresetId: string | null = null;

    /* deep link state — the source (if it's small) and preset travel in the URL */
    const DEFAULT_PRESET = PRESETS[1].id; // 'fib'
    const LINK_DEFAULTS = { preset: DEFAULT_PRESET, src: '', timeout: 3000, legacy: false };
    const initial = readState(LINK_DEFAULTS);

    function persistState() {
      const st: Record<string, unknown> = {
        preset: currentPresetId ?? DEFAULT_PRESET,
        timeout: Math.max(200, Number(timeoutIn.value) || 3000),
        legacy: legacyIn.checked,
      };
      const preset = PRESETS.find((p) => p.id === currentPresetId);
      if (ta.value.length && ta.value.length < 2000 && ta.value !== preset?.src) st.src = ta.value;
      writeState(st, LINK_DEFAULTS);
    }

    /* andbox sandbox — created lazily, reused across runs, disposed on unmount */
    let sandbox: Sandbox | null = null;
    let sandboxPromise: Promise<Sandbox> | null = null;
    function ensureSandbox(): Promise<Sandbox> {
      if (sandbox) return Promise.resolve(sandbox);
      if (!sandboxPromise) {
        sandboxPromise = mkSandbox({ importMap: { imports: RUNTIME_IMPORT_MAP }, defaultTimeoutMs: 3000 })
          .then(async (sb) => {
            // Prime the CDN-mirrored runtime + stdlib once, on a generous
            // timeout that's independent of the per-run slider. A cold
            // esm.sh fetch (first visit, empty HTTP cache) can take a few
            // seconds; without this, that network latency would eat into a
            // run's own timeout budget and read as a false "killed" on a
            // perfectly ordinary program. Once resolved, sandboxImport() for
            // the same specifier in this worker resolves from its module
            // map instantly, so every real run after this is fast.
            try {
              await sb.evaluate(
                `await sandboxImport('@johnhenry/jth-runtime'); await sandboxImport('@johnhenry/jth-stdlib'); return true;`,
                { timeoutMs: 15000 },
              );
            } catch { /* best-effort warm-up — a real run will just pay the fetch cost itself */ }
            sandbox = sb;
            return sb;
          })
          .catch((e) => { sandboxPromise = null; throw e; });
      }
      return sandboxPromise;
    }
    let runAbort: AbortController | null = null;
    void ensureSandbox(); // start warming the worker + CDN modules immediately, don't block mount

    /* presets */
    const presetBox = $('.presets');
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.className = 'chip preset';
      b.textContent = p.label;
      b.dataset.id = p.id;
      b.addEventListener('click', () => loadPreset(p));
      presetBox.appendChild(b);
    }
    function loadPreset(p: Preset, src?: string) {
      ta.value = src ?? p.src;
      note.innerHTML = p.note;
      currentPresetId = p.id;
      presetBox.querySelectorAll('.preset').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.id === p.id));
      update(true);
      persistState();
    }

    /* gutter */
    function renderGutter(activeLine: number | null) {
      const n = ta.value.split('\n').length;
      let h = '';
      for (let i = 1; i <= n; i++) {
        const cls = i === errLine ? 'err' : i === activeLine ? 'hot' : '';
        h += `<span class="${cls}">${i}</span>`;
      }
      gutter.innerHTML = h;
      gutter.scrollTop = ta.scrollTop;
    }
    ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });

    /* compile + run + trace */
    async function update(autoplay: boolean) {
      const my = ++gen;
      stopPlay();
      const src = ta.value;
      const t0 = performance.now();
      let ast: any;
      try {
        const tokens = lex(src);
        stat('tokens', tokens.filter((t: any) => t.type !== 'EOF' && t.type !== 'COMMENT').length);
        ast = parse(tokens);
        stat('stmts', ast.body.length);
        lastJs = transform(src, { preamble: true });
        stat('ms', (performance.now() - t0).toFixed(1));
        errLine = null;
        errbar.hidden = true;
        stale.hidden = true;
        outJs.classList.remove('dim');
      } catch (e: any) {
        errLine = e?.line ?? null;
        const lineSrc = errLine != null ? src.split('\n')[errLine - 1] ?? '' : '';
        const caret = e?.column != null ? ' '.repeat(Math.max(0, e.column - 1)) + '^' : '';
        errbar.hidden = false;
        errbar.innerHTML = `<b>${esc(e?.name ?? 'Error')}</b> ${errLine != null ? `at ${errLine}:${e.column ?? 0}` : ''}: ${esc(String(e?.message ?? e))}` +
          (lineSrc ? `<pre>${esc(lineSrc)}\n${caret}</pre>` : '');
        stale.hidden = false;
        outJs.classList.add('dim');
        renderGutter(null);
        return;
      }
      outJs.innerHTML = highlightJS(lastJs, null);
      renderGutter(null);

      // run — either sandboxed in an andbox Worker (default, timeout-safe) or
      // directly on the main thread (legacy toggle; see the sandboxProgram()
      // doc comment above for why the sandbox is the real fix).
      const r0 = performance.now();
      const timeoutMs = Math.max(200, Number(timeoutIn.value) || 3000);
      let out = '';
      let runErr = '';
      let killedAfter: number | null = null;
      if (legacyIn.checked) {
        killBtn.disabled = true;
        try {
          const res = await run(src, { captureLog: true, timeoutMs });
          out = res.output;
          if (res.stack.length) out += (out ? '\n' : '') + `⟶ final stack: ${res.stack.toArray().map((v) => fmt(v).text).join('  ')}`;
        } catch (e: any) {
          runErr = `${e?.name ?? 'Error'}${e?.line != null ? ` at ${e.line}:${e.column ?? 0}` : ''}: ${e?.message ?? e}`;
        }
      } else {
        runAbort?.abort();
        const ac = new AbortController();
        runAbort = ac;
        killBtn.disabled = false;
        const lines: string[] = [];
        try {
          const sb = await ensureSandbox();
          if (disposed || my !== gen) return;
          const bodyJs = transform(src, { preamble: false });
          const value = await sb.evaluate(sandboxProgram(bodyJs), {
            timeoutMs,
            signal: ac.signal,
            onConsole: (_level, ...args) => lines.push(args.join(' ')),
          });
          out = lines.join('\n');
          if (Array.isArray(value) && value.length) out += (out ? '\n' : '') + `⟶ final stack: ${value.map((v) => fmt(v).text).join('  ')}`;
        } catch (e: any) {
          out = lines.join('\n');
          if (e?.name === 'TimeoutError' || e?.name === 'AbortError') killedAfter = Math.round(performance.now() - r0);
          else runErr = `${e?.name ?? 'Error'}: ${e?.message ?? e}`;
        } finally {
          if (runAbort === ac) { runAbort = null; if (!disposed) killBtn.disabled = true; }
        }
      }
      if (disposed || my !== gen) return;
      stat('runms', killedAfter != null ? `killed after ${killedAfter}ms` : `ran in ${(performance.now() - r0).toFixed(1)}ms`);
      consoleEl.innerHTML = esc(out || (runErr || killedAfter != null ? '' : '(no output)')) +
        (runErr ? `<span class="rerr">${esc(runErr)}</span>` : '') +
        (killedAfter != null
          ? `<span class="killed">killed after ${killedAfter}ms (timeout ${timeoutMs}ms) — worker.terminate()'d; the main thread stayed responsive</span>`
          : '');

      // trace for the stepper
      const tr = await trace(ast);
      if (disposed || my !== gen) return;
      frames = tr.frames;
      if (tr.error) frames.push({ label: '✕', line: 0, column: 0, depth: 0, nested: false, stack: frames.at(-1)?.stack ?? [], out: [], note: tr.error });
      if (tr.truncated) frames.push({ label: '…', line: 0, column: 0, depth: 0, nested: false, stack: frames.at(-1)?.stack ?? [], out: [], note: `trace capped at ${MAX_FRAMES} steps` });
      stat('total', frames.length);
      goto(-1, true);
      if (autoplay) later(() => { if (my === gen) play(); }, 500);
    }

    /* stack rendering with push/pop animation */
    function renderStack(cells: Cell[], nested: boolean) {
      if (nested !== shownNested) {
        // switched between main and an inner stack: rebuild instantly
        stackcol.querySelectorAll('.box').forEach((b) => b.remove());
        shown = [];
        shownNested = nested;
        stackcol.classList.toggle('nested', nested);
      }
      let k = 0;
      while (k < shown.length && k < cells.length && shown[k].text === cells[k].text && shown[k].kind === cells[k].kind) k++;
      const live = Array.from(stackcol.querySelectorAll('.box:not(.out)')) as HTMLElement[];
      for (let i = live.length - 1; i >= k; i--) {
        const el = live[i];
        el.classList.add('out');
        later(() => el.remove(), 260);
      }
      for (let i = k; i < cells.length; i++) {
        const el = document.createElement('div');
        el.className = `box k-${cells[i].kind} in`;
        el.style.animationDelay = `${(i - k) * 40}ms`;
        el.textContent = cells[i].text;
        el.title = cells[i].text;
        stackcol.appendChild(el);
      }
      shown = cells;
    }

    function renderTape() {
      const W = 9;
      const start = Math.max(0, Math.min(cur - W, frames.length - (2 * W + 1)));
      const end = Math.min(frames.length, start + 2 * W + 1);
      let h = start > 0 ? '<span class="more">…</span>' : '';
      for (let i = start; i < end; i++) {
        const f = frames[i];
        const cls = [i === cur ? 'on' : i < cur ? 'done' : '', f.depth ? 'deep' : '', f.nested ? 'inner' : ''].join(' ');
        h += `<button class="t ${cls}" data-i="${i}" title="${esc(f.note)}">${f.depth ? '<i>' + '›'.repeat(Math.min(f.depth, 3)) + '</i>' : ''}${esc(f.label)}</button>`;
      }
      if (end < frames.length) h += '<span class="more">…</span>';
      tape.innerHTML = h;
    }

    function goto(i: number, instant = false) {
      cur = Math.max(-1, Math.min(frames.length - 1, i));
      stat('step', cur + 1);
      renderTape();
      if (cur < 0) {
        if (instant) { stackcol.querySelectorAll('.box').forEach((b) => b.remove()); shown = []; shownNested = false; stackcol.classList.remove('nested'); }
        else renderStack([], false);
        nowTok.textContent = frames.length ? 'ready' : '—';
        nowPos.textContent = '';
        what.textContent = frames.length ? 'Press ▶ to execute the program token by token.' : 'Nothing to run.';
        stepout.textContent = '';
        renderGutter(null);
        outJs.innerHTML = highlightJS(lastJs, null);
        return;
      }
      const f = frames[cur];
      renderStack(f.stack, f.nested);
      nowTok.textContent = f.label;
      nowPos.textContent = f.line ? `line ${f.line}:${f.column}${f.depth ? ` · depth ${f.depth}` : ''}${f.nested ? ' · inner stack' : ''}` : '';
      what.textContent = f.note;
      what.classList.toggle('bad', f.label === '✕');
      stepout.innerHTML = f.out.length ? f.out.map((l) => `<div>› ${esc(l)}</div>`).join('') : '';
      renderGutter(f.line || null);
      outJs.innerHTML = highlightJS(lastJs, f.depth === 0 && !f.nested ? f.line : topLineFor(cur));
    }
    // for nested frames, highlight the top-level statement that is executing
    function topLineFor(i: number): number | null {
      for (let j = i; j >= 0; j--) if (frames[j].depth === 0 && !frames[j].nested) return frames[j].line;
      for (let j = i; j < frames.length; j++) if (frames[j].depth === 0 && !frames[j].nested) return frames[j].line;
      return null;
    }

    function tick() {
      if (disposed) return;
      if (cur >= frames.length - 1) { stopPlay(); return; }
      goto(cur + 1);
      playTimer = setTimeout(tick, Number(speed.max) + Number(speed.min) - Number(speed.value));
    }
    function play() {
      if (!frames.length) return;
      if (cur >= frames.length - 1) goto(-1, true);
      playBtn.textContent = '❚❚';
      if (playTimer) clearTimeout(playTimer);
      playTimer = setTimeout(tick, 120);
    }
    function stopPlay() {
      if (playTimer) clearTimeout(playTimer);
      playTimer = null;
      playBtn.textContent = '▶';
    }

    root.querySelector('.controls')!.addEventListener('click', (ev) => {
      const a = (ev.target as HTMLElement).closest('button')?.dataset.a;
      if (!a) return;
      if (a === 'play') { playTimer ? stopPlay() : play(); return; }
      stopPlay();
      if (a === 'reset') goto(-1);
      if (a === 'back') goto(cur - 1);
      if (a === 'fwd') goto(cur + 1);
    });
    tape.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('button.t') as HTMLElement | null;
      if (!b) return;
      stopPlay();
      goto(Number(b.dataset.i));
    });

    ta.addEventListener('input', () => {
      presetBox.querySelectorAll('.preset').forEach((b) => b.classList.remove('on'));
      renderGutter(null);
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => update(true), 350);
      persistState();
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const { selectionStart: s, selectionEnd: en } = ta;
        ta.setRangeText('  ', s, en, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    });

    legacyIn.addEventListener('change', () => {
      if (legacyIn.checked) { runAbort?.abort(); killBtn.disabled = true; }
      persistState();
      update(false);
    });
    timeoutIn.addEventListener('input', () => {
      stat('timeoutms', timeoutIn.value);
      persistState();
    });
    killBtn.addEventListener('click', () => { runAbort?.abort(); });
    copyLinkBtn.addEventListener('click', async () => {
      await copyLink();
      const original = copyLinkBtn.textContent;
      copyLinkBtn.textContent = 'copied!';
      later(() => { copyLinkBtn.textContent = original; }, 1200);
    });

    /* initial load: a deep-linked source wins over the preset's own text */
    timeoutIn.value = String(initial.timeout);
    stat('timeoutms', initial.timeout);
    legacyIn.checked = initial.legacy;
    const startPreset = PRESETS.find((p) => p.id === initial.preset) ?? PRESETS[1];
    loadPreset(startPreset, initial.src || undefined);

    return () => {
      disposed = true;
      gen++;
      stopPlay();
      if (debounce) clearTimeout(debounce);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      runAbort?.abort();
      runAbort = null;
      const sb = sandbox;
      sandbox = null;
      sb?.dispose().catch(() => {});
      root.remove();
    };
  },
};
export default playground;
