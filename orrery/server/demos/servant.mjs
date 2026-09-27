// Servant Hall companion demo — a REAL @johnhenry/servant HTTP+WS server on
// its own port (7779; servant needs its own listener, it isn't compatible
// with the companion's plain http server or with leserve's serve()), plus
// two routes mounted on the companion itself (7777) so the browser can
// hot-swap the script and read the dispatch trace.
//
// Why the indirection instead of calling servant's use()/route() straight
// from the user's script: servant's `middlewares`/`routes` arrays are
// module-level and only grow (no remove/clear API), so re-evaluating a
// script naively would pile up stale handlers on every hot-swap and the
// *old* ones would still fire first. Instead we register real servant
// primitives exactly ONCE — one addEventListener('websocket', ...), one
// use() middleware, one addEventListener('fetch', ...) — and have all
// three read from `state.active`, which a script recompile swaps out
// atomically. The request-handling semantics (a middleware short-circuits
// by returning a Response; anything else falls through to the next one,
// then to route matching, then 404) are exactly servant's own.
import { start, use, addEventListener } from '@johnhenry/servant/controls';

export const id = 'servant';
export const describe = 'real @johnhenry/servant HTTP+WS server on :7779, hot-swappable via /servant/script';

const PORT = 7779;
const TRACE_MAX = 200;

export const DEFAULT_SCRIPT = `// Servant Hall script — evaluated with new Function(ctx) (local dev tool).
// ctx.use(name, fn): fn(request) => Response short-circuits; anything else continues.
// ctx.route(method, path, fn): fn(request, params) => Response | Promise<Response>.
// ctx.ws(fn): fn(ws) runs the real servant "websocket" event — ws is a real 'ws' socket.

ctx.use('logging', (req) => {
  console.log(\`[servant] \${req.method} \${new URL(req.url).pathname}\`);
  return req; // not a Response -> continue
});

ctx.use('auth header check', (req) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/admin') && req.headers.get('authorization') !== 'Bearer secret') {
    return new Response('Unauthorized — send Authorization: Bearer secret', { status: 401 });
  }
  return req;
});

ctx.use('rate limit', (() => {
  const hits = new Map();
  const LIMIT = 20;
  return (req) => {
    const key = req.headers.get('x-forwarded-for') || 'local';
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > LIMIT) return new Response('Too Many Requests', { status: 429 });
    return req;
  };
})());

ctx.route('GET', '/', () =>
  new Response('Servant Hall is open. Try GET /hello/:name, GET /admin, or connect the WebSocket.', { status: 200 }));

ctx.route('GET', '/hello/:name', (req, params) =>
  new Response(\`Hello, \${params.name}!\`, { status: 200 }));

ctx.route('GET', '/admin', () =>
  new Response('Welcome, admin.', { status: 200 }));

ctx.ws((ws) => {
  ws.send('connected to the servant echo');
  ws.on('message', (m) => ws.send(\`echo: \${m}\`));
});
`;

/** Compiles a script into a fresh { middlewares, routes, wsHandler } collector. Never touches real servant state. */
function compile(scriptSrc) {
  const middlewares = [];
  const routes = [];
  let wsHandler = null;
  const ctx = {
    use(name, fn) { middlewares.push({ name: String(name), fn }); },
    route(method, path, fn) { routes.push({ method: String(method).toUpperCase(), path: String(path), fn }); },
    ws(fn) { wsHandler = fn; },
  };
  // eslint-disable-next-line no-new-func -- explicit, documented local dev tool; see AGENTS.md Phase 4.
  const runner = new Function('ctx', scriptSrc);
  runner(ctx);
  return { middlewares, routes, wsHandler };
}

