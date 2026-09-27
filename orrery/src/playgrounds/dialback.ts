import type { Playground } from '../registry';
import { Agent, Server } from '@johnhenry/dialback';
import type { Connection } from '@johnhenry/dialback';
import { probeCompanion, hasDemo, companionBanner, type Companion } from '../companion';
import { readState, writeState, copyLink } from '../state';
import './dialback.css';

/* ------------------------------------------------------------------ */
/* Presets: the (Request) => Response "service" that lives in this tab */
/* ------------------------------------------------------------------ */

interface Preset { label: string; code: string; method: string; path: string; body: string; blurb: string }

const PRESETS: Record<string, Preset> = {
  counter: {
    label: 'Counter',
    method: 'GET', path: '/visit', body: '',
    blurb: 'Every tunnelled request bumps a counter in this page, so you can watch requests land.',
    code: `// Runs in THIS tab. Every request that reaches the public server is
// tunnelled down the WebSocket and handed to this function.
async (request, { id }) => {
  const url = new URL(request.url);
  if (url.pathname === '/reset') state.count = 0;
  else state.count = (state.count ?? 0) + 1;

  stage.bump(state.count);                       // mutate the page
  stage.say(\`\${request.method} \${url.pathname} → visit #\${state.count}\`);

  return Response.json({
    count: state.count,
    requestId: id,
    servedBy: 'a browser tab behind a NAT',
  });
}`,
  },
  status: {
    label: 'JSON status',
    method: 'GET', path: '/status', body: '',
    blurb: 'A health endpoint that reports things only this tab knows.',
    code: `// A status endpoint. Everything in here is read from the tab itself:
// the server has no idea what a "viewport" is.
async (request) => {
  stage.say('status checked');
  return Response.json({
    ok: true,
    agent,                                        // this Agent's handshake id
    path: new URL(request.url).pathname,
    tab: {
      visible: document.visibilityState,
      language: navigator.language,
      viewport: \`\${innerWidth}×\${innerHeight}\`,
      online: navigator.onLine,
    },
    uptimeSeconds: Math.round(performance.now() / 1000),
    servedAt: new Date().toISOString(),
  });
}`,
  },
  html: {
    label: 'Tiny HTML page',
    method: 'GET', path: '/hello?name=world', body: '',
    blurb: 'Serve a web page out of a browser tab. Try ?name=you.',
    code: `// Serve an HTML page from a browser tab. Try /hello?name=you
async (request) => {
  const url = new URL(request.url);
  const name = (url.searchParams.get('name') ?? 'stranger').replace(/[<>&"]/g, '');
  stage.say(\`rendered a page for \${name}\`);
  const html = \`<!doctype html><meta charset="utf-8">
<body style="font:16px system-ui;background:#0b1020;color:#e6f0ff;padding:20px">
  <h1 style="margin:0 0 8px">Hello, \${name}</h1>
  <p>This page was generated inside a browser tab at
     <b>\${new Date().toLocaleTimeString()}</b> and dialled back to you
     down the same WebSocket the tab opened.</p>
  <p style="opacity:.7">path <code>\${url.pathname}</code></p>
</body>\`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}`,
  },
  echo: {
    label: 'Echo',
    method: 'POST', path: '/echo', body: '{"hello":"tunnel"}',
    blurb: 'Echo the method, headers and streamed body back. POST something.',
    code: `// Echo the request. The body is streamed down the socket as
// request:body frames and reassembled here into a real Request.
async (request) => {
  const body = request.body ? await request.text() : null;
  stage.say(\`echoed \${request.method} with \${body?.length ?? 0} bytes\`);
  return Response.json({
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers),
    body,
  });
}`,
  },
};

const DEFAULTS = { preset: 'counter', method: '', path: '', body: '', code: '', slowmo: true };
const SECRET = 'orrery-dialback'; // must match server/demos/dialback.mjs
const SVGNS = 'http://www.w3.org/2000/svg';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const b64len = (s: string) => Math.floor((s.length * 3) / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);

type Wire = { kind: string; id?: string; agent?: string; payload?: any };
type Tap = (dir: 'in' | 'out', msg: Wire) => void;

/* ------------------------------------------------------------------ */
/* Transports: anything with send/addEventListener/close/on satisfies  */
/* dialback's Connection shape (see types.d.ts), so the browser can be */
/* the Agent: we hand Agent a `transport` instead of letting it call   */
/* `new WebSocket()` from the Node `ws` package.                       */
/* ------------------------------------------------------------------ */

