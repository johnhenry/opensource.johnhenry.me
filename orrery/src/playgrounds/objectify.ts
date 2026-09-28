import type { Playground } from '../registry';
import { readState, writeState, copyLink } from '../state';
import { probeCompanion, hasDemo, companionBanner, type Companion } from '../companion';
import './objectify.css';

/**
 * ── Objectify Bench ─────────────────────────────────────────────────────────
 * `@johnhenry/objectify` (npm, published 2026-09-26) is a TypeScript adapter
 * over `better-sqlite3`: `Objectify.create/use/list/inspect/destroy/gc` and
 * `ObjectRef.get/set/log/diff/rewind/fork/call`. It talks directly to the same
 * SQLite file the standalone `objectify` Rust CLI writes. `better-sqlite3` is
 * a native Node module, so none of this can run in a browser tab on its own —
 * this planet always ships the in-page emulation below as its zero-input
 * default, and additionally talks to a REAL store through the optional Node
 * companion (`server/demos/objectify.mjs`) when one is running.
 *
 * Two run modes, chosen automatically per session (see mount()):
 *   - Companion live: every store operation below — create, list, inspect,
 *     destroy, get, set, log, diff, rewind, fork — is a real HTTP call to a
 *     real `@johnhenry/objectify` instance writing a real SQLite file on the
 *     companion machine. No Rust CLI or `objectify init` step is needed for
 *     this: `new Objectify({ dir })` opens-or-creates the schema itself.
 *   - Companion absent: the same operations run against an in-page stand-in
 *     — "SQLite" is `localStorage`, ids/diff/rewind/fork are reimplemented
 *     locally — behaviourally the same CLI model, honestly labelled.
 *
 * One thing stays emulated in BOTH modes: `use <id> <method>` (calling a
 * method on a class loaded in the editor). The real package's class-method
 * execution (`ObjectRef.call`) spawns a Deno/Python subprocess against a
 * `.ts`/`.py` file that must explicitly call an injected `this.get()` /
 * `this.set()` — a protocol this room's plain-field-mutation class editor
 * doesn't (and, for teaching purposes, shouldn't) use. So methods are always
 * reflected off `ClassRef.prototype` and run with `new Function(...)` right
 * here, exactly as before — but when the companion is live, a state-changing
 * method call is *persisted* into the real store via `ObjectRef.set()`
 * afterwards, so the object's version history, diff, rewind and fork are
 * genuinely backed by the real package. The one honest wrinkle: `set()`
 * always logs its event as method "set" (see the package's own
 * `object-ref.ts`), so a real `log` shows "set" where the in-page emulation
 * would have shown the original method name — the banner below says so.
 */

// ── types ───────────────────────────────────────────────────────────────────

type JSONValue = any; // eslint-disable-line @typescript-eslint/no-explicit-any

interface MethodInfo { name: string; params: string[] }
interface ClassInfo { name: string; ctor: new (...a: unknown[]) => unknown; methods: MethodInfo[] }

interface LogEntry { version: number; method: string; at: string }
interface DiffOp { op: 'add' | 'remove' | 'replace'; path: string; value?: JSONValue }
interface InstanceSummary { id: string; className: string; description: string; versions: number; created: string }

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

// ── instance execution (method calls — always in-page, see file header) ─────

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
  Object.assign(inst, state ?? {});
  const result = impl.call(inst, arg);
  if (result && typeof (result as { then?: unknown }).then === 'function') {
    throw new Error('async methods are not supported by this room — keep methods synchronous');
  }
  return { state: snapshot(inst), result: result === undefined ? null : JSON.parse(JSON.stringify(result)) };
}

// ── ids (local backend only — the companion backend lets the server resolve prefixes) ─

function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── tiny JSON-patch-ish diff (RFC 6902 flavoured, not fully compliant; used by the local backend) ──

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

// ── backend abstraction ──────────────────────────────────────────────────────
// Everything the terminal needs from a store, implemented once against
// localStorage (always available) and once against the companion's real
// @johnhenry/objectify routes (when it's running). Class-method *execution*
// never goes through here (see file header) — only state storage/versioning.

