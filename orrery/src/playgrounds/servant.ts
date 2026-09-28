import type { Playground } from '../registry';
import { har, type HarEntry } from '@johnhenry/http-converter';
import { probeCompanion, hasDemo, companionBanner, type Companion } from '../companion';
import { send } from '../bus';
import { readState, writeState, copyLink } from '../state';
import './servant.css';

// ---------------------------------------------------------------------------
// @johnhenry/servant dispatches every request through a service-worker-style
// addEventListener("fetch", ...) API: use() middlewares run in registration
// order and can only short-circuit by returning a Response (anything else
// falls through, unchanged, to the next one); once they all pass, route()
// handlers are tried, and addEventListener("websocket", ...) fires per
// connection. servant's own internal `middlewares`/`routes` arrays are
// module-level singletons with no remove/clear API, so this planet's "script"
// is a tiny DSL — ctx.use(name, fn) / ctx.route(method, path, fn) / ctx.ws(fn)
// — compiled fresh with `new Function` into a plain collector object every
// time it changes. That collector is what both the real companion (which
// swaps its own active collector atomically — see server/demos/servant.mjs)
// and this file's in-page emulator dispatch against, so the two code paths
// share identical semantics. Route handlers may be sync or async — since
// servant@0.2.0, a "fetch" listener's returned promise is awaited before
// servant falls through to its built-in 404 (see CHANGELOG.md, issue #4),
// so an async handler that calls respondWith() after an `await` is honored
// exactly like a synchronous one. The "Async route (delayed)" preset below
// proves this live against the real companion server.
// ---------------------------------------------------------------------------

interface MwEntry { name: string; fn: (req: Request) => unknown }
interface RouteEntry { method: string; path: string; fn: (req: Request, params: Record<string, string>) => unknown }
interface Compiled { middlewares: MwEntry[]; routes: RouteEntry[]; wsHandler: ((ws: FakeWs) => void) | null }

function compileScript(scriptSrc: string): Compiled {
  const middlewares: MwEntry[] = [];
  const routes: RouteEntry[] = [];
  let wsHandler: ((ws: FakeWs) => void) | null = null;
  const ctx = {
    use(name: string, fn: (req: Request) => unknown) { middlewares.push({ name: String(name), fn }); },
    route(method: string, path: string, fn: (req: Request, params: Record<string, string>) => unknown) {
      routes.push({ method: String(method).toUpperCase(), path: String(path), fn });
    },
    ws(fn: (ws: FakeWs) => void) { wsHandler = fn; },
  };
  // eslint-disable-next-line no-new-func -- explicit local dev tool, mirrors server/demos/servant.mjs.
  const runner = new Function('ctx', scriptSrc) as (ctx: unknown) => void;
  runner(ctx);
  return { middlewares, routes, wsHandler };
}

