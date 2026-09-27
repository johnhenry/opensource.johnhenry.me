#!/usr/bin/env node
/**
 * ORRERY companion — OPTIONAL. `npm run node` starts it on http://localhost:7777.
 * Planets probe GET /orrery.json; if it answers they use the real servers, otherwise
 * they fall back to in-page stand-ins. Each demo lives in ./demos/<id>.mjs and exports
 * { id, describe, mount(app) }. A demo that throws is reported, never fatal.
 */
import http from 'node:http';
import { readdir } from 'node:fs/promises';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.ORRERY_PORT || 7777);
const routes = [];            // { method, path: string|RegExp, handler(req: Request, params) => Response|Promise<Response> }
const wsRoutes = new Map();   // path -> handler(socket, request)
const demos = [];             // { id, describe, ok, error }

// A demo that binds its own port can fail asynchronously (EADDRINUSE) after mount() resolved.
// Never let that take the whole companion down: attribute it to the last-mounting demo and keep serving.
let mounting = null;
process.on('uncaughtException', (e) => {
  const target = mounting || demos[demos.length - 1];
  if (target) { target.ok = false; target.error = String(e?.stack || e); }
  console.error(`[companion] demo error${target ? ` (${target.id})` : ''}: ${e?.message || e}`);
});
process.on('unhandledRejection', (e) => { console.error(`[companion] unhandled rejection: ${e?.message || e}`); });

// CORS: the site runs on another origin (vite :5173, or a deployed https site) and talks to this
// localhost process. Wildcards cover every planet; no credentials are ever used. The private-network
// header answers Chrome's Private Network Access preflight when a public https page calls localhost.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-allow-private-network': 'true',
  'access-control-max-age': '600',
};
const app = {
  route(method, path, handler) { routes.push({ method: method.toUpperCase(), path, handler }); },
  ws(path, handler) { wsRoutes.set(path, handler); },
  port: PORT,
};

for (const f of (await readdir(new URL('./demos/', import.meta.url))).filter(f => f.endsWith('.mjs')).sort()) {
  const entry = { id: f.replace(/\.mjs$/, ''), describe: '', ok: false, error: null };
  try {
    const m = await import(new URL(`./demos/${f}`, import.meta.url));
    entry.id = m.id || entry.id; entry.describe = m.describe || '';
    mounting = entry;
    await Promise.race([
      Promise.resolve(m.mount(app)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('mount() did not settle within 4s (a port bind probably failed)')), 4000)),
    ]);
    if (!entry.error) entry.ok = true;
    await new Promise((r) => setTimeout(r, 50)); // let async listen errors surface before moving on
  } catch (e) { entry.error = String(e?.stack || e); }
  demos.push(entry);
}
mounting = null;

function match(method, url) {
  for (const r of routes) {
    if (r.method !== method && r.method !== '*') continue;
    if (typeof r.path === 'string') { if (r.path === url.pathname) return { r, params: {} }; continue; }
    const m = url.pathname.match(r.path); if (m) return { r, params: m.groups || {} };
  }
  return null;
}

async function toWebRequest(req) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((res) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => res(Buffer.concat(c))); });
  return new Request(url, { method: req.method, headers: req.headers, body, duplex: 'half' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname === '/orrery.json') {
    res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
    return res.end(JSON.stringify({ name: 'orrery-companion', port: PORT, node: process.version, platform: process.platform, arch: process.arch, demos }, null, 2));
  }
  const hit = match(req.method, url);
  if (!hit) { res.writeHead(404, { ...CORS, 'content-type': 'text/plain' }); return res.end(`no route for ${req.method} ${url.pathname}`); }
  try {
    const out = await hit.r.handler(await toWebRequest(req), hit.params);
    const headers = { ...CORS }; out.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(out.status, headers);
    if (out.body) { for await (const chunk of out.body) res.write(chunk); }
    res.end();
  } catch (e) {
    res.writeHead(500, { ...CORS, 'content-type': 'text/plain' }); res.end(String(e?.stack || e));
  }
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const h = wsRoutes.get(url.pathname);
  if (!h) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => h(ws, req));
});

server.listen(PORT, () => {
  console.log(`ORRERY companion on http://localhost:${PORT}  (optional — the site works without it)`);
  for (const d of demos) console.log(`  ${d.ok ? '✓' : '✗'} ${d.id}${d.describe ? ' — ' + d.describe : ''}${d.error ? '\n      ' + d.error.split('\n')[0] : ''}`);
});
