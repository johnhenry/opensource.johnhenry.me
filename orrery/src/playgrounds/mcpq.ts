import type { Playground } from '../registry';
import { MCPClient, argsHash, runInterceptors, type CacheKey, type CacheEntry, type ConnectionConfig, type RequestInterceptor, type Operation } from '@johnhenry/mcp-query';
import { authorize } from '@johnhenry/mcp-query/server';
import { readState, writeState, copyLink } from '../state';
import './mcpq.css';
// mcp-gate's package entry resolves to its browser-safe subset (exports["."].browser →
// dist/index.browser.js: compilePolicy, redact, …) under Vite's browser condition.
import { compilePolicy, redact as gateRedact } from '@johnhenry/mcp-gate';

/* ────────────────────────────────────────────────────────────────────────────
 * Agent Query — mcp-query's reactive cache + mcp-gate's policy compiler, driven
 * against an MCP server that lives entirely in this page. The server speaks raw
 * JSON-RPC over a hand-rolled Transport object (start/send/close/onmessage), so
 * every byte the real SDK client sends is visible in the timeline.
 * ──────────────────────────────────────────────────────────────────────────── */

type Transport = ReturnType<ConnectionConfig['transport']>;
type Json = Record<string, any>;
interface Msg { jsonrpc: '2.0'; id?: number | string; method?: string; params?: any; result?: any; error?: { code: number; message: string } }

const SERVER = 'demo';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const globRe = (g: string) => new RegExp('^' + g.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

/* ───────────────────────────── the in-page MCP server ───────────────────────────── */

interface ToolDef {
  name: string; description: string; inputSchema: Json;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; title?: string };
  run: (args: Json) => Promise<Json>;
}
class RpcError extends Error { constructor(public code: number, msg: string) { super(msg); } }

