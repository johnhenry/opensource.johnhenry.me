import type { Playground } from '../registry';
import { receive, handoffBanner } from '../bus';
import { readState, writeState, copyLink } from '../state';
// 0.0.1: both "./browser" and "./blob-preview" now carry a real "types"
// condition (browser.d.ts / blob-preview.d.ts), so these resolve fully
// typed -- no more hand-written stand-ins for their runtime shapes.
import { toArchive, fromArchive, createRouter } from '@johnhenry/packfile/browser';
import type { FileEntry, FilesMap, RouteHandler } from '@johnhenry/packfile/browser';
import { createBlobPreview } from '@johnhenry/packfile/blob-preview';
import type { BlobPreview } from '@johnhenry/packfile/blob-preview';
// used only to introspect the real wbn.Bundle this planet builds, for the structure/hex view.
import * as wbnRaw from 'wbn';
import './packfile.css';

interface WbnBundle { primaryURL: string | null; urls: string[]; getResponse(u: string): { status: number; headers: Record<string, string>; body: Uint8Array } }
const WbnBundle = (wbnRaw as { Bundle: new (b: Uint8Array) => WbnBundle }).Bundle;

/* ------------------------------------------------------------------ */
/* File model                                                            */
/* ------------------------------------------------------------------ */
type FileKind = 'text' | 'binary';
interface VFile { path: string; kind: FileKind; text?: string; data?: Uint8Array }

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const enc = new TextEncoder();
const dec = new TextDecoder();

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function bytesOf(f: VFile): Uint8Array {
  return f.kind === 'text' ? enc.encode(f.text ?? '') : (f.data ?? new Uint8Array());
}

/** Decodes a base64 string (as sent by studio.ts's handoff payload) back to bytes. */
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ---- a tiny deterministic-ish PNG, drawn on a real canvas ---- */
function makePng(seed: number, size = 48): Uint8Array {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const h1 = (seed * 47) % 360;
  const h2 = (h1 + 90 + (seed % 40)) % 360;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, `hsl(${h1} 80% 55%)`);
  g.addColorStop(1, `hsl(${h2} 80% 35%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.85;
  const rnd = (n: number) => { const x = Math.sin(seed * 999 + n * 137.13) * 10000; return x - Math.floor(x); };
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.fillStyle = `hsl(${(h2 + i * 30) % 360} 90% ${40 + i * 5}%)`;
    ctx.arc(rnd(i) * size, rnd(i + 10) * size, size * (0.08 + rnd(i + 20) * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }
  const durl = c.toDataURL('image/png');
  const b64 = durl.slice(durl.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------------------ */
/* Presets                                                                */
/* ------------------------------------------------------------------ */
interface PresetDef { label: string; root: string; make(): VFile[] }

function textFile(path: string, text: string): VFile { return { path, kind: 'text', text }; }

const PRESETS: Record<string, PresetDef> = {
  site: {
    label: 'tiny static site',
    root: 'index.html',
    make: () => [
      textFile('index.html', `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Packfile Vault</title><link rel="stylesheet" href="style.css"></head>
<body>
  <h1>Hello from a web bundle <img class="mark" src="mark.svg" alt=""></h1>
  <p id="out">loading…</p>
  <script src="app.js"></script>
</body>
</html>`),
      textFile('style.css', `body { font: 16px/1.5 system-ui, sans-serif; background: #0e1420; color: #e7ecf5; padding: 3rem; }
h1 { display: flex; align-items: center; gap: .5rem; }
.mark { width: 1.2em; height: 1.2em; }
#out { color: #7ad1ff; }`),
      textFile('app.js', `document.getElementById('out').textContent =
  'served from ' + location.href + ' at ' + new Date().toLocaleTimeString();`),
      textFile('mark.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#7ad1ff"/></svg>`),
    ],
  },
  docs: {
    label: 'docs folder',
    root: 'docs/index.html',
    make: () => [
      textFile('docs/index.html', `<!doctype html>
<html><head><meta charset="utf-8"><title>Docs</title></head>
<body style="font:15px/1.6 system-ui;background:#0e1420;color:#e7ecf5;padding:2.5rem;max-width:60ch">
  <h1>Packfile Docs</h1>
  <ul>
    <li><a href="guide.md">guide.md</a></li>
    <li><a href="api.md">api.md</a></li>
  </ul>
</body></html>`),
      textFile('docs/guide.md', `# Guide

1. Edit files on the left.
2. Click **Pack**.
3. Serve them on the right.`),
      textFile('docs/api.md', `# API

- \`fromDirectory(path)\`
- \`toArchive(map)\`
- \`fromArchive(buffer)\`
- \`createRouter(files, { alias })\``),
    ],
  },
  assets: {
    label: 'assets set',
    root: 'assets/index.html',
    make: () => [
      textFile('assets/index.html', `<!doctype html>
<html><head><meta charset="utf-8"><title>Assets</title></head>
<body style="font:15px/1.6 system-ui;background:#0e1420;color:#e7ecf5;padding:2.5rem">
  <h1>A generated PNG, packed and re-served</h1>
  <img src="logo.png" width="128" height="128" style="border-radius:12px">
</body></html>`),
      textFile('assets/manifest.json', JSON.stringify({ generated: true, files: ['logo.png'] }, null, 2)),
      { path: 'assets/logo.png', kind: 'binary', data: makePng(7) },
    ],
  },
};
const DEFAULTS = { preset: 'site', path: '/', alias: 'index.html' };

