import type { Playground } from '../registry';
import { readState, writeState, copyLink } from '../state';
import './objectify.css';

/**
 * ── Objectify Bench ─────────────────────────────────────────────────────────
 * objectify (github.com/johnhenry/objectify) is a single Rust binary: write a
 * class, drop it in `.objectify/classes/`, and every method on it becomes a
 * shell command — `objectify use <id> <method> --json '{...}'` — with every
 * call versioned into a SQLite-backed history. There is no npm package to
 * import here (see docs — the npm shim is unpublished), so this planet is an
 * IN-BROWSER EMULATION of that command model, not the real binary:
 *
 *   - "SQLite" is `localStorage`.
 *   - A "class" is parsed from user-typed source with `new Function(...)`.
 *   - Methods are reflected off `ClassRef.prototype` (own property names,
 *     skipping `constructor`), and their parameter names are read back out
 *     of `Function.prototype.toString()` on each method — the same trick
 *     the real tool's schema extractor performs on TS/Python source.
 *   - Object state is the instance's own enumerable fields *after* a method
 *     runs (`this.foo = …`) — this stands in for the real tool's injected
 *     `this.get()` / `this.set()` — snapshotted as a new version every call,
 *     exactly like the real tool's full-snapshot event log.
 */

// ── types ───────────────────────────────────────────────────────────────────

type JSONValue = any; // eslint-disable-line @typescript-eslint/no-explicit-any

interface MethodInfo { name: string; params: string[] }
interface ClassInfo { name: string; ctor: new (...a: unknown[]) => unknown; methods: MethodInfo[] }

interface VersionRec { version: number; method: string; at: number; state: JSONValue; result?: JSONValue }
interface InstanceRec { id: string; className: string; description: string; createdAt: number; versions: VersionRec[] }

interface RoomState extends Record<string, unknown> { preset: string; instance: string }

// ── presets ─────────────────────────────────────────────────────────────────

const PRESETS: Record<string, string> = {
  TaskList: `class TaskList {
  constructor() {
    this.tasks = [];
  }
  add({ title, priority = 0 }) {
    const task = { id: Math.random().toString(16).slice(2, 10), title, priority, done: false };
    this.tasks = [...this.tasks, task];
    return task;
  }
  complete({ id }) {
    this.tasks = this.tasks.map(t => (t.id === id ? { ...t, done: true } : t));
    return this.tasks.find(t => t.id === id) ?? null;
  }
  pending() {
    return this.tasks.filter(t => !t.done);
  }
  clear() {
    this.tasks = [];
    return { cleared: true };
  }
}`,
  Counter: `class Counter {
  constructor() {
    this.value = 0;
    this.history = [];
  }
  increment({ by = 1 } = {}) {
    this.value = this.value + by;
    this.history = [...this.history, this.value];
    return this.value;
  }
  decrement({ by = 1 } = {}) {
    this.value = this.value - by;
    this.history = [...this.history, this.value];
    return this.value;
  }
  reset() {
    this.value = 0;
    this.history = [];
    return this.value;
  }
}`,
  KeyValueStore: `class KeyValueStore {
  constructor() {
    this.data = {};
  }
  write({ key, value }) {
    this.data = { ...this.data, [key]: value };
    return this.data[key];
  }
  read({ key }) {
    return this.data[key] ?? null;
  }
  remove({ key }) {
    const rest = { ...this.data };
    delete rest[key];
    this.data = rest;
    return { removed: key };
  }
  keys() {
    return Object.keys(this.data);
  }
}`,
  BankAccount: `class BankAccount {
  constructor() {
    this.owner = 'unknown';
    this.balance = 0;
  }
  open({ owner, balance = 0 }) {
    if (balance < 0) throw new Error('opening balance cannot be negative');
    this.owner = owner;
    this.balance = balance;
    return { owner: this.owner, balance: this.balance };
  }
  deposit({ amount }) {
    if (typeof amount !== 'number' || amount <= 0) throw new Error('deposit amount must be a positive number');
    this.balance = this.balance + amount;
    return { balance: this.balance };
  }
  withdraw({ amount }) {
    if (typeof amount !== 'number' || amount <= 0) throw new Error('withdraw amount must be a positive number');
    if (amount > this.balance) throw new Error('insufficient funds: balance is ' + this.balance);
    this.balance = this.balance - amount;
    return { balance: this.balance };
  }
  statement() {
    return { owner: this.owner, balance: this.balance };
  }
}`,
};
const PRESET_NAMES = Object.keys(PRESETS);

