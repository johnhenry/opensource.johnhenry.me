import type { Playground } from '../registry';
import { MCPClient, InteractionBroker, type RequestInterceptor, type Operation, type Interaction, type AuditEntry } from '@johnhenry/mcp-query';
import { probeCompanion, hasDemo, companionBanner, type Companion } from '../companion';
import { readState, writeState, copyLink } from '../state';
import './switchboard.css';

/* ────────────────────────────────────────────────────────────────────────────
 * Agent Protocols Switchboard — one page, three agent-protocol shapes, ONE
 * shared human-approval inbox (ROADMAP.md 2.1).
 *
 *  · MCP lane   — a REAL @johnhenry/mcp-query MCPClient talking to a tiny
 *                 in-page MCP server over the SDK's InMemoryTransport shape
 *                 (same pattern the Agent Query planet uses). Destructive
 *                 tool calls route through the shared broker before the
 *                 server ever sees them.
 *  · A2A-ish lane — mcp-query ships an MCP client, not an A2A one, and this
 *                 build has neither `@johnhenry/a2a-query` nor
 *                 `@johnhenry/acp-query` installed (ROADMAP 2.1 itself flags
 *                 that both would pull in a SECOND, incompatible copy of
 *                 `@johnhenry/agent-query-core` — 0.1.0-rc.4 vs 0.1.0 — which
 *                 would break the single-broker promise this room exists to
 *                 demonstrate). So this lane is an honest, hand-rolled stand-in
 *                 for A2A's task lifecycle (submitted → working →
 *                 input-required → completed/failed) and agent-card shape.
 *                 It can run two ways: entirely in this tab ("local"), or,
 *                 when the Node companion is up, as real HTTP calls to a
 *                 SECOND process (server/demos/switchboard.mjs) — the honest
 *                 version of "another agent".
 *  · Companion probe — `probeCompanion()` (src/companion.ts) is already an
 *                 agent-card-shaped protocol piece used by six other planets:
 *                 GET a well-known URL, get back a signed-in-spirit manifest
 *                 of what this peer can do. It's reused here verbatim, not
 *                 reimplemented, as the room's third "protocol".
 *
 * The thing that makes this a SWITCHBOARD and not three unrelated demos: one
 * `InteractionBroker` instance (real export of @johnhenry/mcp-query, itself a
 * thin MCP-flavored subclass of @johnhenry/agent-query-core's broker) is
 * constructed ONCE and handed to both the MCP interceptor chain and the A2A-ish
 * task runner. `broker.gate(type, peer, payload)` is peer-agnostic — MCP calls
 * and A2A-ish tasks queue into the exact same pending list, resolved by the
 * exact same Approve/Deny buttons, recorded in the exact same audit trail.
 * ──────────────────────────────────────────────────────────────────────────── */

type Transport = { start(): Promise<void>; close(): Promise<void>; send(m: Msg): Promise<void>; onmessage?: (m: Msg) => void; onclose?: () => void };
interface Msg { jsonrpc: '2.0'; id?: number | string; method?: string; params?: any; result?: any; error?: { code: number; message: string } }
type Json = Record<string, any>;

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const short = (v: unknown, n = 90) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/* ───────────────────────────── in-page MCP server ───────────────────────────── */

interface ToolDef { name: string; description: string; inputSchema: Json; annotations?: { destructiveHint?: boolean; readOnlyHint?: boolean }; run: (a: Json) => Promise<Json> }
class RpcError extends Error { constructor(public code: number, msg: string) { super(msg); } }

class SwitchboardServer {
  private t?: Transport;
  private wire: (dir: 'c2s' | 's2c', m: Msg) => void;
  broadcasts: string[] = [];
  constructor(wire: (dir: 'c2s' | 's2c', m: Msg) => void) { this.wire = wire; }

