/**
 * Site-wide HAR recorder (ROADMAP 4.3).
 *
 * Wraps `globalThis.fetch` exactly ONCE, at module load, so every real
 * network request any planet makes — not just ones that opt in — gets
 * captured as a spec-shaped HAR 1.2 entry via `@johnhenry/http-converter`'s
 * `har.fromRequest`/`har.fromResponse`. A small collapsible drawer lists the
 * last MAX_ENTRIES requests with ".har download", "open in Converter" and
 * "headers in Fields" actions (the latter two via the handoff bus).
 *
 * Transparency guarantee: the wrapper always calls through to the *original*
 * fetch with the caller's original `input`/`init`, unmodified, and returns
 * its response untouched. Everything used to build the HAR entry is read
 * from a `response.clone()` (never the response handed back to the caller)
 * and, for the request, from a `Request.clone()` or from body values that
 * are safe to re-read (string/Blob/ArrayBuffer/typed array/URLSearchParams).
 * FormData and ReadableStream request bodies are left opaque rather than
 * risking any interference with the real request.
 */
import * as http from '@johnhenry/http-converter';
import type { HarEntry, HttpRequest, HttpResponse } from '@johnhenry/http-converter';
import { send } from './bus';
import './har-recorder.css';

const { har } = http;

/** Keep memory bounded over a long session: only the most recent 200 requests are kept. */
const MAX_ENTRIES = 200;

interface CapturedEntry {
  id: number;
  entry: HarEntry;
  ok: boolean;
}

const entries: CapturedEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of listeners) {
    try { cb(); } catch (err) { console.error(err); }
  }
}

function pushEntry(e: CapturedEntry): void {
  entries.push(e);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  notify();
}

/* ------------------------------------------------------------------ */
/* fetch interception                                                  */
/* ------------------------------------------------------------------ */

interface ReqDescription {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

/** Bodies that are safe to read WITHOUT consuming a one-shot stream (the
 *  real fetch call gets the original, untouched `init.body`). FormData and
 *  ReadableStream are deliberately skipped. */
async function bodyToText(body: BodyInit | null | undefined): Promise<string | null> {
  if (body == null) return null;
  try {
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof Blob) return await body.text();
    if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
    if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body as Uint8Array);
  } catch { /* fall through to null */ }
  return null; // FormData, ReadableStream, or unreadable — left opaque
}

async function describeRequest(input: RequestInfo | URL, init: RequestInit | undefined): Promise<ReqDescription> {
  const headers: Record<string, string> = {};
  let method = 'GET';
  let url: string;
  let body: string | null = null;

  if (input instanceof Request) {
    method = (init?.method ?? input.method) || 'GET';
    url = input.url;
    // Per the fetch spec, init.headers (when present) REPLACES the
    // Request's own headers rather than merging with them.
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
    } else {
      input.headers.forEach((v, k) => { headers[k] = v; });
    }
    if (init && 'body' in init && init.body != null) {
      body = await bodyToText(init.body);
    } else if (input.body) {
      // clone() tees the stream — this never consumes what the real
      // fetch(input, init) call below will read from `input` itself.
      try { body = await input.clone().text(); } catch { body = null; }
    }
  } else {
    url = typeof input === 'string' ? input : input.toString();
    method = init?.method || 'GET';
    if (init?.headers) new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
    body = await bodyToText(init?.body);
  }

  try { url = new URL(url, location.href).toString(); } catch { /* keep as-is */ }
  return { method, url, headers, body };
}

interface ResDescription {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string | null;
}

/** MAX bytes of a captured body kept in memory/HAR content — large bodies are
 *  truncated (with a note) rather than risking unbounded memory growth over
 *  a long session. This only affects what the recorder stores, never the
 *  response handed back to the real caller. */
const MAX_CAPTURED_BODY = 200_000;

async function describeResponse(clone: Response): Promise<ResDescription> {
  const headers: Record<string, string> = {};
  clone.headers.forEach((v, k) => { headers[k] = v; });
  let body: string | null = null;
  try {
    const text = await clone.text();
    body = text.length > MAX_CAPTURED_BODY
      ? `${text.slice(0, MAX_CAPTURED_BODY)}\n…[truncated by HAR recorder, ${text.length} bytes total]`
      : text;
  } catch { body = null; }
  return { statusCode: clone.status, statusText: clone.statusText, headers, body };
}

