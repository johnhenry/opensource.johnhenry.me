import type { Playground } from '../registry';
// 0.0.2: the barrel (`.`) no longer re-exports `createFSRouter` — it moved to
// the dedicated Node-only subpath `@johnhenry/letterpress/fs` — so the
// barrel is browser-safe and this planet imports straight from it instead of
// reaching into individual submodule files.
//
// Types: `package.json`'s `"exports"["."]` now carries a real `"types"`
// condition pointing at `types.d.ts`, and `types.d.ts` itself now declares
// ambient `export declare const` bindings for every named value export
// (createRouter, createRoute, createRequest, createResponse, deconstruct,
// cook, HTTPExpression), not just type aliases. A plain value import of the
// barrel is therefore fully typed with no `@ts-ignore` needed.
import { createRouter, createRoute, createRequest, createResponse, HTTPExpression } from '@johnhenry/letterpress';
import type { Router } from '@johnhenry/letterpress';
import { probeCompanion, hasDemo, companionBanner, type Companion } from '../companion';
import { readState, writeState, copyLink } from '../state';
import './letterpress.css';

/**
 * createRequest and HTTPExpression are genuine tagged-template functions —
 * `CreateRequestTag`/`HTTPExpressionFn` both take a real `TemplateStringsArray`,
 * not a plain `string[]`. This planet builds its request/pattern text at
 * runtime (from form fields), so there's no literal template syntax to use;
 * `asTemplate()` wraps an already-composed string into a one-element
 * `TemplateStringsArray` (raw === cooked, no substitutions) — exactly what a
 * template literal with no `${…}` would produce — so the real, unmodified
 * library types are satisfied instead of a local `string[]`-shaped stand-in.
 */
function asTemplate(s: string): TemplateStringsArray {
  const strings = Object.assign([s], { raw: [s] }) as string[] & { raw: readonly string[] };
  return strings as unknown as TemplateStringsArray;
}

// ---------------------------------------------------------------------------
// Presets — real letterpress source, compiled in-page with `new Function`
// against the library's actual exports (createRouter/createRoute/etc. are
// passed in as parameters below). Written as arrays-of-lines rather than a
// single template literal so the backtick/`${…}` tagged-template syntax that
// *is* letterpress's whole API doesn't collide with TypeScript's own
// template-literal parsing of this file.
// ---------------------------------------------------------------------------

const PRESET_NOTES = [
  '// A REST-ish API for notes, entirely in tagged-template route definitions.',
  'const notes = [',
  "  { id: '1', title: 'Fix the press', body: 'Realign the platen before the next run.' },",
  "  { id: '2', title: 'Order more ink', body: 'A fresh drum of black is due Friday.' },",
  '];',
  'let nextId = 3;',
  'const json = (data, init) => new Response(JSON.stringify(data, null, 2), { ...init, headers: { "Content-Type": "application/json", ...(init && init.headers) } });',
  '',
  'const router = createRouter({',
  '  errorHandler: (error) => json({ error: String(error && error.message || error) }, { status: 500 }),',
  '});',
  '',
  'router.endpoint`GET /notes`(() => json(notes));',
  '',
  'router.endpoint`POST /notes`(async (request) => {',
  '  const body = await request.json().catch(() => ({}));',
  '  const note = { id: String(nextId++), title: body.title || "Untitled", body: body.body || "" };',
  '  notes.push(note);',
  '  return json(note, { status: 201 });',
  '});',
  '',
  'router.endpoint`GET /notes/:id`((request, { params }) => {',
  '  const note = notes.find((n) => n.id === params.id);',
  '  return note ? json(note) : json({ error: "not found" }, { status: 404 });',
  '});',
  '',
  'router.endpoint`PUT /notes/:id`(async (request, { params }) => {',
  '  const note = notes.find((n) => n.id === params.id);',
  '  if (!note) return json({ error: "not found" }, { status: 404 });',
  '  Object.assign(note, await request.json().catch(() => ({})));',
  '  return json(note);',
  '});',
  '',
  'router.endpoint`DELETE /notes/:id`((request, { params }) => {',
  '  const i = notes.findIndex((n) => n.id === params.id);',
  '  if (i === -1) return json({ error: "not found" }, { status: 404 });',
  '  notes.splice(i, 1);',
  '  return new Response(null, { status: 204 });',
  '});',
  '',
  'return router;',
].join('\n');