const CITIES = ['Tokyo', 'Lagos', 'Reykjavik', 'Lima', 'Oslo', 'Denver'];
const SKIES = ['clear', 'scattered clouds', 'drizzle', 'fog', 'thunderstorms', 'light snow', 'overcast', 'breezy'];
function hashStr(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

class FakeServer {
  notes: { id: string; text: string; at: number }[] = [
    { id: 'n1', text: 'MCP servers are just typed capability surfaces', at: Date.now() - 600_000 },
    { id: 'n2', text: 'resources/updated invalidates the cache for free', at: Date.now() - 120_000 },
  ];
  bonus = false;
  latency = 90;
  rejectNextWrite = false;
  subs = new Set<string>();
  private t?: Transport & { onmessage?: (m: any) => void; onclose?: () => void };
  private ticker: number;
  private seq = 0;
  constructor(private wire: (dir: 'c2s' | 's2c', m: Msg) => void) {
    // A "live" resource: while someone is subscribed, the server announces a change every 5s.
    this.ticker = window.setInterval(() => { if (this.subs.has('clock://now')) this.notify('notifications/resources/updated', { uri: 'clock://now' }); }, 5000);
  }
  stop() { clearInterval(this.ticker); }

  tools(): ToolDef[] {
    const list: ToolDef[] = [
      { name: 'echo', description: 'Echo text back verbatim (try an email or SSN: the gate redacts it).', annotations: { readOnlyHint: true, idempotentHint: true },
        inputSchema: { type: 'object', properties: { text: { type: 'string', default: 'ping from alice@example.com, ssn 123-45-6789' } }, required: ['text'] },
        run: async (a) => ({ content: [{ type: 'text', text: String(a.text ?? '') }], ttlMs: 60_000 }) },
      { name: 'add', description: 'Add two numbers. Pure, idempotent, cacheable.', annotations: { readOnlyHint: true, idempotentHint: true },
        inputSchema: { type: 'object', properties: { a: { type: 'number', default: 2 }, b: { type: 'number', default: 40 } }, required: ['a', 'b'] },
        run: async (a) => { const sum = Number(a.a) + Number(a.b); return { content: [{ type: 'text', text: String(sum) }], structuredContent: { sum }, ttlMs: 120_000 }; } },
      { name: 'slow_search', description: 'Full-text search with real latency. Watch the entry sit in "fetching".', annotations: { readOnlyHint: true },
        inputSchema: { type: 'object', properties: { query: { type: 'string', default: 'reactive cache' }, delayMs: { type: 'integer', default: 1800, minimum: 0, maximum: 6000 } }, required: ['query'] },
        run: async (a) => {
          await sleep(Number(a.delayMs ?? 1800));
          const q = String(a.query ?? '');
          const hits = ['TanStack Query keys', 'RTK Query tags', 'LSP dynamic registration', 'urql document cache', 'MCP resources/updated'].filter((_, i) => (hashStr(q) >> i) & 1 || i === 0);
          return { content: [{ type: 'text', text: JSON.stringify({ query: q, hits }) }], structuredContent: { query: q, hits }, ttlMs: 45_000 };
        } },
      { name: 'flaky_call', description: 'An unreliable upstream: fails 30% of the time with a JSON-RPC error.', annotations: { readOnlyHint: true },
        inputSchema: { type: 'object', properties: { payload: { type: 'string', default: 'hello?' } } },
        run: async (a) => {
          await sleep(250);
          if (Math.random() < 0.3) throw new RpcError(-32000, 'flaky_call: upstream timed out (simulated 30% failure)');
          return { content: [{ type: 'text', text: `ok: ${a.payload ?? ''}` }], ttlMs: 15_000 };
        } },
      { name: 'get_weather', description: 'Fake current conditions for a city. The server hints ttlMs=20s (SEP-2549).', annotations: { readOnlyHint: true },
        inputSchema: { type: 'object', properties: { city: { type: 'string', enum: CITIES, default: 'Tokyo' }, units: { type: 'string', enum: ['C', 'F'], default: 'C' } }, required: ['city'] },
        run: async (a) => {
          const city = String(a.city ?? 'Tokyo'); const h = hashStr(city);
          const c = Math.round(((h % 30) - 4 + Math.sin(Date.now() / 20_000 + h) * 3) * 10) / 10;
          const temp = a.units === 'F' ? Math.round((c * 9 / 5 + 32) * 10) / 10 : c;
          const sky = SKIES[(h + Math.floor(Date.now() / 40_000)) % SKIES.length];
          const data = { city, temp, units: a.units ?? 'C', sky, humidity: 30 + (h % 60), observedAt: new Date().toISOString().slice(11, 19) };
          return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, ttlMs: 20_000 };
        } },
      { name: 'add_note', description: 'Mutation: append a note to notes://inbox, then emit resources/updated. Slow on purpose so the optimistic patch is visible.',
        inputSchema: { type: 'object', properties: { text: { type: 'string', default: 'optimistic updates feel instant' } }, required: ['text'] },
        run: async (a) => {
          await sleep(1100);
          if (this.rejectNextWrite) { this.rejectNextWrite = false; this.onChange?.(); return { isError: true, content: [{ type: 'text', text: 'add_note rejected by server (simulated): the optimistic patch rolls back' }] }; }
          const note = { id: 'n' + (++this.seq + 2), text: String(a.text ?? '').slice(0, 120), at: Date.now() };
          this.notes.push(note);
          queueMicrotask(() => this.notify('notifications/resources/updated', { uri: 'notes://inbox' }));
          return { content: [{ type: 'text', text: `saved note ${note.id}` }] };
        } },
      { name: 'delete_everything', description: 'Wipes every note. Annotated destructiveHint, so a sane gate blocks it before it reaches the server.', annotations: { destructiveHint: true },
        inputSchema: { type: 'object', properties: { confirm: { type: 'boolean', default: true } } },
        run: async () => {
          const n = this.notes.length; this.notes = [];
          queueMicrotask(() => this.notify('notifications/resources/updated', { uri: 'notes://inbox' }));
          return { content: [{ type: 'text', text: `deleted ${n} notes. Hope the gate meant to allow that.` }] };
        } },
    ];
    if (this.bonus) list.push({ name: 'roll_dice', description: 'Registered at runtime. Appeared via notifications/tools/list_changed.', annotations: { readOnlyHint: false },
      inputSchema: { type: 'object', properties: { sides: { type: 'integer', default: 20, minimum: 2, maximum: 100 } } },
      run: async (a) => ({ content: [{ type: 'text', text: `rolled ${1 + Math.floor(Math.random() * Number(a.sides ?? 20))}` }] }) });
    return list;
  }
  onChange?: () => void;

  resources() {
    return [
      { uri: 'notes://inbox', name: 'Notes inbox', mimeType: 'application/json', description: 'Mutable list, written by add_note / delete_everything' },
      { uri: 'clock://now', name: 'Server clock', mimeType: 'text/plain', description: 'Emits resources/updated every 5s while subscribed' },
      { uri: 'config://server', name: 'Server config', mimeType: 'application/json', description: 'Static' },
    ];
  }
  readResource(uri: string): Json {
    if (uri === 'notes://inbox') return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(this.notes) }], ttlMs: 60_000 };
    if (uri === 'clock://now') return { contents: [{ uri, mimeType: 'text/plain', text: new Date().toISOString().slice(11, 19) + 'Z' }], ttlMs: 5_000 };
    if (uri === 'config://server') return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ name: 'orrery-demo', latencyMs: this.latency, tools: this.tools().length }) }] };
    const m = /^weather:\/\/(.+)$/.exec(uri);
    if (m) return { contents: [{ uri, mimeType: 'text/plain', text: `station ${decodeURIComponent(m[1])}: nominal` }] };
    throw new RpcError(-32002, `Resource not found: ${uri}`);
  }

  /** mcp-query's ConnectionConfig.transport factory: a fresh Transport per (re)connect. */
  transport = (): Transport => {
    const t: any = {
      start: async () => {},
      close: async () => { if (this.t === t) this.t = undefined; t.onclose?.(); },
      send: async (m: Msg) => { this.wire('c2s', m); void this.handle(m); },
    };
    this.t = t;
    return t as Transport;
  };
  private deliver(m: Msg) { const t = this.t; if (!t) return; this.wire('s2c', m); t.onmessage?.(m); }
  notify(method: string, params?: Json) { this.deliver({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }); }

  toggleBonusTool() { this.bonus = !this.bonus; this.notify('notifications/tools/list_changed'); }

  private async handle(m: Msg) {
    if (m.id === undefined) { // notification from the client
      return;
    }
    await sleep(this.latency * (0.6 + Math.random() * 0.8));
    try {
      const result = await this.dispatch(m.method!, m.params ?? {});
      this.deliver({ jsonrpc: '2.0', id: m.id, result });
    } catch (e) {
      const err = e instanceof RpcError ? e : new RpcError(-32603, String((e as Error).message ?? e));
      this.deliver({ jsonrpc: '2.0', id: m.id, error: { code: err.code, message: err.message } });
    }
  }
  private async dispatch(method: string, p: Json): Promise<Json> {
    switch (method) {
      case 'initialize':
        return { protocolVersion: p.protocolVersion ?? '2025-11-25', serverInfo: { name: 'orrery-in-page', version: '1.0.0' },
          capabilities: { tools: { listChanged: true }, resources: { subscribe: true, listChanged: true }, prompts: { listChanged: false } },
          instructions: 'A fake MCP server living in this browser tab.' };
      case 'ping': return {};
      case 'tools/list': return { tools: this.tools().map(({ run, ...t }) => t) };
      case 'tools/call': {
        const tool = this.tools().find((t) => t.name === p.name);
        if (!tool) throw new RpcError(-32602, `Unknown tool: ${p.name}`);
        return tool.run(p.arguments ?? {});
      }
      case 'resources/list': return { resources: this.resources() };
      case 'resources/templates/list': return { resourceTemplates: [{ uriTemplate: 'weather://{city}', name: 'Weather station' }] };
      case 'resources/read': return this.readResource(String(p.uri));
      case 'resources/subscribe': this.subs.add(String(p.uri)); this.onChange?.(); return {};
      case 'resources/unsubscribe': this.subs.delete(String(p.uri)); this.onChange?.(); return {};
      case 'prompts/list': return { prompts: [
        { name: 'summarize_notes', description: 'Summarize the inbox', arguments: [{ name: 'style', required: false }] },
        { name: 'weather_brief', description: 'One-line forecast', arguments: [{ name: 'city', required: true }] },
      ] };
      case 'prompts/get': return { messages: [{ role: 'user', content: { type: 'text', text: `(${p.name}) ${JSON.stringify(p.arguments ?? {})}` } }] };
      default: throw new RpcError(-32601, `Method not found: ${method}`);
    }
  }
}

/* ───────────────────────────── policy ───────────────────────────── */

interface PolicyDoc { allow?: string[]; deny?: string[]; denyDestructive?: boolean; approve?: string[]; redact?: { pattern: string; replacement?: string }[] }
const POLICY_KEYS = ['allow', 'deny', 'denyDestructive', 'approve', 'redact'];
const PRESETS: Record<string, PolicyDoc> = {
  'Sensible default': { denyDestructive: true, approve: ['demo.flaky_call'], redact: [{ pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]+', replacement: '[EMAIL]' }, { pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b', replacement: '[SSN]' }] },
  'Allow-list (reads only)': { allow: ['demo.echo', 'demo.add', 'demo.get_weather', 'demo.slow_search'], denyDestructive: true },
  'Human approves writes': { denyDestructive: true, approve: ['demo.add_note', 'demo.roll_dice', 'demo.flaky_call'] },
  'YOLO (allow all)': {},
};
const DEFAULT_POLICY = JSON.stringify(PRESETS['Sensible default'], null, 2);
const DEFAULTS = { tool: 'get_weather', policy: DEFAULT_POLICY, args: '' };