  tools(): ToolDef[] {
    return [
      { name: 'ping', description: 'Round-trip check. Read-only, never gated.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true },
        run: async () => ({ content: [{ type: 'text', text: 'pong' }] }) },
      { name: 'list_peers', description: "List the other protocols this switchboard knows about. Read-only.", inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true },
        run: async () => ({ content: [{ type: 'text', text: JSON.stringify(['mcp:switchboard-demo', 'a2a-ish:orrery-companion-agent']) }] }) },
      { name: 'broadcast_alert', description: 'Push a message to every connected agent. Destructive — the shared broker gates this before the server sees it.', annotations: { destructiveHint: true },
        inputSchema: { type: 'object', properties: { message: { type: 'string', default: 'zero-day patch rolling out to all agents' } }, required: ['message'] },
        run: async (a) => { const m = String(a.message ?? ''); this.broadcasts.push(m); return { content: [{ type: 'text', text: `broadcast sent to ${1 + this.broadcasts.length} peers: ${m}` }] }; } },
    ];
  }

  transport = (): Transport => {
    const t: Transport = {
      start: async () => {},
      close: async () => { if (this.t === t) this.t = undefined; t.onclose?.(); },
      send: async (m: Msg) => { this.wire('c2s', m); void this.handle(m); },
    };
    this.t = t;
    return t;
  };
  private deliver(m: Msg) { const t = this.t; if (!t) return; this.wire('s2c', m); t.onmessage?.(m); }

  private async handle(m: Msg) {
    if (m.id === undefined) return;
    await sleep(80 + Math.random() * 120);
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
        return { protocolVersion: p.protocolVersion ?? '2025-11-25', serverInfo: { name: 'switchboard-demo', version: '1.0.0' },
          capabilities: { tools: { listChanged: false } }, instructions: 'A tiny in-page MCP server for the Switchboard room.' };
      case 'ping': return {};
      case 'tools/list': return { tools: this.tools().map(({ run, ...t }) => t) };
      case 'tools/call': {
        const tool = this.tools().find((t) => t.name === p.name);
        if (!tool) throw new RpcError(-32602, `Unknown tool: ${p.name}`);
        return tool.run(p.arguments ?? {});
      }
      default: throw new RpcError(-32601, `Method not found: ${method}`);
    }
  }
}

/* ───────────────────────────── A2A-ish task lifecycle (local stand-in) ───────────────────────────── */

type TaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';
interface AgentTask { id: string; peer: 'a2a-local' | 'a2a-companion'; prompt: string; state: TaskState; result?: string; log: string[]; }

const AGENT_CARD_LOCAL = {
  protocol: 'a2a-ish/0 (hand-rolled — no @a2a-js/sdk in this build)',
  id: 'orrery-inpage-agent', name: 'In-Page Agent (local stand-in)', version: '1.0.0',
  skills: [
    { id: 'echo', description: 'Echoes the task prompt back, upper-cased.' },
    { id: 'weather', description: 'Answers a weather question. Asks for a city if the prompt does not name one.' },
  ],
};

/* ───────────────────────────── policy modes ───────────────────────────── */

type PolicyMode = 'ask' | 'allow' | 'deny';
const POLICY_LABEL: Record<PolicyMode, string> = {
  ask: 'Ask a human (destructive MCP calls + every task input) — default',
  allow: 'Auto-allow everything (no inbox entries)',
  deny: 'Auto-deny everything (nothing gets through)',
};

const DEFAULTS = { prompt: 'what is the weather?', policy: 'ask' as PolicyMode };
type State = typeof DEFAULTS;