const PRESET_PARAMS = [
  '// Params (`:id`) and a query string read by hand from `request.url`.',
  '// letterpress only matches the *path* against the template — the query',
  '// string is untouched, exactly like a real Fetch API `Request`.',
  'const json = (data, init) => new Response(JSON.stringify(data, null, 2), { ...init, headers: { "Content-Type": "application/json", ...(init && init.headers) } });',
  '',
  'const router = createRouter();',
  '',
  'router.endpoint`GET /notes/:id/tags`((request, { params }) => {',
  '  const url = new URL(request.url);',
  '  const limit = Number(url.searchParams.get("limit") || "3");',
  '  const all = ["press", "ink", "letters", "draft", "final"];',
  '  return json({ id: params.id, limit, tags: all.slice(0, limit) });',
  '});',
  '',
  'router.endpoint`GET /search/:category`((request, { params }) => {',
  '  const url = new URL(request.url);',
  '  const q = url.searchParams.get("q") || "";',
  '  const results = q ? [`${params.category}:${q}#1`, `${params.category}:${q}#2`] : [];',
  '  return json({ category: params.category, q, results });',
  '});',
  '',
  'return router;',
].join('\n');

const PRESET_WILDCARD = [
  '// Header wildcard matching (`[Authorization: Bearer *]`, straight from the',
  '// README — the `*` matches any token after "Bearer ") and fallthrough:',
  '// unmatched requests reach the router-level `defaultHandler`, and a',
  '// protected route falls through to a plainer route below it when the',
  '// header matcher misses.',
  '//',
  '// (An equivalent `[Authorization^=Bearer]` "starts with" operator form',
  '// also works, as an alternative spelling of the same prefix check.)',
  'const json = (data, init) => new Response(JSON.stringify(data, null, 2), { ...init, headers: { "Content-Type": "application/json", ...(init && init.headers) } });',
  '',
  'const router = createRouter({',
  '  defaultHandler: (request) => {',
  '    const url = new URL(request.url);',
  '    return json({ error: "no route matched", method: request.method, path: url.pathname }, { status: 404 });',
  '  },',
  '});',
  '',
  'router.endpoint`GET /public`(() => json({ ok: true, area: "public" }));',
  '',
  'router.endpoint`GET /admin [Authorization: Bearer *]`(() =>',
  '  json({ ok: true, area: "admin", note: "matched via the header wildcard (Bearer *)" })',
  ');',
  '',
  '// No Authorization header (or the wrong scheme) falls through to here —',
  '// the router tries routes in the order they were registered.',
  'router.endpoint`GET /admin`(() => json({ error: "missing Bearer token" }, { status: 401 }));',
  '',
  'return router;',
].join('\n');

const PRESET_STREAM = [
  '// A response body written as one literal template (with live substitution',
  '// functions), plus a hand-built streaming Response — letterpress routes',
  '// are just `(request) => Response`, so a real ReadableStream works fine.',
  'const router = createRouter();',
  '',
  'router.endpoint`GET /``<!DOCTYPE html>',
  '<html>',
  '  <head><title>Letterpress</title></head>',
  '  <body>',
  '    <h1>Letterpress Press</h1>',
  '    <p>Server time: ${() => new Date().toISOString()}</p>',
  '    <p>Your method: ${(request) => request.method}</p>',
  '    <p>User-Agent: ${(request) => request.headers.get("User-Agent") || "(none)"}</p>',
  '  </body>',
  '</html>`;',
  '',
  'router.endpoint`GET /stream`(() => {',
  '  const lines = ["first chunk\\n", "second chunk\\n", "third chunk, done.\\n"];',
  '  let i = 0;',
  '  const stream = new ReadableStream({',
  '    pull(controller) {',
  '      if (i < lines.length) controller.enqueue(new TextEncoder().encode(lines[i++]));',
  '      else controller.close();',
  '    },',
  '  });',
  '  return new Response(stream, { headers: { "Content-Type": "text/plain" } });',
  '});',
  '',
  'return router;',
].join('\n');