interface Backend {
  readonly kind: 'local' | 'companion';
  create(description: string, className: string): Promise<string>;
  list(): Promise<InstanceSummary[]>;
  inspect(id: string): Promise<InstanceSummary>;
  destroy(id: string): Promise<string>;
  get(id: string, version?: number): Promise<JSONValue>;
  /** Writes a new version. `method` is preserved verbatim by the local backend;
   *  the companion backend always logs it as "set" (a real limitation of
   *  ObjectRef.set() — see file header). */
  persistWrite(id: string, method: string, state: JSONValue): Promise<void>;
  log(id: string): Promise<LogEntry[]>;
  diff(id: string, v1: number, v2: number): Promise<DiffOp[]>;
  rewind(id: string, version: number): Promise<{ rewoundTo: number; newVersion: number }>;
  fork(id: string, at?: number): Promise<string>;
}

interface VersionRec { version: number; method: string; at: number; state: JSONValue }
interface InstanceRec { id: string; className: string; description: string; createdAt: number; versions: VersionRec[] }

const STORAGE_KEY = 'orrery:objectify:instances:v1';

function shortIdFor(id: string, all: InstanceRec[]): string {
  for (let len = 4; len <= id.length; len++) {
    const p = id.slice(0, len);
    if (all.filter((o) => o.id.startsWith(p)).length === 1) return p;
  }
  return id;
}

function resolveRec(prefix: string, all: InstanceRec[]): InstanceRec {
  if (!prefix) throw new Error('missing object id');
  const matches = all.filter((o) => o.id.startsWith(prefix));
  if (matches.length === 0) throw new Error(`no object matching "${prefix}"`);
  if (matches.length > 1) throw new Error(`ambiguous id "${prefix}" — ${matches.length} matches`);
  return matches[0];
}

/** In-page stand-in: "SQLite" is localStorage; ids/diff/rewind/fork reimplemented locally. */
function createLocalBackend(): Backend {
  let instances: InstanceRec[] = [];
  try {
    instances = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    instances = [];
  }
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(instances));
    } catch {
      /* ignore quota errors */
    }
  };
  return {
    kind: 'local',
    async create(description, className) {
      const id = newId();
      const rec: InstanceRec = {
        id,
        className: className || '',
        description,
        createdAt: Date.now(),
        versions: [{ version: 1, method: 'create', at: Date.now(), state: null }],
      };
      instances = [...instances, rec];
      save();
      return shortIdFor(id, instances);
    },
    async list() {
      return instances.map((r) => ({
        id: shortIdFor(r.id, instances),
        className: r.className,
        description: r.description,
        versions: r.versions.length,
        created: new Date(r.createdAt).toISOString(),
      }));
    },
    async inspect(prefix) {
      const rec = resolveRec(prefix, instances);
      return {
        id: shortIdFor(rec.id, instances),
        className: rec.className,
        description: rec.description,
        versions: rec.versions.length,
        created: new Date(rec.createdAt).toISOString(),
      };
    },
    async destroy(prefix) {
      const rec = resolveRec(prefix, instances);
      const sid = shortIdFor(rec.id, instances);
      instances = instances.filter((r) => r.id !== rec.id);
      save();
      return sid;
    },
    async get(prefix, version) {
      const rec = resolveRec(prefix, instances);
      if (version !== undefined) {
        const v = rec.versions.find((x) => x.version === version);
        if (!v) throw new Error(`version ${version} not found`);
        return v.state;
      }
      return rec.versions[rec.versions.length - 1].state;
    },
    async persistWrite(prefix, method, state) {
      const rec = resolveRec(prefix, instances);
      rec.versions.push({ version: rec.versions.length + 1, method, at: Date.now(), state });
      save();
    },
    async log(prefix) {
      const rec = resolveRec(prefix, instances);
      return rec.versions.map((v) => ({ version: v.version, method: v.method, at: new Date(v.at).toISOString() }));
    },
    async diff(prefix, v1, v2) {
      const rec = resolveRec(prefix, instances);
      const a = rec.versions.find((v) => v.version === v1);
      const b = rec.versions.find((v) => v.version === v2);
      if (!a || !b) throw new Error('version not found');
      if (a.state === null || b.state === null) {
        throw new Error('no diff available: one of these versions has no state yet (a fresh "create" starts with none)');
      }
      return diffValues(a.state, b.state);
    },
    async rewind(prefix, version) {
      const rec = resolveRec(prefix, instances);
      const target = rec.versions.find((v) => v.version === version);
      if (!target) throw new Error(`version ${version} not found`);
      const newVersion = rec.versions.length + 1;
      rec.versions.push({ version: newVersion, method: 'rewind', at: Date.now(), state: target.state });
      save();
      return { rewoundTo: target.version, newVersion };
    },
    async fork(prefix, at) {
      const rec = resolveRec(prefix, instances);
      const source = at !== undefined ? rec.versions.find((v) => v.version === at) : rec.versions[rec.versions.length - 1];
      if (!source) throw new Error('version not found');
      const id = newId();
      const forked: InstanceRec = {
        id,
        className: rec.className,
        description: rec.description,
        createdAt: Date.now(),
        versions: [{ version: 1, method: 'fork', at: Date.now(), state: source.state }],
      };
      instances = [...instances, forked];
      save();
      return shortIdFor(id, instances);
    },
  };
}