const TEMPLATE = `
<div class="grid-2 sb-top">
  <section class="panel sb-lane" data-lane="mcp">
    <h3>MCP <span class="chip">@johnhenry/mcp-query</span></h3>
    <p class="muted">A real <code>MCPClient</code> against an in-page server (JSON-RPC over the SDK's transport shape). <code>broadcast_alert</code> is annotated destructive — the shared broker gates it.</p>
    <div class="sb-row">
      <select class="sb-tool"></select>
      <input class="sb-tool-arg" placeholder="message" value="zero-day patch rolling out to all agents">
      <button class="btn primary sb-call">call</button>
    </div>
    <pre class="code sb-mcp-out">—</pre>
  </section>

  <section class="panel sb-lane" data-lane="a2a">
    <h3>A2A-ish <span class="chip">hand-rolled stand-in</span></h3>
    <p class="muted">Task lifecycle: <code>submitted → working → input-required → completed</code>. No city in the prompt? The task pauses in the shared inbox for a human.</p>
    <div class="sb-row">
      <input class="sb-prompt" placeholder="task prompt">
      <button class="btn primary sb-run-local">run locally</button>
      <button class="btn sb-run-companion" disabled>run via companion</button>
    </div>
    <div class="sb-tasks"></div>
  </section>

  <section class="panel sb-lane" data-lane="companion">
    <h3>Companion probe <span class="chip">src/companion.ts</span></h3>
    <p class="muted">The same <code>probeCompanion()</code> manifest fetch six other planets use — an agent-card-shaped "what can you do?" GET, reused verbatim as this room's third protocol.</p>
    <div class="sb-companion-banner"></div>
    <pre class="code sb-card-out">probing…</pre>
  </section>
</div>

<section class="panel sb-inbox">
  <div class="sb-inbox-head">
    <h3>Shared approval inbox <span class="chip">one InteractionBroker</span></h3>
    <label class="field sb-policy-field">
      <span>policy</span>
      <select class="sb-policy"></select>
    </label>
    <span class="spacer"></span>
    <button class="btn sb-copy">copy link</button>
  </div>
  <div class="sb-pending"></div>
</section>

<section class="panel sb-log-panel">
  <div class="sb-log-head"><h3>Combined wire &amp; audit log</h3><button class="btn sb-clear">clear</button></div>
  <div class="sb-log"></div>
</section>
`;