interface PresetDef {
  id: string;
  label: string;
  source: string;
  examples: { method: string; path: string; headers?: string; body?: string; label: string }[];
}

const PRESETS: PresetDef[] = [
  {
    id: 'notes', label: 'REST-ish notes API', source: PRESET_NOTES,
    examples: [
      { method: 'GET', path: '/notes', label: 'list notes' },
      { method: 'GET', path: '/notes/1', label: 'get note 1' },
      { method: 'POST', path: '/notes', body: '{"title":"New note","body":"hello"}', label: 'create note' },
      { method: 'PUT', path: '/notes/2', body: '{"title":"Order more ink (urgent)"}', label: 'update note 2' },
      { method: 'DELETE', path: '/notes/1', label: 'delete note 1' },
      { method: 'GET', path: '/notes/99', label: '404: missing note' },
    ],
  },
  {
    id: 'params', label: 'Params + query', source: PRESET_PARAMS,
    examples: [
      { method: 'GET', path: '/notes/2/tags?limit=2', label: 'tags, limit=2' },
      { method: 'GET', path: '/search/notes?q=press', label: 'search q=press' },
      { method: 'GET', path: '/search/notes', label: 'search, no q' },
    ],
  },
  {
    id: 'wildcard', label: 'Wildcard header + fallthrough', source: PRESET_WILDCARD,
    examples: [
      { method: 'GET', path: '/public', label: 'public route' },
      { method: 'GET', path: '/admin', headers: 'Authorization: Bearer letme-in', label: 'admin, with bearer' },
      { method: 'GET', path: '/admin', label: 'admin, no header (401 fallthrough)' },
      { method: 'GET', path: '/nowhere', label: 'unmatched (defaultHandler 404)' },
    ],
  },
  {
    id: 'stream', label: 'Streamed / HTML body', source: PRESET_STREAM,
    examples: [
      { method: 'GET', path: '/', label: 'HTML body literal' },
      { method: 'GET', path: '/stream', label: 'streamed plain-text' },
    ],
  },
];

function findPreset(id: string): PresetDef {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

// ---------------------------------------------------------------------------
// Compile the editor's source against the real library exports.
// ---------------------------------------------------------------------------
function compileRouter(source: string): { router: Router | null; error: string | null } {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('createRouter', 'createRoute', 'createRequest', 'createResponse', 'HTTPExpression', source);
    const router = fn(createRouter, createRoute, createRequest, createResponse, HTTPExpression);
    if (typeof router !== 'function' || typeof router.endpoint !== 'function') {
      return { router: null, error: 'The compiled code must `return router;` — a value from createRouter().' };
    }
    return { router, error: null };
  } catch (e) {
    return { router: null, error: (e as Error)?.stack || String(e) };
  }
}

// ---------------------------------------------------------------------------
// Best-effort route parser: finds every `router.endpoint`<pattern>`(`<body>`)?`
// occurrence in the SOURCE TEXT (not the compiled router — it has no
// introspection API) so we can show a route table and highlight the
// matched literal. Good enough for straight-line preset/user code; it does
// not attempt to be a full JS parser.
// ---------------------------------------------------------------------------
interface ParsedRoute { start: number; end: number; pattern: string; hasBodyLiteral: boolean }

