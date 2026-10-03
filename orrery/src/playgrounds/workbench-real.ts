/**
 * Workbench Desk, "Real app (no bundler)" mode.
 *
 * An iframe of the actual standalone app (github.com/johnhenry/workbench, deployed to GitHub Pages). It proves four things a
 * Vite-bundled planet cannot, because the frame is a separate document on a separate origin:
 *   1. it has an origin of its own;
 *   2. it runs under its own strict CSP (a <meta> policy: GitHub Pages cannot send headers);
 *   3. that CSP enforces Trusted Types;
 *   4. it loads the libraries through its import map (no bundler) and the esm.sh files are covered by import-map `integrity`,
 *      which the browser checks.
 *
 * The frame is cross-origin, so this module never talks to it (no postMessage, no contentWindow). The claims panel is built
 * from a CORS fetch of the same document (GitHub Pages sends `access-control-allow-origin: *`), parsed inertly with DOMParser,
 * so the policy it quotes is the one the live page carries. If that fetch fails, a recorded copy is used and labelled as such.
 */

export const STANDALONE = 'https://johnhenry.github.io/workbench/';

export interface ImportMapShape { imports?: Record<string, string>; integrity?: Record<string, string> }
export interface StandaloneInfo {
  /** 'live': parsed from a fetch of the page just now. 'recorded': the copy below (the fetch failed). */
  source: 'live' | 'recorded';
  csp: string | null;
  importMap: ImportMapShape | null;
  /** The page's `<script src>` values, as written (the module entry point). */
  scripts: string[];
  inlineScripts: number;
  /** Why the live fetch failed, when source is 'recorded'. */
  error?: string;
  at: string;
}

/** A copy of what the live page carried on 2026-10-03, used only when the live fetch fails (offline, blocked). */
export const RECORDED: Omit<StandaloneInfo, 'source' | 'at' | 'error'> = {
  csp: "default-src 'none'; script-src 'self' 'sha256-5ii7w1+HrUxz4To1dcUhFt4/+vjU8ubYbJ0hrFcOaiI=' https://esm.sh; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'; require-trusted-types-for 'script'; trusted-types html-modules dompurify",
  importMap: {
    imports: {
      '@johnhenry/window-algebra': '/workbench/vendor/@johnhenry/window-algebra/src/index.mjs',
      '@johnhenry/window-algebra/browser': '/workbench/vendor/@johnhenry/window-algebra/src/browser/index.mjs',
      '@johnhenry/window-algebra/element': '/workbench/vendor/@johnhenry/window-algebra/src/bindings/element.mjs',
      '@johnhenry/html-modules/browser': '/workbench/vendor/@johnhenry/html-modules/src/browser.js',
      '@johnhenry/html-modules/runtime': '/workbench/vendor/@johnhenry/html-modules/src/runtime.js',
      '@johnhenry/html-modules/safe-fragment': '/workbench/vendor/@johnhenry/html-modules/src/safe-fragment.js',
      '@johnhenry/safe-fragment': '/workbench/vendor/@johnhenry/safe-fragment/dist/index.js',
      '@workbench/ui/': '/workbench/components/',
      dayjs: 'https://esm.sh/dayjs@1.11.23?target=es2022',
      'dayjs/plugin/relativeTime': 'https://esm.sh/dayjs@1.11.23/plugin/relativeTime?target=es2022',
      dompurify: '/workbench/vendor/dompurify/dist/purify.es.mjs',
    },
    integrity: {
      'https://esm.sh/dayjs@1.11.23?target=es2022': 'sha384-eFvOsMJ5j7hf+muaDPbgE1gK4IMG6mh7xfCiz2p7UVdMOyjqXw9tASMXO/l2/by4',
      'https://esm.sh/dayjs@1.11.23/plugin/relativeTime?target=es2022': 'sha384-9AsXsu+3IQoPbCGuFM2z0F/NsxDWu60JSQbHzFx+WWKAqpL/NhbcHBulw0PLJi+p',
      'https://esm.sh/dayjs@1.11.23/es2022/dayjs.mjs': 'sha384-MZyYGInYSfCFw65y3Ap/oRSonokrsRylRYSbAmIculbq5lodAVny3KwQoDrfYGcX',
      'https://esm.sh/dayjs@1.11.23/es2022/plugin/relativeTime.mjs': 'sha384-cyC32pY6nX7HQCAOHyKVtZ9y46YwWrKV+nk1Cn5pB9haKeqipBts+e3IshIUDyKk',
    },
  },
  scripts: ['app/main.js'],
  inlineScripts: 1, // the import map itself
};

