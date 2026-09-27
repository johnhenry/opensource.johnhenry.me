/**
 * Companion demo for the "leserve" planet. Runs a REAL @johnhenry/leserve
 * serve() server on its own port (the companion itself owns 7777, so this
 * gets 7778 — reported below via `describe`, which lands in /orrery.json).
 *
 * The planet's browser-side handler-source editor is synced here by POSTing
 * the source text to `/leserve/handler` (a route on the companion, port
 * 7777); we compile it with `new Function` (a local dev tool — never do
 * this with untrusted input in production) and swap the live handler the
 * real server on 7778 dispatches to, so edits take effect without a
 * restart. GET reads the current source back (used by the planet to confirm
 * what's live).
 */
import serve from '@johnhenry/leserve/serve';

const PORT = 7778;

export const id = 'leserve';
export const describe = `real leserve serve() on :${PORT} — POST/GET /leserve/handler (here on :7777) hot-swaps + reads back its handler source`;

const DEFAULT_SRC = `(request) => {
  return new Response("Hello from a real leserve server!", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-allow-private-network': 'true',
  'access-control-max-age': '600',
};

function compile(src) {
  // eslint-disable-next-line no-new-func -- local dev tool, hot-swapping a demo handler
  const factory = new Function('Request', 'Response', 'Headers', 'URL', `"use strict"; return (\n${src}\n);`);
  const fn = factory(Request, Response, Headers, URL);
  if (typeof fn !== 'function') throw new Error('handler source must evaluate to a function: (request, context) => Response');
  return fn;
}

let currentSrc = DEFAULT_SRC;
let currentHandler = compile(DEFAULT_SRC);
let server;

export function mount(app) {
  // The real leserve server. Wraps whatever handler is currently live so
  // hot-swapping is just reassigning `currentHandler`, and tags every
  // response (including a thrown-handler's 500) with permissive CORS so
  // the browser — served from Vite on a different origin — can read it.
  server = serve(async (request, context) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      const res = await currentHandler(request, context);
      if (!(res instanceof Response)) throw new Error('handler did not return a Response');
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    } catch (err) {
      // Mirrors leserve's own serve() catch: tagged status if the error
      // carries one, otherwise a generic 500 + "Internal Server Error".
      const status = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
      console.error('[leserve demo] handler threw:', err);
      return new Response(status === 500 ? 'Internal Server Error' : (err.message || 'Error'), {
        status,
        headers: { ...CORS, 'content-type': 'text/plain' },
      });
    }
  }, { port: PORT, hostname: process.env.ORRERY_HOST || '127.0.0.1' });

  app.route('POST', '/leserve/handler', async (request) => {
    let src = '';
    try { src = await request.text(); } catch { /* empty body */ }
    try {
      currentHandler = compile(src);
      currentSrc = src;
      return new Response(JSON.stringify({ ok: true, port: PORT }), { headers: { 'content-type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err?.stack || err) }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
  });

  app.route('GET', '/leserve/handler', () =>
    new Response(JSON.stringify({ src: currentSrc, port: PORT }), { headers: { 'content-type': 'application/json' } }));
}