/* ───────────────────────────── timeline events ───────────────────────────── */

interface Ev { n: number; t: number; lane: 'c2s' | 's2c' | 'local'; kind: 'req' | 'res' | 'err' | 'note' | 'gate' | 'cache' | 'audit'; label: string; detail?: string; ms?: number }

/* ───────────────────────────── the planet ───────────────────────────── */

const playground: Playground = {
  id: 'mcpq',
  title: 'Agent Query',
  pkg: '@johnhenry/mcp-query',
  hue: 205,
  blurb: 'A reactive, cached MCP client with a policy gate, inspected live against an in-page server.',
  docs: 'https://opensource.johnhenry.me/agent-query/',
  async mount(host) {
    const disposers: (() => void)[] = [];
    let dead = false;
    const st = readState(DEFAULTS);

    const root = document.createElement('div');
    root.className = 'pg-mcpq';
    host.appendChild(root);
    root.innerHTML = TEMPLATE;
    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

    /* ── event timeline store ── */
    const events: Ev[] = [];
    let evN = 0;
    const pendingReq = new Map<string, { t: number; method: string }>();
    const tl = $('.mq-tl-list');
    const lanes = $('.mq-lanes');
    let packetsInFlight = 0;
    function pushEv(e: Omit<Ev, 'n' | 't'>) {
      const ev: Ev = { ...e, n: ++evN, t: performance.now() };
      events.push(ev);
      if (events.length > 400) events.shift();
      renderEv(ev);
      if (ev.lane !== 'local') flyPacket(ev);
    }
    const t0 = performance.now();
    function renderEv(ev: Ev) {
      const row = document.createElement('div');
      row.className = `mq-ev k-${ev.kind} l-${ev.lane}`;
      const arrow = ev.lane === 'c2s' ? 'client → server' : ev.lane === 's2c' ? 'server → client' : 'in client';
      row.innerHTML = `<span class="ts">${((ev.t - t0) / 1000).toFixed(2)}s</span><span class="dir" title="${arrow}">${ev.lane === 'c2s' ? '→' : ev.lane === 's2c' ? '←' : '•'}</span><span class="kind">${ev.kind}</span><span class="lbl">${esc(ev.label)}</span>${ev.ms != null ? `<span class="ms">${ev.ms.toFixed(0)}ms</span>` : ''}`;
      if (ev.detail) {
        row.classList.add('has-detail');
        row.addEventListener('click', () => {
          const open = row.nextElementSibling?.classList.contains('mq-ev-detail');
          if (open) row.nextElementSibling!.remove();
          else { const pre = document.createElement('pre'); pre.className = 'mq-ev-detail'; pre.textContent = ev.detail!; row.after(pre); }
        });
      }
      if (paused) return;
      tl.prepend(row);
      while (tl.childElementCount > 260) tl.lastElementChild!.remove();
    }
    function flyPacket(ev: Ev) {
      if (packetsInFlight > 24 || document.hidden) return;
      packetsInFlight++;
      const p = document.createElement('div');
      p.className = `mq-packet k-${ev.kind}`;
      p.innerHTML = `<i></i><span>${esc(ev.label.split(' ')[0])}</span>`;
      lanes.appendChild(p);
      const from = ev.lane === 'c2s' ? 9 : 91, to = ev.lane === 'c2s' ? 91 : 9;
      const top = 18 + ((ev.n * 23) % 44);
      p.style.top = top + 'px';
      const a = p.animate([{ left: from + '%', opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { left: to + '%', opacity: 0 }], { duration: 750, easing: 'cubic-bezier(.5,0,.3,1)' });
      a.onfinish = () => { p.remove(); packetsInFlight--; };
      const pillar = lanes.querySelector(ev.lane === 'c2s' ? '.pillar.server' : '.pillar.client') as HTMLElement;
      setTimeout(() => { pillar?.animate([{ boxShadow: '0 0 0 0 var(--accent)' }, { boxShadow: '0 0 18px 2px var(--accent)' }, { boxShadow: '0 0 0 0 var(--accent)' }], { duration: 400 }); }, 650);
    }
    let paused = false;

    function onWire(dir: 'c2s' | 's2c', m: Msg) {
      const idk = `${dir === 'c2s' ? 'c' : 's'}:${m.id}`;
      const detail = JSON.stringify(m, null, 2);
      if (m.method && m.id !== undefined) {
        pendingReq.set(idk, { t: performance.now(), method: m.method });
        const extra = m.method === 'tools/call' ? ` ${m.params?.name}` : m.method.startsWith('resources/') && m.params?.uri ? ` ${m.params.uri}` : '';
        pushEv({ lane: dir, kind: 'req', label: `${m.method}${extra} #${m.id}`, detail });
      } else if (m.method) {
        pushEv({ lane: dir, kind: 'note', label: `${m.method}${m.params?.uri ? ' ' + m.params.uri : ''}`, detail });
      } else {
        const reqKey = `${dir === 'c2s' ? 's' : 'c'}:${m.id}`;
        const req = pendingReq.get(reqKey); pendingReq.delete(reqKey);
        const ms = req ? performance.now() - req.t : undefined;
        const isErr = !!m.error || m.result?.isError;
        pushEv({ lane: dir, kind: isErr ? 'err' : 'res', label: `${req?.method ?? 'response'} #${m.id}${m.error ? ' ' + m.error.message : m.result?.isError ? ' isError' : ''}`, detail, ms });
      }
      stats.msgs++;
    }
    const stats = { msgs: 0 };

    /* ── server + client ── */
    const server = new FakeServer(onWire);
    disposers.push(() => server.stop());

    // Policy state
    let policyDoc: PolicyDoc = {};
    let policyErr = '';
    let chain: RequestInterceptor[] = [];
    const approvals: { id: number; op: string; args: string; resolve: (ok: boolean) => void }[] = [];
    let approvalSeq = 0;
    const approveGlobs = () => (policyDoc.approve ?? []).map(globRe);

    function setPolicy(text: string) {
      try {
        const doc = JSON.parse(text) as PolicyDoc;
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('policy must be a JSON object');
        const unknown = Object.keys(doc).filter((k) => !POLICY_KEYS.includes(k));
        if (unknown.length) throw new Error(`unknown key(s): ${unknown.join(', ')}. valid: ${POLICY_KEYS.join(', ')}`);
        const { approve, redact: redactRules, ...gateRules } = doc;
        const compiled = compilePolicy(gateRules);
        const approval: RequestInterceptor = async (op, next) => {
          if ((op.kind === 'call' || op.kind === 'query') && approveGlobs().some((re) => re.test(`${op.peer}.${op.target}`))) {
            pushEv({ lane: 'local', kind: 'gate', label: `needs-approval ${op.peer}.${op.target}: waiting for a human` });
            const ok = await new Promise<boolean>((resolve) => { approvals.push({ id: ++approvalSeq, op: `${op.peer}.${op.target}`, args: JSON.stringify(op.args ?? {}), resolve }); renderApprovals(); });
            pushEv({ lane: 'local', kind: 'gate', label: `${ok ? 'approved' : 'rejected'} ${op.peer}.${op.target}` });
            if (!ok) { const e = new Error(`Rejected by human reviewer: ${op.peer}.${op.target}`); (e as any).code = -32003; throw e; }
          }
          return next(op);
        };
        const trace: RequestInterceptor = async (op, next) => {
          if (op.kind === 'call' || op.kind === 'query') {
            const v = await compiled(authReq(op));
            pushEv({ lane: 'local', kind: 'gate', label: `${v} ${op.peer}.${op.target} (${op.kind})` });
          }
          return next(op);
        };
        chain = [trace, authorize(compiled as any), approval, ...(redactRules?.length ? [gateRedact(redactRules)] : [])];
        policyDoc = doc; policyErr = '';
      } catch (e) { policyErr = (e as Error).message; }
    }
    const authReq = (op: Operation) => ({ kind: op.kind, server: op.peer, target: op.target, args: op.args, context: op.context,
      destructive: op.def?.annotations?.destructiveHint === true, readOnly: op.def?.annotations?.readOnlyHint === true });
    const gateInterceptor: RequestInterceptor = (op, next) => runInterceptors(chain, op, next);

    const client = new MCPClient({
      servers: { [SERVER]: { transport: server.transport, maxRetries: 2 } },
      interceptors: [gateInterceptor],
      devtools: { emit: (e: any) => {
        if (e.type === 'invalidate') pushEv({ lane: 'local', kind: 'cache', label: `invalidate ${e.keys.join(', ')}` });
        else if (e.type === 'capabilities') pushEv({ lane: 'local', kind: 'cache', label: `re-listed ${e.kind} (list_changed)` });
        else if (e.type === 'server-state') pushEv({ lane: 'local', kind: 'cache', label: `connection ${e.server} → ${e.state}` });
      } },
      onCall: (a) => pushEv({ lane: 'local', kind: 'audit', label: `audit ${a.kind} ${a.target}: ${a.outcome}${a.error ? ' (' + a.error.slice(0, 60) + ')' : ''}`, ms: a.ms }),
    });
    const cache = client.cache;
    disposers.push(() => { void client.close(); });

    /* ── query helpers: a tiny vanilla useQuery ── */
    const refetchers = new Map<string, () => Promise<unknown>>();
    const kResource = (uri: string): CacheKey => ({ kind: 'resource', server: SERVER, uri });
    const kTool = (tool: string, args: Json): CacheKey => ({ kind: 'toolResult', server: SERVER, tool, argsHash: argsHash(args) });
    const readRes = (uri: string) => { refetchers.set(cache.serializeKey(kResource(uri)), () => client.readResource(uri)); return client.readResource(uri); };
    const qTool = (tool: string, args: Json) => { refetchers.set(cache.serializeKey(kTool(tool, args)), () => client.queryTool(tool, args)); return client.queryTool(tool, args); };
    /** Observe a key: +1 subscriber (drives resources/subscribe), refetch when invalidated. */
    function watch(key: CacheKey, fetch: () => Promise<unknown>, onData?: (e: CacheEntry | undefined) => void): () => void {
      refetchers.set(cache.serializeKey(key), fetch);
      const unsub = cache.subscribe(key, () => {
        const e = cache.getSnapshot(key);
        onData?.(e);
        if (e && e.isStale && e.status === 'success' && !cache.inflight(key)) fetch().catch(() => {});
      });
      if (cache.isStale(key) && !cache.inflight(key)) fetch().catch(() => {});
      onData?.(cache.getSnapshot(key));
      return unsub;
    }
    const manualWatches = new Map<string, () => void>();

    /* ── status strip ── */
    const latency = $<HTMLInputElement>('.mq-latency');
    latency.addEventListener('input', () => { server.latency = Number(latency.value); $('.mq-latency-v').textContent = latency.value + 'ms'; });
    $('.mq-listchanged').addEventListener('click', () => {
      server.toggleBonusTool();
      pushEv({ lane: 'local', kind: 'cache', label: `server ${server.bonus ? 'registered' : 'unregistered'} roll_dice; announcing tools/list_changed` });
    });
    $('.mq-inv-all').addEventListener('click', () => cache.invalidateTags([`server:${SERVER}`]));
    $('.mq-copy').addEventListener('click', async () => { await copyLink(); const b = $('.mq-copy'); b.textContent = 'copied'; setTimeout(() => (b.textContent = 'copy link'), 1200); });
    $('.mq-pause').addEventListener('click', () => { paused = !paused; $('.mq-pause').textContent = paused ? 'resume' : 'pause'; });
    $('.mq-clear').addEventListener('click', () => { tl.innerHTML = ''; });
    const tlFilters = $('.mq-tl-filters');
    tlFilters.addEventListener('change', () => {
      tlFilters.querySelectorAll<HTMLInputElement>('input').forEach((i) => tl.classList.toggle('hide-' + i.value, !i.checked));
    });

    function renderStatus() {
      const conn = client.connection(SERVER);
      const entries = cache.entriesForDevtools();
      const subs = entries.reduce((s, e) => s + e.subscribers, 0);
      $('.mq-status').innerHTML = [
        `<span class="dot s-${client.serverState(SERVER)}"></span><b>${client.serverState(SERVER)}</b> ${conn ? `· era ${conn.era}` : ''}`,
        `<span>messages <b>${stats.msgs}</b></span>`,
        `<span>cache entries <b>${entries.length}</b></span>`,
        `<span>subscribers <b>${subs}</b></span>`,
        `<span>server subs <b>${server.subs.size}</b></span>`,
        `<span>tools <b>${conn?.tools.size ?? 0}</b></span>`,
      ].join('');
    }

    /* ── cache inspector ── */
    const tbody = $('.mq-cache tbody');
    const rows = new Map<string, { tr: HTMLTableRowElement; v: number }>();
    let selectedKey = '';
    const kindLabel: Record<string, string> = { resource: 'resource', toolResult: 'tool result', toolList: 'tools/list', resourceList: 'resources/list', promptList: 'prompts/list', templateList: 'templates/list', prompt: 'prompt', task: 'task' };
    function statusOf(e: CacheEntry): string {
      if (e.status === 'fetching' || e.inflight) return 'fetching';
      if (e.status === 'error') return 'error';
      if (e.status === 'idle') return e.isOptimistic ? 'optimistic' : 'idle';
      if (e.isOptimistic) return 'optimistic';
      return cache.isStale(e.cacheKey) ? 'stale' : 'fresh';
    }
    function label(k: CacheKey): string {
      switch (k.kind) {
        case 'resource': return k.uri;
        case 'toolResult': { const args = argsCache.get(k.tool + '|' + k.argsHash); return `${k.tool}(${args ?? '#' + k.argsHash.slice(0, 8)})`; }
        default: return `${kindLabel[k.kind]}`;
      }
    }
    const argsCache = new Map<string, string>();
    const rememberArgs = (tool: string, args: Json) => argsCache.set(tool + '|' + argsHash(args), JSON.stringify(args).slice(1, -1).replace(/"/g, '').slice(0, 40));
    function renderCache() {
      const now = Date.now();
      const entries = cache.entriesForDevtools();
      const seen = new Set<string>();
      for (const e of entries) {
        seen.add(e.key);
        let row = rows.get(e.key);
        if (!row) {
          const tr = document.createElement('tr');
          tr.dataset.key = e.key;
          tr.innerHTML = `<td class="c-key"><span class="kind"></span><span class="name"></span></td><td class="c-st"><span class="badge"></span></td><td class="c-age"><div class="bar"><i></i></div><span class="age"></span></td><td class="c-subs"></td><td class="c-act"><button class="mini" data-act="watch">watch</button><button class="mini" data-act="inv">invalidate</button><button class="mini" data-act="refetch">refetch</button><button class="mini ghost" data-act="evict">evict</button></td>`;
          tbody.appendChild(tr);
          row = { tr, v: -1 };
          rows.set(e.key, row);
          tr.animate([{ background: 'var(--accent-soft)' }, { background: 'transparent' }], { duration: 900 });
        }
        const { tr } = row;
        const s = statusOf(e);
        (tr.querySelector('.kind') as HTMLElement).textContent = kindLabel[e.cacheKey.kind] ?? e.cacheKey.kind;
        (tr.querySelector('.name') as HTMLElement).textContent = label(e.cacheKey);
        tr.title = `key: ${e.key}\ntags: ${[...e.tags].join(', ')}`;
        const badge = tr.querySelector('.badge') as HTMLElement;
        badge.className = `badge b-${s}`; badge.textContent = s;
        const age = e.updatedAt ? now - e.updatedAt : 0;
        const frac = e.updatedAt ? Math.min(1, age / Math.max(1, e.staleTime)) : 0;
        const bar = tr.querySelector('.bar i') as HTMLElement;
        bar.style.width = (frac * 100).toFixed(1) + '%';
        bar.parentElement!.classList.toggle('over', frac >= 1 || e.isStale);
        (tr.querySelector('.age') as HTMLElement).textContent = e.updatedAt ? `${fmtAge(age)} / ttl ${fmtAge(e.staleTime)}` : '—';
        (tr.querySelector('.c-subs') as HTMLElement).innerHTML = `<b>${e.subscribers}</b>${e.protocolSubscribed ? ' <span class="psub" title="live resources/subscribe on the server">live</span>' : ''}`;
        const wb = tr.querySelector('[data-act="watch"]') as HTMLButtonElement;
        wb.textContent = manualWatches.has(e.key) ? 'unwatch' : 'watch';
        wb.classList.toggle('on', manualWatches.has(e.key));
        (tr.querySelector('[data-act="refetch"]') as HTMLButtonElement).disabled = !refetcherFor(e);
        tr.classList.toggle('sel', e.key === selectedKey);
        if (row.v !== e.version && row.v !== -1) tr.animate([{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }, { background: 'transparent' }], { duration: 700 });
        row.v = e.version;
      }
      for (const [k, r] of rows) if (!seen.has(k)) { r.tr.remove(); rows.delete(k); }
      $('.mq-cache-empty').hidden = entries.length > 0;
      renderDetail();
    }
    function refetcherFor(e: CacheEntry): (() => Promise<unknown>) | undefined {
      const k = e.cacheKey;
      if (k.kind === 'toolList') return () => client.connection(SERVER)!.relist('tools');
      if (k.kind === 'resourceList') return () => client.connection(SERVER)!.relist('resources');
      if (k.kind === 'promptList') return () => client.connection(SERVER)!.relist('prompts');
      if (k.kind === 'resource') return refetchers.get(e.key) ?? (() => client.readResource(k.uri));
      return refetchers.get(e.key);
    }
    function renderDetail() {
      const pre = $('.mq-cache-detail');
      const e = cache.entriesForDevtools().find((x) => x.key === selectedKey);
      if (!e) { pre.textContent = 'Click a row to inspect its cached data, tags and flags.'; return; }
      const { data, error } = e;
      pre.textContent = JSON.stringify({ key: e.cacheKey, status: e.status, isStale: e.isStale, isOptimistic: e.isOptimistic, staleTime: e.staleTime, gcTime: e.gcTime, subscribers: e.subscribers, protocolSubscribed: e.protocolSubscribed, tags: [...e.tags], version: e.version, error: error?.message, data }, null, 2);
    }
    tbody.addEventListener('click', (ev) => {
      const tr = (ev.target as HTMLElement).closest('tr') as HTMLTableRowElement | null;
      if (!tr) return;
      const key = tr.dataset.key!;
      const e = cache.entriesForDevtools().find((x) => x.key === key);
      if (!e) return;
      const act = (ev.target as HTMLElement).closest('button')?.dataset.act;
      if (act === 'inv') cache.invalidateKeys([e.cacheKey]);
      else if (act === 'refetch') refetcherFor(e)?.().catch(() => {});
      else if (act === 'evict') { manualWatches.get(key)?.(); manualWatches.delete(key); cache.remove(e.cacheKey); }
      else if (act === 'watch') {
        if (manualWatches.has(key)) { manualWatches.get(key)!(); manualWatches.delete(key); }
        else { const f = refetcherFor(e); manualWatches.set(key, f ? watch(e.cacheKey, f) : cache.subscribe(e.cacheKey, () => {})); }
      } else selectedKey = key === selectedKey ? '' : key;
      scheduleRender();
    });
    disposers.push(() => { for (const u of manualWatches.values()) u(); manualWatches.clear(); });
    const fmtAge = (ms: number) => ms < 1000 ? `${Math.round(ms)}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s` : `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;

    let raf = 0;
    function scheduleRender() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; renderCache(); renderStatus(); }); }
    disposers.push(cache.subscribeAll(scheduleRender));
    disposers.push(client.subscribeServerState(scheduleRender));
    server.onChange = scheduleRender;
    const tick = window.setInterval(scheduleRender, 500);
    disposers.push(() => { clearInterval(tick); cancelAnimationFrame(raf); });

    /* ── gate panel ── */
    const policyTa = $<HTMLTextAreaElement>('.mq-policy');
    const presetSel = $<HTMLSelectElement>('.mq-presets');
    presetSel.innerHTML = `<option value="">presets…</option>` + Object.keys(PRESETS).map((k) => `<option>${esc(k)}</option>`).join('');
    presetSel.addEventListener('change', () => { if (!presetSel.value) return; policyTa.value = JSON.stringify(PRESETS[presetSel.value], null, 2); presetSel.value = ''; onPolicy(); });
    policyTa.value = st.policy;
    function onPolicy() {
      setPolicy(policyTa.value);
      $('.mq-policy-err').textContent = policyErr;
      policyTa.classList.toggle('bad', !!policyErr);
      if (!policyErr) { st.policy = policyTa.value; persist(); }
      renderVerdicts();
    }
    policyTa.addEventListener('input', onPolicy);

    async function verdictFor(def: any): Promise<{ v: 'allow' | 'deny' | 'approve'; why: string }> {
      const id = `${SERVER}.${def.name}`;
      const { approve, redact: _r, ...rules } = policyDoc;
      const destructive = def.annotations?.destructiveHint === true;
      const v = await compilePolicy(rules)({ kind: 'call', server: SERVER, target: def.name, destructive, readOnly: def.annotations?.readOnlyHint === true });
      if (v === 'deny') {
        const why = rules.deny?.some((g) => globRe(g).test(id)) ? `matches deny glob` : rules.denyDestructive && destructive ? 'destructiveHint + denyDestructive' : 'not in allow-list';
        return { v, why };
      }
      if (approve?.some((g) => globRe(g).test(id))) return { v: 'approve', why: 'matches approve glob (human in the loop)' };
      return { v: 'allow', why: rules.allow ? 'in allow-list' : 'no rule denies it' };
    }
    async function renderVerdicts() {
      const tools = client.listTools(SERVER);
      const cells = await Promise.all(tools.map(async (t) => ({ t, r: await verdictFor(t) })));
      $('.mq-matrix').innerHTML = cells.map(({ t, r }) => `<button class="vchip v-${r.v}${t.name === currentTool ? ' cur' : ''}" data-tool="${esc(t.name)}" title="${esc(r.why)}">${esc(t.name)}<b>${r.v === 'approve' ? 'approval' : r.v}</b></button>`).join('');
      const cur = cells.find((c) => c.t.name === currentTool);
      const d = $('.mq-decision');
      if (cur) { d.className = `mq-decision v-${cur.r.v}`; d.innerHTML = `<b>${cur.r.v === 'approve' ? 'NEEDS APPROVAL' : cur.r.v.toUpperCase()}</b><span>${SERVER}.${esc(cur.t.name)}: ${esc(cur.r.why)}</span>`; }
    }
    $('.mq-matrix').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('[data-tool]') as HTMLElement | null; if (b) selectTool(b.dataset.tool!, true); });
    function renderApprovals() {
      const box = $('.mq-approvals');
      box.innerHTML = approvals.length ? approvals.map((a) => `<div class="mq-appr"><span><b>${esc(a.op)}</b> <code>${esc(a.args.slice(0, 60))}</code></span><button class="btn primary mini" data-ok="${a.id}">Approve</button><button class="btn mini" data-no="${a.id}">Reject</button></div>`).join('') : `<div class="muted">No calls waiting for a human.</div>`;
      box.classList.toggle('pending', approvals.length > 0);
    }
    $('.mq-approvals').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const id = Number(el.dataset.ok ?? el.dataset.no);
      const i = approvals.findIndex((a) => a.id === id);
      if (i < 0) return;
      const [a] = approvals.splice(i, 1);
      a.resolve(!!el.dataset.ok);
      renderApprovals();
    });
    disposers.push(() => { for (const a of approvals.splice(0)) a.resolve(false); });

    /* ── tool call panel ── */
    const toolSel = $<HTMLSelectElement>('.mq-tool');
    const form = $('.mq-form');
    const out = $('.mq-out');
    let currentTool = st.tool;
    let args: Json = {};
    function persist() { writeState({ tool: currentTool, policy: st.policy, args: JSON.stringify(args) === JSON.stringify(defaultsFor(currentTool)) ? '' : JSON.stringify(args) }, DEFAULTS); }
    function defaultsFor(name: string): Json {
      const def = client.listTools(SERVER).find((t) => t.name === name);
      const props = (def?.inputSchema.properties ?? {}) as Record<string, any>;
      return Object.fromEntries(Object.entries(props).filter(([, s]) => s.default !== undefined).map(([k, s]) => [k, s.default]));
    }
    function renderToolOptions() {
      const tools = client.listTools(SERVER);
      toolSel.innerHTML = tools.map((t) => `<option value="${esc(t.name)}">${esc(t.name)}${t.annotations?.destructiveHint ? '  (destructive)' : t.annotations?.readOnlyHint ? '  (read-only)' : ''}</option>`).join('');
      if (!tools.some((t) => t.name === currentTool)) {
        if (currentTool) out.textContent = `"${currentTool}" is no longer offered by the server (tools/list_changed removed it).`;
        currentTool = tools[0]?.name ?? '';
      }
      toolSel.value = currentTool;
    }
    function selectTool(name: string, reset: boolean, initialArgs?: Json) {
      currentTool = name;
      toolSel.value = name;
      const def = client.listTools(SERVER).find((t) => t.name === name);
      if (!def) return;
      args = initialArgs ?? (reset ? defaultsFor(name) : args);
      const ann = def.annotations ?? {};
      $('.mq-tool-desc').innerHTML = `${esc(def.description ?? '')} ${ann.readOnlyHint ? '<span class="chip">readOnlyHint</span>' : ''}${ann.destructiveHint ? '<span class="chip danger">destructiveHint</span>' : ''}${ann.idempotentHint ? '<span class="chip">idempotentHint</span>' : ''}`;
      const props = (def.inputSchema.properties ?? {}) as Record<string, any>;
      const req = new Set(def.inputSchema.required ?? []);
      form.innerHTML = Object.entries(props).map(([k, s]) => {
        const v = args[k];
        let input: string;
        if (Array.isArray(s.enum)) input = `<select data-k="${k}">${s.enum.map((o: string) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        else if (s.type === 'boolean') input = `<input type="checkbox" data-k="${k}"${v ? ' checked' : ''}>`;
        else if (s.type === 'number' || s.type === 'integer') input = `<input type="number" data-k="${k}" value="${v ?? ''}"${s.minimum != null ? ` min="${s.minimum}"` : ''}${s.maximum != null ? ` max="${s.maximum}"` : ''}${s.type === 'integer' ? ' step="1"' : ''}>`;
        else input = `<input type="text" data-k="${k}" value="${esc(String(v ?? ''))}">`;
        return `<label class="field"><span>${esc(k)}${req.has(k) ? ' <i>*</i>' : ''} <em>${esc(s.type ?? (s.enum ? 'enum' : ''))}</em></span>${input}</label>`;
      }).join('') || `<div class="muted">No arguments.</div>`;
      $('.mq-query').hidden = !ann.readOnlyHint;
      $('.mq-optimistic-note').hidden = name !== 'add_note';
      $('.mq-schema').textContent = JSON.stringify(def.inputSchema, null, 2);
      persist();
      renderVerdicts();
    }
    form.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const k = el.dataset.k; if (!k) return;
      const def = client.listTools(SERVER).find((t) => t.name === currentTool);
      const s = (def?.inputSchema.properties as any)?.[k] ?? {};
      args = { ...args, [k]: el.type === 'checkbox' ? el.checked : (s.type === 'number' || s.type === 'integer') ? (el.value === '' ? undefined : Number(el.value)) : el.value };
      persist();
    });
    toolSel.addEventListener('change', () => selectTool(toolSel.value, true));

    async function run(mode: 'call' | 'query') {
      const name = currentTool; const a = { ...args };
      rememberArgs(name, a);
      const t = performance.now();
      out.className = 'code mq-out busy';
      if (mode === 'query') {
        const key = kTool(name, a);
        const e = cache.getSnapshot(key);
        if (e && !cache.isStale(key)) {
          out.className = 'code mq-out ok';
          out.textContent = `// served from cache: fresh, age ${fmtAge(Date.now() - e.updatedAt)} of ${fmtAge(e.staleTime)}. No request sent.\n` + JSON.stringify(e.data, null, 2);
          pushEv({ lane: 'local', kind: 'cache', label: `cache hit ${name} (fresh), no network` });
          return;
        }
      }
      out.textContent = mode === 'query' ? `queryTool("${name}") …` : `callTool("${name}") …`;
      try {
        const r: any = mode === 'query' ? await qTool(name, a) : await client.callTool(name, a, name === 'add_note' ? noteOpts : {});
        out.className = `code mq-out ${r?.isError ? 'err' : 'ok'}`;
        out.textContent = `// ${mode === 'query' ? 'queryTool' : 'callTool'} in ${(performance.now() - t).toFixed(0)}ms${r?.isError ? ' (isError: tool-level failure, surfaced as data)' : ''}\n` + JSON.stringify(r, null, 2);
      } catch (e: any) {
        const denied = e?.code === -32003 || e?.name === 'AuthorizationError';
        out.className = 'code mq-out err';
        out.textContent = `// ${denied ? 'blocked by the gate: the server never saw this call' : 'error'} after ${(performance.now() - t).toFixed(0)}ms\n${e?.name ?? 'Error'}: ${e?.message ?? e}`;
      }
    }
    $('.mq-call').addEventListener('click', () => void run('call'));
    $('.mq-query').addEventListener('click', () => void run('query'));

    /* ── live widgets: clock, notes (optimistic), weather ── */
    const noteOpts = {
      optimistic: (a: Json) => [{ key: kResource('notes://inbox'), recipe: (prev: any) => {
        const list = prev?.contents?.[0]?.text ? JSON.parse(prev.contents[0].text) : [];
        return { ...(prev ?? {}), contents: [{ uri: 'notes://inbox', mimeType: 'application/json', text: JSON.stringify([...list, { id: 'pending-' + Date.now(), text: String(a.text ?? ''), at: Date.now(), pending: true }]) }] };
      } }],
    };
    const clockEl = $('.mq-clock');
    const noteIn = $<HTMLInputElement>('.mq-note-in');
    const reject = $<HTMLInputElement>('.mq-reject');
    reject.addEventListener('change', () => { server.rejectNextWrite = reject.checked; });
    server.onChange = () => { reject.checked = server.rejectNextWrite; scheduleRender(); };
    $('.mq-note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = noteIn.value.trim() || 'untitled thought';
      noteIn.value = '';
      try { const r: any = await client.callTool('add_note', { text }, noteOpts); if (r?.isError) { const f = $('.mq-notes-flag'); f.textContent = 'rolled back: server returned isError'; f.classList.add('on'); } } catch (err: any) { $('.mq-notes-flag').textContent = `rolled back: ${err?.message ?? err}`; }
    });
    const cityEl = $<HTMLSelectElement>('.mq-city');
    cityEl.innerHTML = CITIES.map((c) => `<option>${c}</option>`).join('');
    let unWeather: (() => void) | undefined;
    function watchCity() {
      unWeather?.();
      const a = { city: cityEl.value, units: 'C' };
      rememberArgs('get_weather', a);
      unWeather = watch(kTool('get_weather', a), () => qTool('get_weather', a), (e) => {
        const d = (e?.data as any)?.structuredContent;
        $('.mq-weather').innerHTML = d ? `<b>${d.temp}°${d.units}</b><span>${esc(d.sky)} · ${d.humidity}% rh</span><small>observed ${d.observedAt}</small>` : e?.status === 'error' ? `<span class="muted">error: ${esc(e.error?.message ?? '')}</span>` : `<span class="muted">fetching…</span>`;
      });
    }
    cityEl.addEventListener('change', watchCity);
    disposers.push(() => unWeather?.());

    /* ── boot ── */
    try {
      await client.connect();
    } catch (e) {
      out.textContent = `connect failed: ${(e as Error).message}`;
    }
    if (dead) return;
    onPolicy();
    renderToolOptions();
    let initialArgs: Json | undefined;
    try { initialArgs = st.args ? JSON.parse(st.args) : undefined; } catch {}
    selectTool(client.listTools(SERVER).some((t) => t.name === currentTool) ? currentTool : 'get_weather', true, initialArgs && { ...defaultsFor(currentTool), ...initialArgs });
    disposers.push(client.subscribeCapabilities((_s, kind) => {
      if (kind !== 'tools') return;
      renderToolOptions();
      selectTool(currentTool, false);
    }));
    // Widgets subscribe only once the connection is ready (routing needs resources/list).
    disposers.push(watch(kResource('clock://now'), () => readRes('clock://now'), (e) => {
      const txt = (e?.data as any)?.contents?.[0]?.text;
      if (txt) { clockEl.textContent = txt; clockEl.animate([{ color: 'var(--accent)' }, { color: 'var(--ink)' }], { duration: 800 }); }
    }));
    const notesEl = $('.mq-notes');
    disposers.push(watch(kResource('notes://inbox'), () => readRes('notes://inbox'), (e) => {
      let list: any[] = [];
      try { list = JSON.parse((e?.data as any)?.contents?.[0]?.text ?? '[]'); } catch {}
      notesEl.innerHTML = list.length ? list.map((n) => `<li class="${n.pending ? 'pending' : ''}"><span>${esc(n.text)}</span>${n.pending ? '<em>optimistic</em>' : `<small>${esc(n.id)}</small>`}</li>`).join('') : `<li class="muted">inbox empty</li>`;
      $('.mq-notes-flag').textContent = e?.isOptimistic ? 'isOptimistic: true (awaiting server)' : e?.status === 'success' ? 'confirmed by server' : e?.status ?? '';
      $('.mq-notes-flag').classList.toggle('on', !!e?.isOptimistic);
    }));
    watchCity();
    renderApprovals();
    // Seed a few more entries so the inspector has something to show on arrival.
    for (const [t, a] of [['add', { a: 2, b: 40 }], ['slow_search', { query: 'reactive cache', delayMs: 2400 }], ['get_weather', { city: 'Oslo', units: 'F' }]] as const) { rememberArgs(t, a); qTool(t, a).catch(() => {}); }
    readRes('config://server').catch(() => {});
    scheduleRender();

    return () => {
      dead = true;
      for (const d of disposers.splice(0).reverse()) { try { d(); } catch {} }
      root.remove();
    };
  },
};