/** Same param-splitting match servant's own routes.find() uses. */
function matchRoute(routes: RouteEntry[], method: string, pathname: string): { route: RouteEntry; params: Record<string, string> } | null {
  for (const r of routes) {
    if (r.method !== method) continue;
    const pathParts = r.path.split('/');
    const urlParts = pathname.split('/');
    if (pathParts.length !== urlParts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i].startsWith(':')) params[pathParts[i].slice(1)] = urlParts[i];
      else if (pathParts[i] !== urlParts[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

type StepStatus = 'allowed' | 'denied' | 'short-circuited' | 'error';
interface TraceStep { name: string; status: StepStatus; detail?: string }
interface TraceEntry {
  ts: number; method: string; path: string; steps: TraceStep[];
  outcome: string; matchedRoute?: string; status?: number; by?: string; source: 'live' | 'emulated';
  /** A full HAR entry for this dispatch, built with @johnhenry/http-converter's
   *  har.fromResponse() from the exact request/response headers+body this
   *  planet had in hand — only set for HTTP dispatches made from this tab
   *  (the live trace stream from the companion carries method/path/status
   *  only, not headers or bodies, so live entries never get one). */
  harEntry?: HarEntry;
}

/** Builds a HAR entry from plain request/response shapes (never a native
 *  Request/Response — those would need their bodies re-read, and callers
 *  here already have the body/header values in hand from dispatch). */
async function buildHarEntry(
  req: { method: string; url: string; headers: Record<string, string>; body?: string | null },
  res: { statusCode: number; statusText?: string; headers: Record<string, string>; body?: string | null },
): Promise<HarEntry> {
  return har.fromResponse(res, req);
}

/** In-page fetch-event emulator: identical semantics to servant's own dispatch, run entirely client-side. */
async function emulateFetch(active: Compiled, request: Request): Promise<{ response: Response; entry: TraceEntry }> {
  const url = new URL(request.url);
  const steps: TraceStep[] = [];
  for (const mw of active.middlewares) {
    try {
      const out = await mw.fn(request);
      if (out instanceof Response) {
        steps.push({ name: mw.name, status: 'short-circuited', detail: String(out.status) });
        return { response: out, entry: { ts: Date.now(), method: request.method, path: url.pathname, steps, outcome: 'short-circuited', by: mw.name, status: out.status, source: 'emulated' } };
      }
      steps.push({ name: mw.name, status: 'allowed' });
    } catch (err) {
      steps.push({ name: mw.name, status: 'error', detail: String((err as Error)?.message ?? err) });
      const response = new Response(`Middleware "${mw.name}" threw`, { status: 500 });
      return { response, entry: { ts: Date.now(), method: request.method, path: url.pathname, steps, outcome: 'error', by: mw.name, status: 500, source: 'emulated' } };
    }
  }
  const hit = matchRoute(active.routes, request.method, url.pathname);
  if (!hit) {
    const response = new Response(`No route for ${request.method} ${url.pathname} in the current script.`, { status: 404 });
    return { response, entry: { ts: Date.now(), method: request.method, path: url.pathname, steps, outcome: 'not-found', status: 404, source: 'emulated' } };
  }
  try {
    const result = await hit.route.fn(request, hit.params);
    const response = result instanceof Response ? result : new Response(String(result ?? ''), { status: 200 });
    return { response, entry: { ts: Date.now(), method: request.method, path: url.pathname, steps, outcome: 'routed', matchedRoute: `${hit.route.method} ${hit.route.path}`, status: response.status, source: 'emulated' } };
  } catch (err) {
    const response = new Response(`Route handler threw: ${(err as Error)?.message ?? err}`, { status: 500 });
    return { response, entry: { ts: Date.now(), method: request.method, path: url.pathname, steps, outcome: 'error', status: 500, source: 'emulated' } };
  }
}

/** Minimal stand-in for a `ws` package socket, enough for ctx.ws(fn) handlers to run unmodified. */
class FakeWs {
  private listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  constructor(private onSend: (msg: string) => void) {}
  send(msg: unknown) { this.onSend(String(msg)); }
  on(event: string, cb: (...args: unknown[]) => void) { (this.listeners[event] ??= []).push(cb); }
  close() { (this.listeners.close ?? []).forEach((cb) => cb()); }
  emit(event: string, ...args: unknown[]) { (this.listeners[event] ?? []).forEach((cb) => cb(...args)); }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const MW_SNIPPETS: Record<string, string> = {
  logging: `ctx.use('logging', (req) => {
  console.log(\`[servant] \${req.method} \${new URL(req.url).pathname}\`);
  return req; // not a Response -> continue
});`,
  'auth header check': `ctx.use('auth header check', (req) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/admin') && req.headers.get('authorization') !== 'Bearer secret') {
    return new Response('Unauthorized — send Authorization: Bearer secret', { status: 401 });
  }
  return req;
});`,
  'rate limit': `ctx.use('rate limit', (() => {
  const hits = new Map();
  const LIMIT = 20;
  return (req) => {
    const key = req.headers.get('x-forwarded-for') || 'local';
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > LIMIT) return new Response('Too Many Requests', { status: 429 });
    return req;
  };
})());`,
};
const MW_ROUTES_BLOCK = `
ctx.route('GET', '/', () =>
  new Response('Servant Hall is open. Try GET /hello/:name, GET /admin, or connect the WebSocket.', { status: 200 }));

ctx.route('GET', '/hello/:name', (req, params) =>
  new Response(\`Hello, \${params.name}!\`, { status: 200 }));

ctx.route('GET', '/admin', () =>
  new Response('Welcome, admin.', { status: 200 }));

ctx.ws((ws) => {
  ws.send('connected to the servant echo');
  ws.on('message', (m) => ws.send(\`echo: \${m}\`));
});`;
const MW_HEADER = `// Middleware chain: logging → auth header check → rate limit → handler.
// Reorder the chips below to change which one runs first — servant runs
// use() middlewares in registration order and only the LAST one reaching
// the route counts as "the handler".
`;
function buildChainScript(order: string[]): string {
  return MW_HEADER + '\n' + order.map((n) => MW_SNIPPETS[n]).join('\n\n') + '\n' + MW_ROUTES_BLOCK + '\n';
}
const DEFAULT_MW_ORDER = ['logging', 'auth header check', 'rate limit'];

const PRESETS: { name: string; script: string; chain?: boolean }[] = [
  {
    name: 'Fetch listener + routes',
    script: `// A plain addEventListener("fetch", ...) style room: no middleware, just routes.
ctx.route('GET', '/', () => new Response('Hello from Servant Hall.', { status: 200 }));
ctx.route('GET', '/time', () => new Response(JSON.stringify({ now: Date.now() }), { headers: { 'content-type': 'application/json' } }));
ctx.route('GET', '/hello/:name', (req, params) => new Response(\`Hello, \${params.name}!\`, { status: 200 }));
ctx.route('POST', '/echo', async (req) => new Response(await req.text(), { status: 200 }));
`,
  },
  { name: 'Middleware chain', script: buildChainScript(DEFAULT_MW_ORDER), chain: true },
  {
    name: 'WebSocket chat/echo',
    script: `// No HTTP routes at all here — connect the WebSocket panel and chat.
ctx.route('GET', '/', () => new Response('This preset is all about the WebSocket panel →', { status: 200 }));
ctx.ws((ws) => {
  ws.send('welcome to servant chat. anything you send gets echoed back, shouted.');
  ws.on('message', (m) => ws.send(String(m).toUpperCase() + '!'));
});
`,
  },
  {
    name: 'Async route (delayed)',
    script: `// servant@0.2.0 awaits an async "fetch" listener before falling through
// to its own built-in 404 (see CHANGELOG.md / issue #4) — this route awaits
// a short delay before responding, to prove that live on the real server.
ctx.route('GET', '/slow', async () => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return new Response(JSON.stringify({ ok: true, waitedMs: 800 }), { headers: { 'content-type': 'application/json' } });
});
ctx.route('GET', '/', () => new Response('Try GET /slow — it awaits a delay before responding.', { status: 200 }));
`,
  },
  {
    name: 'Static-ish responses',
    script: `// Canned responses at fixed paths — no logic, just Content-Type variety.
ctx.route('GET', '/', () => new Response('<h1>Servant Hall</h1><p>Static-ish demo.</p>', { headers: { 'content-type': 'text/html' } }));
ctx.route('GET', '/robots.txt', () => new Response('User-agent: *\\nDisallow:\\n', { headers: { 'content-type': 'text/plain' } }));
ctx.route('GET', '/config.json', () => new Response(JSON.stringify({ ok: true, mode: 'static' }, null, 2), { headers: { 'content-type': 'application/json' } }));
ctx.route('GET', '/teapot', () => new Response("I'm a teapot", { status: 418 }));
`,
  },
  {
    name: 'Server-Sent Events',
    script: `// GET /events streams six ticks as text/event-stream frames, built with
// the exact wire format of servant's own createServerSentEvent(data, event?, id?)
// (a pure string formatter — reproduced inline here since it's dependency-free
// and this room can't import servant's Node-only entrypoint into the browser
// bundle). Fetch /events from the composer, then watch the response body fill
// in live as each frame arrives.
const sse = (data, event, id) => {
  let frame = '';
  if (event) frame += \`event: \${event}\\n\`;
  if (id) frame += \`id: \${id}\\n\`;
  frame += \`data: \${JSON.stringify(data)}\\n\\n\`;
  return frame;
};

ctx.route('GET', '/events', () => {
  let n = 0;
  const stream = new ReadableStream({
    start(controller) {
      const tick = () => {
        controller.enqueue(new TextEncoder().encode(sse({ n, at: new Date().toISOString() }, 'tick', String(n))));
        n++;
        if (n < 6) setTimeout(tick, 500);
        else controller.close();
      };
      tick();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
});

ctx.route('GET', '/', () => new Response('Servant SSE demo — GET /events streams six ticks as text/event-stream frames.', { status: 200 }));
`,
  },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const playground: Playground = {
  id: 'servant',
  title: 'Servant Hall',
  pkg: '@johnhenry/servant',
  hue: 40,
  blurb: 'A batteries-included Node server with a service-worker fetch API, middleware and WebSockets.',
  docs: 'https://opensource.johnhenry.me/servant/',

  async mount(host) {
    const root = document.createElement('div');
    root.className = 'pg-servant';
    root.innerHTML = `
      <div id="sv-banner"></div>
      <div class="hall">
        <div class="col">
          <div class="panel">
            <div class="row-between">
              <h3>Server script</h3>
              <div class="presets" id="sv-presets"></div>
            </div>
            <p class="hint">
              Evaluated as <code>new Function('ctx', script)</code>. <code>ctx.use(name, fn)</code> registers middleware
              (return a <code>Response</code> to short-circuit, anything else continues); <code>ctx.route(method, path, fn)</code>
              registers a route; <code>ctx.ws(fn)</code> handles the WebSocket connection — exactly servant's own
              <code>use()</code> / <code>route()</code> / <code>addEventListener("websocket", ...)</code> semantics.
            </p>
            <textarea class="code" id="sv-script" spellcheck="false" rows="16"></textarea>
            <div class="chips-wrap" id="sv-chips-wrap" hidden>
              <p class="hint">Reorder the middleware chain — each move re-writes the script above and re-applies it.</p>
              <div class="chips" id="sv-chips"></div>
            </div>
            <div class="script-actions">
              <button class="btn primary" id="sv-apply">▶ Apply script</button>
              <button class="btn copy-link" id="sv-copy" title="Copy a link that reopens this exact script">🔗 copy link</button>
              <span class="script-status" id="sv-status"></span>
            </div>
            <div class="routes-list" id="sv-routes"></div>
          </div>
          <div class="panel">
            <h3>What's happening</h3>
            <p class="hint">
              Every request is a <code>fetch</code> event. servant's dispatcher walks <code>use()</code> middlewares in
              registration order; the moment one returns a <code>Response</code>, dispatch stops right there
              (<i>short-circuited</i>) — nothing later in the chain, not even routing, ever runs. If every middleware lets
              the request through, servant matches it against <code>route()</code> entries (<code>:name</code> segments
              capture params) and falls back to a 404. Route handlers can be sync or <code>async</code> — servant awaits
              a "fetch" listener's returned promise before falling through to its 404, so an async handler that
              <code>await</code>s something and then responds still wins the race (try the "Async route (delayed)"
              preset). A new WebSocket connection fires <code>addEventListener("websocket", ws)</code> once, handing
              you a real <code>ws</code> socket to read and write for the life of that connection. The trace on the
              right shows exactly this journey for every request.
            </p>
          </div>
          <div class="panel">
            <h3>Event bus <span class="chip">emit() / addEventListener()</span></h3>
            <p class="hint">
              servant's real <code>emit(name, detail)</code> dispatches a <code>CustomEvent</code> on the same
              <code>EventTarget</code> that <code>addEventListener</code> listens on — a request handler can notify
              other in-process listeners (logging, metrics) synchronously, outside the response it returns. This is
              the same mechanism, live in this tab: fire an event below and watch the listener below react.
            </p>
            <div class="event-bus-row">
              <button class="btn" id="sv-emit">emit('orrery:ping', …) →</button>
              <span class="stat" id="sv-emit-count"></span>
            </div>
            <div class="ws-log" id="sv-emit-log"></div>
          </div>
        </div>

        <div class="col">
          <div class="panel">
            <h3>HTTP request composer</h3>
            <div class="composer-row">
              <select id="sv-method">
                <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
              </select>
              <input type="text" id="sv-path" placeholder="/hello/world" value="/" />
              <button class="btn primary" id="sv-send">Send</button>
            </div>
            <div class="headers-editor" id="sv-headers"></div>
            <button class="btn" id="sv-add-header" style="margin-bottom:8px;">+ header</button>
            <textarea class="code" id="sv-body" placeholder="request body (POST/PUT/PATCH)" spellcheck="false"></textarea>
            <div class="response-viewer">
              <div class="resp-status" id="sv-resp-status"></div>
              <pre class="code" id="sv-resp-body">Send a request to see the response.</pre>
            </div>
          </div>

          <div class="panel ws-panel">
            <h3>WebSocket panel</h3>
            <div class="ws-row">
              <input type="text" id="sv-ws-url" readonly />
              <button class="btn primary" id="sv-ws-connect">Connect</button>
              <button class="btn" id="sv-ws-disconnect" disabled>Disconnect</button>
            </div>
            <div class="ws-row">
              <input type="text" id="sv-ws-msg" placeholder="message to send" disabled />
              <button class="btn" id="sv-ws-send" disabled>Send</button>
            </div>
            <div class="ws-log" id="sv-ws-log"></div>
          </div>
        </div>

        <div class="col">
          <div class="panel">
            <div class="row-between">
              <h3>Dispatch trace</h3>
              <div class="trace-actions">
                <button class="btn" id="sv-trace-har" title="Download every dispatch that has a HAR entry as a .har file">⬇ .har</button>
                <button class="btn trace-clear" id="sv-trace-clear">clear</button>
              </div>
            </div>
            <p class="hint">Live requests (HTTP or WS) travel through this list, newest first — colored by whether each middleware allowed, denied, or short-circuited the fetch event. Entries built from this tab's own dispatches also carry a full HAR entry (<code>@johnhenry/http-converter</code>'s <code>har.fromResponse()</code>) — open one in the HTTP Converter, or download the whole session.</p>
            <div class="trace-list" id="sv-trace"></div>
          </div>
        </div>
      </div>
    `;
    host.innerHTML = '';
    host.appendChild(root);

    const bannerEl = root.querySelector<HTMLDivElement>('#sv-banner')!;
    const presetsEl = root.querySelector<HTMLDivElement>('#sv-presets')!;
    const scriptEl = root.querySelector<HTMLTextAreaElement>('#sv-script')!;
    const chipsWrap = root.querySelector<HTMLDivElement>('#sv-chips-wrap')!;
    const chipsEl = root.querySelector<HTMLDivElement>('#sv-chips')!;
    const applyBtn = root.querySelector<HTMLButtonElement>('#sv-apply')!;
    const copyBtn = root.querySelector<HTMLButtonElement>('#sv-copy')!;
    const statusEl = root.querySelector<HTMLSpanElement>('#sv-status')!;
    const routesEl = root.querySelector<HTMLDivElement>('#sv-routes')!;

    const methodEl = root.querySelector<HTMLSelectElement>('#sv-method')!;
    const pathEl = root.querySelector<HTMLInputElement>('#sv-path')!;
    const sendBtn = root.querySelector<HTMLButtonElement>('#sv-send')!;
    const headersEl = root.querySelector<HTMLDivElement>('#sv-headers')!;
    const addHeaderBtn = root.querySelector<HTMLButtonElement>('#sv-add-header')!;
    const bodyEl = root.querySelector<HTMLTextAreaElement>('#sv-body')!;
    const respStatusEl = root.querySelector<HTMLDivElement>('#sv-resp-status')!;
    const respBodyEl = root.querySelector<HTMLPreElement>('#sv-resp-body')!;

    const wsUrlEl = root.querySelector<HTMLInputElement>('#sv-ws-url')!;
    const wsConnectBtn = root.querySelector<HTMLButtonElement>('#sv-ws-connect')!;
    const wsDisconnectBtn = root.querySelector<HTMLButtonElement>('#sv-ws-disconnect')!;
    const wsMsgEl = root.querySelector<HTMLInputElement>('#sv-ws-msg')!;
    const wsSendBtn = root.querySelector<HTMLButtonElement>('#sv-ws-send')!;
    const wsLogEl = root.querySelector<HTMLDivElement>('#sv-ws-log')!;

    const traceEl = root.querySelector<HTMLDivElement>('#sv-trace')!;
    const traceClearBtn = root.querySelector<HTMLButtonElement>('#sv-trace-clear')!;
    const traceHarBtn = root.querySelector<HTMLButtonElement>('#sv-trace-har')!;

    const emitBtn = root.querySelector<HTMLButtonElement>('#sv-emit')!;
    const emitCountEl = root.querySelector<HTMLSpanElement>('#sv-emit-count')!;
    const emitLogEl = root.querySelector<HTMLDivElement>('#sv-emit-log')!;

    // ---- event bus (emit() / addEventListener() concept) --------------------
    // A plain EventTarget, mirroring servant's real emit(name, detail) —
    // target.dispatchEvent(new CustomEvent(name, { detail })) — and
    // addEventListener(name, fn). Independent of live/emulated mode: this is
    // the underlying mechanism ctx.use()/ctx.route()/ctx.ws() are built on.
    const eventBus = new EventTarget();
    const emit = (name: string, detail: unknown) => eventBus.dispatchEvent(new CustomEvent(name, { detail }));
    let emitCount = 0;
    eventBus.addEventListener('orrery:ping', (e) => {
      emitCount++;
      emitCountEl.textContent = `${emitCount} received`;
      const row = document.createElement('div');
      row.className = 'in';
      row.textContent = `orrery:ping → ${JSON.stringify((e as CustomEvent).detail)}`;
      emitLogEl.appendChild(row);
      emitLogEl.scrollTop = emitLogEl.scrollHeight;
      while (emitLogEl.children.length > 50) emitLogEl.removeChild(emitLogEl.firstChild as ChildNode);
    });
    emitBtn.addEventListener('click', () => emit('orrery:ping', { n: emitCount + 1, at: new Date().toISOString() }));

    // ---- companion probe --------------------------------------------------
    const companion: Companion | null = await probeCompanion();
    const live = hasDemo(companion, 'servant');
    bannerEl.appendChild(companionBanner(companion, 'servant', 'a small in-page addEventListener("fetch") shim runs the same middleware/route/WebSocket semantics, entirely client-side.'));

    let liveBase = '';
    let liveWsBase = '';
    if (live && companion) {
      try {
        const r = await fetch(`${companion.base}/servant/info`);
        const j = await r.json();
        liveBase = j.base;
        liveWsBase = j.wsBase;
      } catch { /* stay in emulated mode below if this fails */ }
    }
    const isLive = live && !!liveBase;
    wsUrlEl.value = isLive ? liveWsBase : '(in-page emulation — no real socket)';

    // ---- state -------------------------------------------------------------
    let active: Compiled = { middlewares: [], routes: [], wsHandler: null };
    let mwOrder = [...DEFAULT_MW_ORDER];
    let activePresetName = PRESETS[1].name;
    let fakeWs: FakeWs | null = null;
    let liveSocket: WebSocket | null = null;
    let traceSocket: WebSocket | null = null;

    const stateDefaults = { p: 1, script: '' };
    const saveState = (script: string) => {
      const idx = PRESETS.findIndex((pr) => pr.script === script);
      writeState(idx >= 0 ? { p: idx, script: '' } : { p: -1, script }, stateDefaults);
    };

    function addHeaderRow(k = '', v = '') {
      const row = document.createElement('div');
      row.className = 'header-row';
      row.innerHTML = `<input type="text" class="hk" placeholder="Header-Name" value="${escapeHtml(k)}" /><input type="text" class="hv" placeholder="value" value="${escapeHtml(v)}" /><button title="remove">✕</button>`;
      row.querySelector('button')!.addEventListener('click', () => row.remove());
      headersEl.appendChild(row);
    }
    addHeaderBtn.addEventListener('click', () => addHeaderRow());

    function readHeaders(): Headers {
      const h = new Headers();
      headersEl.querySelectorAll<HTMLDivElement>('.header-row').forEach((row) => {
        const k = row.querySelector<HTMLInputElement>('.hk')!.value.trim();
        const v = row.querySelector<HTMLInputElement>('.hv')!.value;
        if (k) h.set(k, v);
      });
      return h;
    }

    function statusClass(code: number): string {
      if (code >= 500) return 'code-5xx';
      if (code >= 400) return 'code-4xx';
      if (code >= 300) return 'code-3xx';
      return 'code-2xx';
    }

    // ---- trace rendering ----------------------------------------------------
    const entries: TraceEntry[] = [];
    const TRACE_MAX_RENDER = 60;

    function renderTrace() {
      if (entries.length === 0) { traceEl.innerHTML = '<p class="trace-empty">No requests yet — send one from the composer or connect the WebSocket.</p>'; return; }
      traceEl.innerHTML = entries.slice(0, TRACE_MAX_RENDER).map((e, i) => {
        const stepsHtml = e.steps.length
          ? e.steps.map((s) => `<span class="trace-step ${s.status}" title="${escapeHtml(s.detail ?? '')}">${escapeHtml(s.name)}</span>`).join('<span class="trace-arrow">→</span>')
          : '<span class="hint" style="margin:0">no middleware in this chain</span>';
        const statusLabel = e.status !== undefined ? `<span class="status ${statusClass(e.status)}">${e.status}</span>` : '';
        const harRow = e.harEntry
          ? `<button class="btn trace-har-open" type="button" data-har-open data-idx="${i}">Open in HTTP Converter →</button>`
          : '';
        return `
          <div class="trace-entry">
            <div class="trace-head"><span class="path">${escapeHtml(e.method)} ${escapeHtml(e.path)}</span>${statusLabel}</div>
            <div class="trace-steps">${stepsHtml}</div>
            <div class="trace-outcome">${escapeHtml(e.outcome)}${e.matchedRoute ? ` · matched <b>${escapeHtml(e.matchedRoute)}</b>` : ''} · <i>${e.source}</i></div>
            ${harRow}
          </div>`;
      }).join('');
    }
    function pushLocalEntry(e: TraceEntry) { entries.unshift(e); if (entries.length > 200) entries.length = 200; renderTrace(); }
    traceClearBtn.addEventListener('click', () => { entries.length = 0; renderTrace(); });
    traceEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-har-open]');
      if (!btn) return;
      const entry = entries[Number(btn.dataset.idx)];
      if (entry?.harEntry) send('servant', 'converter', 'har-entry', entry.harEntry);
    });
    traceHarBtn.addEventListener('click', () => {
      const withHar = entries.filter((e) => e.harEntry).map((e) => e.harEntry);
      if (!withHar.length) return;
      const log = { log: { version: '1.2', creator: { name: 'Servant Hall (ORRERY)', version: '1.0' }, entries: withHar } };
      const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'servant-session.har';
      a.click();
      URL.revokeObjectURL(url);
    });
    renderTrace();

    // ---- script apply -------------------------------------------------------
    function renderRoutesList() {
      const mwNames = active.middlewares.map((m) => m.name);
      const routeLines = active.routes.map((r) => `<b>${escapeHtml(r.method)}</b> ${escapeHtml(r.path)}`);
      routesEl.innerHTML = [
        mwNames.length ? `middleware: ${mwNames.map(escapeHtml).join(' → ')}` : 'middleware: none',
        ...routeLines,
        active.wsHandler ? 'WebSocket handler: registered' : 'WebSocket handler: none',
      ].map((l) => `<div>${l}</div>`).join('');
    }

    function renderChips() {
      const isChain = activePresetName === 'Middleware chain';
      chipsWrap.hidden = !isChain;
      if (!isChain) return;
      chipsEl.innerHTML = '';
      mwOrder.forEach((name, i) => {
        const chip = document.createElement('span');
        chip.className = 'chip-mw';
        chip.innerHTML = `${escapeHtml(name)}
          <button data-dir="up" ${i === 0 ? 'disabled' : ''} title="move earlier">↑</button>
          <button data-dir="down" ${i === mwOrder.length - 1 ? 'disabled' : ''} title="move later">↓</button>`;
        chip.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
          const dir = (b as HTMLButtonElement).dataset.dir;
          const j = dir === 'up' ? i - 1 : i + 1;
          if (j < 0 || j >= mwOrder.length) return;
          [mwOrder[i], mwOrder[j]] = [mwOrder[j], mwOrder[i]];
          scriptEl.value = buildChainScript(mwOrder);
          applyScript();
          // The swap above reorders mwOrder (and the script/handler actually
          // reflects the new order — confirmed live), but the chip row itself
          // was never re-rendered, so up/down taps looked like no-ops: the
          // pipeline changed underneath an unchanged-looking chip strip.
          renderChips();
        }));
        chipsEl.appendChild(chip);
        if (i < mwOrder.length - 1) {
          const arrow = document.createElement('span');
          arrow.className = 'chip-arrow';
          arrow.textContent = '→';
          chipsEl.appendChild(arrow);
        }
      });
      const end = document.createElement('span');
      end.className = 'chip-end';
      end.textContent = '→ route handler';
      chipsEl.appendChild(end);
    }

    async function applyScript() {
      const script = scriptEl.value;
      saveState(script);
      if (isLive && companion) {
        statusEl.textContent = 'applying to real server…';
        statusEl.className = 'script-status';
        try {
          const r = await fetch(`${companion.base}/servant/script`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ script }) });
          const j = await r.json();
          if (!j.ok) { statusEl.textContent = `✗ ${j.error}`; statusEl.className = 'script-status err'; return; }
          statusEl.textContent = `✓ live — ${j.middlewares.length} middleware, ${j.routes.length} route(s)${j.hasWs ? ', WS handler' : ''}`;
          statusEl.className = 'script-status ok';
          // also compile locally so the routes list / composer defaults stay in sync
          active = compileScript(script);
        } catch (err) {
          statusEl.textContent = `✗ companion unreachable: ${(err as Error).message}`;
          statusEl.className = 'script-status err';
          return;
        }
      } else {
        try {
          active = compileScript(script);
          statusEl.textContent = `✓ compiled — ${active.middlewares.length} middleware, ${active.routes.length} route(s)${active.wsHandler ? ', WS handler' : ''} (in-page emulation)`;
          statusEl.className = 'script-status ok';
        } catch (err) {
          statusEl.textContent = `✗ ${(err as Error).message}`;
          statusEl.className = 'script-status err';
          return;
        }
      }
      renderRoutesList();
    }
    applyBtn.addEventListener('click', () => { void applyScript(); });

    function markActivePreset() {
      presetsEl.querySelectorAll<HTMLButtonElement>('.preset-btn').forEach((b) => b.classList.toggle('active', b.textContent === activePresetName));
    }
    function loadPreset(preset: { name: string; script: string }) {
      activePresetName = preset.name;
      scriptEl.value = preset.script;
      if (preset.name === 'Middleware chain') mwOrder = [...DEFAULT_MW_ORDER];
      markActivePreset();
      renderChips();
      void applyScript();
    }
    PRESETS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.className = 'btn preset-btn';
      btn.textContent = preset.name;
      btn.addEventListener('click', () => loadPreset(preset));
      presetsEl.appendChild(btn);
    });

    scriptEl.addEventListener('change', () => {
      // free-form edits stop tracking a specific preset name (chips hide until a preset is picked again)
      const match = PRESETS.find((p) => p.script === scriptEl.value);
      activePresetName = match ? match.name : '';
      markActivePreset();
      renderChips();
    });

    copyBtn.addEventListener('click', async () => {
      saveState(scriptEl.value);
      await new Promise((r) => setTimeout(r, 180));
      await copyLink();
      copyBtn.textContent = '✓ copied';
      setTimeout(() => { copyBtn.textContent = '🔗 copy link'; }, 1400);
    });

    // ---- HTTP composer -------------------------------------------------------
    async function sendRequest() {
      const method = methodEl.value;
      const path = pathEl.value.startsWith('/') ? pathEl.value : `/${pathEl.value}`;
      const headers = readHeaders();
      const body = method === 'GET' || method === 'HEAD' ? undefined : bodyEl.value;

      respStatusEl.textContent = 'sending…';
      respStatusEl.className = 'resp-status';
      try {
        if (isLive) {
          const res = await fetch(`${liveBase}${path}`, { method, headers, body });
          const text = await res.text();
          respStatusEl.innerHTML = `<span class="${statusClass(res.status)}">${res.status} ${res.statusText}</span>`;
          respBodyEl.textContent = text || '(empty body)';
        } else {
          const url = new URL(path, 'http://servant.local');
          const req = new Request(url, { method, headers, body });
          const { response, entry } = await emulateFetch(active, req);
          const text = await response.clone().text();
          respStatusEl.innerHTML = `<span class="${statusClass(response.status)}">${response.status}</span>`;
          respBodyEl.textContent = text || '(empty body)';
          try {
            entry.harEntry = await buildHarEntry(
              { method, url: url.toString(), headers: Object.fromEntries(headers.entries()), body: body ?? null },
              { statusCode: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers.entries()), body: text },
            );
          } catch { /* HAR is a bonus — never block showing the response over it */ }
          pushLocalEntry(entry);
        }
      } catch (err) {
        respStatusEl.innerHTML = `<span class="code-5xx">error</span>`;
        respBodyEl.textContent = String((err as Error)?.message ?? err);
      }
    }
    sendBtn.addEventListener('click', () => { void sendRequest(); });

    // ---- WebSocket panel -----------------------------------------------------
    function wsLog(cls: string, text: string) {
      const row = document.createElement('div');
      row.className = cls;
      row.textContent = text;
      wsLogEl.appendChild(row);
      wsLogEl.scrollTop = wsLogEl.scrollHeight;
      while (wsLogEl.children.length > 300) wsLogEl.removeChild(wsLogEl.firstChild as ChildNode);
    }
    function setWsConnected(connected: boolean) {
      wsConnectBtn.disabled = connected;
      wsDisconnectBtn.disabled = !connected;
      wsMsgEl.disabled = !connected;
      wsSendBtn.disabled = !connected;
    }
    function connectWs() {
      wsLogEl.innerHTML = '';
      if (isLive) {
        try {
          liveSocket = new WebSocket(liveWsBase);
          liveSocket.addEventListener('open', () => { wsLog('sys', `connected to ${liveWsBase}`); setWsConnected(true); });
          liveSocket.addEventListener('message', (ev) => wsLog('in', String(ev.data)));
          liveSocket.addEventListener('close', () => { wsLog('sys', 'disconnected'); setWsConnected(false); liveSocket = null; });
          liveSocket.addEventListener('error', () => wsLog('sys', 'socket error'));
        } catch (err) {
          wsLog('sys', `failed to connect: ${(err as Error).message}`);
        }
      } else {
        fakeWs = new FakeWs((msg) => wsLog('in', msg));
        wsLog('sys', 'connected (in-page emulation — no real socket)');
        try {
          active.wsHandler?.(fakeWs);
        } catch (err) {
          wsLog('sys', `handler threw: ${(err as Error).message}`);
        }
        setWsConnected(true);
      }
    }
    function disconnectWs() {
      liveSocket?.close();
      liveSocket = null;
      fakeWs?.close();
      fakeWs = null;
      setWsConnected(false);
      wsLog('sys', 'disconnected');
    }
    function sendWs() {
      const msg = wsMsgEl.value;
      if (!msg) return;
      wsLog('out', msg);
      if (isLive && liveSocket) liveSocket.send(msg);
      else if (fakeWs) fakeWs.emit('message', msg);
      wsMsgEl.value = '';
    }
    wsConnectBtn.addEventListener('click', connectWs);
    wsDisconnectBtn.addEventListener('click', disconnectWs);
    wsSendBtn.addEventListener('click', sendWs);
    wsMsgEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendWs(); });

    // ---- live trace stream (only when the real companion is up) -------------
    if (isLive && companion) {
      try {
        const r = await fetch(`${companion.base}/servant/trace`);
        const backlog = (await r.json()) as Omit<TraceEntry, 'source'>[];
        for (const e of backlog.slice(-30).reverse()) entries.unshift({ ...e, source: 'live' });
        renderTrace();
      } catch { /* backlog is best-effort */ }
      try {
        traceSocket = new WebSocket(`${companion.wsBase}/servant/trace`);
        traceSocket.addEventListener('message', (ev) => {
          try {
            const e = JSON.parse(String(ev.data)) as Omit<TraceEntry, 'source'>;
            pushLocalEntry({ ...e, source: 'live' });
          } catch { /* ignore malformed frame */ }
        });
      } catch { /* trace stays backlog-only if this fails */ }
    }

    // ---- default state --------------------------------------------------------
    addHeaderRow();
    const linked = readState(stateDefaults);
    const initialScript = linked.script || PRESETS[Number(linked.p)]?.script || PRESETS[1].script;
    const matchedInitial = PRESETS.find((p) => p.script === initialScript);
    activePresetName = matchedInitial ? matchedInitial.name : '';
    scriptEl.value = initialScript;
    markActivePreset();
    renderChips();
    await applyScript();

    return () => {
      liveSocket?.close();
      traceSocket?.close();
    };
  },
};

export default playground;