function installFetchInterceptor(): void {
  const g = globalThis as typeof globalThis & { __orreryHarFetchPatched?: boolean };
  if (g.__orreryHarFetchPatched) return; // guard against double-patching (e.g. Vite HMR re-running this module)
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const start = performance.now();
    const startedDateTime = new Date().toISOString();
    // Runs concurrently with the real request; never awaited before the
    // real fetch is issued, and never touches anything the real fetch reads.
    const reqDescPromise = describeRequest(input, init).catch((): ReqDescription => ({
      method: init?.method || 'GET',
      url: String(input instanceof Request ? input.url : input),
      headers: {},
      body: null,
    }));

    try {
      const response = await originalFetch(input, init);
      const elapsed = performance.now() - start;
      // Clone IMMEDIATELY, before returning control to the caller, so there
      // is no chance of racing the caller's own read of the response body.
      let captureClone: Response | null = null;
      try { captureClone = response.clone(); } catch { captureClone = null; }

      void (async () => {
        try {
          const reqDesc = await reqDescPromise;
          const resDesc = captureClone ? await describeResponse(captureClone) : null;
          const reqLike: HttpRequest = { method: reqDesc.method, url: reqDesc.url, headers: reqDesc.headers, body: reqDesc.body };
          const entry: HarEntry = resDesc
            ? await har.fromResponse(
                { statusCode: resDesc.statusCode, statusText: resDesc.statusText, headers: resDesc.headers, body: resDesc.body } satisfies HttpResponse,
                reqLike,
                { startedDateTime, time: elapsed, timings: { send: 0, wait: elapsed, receive: 0 } },
              )
            : await har.fromRequest(reqLike, { startedDateTime, time: elapsed, timings: { send: 0, wait: elapsed, receive: 0 } });
          pushEntry({ id: nextId++, entry, ok: response.ok });
        } catch (err) {
          console.error('[har-recorder] failed to capture entry', err);
        }
      })();

      return response;
    } catch (err) {
      const elapsed = performance.now() - start;
      void (async () => {
        try {
          const reqDesc = await reqDescPromise;
          const entry = await har.fromRequest(
            { method: reqDesc.method, url: reqDesc.url, headers: reqDesc.headers, body: reqDesc.body },
            { startedDateTime, time: elapsed, timings: { send: 0, wait: elapsed, receive: 0 }, comment: `network error: ${err instanceof Error ? err.message : String(err)}` },
          );
          pushEntry({ id: nextId++, entry, ok: false });
        } catch (e2) {
          console.error('[har-recorder] failed to capture failed request', e2);
        }
      })();
      throw err; // never swallow — the caller must see the same failure it would have without this wrapper
    }
  }) as typeof fetch;

  g.__orreryHarFetchPatched = true;
}

// Patch at module load, per the roadmap brief — capture starts the moment
// this module is imported, regardless of when/whether installHarRecorder()
// (the UI) is mounted.
installFetchInterceptor();

/* ------------------------------------------------------------------ */
/* HAR 1.2 file                                                        */
/* ------------------------------------------------------------------ */

function buildHarFile() {
  return {
    log: {
      version: '1.2',
      creator: { name: 'ORRERY HAR Recorder', version: '1.0' },
      entries: entries.map((e) => e.entry),
    },
  };
}

function downloadHarFile(): void {
  const json = JSON.stringify(buildHarFile(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orrery-${new Date().toISOString().replace(/[:.]/g, '-')}.har`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ */
/* drawer UI                                                           */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function statusClass(status: number, ok: boolean): string {
  if (!ok && status === 0) return 'err';
  if (status >= 500) return 'err';
  if (status >= 400) return 'warn';
  if (status >= 200 && status < 300) return 'ok';
  return 'other';
}

function headersOf(entry: HarEntry): Array<{ name: string; value: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; value: string }> = [];
  for (const h of [...entry.request.headers, ...entry.response.headers]) {
    const key = `${h.name.toLowerCase()}:${h.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: h.name, value: h.value });
  }
  return out;
}