const TEMPLATE = `
<div class="panel mq-strip">
  <div class="mq-status"></div>
  <div class="mq-strip-ctl">
    <label class="mq-lat">server latency <input class="mq-latency" type="range" min="0" max="800" step="10" value="90"><span class="mq-latency-v">90ms</span></label>
    <button class="btn primary mq-listchanged" title="Server registers/unregisters roll_dice and emits notifications/tools/list_changed">server: tools/list_changed</button>
    <button class="btn mq-inv-all" title="invalidateTags(['server:demo'])">invalidate all</button>
    <button class="btn mq-copy">copy link</button>
  </div>
</div>

<section class="panel mq-cache">
  <header><h3>Query-key cache</h3><span class="muted">MCPCache entries, live. Watched entries refetch when invalidated; watched resources hold a <code>resources/subscribe</code>.</span></header>
  <div class="mq-cache-wrap">
    <table><thead><tr><th>query key</th><th>status</th><th>age / staleTime</th><th>subs</th><th></th></tr></thead><tbody></tbody></table>
    <div class="muted mq-cache-empty">empty</div>
  </div>
  <pre class="code mq-cache-detail"></pre>
</section>

<div class="mq-grid">
  <section class="panel mq-call-panel">
    <header><h3>Call a tool</h3><select class="mq-tool"></select></header>
    <p class="mq-tool-desc"></p>
    <div class="mq-form"></div>
    <div class="mq-btns">
      <button class="btn primary mq-call">callTool()</button>
      <button class="btn mq-query" title="cache-first: serve fresh cached result, else queryTool()">queryTool() cache-first</button>
    </div>
    <p class="muted mq-optimistic-note" hidden>add_note is called with an <code>optimistic</code> patch on <code>notes://inbox</code>; see the notes widget.</p>
    <pre class="code mq-out">Pick a tool and call it. Every call runs through the gate interceptor chain first.</pre>
    <details><summary>inputSchema</summary><pre class="code mq-schema"></pre></details>
  </section>

  <section class="panel mq-gate">
    <header><h3>Gate policy</h3><select class="mq-presets"></select></header>
    <div class="mq-decision"></div>
    <div class="mq-matrix"></div>
    <textarea class="code mq-policy" spellcheck="false"></textarea>
    <div class="mq-policy-err"></div>
    <p class="muted small"><code>allow</code> / <code>deny</code> / <code>denyDestructive</code> compile with mcp-gate's <code>compilePolicy</code> into mcp-query's <code>authorize()</code> interceptor; <code>redact</code> is mcp-gate's DLP interceptor. mcp-gate verdicts are strictly allow/deny, so <code>approve</code> is <b>this planet's addition</b>, not an mcp-gate feature: a human-in-the-loop interceptor chained after mcp-gate's. Both mcp-gate pieces come straight from the package's browser entry (<code>import { compilePolicy, redact } from '@johnhenry/mcp-gate'</code>).</p>
    <h4>Waiting for approval</h4>
    <div class="mq-approvals"></div>
  </section>
</div>

<div class="mq-grid">
  <section class="panel mq-live">
    <header><h3>Live queries</h3><span class="muted">each widget is a cache subscriber</span></header>
    <div class="mq-widget"><h4>clock://now <span class="chip">resources/updated every 5s</span></h4><div class="mq-clock">--:--:--</div></div>
    <div class="mq-widget"><h4>get_weather <select class="mq-city"></select> <span class="chip">ttlMs 20s</span></h4><div class="mq-weather"></div></div>
    <div class="mq-widget"><h4>notes://inbox <span class="mq-notes-flag"></span></h4>
      <ul class="mq-notes"></ul>
      <form class="mq-note-form"><input class="mq-note-in" placeholder="add a note (optimistic)" maxlength="120"><button class="btn primary">add_note</button></form>
      <label class="mq-rej"><input type="checkbox" class="mq-reject"> server rejects the next write (watch the rollback)</label>
    </div>
  </section>

  <section class="panel mq-timeline">
    <header><h3>Wire</h3>
      <div class="mq-tl-filters">
        <label><input type="checkbox" value="req" checked>req</label><label><input type="checkbox" value="res" checked>res</label><label><input type="checkbox" value="err" checked>err</label><label><input type="checkbox" value="note" checked>notif</label><label><input type="checkbox" value="gate" checked>gate</label><label><input type="checkbox" value="cache" checked>cache</label><label><input type="checkbox" value="audit" checked>audit</label>
      </div>
      <button class="mini mq-pause">pause</button><button class="mini mq-clear">clear</button>
    </header>
    <div class="mq-lanes"><div class="pillar client">client<br><small>mcp-query</small></div><div class="wire-line"></div><div class="pillar server">server<br><small>in-page</small></div></div>
    <div class="mq-tl-list"></div>
  </section>
</div>

<section class="panel mq-explain">
  <h3>What's happening</h3>
  <ul>
    <li><b>The server is fake, the client is real.</b> A few dozen lines answer <code>initialize</code>, <code>tools/list</code>, <code>tools/call</code>, <code>resources/*</code> and <code>prompts/list</code> over a hand-written <code>Transport</code> object handed to <code>MCPClient</code>'s <code>transport</code> factory. Everything above that is the official SDK client plus mcp-query.</li>
    <li><b>Query keys.</b> Resources cache under <code>resource:uri</code>, read-only tool results under <code>toolResult:name:argsHash</code>, catalogs under <code>toolList</code> and friends. Freshness comes from the server's <code>ttlMs</code> hint (SEP-2549) or the 30s default.</li>
    <li><b>The protocol invalidates for you.</b> <code>notifications/resources/updated</code> marks one resource stale and its watchers refetch; <code>tools/list_changed</code> triggers a re-list that rewrites <code>toolList</code>, and the tool picker and policy matrix follow.</li>
    <li><b>Subscribers drive subscriptions.</b> The first cache subscriber on a resource makes the client send <code>resources/subscribe</code>; the last one leaving sends <code>unsubscribe</code>. Try watch/unwatch on <code>config://server</code>.</li>
    <li><b>Optimistic writes.</b> <code>add_note</code> patches the cached inbox before the server answers; an <code>isError</code> result or a thrown error rolls it back.</li>
    <li><b>The gate is an interceptor.</b> Denied calls throw <code>AuthorizationError</code> (-32003) before a byte reaches the server. The audit hook records ok, denied and error outcomes.</li>
  </ul>
</section>
`;

export default playground;
