import type { Playground } from '../registry';
import * as http from '@johnhenry/http-converter';
import type { HttpRequest, HarEntry } from '@johnhenry/http-converter';
import { attemptParse, bareType, formatBareValue, TYPE_LABEL, type FType, type AnyItem } from './fields';
import { handoffButton, receive, handoffBanner } from '../bus';
import { readState, writeState, copyLink } from '../state';
import './converter.css';

// Issue #4 (subpath exports untyped, `allFormats()` undeclared) is fixed as
// of 0.0.1: `allFormats()` is now declared on the typed root export, so this
// planet calls it directly instead of reimplementing it over the subpaths.
const { string: httpString, har, curl, fetch: fetchMod, detectType, allFormats } = http;

// ---------------------------------------------------------------------------
// Format detection
//
// The library's own detectType() only classifies strings that already start
// with "HTTP/" / a method + "/" / "curl", or plain objects (HAR shape vs a
// bare {method,url} request). It doesn't know about fetch()-source text or
// full HAR files ({log:{entries:[...]}}) — this planet layers those on top and
// records *which* heuristic fired so the detection panel can quote it.
// ---------------------------------------------------------------------------

type Kind = 'http' | 'har' | 'curl' | 'fetch' | 'unknown';

interface Detection {
  kind: Kind;
  reason: string;
}

