import type { Playground } from '../registry';
import { string as httpString } from '@johnhenry/http-converter';
import { probeCompanion, hasDemo, companionBanner, type Companion } from '../companion';
import { readState, writeState, copyLink } from '../state';
import './leserve.css';

/**
 * Leserve Wire — an editor for a `(request) => Response` handler, the one
 * API leserve ships (`serve()`, Deno.serve-shaped, Node-only). A request
 * composer sends a Request at the handler; a response viewer shows status,
 * headers, body and timing; a "wire view" renders the raw HTTP/1.1 text for
 * both, reusing @johnhenry/http-converter's `string` module — it accepts a
 * *real* Request/Response object directly, so the exact objects this planet
 * builds/receives are what get serialized, not a re-derived approximation.
 *
 * Two run modes:
 *  - Live (companion up, server/demos/leserve.mjs mounted ok): the handler
 *    source is POSTed to the companion (localhost:7777) which hot-swaps it
 *    into a REAL leserve serve() on its own port, 7778; this planet then does
 *    a real cross-origin fetch() to it — actual Node, actual sockets.
 *  - Fallback: the handler source is compiled in-page with `new Function`
 *    and invoked directly against a constructed Request — no server, no
 *    socket, but the same handler shape and the same wire-text rendering.
 */

const LESERVE_PORT = 7778;

interface Preset {
  id: string;
  name: string;
  method: string;
  path: string;
  headers: string;
  body: string;
  src: string;
  note: string;
}

const PRESETS: Preset[] = [
  {
    id: 'hello',
    name: 'Hello + headers echo',
    method: 'GET',
    path: '/',
    headers: 'x-orrery: leserve-room',
    body: '',
    note: 'The README\'s "Hello, World!" example, plus an echo of every header the request arrived with — proof the handler sees the real Headers object leserve (or this in-page evaluator) built for it.',
    src: `(request) => {
  const headers = {};
  for (const [key, value] of request.headers) headers[key] = value;
  return new Response(JSON.stringify({
    message: "Hello, World!",
    method: request.method,
    url: request.url,
    headers,
  }, null, 2), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}`,
  },
  {
    id: 'jsonapi',
    name: 'JSON API + method switch',
    method: 'GET',
    path: '/items',
    headers: '',
    body: '{"name":"a new item"}',
    note: 'One handler, dispatched on request.method: GET lists, POST creates (201), DELETE removes (204 — no body), anything else gets a 405 with an Allow header. Flip the Method select and re-send.',
    src: `(request) => {
  switch (request.method) {
    case "GET":
      return new Response(JSON.stringify({ items: ["alpha", "beta", "gamma"] }), {
        headers: { "content-type": "application/json" },
      });
    case "POST":
      return new Response(JSON.stringify({ created: true, at: Date.now() }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    case "DELETE":
      return new Response(null, { status: 204 });
    default:
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { "content-type": "application/json", allow: "GET, POST, DELETE" },
      });
  }
}`,
  },
  {
    id: 'streaming',
    name: 'Streaming response',
    method: 'GET',
    path: '/ticks',
    headers: '',
    body: '',
    note: 'The Response body is a ReadableStream that enqueues a chunk every ~350ms and closes after five. Watch the Response panel fill in live as chunks arrive; the wire view only settles once the stream ends.',
    src: `(request) => {
  let n = 0;
  const stream = new ReadableStream({
    start(controller) {
      const tick = () => {
        controller.enqueue(new TextEncoder().encode(\`tick \${n++} @ \${new Date().toISOString()}\\n\`));
        if (n < 5) setTimeout(tick, 350);
        else controller.close();
      };
      tick();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/plain", "x-stream": "ticking" },
  });
}`,
  },
  {
    id: 'redirect',
    name: 'Redirect + status showcase',
    method: 'GET',
    path: '/status?status=201',
    headers: '',
    body: '',
    note: 'A ?status= query controls the code returned from most paths. Try path "/go" for a 307 redirect to "/landed": Live mode fetch()es and auto-follows it (you see the final response), while the in-page evaluator calls the handler directly and shows the raw 307 + Location header.',
    src: `(request) => {
  const url = new URL(request.url);
  const code = Number(url.searchParams.get("status")) || 200;
  if (url.pathname === "/go") {
    return Response.redirect(new URL("/landed", url).toString(), 307);
  }
  return new Response(\`status \${code} from leserve\\npath: \${url.pathname}\`, {
    status: code,
    headers: { "x-showcase": "status" },
  });
}`,
  },
  {
    id: 'throws',
    name: 'Throwing handler',
    method: 'GET',
    path: '/boom',
    headers: '',
    body: '',
    note: 'The handler throws synchronously. leserve\'s serve() wraps every handler call in a try/catch and turns an uncaught throw into a 500 "Internal Server Error" (logging the real error server-side) — the demo companion\'s wrapper mirrors that exactly, and so does the in-page evaluator.',
    src: `(request) => {
  throw new Error("Handler exploded on purpose — this is what an unhandled throw looks like.");
}`,
  },
];