/** Real @johnhenry/objectify over the companion's HTTP routes (server/demos/objectify.mjs). */
function createCompanionBackend(base: string): Backend {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error || `companion returned ${res.status}`);
    return j as T;
  }
  const summarize = (r: { shortId: string; class: string | null; description: string | null; versions: number; createdAt: string }): InstanceSummary => ({
    id: r.shortId,
    className: r.class || '',
    description: r.description || '',
    versions: r.versions,
    created: r.createdAt,
  });
  return {
    kind: 'companion',
    async create(description, className) {
      const { id } = await call<{ id: string }>('POST', '/objectify/objects', { description, class: className || undefined });
      return id;
    },
    async list() {
      const rows = await call<Array<{ shortId: string; class: string | null; description: string | null; versions: number; createdAt: string }>>('GET', '/objectify/objects');
      return rows.map(summarize);
    },
    async inspect(id) {
      const r = await call<{ shortId: string; class: string | null; description: string | null; versions: number; createdAt: string }>('GET', `/objectify/objects/${encodeURIComponent(id)}`);
      return summarize(r);
    },
    async destroy(id) {
      await call('DELETE', `/objectify/objects/${encodeURIComponent(id)}`);
      return id;
    },
    async get(id, version) {
      const qs = version !== undefined ? `?version=${version}` : '';
      return call('GET', `/objectify/objects/${encodeURIComponent(id)}/state${qs}`);
    },
    async persistWrite(id, _method, state) {
      await call('PUT', `/objectify/objects/${encodeURIComponent(id)}/state`, state);
    },
    async log(id) {
      return call<LogEntry[]>('GET', `/objectify/objects/${encodeURIComponent(id)}/log`);
    },
    async diff(id, v1, v2) {
      return call<DiffOp[]>('GET', `/objectify/objects/${encodeURIComponent(id)}/diff?v1=${v1}&v2=${v2}`);
    },
    async rewind(id, version) {
      return call('POST', `/objectify/objects/${encodeURIComponent(id)}/rewind`, { version });
    },
    async fork(id, at) {
      const { id: forkedId } = await call<{ id: string }>('POST', `/objectify/objects/${encodeURIComponent(id)}/fork`, at === undefined ? {} : { at });
      return forkedId;
    },
  };
}

// ── command dispatch ─────────────────────────────────────────────────────

interface Ctx {
  getClass: () => ClassInfo | null;
  backend: Backend;
}