// ── class parsing / reflection ───────────────────────────────────────────────

function parseClass(source: string): ClassInfo {
  let ctor: unknown;
  try {
    // eslint-disable-next-line no-new-func
    ctor = new Function(`"use strict"; return (\n${source}\n);`)();
  } catch (e) {
    throw new Error(`parse error: ${(e as Error).message}`);
  }
  if (typeof ctor !== 'function' || !(ctor as { prototype?: unknown }).prototype) {
    throw new Error('source must evaluate to a single class expression, e.g. `class Foo { ... }`.');
  }
  const fn = ctor as new (...a: unknown[]) => unknown;
  const name = fn.name || 'Anonymous';
  const methodNames = Object.getOwnPropertyNames(fn.prototype as object).filter(
    (n) => n !== 'constructor' && typeof (fn.prototype as Record<string, unknown>)[n] === 'function',
  );
  const methods = methodNames.map((n) => reflectMethod(n, (fn.prototype as Record<string, (...a: unknown[]) => unknown>)[n]));
  return { name, ctor: fn, methods };
}

function reflectMethod(name: string, impl: (...a: unknown[]) => unknown): MethodInfo {
  const src = Function.prototype.toString.call(impl);
  const m = src.match(/\(([^)]*)\)/);
  const params = extractParamNames(m ? m[1] : '');
  return { name, params };
}

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    if (ch === '}' || ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function extractParamNames(paramsRaw: string): string[] {
  const s = paramsRaw.trim();
  if (!s) return [];
  if (s.startsWith('{')) {
    const inner = s.slice(1, s.lastIndexOf('}'));
    return splitTopLevel(inner)
      .map((p) => p.split('=')[0].split(':')[0].trim())
      .filter(Boolean);
  }
  return splitTopLevel(s)
    .map((p) => p.split('=')[0].trim())
    .filter(Boolean);
}

// ── instance execution ────────────────────────────────────────────────────

function snapshot(inst: object): JSONValue {
  const out: Record<string, JSONValue> = {};
  for (const k of Object.keys(inst)) {
    const v = (inst as Record<string, unknown>)[k];
    if (typeof v === 'function') continue;
    out[k] = v;
  }
  return JSON.parse(JSON.stringify(out));
}

function instantiate(cls: ClassInfo): JSONValue {
  const inst = new cls.ctor();
  return snapshot(inst as object);
}

function callMethod(cls: ClassInfo, state: JSONValue, method: string, arg: JSONValue): { state: JSONValue; result: JSONValue } {
  const proto = cls.ctor.prototype as Record<string, (...a: unknown[]) => unknown>;
  const impl = proto[method];
  if (typeof impl !== 'function') throw new Error(`no such method: ${method}`);
  const inst = Object.create(cls.ctor.prototype);
  Object.assign(inst, state);
  const result = impl.call(inst, arg);
  if (result && typeof (result as { then?: unknown }).then === 'function') {
    throw new Error('async methods are not supported by this emulation — keep methods synchronous');
  }
  return { state: snapshot(inst), result: result === undefined ? null : JSON.parse(JSON.stringify(result)) };
}

// ── ids / storage ────────────────────────────────────────────────────────

function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function shortIdFor(id: string, all: InstanceRec[]): string {
  for (let len = 4; len <= id.length; len++) {
    const p = id.slice(0, len);
    if (all.filter((o) => o.id.startsWith(p)).length === 1) return p;
  }
  return id;
}

function resolve(prefix: string, all: InstanceRec[]): InstanceRec {
  if (!prefix) throw new Error('missing object id');
  const matches = all.filter((o) => o.id.startsWith(prefix));
  if (matches.length === 0) throw new Error(`no object matching "${prefix}"`);
  if (matches.length > 1) throw new Error(`ambiguous id "${prefix}" — ${matches.length} matches`);
  return matches[0];
}

const STORAGE_KEY = 'orrery:objectify:instances:v1';

function loadInstances(): InstanceRec[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveInstances(list: InstanceRec[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

// ── tiny JSON-patch-ish diff (RFC 6902 flavoured, not fully compliant) ───────

interface DiffOp { op: 'add' | 'remove' | 'replace'; path: string; value?: JSONValue }

function diffValues(a: JSONValue, b: JSONValue, path = ''): DiffOp[] {
  if (a === b) return [];
  const aIsObj = a !== null && typeof a === 'object' && !Array.isArray(a);
  const bIsObj = b !== null && typeof b === 'object' && !Array.isArray(b);
  if (!aIsObj || !bIsObj) {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    return [{ op: 'replace', path: path || '/', value: b }];
  }
  const ops: DiffOp[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const p = `${path}/${k}`;
    if (!(k in a)) ops.push({ op: 'add', path: p, value: b[k] });
    else if (!(k in b)) ops.push({ op: 'remove', path: p });
    else ops.push(...diffValues(a[k], b[k], p));
  }
  return ops;
}

// ── command tokenizer & JSON-arg builder ─────────────────────────────────────

function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (const c of line) {
    if (q) {
      if (c === q) q = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

function parseValue(v: string): JSONValue {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function buildArg(tokens: string[]): JSONValue {
  if (tokens.length === 0) return undefined;
  const kv: Record<string, JSONValue> = {};
  let hasKv = false;
  let plain: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const kvMatch = t.match(/^(?:-p|--parameter):(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const val = tokens[++i];
      if (val === undefined) throw new Error(`missing value for -p:${key}`);
      kv[key] = parseValue(val);
      hasKv = true;
      continue;
    }
    if (t === '-p' || t === '--parameter') {
      const val = tokens[++i];
      if (val === undefined) throw new Error('missing value for -p');
      plain = val;
      continue;
    }
    if (plain === undefined) plain = t;
  }
  if (hasKv) return kv;
  if (plain !== undefined) return JSON.parse(plain);
  return undefined;
}

// ── command dispatch ─────────────────────────────────────────────────────

interface Ctx {
  getClass: () => ClassInfo | null;
  getInstances: () => InstanceRec[];
  setInstances: (l: InstanceRec[]) => void;
}

function helpText(cls: ClassInfo | null): string {
  const lines = [
    'objectify — write a class, get a versioned CLI. commands:',
    '  create [description] [--class=Name]   create a new object',
    '  list                                   list objects',
    '  inspect <id>                           object metadata',
    '  destroy <id>                           delete an object + history',
    '  use <id> get [--at=<v>]                read current (or pinned) state',
    "  use <id> set '<json>'                  replace state entirely",
    '  use <id> help                          list methods on the class',
    "  use <id> <method> '<json>'             call a method (or -p:key val ...)",
    '  log <id>                               version history',
    '  diff <id> <v1> <v2>                    JSON patch between two versions',
    '  rewind <id> <version>                  restore a previous version',
    '  fork <id> [--at=<v>]                   copy into a new independent object',
  ];
  if (cls) {
    lines.push('', `class "${cls.name}" loaded — reflected methods:`);
    for (const m of cls.methods) lines.push(`  use <id> ${m.name} {${m.params.join(', ')}}`);
  } else {
    lines.push('', '(no class loaded — write one on the left, or pick a preset)');
  }
  return lines.join('\n');
}

function runCommand(raw: string, ctx: Ctx): string {
  let tokens = tokenize(raw.trim());
  if (tokens[0] === 'objectify') tokens = tokens.slice(1);
  if (tokens.length === 0) return '';
  const [cmd, ...rest] = tokens;
  switch (cmd) {
    case 'help':
      return helpText(ctx.getClass());
    case 'classes': {
      const cls = ctx.getClass();
      return JSON.stringify(
        cls ? [{ name: cls.name, lang: 'JavaScript (emulated)', methods: cls.methods.map((m) => m.name) }] : [],
      );
    }
    case 'create': {
      let description = '';
      let className: string | undefined;
      for (const t of rest) {
        if (t.startsWith('--class=')) className = t.slice('--class='.length);
        else if (!description) description = t;
      }
      const cls = ctx.getClass();
      if (className && (!cls || cls.name !== className)) {
        throw new Error(`class "${className}" isn't loaded — the editor currently holds ${cls ? `"${cls.name}"` : 'nothing'}`);
      }
      const id = newId();
      const state = className && cls ? instantiate(cls) : {};
      const rec: InstanceRec = {
        id,
        className: className || '',
        description,
        createdAt: Date.now(),
        versions: [{ version: 1, method: 'create', at: Date.now(), state }],
      };
      const list = [...ctx.getInstances(), rec];
      ctx.setInstances(list);
      return JSON.stringify(shortIdFor(id, list));
    }
    case 'list': {
      const list = ctx.getInstances();
      return JSON.stringify(
        list.map((r) => ({
          id: shortIdFor(r.id, list),
          class: r.className || null,
          description: r.description || null,
          versions: r.versions.length,
          created: new Date(r.createdAt).toISOString(),
        })),
      );
    }
    case 'inspect': {
      const list = ctx.getInstances();
      const rec = resolve(rest[0], list);
      return JSON.stringify({
        id: rec.id,
        shortId: shortIdFor(rec.id, list),
        class: rec.className || null,
        description: rec.description || null,
        versions: rec.versions.length,
        createdAt: new Date(rec.createdAt).toISOString(),
      });
    }
    case 'destroy': {
      const list = ctx.getInstances();
      const rec = resolve(rest[0], list);
      ctx.setInstances(list.filter((r) => r.id !== rec.id));
      return JSON.stringify({ destroyed: shortIdFor(rec.id, list) });
    }
    case 'log': {
      const list = ctx.getInstances();
      const rec = resolve(rest[0], list);
      return JSON.stringify(rec.versions.map((v) => ({ version: v.version, method: v.method, at: new Date(v.at).toISOString() })));
    }
    case 'diff': {
      const list = ctx.getInstances();
      const rec = resolve(rest[0], list);
      const v1 = rec.versions.find((v) => v.version === Number(rest[1]));
      const v2 = rec.versions.find((v) => v.version === Number(rest[2]));
      if (!v1 || !v2) throw new Error('version not found');
      return JSON.stringify(diffValues(v1.state, v2.state));
    }
    case 'rewind': {
      const list = ctx.getInstances();
      const rec = resolve(rest[0], list);
      const target = rec.versions.find((v) => v.version === Number(rest[1]));
      if (!target) throw new Error(`version ${rest[1]} not found`);
      const newVersion = rec.versions.length + 1;
      rec.versions.push({ version: newVersion, method: 'rewind', at: Date.now(), state: target.state, result: { rewoundTo: target.version, newVersion } });
      ctx.setInstances(list.map((r) => (r.id === rec.id ? rec : r)));
      return JSON.stringify({ rewoundTo: target.version, newVersion });
    }
    case 'fork': {
      const list = ctx.getInstances();
      const rec = resolve(rest[0], list);
      const atFlag = rest.find((t) => t.startsWith('--at='));
      const source = atFlag ? rec.versions.find((v) => v.version === Number(atFlag.slice(5))) : rec.versions[rec.versions.length - 1];
      if (!source) throw new Error('version not found');
      const id = newId();
      const forked: InstanceRec = {
        id,
        className: rec.className,
        description: rec.description,
        createdAt: Date.now(),
        versions: [{ version: 1, method: 'fork', at: Date.now(), state: source.state }],
      };
      const next = [...list, forked];
      ctx.setInstances(next);
      return JSON.stringify(shortIdFor(id, next));
    }
    case 'use': {
      const [idPrefix, method, ...argTokens] = rest;
      if (!idPrefix || !method) throw new Error('usage: use <id> <method> [input]');
      const list = ctx.getInstances();
      const rec = resolve(idPrefix, list);
      const cur = rec.versions[rec.versions.length - 1].state;
      if (method === 'get') {
        const atFlag = argTokens.find((t) => t.startsWith('--at='));
        if (atFlag) {
          const v = rec.versions.find((x) => x.version === Number(atFlag.slice(5)));
          return JSON.stringify(v ? v.state : null);
        }
        return JSON.stringify(cur);
      }
      if (method === 'set') {
        const jsonTok = argTokens.find((t) => !t.startsWith('-'));
        if (!jsonTok) throw new Error("usage: use <id> set '<json>'");
        const next = JSON.parse(jsonTok);
        rec.versions.push({ version: rec.versions.length + 1, method: 'set', at: Date.now(), state: next });
        ctx.setInstances(list.map((r) => (r.id === rec.id ? rec : r)));
        return JSON.stringify(next);
      }
      if (method === 'help') {
        const cls = ctx.getClass();
        if (!cls || cls.name !== rec.className) throw new Error(`class "${rec.className}" isn't loaded in the editor`);
        return cls.methods.map((m) => `${m.name}({${m.params.join(', ')}})`).join('\n');
      }
      const cls = ctx.getClass();
      if (!cls) throw new Error('no class loaded — write or pick a preset on the left first');
      if (cls.name !== rec.className) throw new Error(`object's class is "${rec.className || '(none)'}", editor holds "${cls.name}"`);
      const arg = buildArg(argTokens);
      const { state, result } = callMethod(cls, cur, method, arg);
      // Mirrors the real tool: a version is only written when the method actually
      // mutated `this` (i.e. called the equivalent of this.set()) — a pure read
      // like `pending()` returns a result without adding to the history.
      if (JSON.stringify(state) !== JSON.stringify(cur)) {
        rec.versions.push({ version: rec.versions.length + 1, method, at: Date.now(), state, result });
        ctx.setInstances(list.map((r) => (r.id === rec.id ? rec : r)));
      }
      return JSON.stringify(result);
    }
    default:
      throw new Error(`unknown command: ${cmd} (try "help")`);
  }
}

// ── formatting helpers ────────────────────────────────────────────────────

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// ── mount ────────────────────────────────────────────────────────────────

const playground: Playground = {
  id: 'objectify',
  title: 'Objectify Bench',
  pkg: 'objectify (emulated)',
  hue: 105,
  blurb: 'Write a class, get a versioned, stateful CLI. An in-browser emulation of the objectify model.',
  docs: 'https://opensource.johnhenry.me/objectify/',

  mount(host: HTMLElement) {
    const cleanups: Array<() => void> = [];
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, ev: K | string, fn: (e: Event) => void) => {
      el.addEventListener(ev, fn as EventListener);
      cleanups.push(() => el.removeEventListener(ev, fn as EventListener));
    };

    const state = readState<RoomState>({ preset: 'TaskList', instance: '' });

    const root = document.createElement('div');
    root.className = 'pg-objectify';
    root.innerHTML = `
      <div class="ob-banner">
        <span class="chip">emulation</span>
        the real <b>objectify</b> is a Node/Rust binary; this planet reproduces its command model in the browser
        — <button class="linklike" id="ob-copy">copy link</button>
      </div>

      <div class="ob-layout">
        <div class="panel ob-col">
          <strong>Class editor</strong>
          <div class="ob-presets" id="ob-presets"></div>
          <textarea class="code" id="ob-source" spellcheck="false"></textarea>
          <div class="ob-editor-row">
            <button class="btn primary" id="ob-parse">parse &amp; reflect</button>
            <span class="stat" id="ob-parse-stat"></span>
          </div>
          <pre class="code ob-reflection" id="ob-reflection"></pre>
        </div>

        <div class="panel ob-col ob-term-col">
          <strong>Terminal</strong>
          <pre class="code ob-help" id="ob-help"></pre>
          <div class="ob-scrollback" id="ob-scrollback"></div>
          <div class="ob-inputrow">
            <span class="ob-prompt">objectify&gt;</span>
            <input class="ob-input" id="ob-input" autocomplete="off" spellcheck="false" placeholder="create &quot;sprint tasks&quot; --class=TaskList">
          </div>
          <div class="ob-suggest" id="ob-suggest"></div>
        </div>

        <div class="panel ob-col">
          <strong>State &amp; history</strong>
          <div class="stat">objects <b id="ob-count">0</b> · persisted in <code>localStorage</code> (emulating SQLite)</div>
          <div class="ob-instances" id="ob-instances"></div>
          <div id="ob-detail"></div>
        </div>
      </div>
    `;
    host.innerHTML = '';
    host.appendChild(root);

    // ---- element refs ----
    const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    const sourceEl = $<HTMLTextAreaElement>('#ob-source');
    const presetsEl = $<HTMLDivElement>('#ob-presets');
    const parseStatEl = $<HTMLSpanElement>('#ob-parse-stat');
    const reflectionEl = $<HTMLPreElement>('#ob-reflection');
    const helpEl = $<HTMLPreElement>('#ob-help');
    const scrollbackEl = $<HTMLDivElement>('#ob-scrollback');
    const inputEl = $<HTMLInputElement>('#ob-input');
    const suggestEl = $<HTMLDivElement>('#ob-suggest');
    const countEl = $<HTMLElement>('#ob-count');
    const instancesEl = $<HTMLDivElement>('#ob-instances');
    const detailEl = $<HTMLDivElement>('#ob-detail');
    const copyBtn = $<HTMLButtonElement>('#ob-copy');

    // ---- planet state ----
    const cls: { current: ClassInfo | null } = { current: null };
    let instances: InstanceRec[] = loadInstances();
    let selectedInstance: string = state.instance;
    let selectedVersion: number | null = null;
    const history: string[] = [];
    let historyIdx = -1;

    const ctx: Ctx = {
      getClass: () => cls.current,
      getInstances: () => instances,
      setInstances: (l) => {
        instances = l;
        saveInstances(instances);
        renderInstances();
      },
    };

    function persistUiState() {
      writeState({ preset: state.preset, instance: selectedInstance }, { preset: 'TaskList', instance: '' });
    }

    function renderPresets() {
      presetsEl.innerHTML = PRESET_NAMES.map(
        (n) => `<button class="chip preset-btn${n === state.preset ? ' active' : ''}" data-preset="${n}">${n}</button>`,
      ).join('');
    }

    function tryParse(source: string) {
      try {
        cls.current = parseClass(source);
        parseStatEl.textContent = `✓ "${cls.current.name}" — ${cls.current.methods.length} method(s)`;
        parseStatEl.classList.remove('bad');
        reflectionEl.textContent = cls.current.methods
          .map((m) => `${m.name}({ ${m.params.join(', ') || '/* no args */'} })`)
          .join('\n') || '(no methods found)';
      } catch (e) {
        cls.current = null;
        parseStatEl.textContent = `✗ ${(e as Error).message}`;
        parseStatEl.classList.add('bad');
        reflectionEl.textContent = '';
      }
      helpEl.textContent = helpText(cls.current);
    }

    function renderInstances() {
      countEl.textContent = String(instances.length);
      if (instances.length === 0) {
        instancesEl.innerHTML = '<div class="ob-empty">no objects yet — try: <code>create "sprint tasks" --class=TaskList</code></div>';
      } else {
        instancesEl.innerHTML = instances
          .map((r) => {
            const sid = shortIdFor(r.id, instances);
            const sel = r.id === selectedInstance ? ' sel' : '';
            return `<div class="ob-inst-row${sel}" data-id="${r.id}">
              <span class="chip">${sid}</span>
              <span class="ob-inst-class">${esc(r.className || '(untyped)')}</span>
              <span class="ob-inst-desc">${esc(r.description || '')}</span>
              <span class="stat">v${r.versions.length}</span>
            </div>`;
          })
          .join('');
      }
      renderDetail();
    }

    function renderDetail() {
      const rec = instances.find((r) => r.id === selectedInstance);
      if (!rec) {
        detailEl.innerHTML = '';
        return;
      }
      const cur = rec.versions[rec.versions.length - 1];
      const vSel = selectedVersion ?? cur.version;
      const chosen = rec.versions.find((v) => v.version === vSel) ?? cur;
      const prev = rec.versions.find((v) => v.version === chosen.version - 1);
      const ops = prev ? diffValues(prev.state, chosen.state) : [{ op: 'add' as const, path: '/', value: chosen.state }];
      detailEl.innerHTML = `
        <div class="ob-detail-head">
          <span class="chip">${shortIdFor(rec.id, instances)}</span>
          <span>${esc(rec.className || '(untyped)')}</span>
          <button class="btn small" data-act="fork">fork v${chosen.version}</button>
          ${chosen.version !== cur.version ? `<button class="btn small" data-act="rewind">rewind to v${chosen.version}</button>` : ''}
        </div>
        <pre class="code ob-state">${esc(JSON.stringify(chosen.state, null, 2))}</pre>
        <strong class="ob-vh-label">version history</strong>
        <div class="ob-versions">
          ${rec.versions
            .slice()
            .reverse()
            .map(
              (v) => `<div class="ob-version-row${v.version === chosen.version ? ' sel' : ''}" data-v="${v.version}">
                <span class="chip">v${v.version}</span>
                <span class="ob-v-method">${esc(v.method)}</span>
                <span class="stat">${timeAgo(v.at)}</span>
              </div>`,
            )
            .join('')}
        </div>
        <strong class="ob-vh-label">diff from v${chosen.version - 1 < 1 ? '∅' : chosen.version - 1}</strong>
        <div class="ob-diff">
          ${ops.length === 0 ? '<span class="stat">(no change)</span>' : ops.map((o) => `<div class="ob-diff-row ob-op-${o.op}">${o.op} <code>${esc(o.path)}</code>${'value' in o ? ' → ' + esc(JSON.stringify(o.value)) : ''}</div>`).join('')}
        </div>
      `;
    }

    function print(line: string, kind: 'cmd' | 'out' | 'err' = 'out') {
      const div = document.createElement('div');
      div.className = `ob-line ob-${kind}`;
      if (kind === 'cmd') {
        div.innerHTML = `<span class="ob-prompt">objectify&gt;</span> ${esc(line)}`;
      } else {
        div.innerHTML = `<pre>${esc(pretty(line))}</pre>`;
      }
      scrollbackEl.appendChild(div);
      scrollbackEl.scrollTop = scrollbackEl.scrollHeight;
    }

    function execute(line: string) {
      if (!line.trim()) return;
      print(line, 'cmd');
      history.push(line);
      historyIdx = history.length;
      try {
        const out = runCommand(line, ctx);
        if (out) print(out, 'out');
        // keep selection sane after list-mutating commands
        if (selectedInstance && !instances.some((r) => r.id === selectedInstance)) selectedInstance = '';
        selectedVersion = null;
        renderInstances();
        persistUiState();
      } catch (e) {
        print(JSON.stringify({ error: (e as Error).message }), 'err');
      }
    }

    // ---- autocomplete ----
    function suggestionsFor(line: string): string[] {
      const tokens = tokenize(line);
      const commands = ['create', 'list', 'inspect', 'destroy', 'use', 'log', 'diff', 'rewind', 'fork', 'classes', 'help'];
      if (tokens.length <= 1) {
        const partial = tokens[0] || '';
        return commands.filter((c) => c.startsWith(partial));
      }
      if (tokens[0] === 'use' && tokens.length === 2) {
        const partial = tokens[1] || '';
        return instances.map((r) => shortIdFor(r.id, instances)).filter((sid) => sid.startsWith(partial));
      }
      if (tokens[0] === 'use' && tokens.length === 3 && cls.current) {
        const partial = tokens[2] || '';
        const names = ['get', 'set', 'help', ...cls.current.methods.map((m) => m.name)];
        return names.filter((n) => n.startsWith(partial));
      }
      return [];
    }

    function renderSuggestions() {
      const sugg = suggestionsFor(inputEl.value);
      if (sugg.length === 0) {
        suggestEl.innerHTML = '';
        return;
      }
      suggestEl.innerHTML = sugg.slice(0, 8).map((s) => `<span class="chip sugg" data-sugg="${esc(s)}">${esc(s)}</span>`).join('');
    }

    // ---- wiring ----
    renderPresets();
    sourceEl.value = PRESETS[state.preset] ?? PRESETS.TaskList;
    tryParse(sourceEl.value);
    renderInstances();

    on(presetsEl, 'click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.preset-btn');
      if (!btn) return;
      const name = btn.dataset.preset!;
      state.preset = name;
      sourceEl.value = PRESETS[name];
      tryParse(sourceEl.value);
      renderPresets();
      persistUiState();
    });

    on($<HTMLButtonElement>('#ob-parse'), 'click', () => tryParse(sourceEl.value));

    let debounce: number | undefined;
    on(sourceEl, 'input', () => {
      clearTimeout(debounce);
      debounce = window.setTimeout(() => tryParse(sourceEl.value), 400);
    });
    cleanups.push(() => clearTimeout(debounce));

    on(inputEl, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter') {
        execute(inputEl.value);
        inputEl.value = '';
        renderSuggestions();
      } else if (ke.key === 'ArrowUp') {
        if (historyIdx > 0) {
          historyIdx--;
          inputEl.value = history[historyIdx] ?? '';
        }
        ke.preventDefault();
      } else if (ke.key === 'ArrowDown') {
        if (historyIdx < history.length) {
          historyIdx++;
          inputEl.value = history[historyIdx] ?? '';
        }
        ke.preventDefault();
      } else if (ke.key === 'Tab') {
        const sugg = suggestionsFor(inputEl.value);
        if (sugg.length > 0) {
          const tokens = tokenize(inputEl.value);
          tokens[tokens.length - 1] = sugg[0];
          inputEl.value = tokens.join(' ') + ' ';
        }
        ke.preventDefault();
        renderSuggestions();
      }
    });
    on(inputEl, 'input', () => renderSuggestions());
    on(suggestEl, 'click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.sugg');
      if (!chip) return;
      const tokens = tokenize(inputEl.value);
      if (tokens.length === 0) tokens.push('');
      tokens[tokens.length - 1] = chip.dataset.sugg!;
      inputEl.value = tokens.join(' ') + ' ';
      inputEl.focus();
      renderSuggestions();
    });

    on(instancesEl, 'click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.ob-inst-row');
      if (!row) return;
      selectedInstance = row.dataset.id!;
      selectedVersion = null;
      renderInstances();
      persistUiState();
    });

    on(detailEl, 'click', (e) => {
      const t = e.target as HTMLElement;
      const vrow = t.closest<HTMLElement>('.ob-version-row');
      if (vrow) {
        selectedVersion = Number(vrow.dataset.v);
        renderDetail();
        return;
      }
      const actBtn = t.closest<HTMLElement>('[data-act]');
      if (actBtn && selectedInstance) {
        const rec = instances.find((r) => r.id === selectedInstance);
        if (!rec) return;
        const v = selectedVersion ?? rec.versions[rec.versions.length - 1].version;
        const sid = shortIdFor(rec.id, instances);
        if (actBtn.dataset.act === 'fork') execute(`fork ${sid} --at=${v}`);
        else if (actBtn.dataset.act === 'rewind') execute(`rewind ${sid} ${v}`);
      }
    });

    on(copyBtn, 'click', () => {
      copyLink().then(() => {
        copyBtn.textContent = 'copied!';
        setTimeout(() => (copyBtn.textContent = 'copy link'), 1200);
      });
    });

    // ---- deep-linked instance selection ----
    if (selectedInstance && !instances.some((r) => r.id === selectedInstance)) selectedInstance = '';
    renderInstances();

    // ---- seed a default state so the planet is impressive with zero input ----
    const seedClass = cls.current;
    if (instances.length === 0 && seedClass) {
      execute(`create "sprint tasks" --class=${seedClass.name}`);
      const sid = instances.length ? shortIdFor(instances[0].id, instances) : '';
      if (sid) {
        execute(`use ${sid} add -p:title "write the demo" -p:priority 1`);
        execute(`use ${sid} add -p:title "ship it"`);
        selectedInstance = instances[0].id;
        renderInstances();
      }
    } else if (selectedInstance) {
      renderInstances();
    }

    return () => {
      for (const fn of cleanups) fn();
      root.remove();
    };
  },
};

export default playground;