/** Wrap a browser WebSocket (already open) as a dialback Connection, tapping every frame. */
function wrapWebSocket(ws: WebSocket, tap: Tap): Connection {
  ws.addEventListener('message', (ev) => { try { tap('in', JSON.parse(String(ev.data))); } catch {} });
  return {
    send(d: string) { try { tap('out', JSON.parse(d)); } catch {} ws.send(d); },
    addEventListener(t: string, f: (e: any) => void) { ws.addEventListener(t, f); },
    on(t: string, f: (...a: any[]) => void) { ws.addEventListener(t, f); },
    close() { ws.close(); },
    get bufferedAmount() { return ws.bufferedAmount; },
  } as Connection;
}

/** An in-memory socket pair over a MessageChannel: real async hops, no network. */
function memoryPair(tap: Tap): { agentSide: Connection; serverSide: Connection; close: () => void } {
  const mc = new MessageChannel();
  const closers: Array<() => void> = [];
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    mc.port1.close(); mc.port2.close();
    for (const f of closers.splice(0)) { try { f(); } catch {} }
  };
  const side = (port: MessagePort, tapDir: 'in' | 'out' | null): Connection => {
    port.start();
    return {
      send(d: string) {
        if (closed) return;
        if (tapDir === 'out') { try { tap('out', JSON.parse(d)); } catch {} }
        port.postMessage(d);
      },
      addEventListener(t: string, f: (e: any) => void) {
        if (t === 'message') port.addEventListener('message', f);
        else if (t === 'close') closers.push(() => f({}));
      },
      on(t: string, f: (...a: any[]) => void) { if (t === 'close') closers.push(() => f()); },
      close,
      bufferedAmount: 0,
    } as Connection;
  };
  mc.port1.addEventListener('message', (ev) => { try { tap('in', JSON.parse(String(ev.data))); } catch {} });
  return { agentSide: side(mc.port1, 'out'), serverSide: side(mc.port2, null), close };
}

/* ------------------------------------------------------------------ */
/* The planet                                                             */
/* ------------------------------------------------------------------ */