/** Parse the standalone's HTML (inertly: DOMParser runs no script and loads nothing). Exported for the unit-ish checks. */
export function parseStandalone(html: string): Pick<StandaloneInfo, 'csp' | 'importMap' | 'scripts' | 'inlineScripts'> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = [...doc.querySelectorAll('meta[http-equiv]')].find((m) => m.getAttribute('http-equiv')!.toLowerCase() === 'content-security-policy');
  let importMap: ImportMapShape | null = null;
  const map = doc.querySelector('script[type="importmap"]');
  if (map?.textContent) { try { importMap = JSON.parse(map.textContent); } catch { /* malformed: report none */ } }
  const scripts = [...doc.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')!);
  const inlineScripts = [...doc.querySelectorAll('script:not([src])')].length;
  return { csp: meta?.getAttribute('content') ?? null, importMap, scripts, inlineScripts };
}

export async function inspectStandalone(signal?: AbortSignal): Promise<StandaloneInfo> {
  const at = new Date().toISOString();
  try {
    const res = await fetch(STANDALONE, { signal, cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseStandalone(await res.text());
    if (!parsed.csp && !parsed.importMap) throw new Error('the page had no CSP and no import map');
    return { source: 'live', at, ...parsed };
  } catch (e) {
    return { source: 'recorded', at, error: (e as Error)?.message ?? String(e), ...RECORDED };
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const directives = (csp: string) => csp.split(';').map((d) => d.trim()).filter(Boolean);

/** Does this planet's own response carry a CSP header? (The orrery sends none; checked live rather than assumed.) */
async function ownCsp(signal?: AbortSignal): Promise<string | null | undefined> {
  try {
    const res = await fetch(location.href.split('#')[0], { method: 'HEAD', signal, cache: 'no-cache' });
    return res.headers.get('content-security-policy');
  } catch { return undefined; }
}

function claimsHtml(info: StandaloneInfo, own: string | null | undefined): string {
  const frameOrigin = new URL(STANDALONE).origin;
  const where = info.source === 'live'
    ? `fetched from <code>${esc(STANDALONE)}</code> just now (${esc(info.at.slice(11, 19))} UTC)`
    : `<b class="wb-warn-text">a recorded copy from 2026-10-03</b>: the live fetch failed (${esc(info.error ?? 'unknown')})`;
  const imports = info.importMap?.imports ?? {};
  const integrity = info.importMap?.integrity ?? {};
  const csp = info.csp;
  const dirs = csp ? directives(csp) : [];
  const dir = (name: string) => dirs.find((d) => d === name || d.startsWith(`${name} `));
  const tt = dir('require-trusted-types-for');
  const ttPolicies = dir('trusted-types');
  const scriptSrc = dir('script-src');
  const local = Object.entries(imports).filter(([, u]) => !/^https?:/.test(u));
  const remote = Object.entries(imports).filter(([, u]) => /^https?:/.test(u));
  const ownLine = own === undefined ? 'could not be checked' : own ? `sends <code>${esc(own)}</code>` : 'sends <b>no</b> <code>Content-Security-Policy</code> header';
  const bundleLine = info.scripts.length
    ? `The page's only <code>&lt;script src&gt;</code> is <code>${esc(info.scripts.join(', '))}</code>: an ES module that imports its libraries by bare name.`
    : 'The page has no <code>&lt;script src&gt;</code>.';

  return `
    <p class="wb-claims-src">Read from the standalone's own HTML, ${where}. The frame is cross-origin, so this page cannot look inside it, and does not try.</p>

    <article class="wb-claim" data-claim="origin">
      <h4>It runs on an origin of its own</h4>
      <p>The frame is <code>${esc(frameOrigin)}</code>. This page is <code>${esc(location.origin)}</code>, shared with the docs site, 36 other planets and a service worker. The browser keeps the two apart: different origins, so no shared storage, scope or DOM access. The libraries run in a document nothing else on this origin can reach.</p>
    </article>

    <article class="wb-claim" data-claim="csp">
      <h4>It enforces its own strict CSP</h4>
      <p>Delivered as a <code>&lt;meta http-equiv&gt;</code> policy (GitHub Pages cannot set headers). This page ${ownLine}.</p>
      ${csp ? `<pre class="code" data-csp>${esc(dirs.join(';\n'))}</pre>` : '<p class="wb-warn-text">No Content-Security-Policy meta tag was found in the standalone\'s HTML.</p>'}
    </article>

    <article class="wb-claim" data-claim="trusted-types">
      <h4>Trusted Types are enforced</h4>
      ${tt ? `<p><code>${esc(tt)}</code>: a string assigned to an HTML or script sink (<code>innerHTML</code>, <code>srcdoc</code>, a script URL) throws unless it went through a policy. <code>${esc(ttPolicies ?? 'trusted-types')}</code> names the only policies that may be created. html-modules and safe-fragment's DOMPurify fallback run inside that rule. This planet's in-page mode cannot: the orrery sets no <code>require-trusted-types-for</code>.</p>` : '<p class="wb-warn-text">No <code>require-trusted-types-for</code> directive was found.</p>'}
    </article>

    <article class="wb-claim" data-claim="import-map">
      <h4>The libraries load through the import map, not a bundle</h4>
      <p>${bundleLine} Its import map has <b>${Object.keys(imports).length}</b> entries: <b>${local.length}</b> same-origin files (the four libraries, copied as-is into <code>vendor/</code>, plus the <code>@workbench/ui/</code> prefix its HTML modules are fetched through) and <b>${remote.length}</b> from esm.sh.</p>
      ${scriptSrc ? `<p>Its <code>script-src</code> is <code>${esc(scriptSrc.replace('script-src ', ''))}</code>: its own origin, one hashed inline script (the import map) and esm.sh.</p>` : ''}
      <pre class="code" data-importmap>${esc(Object.entries(imports).map(([k, v]) => `${k}\n   → ${v}`).join('\n'))}</pre>
    </article>

    <article class="wb-claim" data-claim="integrity">
      <h4>The esm.sh files are verified against import-map <code>integrity</code></h4>
      <p>The map pins <b>${Object.keys(integrity).length}</b> third-party files by SHA-384 (dayjs and its relativeTime plugin: the entry and the real file behind it). The <em>browser</em> hashes each file it fetches from esm.sh and refuses a mismatch, before any of it runs. That is the engine's check, which only a page with a real import map has: Vite bundled the libraries into this page, so the in-page mode can show the map but not enforce it. The standalone's own tests tamper with a file on Chromium, Firefox and WebKit.</p>
      <pre class="code" data-integrity>${esc(Object.entries(integrity).map(([k, v]) => `${v.slice(0, 22)}…  ${k}`).join('\n'))}</pre>
    </article>`;
}

/** Mount the real-app view into `host`. Returns the cleanup (aborts the fetches, drops the timers and listeners). */
export function mountReal(host: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'wb-real';
  root.innerHTML = `
    <section class="panel wb-callout">
      <a class="btn primary" data-fullscreen href="${STANDALONE}" target="_blank" rel="noopener">Open full screen ↗</a>
      <p><b>This is the real app</b>, not a copy: <code>${esc(STANDALONE)}</code> in an iframe. No bundler built it, a strict CSP governs it, and the browser treats it as another site. On the right: what that proves, read from the page's own HTML.</p>
    </section>
    <div class="wb-real-grid">
      <div class="wb-frame-wrap">
        <div class="wb-frame-bar">
          <span class="wb-frame-url">${esc(STANDALONE)}</span>
          <span class="stat wb-frame-status" role="status" data-frame-status>loading…</span>
        </div>
        <div class="wb-frame-fail panel" role="alert" data-frame-fail hidden>
          <b>The standalone workbench did not load here.</b>
          <span data-fail-why></span>
          <span>It may be offline, or the host refused framing. <a href="${STANDALONE}" target="_blank" rel="noopener">Open it in its own tab ↗</a> or <button class="btn" type="button" data-retry>try again</button>.</span>
        </div>
        <iframe class="wb-frame" data-frame title="Workbench: the standalone app (johnhenry/workbench), running on its own origin" src="${STANDALONE}" loading="lazy"></iframe>
      </div>
      <aside class="wb-claims" aria-label="What the frame proves" data-claims><p class="wb-claims-src">Reading the standalone's HTML…</p></aside>
    </div>`;
  host.append(root);

  const frame = root.querySelector<HTMLIFrameElement>('[data-frame]')!;
  const statusEl = root.querySelector<HTMLElement>('[data-frame-status]')!;
  const fail = root.querySelector<HTMLElement>('[data-frame-fail]')!;
  const failWhy = root.querySelector<HTMLElement>('[data-fail-why]')!;
  const claims = root.querySelector<HTMLElement>('[data-claims]')!;

  let disposed = false;
  let loaded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = new AbortController();

  const showFail = (why: string) => {
    if (disposed) return;
    failWhy.textContent = why;
    fail.hidden = false;
    statusEl.textContent = 'failed to load';
    root.dataset.frame = 'failed';
  };
  const clearFail = () => { fail.hidden = true; failWhy.textContent = ''; };

  const onLoad = () => {
    if (disposed) return;
    loaded = true;
    clearTimeout(timer);
    // A frame the host refused, or an offline error page, still fires `load`: the inspection result decides below.
    if (!fail.hidden) return;
    statusEl.textContent = 'loaded';
    root.dataset.frame = 'loaded';
  };
  frame.addEventListener('load', onLoad);

  const run = async () => {
    abort.abort();
    abort = new AbortController();
    const { signal } = abort;
    loaded = false;
    clearFail();
    statusEl.textContent = 'loading…';
    root.dataset.frame = 'loading';
    clearTimeout(timer);
    timer = setTimeout(() => { if (!loaded) showFail('No load event after 15 seconds.'); }, 15_000);
    if (navigator.onLine === false) showFail('The browser reports it is offline.');
    const timeout = setTimeout(() => abort.abort(), 10_000);
    const [info, own] = await Promise.all([inspectStandalone(signal), ownCsp(signal)]);
    clearTimeout(timeout);
    if (disposed || signal !== abort.signal) return; // superseded by a retry, or left the planet
    claims.innerHTML = claimsHtml(info, own);
    if (info.source === 'recorded') showFail(`Could not fetch the page (${info.error}).`);
    else if (loaded) { statusEl.textContent = 'loaded'; root.dataset.frame = 'loaded'; }
  };

  const onClick = (e: Event) => {
    if (!(e.target as HTMLElement).closest('[data-retry]')) return;
    frame.src = STANDALONE; // a fresh navigation
    void run();
  };
  root.addEventListener('click', onClick);
  const onOnline = () => { if (!fail.hidden) { frame.src = STANDALONE; void run(); } };
  addEventListener('online', onOnline);
  void run();

  return () => {
    disposed = true;
    abort.abort();
    clearTimeout(timer);
    frame.removeEventListener('load', onLoad);
    root.removeEventListener('click', onClick);
    removeEventListener('online', onOnline);
    frame.src = 'about:blank';
    root.remove();
  };
}