function parseRoutes(source: string): ParsedRoute[] {
  const re = /router\.endpoint\s*`([^`]*)`(\s*`([\s\S]*?)`)?/g;
  const out: ParsedRoute[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    out.push({ start: m.index, end: m.index + m[0].length, pattern: m[1], hasBodyLiteral: !!m[2] });
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Render `source` as highlighted HTML, wrapping [start,end) in a <mark>. */
function renderHighlight(source: string, mark: { start: number; end: number } | null): string {
  if (!mark) return escapeHtml(source);
  return (
    escapeHtml(source.slice(0, mark.start)) +
    '<mark>' + escapeHtml(source.slice(mark.start, mark.end)) + '</mark>' +
    escapeHtml(source.slice(mark.end))
  );
}

// ---------------------------------------------------------------------------

interface LPState {
  preset: string;
  method: string;
  path: string;
  headers: string;
  body: string;
  [key: string]: unknown;
}
const DEFAULTS: LPState = { preset: 'notes', method: 'GET', path: '/notes', headers: '', body: '' };

const playground: Playground = {
  id: 'letterpress',
  title: 'Letterpress Press',
  pkg: '@johnhenry/letterpress',
  hue: 15,
  blurb: 'Routes as tagged template literals: method, path and body in one string. Fire requests and watch them match.',
  docs: 'https://opensource.johnhenry.me/letterpress/',

  async mount(host) {
    const state = readState<LPState>(DEFAULTS);

    let companion: Companion | null = null;
    try { companion = await probeCompanion(); } catch { companion = null; }
    const live = hasDemo(companion, 'letterpress');

    host.innerHTML = `
      <div class="pg-letterpress">
        <div id="lp-banner"></div>
        <div class="grid-2">
          <div class="panel lp-editor-panel">
            <div class="lp-toolbar">
              <label class="field" style="flex-direction:row;align-items:center;gap:6px;">
                <span>preset</span>
                <select id="lp-preset">${PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</select>
              </label>
              <button class="btn" id="lp-reset">↺ reset to preset</button>
              <span class="stat" id="lp-compile-status"></span>
            </div>
            <div class="lp-editor-wrap">
              <pre class="lp-highlight" id="lp-highlight" aria-hidden="true"><code></code></pre>
              <textarea class="lp-source" id="lp-source" spellcheck="false"></textarea>
            </div>
            <pre class="code lp-compile-error" id="lp-compile-error" hidden></pre>
          </div>

          <div class="panel lp-composer-panel">
            <h3 style="margin:0;font-family:var(--f-display);font-size:15px;">Request composer</h3>
            <div class="lp-row">
              <select id="lp-method"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select>
              <input id="lp-path" placeholder="/notes/1" />
              <button class="btn primary" id="lp-send">Send →</button>
            </div>
            <label class="field">headers (one per line, <code>Name: value</code>)
              <textarea class="code" id="lp-headers" rows="3" placeholder="Authorization: Bearer letme-in"></textarea>
            </label>
            <label class="field">body
              <textarea class="code" id="lp-body" rows="4" placeholder='{"title":"New note"}'></textarea>
            </label>
            <div class="lp-examples" id="lp-examples"></div>
          </div>
        </div>

        <div class="panel lp-results-panel">
          <div class="lp-result-block">
            <h4>matched route</h4>
            <div class="lp-match-info" id="lp-match-info">—</div>
          </div>
          <div class="lp-result-block">
            <h4>response</h4>
            <div class="lp-match-info" id="lp-response-status">—</div>
            <pre class="code" id="lp-response-headers" style="max-height:120px;"></pre>
            <pre class="code" id="lp-response-body" style="max-height:220px;"></pre>
          </div>
        </div>

        <div class="panel">
          <h4 style="margin:0 0 10px;font-family:var(--f-display);font-size:14px;color:var(--ink-2);">route table <span class="stat" id="lp-route-count"></span></h4>
          <table class="lp-route-table" id="lp-route-table"><thead><tr><th>#</th><th>method</th><th>pattern</th><th>headers</th><th>body?</th></tr></thead><tbody></tbody></table>
        </div>

        <div class="lp-footer panel">
          <p class="lp-what" id="lp-what"></p>
          <span class="spacer" style="flex:1"></span>
          <button class="btn" id="lp-copy">🔗 copy link</button>
        </div>
      </div>
    `;

    const bannerHost = host.querySelector('#lp-banner') as HTMLElement;
    bannerHost.appendChild(
      companionBanner(companion, 'letterpress', 'a router built in-page from the real library runs the request itself.')
    );
    if (live) {
      const note = document.createElement('p');
      note.className = 'stat';
      note.style.margin = '-6px 0 0';
      note.textContent = 'Only the "REST-ish notes API" preset is mounted on the companion for real HTTP; every other preset always runs its own in-page compiled router, live companion or not.';
      bannerHost.appendChild(note);
    }

    const sourceEl = host.querySelector('#lp-source') as HTMLTextAreaElement;
    const highlightEl = host.querySelector('#lp-highlight code') as HTMLElement;
    const highlightPre = host.querySelector('#lp-highlight') as HTMLElement;
    const compileErrorEl = host.querySelector('#lp-compile-error') as HTMLElement;
    const compileStatusEl = host.querySelector('#lp-compile-status') as HTMLElement;
    const presetSel = host.querySelector('#lp-preset') as HTMLSelectElement;
    const resetBtn = host.querySelector('#lp-reset') as HTMLButtonElement;
    const methodSel = host.querySelector('#lp-method') as HTMLSelectElement;
    const pathInput = host.querySelector('#lp-path') as HTMLInputElement;
    const headersInput = host.querySelector('#lp-headers') as HTMLTextAreaElement;
    const bodyInput = host.querySelector('#lp-body') as HTMLTextAreaElement;
    const sendBtn = host.querySelector('#lp-send') as HTMLButtonElement;
    const examplesEl = host.querySelector('#lp-examples') as HTMLElement;
    const matchInfoEl = host.querySelector('#lp-match-info') as HTMLElement;
    const respStatusEl = host.querySelector('#lp-response-status') as HTMLElement;
    const respHeadersEl = host.querySelector('#lp-response-headers') as HTMLElement;
    const respBodyEl = host.querySelector('#lp-response-body') as HTMLElement;
    const routeTableBody = host.querySelector('#lp-route-table tbody') as HTMLElement;
    const routeCountEl = host.querySelector('#lp-route-count') as HTMLElement;
    const whatEl = host.querySelector('#lp-what') as HTMLElement;
    const copyBtn = host.querySelector('#lp-copy') as HTMLButtonElement;

    let router: Router | null = null;
    let currentRoutes: ParsedRoute[] = [];
    let lastMatchIndex = -1;

    function persist() {
      writeState({ preset: presetSel.value, method: methodSel.value, path: pathInput.value, headers: headersInput.value, body: bodyInput.value }, DEFAULTS);
    }

    function renderExamples(preset: PresetDef) {
      examplesEl.innerHTML = '';
      for (const ex of preset.examples) {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = `${ex.method} ${ex.path}`;
        b.title = ex.label;
        b.addEventListener('click', () => {
          methodSel.value = ex.method;
          pathInput.value = ex.path;
          headersInput.value = ex.headers ?? '';
          bodyInput.value = ex.body ?? '';
          persist();
          dispatch();
        });
        examplesEl.appendChild(b);
      }
    }

    function renderRouteTable(routes: ParsedRoute[], matchedIndex: number) {
      routeCountEl.textContent = `(${routes.length})`;
      routeTableBody.innerHTML = routes.map((r, i) => {
        const parts = r.pattern.trim().split(/\s*(\[[^\]]*\])\s*/).filter(Boolean);
        const methodPath = parts[0] ?? r.pattern;
        const [method, ...rest] = methodPath.trim().split(/\s+/);
        const path = rest.join(' ');
        const headerBits = parts.slice(1).filter((p) => p.startsWith('['));
        return `<tr class="${i === matchedIndex ? 'matched' : ''}">
          <td>${i + 1}</td>
          <td class="m">${escapeHtml(method || '')}</td>
          <td>${escapeHtml(path || '')}</td>
          <td class="h">${headerBits.map(escapeHtml).join(' ')}</td>
          <td>${r.hasBodyLiteral ? 'literal' : 'fn'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="h">no routes parsed from this source</td></tr>';
    }

    function updateHighlight(mark: { start: number; end: number } | null) {
      highlightEl.innerHTML = renderHighlight(sourceEl.value, mark);
    }

    function syncHighlightScroll() {
      highlightPre.scrollTop = sourceEl.scrollTop;
      highlightPre.scrollLeft = sourceEl.scrollLeft;
    }

    function recompile() {
      const src = sourceEl.value;
      currentRoutes = parseRoutes(src);
      const { router: r, error } = compileRouter(src);
      router = r;
      if (error) {
        compileErrorEl.hidden = false;
        compileErrorEl.textContent = error;
        compileStatusEl.textContent = '✗ compile error';
        compileStatusEl.classList.add('err');
      } else {
        compileErrorEl.hidden = true;
        compileStatusEl.textContent = `✓ compiled — ${currentRoutes.length} route${currentRoutes.length === 1 ? '' : 's'}`;
        compileStatusEl.classList.remove('err');
      }
      renderRouteTable(currentRoutes, -1);
      updateHighlight(null);
    }

    function buildHeaders(): string {
      return headersInput.value.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    }

    async function buildRequest(): Promise<Request> {
      const method = methodSel.value;
      const path = pathInput.value.trim() || '/';
      const headerLines = buildHeaders();
      const bodyText = ['GET', 'HEAD'].includes(method) ? '' : bodyInput.value;
      const requestText = `${method} ${path} HTTP/1.1\n${headerLines}${headerLines ? '\n' : ''}\n${bodyText}`;
      // createRequest is a curried tagged-template function; the text is
      // already fully composed, so we hand it a one-element TemplateStringsArray
      // and no substitutions (identical to a template literal with none).
      return createRequest()(asTemplate(requestText));
    }

    async function dispatch() {
      persist();
      let request: Request;
      try {
        request = await buildRequest();
      } catch (e) {
        matchInfoEl.innerHTML = `<span class="no">could not build request: ${escapeHtml(String(e))}</span>`;
        return;
      }

      // Find which parsed literal this request matches, in source order —
      // this is what the router itself would try first.
      lastMatchIndex = -1;
      let matchedParams: Record<string, any> | null = null;
      for (let i = 0; i < currentRoutes.length; i++) {
        try {
          const expr = HTTPExpression(asTemplate(currentRoutes[i].pattern));
          if (expr.test(request)) { lastMatchIndex = i; matchedParams = expr.exec(request); break; }
        } catch { /* a pattern that doesn't parse as HTTPExpression just isn't matchable */ }
      }

      if (lastMatchIndex === -1) {
        matchInfoEl.innerHTML = `<span class="no">no parsed route literal matches ${escapeHtml(request.method)} ${escapeHtml(new URL(request.url).pathname)}</span>`;
        updateHighlight(null);
      } else {
        const r = currentRoutes[lastMatchIndex];
        const { method: _m, headers: _h, ...params } = matchedParams || {};
        matchInfoEl.innerHTML = `<span class="yes">✓ route #${lastMatchIndex + 1}</span> — <code>${escapeHtml(r.pattern.trim())}</code>` +
          (Object.keys(params).length ? `<ul class="lp-params">${Object.entries(params).map(([k, v]) => `<li><b>${escapeHtml(k)}</b>${escapeHtml(String(v))}</li>`).join('')}</ul>` : '');
        updateHighlight({ start: r.start, end: r.end });
      }
      renderRouteTable(currentRoutes, lastMatchIndex);

      // Actually dispatch: real HTTP to the companion when live *and* the
      // "notes" preset is selected (that's the only preset the companion
      // mounts server-side — see server/demos/letterpress.mjs), otherwise
      // the in-page compiled router's own handler. Either way this is the
      // library's real request/response cycle, not a simulation of it.
      const useCompanion = live && companion && presetSel.value === 'notes';
      try {
        let response: Response;
        if (useCompanion && companion) {
          const url = `${companion.base}/letterpress${pathInput.value.startsWith('/') ? '' : '/'}${pathInput.value}`;
          response = await fetch(url, {
            method: methodSel.value,
            headers: Object.fromEntries(buildHeaders().split('\n').filter(Boolean).map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })),
            body: ['GET', 'HEAD'].includes(methodSel.value) ? undefined : bodyInput.value,
          });
        } else if (router) {
          response = await router(request);
        } else {
          respStatusEl.innerHTML = '<span class="no">router did not compile — fix the error above</span>';
          respHeadersEl.textContent = ''; respBodyEl.textContent = '';
          return;
        }
        const ok = response.status < 400;
        respStatusEl.innerHTML = `<span class="lp-status ${ok ? 'ok' : 'err'}">${response.status} ${escapeHtml(response.statusText || '')}</span>${useCompanion ? ' <span class="stat">via companion HTTP</span>' : ' <span class="stat">via in-page router</span>'}`;
        respHeadersEl.textContent = [...response.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n') || '(no headers)';
        const text = await response.text();
        respBodyEl.textContent = text || '(empty body)';
      } catch (e) {
        respStatusEl.innerHTML = '<span class="no">request failed</span>';
        respBodyEl.textContent = (e as Error)?.stack || String(e);
      }
    }

    function loadPreset(id: string, applyRequestDefaults: boolean) {
      const preset = findPreset(id);
      presetSel.value = preset.id;
      sourceEl.value = preset.source;
      renderExamples(preset);
      whatEl.textContent = presetDescription(preset.id);
      if (applyRequestDefaults && preset.examples[0]) {
        methodSel.value = preset.examples[0].method;
        pathInput.value = preset.examples[0].path;
        headersInput.value = preset.examples[0].headers ?? '';
        bodyInput.value = preset.examples[0].body ?? '';
      }
      recompile();
    }

    function presetDescription(id: string): string {
      switch (id) {
        case 'notes': return 'A small CRUD API for notes, defined entirely as router.endpoint tagged templates — GET/POST/PUT/DELETE over /notes and /notes/:id.';
        case 'params': return ':id path params plus a query string read from request.url — letterpress matches the path only; the query is ordinary Fetch API territory.';
        case 'wildcard': return 'A [Authorization: Bearer *] header wildcard protects /admin; a request without it falls through to a plainer route, and anything unmatched hits the router-level defaultHandler. ([Authorization^=Bearer] is an equivalent "starts with" spelling of the same check.)';
        case 'stream': return 'A response body written as one literal template with live substitution functions, plus a hand-built ReadableStream response for true streaming.';
        default: return '';
      }
    }

    // wire up
    presetSel.addEventListener('change', () => { loadPreset(presetSel.value, true); persist(); dispatch(); });
    resetBtn.addEventListener('click', () => { loadPreset(presetSel.value, false); });
    sourceEl.addEventListener('input', recompile);
    sourceEl.addEventListener('scroll', syncHighlightScroll);
    methodSel.addEventListener('change', () => { persist(); dispatch(); });
    pathInput.addEventListener('input', () => persist());
    headersInput.addEventListener('input', () => persist());
    bodyInput.addEventListener('input', () => persist());
    sendBtn.addEventListener('click', dispatch);
    pathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') dispatch(); });
    copyBtn.addEventListener('click', async () => {
      await copyLink();
      copyBtn.textContent = '✓ copied';
      setTimeout(() => { copyBtn.textContent = '🔗 copy link'; }, 1400);
    });

    // default / restored state
    loadPreset(state.preset, false);
    methodSel.value = state.method;
    pathInput.value = state.path;
    headersInput.value = state.headers;
    bodyInput.value = state.body;
    await dispatch();

    return () => {
      // all listeners live on elements removed with `host`; nothing else to tear down
    };
  },
};

export default playground;