const playground: Playground = {
  id: 'switchboard',
  title: 'Agent Protocols Switchboard',
  pkg: '@johnhenry/mcp-query',
  hue: 118,
  blurb: 'MCP, an A2A-style task lifecycle, and a companion probe all feed one shared human-approval inbox.',
  docs: 'https://opensource.johnhenry.me/agent-query/',
  async mount(host) {
    let dead = false;
    const disposers: (() => void)[] = [];

    const st = readState<State>(DEFAULTS);

    const root = document.createElement('div');
    root.className = 'pg-switchboard';
    root.innerHTML = TEMPLATE;
    host.appendChild(root);
    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;

    /* ── combined log ── */
    const logEl = $('.sb-log');
    let logN = 0;
    function log(source: 'mcp' | 'a2a-local' | 'a2a-companion' | 'companion' | 'broker', text: string) {
      if (dead) return;
      const row = document.createElement('div');
      row.className = `sb-log-row s-${source}`;
      row.innerHTML = `<span class="ts">${new Date().toLocaleTimeString()}</span><span class="src">${source}</span><span class="txt">${esc(text)}</span>`;
      logEl.prepend(row);
      if (++logN > 300 || logEl.childElementCount > 300) { logN = 0; while (logEl.childElementCount > 200) logEl.lastElementChild!.remove(); }
    }
    $('.sb-clear').addEventListener('click', () => { logEl.innerHTML = ''; });

    /* ── shared broker: ONE instance, used by both the MCP interceptor and the A2A-ish task runner ── */
    let policyMode: PolicyMode = st.policy;
    const broker = new InteractionBroker({
      // mcp-query's own PolicyContext narrows `type` to its MCP-flavored InteractionType
      // ("sampling" | "elicitation" | "confirm"), but the underlying core gate() takes any
      // string — this room deliberately passes its own ("tool-call" | "task-input") through
      // it, so the comparisons below need the wider, honest runtime type back.
      policy: (ctx) => {
        const type = ctx.type as unknown as string;
        if (policyMode === 'allow') return 'allow';
        if (policyMode === 'deny') return 'deny';
        // 'ask': destructive MCP tool-calls and every A2A task input pause for a human.
        if (type === 'task-input') return 'ask';
        if (type === 'tool-call' && (ctx.payload as any)?.destructive) return 'ask';
        return 'allow';
      },
      onAudit: (e: AuditEntry) => log('broker', `${e.outcome} · ${e.peer}.${e.type}${e.reason ? ` (${e.reason})` : ''}`),
    });
    const unsubBroker = broker.subscribe(() => renderInbox());
    disposers.push(unsubBroker);

    function renderInbox() {
      const items = broker.list();
      const box = $('.sb-pending');
      box.innerHTML = items.length
        ? items.map((it: Interaction) => `
          <div class="sb-pend" data-id="${it.id}">
            <span class="chip peer-${esc(it.peer)}">${esc(it.peer)}</span>
            <span class="ptype">${esc(it.type)}</span>
            <code class="ppayload">${esc(short(it.payload))}</code>
            <span class="spacer"></span>
            <button class="btn primary mini" data-ok="${it.id}">Approve</button>
            <button class="btn mini" data-no="${it.id}">Deny</button>
          </div>`).join('')
        : `<div class="muted">Nothing waiting. Call a destructive MCP tool or run a task that needs a city.</div>`;
    }
    $('.sb-pending').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const okId = el.dataset.ok, noId = el.dataset.no;
      if (okId) broker.resolve(Number(okId), { action: 'approve', content: { city: 'Tokyo' } } as any);
      else if (noId) broker.resolve(Number(noId), { action: 'deny', reason: 'rejected by human reviewer' } as any);
    });

    const policySel = $<HTMLSelectElement>('.sb-policy');
    policySel.innerHTML = (Object.keys(POLICY_LABEL) as PolicyMode[]).map((k) => `<option value="${k}">${esc(POLICY_LABEL[k])}</option>`).join('');
    policySel.value = policyMode;
    policySel.addEventListener('change', () => { policyMode = policySel.value as PolicyMode; persist(); });

    function persist() { writeState({ prompt: promptEl.value, policy: policyMode }, DEFAULTS); }

    $('.sb-copy').addEventListener('click', async () => { await copyLink(); const b = $('.sb-copy'); b.textContent = 'copied'; setTimeout(() => (b.textContent = 'copy link'), 1200); });

    /* ── MCP lane ── */
    function onWire(dir: 'c2s' | 's2c', m: Msg) {
      if (m.method && m.id !== undefined) log('mcp', `→ ${m.method}${m.method === 'tools/call' ? ' ' + m.params?.name : ''} #${m.id}`);
      else if (m.method) log('mcp', `notify ${m.method}`);
      else log('mcp', `← #${m.id}${m.error ? ' error: ' + m.error.message : ''}`);
    }
    const server = new SwitchboardServer(onWire);
    const destructiveGate: RequestInterceptor = async (op: Operation, next) => {
      if (op.kind === 'call' && (op.def as any)?.annotations?.destructiveHint) {
        const { verdict, decision } = await broker.gate('tool-call', 'mcp', { tool: op.target, args: op.args, destructive: true },
          { autoApprove: { action: 'approve' } as any, autoDeny: { action: 'deny', reason: 'denied by switchboard policy' } as any });
        if (verdict === 'auto-deny' || verdict === 'denied') { const e = new Error((decision as any)?.reason ?? 'denied'); (e as any).code = -32003; throw e; }
      }
      return next(op);
    };
    const client = new MCPClient({
      servers: { switchboard: { transport: server.transport, maxRetries: 1 } },
      interceptors: [destructiveGate],
    });
    disposers.push(() => { void client.close(); });
    const connected = client.connect().then(() => log('mcp', 'connected to the in-page server')).catch((e) => log('mcp', `connect failed: ${e?.message ?? e}`));

    const toolSel = $<HTMLSelectElement>('.sb-tool');
    const toolArg = $<HTMLInputElement>('.sb-tool-arg');
    const mcpOut = $('.sb-mcp-out');
    function updateArgVisibility() { toolArg.hidden = toolSel.value !== 'broadcast_alert'; }
    toolSel.addEventListener('change', updateArgVisibility);
    async function callMcp(tool: string, args: Json) {
      mcpOut.className = 'code sb-mcp-out busy';
      mcpOut.textContent = `calling ${tool}…`;
      try {
        await connected;
        if (dead) return;
        const r: any = await client.callTool(tool, args);
        mcpOut.className = 'code sb-mcp-out ok';
        mcpOut.textContent = JSON.stringify(r, null, 2);
      } catch (e: any) {
        mcpOut.className = 'code sb-mcp-out err';
        const denied = e?.code === -32003;
        mcpOut.textContent = `${denied ? 'blocked by the shared broker — the server never saw this call' : 'error'}\n${e?.message ?? e}`;
      }
    }
    $('.sb-call').addEventListener('click', () => {
      const tool = toolSel.value;
      const args = tool === 'broadcast_alert' ? { message: toolArg.value } : {};
      void callMcp(tool, args);
    });

    /* ── A2A-ish lane ── */
    const tasksEl = $('.sb-tasks');
    const promptEl = $<HTMLInputElement>('.sb-prompt');
    promptEl.value = st.prompt;
    promptEl.addEventListener('input', persist);
    let tasks: AgentTask[] = [];
    function renderTasks() {
      tasksEl.innerHTML = tasks.length
        ? tasks.slice().reverse().map((t) => `
          <div class="sb-task st-${t.state}">
            <div class="sb-task-head"><span class="chip peer-${esc(t.peer)}">${esc(t.peer)}</span><b>${esc(t.id)}</b><span class="tstate">${esc(t.state)}</span></div>
            <div class="sb-task-prompt">“${esc(t.prompt)}”</div>
            <ol class="sb-task-log">${t.log.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
            ${t.result ? `<div class="sb-task-result">${esc(t.result)}</div>` : ''}
          </div>`).join('')
        : `<div class="muted">No tasks yet.</div>`;
    }
    function taskLog(t: AgentTask, s: TaskState, note: string) {
      t.state = s; t.log.push(`${s} — ${note}`);
      log(t.peer, `${t.id} ${s}: ${note}`);
      renderTasks();
    }

    async function runLocalTask(prompt: string) {
      const t: AgentTask = { id: `task-${Date.now().toString(36)}`, peer: 'a2a-local', prompt, state: 'submitted', log: [] };
      tasks.push(t); taskLog(t, 'submitted', `received by ${AGENT_CARD_LOCAL.name}`);
      await sleep(250); if (dead) return;
      taskLog(t, 'working', 'matching against local skills');
      await sleep(400); if (dead) return;
      const needsCity = /weather/i.test(prompt) && !/\bin\s+\w+/i.test(prompt);
      if (needsCity) {
        taskLog(t, 'input-required', 'needs a city — queued in the shared inbox');
        const { verdict, decision } = await broker.gate('task-input', 'a2a-local', { taskId: t.id, question: 'Which city?' },
          { autoApprove: { action: 'approve', content: { city: 'Tokyo' } } as any, autoDeny: { action: 'deny', reason: 'no answer' } as any });
        if (dead) return;
        if (verdict === 'denied' || verdict === 'auto-deny') { taskLog(t, 'failed', (decision as any)?.reason ?? 'input denied'); return; }
        const city = (decision as any)?.content?.city ?? 'Tokyo';
        taskLog(t, 'working', `resumed with city=${city}`);
        await sleep(300); if (dead) return;
        t.result = `Weather in ${city}: clear and pleasant (local simulation).`;
        taskLog(t, 'completed', 'done');
      } else {
        t.result = `${prompt.toUpperCase()} (echoed by ${AGENT_CARD_LOCAL.id})`;
        taskLog(t, 'completed', 'done');
      }
    }

    async function runCompanionTask(prompt: string) {
      const c = await probeCompanion();
      if (!hasDemo(c, 'switchboard')) { log('a2a-companion', 'companion not live — falling back to local'); return runLocalTask(prompt); }
      const t: AgentTask = { id: `remote-${Date.now().toString(36)}`, peer: 'a2a-companion', prompt, state: 'submitted', log: [] };
      tasks.push(t); taskLog(t, 'submitted', `POST ${c!.base}/switchboard/task`);
      try {
        taskLog(t, 'working', 'awaiting the companion process');
        const r = await fetch(`${c!.base}/switchboard/task`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) });
        const data = await r.json();
        if (dead) return;
        if (data.status?.state === 'input-required') {
          taskLog(t, 'input-required', `${data.prompt} — queued in the shared inbox`);
          const { verdict, decision } = await broker.gate('task-input', 'a2a-companion', { taskId: data.id, question: data.prompt },
            { autoApprove: { action: 'approve', content: { city: 'Tokyo' } } as any, autoDeny: { action: 'deny', reason: 'no answer' } as any });
          if (dead) return;
          if (verdict === 'denied' || verdict === 'auto-deny') { taskLog(t, 'failed', (decision as any)?.reason ?? 'input denied'); return; }
          const city = (decision as any)?.content?.city ?? 'Tokyo';
          taskLog(t, 'working', `POST .../task/${data.id}/input {answer: "${city}"}`);
          const r2 = await fetch(`${c!.base}/switchboard/task/${data.id}/input`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: city }) });
          const data2 = await r2.json();
          if (dead) return;
          t.result = data2.artifacts?.[0]?.text ?? JSON.stringify(data2);
          taskLog(t, 'completed', 'done (real second process)');
        } else {
          t.result = data.artifacts?.[0]?.text ?? JSON.stringify(data);
          taskLog(t, 'completed', 'done (real second process)');
        }
      } catch (e: any) {
        taskLog(t, 'failed', `companion request failed: ${e?.message ?? e}`);
      }
    }
    $('.sb-run-local').addEventListener('click', () => { persist(); void runLocalTask(promptEl.value.trim() || 'hello'); });
    $('.sb-run-companion').addEventListener('click', () => { persist(); void runCompanionTask(promptEl.value.trim() || 'hello'); });

    /* ── companion probe lane ── */
    const cardOut = $('.sb-card-out');
    const bannerBox = $('.sb-companion-banner');
    const runCompanionBtn = $<HTMLButtonElement>('.sb-run-companion');
    async function probeAndRender() {
      let c: Companion | null = null;
      try { c = await probeCompanion(); } catch { c = null; }
      if (dead) return;
      const live = hasDemo(c, 'switchboard');
      bannerBox.innerHTML = '';
      bannerBox.appendChild(companionBanner(c, 'switchboard', 'the A2A-ish lane runs entirely in this tab instead.'));
      runCompanionBtn.disabled = !live;
      runCompanionBtn.title = live ? 'Round-trip to the real companion process' : 'Run `npm run node` in the repo, then reload, to enable this';
      if (!live) { cardOut.className = 'code sb-card-out'; cardOut.textContent = c ? 'companion is up but the switchboard demo did not mount — see settings.' : 'companion not running. Start it with `npm run node` for a real second-process agent card + task endpoint.'; return; }
      try {
        const r = await fetch(`${c!.base}/switchboard/agent-card`);
        const card = await r.json();
        if (dead) return;
        cardOut.className = 'code sb-card-out ok';
        cardOut.textContent = JSON.stringify(card, null, 2);
        log('companion', `GET /switchboard/agent-card → ${card.name}`);
      } catch (e: any) {
        cardOut.className = 'code sb-card-out err';
        cardOut.textContent = `agent-card probe failed: ${e?.message ?? e}`;
      }
    }

    /* ── boot ── */
    toolSel.innerHTML = server.tools().map((t) => `<option value="${esc(t.name)}">${esc(t.name)}${t.annotations?.destructiveHint ? '  (destructive)' : '  (read-only)'}</option>`).join('');
    updateArgVisibility();
    renderInbox();
    renderTasks();
    void probeAndRender();

    // Zero-input default state: seed one MCP call and one A2A task so the shared
    // inbox already has something in it before the visitor touches anything.
    void (async () => {
      await sleep(150); if (dead) return;
      await callMcp('ping', {});
      if (dead) return;
      await sleep(200); if (dead) return;
      void callMcp('broadcast_alert', { message: toolArg.value });
      await sleep(300); if (dead) return;
      void runLocalTask(promptEl.value.trim() || DEFAULTS.prompt);
    })();

    return () => {
      dead = true;
      for (const d of disposers) { try { d(); } catch {} }
    };
  },
};

export default playground;