interface RoomState {
  preset: string;
  method: string;
  path: string;
  headers: string;
  body: string;
  src: string;
  [key: string]: string;
}

function defaultsFor(preset: Preset): RoomState {
  return { preset: preset.id, method: preset.method, path: preset.path, headers: preset.headers, body: preset.body, src: preset.src };
}

function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const raw = line.trim();
    if (!raw) continue;
    const i = raw.indexOf(':');
    if (i < 0) continue;
    out[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
  }
  return out;
}

/** Compile handler source (an arrow/function expression) with `new Function`.
 *  A local dev tool by design — see AGENTS.md / PLAN.md Phase 4. */
function compileHandler(src: string): (request: Request, context: unknown) => unknown {
  // eslint-disable-next-line no-new-func
  const factory = new Function('Request', 'Response', 'Headers', 'URL', `"use strict"; return (\n${src}\n);`);
  const fn = factory(Request, Response, Headers, URL);
  if (typeof fn !== 'function') throw new Error('Handler source must evaluate to a function: (request, context) => Response');
  return fn as (request: Request, context: unknown) => unknown;
}

const playground: Playground = {
  id: 'leserve',
  title: 'Leserve Wire',
  pkg: '@johnhenry/leserve',
  hue: 190,
  blurb: 'One API: serve(). A plain (Request) => Response handler, Deno-shaped, on real Node when the companion runs.',
  docs: 'https://opensource.johnhenry.me/leserve/',

  async mount(host) {
    host.classList.add('pg-leserve');
    let disposed = false;
    let inflight: AbortController | null = null;

    const first = PRESETS[0];
    const initial = readState<RoomState>(defaultsFor(first));
    let preset = PRESETS.find((p) => p.id === initial.preset) ?? first;

    host.innerHTML = `
      <div id="banner"></div>
      <div class="lsv-toolbar">
        <label class="field"><span>Preset</span>
          <select id="preset">${PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
        </label>
        <button class="btn" id="reset-btn" type="button">Reset to preset</button>
        <button class="btn" id="link-btn" type="button">Copy link</button>
        <span class="stat" id="target-stat"></span>
      </div>
      <p class="lsv-note" id="note"></p>
      <div class="grid-2">
        <div class="panel">
          <h3>Handler source <span class="chip">(request, context) =&gt; Response</span></h3>
          <textarea class="code" id="src-input" spellcheck="false"></textarea>
          <h3>Request</h3>
          <div class="lsv-req-row">
            <label class="field"><span>Method</span>
              <select id="method-input">${['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => `<option value="${m}">${m}</option>`).join('')}</select>
            </label>
            <label class="field lsv-path"><span>Path</span><input id="path-input" spellcheck="false" /></label>
          </div>
          <label class="field"><span>Headers (one per line, "name: value")</span>
            <textarea class="code" id="headers-input" spellcheck="false" rows="3"></textarea>
          </label>
          <label class="field"><span>Body</span>
            <textarea class="code" id="body-input" spellcheck="false" rows="4"></textarea>
          </label>
          <button class="btn primary" id="send-btn" type="button">Send ▸</button>
        </div>
        <div class="panel">
          <h3>Response <span class="stat" id="timing-stat"></span></h3>
          <div class="lsv-status" id="status-line"></div>
          <pre class="code" id="resp-headers"></pre>
          <pre class="code" id="resp-body">(no request sent yet)</pre>
        </div>
      </div>
      <div class="panel lsv-wire">
        <h3>Wire view <span class="chip">raw HTTP/1.1</span></h3>
        <div class="grid-2">
          <div><div class="stat">Request</div><pre class="code" id="wire-req"></pre></div>
          <div><div class="stat">Response</div><pre class="code" id="wire-res"></pre></div>
        </div>
      </div>
    `;

    const q = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T;
    const banner = q<HTMLDivElement>('#banner');
    const presetSel = q<HTMLSelectElement>('#preset');
    const note = q<HTMLParagraphElement>('#note');
    const srcInput = q<HTMLTextAreaElement>('#src-input');
    const methodInput = q<HTMLSelectElement>('#method-input');
    const pathInput = q<HTMLInputElement>('#path-input');
    const headersInput = q<HTMLTextAreaElement>('#headers-input');
    const bodyInput = q<HTMLTextAreaElement>('#body-input');
    const sendBtn = q<HTMLButtonElement>('#send-btn');
    const resetBtn = q<HTMLButtonElement>('#reset-btn');
    const linkBtn = q<HTMLButtonElement>('#link-btn');
    const targetStat = q<HTMLSpanElement>('#target-stat');
    const timingStat = q<HTMLSpanElement>('#timing-stat');
    const statusLine = q<HTMLDivElement>('#status-line');
    const respHeaders = q<HTMLPreElement>('#resp-headers');
    const respBody = q<HTMLPreElement>('#resp-body');
    const wireReq = q<HTMLPreElement>('#wire-req');
    const wireRes = q<HTMLPreElement>('#wire-res');

    function fill(s: RoomState) {
      presetSel.value = s.preset;
      srcInput.value = s.src;
      methodInput.value = s.method;
      pathInput.value = s.path;
      headersInput.value = s.headers;
      bodyInput.value = s.body;
      note.textContent = PRESETS.find((p) => p.id === s.preset)?.note ?? '';
    }
    fill(initial);

    function currentState(): RoomState {
      return {
        preset: presetSel.value,
        method: methodInput.value,
        path: pathInput.value,
        headers: headersInput.value,
        body: bodyInput.value,
        src: srcInput.value,
      };
    }
    function persist() {
      writeState(currentState(), defaultsFor(preset));
    }

    let companion: Companion | null = null;
    let live = false;

    function renderBanner() {
      banner.innerHTML = '';
      banner.appendChild(
        companionBanner(
          companion,
          'leserve',
          'runs your handler right here with a constructed Request — no real Node socket, no real HTTP/1.1 wire; the raw text below is synthesized by @johnhenry/http-converter instead of captured off the network.',
        ),
      );
      targetStat.textContent = live ? `→ real leserve on :${LESERVE_PORT}` : '→ in-page evaluator';
    }

    async function refreshCompanion() {
      companion = await probeCompanion();
      live = hasDemo(companion, 'leserve');
      renderBanner();
    }

    let running = false;
    async function run() {
      if (running) return;
      running = true;
      inflight?.abort();
      const ctl = new AbortController();
      inflight = ctl;
      sendBtn.disabled = true;
      statusLine.innerHTML = '<span class="stat">running…</span>';
      respHeaders.textContent = '';
      respBody.textContent = '';
      wireReq.textContent = '';
      wireRes.textContent = '';
      timingStat.textContent = '';

      try {
        const method = methodInput.value;
        const path = pathInput.value.trim() || '/';
        const headerObj = parseHeaderLines(headersInput.value);
        const body = ['GET', 'HEAD'].includes(method) ? undefined : bodyInput.value || undefined;
        const src = srcInput.value;

        const url = live
          ? `http://localhost:${LESERVE_PORT}${path}`
          : `https://leserve.playground.local${path}`;
        const req = new Request(url, { method, headers: headerObj, body });

        const t0 = performance.now();
        let res: Response;

        if (live) {
          const swap = await fetch(`${companion!.base}/leserve/handler`, {
            method: 'POST',
            body: src,
            signal: ctl.signal,
          }).catch((e) => {
            throw new Error(`Could not reach the companion to sync the handler: ${(e as Error).message}`);
          });
          if (!swap.ok) {
            const j = await swap.json().catch(() => null);
            throw new Error(`Companion rejected the handler source:\n${j?.error ?? swap.statusText}`);
          }
          res = await fetch(req.clone(), { signal: ctl.signal });
        } else {
          const handler = compileHandler(src);
          const out = await handler(req.clone(), { remoteAddress: '127.0.0.1 (in-page)', raw: null, state: new Map() });
          if (!(out instanceof Response)) throw new Error('Handler must return a Response (or a Promise of one).');
          res = out;
        }
        const t1 = performance.now();
        if (ctl.signal.aborted) return;

        statusLine.innerHTML = `<span class="lsv-code s${Math.floor(res.status / 100) || 0}">${res.status}</span><span>${res.statusText || ''}</span>`;

        const hlines: string[] = [];
        res.headers.forEach((v, k) => hlines.push(`${k}: ${v}`));
        respHeaders.textContent = hlines.length ? hlines.join('\n') : '(no headers)';

        // Kick off the wire-text renders (both clone before any body is
        // read elsewhere) and the live body read in parallel — the
        // streaming preset's body trickles in over ~1.7s while the wire
        // view (which awaits the *whole* body) settles once it closes.
        const reqWirePromise = httpString.stringifyRequest(req.clone());
        const resWirePromise = httpString.stringifyResponse(res.clone());

        const bodyClone = res.clone();
        if (bodyClone.body) {
          const reader = bodyClone.body.getReader();
          const decoder = new TextDecoder();
          let acc = '';
          respBody.textContent = '';
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (ctl.signal.aborted) return;
            if (done) break;
            acc += decoder.decode(value, { stream: true });
            respBody.textContent = acc;
          }
          if (!acc) respBody.textContent = '(empty body)';
        } else {
          respBody.textContent = '(no body)';
        }

        wireReq.textContent = await reqWirePromise;
        wireRes.textContent = await resWirePromise;
      } catch (err) {
        if (ctl.signal.aborted) return;
        statusLine.innerHTML = '<span class="lsv-code s5">ERR</span>';
        respBody.textContent = `${(err as Error)?.message ?? err}`;
      } finally {
        if (!ctl.signal.aborted) {
          sendBtn.disabled = false;
          running = false;
        }
      }
    }

    function applyPreset(id: string) {
      const p = PRESETS.find((pp) => pp.id === id) ?? PRESETS[0];
      preset = p;
      fill(defaultsFor(p));
      persist();
      run();
    }

    presetSel.addEventListener('change', () => applyPreset(presetSel.value));
    resetBtn.addEventListener('click', () => applyPreset(preset.id));
    linkBtn.addEventListener('click', async () => {
      await copyLink();
      const orig = linkBtn.textContent;
      linkBtn.textContent = 'copied ✓';
      setTimeout(() => {
        if (!disposed) linkBtn.textContent = orig;
      }, 1200);
    });
    sendBtn.addEventListener('click', () => {
      persist();
      run();
    });
    for (const inputEl of [methodInput, pathInput, headersInput, bodyInput, srcInput]) {
      inputEl.addEventListener('input', persist);
    }

    await refreshCompanion();
    if (disposed) return;
    run(); // impressive zero-input default state

    return () => {
      disposed = true;
      inflight?.abort();
    };
  },
};

export default playground;