function renderRow(e: CapturedEntry): string {
  const { entry } = e;
  const method = entry.request.method || 'GET';
  const status = entry.response.status || 0;
  const cls = statusClass(status, e.ok);
  const time = Math.max(0, Math.round(entry.time));
  return `<div class="har-rec-row" data-id="${e.id}">
    <div class="har-rec-row-main">
      <span class="har-rec-method">${escapeHtml(method)}</span>
      <span class="har-rec-url" title="${escapeHtml(entry.request.url)}">${escapeHtml(entry.request.url)}</span>
      <span class="har-rec-status st-${cls}">${status || '—'}</span>
      <span class="har-rec-time">${time}ms</span>
    </div>
    <div class="har-rec-row-actions">
      <button type="button" class="tb-btn" data-act="converter" data-id="${e.id}">open in Converter</button>
      <button type="button" class="tb-btn" data-act="fields" data-id="${e.id}">headers in Fields</button>
    </div>
  </div>`;
}

/** Mounts the drawer toggle + panel into `document.body` (once) and returns
 *  a live capture. Safe to call more than once (e.g. accidental double
 *  import) — a second call is a no-op. */
export function installHarRecorder(): void {
  if (document.querySelector('[data-har-recorder]')) return;

  const root = document.createElement('div');
  root.className = 'har-rec';
  root.setAttribute('data-har-recorder', '');
  root.innerHTML = `
    <button type="button" class="har-rec-toggle" data-har-toggle title="Site-wide HAR recorder">
      <span class="har-rec-dot"></span>HAR <span class="har-rec-count" data-har-count>0</span>
    </button>
    <aside class="har-rec-drawer" data-har-drawer hidden>
      <div class="har-rec-head">
        <b>HAR recorder</b>
        <span class="stat" data-har-sub>0 requests captured</span>
        <span class="har-rec-spacer"></span>
        <button type="button" class="tb-btn" data-har-clear>clear</button>
        <button type="button" class="tb-btn" data-har-download>.har download</button>
        <button type="button" class="tb-btn" data-har-close>✕</button>
      </div>
      <div class="har-rec-list" data-har-list></div>
    </aside>`;
  document.body.appendChild(root);

  const toggle = root.querySelector<HTMLButtonElement>('[data-har-toggle]')!;
  const drawer = root.querySelector<HTMLElement>('[data-har-drawer]')!;
  const list = root.querySelector<HTMLElement>('[data-har-list]')!;
  const count = root.querySelector<HTMLElement>('[data-har-count]')!;
  const sub = root.querySelector<HTMLElement>('[data-har-sub]')!;
  const closeBtn = root.querySelector<HTMLButtonElement>('[data-har-close]')!;
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-har-clear]')!;
  const downloadBtn = root.querySelector<HTMLButtonElement>('[data-har-download]')!;

  function render() {
    count.textContent = String(entries.length);
    sub.textContent = `${entries.length} request${entries.length === 1 ? '' : 's'} captured (site-wide, last ${MAX_ENTRIES} kept)`;
    // Most recent first.
    list.innerHTML = entries.length
      ? [...entries].reverse().map(renderRow).join('')
      : '<p class="har-rec-empty stat">No requests yet — every fetch() any planet makes will show up here.</p>';
  }

  function openDrawer() { drawer.hidden = false; toggle.classList.add('is-open'); }
  function closeDrawer() { drawer.hidden = true; toggle.classList.remove('is-open'); }

  toggle.addEventListener('click', () => { drawer.hidden ? openDrawer() : closeDrawer(); });
  closeBtn.addEventListener('click', closeDrawer);
  clearBtn.addEventListener('click', () => { entries.length = 0; render(); });
  downloadBtn.addEventListener('click', () => {
    if (!entries.length) return;
    downloadHarFile();
  });

  list.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const captured = entries.find((e) => e.id === id);
    if (!captured) return;
    if (btn.dataset.act === 'converter') {
      send('har-recorder', 'converter', 'har-entry', captured.entry);
    } else if (btn.dataset.act === 'fields') {
      send('har-recorder', 'fields', 'har-headers', headersOf(captured.entry));
    }
  });

  listeners.add(render);
  render();
}
