/* ============================================================================
 * ROADMAP.md §4.1 -- "Service Worker 'edge'".
 *
 * Page-side half of the edge relay (public/edge-sw.js is the worker-side
 * half; read its header comment first for why the file split and the scope
 * math are what they are). This module:
 *
 *  1. Registers public/edge-sw.js as a real Service Worker, scoped to this
 *     site's own base path (`import.meta.env.BASE_URL` -- `/` in dev, or
 *     `/orrery/` for the docs' `--base=/orrery/` build), so `/__edge/...`
 *     requests are intercepted correctly under either.
 *  2. Exposes `registerEdgeHandler(planet, handler)`: any room can call this
 *     with the same `(Request) => Response` shape it already runs in-page
 *     (a compiled servable app, a packfile/letterpress router, a leserve
 *     handler, ...) to make it reachable at a REAL URL,
 *     `/__edge/<planet>/...`, from anywhere -- curl-shaped fetches, an
 *     `<iframe src>`, DevTools -- not just from in-page JS calls.
 *  3. Answers the worker's relayed requests over the same BroadcastChannel
 *     technique proven in studio.ts's Deploy tab: only a tab that (a) has
 *     registered a handler for the requested planet AND (b) is currently
 *     showing that planet's room answers; every other open tab stays silent.
 *     If no tab answers within the worker's own timeout, the worker itself
 *     returns a clear 503 -- see public/edge-sw.js's `noOwningPageResponse`.
 *
 * Proof of generality: two demo handlers below (packfile, letterpress) wire
 * real library calls into the relay. They're built here rather than inside
 * src/playgrounds/packfile.ts or letterpress.ts because this item's file
 * ownership is exactly public/edge-sw.js, this file, and one hook in
 * main.ts -- src/playgrounds/* is off limits. A production version would
 * have each room call `registerEdgeHandler(id, theRoomsLiveHandler)` itself
 * (a one-line addition inside its own mount()); these two stand in for that,
 * using the exact same npm packages and route shapes those rooms already
 * use, gated on the hash route exactly like a real room would be.
 * ========================================================================== */

export type EdgeHandler = (request: Request) => Response | Promise<Response>;

interface EdgeRegistration {
  handler: EdgeHandler;
  /** Only answer while this tab's current hash route is this planet -- models "the owning page must actually be open". */
  requireActiveRoute: boolean;
}

const CHANNEL_NAME = 'orrery:edge:relay';
const registry = new Map<string, EdgeRegistration>();
let relayChannel: BroadcastChannel | null = null;

/** Same hash-route parsing main.ts uses for `#/<id>?...` deep links. */
function currentRoom(): string {
  return location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
}

/**
 * Registers (or replaces) the handler a given planet answers `/__edge/<planet>/...`
 * requests with, while this tab is showing that planet. Returns an unregister fn.
 */
export function registerEdgeHandler(planet: string, handler: EdgeHandler, opts: { requireActiveRoute?: boolean } = {}): () => void {
  ensureRelayListener();
  registry.set(planet, { handler, requireActiveRoute: opts.requireActiveRoute !== false });
  return () => {
    if (registry.get(planet)?.handler === handler) registry.delete(planet);
  };
}

/** Page-side listener: answers the Service Worker's relayed fetches for any planet this tab owns a handler for. */
function ensureRelayListener() {
  if (relayChannel || typeof BroadcastChannel === 'undefined') return;
  relayChannel = new BroadcastChannel(CHANNEL_NAME);
  relayChannel.addEventListener('message', (ev: MessageEvent) => {
    void onRelayMessage(ev.data);
  });
}

async function onRelayMessage(data: any): Promise<void> {
  if (!data || data.type !== 'edge:fetch') return;
  const reg = registry.get(data.planet);
  if (!reg) return; // this tab has no handler for that planet at all -- stay silent, let the worker time out / another tab answer
  if (reg.requireActiveRoute && currentRoom() !== data.planet) return; // this tab isn't currently showing that planet's room

  let status = 500;
  let statusText = 'Edge Handler Error';
  let headers: [string, string][] = [['content-type', 'text/plain']];
  let body: ArrayBuffer | string;
  try {
    const init: RequestInit = { method: data.method, headers: data.headers };
    if (data.method !== 'GET' && data.method !== 'HEAD' && data.body) init.body = data.body;
    const req = new Request(data.url, init);
    const res = await reg.handler(req);
    status = res.status;
    statusText = res.statusText;
    headers = [...res.headers];
    body = await res.arrayBuffer();
  } catch (e) {
    body = `edge handler for "${data.planet}" threw:\n${(e as Error)?.stack ?? e}`;
  }
  relayChannel!.postMessage({ type: 'edge:response', id: data.id, status, statusText, headers, body });
}

