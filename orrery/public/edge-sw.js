/* ============================================================================
 * ORRERY "edge" Service Worker — ROADMAP.md §4.1.
 *
 * One real, installed Service Worker, registered under this site's own base
 * path (see src/edge-client.ts#registerEdgeServiceWorker), that intercepts
 * requests to /__edge/<planet>/... and relays them to whichever open browser
 * tab currently has that planet's room mounted, over a BroadcastChannel. The
 * owning tab runs a real `(Request) => Response` handler (a planet's already
 * compiled/built router, e.g. packfile's createRouter() or letterpress's
 * createRouter()) and answers back; this worker turns that answer into the
 * real HTTP response for whoever asked — curl-shaped fetch, an
 * `<iframe src="/__edge/packfile/...">`, or a module import resolving
 * against a real path all see a real network response, not an in-page call.
 *
 * Architecture is a direct generalization of the technique already proven in
 * src/playgrounds/studio.ts's Deploy tab (04) "live preview": a Service
 * Worker's fetch handler can't call back into the page directly (the page is
 * only a controlled *client* of the worker if it was loaded/claimed within
 * the worker's own scope — see below), so the relay round-trips through a
 * BroadcastChannel instead of `clients.postMessage`, exactly like Studio's
 * SW_CHANNEL relay.
 *
 * This file is a plain static asset served from `public/`, not a Vite-built
 * module — Studio's SW had to register *itself* (`import.meta.url`) because
 * that room owns no static file, which caps its scope at its own source
 * directory (`/src/playgrounds/` in dev) and forces a hidden SW-controlled
 * iframe as a workaround, since ORRERY's page itself lives outside that
 * scope. This file instead sits at the site's own base directory (wherever
 * `import.meta.env.BASE_URL` points — `/` in dev, `/orrery/` for the docs'
 * `--base=/orrery/` build), so its natural max scope *is* the whole app: the
 * real page becomes a directly controlled client once this worker claims it
 * (see `clients.claim()` below), and no hidden iframe is needed here.
 *
 * Scope is never hardcoded: `self.registration.scope` already reflects
 * wherever this worker was actually registered, so the `/__edge/...` prefix
 * this worker intercepts is computed from it at runtime — correct whether
 * the app is served from the domain root or from a sub-path.
 * ========================================================================== */

const CHANNEL_NAME = 'orrery:edge:relay';
const RELAY_TIMEOUT_MS = 4000;

/** `<scope-path>__edge/`, e.g. `/__edge/` at the root or `/orrery/__edge/` under a sub-path. */
function edgePrefix() {
  const scope = new URL(self.registration.scope);
  return scope.pathname.replace(/\/?$/, '/') + '__edge/';
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim already-open tabs immediately so the page that just registered this
  // worker (and any sibling ORRERY tabs) become controlled clients without
  // needing a reload — required for the BroadcastChannel relay to have
  // anyone real to talk to right away.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return; // never ours
  const prefix = edgePrefix();
  if (!url.pathname.startsWith(prefix)) return; // not an edge path: let the network/browser handle it
  event.respondWith(handleEdgeRequest(event.request, url, prefix));
});

async function handleEdgeRequest(request, url, prefix) {
  const rest = url.pathname.slice(prefix.length); // "<planet>/<subpath...>" or "<planet>"
  const slash = rest.indexOf('/');
  const planet = slash === -1 ? rest : rest.slice(0, slash);
  const subPath = (slash === -1 ? '/' : rest.slice(slash)) || '/';

  if (!planet) {
    return new Response('edge: missing planet segment -- expected /__edge/<planet>/...\n', {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'text/plain' },
    });
  }

  let body = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.clone().arrayBuffer();
  }

  const innerUrl = new URL(subPath + url.search, url.origin).toString();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // No open tab at all -> nobody can possibly answer. Fail fast with a real,
  // explanatory HTTP error instead of waiting out the whole relay timeout.
  const clients = await self.clients.matchAll({ type: 'window' });
  if (clients.length === 0) return noOwningPageResponse(planet);

  const bc = new BroadcastChannel(CHANNEL_NAME);
  try {
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('relay timeout')), RELAY_TIMEOUT_MS);
      bc.onmessage = (ev) => {
        const data = ev.data;
        if (!data || data.id !== id || data.type !== 'edge:response') return;
        clearTimeout(timer);
        resolve(data);
      };
      bc.postMessage({
        type: 'edge:fetch',
        id,
        planet,
        url: innerUrl,
        method: request.method,
        headers: [...request.headers],
        body,
      });
    });
    return new Response(reply.body, { status: reply.status, statusText: reply.statusText, headers: reply.headers });
  } catch {
    // Either nobody answered (no tab currently has this planet's room open /
    // registered a handler for it) or the answering tab errored out badly
    // enough to never reply -- both are "the owning page isn't here" from the
    // caller's point of view.
    return noOwningPageResponse(planet);
  } finally {
    bc.close();
  }
}

function noOwningPageResponse(planet) {
  const body =
    `503 Service Unavailable\n\n` +
    `No open ORRERY tab is currently showing the "${planet}" planet (or none has registered an edge handler for it).\n\n` +
    `The edge Service Worker forwards /__edge/${planet}/... to whichever browser tab currently has that planet's room ` +
    `mounted, over a BroadcastChannel -- open #/${planet} in a tab and try again.\n`;
  return new Response(body, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'content-type': 'text/plain', 'x-orrery-edge': 'no-owning-page' },
  });
}