/* ------------------------------------------------------------------ */

const playground: Playground = {
  id: 'packfile',
  title: 'Packfile Vault',
  pkg: '@johnhenry/packfile',
  hue: 75,
  blurb: 'A directory becomes one gzipped web bundle, then serves itself as (Request) => Response.',
  docs: 'https://opensource.johnhenry.me/packfile/',
  mount(host) {
    const state = readState<{ preset: string; path: string; alias: string }>(DEFAULTS);
    if (!PRESETS[state.preset]) state.preset = 'site';
    const persist = () => writeState(state, DEFAULTS);

    let files = new Map<string, VFile>();
    let sel = '';
    let pngSeed = 8;
    let handoffHtml = '';

    const h = receive<{ files: { path: string; content: string; encoding?: 'utf8' | 'base64' }[]; droppedSymlinks?: number }>('packfile');
    if (h && h.kind === 'fileable-tree' && h.payload?.files?.length) {
      files = new Map(
        h.payload.files.map((f) => {
          const vf: VFile = f.encoding === 'base64' ? { path: f.path, kind: 'binary', data: fromBase64(f.content) } : textFile(f.path, f.content);
          return [f.path, vf] as const;
        }),
      );
      state.preset = '';
      const htmlFile = h.payload.files.find((f) => /\.html?$/.test(f.path));
      state.alias = htmlFile?.path ?? h.payload.files[0].path;
      const dropped = h.payload.droppedSymlinks ?? 0;
      handoffHtml = handoffBanner(
        h,
        `Received ${h.payload.files.length} file${h.payload.files.length === 1 ? '' : 's'} from the fileable tree — packed below.` +
          (dropped > 0 ? ` ${dropped} symlink${dropped === 1 ? '' : 's'} ${dropped === 1 ? "wasn't" : "weren't"} carried (packfile has no symlink representation).` : ''),
      ).outerHTML;
    } else {
      files = new Map(PRESETS[state.preset].make().map((f) => [f.path, f] as const));
      if (!state.alias || state.alias === DEFAULTS.alias) state.alias = PRESETS[state.preset].root;
    }
    sel = files.has(state.alias) ? state.alias : [...files.keys()][0] ?? '';

    let lastRaw: Uint8Array | null = null;
    // toArchive()'s browser overloads key off the `compressed` option
    // literal: `{ compressed: false }` returns the raw Uint8Array bundle,
    // the default (compressed) case returns an ArrayBuffer (CompressionStream
    // has no synchronous way to hand back a Uint8Array view) -- see browser.d.ts.
    let lastGz: ArrayBuffer | null = null;
    let lastFiles: FilesMap | null = null;
    let router: RouteHandler | null = null;
    let preview: BlobPreview | null = null;

    const root = document.createElement('div');
    root.className = 'pg-packfile';
    root.innerHTML = `
      ${handoffHtml}
      <div class="pv-cols">
        <section class="panel pv-col pv-left">
          <h3 class="pv-h">tree <span class="stat" data-o="treestat"></span></h3>
          <div class="pv-presets">
            ${Object.entries(PRESETS).map(([id, p]) => `<button class="btn ghost pv-preset" data-id="${id}" type="button">${esc(p.label)}</button>`).join('')}
          </div>
          <div class="pv-addrow">
            <input class="pv-newpath" type="text" placeholder="path/to/file.txt" spellcheck="false">
            <button class="btn ghost" data-act="add-text" type="button" title="add a text file">+ text</button>
            <button class="btn ghost" data-act="add-png" type="button" title="add a generated PNG">+ png</button>
          </div>
          <ul class="pv-files"></ul>
          <div class="pv-editor"></div>
        </section>

        <section class="panel pv-col pv-mid">
          <h3 class="pv-h">pack <span class="stat">toArchive()</span></h3>
          <button class="btn primary pv-pack" type="button">Pack this tree</button>
          <div class="pv-stats"></div>
          <div class="pv-structure"></div>
          <div class="pv-hexwrap"><pre class="code pv-hex"></pre></div>
          <button class="btn pv-dl" type="button" disabled>⬇ Download .wbn.gz</button>
        </section>

        <section class="panel pv-col pv-right">
          <h3 class="pv-h">unpack &amp; serve <span class="stat">fromArchive → createRouter</span></h3>
          <div class="pv-req">
            <label class="field">alias "/" →<input class="pv-alias" type="text" spellcheck="false"></label>
            <label class="field">request path<input class="pv-path" type="text" spellcheck="false"></label>
            <div class="pv-reqrow"><button class="btn pv-send" type="button">Send request</button><button class="btn ghost pv-copylink" type="button">🔗 copy link</button></div>
          </div>
          <div class="pv-resp"></div>
          <div class="pv-previewwrap">
            <div class="pv-previewhead">live preview <span class="stat">createBlobPreview()</span></div>
            <iframe class="pv-iframe" sandbox="allow-scripts allow-same-origin" title="served preview"></iframe>
          </div>
        </section>
      </div>

      <div class="panel pv-explain">
        <h3 class="pv-h">what's happening</h3>
        <p>The left tree is an in-memory <code>Map&lt;path, bytes&gt;</code> — exactly the shape
        <code>@johnhenry/packfile</code>'s own <code>fromDirectory()</code> would build from a real disk directory.
        <b>Pack</b> hands that map to the real <code>toArchive()</code> (browser build), which builds an actual
        <a href="https://github.com/WICG/webpackage/tree/main/js/bundle" target="_blank" rel="noopener"><code>application/webbundle</code></a>
        via the real <code>wbn</code> package, then gzips it. The structure view below re-parses those exact bytes with
        <code>new wbn.Bundle()</code> and reads its real per-resource index — the offsets and lengths shown are not invented.
        <b>Unpack &amp; serve</b> runs <code>fromArchive()</code> → <code>createRouter()</code> to get back a plain
        <code>(Request) =&gt; Response</code> handler, and <code>createBlobPreview()</code> mints one <code>blob:</code> URL
        per file (rewriting relative references) so the iframe on the right renders the archive with no server at all.</p>
      </div>`;
    host.appendChild(root);

    const $ = <T extends Element>(s: string, r: ParentNode = root) => r.querySelector(s) as T;
    const treeStat = $('[data-o=treestat]');
    const fileList = $<HTMLUListElement>('.pv-files');
    const editorBox = $<HTMLDivElement>('.pv-editor');
    const statsBox = $<HTMLDivElement>('.pv-stats');
    const structBox = $<HTMLDivElement>('.pv-structure');
    const hexBox = $<HTMLPreElement>('.pv-hex');
    const dlBtn = $<HTMLButtonElement>('.pv-dl');
    const aliasIn = $<HTMLInputElement>('.pv-alias');
    const pathIn = $<HTMLInputElement>('.pv-path');
    const respBox = $<HTMLDivElement>('.pv-resp');
    const iframe = $<HTMLIFrameElement>('.pv-iframe');
    const newPathIn = $<HTMLInputElement>('.pv-newpath');

    aliasIn.value = state.alias;
    pathIn.value = state.path;

    function totalBytes(): number { let n = 0; for (const f of files.values()) n += bytesOf(f).byteLength; return n; }

    function renderFiles() {
      const paths = [...files.keys()].sort();
      treeStat.textContent = `${paths.length} file${paths.length === 1 ? '' : 's'} · ${fmtBytes(totalBytes())}`;
      fileList.innerHTML = paths
        .map((p) => {
          const f = files.get(p)!;
          const sz = fmtBytes(bytesOf(f).byteLength);
          const icon = f.kind === 'binary' ? '▣' : '◆';
          return `<li class="pv-file ${p === sel ? 'sel' : ''}" data-path="${esc(p)}">
            <span class="ic">${icon}</span><span class="nm">${esc(p)}</span><span class="sz">${sz}</span>
            <button class="pv-del" data-path="${esc(p)}" title="remove" type="button">×</button></li>`;
        })
        .join('') || `<li class="pv-empty">no files — add one below</li>`;
    }

    function renderEditor() {
      const f = files.get(sel);
      if (!f) { editorBox.innerHTML = ''; return; }
      if (f.kind === 'text') {
        editorBox.innerHTML = `<div class="pv-ehead"><code>${esc(f.path)}</code><span class="stat">${fmtBytes(bytesOf(f).byteLength)}</span></div>
          <textarea class="code pv-ta" spellcheck="false">${esc(f.text ?? '')}</textarea>`;
        $<HTMLTextAreaElement>('.pv-ta', editorBox).addEventListener('input', (e) => {
          f.text = (e.target as HTMLTextAreaElement).value;
          renderFiles();
        });
      } else {
        const durl = `data:image/png;base64,${btoa(String.fromCharCode(...(f.data ?? [])))}`;
        editorBox.innerHTML = `<div class="pv-ehead"><code>${esc(f.path)}</code><span class="stat">${fmtBytes((f.data ?? new Uint8Array()).byteLength)}</span></div>
          <div class="pv-bin"><img src="${durl}" alt=""><button class="btn ghost" data-act="regen" type="button">↻ regenerate</button></div>`;
        $<HTMLButtonElement>('[data-act=regen]', editorBox).addEventListener('click', () => {
          pngSeed += 1;
          f.data = makePng(pngSeed);
          renderFiles();
          renderEditor();
        });
      }
    }

    function selectPreset(id: string) {
      const p = PRESETS[id];
      if (!p) return;
      files = new Map(p.make().map((f) => [f.path, f] as const));
      state.preset = id;
      state.alias = p.root;
      sel = p.root;
      aliasIn.value = state.alias;
      persist();
      renderFiles();
      renderEditor();
      pack();
    }

    root.querySelectorAll<HTMLButtonElement>('.pv-preset').forEach((b) =>
      b.addEventListener('click', () => selectPreset(b.dataset.id!)),
    );

    fileList.addEventListener('click', (e) => {
      const del = (e.target as HTMLElement).closest<HTMLButtonElement>('.pv-del');
      if (del) {
        const p = del.dataset.path!;
        files.delete(p);
        if (sel === p) sel = [...files.keys()][0] ?? '';
        renderFiles();
        renderEditor();
        return;
      }
      const li = (e.target as HTMLElement).closest<HTMLLIElement>('.pv-file');
      if (li) { sel = li.dataset.path!; renderFiles(); renderEditor(); }
    });

    $<HTMLButtonElement>('[data-act=add-text]').addEventListener('click', () => {
      const p = newPathIn.value.trim();
      if (!p) return;
      files.set(p, textFile(p, ''));
      sel = p;
      newPathIn.value = '';
      renderFiles();
      renderEditor();
    });
    $<HTMLButtonElement>('[data-act=add-png]').addEventListener('click', () => {
      let p = newPathIn.value.trim() || `assets/image-${files.size + 1}.png`;
      if (!/\.png$/i.test(p)) p += '.png';
      pngSeed += 1;
      files.set(p, { path: p, kind: 'binary', data: makePng(pngSeed) });
      sel = p;
      newPathIn.value = '';
      renderFiles();
      renderEditor();
    });

    function hexDump(bytes: Uint8Array, max = 128): string {
      const n = Math.min(bytes.length, max);
      const lines: string[] = [];
      for (let i = 0; i < n; i += 16) {
        const chunk = bytes.subarray(i, Math.min(i + 16, n));
        const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
        const ascii = Array.from(chunk, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('');
        lines.push(`${i.toString(16).padStart(6, '0')}  ${hex}  ${ascii}`);
      }
      if (bytes.length > max) lines.push(`… ${bytes.length - max} more bytes`);
      return lines.join('\n');
    }

    async function sha256Hex(data: Uint8Array): Promise<string> {
      const d = await crypto.subtle.digest('SHA-256', data.slice().buffer);
      return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
    }

    async function buildMap(): Promise<Map<string, FileEntry>> {
      const map = new Map<string, FileEntry>();
      for (const [path, f] of files) {
        const data = bytesOf(f);
        map.set(path, { data, size: data.byteLength, hash: await sha256Hex(data) });
      }
      return map;
    }

    function showErr(e: unknown, box: HTMLElement) {
      box.innerHTML = `<pre class="code">${esc(e instanceof Error ? e.stack ?? e.message : String(e))}</pre>`;
    }

    async function pack() {
      dlBtn.disabled = true;
      try {
        const map = await buildMap();
        if (map.size === 0) throw new Error('add at least one file first');
        const inputBytes = [...map.values()].reduce((s, e) => s + e.size, 0);
        const raw = await toArchive(map, { compressed: false });
        const gz = await toArchive(map, { compressed: true });
        lastRaw = raw;
        lastGz = gz;

        const pct = inputBytes ? ((gz.byteLength / inputBytes) * 100).toFixed(0) : '–';
        statsBox.innerHTML = `<div class="pv-statgrid">
          <div><b>${map.size}</b><span>files</span></div>
          <div><b>${fmtBytes(inputBytes)}</b><span>input</span></div>
          <div><b>${fmtBytes(raw.byteLength)}</b><span>wbn (raw)</span></div>
          <div><b>${fmtBytes(gz.byteLength)}</b><span>gzip</span></div>
          <div><b>${pct}%</b><span>of input</span></div>
        </div>`;

        const bundle = new WbnBundle(raw);
        const idxSection = (bundle as unknown as { indexSection: Map<string, unknown[]> }).indexSection;
        let respTotal = 0;
        const rows = bundle.urls.map((u) => {
          const entry = (idxSection.get(u) as [number, number]) ?? [0, 0];
          const [offset, length] = entry;
          respTotal += length;
          const path = u.replace(/^https:\/\/packfile\.invalid\//, '') || '/';
          return { path, offset, length };
        });
        const overhead = raw.byteLength - respTotal;
        structBox.innerHTML = `<div class="pv-primary">primary URL <code>${esc(bundle.primaryURL ?? '')}</code></div>
          <table class="pv-restable"><thead><tr><th>path</th><th>offset</th><th>length</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td><code>${esc(r.path)}</code></td><td>${r.offset}</td><td>${fmtBytes(r.length)}</td></tr>`).join('')}</tbody></table>
          <div class="pv-sections"><span class="stat">responses ${fmtBytes(respTotal)} · wrapper/index ${fmtBytes(overhead)}</span>
            <div class="pv-secbar"><i style="width:${(respTotal / raw.byteLength) * 100}%"></i></div></div>`;

        hexBox.textContent = `raw webbundle (first bytes)\n${hexDump(raw)}\n\ngzip stream (first bytes)\n${hexDump(new Uint8Array(gz), 32)}`;

        dlBtn.disabled = false;
        await unpackAndServe();
      } catch (e) {
        showErr(e, statsBox);
        structBox.innerHTML = '';
        hexBox.textContent = '';
      }
    }

    dlBtn.addEventListener('click', () => {
      if (!lastGz) return;
      const blob = new Blob([lastGz], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bundle.wbn.gz';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });

    async function rebuildPreview() {
      if (preview) { preview.dispose(); preview = null; }
      if (!lastFiles) { iframe.removeAttribute('src'); return; }
      try {
        const rootPath = lastFiles.has(state.alias) ? state.alias : [...lastFiles.keys()][0];
        preview = await createBlobPreview(lastFiles, { rootPath });
        iframe.src = preview.entryUrl;
      } catch (e) {
        iframe.removeAttribute('src');
        showErr(e, respBox);
      }
    }

    async function sendRequest() {
      if (!router) return;
      try {
        const path = pathIn.value.trim() || '/';
        state.path = path;
        persist();
        const req = new Request(new URL(path, 'https://packfile.local/').toString());
        const res = await router(req);
        const clone = res.clone();
        const ct = res.headers.get('content-type') ?? '';
        const headerRows = [...res.headers.entries()].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
        let bodyHtml: string;
        if (ct.startsWith('image/')) {
          const buf = await clone.arrayBuffer();
          const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
          bodyHtml = `<img class="pv-respimg" src="data:${ct};base64,${b64}" alt="">`;
        } else if (ct.startsWith('text/') || ct.includes('json') || ct.includes('javascript') || ct.includes('xml')) {
          const text = await clone.text();
          bodyHtml = `<pre class="code">${esc(text.slice(0, 4000))}${text.length > 4000 ? '\n… truncated' : ''}</pre>`;
        } else {
          const buf = await clone.arrayBuffer();
          bodyHtml = `<div class="stat">[${fmtBytes(buf.byteLength)} binary body]</div>`;
        }
        respBox.innerHTML = `<div class="pv-status ${res.ok ? 'ok' : 'bad'}">${res.status} ${esc(res.statusText || (res.ok ? 'OK' : ''))}</div>
          <table class="pv-headtable"><tbody>${headerRows}</tbody></table>
          <div class="pv-body">${bodyHtml}</div>`;
      } catch (e) {
        showErr(e, respBox);
      }
    }

    async function unpackAndServe() {
      if (!lastGz) return;
      try {
        lastFiles = await fromArchive(lastGz);
        state.alias = aliasIn.value.trim() || DEFAULTS.alias;
        persist();
        router = createRouter(lastFiles, { alias: { '/': state.alias } });
        await rebuildPreview();
        await sendRequest();
      } catch (e) {
        showErr(e, respBox);
      }
    }

    $<HTMLButtonElement>('.pv-pack').addEventListener('click', pack);
    $<HTMLButtonElement>('.pv-send').addEventListener('click', sendRequest);
    aliasIn.addEventListener('change', () => { void unpackAndServe(); });
    pathIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') void sendRequest(); });
    $<HTMLButtonElement>('.pv-copylink').addEventListener('click', async () => {
      const btn = $<HTMLButtonElement>('.pv-copylink');
      await copyLink();
      const old = btn.textContent;
      btn.textContent = '✓ copied';
      setTimeout(() => { btn.textContent = old; }, 1200);
    });

    renderFiles();
    renderEditor();
    void pack();

    return () => {
      if (preview) preview.dispose();
    };
  },
};

export default playground;