let demoHandlersPromise: Promise<void> | null = null;

/** Registers the two proof-of-concept rooms (packfile, letterpress) -- see module doc comment above. Lazy + idempotent. */
function ensureDemoHandlers(): Promise<void> {
  if (!demoHandlersPromise) demoHandlersPromise = installDemoHandlers().catch((e) => console.error('[edge] demo handlers failed to load', e));
  return demoHandlersPromise;
}

async function installDemoHandlers(): Promise<void> {
  const [packfile, letterpress] = await Promise.all([
    import('@johnhenry/packfile/browser'),
    import('@johnhenry/letterpress'),
  ]);

  /* ---- packfile: a real 2-file archive, unpacked and served with the real createRouter() ---- */
  const encoder = new TextEncoder();
  async function fileEntry(data: Uint8Array) {
    const digest = await crypto.subtle.digest('SHA-256', data.slice().buffer as ArrayBuffer);
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return { data, size: data.byteLength, hash };
  }
  const indexHtml = encoder.encode('<!doctype html><title>edge: packfile</title><p>Served by @johnhenry/packfile\'s real createRouter(), reached over /__edge/packfile/.</p>');
  const hello = encoder.encode('hello from packfile, over a real Service Worker relay\n');
  const files = new Map<string, { data: Uint8Array; size: number; hash: string }>([
    ['index.html', await fileEntry(indexHtml)],
    ['hello.txt', await fileEntry(hello)],
  ]);
  const packfileRouter = packfile.createRouter(files, { alias: { '/': 'index.html' } });
  registerEdgeHandler('packfile', (req) => packfileRouter(req) as Promise<Response>);

  /* ---- letterpress: the README-shaped notes API, built from the real createRouter()/.endpoint tagged templates ---- */
  const notes = [
    { id: '1', title: 'Fix the press', body: 'Realign the platen before the next run.' },
    { id: '2', title: 'Order more ink', body: 'A fresh drum of black is due Friday.' },
  ];
  let nextId = 3;
  const json = (data: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(data, null, 2), { ...init, headers: { 'content-type': 'application/json', ...(init?.headers as Record<string, string> | undefined) } });
  const notesRouter = letterpress.createRouter({
    errorHandler: (error: Error) => json({ error: String(error?.message ?? error) }, { status: 500 }),
  });
  notesRouter.endpoint`GET /notes`(() => json(notes));
  notesRouter.endpoint`POST /notes`(async (request: Request) => {
    const body = await request.json().catch(() => ({} as any));
    const note = { id: String(nextId++), title: body.title || 'Untitled', body: body.body || '' };
    notes.push(note);
    return json(note, { status: 201 });
  });
  notesRouter.endpoint`GET /notes/:id`((_request: Request, { params }: any) => {
    const note = notes.find((n) => n.id === params.id);
    return note ? json(note) : json({ error: 'not found' }, { status: 404 });
  });
  registerEdgeHandler('letterpress', (req) => Promise.resolve(notesRouter(req)));
}

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Registers the edge Service Worker and wires up the page-side relay + demo
 * handlers. Safe to call once at startup (main.ts does); idempotent and
 * never throws -- failures (unsupported browser, insecure context, etc.) are
 * logged and swallowed so a failed registration never breaks page load.
 */
export async function registerEdgeServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  ensureRelayListener();
  void ensureDemoHandlers();

  if (!('serviceWorker' in navigator)) {
    console.warn('[edge] navigator.serviceWorker unavailable (needs a secure context: https, or localhost)');
    return null;
  }
  try {
    const scope = import.meta.env.BASE_URL; // '/' in dev; '/orrery/' for the docs' --base=/orrery/ build
    const swUrl = `${scope}edge-sw.js`;
    const reg = await navigator.serviceWorker.register(swUrl, { scope });
    await navigator.serviceWorker.ready;
    swRegistration = reg;
    return reg;
  } catch (e) {
    console.error('[edge] service worker registration failed', e);
    return null;
  }
}

/** Exposed for completeness / manual cleanup (e.g. from the Tester room); not called automatically. */
export async function unregisterEdgeServiceWorker(): Promise<void> {
  if (swRegistration) await swRegistration.unregister();
  swRegistration = null;
}