// Two lines per command (command on its own line, description indented
// underneath) rather than one padded line with the description in a fixed
// right-hand column — a single wide `pre` line put the whole description
// column off-screen at phone width, leaving only the command visible
// (issue's objectify P1: "terminal help descriptions are completely
// off-screen"). Two short lines wrap/read fine at any viewport width.
const COMMANDS: Array<[string, string]> = [
  ['create [description] [--class=Name]', 'create a new object'],
  ['list', 'list objects'],
  ['inspect <id>', 'object metadata'],
  ['destroy <id>', 'delete an object + history'],
  ['use <id> get [--at=<v>]', 'read current (or pinned) state'],
  ["use <id> set '<json>'", 'replace state entirely'],
  ['use <id> help', 'list methods on the class'],
  ["use <id> <method> '<json>'", 'call a method (or -p:key val ...)'],
  ['log <id>', 'version history'],
  ['diff <id> <v1> <v2>', 'JSON patch between two versions'],
  ['rewind <id> <version>', 'restore a previous version'],
  ['fork <id> [--at=<v>]', 'copy into a new independent object'],
];

function helpText(cls: ClassInfo | null, backendKind: 'local' | 'companion'): string {
  const lines = [
    `objectify — write a class, get a versioned CLI. [${backendKind === 'companion' ? 'real store via companion' : 'in-page emulation'}] commands:`,
  ];
  for (const [cmd, desc] of COMMANDS) {
    lines.push(`  ${cmd}`, `      ${desc}`);
  }
  if (cls) {
    lines.push('', `class "${cls.name}" loaded — reflected methods (always run in-page):`);
    for (const m of cls.methods) lines.push(`  use <id> ${m.name} {${m.params.join(', ')}}`);
  } else {
    lines.push('', '(no class loaded — write one on the left, or pick a preset)');
  }
  return lines.join('\n');
}