const playground: Playground = {
  id: 'dialback',
  title: 'Dialback Tunnel',
  pkg: '@johnhenry/dialback',
  hue: 130,
  blurb: 'The browser is the agent behind the firewall: it dials out, and the server dials back down the same socket.',
  docs: 'https://opensource.johnhenry.me/dialback/',
  async mount(host) {
    const disposers: Array<() => void> = [];
    let dead = false;
    const st = readState(DEFAULTS);
    if (!PRESETS[st.preset]) st.preset = 'counter';
    const P = () => PRESETS[st.preset];
    const cur = {
      method: st.method || P().method,
      path: st.path || P().path,
      body: st.body || P().body,
      code: st.code || P().code,
    };
    const save = () => writeState({
      ...st,
      method: cur.method === P().method ? '' : cur.method,
      path: cur.path === P().path ? '' : cur.path,
      body: cur.body === P().body ? '' : cur.body,
      code: cur.code === P().code ? '' : cur.code,
    }, DEFAULTS);

    const root = document.createElement('div');
    root.className = 'pg-dialback';
    host.appendChild(root);
    root.innerHTML = `<div class="loading">probing for the Node companion…</div>`;

    const c: Companion | null = await probeCompanion();
    if (dead) return;
    const live = hasDemo(c, 'dialback');
    root.innerHTML = '';
    root.appendChild(companionBanner(c, 'dialback',
      'The real dialback <code>Server</code> runs inside this page, and the Agent dials it over an in-memory MessageChannel socket.'));

    root.insertAdjacentHTML('beforeend', `
      <section class="panel topo-panel">
        <div class="topo-head">
          <div class="conn"><span class="led"></span><span class="conn-text">dialling…</span></div>
          <div class="spacer"></div>
          <label class="tog"><input type="checkbox" class="slowmo"> slow-motion packets</label>
          <button class="btn knock" title="An inbound connection straight to the tab">knock on the tab directly</button>
          <button class="btn redial">redial</button>
          <button class="btn hangup">hang up</button>
        </div>
        <svg class="topo" viewBox="0 0 1000 270" preserveAspectRatio="xMidYMid meet" aria-label="topology: public client, public server, NAT, this tab"></svg>
        <div class="legend">
          <span><i class="k dial"></i>outbound dial (agent → server)</span>
          <span><i class="k req"></i>tunnelled request</span>
          <span><i class="k res"></i>response</span>
          <span><i class="k blk"></i>unsolicited inbound (dropped by NAT)</span>
        </div>
      </section>

      <div class="grid-2 main">
        <section class="panel svc">
          <div class="ph"><h3>The service <small>runs in this tab</small></h3>
            <div class="presets"></div></div>
          <p class="pblurb"></p>
          <textarea class="code editor" spellcheck="false"></textarea>
          <div class="sig mono">in scope: <b>state</b> (persists across requests) · <b>stage</b>.bump(n) / .say(text) / .color(css) · <b>agent</b> (this Agent's id)</div>
          <pre class="code err" hidden></pre>
        </section>

        <section class="panel pub">
          <div class="ph"><h3>The public side <small class="pubwhere"></small></h3>
            <button class="btn copy-link" title="copy a deep link to this preset">copy link</button></div>
          <div class="curl">
            <div class="curl-label"></div>
            <div class="curl-row"><code class="curl-cmd mono"></code><button class="btn copy-curl">copy</button></div>
          </div>
          <div class="req-row">
            <select class="method"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select>
            <input class="path mono" spellcheck="false">
          </div>
          <textarea class="code reqbody" spellcheck="false" placeholder="request body"></textarea>
          <div class="send-row">
            <button class="btn primary send">send a request from the page</button>
            <button class="btn burst" title="five concurrent requests">burst ×5</button>
          </div>
          <div class="resp">
            <div class="resp-head mono"><span class="muted">no response yet</span></div>
            <div class="resp-body"></div>
          </div>
        </section>
      </div>

      <div class="grid-2 lower">
        <section class="panel stagep">
          <div class="ph"><h3>This tab's page <small>state the handler mutates</small></h3>
            <button class="btn reset-state">reset state</button></div>
          <div class="stage">
            <div class="big"><span class="num">0</span><small>requests served by this tab</small></div>
            <ul class="said"></ul>
          </div>
        </section>
        <section class="panel wirep">
          <div class="ph"><h3>Wire tap <small>JSON frames on the socket</small></h3></div>
          <div class="kinds"></div>
          <pre class="code last"></pre>
        </section>
      </div>

      <section class="panel logp">
        <div class="ph"><h3>Tunnel log</h3><span class="stat totals"></span></div>
        <table class="log mono"><thead><tr><th>#</th><th>from</th><th>method</th><th>path</th><th>status</th><th>bytes</th><th>ms</th></tr></thead><tbody></tbody></table>
      </section>

      <section class="panel how">
        <h3>What's happening</h3>
        <ol>
          <li><b>This tab is the Agent.</b> <code>new Agent(address, { transport${live ? ', secret' : ''} })</code> — the Agent never opens a port; it
            dials <em>out</em> (${live ? `a browser <code>WebSocket</code> to <code>${esc(c!.wsBase)}/dialback/agent</code>` : 'an in-memory MessageChannel socket to the in-page Server'}) and sends
            an <code>{kind:"agent"}</code> handshake with its id${live ? ' and the shared secret' : ''}. Outbound traffic is what a NAT lets through.</li>
          <li><b>The Server dials back through that socket.</b> ${live ? 'The companion' : 'The page'} holds a real <code>new Server(…)</code>
            and calls <code>server.addConnection(socket)</code>. Any HTTP request it gets goes to <code>server.fetch(request)</code>, which
            serialises it into a <code>request</code> frame (+ <code>request:body</code> chunks) down the socket.</li>
          <li><b>The handler answers.</b> <code>agent.serve(handler)</code> rebuilds a real <code>Request</code>, calls your function, and streams the
            <code>Response</code> back as <code>response</code> + base64 <code>response:body</code> frames. <code>server.fetch()</code> resolves with it.</li>
          <li><b>Nothing reaches in.</b> "Knock on the tab directly" is an unsolicited inbound connection: the NAT has no mapping for it and drops it.
            Only replies on the connection the tab opened get through — that's the whole trick.</li>
        </ol>
        ${live ? '' : `<p class="muted">Without the companion there's no port to <code>curl</code>, so the "public side" calls <code>server.fetch()</code> on the in-page Server directly. Run <code>npm run node</code> and reload to put the Server in Node and get a real URL.</p>`}
      </section>`);

    const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as unknown as T;
    const editor = $<HTMLTextAreaElement>('.editor');
    const errBox = $<HTMLPreElement>('.err');
    const methodSel = $<HTMLSelectElement>('.method');
    const pathIn = $<HTMLInputElement>('.path');
    const bodyIn = $<HTMLTextAreaElement>('.reqbody');
    const slowmoIn = $<HTMLInputElement>('.slowmo');
    const ledText = $('.conn-text');
    const connEl = $('.conn');
    const tbody = $('.log tbody');
    const svg = $<SVGSVGElement>('.topo');

    /* -------------------------- topology SVG ------------------------- */
    const X = { client: 95, server: 360, nat: 610, tab: 855 };
    const Y = 140;
    svg.innerHTML = `
      <defs>
        <linearGradient id="dbTube" x1="0" x2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".15"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".35"/></linearGradient>
        <pattern id="dbBricks" width="24" height="14" patternUnits="userSpaceOnUse">
          <rect width="24" height="14" fill="var(--bg-inset)"/><path d="M0 0H24M0 7H24M12 0V7M0 7V14M24 7V14" stroke="var(--line)" stroke-width="1.5"/></pattern>
      </defs>
      <text x="${X.client + 130}" y="24" class="zone">PUBLIC INTERNET</text>
      <text x="${X.tab}" y="24" class="zone">PRIVATE NETWORK</text>
      <line x1="${X.client + 40}" y1="${Y}" x2="${X.server - 70}" y2="${Y}" class="wire legA"/>
      <path class="tube" d="M${X.server + 70} ${Y} H${X.tab - 70}" />
      <path class="tube-flow" d="M${X.tab - 70} ${Y} H${X.server + 70}" />
      <g class="nat">
        <rect x="${X.nat - 14}" y="40" width="28" height="${Y - 52}" fill="url(#dbBricks)" rx="3"/>
        <rect x="${X.nat - 14}" y="${Y + 12}" width="28" height="${230 - Y - 12}" fill="url(#dbBricks)" rx="3"/>
        <rect x="${X.nat - 16}" y="${Y - 12}" width="32" height="24" class="hole" rx="4"/>
        <text x="${X.nat}" y="252" class="lbl">NAT / firewall</text>
        <text x="${X.nat}" y="266" class="sub">outbound only</text>
      </g>
      <g class="node client"><circle cx="${X.client}" cy="${Y}" r="38"/><text x="${X.client}" y="${Y - 2}" class="icon">$_</text>
        <text x="${X.client}" y="${Y + 62}" class="lbl">public client</text><text x="${X.client}" y="${Y + 78}" class="sub">${live ? 'curl · this page' : 'this page'}</text></g>
      <g class="node server"><rect x="${X.server - 70}" y="${Y - 44}" width="140" height="88" rx="12"/>
        <text x="${X.server}" y="${Y - 8}" class="title">dialback Server</text>
        <text x="${X.server}" y="${Y + 12}" class="sub mono">${live ? 'localhost:7777' : 'in this page'}</text>
        <text x="${X.server}" y="${Y + 30}" class="sub mono">server.fetch(req)</text></g>
      <g class="node tab"><rect x="${X.tab - 70}" y="${Y - 50}" width="140" height="100" rx="12"/>
        <text x="${X.tab}" y="${Y - 26}" class="title">this tab</text>
        <text x="${X.tab}" y="${Y - 8}" class="sub mono agent-id">Agent</text>
        <rect x="${X.tab - 52}" y="${Y + 4}" width="104" height="30" rx="6" class="handler"/>
        <text x="${X.tab}" y="${Y + 24}" class="sub mono">handler(req)</text></g>
      <text x="${(X.server + X.tab) / 2}" y="34" class="tube-lbl">WebSocket the tab dialled out</text>
      <g class="packets"></g>`;
    const packetsG = svg.querySelector('.packets') as SVGGElement;
    const tabNode = svg.querySelector('.node.tab') as SVGGElement;
    const serverNode = svg.querySelector('.node.server') as SVGGElement;
    const agentIdText = svg.querySelector('.agent-id') as SVGTextElement;
    const flash = (el: Element, cls = 'hit') => { el.classList.remove(cls); void (el as HTMLElement).getBoundingClientRect(); el.classList.add(cls); };

    // Leg endpoints. "A" = client⇄server over the open internet, "B" = server⇄tab through the tunnel.
    const LEG = {
      A: [X.client + 40, X.server - 72] as const,
      B: [X.server + 72, X.tab - 72] as const,
    };
    interface Pkt { x0: number; x1: number; t0: number; dur: number; g: SVGGElement; done: () => void; bounce?: number; y?: number }
    const pkts: Pkt[] = [];
    let raf = 0;
    const chain = new Map<string, number>(); // id → time its visual sequence is free again
    const slow = () => st.slowmo;
    const legDur = () => (slow() ? 650 : 220);

    function drawPkt(cls: string, label: string): SVGGElement {
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', `pkt ${cls}`);
      g.innerHTML = `<circle r="9"/><text y="-15">${esc(label)}</text>`;
      g.style.opacity = '0';
      packetsG.appendChild(g);
      return g;
    }
    function tick() {
      raf = 0;
      const now = performance.now();
      for (let i = pkts.length - 1; i >= 0; i--) {
        const p = pkts[i];
        if (now < p.t0) continue;
        let k = Math.min(1, (now - p.t0) / p.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        let x = p.x0 + (p.x1 - p.x0) * e;
        if (p.bounce !== undefined) {
          // travel to the wall, then fall away
          const hit = 0.55;
          if (k < hit) x = p.x0 + (p.bounce - p.x0) * (k / hit);
          else { x = p.bounce - 40 * ((k - hit) / (1 - hit)); p.g.setAttribute('transform', `translate(${x},${(p.y ?? Y) + 70 * Math.pow((k - hit) / (1 - hit), 2)})`); p.g.style.opacity = String(1 - (k - hit) / (1 - hit)); if (k >= 1) { p.g.remove(); pkts.splice(i, 1); p.done(); } continue; }
        }
        p.g.style.opacity = '1';
        p.g.setAttribute('transform', `translate(${x},${p.y ?? Y})`);
        if (k >= 1) { p.g.remove(); pkts.splice(i, 1); p.done(); }
      }
      if (pkts.length) raf = requestAnimationFrame(tick);
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(tick); };
    /** Queue a packet on a leg, after whatever this id's sequence already has in flight. */
    function hop(id: string, leg: 'A' | 'B', fwd: boolean, cls: string, label: string, dur = legDur()): Promise<void> {
      const [a, b] = LEG[leg];
      const now = performance.now();
      const t0 = Math.max(now, chain.get(id) ?? now);
      chain.set(id, t0 + dur);
      return new Promise((done) => {
        pkts.push({ x0: fwd ? a : b, x1: fwd ? b : a, t0, dur, g: drawPkt(cls, label), done });
        kick();
      });
    }
    function knock() {
      const g = drawPkt('blk', 'SYN →');
      pkts.push({ x0: X.client + 30, x1: X.tab, t0: performance.now(), dur: 1500, g, bounce: X.nat - 18, y: Y + 62, done: () => {} });
      kick();
      setTimeout(() => flash(svg.querySelector('.nat')!, 'deny'), 700);
    }
    function dialAnim() {
      const g = drawPkt('dial', 'dial');
      pkts.push({ x0: LEG.B[1], x1: LEG.B[0], t0: performance.now(), dur: 900, g, done: () => flash(serverNode) });
      kick();
    }

    /* ------------------------- page state/stage ---------------------- */
    let state: Record<string, any> = {};
    const numEl = $('.num');
    const saidEl = $('.said');
    const stageEl = $('.stage');
    const stage = {
      bump(n: number) { numEl.textContent = String(n); flash(numEl, 'pop'); },
      say(text: string) {
        const li = document.createElement('li');
        li.innerHTML = `<time>${new Date().toLocaleTimeString()}</time> ${esc(String(text))}`;
        saidEl.prepend(li);
        while (saidEl.children.length > 7) saidEl.lastElementChild!.remove();
      },
      color(css: string) { stageEl.style.setProperty('--stage', css); },
    };
    const resetState = () => { state = {}; numEl.textContent = '0'; saidEl.innerHTML = ''; stageEl.style.removeProperty('--stage'); };
    $('.reset-state').addEventListener('click', resetState);

    /* ------------------------- handler compile ----------------------- */
    type Factory = (state: any, stage: any, agent: string) => (req: Request, ctx: any) => any;
    let factory: Factory | null = null;
    function compile() {
      try {
        const f = new Function('state', 'stage', 'agent', `"use strict";\nreturn (${cur.code}\n);`) as Factory;
        const probe = f({}, stage, '');
        if (typeof probe !== 'function') throw new TypeError('the editor must evaluate to a function (request, { id }) => Response');
        factory = f; errBox.hidden = true;
      } catch (e: any) {
        errBox.hidden = false; errBox.textContent = `compile error — still serving the previous handler\n${e?.message ?? e}`;
      }
    }

    /* ------------------------------ agent ---------------------------- */
    let agent: Agent | null = null;
    let agentId = '';
    let registered = false;
    let pageServer: Server | null = null;
    let pair: ReturnType<typeof memoryPair> | null = null;
    let gen = 0;
    const arrivals = new Map<string, Promise<void>>();

    // Wire-tap counters + log rows
    const kinds = new Map<string, { in: number; out: number }>();
    const kindsEl = $('.kinds');
    const lastEl = $('.last');
    let reqN = 0, served = 0, bytesTotal = 0;
    interface Row { tr: HTMLTableRowElement; t0: number; bytes: number; page: boolean }
    const rows = new Map<string, Row>();
    const pageTags = new Map<string, string>(); // x-orrery-tag → animation chain id used before the wire id existed

    function renderKinds() {
      const order = ['agent', 'request', 'request:body', 'request:body:end', 'response', 'response:body?', 'response:body', 'response:body:end', 'orrery:welcome'];
      kindsEl.innerHTML = order.filter((k) => kinds.has(k)).map((k) => {
        const v = kinds.get(k)!;
        return `<span class="kind"><code>${k}</code>${v.out ? `<b class="o">↑${v.out}</b>` : ''}${v.in ? `<b class="i">↓${v.in}</b>` : ''}</span>`;
      }).join('');
    }
    const totals = () => { $('.totals').innerHTML = `<b>${reqN}</b> tunnelled · <b>${served}</b> answered · <b>${bytesTotal}</b> body bytes back up the socket`; };

    const tap: Tap = (dir, m) => {
      if (!m || typeof m.kind !== 'string') return;
      const k = kinds.get(m.kind) ?? { in: 0, out: 0 };
      k[dir]++; kinds.set(m.kind, k); renderKinds();
      const shown = m.kind === 'response:body' ? { ...m, payload: { ...m.payload, body: String(m.payload?.body ?? '').slice(0, 48) + '…' } } : m;
      lastEl.textContent = `${dir === 'in' ? '↓ server → tab' : '↑ tab → server'}\n${JSON.stringify(shown, null, 2)}`;

      if (m.kind === 'agent' && dir === 'out') { agentId = m.agent || ''; agentIdText.textContent = agentId; }
      if (m.kind === 'orrery:welcome') { registered = true; setConn('up'); refreshPublic(); }
      if (m.kind === 'request' && m.id) {
        const id = m.id; const p = m.payload || {};
        const tag = p.headers?.['x-orrery-tag'];
        const page = !!tag;
        if (tag && pageTags.has(tag)) { chain.set(id, chain.get(pageTags.get(tag)!) ?? performance.now()); pageTags.set(tag, id); }
        reqN++; totals();
        const u = new URL(p.url);
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${reqN}</td><td class="${page ? 'pg' : 'ext'}">${page ? 'page' : live ? 'curl / other' : 'other'}</td><td>${esc(p.method)}</td><td class="p">${esc(u.pathname + u.search)}</td><td class="s">…</td><td class="b">–</td><td class="ms">…</td>`;
        tbody.prepend(tr);
        while (tbody.children.length > 40) tbody.lastElementChild!.remove();
        rows.set(id, { tr, t0: performance.now(), bytes: 0, page });
        if (!page) hop(id, 'A', true, 'req ext', p.method);
        arrivals.set(id, hop(id, 'B', true, 'req', `${p.method} ${u.pathname}`.slice(0, 22)).then(() => flash(tabNode)));
      }
      if (m.kind === 'response' && m.id) {
        const r = rows.get(m.id); const s = m.payload?.status;
        if (r) { const td = r.tr.querySelector('.s')!; td.textContent = String(s); td.className = `s ${s >= 400 ? 'bad' : 'ok'}`; }
        const id = m.id;
        hop(id, 'B', false, `res ${s >= 400 ? 'bad' : ''}`, String(s)).then(() => flash(serverNode));
        if (!r?.page) hop(id, 'A', false, `res ${s >= 400 ? 'bad' : ''}`, String(s)).then(() => chain.delete(id));
        if (!m.payload?.body) finishRow(id);
      }
      if (m.kind === 'response:body' && m.id) { const r = rows.get(m.id); if (r) r.bytes += b64len(m.payload?.body || ''); }
      if (m.kind === 'response:body:end' && m.id) finishRow(m.id);
    };
    function finishRow(id: string) {
      const r = rows.get(id); if (!r) return;
      served++; bytesTotal += r.bytes; totals();
      r.tr.querySelector('.b')!.textContent = String(r.bytes);
      r.tr.querySelector('.ms')!.textContent = (performance.now() - r.t0).toFixed(0);
      rows.delete(id); arrivals.delete(id);
    }

    function setConn(s: 'dialing' | 'up' | 'down', note = '') {
      connEl.dataset.s = s;
      svg.dataset.s = s;
      ledText.innerHTML = s === 'up'
        ? `connected · agent <code>${esc(agentId)}</code>${live ? ' · secret accepted' : ''}`
        : s === 'dialing' ? 'dialling out…' : `socket closed${note ? ' — ' + esc(note) : ''}`;
    }

    const handler = async (request: Request, ctx: { id: string }) => {
      if (st.slowmo) await (arrivals.get(ctx.id) ?? Promise.resolve());
      if (!factory) return new Response('no handler compiled', { status: 500 });
      try {
        const out = await factory(state, stage, agentId)(request, ctx);
        if (!(out instanceof Response)) throw new TypeError(`handler returned ${typeof out}, not a Response`);
        return out;
      } catch (e: any) {
        errBox.hidden = false; errBox.textContent = `handler threw while serving ${request.method} ${new URL(request.url).pathname}\n${e?.stack ?? e}`;
        return new Response(`handler error: ${e?.message ?? e}`, { status: 500, headers: { 'content-type': 'text/plain' } });
      }
    };

    async function dial() {
      const my = ++gen;
      hangup(false);
      registered = false; agentId = '';
      agentIdText.textContent = 'Agent';
      setConn('dialing');
      refreshPublic();
      try {
        if (live) {
          const transport = (address: string) => new Promise<Connection>((res, rej) => {
            const ws = new WebSocket(address);
            ws.addEventListener('open', () => {
              dialAnim();
              res(wrapWebSocket(ws, tap));
            }, { once: true });
            ws.addEventListener('error', () => rej(new Error(`could not dial ${address}`)), { once: true });
            ws.addEventListener('close', () => { if (my === gen && !dead) { registered = false; setConn('down', 'the server went away'); refreshPublic(); } });
          });
          agent = new Agent(`${c!.wsBase}/dialback/agent`, { transport, secret: SECRET });
        } else {
          const server = new Server(() => new Response('no agent is dialled in', { status: 503 }), { allowUnauthenticatedAgents: true });
          pageServer = server;
          const p = memoryPair(tap);
          pair = p;
          server.addConnection(p.serverSide);
          p.serverSide.addEventListener('close', () => server.removeConnection(p.serverSide));
          const transport = async () => { dialAnim(); return p.agentSide; };
          agent = new Agent('memory://in-page-server', { transport });
          await agent.connection;
          // give the Server's read loop a tick to register the handshake
          setTimeout(() => {
            if (my !== gen) return;
            registered = !!server.getConnectionById(agentId);
            setConn(registered ? 'up' : 'down', registered ? '' : 'handshake not registered');
            refreshPublic();
          }, 30);
        }
        (agent as any).on?.('error', (e: any) => { if (my === gen) setConn('down', e?.message ?? String(e)); });
        agent.serve(handler as any);
      } catch (e: any) {
        setConn('down', e?.message ?? String(e));
      }
    }
    function hangup(update = true) {
      const a = agent; agent = null;
      if (a) a.close().catch(() => {});
      pair?.close(); pair = null; pageServer = null;
      registered = false;
      if (update) { gen++; setConn('down', 'you hung up'); refreshPublic(); }
    }

    /* --------------------------- public side ------------------------- */
    const publicBase = () => (live ? `${c!.base}/dialback/${agentId || '<agentId>'}` : `in-page://dialback/${agentId || '<agentId>'}`);
    function refreshPublic() {
      $('.pubwhere').textContent = live ? 'anyone who can reach localhost:7777' : 'the in-page Server';
      const url = publicBase() + (cur.path.startsWith('/') ? cur.path : '/' + cur.path);
      const bodyFlag = cur.method !== 'GET' && cur.method !== 'HEAD' && cur.body ? ` -d '${cur.body.replace(/'/g, "'\\''")}'` : '';
      const methodFlag = cur.method === 'GET' ? '' : ` -X ${cur.method}`;
      $('.curl-cmd').textContent = `curl -s${methodFlag}${bodyFlag} '${url}'`;
      $('.curl-label').innerHTML = live
        ? (registered ? '<b>curl this from any terminal on this machine</b> — the request goes to Node, then back down to this tab:' : 'waiting for the agent to register…')
        : '<b>curl needs the companion</b> — there is no port without it. This is what you would run:';
      $('.curl').classList.toggle('off', !live || !registered);
      bodyIn.hidden = cur.method === 'GET' || cur.method === 'HEAD';
    }

    const respHead = $('.resp-head');
    const respBody = $('.resp-body');
    let sendN = 0;
    async function sendOne(showResult: boolean) {
      const tag = `t${++sendN}`;
      const url = publicBase() + (cur.path.startsWith('/') ? cur.path : '/' + cur.path);
      const init: RequestInit = { method: cur.method, headers: { 'x-orrery-from': 'page', 'x-orrery-tag': tag } };
      if (!bodyIn.hidden && cur.body) { init.body = cur.body; (init.headers as any)['content-type'] = cur.body.trim().startsWith('{') ? 'application/json' : 'text/plain'; }
      // Leg A (client → server) starts now; the wire id takes over once the frame hits the socket.
      const chainId = `page:${tag}`;
      pageTags.set(tag, chainId);
      hop(chainId, 'A', true, 'req', cur.method);
      const t0 = performance.now();
      try {
        let res: Response;
        if (live) res = await fetch(url, init);
        else {
          if (!pageServer) throw new Error('not connected — press redial');
          res = await pageServer.fetch(new Request(`https://public.example${cur.path.startsWith('/') ? cur.path : '/' + cur.path}`, init));
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        const ms = performance.now() - t0;
        const wid = pageTags.get(tag) ?? chainId; // the wire id, once the request frame was seen
        pageTags.delete(tag);
        // Let the response packet finish its trip back to the client before we show it.
        const back = hop(wid, 'A', false, `res ${res.status >= 400 ? 'bad' : ''}`, String(res.status))
          .then(() => { chain.delete(wid); chain.delete(chainId); });
        if (showResult) {
          if (st.slowmo) await back;
          renderResponse(res, buf, ms);
        }
      } catch (e: any) {
        pageTags.delete(tag);
        if (showResult) { respHead.innerHTML = `<span class="bad">network error</span>`; respBody.innerHTML = `<pre class="code">${esc(String(e?.message ?? e))}</pre>`; }
      }
    }
    function renderResponse(res: Response, buf: Uint8Array, ms: number) {
      const ct = res.headers.get('content-type') || '';
      const text = new TextDecoder().decode(buf);
      const hdrs = [...res.headers].filter(([k]) => !k.startsWith('access-control')).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('\n');
      respHead.innerHTML = `<span class="${res.status >= 400 ? 'bad' : 'ok'}">${res.status} ${esc(res.statusText)}</span> <span class="muted">${buf.length} B · ${ms.toFixed(0)} ms round trip</span>`;
      if (ct.includes('text/html')) {
        respBody.innerHTML = `<iframe sandbox title="HTML served by this tab"></iframe><details><summary>headers</summary><pre class="code">${hdrs}</pre></details>`;
        (respBody.querySelector('iframe') as HTMLIFrameElement).srcdoc = text;
      } else {
        let pretty = text;
        if (ct.includes('json')) { try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {} }
        respBody.innerHTML = `<pre class="code">${esc(pretty)}</pre><details><summary>headers</summary><pre class="code">${hdrs}</pre></details>`;
      }
    }

    /* ----------------------------- wiring ---------------------------- */
    const presetsEl = $('.presets');
    function renderPresets() {
      presetsEl.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button class="chip preset ${k === st.preset ? 'on' : ''}" data-k="${k}">${p.label}</button>`).join('');
      $('.pblurb').textContent = P().blurb;
    }
    function syncInputs() {
      editor.value = cur.code; methodSel.value = cur.method; pathIn.value = cur.path; bodyIn.value = cur.body;
      slowmoIn.checked = st.slowmo;
    }
    presetsEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('.preset') as HTMLElement | null;
      if (!b) return;
      st.preset = b.dataset.k!;
      Object.assign(cur, { method: P().method, path: P().path, body: P().body, code: P().code });
      renderPresets(); syncInputs(); compile(); refreshPublic(); save();
      sendOne(true);
    });
    let ct = 0;
    editor.addEventListener('input', () => { cur.code = editor.value; clearTimeout(ct); ct = window.setTimeout(() => { compile(); save(); }, 250); });
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); editor.dispatchEvent(new Event('input')); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); compile(); sendOne(true); }
    });
    methodSel.addEventListener('change', () => { cur.method = methodSel.value; refreshPublic(); save(); });
    pathIn.addEventListener('input', () => { cur.path = pathIn.value; refreshPublic(); save(); });
    pathIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendOne(true); });
    bodyIn.addEventListener('input', () => { cur.body = bodyIn.value; refreshPublic(); save(); });
    slowmoIn.addEventListener('change', () => { st.slowmo = slowmoIn.checked; save(); });
    $('.send').addEventListener('click', () => sendOne(true));
    $('.burst').addEventListener('click', () => { for (let i = 0; i < 5; i++) setTimeout(() => sendOne(i === 4), i * 90); });
    $('.knock').addEventListener('click', knock);
    $('.redial').addEventListener('click', () => dial());
    $('.hangup').addEventListener('click', () => hangup());
    $('.copy-link').addEventListener('click', async (e) => { save(); await new Promise((r) => setTimeout(r, 200)); await copyLink(); const b = e.currentTarget as HTMLElement; b.textContent = 'copied'; setTimeout(() => (b.textContent = 'copy link'), 1200); });
    $('.copy-curl').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText($('.curl-cmd').textContent || ''); } catch {} const b = e.currentTarget as HTMLElement; b.textContent = 'copied'; setTimeout(() => (b.textContent = 'copy'), 1200); });

    renderPresets(); syncInputs(); compile(); totals(); refreshPublic();
    await dial();
    // Zero-input demo: once the tunnel is up, send one request around the loop, and show the NAT dropping a direct knock.
    const boot = window.setTimeout(async () => {
      if (dead) return;
      await sendOne(true);
      if (!dead) setTimeout(() => !dead && knock(), 400);
    }, 1100);

    disposers.push(() => clearTimeout(boot), () => clearTimeout(ct));
    return () => {
      dead = true;
      gen++;
      hangup(false);
      cancelAnimationFrame(raf);
      for (const d of disposers) d();
      root.remove();
    };
  },
};

export default playground;