function detect(raw: string): Detection {
  const text = raw.trim();
  if (!text) return { kind: 'unknown', reason: 'Empty input.' };

  if (text[0] === '{' || text[0] === '[') {
    let obj: unknown;
    try {
      obj = JSON.parse(text);
    } catch (err) {
      return {
        kind: 'unknown',
        reason: `Looks like JSON (starts with "${text[0]}") but JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (obj && typeof obj === 'object') {
      const t = detectType(obj as Record<string, unknown>);
      if (t === 'har') {
        return { kind: 'har', reason: 'detectType() classified the parsed JSON as HAR — it has a "startedDateTime"+"request" pair, a "request"+"response"+"timings" triple, or a "log"+"entries" wrapper.' };
      }
      if ('log' in (obj as Record<string, unknown>)) {
        return { kind: 'har', reason: 'Parsed JSON has a top-level "log" key — a full HAR file.' };
      }
      return { kind: 'unknown', reason: 'Valid JSON, but detectType() found no HAR shape ("startedDateTime"/"request"+"response"+"timings"/"log"+"entries") in it.' };
    }
    return { kind: 'unknown', reason: 'Valid JSON but not an object.' };
  }

  if (/^curl\b/i.test(text)) {
    return { kind: 'curl', reason: 'Input starts with the literal word "curl" — the same check curl.toRequest() makes (`/^\\s*curl\\b/i`).' };
  }

  if (/^(await\s+)?fetch\s*\(/.test(text)) {
    return { kind: 'fetch', reason: 'Input starts with a `fetch(` call — this planet evaluates it in a sandboxed function with a mock fetch() to capture the (url, options) arguments, then feeds them to fetch.toRequest().' };
  }

  const t = detectType(text);
  if (t === 'request') {
    return { kind: 'http', reason: 'detectType() matched the request-line pattern `/^[A-Z]+\\s+\\//` — a method followed by a path.' };
  }
  if (t === 'response') {
    return { kind: 'unknown', reason: 'detectType() says this is an HTTP *response* (starts with "HTTP/") — this planet converts requests only. Paste a request line instead.' };
  }
  if (t === 'curl') {
    return { kind: 'curl', reason: 'detectType() matched the "curl" prefix.' };
  }
  return { kind: 'unknown', reason: 'None of detectType()\'s string patterns matched (no "HTTP/" prefix, no "METHOD /path" request line, no "curl" prefix), no JSON, no fetch( call.' };
}

// ---------------------------------------------------------------------------
// fetch()-source parsing — the library has no text parser for fetch() code
// (fetch.toRequest expects real (url, options) values, not source text), so
// this planet evaluates the pasted call in an isolated Function scope with a
// mock fetch injected, capturing its arguments without ever hitting the
// network.
// ---------------------------------------------------------------------------

function parseFetchCode(code: string): { url: string; options: RequestInit } {
  let captured: { url: string; options: RequestInit } | undefined;
  const mockFetch = (url: string, options: RequestInit = {}) => {
    captured = { url, options };
    return Promise.resolve(new Response());
  };
  // eslint-disable-next-line no-new-func
  const runner = new Function('fetch', `"use strict"; return (${code.trim().replace(/^await\s+/, '')});`);
  runner(mockFetch);
  if (!captured) throw new Error('Could not find a fetch(url, options) call to evaluate.');
  return captured;
}

async function fetchCodeToRequest(code: string): Promise<HttpRequest> {
  const { url, options } = parseFetchCode(code);
  return fetchMod.toRequest(url, options);
}

function harToRequest(text: string): HttpRequest {
  const parsed = JSON.parse(text) as HarEntry | { log: { entries: HarEntry[] } };
  const entry: HarEntry = 'log' in parsed ? parsed.log.entries[0] : parsed;
  if (!entry) throw new Error('HAR log has no entries.');
  return har.toRequest(entry);
}

async function parseByKind(kind: Kind, text: string): Promise<HttpRequest> {
  switch (kind) {
    case 'http':
      return httpString.parseRequest(text);
    case 'curl':
      return curl.toRequest(text);
    case 'fetch':
      return fetchCodeToRequest(text);
    case 'har':
      return harToRequest(text);
    default:
      throw new Error('Unrecognized format — see the detection panel below.');
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS: Record<string, { label: string; text: string }> = {
  jsonPost: {
    label: 'JSON POST + auth',
    text: `POST /api/v1/users HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0
Content-Type: application/json
Accept: application/json

{"name":"Ada Lovelace","role":"admin"}`,
  },
  multipart: {
    label: 'Multipart form',
    text: `POST /upload HTTP/1.1
Host: files.example.com
Content-Type: multipart/form-data; boundary=----WebKitBoundary7MA4YWxkTrZu0gW

------WebKitBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="title"

Quarterly report
------WebKitBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="report.pdf"
Content-Type: application/pdf

%PDF-1.4 ...(binary omitted)...
------WebKitBoundary7MA4YWxkTrZu0gW--`,
  },
  getQuery: {
    label: 'GET + query + cookies',
    text: `GET /search?q=orrery&sort=stars&page=2 HTTP/1.1
Host: shop.example.com
Cookie: session=abc123; theme=dark
Accept: text/html`,
  },
  harEntry: {
    label: 'HAR entry (with response)',
    text: JSON.stringify(
      {
        startedDateTime: '2024-01-01T00:00:00.000Z',
        time: 42,
        request: {
          method: 'GET',
          url: 'https://api.example.com/v1/status?verbose=1',
          httpVersion: 'HTTP/1.1',
          cookies: [{ name: 'session', value: 'har-9f8e' }],
          headers: [
            { name: 'Accept', value: 'application/json' },
            { name: 'User-Agent', value: 'orrery-http-converter/1.0' },
          ],
          queryString: [{ name: 'verbose', value: '1' }],
          headersSize: -1,
          bodySize: 0,
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          cookies: [],
          headers: [{ name: 'Content-Type', value: 'application/json' }],
          content: { size: 33, mimeType: 'application/json', text: '{"status":"ok","uptime":123456}' },
          redirectURL: '',
          headersSize: -1,
          bodySize: 33,
        },
        cache: {},
        timings: { send: 1, wait: 40, receive: 1 },
      },
      null,
      2,
    ),
  },
  curlCmd: {
    label: 'cURL with -H/-d/-X',
    text: `curl -X POST 'https://api.example.com/v1/orders' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Request-Id: 8f2e1c' \\
  -d '{"item":"widget","qty":3}'`,
  },
  fetchCall: {
    label: 'fetch() with headers',
    text: `fetch("https://api.example.com/v1/comments", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Client": "orrery"
  },
  body: JSON.stringify({ postId: 42, text: "Nice planet!" })
})`,
  },
  structuredHeaders: {
    label: 'Structured headers (RFC 8941/9651)',
    text: `POST /api/v1/reports HTTP/1.1
Host: api.example.com
Priority: u=1, i
Sec-CH-UA: "Chromium";v="128", "Not(A:Brand";v="24", "Google Chrome";v="128"
Sec-CH-UA-Platform: "macOS"
Sec-CH-UA-Mobile: ?0
Content-Digest: sha-256=:aGVsbG8td29ybGQ=:
Want-Content-Digest: sha-256=10, sha-512=1
Signature-Input: sig1=("@method" "@authority" "content-digest");created=1618884473;keyid="test-key-rsa-pss";alg="rsa-pss-sha512"
Signature: sig1=:aGVsbG8tc2lnbmF0dXJl:
Content-Type: application/json

{"summary":"quarterly numbers"}`,
  },
};

const DEFAULT_PRESET = 'structuredHeaders';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const KIND_LABEL: Record<Kind, string> = {
  http: 'HTTP',
  har: 'HAR',
  curl: 'cURL',
  fetch: 'fetch',
  unknown: '?',
};

const OUTPUT_PANES: Array<{ key: 'httpString' | 'curl' | 'fetchCode' | 'har'; label: string; lang: string }> = [
  { key: 'httpString', label: 'Raw HTTP', lang: 'http' },
  { key: 'curl', label: 'cURL', lang: 'bash' },
  { key: 'fetchCode', label: 'fetch()', lang: 'js' },
  { key: 'har', label: 'HAR entry', lang: 'json' },
];

// ---------------------------------------------------------------------------
// Structured headers panel
//
// Any header on the parsed request whose name is a known RFC 8941/9651
// Structured Field Value scans it through the same Item/List/Dictionary
// cascade the Header Fields planet uses (`attemptParse`, imported from
// ./fields), then renders an inline typed mini-tree with the same
// bareType/formatBareValue/TYPE_LABEL vocabulary that planet uses — this planet
// just wraps it in its own compact DOM/CSS instead of fields.css's, since
// that stylesheet's selectors are scoped under `.pg-fields`.
// ---------------------------------------------------------------------------

const STRUCTURED_HEADER_NAMES = new Set([
  'priority',
  'cache-status',
  'accept-ch',
  'signature-input',
  'signature',
  'proxy-status',
  'content-digest',
  'repr-digest',
  'want-content-digest',
  'want-repr-digest',
  'variants',
  'variant-key',
  'no-vary-search',
]);

function isStructuredHeaderName(name: string): boolean {
  const n = name.toLowerCase();
  // Sec-CH-UA, Sec-CH-UA-Platform, Sec-CH-UA-Mobile, and every other Client
  // Hint request header share this prefix.
  return STRUCTURED_HEADER_NAMES.has(n) || n.startsWith('sec-ch-');
}

interface StructuredHeaderHit {
  name: string;
  value: string;
  attempt: ReturnType<typeof attemptParse>;
}

function detectStructuredHeaders(headers: Record<string, string | string[]>): StructuredHeaderHit[] {
  const hits: StructuredHeaderHit[] = [];
  for (const [name, raw] of Object.entries(headers)) {
    if (!isStructuredHeaderName(name)) continue;
    const value = Array.isArray(raw) ? raw.join(', ') : raw;
    if (!value) continue;
    hits.push({ name, value, attempt: attemptParse(value, 'auto') });
  }
  return hits;
}

/** A compact single-header mini-tree — the same recursive shape as the Header
 *  Fields planet's tree, in this planet's own CSS namespace (`cv-shdr-*`). */
function renderMiniNode(item: AnyItem, label: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cv-shdr-node';

  const head = document.createElement('div');
  head.className = 'cv-shdr-head';

  const lbl = document.createElement('span');
  lbl.className = 'cv-shdr-label mono';
  lbl.textContent = label;
  head.appendChild(lbl);

  const isInner = Array.isArray(item.value);
  const t = bareType(item.value);
  const badge = document.createElement('span');
  badge.className = `cv-shdr-badge cv-bd-${t}`;
  badge.textContent = TYPE_LABEL[t] ?? t;
  head.appendChild(badge);

  if (!isInner) {
    const val = document.createElement('span');
    val.className = 'cv-shdr-value mono';
    val.textContent = formatBareValue(item.value);
    head.appendChild(val);
  }
  wrap.appendChild(head);

  const paramKeys = Object.keys(item.parameters ?? {});
  if (paramKeys.length) {
    const params = document.createElement('div');
    params.className = 'cv-shdr-params';
    for (const k of paramKeys) {
      const pv = item.parameters[k];
      const pill = document.createElement('span');
      pill.className = `cv-shdr-pill cv-bd-${bareType(pv)}`;
      pill.textContent = `;${k}=${formatBareValue(pv)}`;
      params.appendChild(pill);
    }
    wrap.appendChild(params);
  }

  if (isInner) {
    const inner = document.createElement('div');
    inner.className = 'cv-shdr-inner';
    (item.value as AnyItem[]).forEach((it, i) => inner.appendChild(renderMiniNode(it, `(${i})`)));
    wrap.appendChild(inner);
  }
  return wrap;
}

function renderMiniTree(container: HTMLElement, parsed: unknown, type: FType) {
  container.innerHTML = '';
  if (type === 'item') {
    container.appendChild(renderMiniNode(parsed as AnyItem, 'item'));
  } else if (type === 'list') {
    (parsed as AnyItem[]).forEach((it, i) => container.appendChild(renderMiniNode(it, `[${i}]`)));
  } else {
    const dict = parsed as Record<string, AnyItem>;
    for (const key of Object.keys(dict)) container.appendChild(renderMiniNode(dict[key], key));
  }
}

const playground: Playground = {
  id: 'converter',
  title: 'HTTP Converter',
  pkg: '@johnhenry/http-converter',
  hue: 35,
  blurb: 'Raw HTTP, HAR, cURL and fetch() calls translated into each other, with auto-detection.',
  docs: 'https://opensource.johnhenry.me/http-converter/',
  mount(host) {
    const root = document.createElement('div');
    root.className = 'pg-converter';
    root.innerHTML = `
      <div class="panel cv-bar">
        <div class="cv-presets">
          <span class="stat">presets</span>
          ${Object.entries(PRESETS)
            .map(([id, p]) => `<button class="btn" data-preset="${id}">${escapeHtml(p.label)}</button>`)
            .join('')}
        </div>
        <button class="btn" data-copy-link type="button" title="Copy a link to this input">Copy link</button>
      </div>

      <div class="panel">
        <h3 class="cv-h">input <span class="chip" data-badge>?</span></h3>
        <textarea class="code" spellcheck="false" data-input></textarea>
        <div class="cv-detect" data-detect></div>
      </div>

      <div class="panel cv-structured">
        <h3 class="cv-h">structured headers <span class="stat">RFC 8941 / 9651</span></h3>
        <div class="cv-shdr-list" data-structured></div>
      </div>

      <div class="cv-grid" data-outputs></div>

      <div class="panel cv-send">
        <h3 class="cv-h">send it</h3>
        <div class="cv-send-row">
          <label class="field">target
            <select data-endpoint>
              <option value="https://httpbin.org/anything">httpbin.org/anything</option>
              <option value="https://postman-echo.com/post">postman-echo.com/post</option>
            </select>
          </label>
          <button class="btn primary" data-send>Send it →</button>
          <span class="stat" data-send-status></span>
        </div>
        <p class="stat">Runs the <b>fetch()</b> form of the current request against a safe public echo endpoint (real network call, no auth headers exfiltrated anywhere else). CORS or network failures are shown, not swallowed.</p>
        <pre class="code" data-send-result hidden></pre>
      </div>

      <div class="panel cv-explain">
        <h3 class="cv-h">what's happening</h3>
        <p><code>@johnhenry/http-converter</code> parses whatever format it recognizes into one canonical
        <code>HttpRequest</code> object (<code>{ method, url, httpVersion, headers, body }</code>), then
        <code>allFormats()</code> renders that same object back out as an HTTP string, a cURL command, a
        <code>fetch()</code> call and a HAR entry — all four, every keystroke. The badge above the input and the
        panel beneath it explain which heuristic decided the input's format; parsing that format into a request is
        this planet's job (the library doesn't parse fetch()-source text, so that path is a small sandboxed
        evaluator that captures the call's arguments without ever hitting the network).</p>
      </div>`;
    host.innerHTML = '';
    host.appendChild(root);

    const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
    const ta = $<HTMLTextAreaElement>('[data-input]');
    const badge = $<HTMLElement>('[data-badge]');
    const detectEl = $<HTMLElement>('[data-detect]');
    const structuredEl = $<HTMLElement>('[data-structured]');
    const outputsEl = $<HTMLElement>('[data-outputs]');
    const endpointSel = $<HTMLSelectElement>('[data-endpoint]');
    const sendBtn = $<HTMLButtonElement>('[data-send]');
    const sendStatus = $<HTMLElement>('[data-send-status]');
    const sendResult = $<HTMLPreElement>('[data-send-result]');
    const copyLinkBtn = $<HTMLButtonElement>('[data-copy-link]');

    outputsEl.innerHTML = OUTPUT_PANES.map(
      (p) => `
      <div class="panel cv-pane">
        <h3 class="cv-h">${p.label} <button class="btn cv-copy" data-copy="${p.key}">Copy</button></h3>
        <pre class="code" data-out="${p.key}"></pre>
      </div>`,
    ).join('');

    let lastRequest: HttpRequest | null = null;
    let timer: number | undefined;
    let version = 0;
    let currentPresetId: string | null = DEFAULT_PRESET;

    // Deep-linkable state: #/converter?preset=...&text=...
    const linkDefaults = { preset: DEFAULT_PRESET, text: PRESETS[DEFAULT_PRESET].text };

    function schedule(delay = 220) {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(run, delay);
    }

    function renderStructuredHeaders(headers: HttpRequest['headers'] | null) {
      structuredEl.innerHTML = '';
      if (!headers) {
        structuredEl.innerHTML = '<p class="stat">Parse a request above to scan its headers.</p>';
        return;
      }
      const hits = detectStructuredHeaders(headers);
      if (!hits.length) {
        structuredEl.innerHTML = '<p class="stat">No RFC 8941 / 9651 structured headers (Priority, Client Hints, Signature-Input, Content-Digest, …) detected in this request.</p>';
        return;
      }
      for (const hit of hits) {
        const row = document.createElement('div');
        row.className = 'cv-shdr-row';

        const head = document.createElement('div');
        head.className = 'cv-shdr-row-head';
        const nameEl = document.createElement('span');
        nameEl.className = 'cv-shdr-name mono';
        nameEl.textContent = hit.name;
        head.appendChild(nameEl);
        const rawEl = document.createElement('span');
        rawEl.className = 'cv-shdr-raw mono';
        rawEl.textContent = hit.value;
        head.appendChild(rawEl);
        row.appendChild(head);

        const treeWrap = document.createElement('div');
        treeWrap.className = 'cv-shdr-tree';
        if (hit.attempt.ok) {
          renderMiniTree(treeWrap, hit.attempt.parsed, hit.attempt.type);
        } else {
          const err = hit.attempt.error;
          const pre = document.createElement('pre');
          pre.className = 'code error';
          pre.textContent = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          treeWrap.appendChild(pre);
        }
        row.appendChild(treeWrap);

        const openBtn = handoffButton({
          from: 'converter',
          to: 'fields',
          kind: 'header-field',
          label: 'Open in Header Fields',
          getPayload: () => ({ name: hit.name, value: hit.value, type: hit.attempt.ok ? hit.attempt.type : 'auto' }),
        });
        openBtn.classList.add('cv-shdr-open');
        row.appendChild(openBtn);

        structuredEl.appendChild(row);
      }
    }

    function showError(message: string) {
      lastRequest = null;
      for (const p of OUTPUT_PANES) {
        const el = $<HTMLElement>(`[data-out="${p.key}"]`);
        el.className = 'code error';
        el.textContent = message;
      }
      renderStructuredHeaders(null);
    }

    async function run() {
      const myVersion = ++version;
      const text = ta.value;
      const d = detect(text);

      badge.textContent = KIND_LABEL[d.kind];
      badge.dataset.kind = d.kind;
      detectEl.innerHTML = `<p class="stat">${escapeHtml(d.reason)}</p>`;
      writeState({ preset: currentPresetId ?? 'custom', text }, linkDefaults);

      if (d.kind === 'unknown') {
        showError(text.trim() ? 'Could not detect a supported format — see the detection panel above.' : 'Nothing to convert yet — paste or pick a preset above.');
        return;
      }

      try {
        const request = await parseByKind(d.kind, text);
        if (myVersion !== version) return;
        const formats = await allFormats(request);
        if (myVersion !== version) return;
        lastRequest = request;

        const pretty = { ...formats, har: JSON.stringify(formats.har, null, 2) };
        for (const p of OUTPUT_PANES) {
          const el = $<HTMLElement>(`[data-out="${p.key}"]`);
          el.className = 'code';
          el.textContent = pretty[p.key];
        }
        renderStructuredHeaders(request.headers);
      } catch (err) {
        if (myVersion !== version) return;
        showError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      }
    }

    function loadPreset(id: string) {
      const preset = PRESETS[id];
      if (!preset) return;
      currentPresetId = id;
      ta.value = preset.text;
      schedule(0);
    }

    const onPresetClick = (e: Event) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-preset]');
      if (btn) loadPreset(btn.dataset.preset!);
    };
    const onInput = () => { currentPresetId = null; schedule(); };

    const onCopyLink = async () => {
      await copyLink();
      const original = copyLinkBtn.textContent;
      copyLinkBtn.textContent = 'Copied!';
      window.setTimeout(() => { copyLinkBtn.textContent = original; }, 1200);
    };

    const onCopyClick = async (e: Event) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
      if (!btn) return;
      const key = btn.dataset.copy!;
      const el = $<HTMLElement>(`[data-out="${key}"]`);
      try {
        await navigator.clipboard.writeText(el.textContent ?? '');
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        window.setTimeout(() => { btn.textContent = original; }, 1200);
      } catch {
        btn.textContent = 'Copy failed';
        window.setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      }
    };

    const onSend = async () => {
      if (!lastRequest) {
        sendStatus.textContent = 'Nothing valid to send yet.';
        return;
      }
      sendBtn.disabled = true;
      sendStatus.textContent = 'Sending…';
      sendResult.hidden = true;
      try {
        const { url: reqUrl, options } = await fetchMod.fromRequest(lastRequest);
        const target = new URL(endpointSel.value);
        // Preserve the original path/query onto the echo endpoint's own path is
        // pointless (it always echoes whatever it receives) — send straight to
        // the chosen echo endpoint, carrying the converted method/headers/body.
        const init: RequestInit = { ...options, method: options.method ?? lastRequest.method };
        const res = await fetch(target.toString(), init);
        const bodyText = await res.text();
        sendStatus.textContent = `${res.status} ${res.statusText}`;
        sendResult.hidden = false;
        sendResult.className = res.ok ? 'code' : 'code error';
        let display = bodyText;
        try { display = JSON.stringify(JSON.parse(bodyText), null, 2); } catch { /* not JSON, show raw */ }
        sendResult.textContent = `→ ${reqUrl}\n\n${display}`;
      } catch (err) {
        sendStatus.textContent = 'Failed';
        sendResult.hidden = false;
        sendResult.className = 'code error';
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        sendResult.textContent = `${msg}\n\n(Likely a CORS restriction or network failure — the echo endpoints allow browser CORS, but any corporate proxy or offline state will surface here instead of the response.)`;
      } finally {
        sendBtn.disabled = false;
      }
    };

    root.addEventListener('click', onPresetClick);
    ta.addEventListener('input', onInput);
    outputsEl.addEventListener('click', onCopyClick);
    sendBtn.addEventListener('click', onSend);
    copyLinkBtn.addEventListener('click', onCopyLink);

    // Incoming handoff (e.g. a captured entry from the site-wide HAR
    // recorder's "open in Converter" button) wins over a shareable deep
    // link, which wins over the default preset.
    const harHandoff = receive<HarEntry>('converter');
    if (harHandoff && harHandoff.kind === 'har-entry') {
      currentPresetId = null;
      ta.value = JSON.stringify(harHandoff.payload, null, 2);
      root.prepend(handoffBanner(harHandoff, `loaded a captured HAR entry: ${harHandoff.payload.request.method} ${harHandoff.payload.request.url}`));
      schedule(0);
    } else if (location.hash.includes('?')) {
      const s = readState(linkDefaults);
      currentPresetId = PRESETS[s.preset]?.text === s.text ? s.preset : null;
      ta.value = s.text;
      schedule(0);
    } else {
      loadPreset(DEFAULT_PRESET);
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      root.removeEventListener('click', onPresetClick);
      ta.removeEventListener('input', onInput);
      outputsEl.removeEventListener('click', onCopyClick);
      sendBtn.removeEventListener('click', onSend);
      copyLinkBtn.removeEventListener('click', onCopyLink);
    };
  },
};

export default playground;