async function runCommand(raw: string, ctx: Ctx): Promise<string> {
  let tokens = tokenize(raw.trim());
  if (tokens[0] === 'objectify') tokens = tokens.slice(1);
  if (tokens.length === 0) return '';
  const [cmd, ...rest] = tokens;
  const backend = ctx.backend;
  switch (cmd) {
    case 'help':
      return helpText(ctx.getClass(), backend.kind);
    case 'classes': {
      const cls = ctx.getClass();
      return JSON.stringify(
        cls ? [{ name: cls.name, lang: 'JavaScript (in-page)', methods: cls.methods.map((m) => m.name) }] : [],
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
      const id = await backend.create(description, className || '');
      // A fresh object always starts with no state (version 1, method "create") —
      // that's the real package's own model. If a matching class is loaded,
      // seed its instantiated fields as an immediate follow-up version.
      if (className && cls) await backend.persistWrite(id, 'init', instantiate(cls));
      return JSON.stringify(id);
    }
    case 'list': {
      const list = await backend.list();
      return JSON.stringify(
        list.map((r) => ({ id: r.id, class: r.className || null, description: r.description || null, versions: r.versions, created: r.created })),
      );
    }
    case 'inspect': {
      const r = await backend.inspect(rest[0]);
      return JSON.stringify({ id: r.id, class: r.className || null, description: r.description || null, versions: r.versions, createdAt: r.created });
    }
    case 'destroy': {
      const id = await backend.destroy(rest[0]);
      return JSON.stringify({ destroyed: id });
    }
    case 'log': {
      return JSON.stringify(await backend.log(rest[0]));
    }
    case 'diff': {
      const v1 = Number(rest[1]);
      const v2 = Number(rest[2]);
      if (!Number.isFinite(v1) || !Number.isFinite(v2)) throw new Error('usage: diff <id> <v1> <v2>');
      return JSON.stringify(await backend.diff(rest[0], v1, v2));
    }
    case 'rewind': {
      const version = Number(rest[1]);
      if (!Number.isFinite(version)) throw new Error('usage: rewind <id> <version>');
      return JSON.stringify(await backend.rewind(rest[0], version));
    }
    case 'fork': {
      const atFlag = rest.find((t) => t.startsWith('--at='));
      const at = atFlag ? Number(atFlag.slice(5)) : undefined;
      const id = await backend.fork(rest[0], at);
      return JSON.stringify(id);
    }
    case 'use': {
      const [idPrefix, method, ...argTokens] = rest;
      if (!idPrefix || !method) throw new Error('usage: use <id> <method> [input]');
      if (method === 'get') {
        const atFlag = argTokens.find((t) => t.startsWith('--at='));
        const version = atFlag ? Number(atFlag.slice(5)) : undefined;
        return JSON.stringify(await backend.get(idPrefix, version));
      }
      if (method === 'set') {
        const jsonTok = argTokens.find((t) => !t.startsWith('-'));
        if (!jsonTok) throw new Error("usage: use <id> set '<json>'");
        const next = JSON.parse(jsonTok);
        await backend.persistWrite(idPrefix, 'set', next);
        return JSON.stringify(next);
      }
      const rec = await backend.inspect(idPrefix);
      if (method === 'help') {
        const cls = ctx.getClass();
        if (!cls || cls.name !== rec.className) throw new Error(`class "${rec.className}" isn't loaded in the editor`);
        return cls.methods.map((m) => `${m.name}({${m.params.join(', ')}})`).join('\n');
      }
      const cls = ctx.getClass();
      if (!cls) throw new Error('no class loaded — write or pick a preset on the left first');
      if (cls.name !== rec.className) throw new Error(`object's class is "${rec.className || '(none)'}", editor holds "${cls.name}"`);
      const cur = await backend.get(idPrefix);
      const arg = buildArg(argTokens);
      const { state, result } = callMethod(cls, cur, method, arg);
      // Mirrors the real tool: a version is only written when the method actually
      // mutated `this` — a pure read like `pending()` returns a result without
      // adding to the history.
      if (JSON.stringify(state) !== JSON.stringify(cur ?? {})) {
        await backend.persistWrite(idPrefix, method, state);
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
  pkg: '@johnhenry/objectify',
  hue: 70,
  blurb: 'Write a class, get a versioned, stateful CLI. Real @johnhenry/objectify (SQLite) when the companion runs; an in-browser emulation otherwise.',
  docs: 'https://opensource.johnhenry.me/objectify/',

  async mount(host: HTMLElement) {
    const cleanups: Array<() => void> = [];
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, ev: K | string, fn: (e: Event) => void) => {
      el.addEventListener(ev, fn as EventListener);
      cleanups.push(() => el.removeEventListener(ev, fn as EventListener));
    };
    let disposed = false;

    const state = readState<RoomState>({ preset: 'TaskList', instance: '' });

    const root = document.createElement('div');
    root.className = 'pg-objectify';
    root.innerHTML = `
      <div id="ob-banner"></div>

      <div class="ob-layout">
        <div class="ob-layout-left">
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

          <div class="panel ob-col">
            <div class="ob-detail-head">
              <strong>State &amp; history</strong>
              <button class="btn small" id="ob-copy">copy link</button>
            </div>
            <div class="stat" id="ob-store-stat">objects <b id="ob-count">0</b></div>
            <div class="ob-instances" id="ob-instances"></div>
            <div id="ob-detail"></div>
          </div>
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
      </div>
    `;
    host.innerHTML = '';
    host.appendChild(root);

    // ---- element refs ----
    const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    const bannerEl = $<HTMLDivElement>('#ob-banner');
    const sourceEl = $<HTMLTextAreaElement>('#ob-source');
    const presetsEl = $<HTMLDivElement>('#ob-presets');
    const parseStatEl = $<HTMLSpanElement>('#ob-parse-stat');
    const reflectionEl = $<HTMLPreElement>('#ob-reflection');
    const helpEl = $<HTMLPreElement>('#ob-help');
    const scrollbackEl = $<HTMLDivElement>('#ob-scrollback');
    const inputEl = $<HTMLInputElement>('#ob-input');
    const suggestEl = $<HTMLDivElement>('#ob-suggest');
    const storeStatEl = $<HTMLElement>('#ob-store-stat');
    const instancesEl = $<HTMLDivElement>('#ob-instances');
    const detailEl = $<HTMLDivElement>('#ob-detail');
    const copyBtn = $<HTMLButtonElement>('#ob-copy');

    // ---- backend selection ----
    let companion: Companion | null = null;
    let backend: Backend = createLocalBackend();

    function renderBanner() {
      bannerEl.innerHTML = '';
      bannerEl.appendChild(
        companionBanner(
          companion,
          'objectify',
          'this room "SQLite" is localStorage and ids/diff/rewind/fork are reimplemented locally — behaviourally the same model as the real @johnhenry/objectify package.',
        ),
      );
      const note = document.createElement('div');
      note.className = 'stat';
      note.style.marginTop = '4px';
      note.textContent = backend.kind === 'companion'
        ? 'class-method calls (use <id> <method>) still run in-page — see the room header comment for why — but every version they write is persisted through the real store.'
        : '';
      if (note.textContent) bannerEl.appendChild(note);
    }

    // ---- planet state ----
    const cls: { current: ClassInfo | null } = { current: null };
    let selectedInstance: string = state.instance;
    let selectedVersion: number | null = null;
    let instanceCache: InstanceSummary[] = [];
    const history: string[] = [];
    let historyIdx = -1;

    const ctx: Ctx = { getClass: () => cls.current, backend };

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
      helpEl.textContent = helpText(cls.current, backend.kind);
    }

    async function refreshInstances() {
      try {
        instanceCache = await backend.list();
      } catch (e) {
        instanceCache = [];
        print(JSON.stringify({ error: `could not list objects: ${(e as Error).message}` }), 'err');
      }
      storeStatEl.innerHTML = `objects <b>${instanceCache.length}</b>${backend.kind === 'companion' ? ' · persisted by the real store (companion)' : ' · persisted in <code>localStorage</code> (emulating SQLite)'}`;
      if (instanceCache.length === 0) {
        instancesEl.innerHTML = '<div class="ob-empty">no objects yet — try: <code>create "sprint tasks" --class=TaskList</code></div>';
      } else {
        instancesEl.innerHTML = instanceCache
          .map((r) => {
            const sel = r.id === selectedInstance ? ' sel' : '';
            return `<div class="ob-inst-row${sel}" data-id="${r.id}">
              <span class="chip">${esc(r.id)}</span>
              <span class="ob-inst-class">${esc(r.className || '(untyped)')}</span>
              <span class="ob-inst-desc">${esc(r.description || '')}</span>
              <span class="stat">v${r.versions}</span>
            </div>`;
          })
          .join('');
      }
      if (selectedInstance && !instanceCache.some((r) => r.id === selectedInstance)) selectedInstance = '';
      await renderDetail();
    }

    async function renderDetail() {
      if (!selectedInstance) {
        detailEl.innerHTML = '';
        return;
      }
      const summary = instanceCache.find((r) => r.id === selectedInstance);
      if (!summary) {
        detailEl.innerHTML = '';
        return;
      }
      let log: LogEntry[];
      try {
        log = await backend.log(selectedInstance);
      } catch (e) {
        detailEl.innerHTML = `<pre class="code">${esc(JSON.stringify({ error: (e as Error).message }))}</pre>`;
        return;
      }
      if (log.length === 0) {
        detailEl.innerHTML = '';
        return;
      }
      const latest = log[log.length - 1];
      const vSel = selectedVersion ?? latest.version;
      const chosenEntry = log.find((v) => v.version === vSel) ?? latest;

      let chosenState: JSONValue = null;
      let stateError: string | null = null;
      try {
        chosenState = await backend.get(selectedInstance, chosenEntry.version);
      } catch (e) {
        stateError = (e as Error).message;
      }

      let ops: DiffOp[] | null = null;
      let diffError: string | null = null;
      if (chosenEntry.version > 1) {
        try {
          ops = await backend.diff(selectedInstance, chosenEntry.version - 1, chosenEntry.version);
        } catch (e) {
          diffError = (e as Error).message;
        }
      }

      detailEl.innerHTML = `
        <div class="ob-detail-head">
          <span class="chip">${esc(selectedInstance)}</span>
          <span>${esc(summary.className || '(untyped)')}</span>
          <button class="btn small" data-act="fork">fork v${chosenEntry.version}</button>
          ${chosenEntry.version !== latest.version ? `<button class="btn small" data-act="rewind">rewind to v${chosenEntry.version}</button>` : ''}
        </div>
        <pre class="code ob-state">${stateError ? esc(stateError) : esc(JSON.stringify(chosenState, null, 2))}</pre>
        <strong class="ob-vh-label">version history</strong>
        <div class="ob-versions">
          ${log
            .slice()
            .reverse()
            .map(
              (v) => `<div class="ob-version-row${v.version === chosenEntry.version ? ' sel' : ''}" data-v="${v.version}">
                <span class="chip">v${v.version}</span>
                <span class="ob-v-method">${esc(v.method)}</span>
                <span class="stat">${esc(v.at)}</span>
              </div>`,
            )
            .join('')}
        </div>
        <strong class="ob-vh-label">diff from v${chosenEntry.version - 1 < 1 ? '∅' : chosenEntry.version - 1}</strong>
        <div class="ob-diff">
          ${diffError
            ? `<span class="stat">${esc(diffError)}</span>`
            : !ops
              ? '<span class="stat">(object created here — no prior version)</span>'
              : ops.length === 0
                ? '<span class="stat">(no change)</span>'
                : ops.map((o) => `<div class="ob-diff-row ob-op-${o.op}">${o.op} <code>${esc(o.path)}</code>${'value' in o ? ' → ' + esc(JSON.stringify(o.value)) : ''}</div>`).join('')}
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

    async function execute(line: string) {
      if (!line.trim()) return;
      print(line, 'cmd');
      history.push(line);
      historyIdx = history.length;
      try {
        const out = await runCommand(line, ctx);
        if (out) print(out, 'out');
        selectedVersion = null;
        await refreshInstances();
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
        return instanceCache.map((r) => r.id).filter((sid) => sid.startsWith(partial));
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
    renderBanner();

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
        const line = inputEl.value;
        inputEl.value = '';
        renderSuggestions();
        void execute(line);
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
      void refreshInstances().then(persistUiState);
    });

    on(detailEl, 'click', (e) => {
      const t = e.target as HTMLElement;
      const vrow = t.closest<HTMLElement>('.ob-version-row');
      if (vrow) {
        selectedVersion = Number(vrow.dataset.v);
        void renderDetail();
        return;
      }
      const actBtn = t.closest<HTMLElement>('[data-act]');
      if (actBtn && selectedInstance) {
        const v = selectedVersion;
        const sid = selectedInstance;
        if (actBtn.dataset.act === 'fork') void execute(v ? `fork ${sid} --at=${v}` : `fork ${sid}`);
        else if (actBtn.dataset.act === 'rewind' && v) void execute(`rewind ${sid} ${v}`);
      }
    });

    on(copyBtn, 'click', () => {
      copyLink().then(() => {
        copyBtn.textContent = 'copied!';
        setTimeout(() => (copyBtn.textContent = 'copy link'), 1200);
      });
    });

    // ---- probe the companion, then decide the backend, then seed a default state ----
    companion = await probeCompanion();
    if (disposed) return;
    if (hasDemo(companion, 'objectify')) {
      backend = createCompanionBackend(companion!.base);
      ctx.backend = backend;
      helpEl.textContent = helpText(cls.current, backend.kind);
    }
    renderBanner();

    // ---- deep-linked instance selection + seed a default state so the planet is impressive with zero input ----
    await refreshInstances();
    if (disposed) return;
    if (instanceCache.length === 0 && cls.current) {
      const seedClass = cls.current;
      await execute(`create "sprint tasks" --class=${seedClass.name}`);
      const sid = instanceCache[0]?.id;
      if (sid) {
        await execute(`use ${sid} add -p:title "write the demo" -p:priority 1`);
        await execute(`use ${sid} add -p:title "ship it"`);
        selectedInstance = sid;
        await refreshInstances();
      }
    }

    return () => {
      disposed = true;
      for (const fn of cleanups) fn();
      root.remove();
    };
  },
};

export default playground;