/** Same param-splitting match servant's own routes.find() uses, so behavior stays faithful. */
function matchRoute(routes, method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const pathParts = r.path.split('/');
    const urlParts = pathname.split('/');
    if (pathParts.length !== urlParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i].startsWith(':')) params[pathParts[i].slice(1)] = urlParts[i];
      else if (pathParts[i] !== urlParts[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

export async function mount(app) {
  const state = { script: DEFAULT_SCRIPT, active: compile(DEFAULT_SCRIPT), error: null };
  const trace = [];
  const traceSockets = new Set();

  function pushTrace(entry) {
    trace.push(entry);
    while (trace.length > TRACE_MAX) trace.shift();
    const line = JSON.stringify(entry);
    for (const ws of traceSockets) { try { ws.send(line); } catch { /* dead socket, ignore */ } }
  }

  // ---- the real servant server, port 7779 -------------------------------
  await start({ port: PORT, host: process.env.ORRERY_HOST || '127.0.0.1' });

  // CORS for the browser planet (vite :5173 or a deployed site) calling this port directly.
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
    'access-control-allow-private-network': 'true',
    'access-control-max-age': '600',
  };
  const withCors = (res) => {
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
  use(async (request) => (request.method === 'OPTIONS' ? withCors(new Response(null, { status: 204 })) : undefined));

  use(async (request) => {
    const url = new URL(request.url);
    const steps = [];
    for (const mw of state.active.middlewares) {
      try {
        const out = await mw.fn(request);
        if (out instanceof Response) {
          steps.push({ name: mw.name, status: 'short-circuited', detail: `${out.status}` });
          pushTrace({ ts: Date.now(), method: request.method, path: url.pathname, steps, outcome: 'short-circuited', by: mw.name, status: out.status });
          return withCors(out);
        }
        steps.push({ name: mw.name, status: 'allowed' });
      } catch (err) {
        steps.push({ name: mw.name, status: 'denied', detail: String(err?.message || err) });
        pushTrace({ ts: Date.now(), method: request.method, path: url.pathname, steps, outcome: 'error', by: mw.name });
        return withCors(new Response(`Middleware "${mw.name}" threw: ${err?.message || err}`, { status: 500 }));
      }
    }
    request.__servantTrace = steps; // handed to the fetch listener below via closure-free carry
    return undefined; // not a Response -> real servant continues to routing/fetch dispatch
  });

  // servant@0.2.0 collects every async "fetch" listener's returned promise
  // (via FetchEvent's waitFor()) and awaits all of them in settle() before
  // reading event.response — so this listener can simply be `async` and
  // `await` a route handler's result. That covers both a plain synchronous
  // handler (`await` on a non-promise value just returns it) and a genuinely
  // async one (e.g. one that awaits a delay before returning) — servant
  // itself no longer races ahead to its built-in 404 while we're still
  // awaiting the handler. See CHANGELOG.md's 0.2.0 entry / issue #4 / PR #5.
  addEventListener('fetch', async (event) => {
    const url = new URL(event.request.url);
    const steps = event.request.__servantTrace || [];
    const hit = matchRoute(state.active.routes, event.request.method, url.pathname);
    if (!hit) {
      pushTrace({ ts: Date.now(), method: event.request.method, path: url.pathname, steps, outcome: 'not-found', status: 404 });
      event.respondWith(withCors(new Response(`No route for ${event.request.method} ${url.pathname} in the current script.`, { status: 404 })));
      return;
    }
    try {
      const result = await hit.route.fn(event.request, hit.params);
      const response = result instanceof Response ? result : new Response(String(result ?? ''), { status: 200 });
      pushTrace({ ts: Date.now(), method: event.request.method, path: url.pathname, steps, outcome: 'routed', matchedRoute: `${hit.route.method} ${hit.route.path}`, status: response.status });
      event.respondWith(withCors(response));
    } catch (err) {
      pushTrace({ ts: Date.now(), method: event.request.method, path: url.pathname, steps, outcome: 'error', status: 500 });
      event.respondWith(withCors(new Response(`Route handler threw: ${err?.message || err}`, { status: 500 })));
    }
  });

  addEventListener('websocket', (ws) => {
    pushTrace({ ts: Date.now(), method: 'WS', path: '/', steps: [], outcome: 'connected' });
    try {
      if (state.active.wsHandler) state.active.wsHandler(ws);
      else ws.close();
    } catch (err) {
      pushTrace({ ts: Date.now(), method: 'WS', path: '/', steps: [], outcome: 'error', detail: String(err?.message || err) });
    }
  });

  // ---- companion-side routes (port 7777): hot-swap + trace read-back ----
  app.route('GET', '/servant/info', () =>
    new Response(JSON.stringify({ port: PORT, base: `http://localhost:${PORT}`, wsBase: `ws://localhost:${PORT}`, script: state.script, error: state.error }), { headers: { 'content-type': 'application/json' } }));

  app.route('GET', '/servant/trace', () =>
    new Response(JSON.stringify(trace), { headers: { 'content-type': 'application/json' } }));

  app.route('POST', '/servant/script', async (request) => {
    let body;
    try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'body must be JSON: {"script": "..."}' }), { status: 400, headers: { 'content-type': 'application/json' } }); }
    const script = String(body?.script ?? '');
    try {
      const compiled = compile(script);
      state.active = compiled;
      state.script = script;
      state.error = null;
      pushTrace({ ts: Date.now(), method: 'SCRIPT', path: '/servant/script', steps: [], outcome: 'reloaded', middlewareCount: compiled.middlewares.length, routeCount: compiled.routes.length, hasWs: !!compiled.wsHandler });
      return new Response(JSON.stringify({ ok: true, middlewares: compiled.middlewares.map((m) => m.name), routes: compiled.routes.map((r) => `${r.method} ${r.path}`), hasWs: !!compiled.wsHandler }), { headers: { 'content-type': 'application/json' } });
    } catch (err) {
      state.error = String(err?.message || err);
      return new Response(JSON.stringify({ ok: false, error: state.error }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
  });

  app.ws('/servant/trace', (ws) => {
    traceSockets.add(ws);
    for (const entry of trace.slice(-50)) { try { ws.send(JSON.stringify(entry)); } catch { /* ignore */ } }
    ws.on('close', () => traceSockets.delete(ws));
  });
}
