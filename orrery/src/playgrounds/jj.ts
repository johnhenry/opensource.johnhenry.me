import type { Playground } from '../registry';
import { Buffer } from 'buffer';
import { readState, writeState, copyLink } from '../state';
import LightningFS from '@isomorphic-git/lightning-fs';
import './jj.css';

// isomorphic-git (the git backend) still expects a global Buffer in the browser.
(globalThis as any).Buffer ??= Buffer;

/* ------------------------------------------------------------------ */
/* Planet                                                                */
/* ------------------------------------------------------------------ */
interface Change {
  changeId: string; commitId: string; parents: string[]; description: string;
  timestamp: string; fileSnapshot?: Record<string, string>; abandoned?: boolean;
}
interface Op { id: string; description: string; timestamp: string; view?: { workingCopy?: string } }
interface Conflict { conflictId: string; path: string; type: string; sides: { base: string; left: string; right: string }; message?: string; resolved: boolean }
interface Step { title: string; text: string; run: () => Promise<void> }

type Snapshot = Map<string | number, unknown>;
/** What the planet saw right after an operation: used to check that operations.restore() lands there. */
interface Fingerprint { wc: string; changes: Record<string, { commit: string; desc: string; parents: string; files: Record<string, string> }>; files: Record<string, string>; conflicts: string[] }
let fsSeq = 0;
const SVGNS = 'http://www.w3.org/2000/svg';
const DIR = '/repo';
const MARK = '<<<<<<<';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const short = (id: string, n = 8) => (id || '').slice(0, n);
const firstLine = (d: string) => (d || '').split('\n')[0] || '(no description set)';
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const userFiles = (snap?: Record<string, string>) => Object.keys(snap || {}).filter(f => f !== '.gitignore').sort();
const sortedFiles = (snap?: Record<string, string>) => Object.fromEntries(userFiles(snap).map(f => [f, snap![f]]));
const hasMarkers = (c: Change) => Object.values(c.fileSnapshot || {}).some(v => typeof v === 'string' && v.includes(MARK));
const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function ago(ts: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}
function opGlyph(d: string): string {
  if (d.startsWith('new')) return '+';
  if (d.startsWith('describe')) return '✎';
  if (d.startsWith('edit')) return '↪';
  if (d.startsWith('squash')) return '⤵';
  if (d.startsWith('move') || d.startsWith('rebase')) return '⇢';
  if (d.startsWith('abandon')) return '✕';
  if (d.startsWith('undo')) return '↶';
  if (d.startsWith('redo')) return '↷';
  if (d.startsWith('restore')) return '⟲';
  if (d.startsWith('write')) return '±';
  if (d.startsWith('snapshot')) return '◉';
  if (d.startsWith('resolve')) return '✓';
  if (d.startsWith('merge')) return '⋈';
  if (d.startsWith('init')) return '◎';
  return '•';
}

async function loadLib() {
  const [{ createJJ }, gitMod, browser] = await Promise.all([
    import('@johnhenry/isomorphic-jj'),
    import('isomorphic-git'),
    import('@johnhenry/isomorphic-jj/browser'),
  ]);
  return { createJJ, git: gitMod.default, browser };
}

const SCENARIOS: Record<string, { label: string; blurb: string }> = {
  stack: { label: 'Stacked changes', blurb: 'Three changes stacked on each other. Reword an old one, go back and fix it, squash, then rewind the whole repo.' },
  conflict: { label: 'Divergent edits → conflict', blurb: 'Two siblings edit the same line. Rebase one onto the other: the conflict is recorded as data instead of stopping you.' },
  blank: { label: 'Blank repo', blurb: 'One file, one change. Everything else is up to you.' },
};

const playground: Playground = {
  id: 'jj', title: 'Jujutsu Timeline', pkg: '@johnhenry/isomorphic-jj', hue: 230,
  blurb: 'Version control in the browser: stable change IDs survive rewrites and the op log makes anything undoable.',
  docs: 'https://opensource.johnhenry.me/isomorphic-jj/',
  async mount(host) {
    const defaults = { s: 'stack' };
    const st = readState(defaults);
    if (!(st.s in SCENARIOS)) st.s = 'stack';

    const root = document.createElement('div');
    root.className = 'pg-jj';
    root.innerHTML = `
      <div class="jj-top">
        <div class="jj-scen" role="tablist"></div>
        <span class="jj-spacer"></span>
        <span class="stat jj-caps"></span>
        <button class="btn jj-link" title="Copy a link to this scenario">copy link</button>
      </div>
      <div class="jj-grid">
        <section class="panel jj-left">
          <header class="jj-h"><h3>Working copy</h3><span class="jj-wc chip">@</span></header>
          <p class="jj-note">No staging area: the working copy <em>is</em> a change. Type, and watch <b>@</b>'s commit ID change while its change ID holds.</p>
          <div class="jj-tabs"></div>
          <div class="jj-conflict" hidden></div>
          <textarea class="code jj-editor" spellcheck="false"></textarea>
          <form class="jj-addfile"><input placeholder="new-file.txt" aria-label="New file name"><button class="btn" type="submit">+ file</button></form>
        </section>
        <section class="panel jj-mid">
          <div class="jj-tour">
            <div class="jj-tour-txt"><b class="jj-tour-title"></b><span class="jj-tour-body"></span></div>
            <div class="jj-tour-ctl"><span class="jj-dots"></span><button class="btn primary jj-next">Run step ▶</button></div>
          </div>
          <div class="jj-bar">
            <button class="btn" data-a="new" title="jj.new(): start a new change on top of the selected one">new</button>
            <button class="btn" data-a="describe" title="jj.describe(): set the selected change's message">describe</button>
            <button class="btn" data-a="edit" title="jj.edit(): make the selected change the working copy">edit</button>
            <button class="btn" data-a="squash" title="jj.squash(): fold the selected change into its parent">squash</button>
            <button class="btn" data-a="rebase" title="jj.rebase(): pick a new parent for the selected change">rebase</button>
            <button class="btn" data-a="abandon" title="jj.abandon(): drop the selected change">abandon</button>
            <span class="jj-spacer"></span>
            <button class="btn" data-a="undo" title="jj.undo(): revert the last operation">undo</button>
            <button class="btn" data-a="redo" title="jj.redo(): re-apply what undo reverted">redo</button>
          </div>
          <form class="jj-describe" hidden><input aria-label="Change description"><button class="btn primary" type="submit">describe</button><button class="btn" type="button" data-cancel>cancel</button></form>
          <div class="jj-pick" hidden>Rebase <b class="jj-pick-src"></b>: click the change that should become its new parent. <button class="btn" data-cancel>cancel</button></div>
          <div class="jj-graph-wrap"><svg class="jj-graph" xmlns="${SVGNS}"></svg><div class="jj-busy" hidden>working…</div></div>
          <div class="jj-legend stat"><span class="k-id">change ID (stable)</span><span class="k-cid">commit ID (content hash)</span><span class="k-wc">@ working copy</span><span class="k-cf">conflict</span></div>
        </section>
        <section class="panel jj-right">
          <header class="jj-h"><h3>Operation log</h3><span class="stat jj-opcount"></span></header>
          <p class="jj-note">Every command is an operation. Click one to rewind the <em>whole repo</em> to that moment; later ones stay here so you can jump forward again.</p>
          <ol class="jj-ops"></ol>
        </section>
      </div>
      <section class="panel jj-explain">
        <h3>What just happened</h3>
        <div class="jj-last"></div>
        <pre class="code jj-err" hidden></pre>
        <ul class="jj-concepts">
          <li><b>Change ID</b> names the <em>idea</em> ("add greeting"); it never changes. <b>Commit ID</b> is a git hash of the exact content and message; any rewrite makes a new one.</li>
          <li><b>@ is a commit.</b> Edits are snapshotted into it before every command, so there is nothing to stage and nothing to lose.</li>
          <li><b>Conflicts are data.</b> A rebase that collides records base/ours/theirs on the change and keeps going; you resolve whenever you like.</li>
        </ul>
        <p class="stat jj-honest"></p>
      </section>`;
    host.replaceChildren(root);
    const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as unknown as T;

    const svg = $<SVGSVGElement>('.jj-graph');
    const editor = $<HTMLTextAreaElement>('.jj-editor');
    const errBox = $('.jj-err');
    const lastBox = $('.jj-last');
    const busyEl = $('.jj-busy');

    let disposed = false;
    const timers: number[] = [];
    let raf = 0;

    /* ---------------- repo state ---------------- */
    let lib: Awaited<ReturnType<typeof loadLib>>;
    let fs: any;
    let jj: any;
    let changes: Change[] = [];        // visible (non-abandoned)
    let all = new Map<string, Change>();
    let wcId = '';
    let ops: Op[] = [];                // live op list, newest first
    let timeline: Op[] = [];           // longest known history (includes "future" after time travel)
    let conflicts: Conflict[] = [];
    const checkpoints = new Map<string, Snapshot>();   // fallback only: see travel()
    const expected = new Map<string, Fingerprint>();   // op id → state right after it
    // 1.11.0's log() hides an undescribed change whenever it isn't an ancestor of @ (or of a bookmark),
    // so a real tip with work in it vanishes the moment you edit() an older change. jj keeps it: it is
    // still a head. The planet remembers such tips and keeps drawing them (see refresh()).
    let stranded = new Set<string>();
    const strandedAt = new Map<string, string[]>();    // op id → stranded tips at that op
    let selected = '';
    let selectedOp = '';
    let picking = false;
    let openFile = '';
    let dirty = false;
    let steps: Step[] = [];
    let stepIdx = 0;
    let prevShown: string[] = [];
    let prevPos = new Map<string, { cx: number; cy: number; ty: number; commitId: string; desc: string }>();

    /* ---------------- helpers ---------------- */
    let chain: Promise<void> = Promise.resolve();
    let pending = 0;
    function setBusy() { busyEl.hidden = pending === 0; root.classList.toggle('busy', pending > 0); }
    function enqueue(fn: () => Promise<void>): Promise<void> {
      pending++; setBusy();
      chain = chain.then(async () => { if (!disposed) await fn(); }).catch(showErr).finally(() => { pending--; setBusy(); });
      return chain;
    }
    function showErr(e: any) {
      console.error(e);
      errBox.hidden = false;
      errBox.textContent = String(e?.message || e) + (e?.code ? `\n[${e.code}]` : '');
    }
    function said(call: string, note = '') {
      lastBox.innerHTML = `<code class="jj-call">${esc(call)}</code>${note ? `<div class="jj-said">${note}</div>` : ''}`;
    }

    /**
     * The fs is LightningFS (the filesystem createBrowserFS() defaults to), handed in through
     * createBrowserFS({ fs }) with LightningFS's in-memory backend instead of IndexedDB. Rewinding
     * goes through jj.operations.restore(); the whole-disk checkpoint is only a fallback for the
     * two cases where 1.11.0's restore still lands off (see travel() and the note on the page).
     */
    let db: any;
    async function mountFS(from?: Snapshot) {
      db = new (LightningFS as any).MemoryBackend();
      if (from) for (const [k, v] of from) db._map.set(k, k === '!root' ? structuredClone(v) : v);
      fs = await lib.browser.createBrowserFS({ fs: new LightningFS(`orrery-jj-${++fsSeq}`, { db }) });
    }
    async function snapshotFS(): Promise<Snapshot> {
      await fs.promises.flush();
      const m: Snapshot = new Map(db._map);
      m.set('!root', structuredClone(db._map.get('!root')));
      return m;
    }

    /** Walk the working directory (LightningFS has no recursive readdir). */
    async function diskFiles(dir = DIR, pre = ''): Promise<string[]> {
      const out: string[] = [];
      let names: string[] = [];
      try { names = await fs.promises.readdir(dir); } catch { return out; }
      for (const n of names) {
        if (!pre && (n === '.git' || n === '.jj')) continue;
        const st = await fs.promises.stat(`${dir}/${n}`).catch(() => null);
        if (st?.isDirectory()) out.push(...await diskFiles(`${dir}/${n}`, `${pre}${n}/`));
        else if (st) out.push(pre + n);
      }
      return out.sort();
    }
    /**
     * Save a file, then fold it into @. write() records the disk edit as an operation (with the
     * files as they were before it); snapshot() records @'s new content. Writing to disk behind
     * jj's back and only calling snapshot() would leave restore() with no "before" image of the
     * edit (snapshot() can only see the already-edited disk), so a rewind would keep the file.
     */
    async function editFile(path: string, data: string) {
      await jj.write({ path, data });
      await recordHead();
      await jj.snapshot();
    }

    async function fingerprint(): Promise<Fingerprint> {
      const wc = (await jj.status()).workingCopy?.changeId ?? '';
      const log: Change[] = await jj.log({ limit: 500 });
      const out: Fingerprint['changes'] = {};
      for (const c of log) if (!c.abandoned || c.changeId === wc) out[c.changeId] = { commit: c.commitId, desc: c.description, parents: (c.parents || []).join(','), files: sortedFiles(c.fileSnapshot) };
      const files: Record<string, string> = {};
      for (const f of (await diskFiles()).filter(f => f !== '.gitignore')) files[f] = await fs.promises.readFile(`${DIR}/${f}`, 'utf8').catch(() => '') as string;
      const cfs: Conflict[] = await jj.conflicts.list();
      return { wc, changes: out, files, conflicts: cfs.filter(c => !c.resolved).map(c => c.path).sort() };
    }
    /** Human-readable differences between the state recorded after an op and the state now. */
    function fpDiff(want: Fingerprint, got: Fingerprint): string[] {
      const out: string[] = [];
      if (want.wc !== got.wc) out.push(`@ is ${short(got.wc)}, expected ${short(want.wc)}`);
      for (const id of new Set([...Object.keys(want.changes), ...Object.keys(got.changes)])) {
        const a = want.changes[id], b = got.changes[id];
        if (!a) { out.push(`${short(id)} is visible but did not exist then`); continue; }
        if (!b) { out.push(`${short(id)} (${esc(firstLine(a.desc))}) is missing`); continue; }
        const bad = [a.desc !== b.desc && 'description', a.parents !== b.parents && 'parent', JSON.stringify(a.files) !== JSON.stringify(b.files) && `files (${userFiles({ ...a.files, ...b.files }).filter(f => a.files[f] !== b.files[f]).map(esc).join(', ')})`, a.commit !== b.commit && `commit ${short(b.commit, 7)} ≠ ${short(a.commit, 7)}`].filter(Boolean);
        if (bad.length) out.push(`${short(id)} (${esc(firstLine(a.desc))}): ${bad.join(', ')}`);
      }
      for (const f of userFiles({ ...want.files, ...got.files })) if (want.files[f] !== got.files[f]) out.push(`working file ${esc(f)} differs`);
      if (want.conflicts.join() !== got.conflicts.join()) out.push(`unresolved conflicts: [${got.conflicts.map(esc).join(', ')}], expected [${want.conflicts.map(esc).join(', ')}]`);
      return out;
    }
    /** Remember what the head operation left behind (and a whole-disk fallback checkpoint). */
    async function recordHead(fp?: Fingerprint) {
      const head: Op | undefined = (await jj.operations.list({ limit: 1 }))[0];
      if (!head || expected.has(head.id)) return;
      expected.set(head.id, fp ?? await fingerprint());
      strandedAt.set(head.id, [...stranded]);
      checkpoints.set(head.id, await snapshotFS());
    }
    /** The raw record for a change, even one log() hides. */
    async function rawChange(id: string): Promise<Change | undefined> {
      return ((await jj.log({ revset: id }).catch(() => [])) as Change[]).find(c => c.changeId === id);
    }

    async function fresh() {
      await mountFS();
      await fs.promises.mkdir(DIR);
      jj = await lib.createJJ({ fs: fs as any, dir: DIR, git: lib.git, autoSnapshot: false });
      await jj.git.init({ userName: 'Ada Lovelace', userEmail: 'ada@example.com' });
      checkpoints.clear(); expected.clear(); strandedAt.clear(); stranded = new Set(); prevShown = []; timeline = []; prevPos = new Map(); wcId = ''; all = new Map(); selected = ''; selectedOp = ''; openFile = '';
      await recordHead();
    }

    /** Re-read everything from the library and redraw. Records what the head op left behind. */
    async function refresh(animate = true) {
      const status = await jj.status();
      // log() hides what jj would hide (1.10.0 fixed its orphan filter), so no display filter here.
      const log: Change[] = await jj.log({ limit: 500 });
      wcId = status.workingCopy?.changeId ?? '';
      all = new Map(log.map(c => [c.changeId, c]));
      // @ stays drawn even when it sits on an abandoned change (one undo() after abandoning @, see doUndo).
      changes = log.filter(c => !c.abandoned || c.changeId === wcId);
      ops = await jj.operations.list({ limit: 500 });
      conflicts = await jj.conflicts.list();
      // Stranded tips (see `stranded`). After an ordinary command, a change that was drawn, is still
      // alive and only dropped out of log() gets remembered. undo()/redo()/restore() land on an
      // earlier state, so take the tips the planet had then (matched by fingerprint), not the current set.
      const fp = await fingerprint();
      const headOp = ops[0];
      if (headOp && strandedAt.has(headOp.id)) stranded = new Set(strandedAt.get(headOp.id)); // landed on a recorded op
      else if (/^(undo|redo|restore)/.test(headOp?.description ?? '')) {
        const target = /^restore to operation ([0-9a-f]+)/.exec(headOp.description)?.[1];
        const key = JSON.stringify(fp);
        const match = target && strandedAt.has(target) ? target : ops.slice(1).find(o => expected.has(o.id) && JSON.stringify(expected.get(o.id)) === key)?.id;
        stranded = new Set(match ? strandedAt.get(match) : []);
      } else for (const id of prevShown) if (!all.has(id)) stranded.add(id);
      const extra: Change[] = [];
      for (const id of [...stranded]) {
        const c = all.has(id) ? undefined : await rawChange(id);
        // jj itself drops an undescribed change that is empty when @ leaves it; so does the planet
        const parent = c?.parents?.[0] ? all.get(c.parents[0]) ?? await rawChange(c.parents[0]) : undefined;
        const empty = !!c && JSON.stringify(sortedFiles(c.fileSnapshot)) === JSON.stringify(sortedFiles(parent?.fileSnapshot));
        if (!c || c.abandoned || empty) { stranded.delete(id); continue; }
        extra.push(c);
      }
      for (const c of extra) all.set(c.changeId, c);
      changes = changes.concat(extra);
      prevShown = changes.filter(c => !c.abandoned).map(c => c.changeId);
      await recordHead(fp);
      // timeline keeps "future" ops only while we're positioned on a prefix of it
      const live = new Set(ops.map(o => o.id));
      const isPrefix = ops.every(o => timeline.some(t => t.id === o.id));
      if (!isPrefix || !timeline.length || timeline.every(t => live.has(t.id))) timeline = ops.slice();
      if (!changes.some(c => c.changeId === selected)) selected = wcId; // never act on a hidden change
      if (disposed) return;
      renderGraph(animate);
      renderOps();
      await renderEditor();
      $('.jj-wc').textContent = `@ ${short(wcId)}`;
    }

    /** Run a library call, then redraw and narrate what moved. */
    async function act(call: string, fn: () => Promise<unknown>, note: string | (() => string) = '') {
      errBox.hidden = true;
      const before = new Map(changes.map(c => [c.changeId, c.commitId]));
      const beforeWc = wcId;
      await fn();
      await refresh();
      const kept: string[] = [], made: string[] = [], gone: string[] = [];
      for (const c of changes) {
        const b = before.get(c.changeId);
        if (b === undefined) made.push(short(c.changeId));
        else if (b !== c.commitId) kept.push(`<span class="k-id">${short(c.changeId)}</span> kept its change ID; commit <s>${short(b, 7)}</s> → <span class="k-cid">${short(c.commitId, 7)}</span>`);
      }
      for (const id of before.keys()) if (!changes.some(c => c.changeId === id)) gone.push(short(id));
      const bits = [
        typeof note === 'function' ? note() : note,
        ...kept,
        made.length ? `new change${made.length > 1 ? 's' : ''}: <span class="k-id">${made.join(', ')}</span>` : '',
        gone.length ? `hidden: ${gone.join(', ')}` : '',
        beforeWc && beforeWc !== wcId ? `@ moved ${short(beforeWc)} → <span class="k-id">${short(wcId)}</span>` : '',
      ].filter(Boolean);
      said(call, bits.join('<br>'));
    }

    /* ---------------- graph ---------------- */
    const ROW = 64, LANE = 24, TOP = 34, LEFT = 22;
    function layout() {
      const vis = new Map(changes.map(c => [c.changeId, c]));
      // parents resolved through hidden (abandoned) changes to the nearest visible ancestor
      const vparents = (c: Change): { id: string; via: boolean }[] => {
        const out: { id: string; via: boolean }[] = [];
        for (const p of c.parents || []) {
          let cur = p, via = false, guard = 0;
          while (cur && !vis.has(cur) && guard++ < 50) { via = true; cur = all.get(cur)?.parents?.[0] ?? ''; }
          if (cur && vis.has(cur)) out.push({ id: cur, via });
        }
        return out;
      };
      const P = new Map(changes.map(c => [c.changeId, vparents(c)]));
      const kids = new Map<string, number>(changes.map(c => [c.changeId, 0]));
      for (const ps of P.values()) for (const p of ps) kids.set(p.id, (kids.get(p.id) || 0) + 1);
      // Kahn from heads, newest first → children always above parents
      const ready = changes.filter(c => kids.get(c.changeId) === 0);
      const order: Change[] = [];
      const byTime = (a: Change, b: Change) => (b.changeId === wcId ? 1 : 0) - (a.changeId === wcId ? 1 : 0) || +new Date(b.timestamp) - +new Date(a.timestamp);
      while (ready.length) {
        ready.sort(byTime);
        const c = ready.shift()!;
        order.push(c);
        for (const p of P.get(c.changeId) || []) { const k = (kids.get(p.id) || 0) - 1; kids.set(p.id, k); if (k === 0) ready.push(vis.get(p.id)!); }
      }
      // lanes
      const lanes: (string | null)[] = [];
      const lane = new Map<string, number>();
      for (const c of order) {
        let i = lanes.indexOf(c.changeId);
        if (i < 0) { i = lanes.indexOf(null); if (i < 0) { lanes.push(null); i = lanes.length - 1; } }
        for (let j = 0; j < lanes.length; j++) if (j !== i && lanes[j] === c.changeId) lanes[j] = null;
        lane.set(c.changeId, i);
        const ps = P.get(c.changeId) || [];
        lanes[i] = ps[0]?.id ?? null;
        for (const p of ps.slice(1)) if (!lanes.includes(p.id)) { const f = lanes.indexOf(null); if (f < 0) lanes.push(p.id); else lanes[f] = p.id; }
      }
      const nLanes = Math.max(1, ...[...lane.values()].map(v => v + 1));
      return { order, lane, P, nLanes };
    }

    function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVGNS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent?.appendChild(e);
      return e;
    }

    let lastAnimAt = -1e9;
    function renderGraph(animate: boolean) {
      cancelAnimationFrame(raf);
      if (animate) lastAnimAt = performance.now();
      const { order, lane, P, nLanes } = layout();
      const W = Math.max(260, svg.parentElement!.clientWidth - 2);
      const textX = LEFT + nLanes * LANE + 8;
      const cardW = W - textX - 10;
      const H = TOP + Math.max(0, order.length - 1) * ROW + 38;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('width', String(W));
      svg.setAttribute('height', String(H));
      svg.replaceChildren();
      const edgesG = el('g', { class: 'edges' }, svg);
      const nodesG = el('g', { class: 'nodes' }, svg);

      const target = new Map<string, { cx: number; cy: number; ty: number }>();
      order.forEach((c, row) => target.set(c.changeId, { cx: LEFT + lane.get(c.changeId)! * LANE + 6, cy: TOP + row * ROW, ty: TOP + row * ROW }));

      const conflictPaths = new Set(conflicts.map(c => c.path));
      const maxChars = Math.max(10, Math.floor((cardW - 20) / 7.2));
      type Live = { id: string; g: SVGGElement; dot: SVGGElement; from: { cx: number; cy: number; ty: number }; to: { cx: number; cy: number; ty: number } };
      const live: Live[] = [];
      const edges: { from: string; to: string; path: SVGPathElement }[] = [];

      for (const c of order) {
        for (const p of P.get(c.changeId) || []) edges.push({ from: c.changeId, to: p.id, path: el('path', { class: 'edge' + (p.via ? ' via' : '') }, edgesG) });
      }

      for (const c of order) {
        const id = c.changeId;
        const t = target.get(id)!;
        const prev = prevPos.get(id);
        const isWc = id === wcId;
        const conflicted = hasMarkers(c) || (isWc && userFiles(c.fileSnapshot).some(f => conflictPaths.has(f)));
        const rewritten = !!prev && prev.commitId !== c.commitId;
        const reworded = !!prev && prev.desc !== c.description;

        const dot = el('g', { class: 'dot' + (isWc ? ' wc' : '') + (conflicted ? ' cf' : '') }, nodesG);
        if (isWc) { el('circle', { r: 11, class: 'halo' }, dot); el('circle', { r: 9 }, dot); el('text', { class: 'at', 'text-anchor': 'middle', y: 4 }, dot).textContent = '@'; }
        else el('circle', { r: 6 }, dot);

        const g = el('g', { class: ['card', isWc && 'wc', id === selected && 'sel', conflicted && 'cf', c.abandoned && 'abandoned', rewritten && 'rewritten', !prev && animate && prevPos.size ? 'enter' : ''].filter(Boolean).join(' '), 'data-id': id, tabindex: 0, role: 'button' }, nodesG);
        el('rect', { x: textX, y: -24, width: cardW, height: 48, rx: 9, class: 'bg' }, g);
        const idT = el('text', { x: textX + 12, y: -5, class: 'cid-change' + (rewritten ? ' stable' : '') }, g);
        idT.innerHTML = `<tspan class="pre">${esc(id.slice(0, 4))}</tspan><tspan class="rest">${esc(id.slice(4, 12))}</tspan>`;
        const cx = textX + 12 + 12 * 7.8 + 14;
        if (rewritten) {
          el('text', { x: cx, y: -5, class: 'cid-commit old' }, g).textContent = short(prev!.commitId, 7);
          el('text', { x: cx, y: -5, class: 'cid-commit new' }, g).textContent = short(c.commitId, 7);
        } else el('text', { x: cx, y: -5, class: 'cid-commit' }, g).textContent = short(c.commitId, 7);
        const nf = userFiles(c.fileSnapshot).length;
        const right = el('text', { x: textX + cardW - 10, y: -5, class: 'meta' + (rewritten ? ' under-tag' : ''), 'text-anchor': 'end' }, g);
        right.textContent = c.abandoned ? 'abandoned' : cardW < 330 ? (conflicted ? '⚠' : '') : `${conflicted ? '⚠ conflict · ' : ''}${nf} file${nf === 1 ? '' : 's'}`;
        let d = firstLine(c.description);
        if (d.length > maxChars) d = d.slice(0, maxChars - 1) + '…';
        el('text', { x: textX + 12, y: 14, class: 'desc' + (reworded ? ' reworded' : '') + (c.description ? '' : ' empty') }, g).textContent = d;
        if (rewritten) {
          const tag = el('g', { class: 'rw-tag' }, g);
          const label = cardW > 380 ? 'new commit · same change' : 'same change ✓';
          const tw = label.length * 6.4 + 16;
          el('rect', { x: textX + cardW - tw - 8, y: -18, width: tw, height: 17, rx: 8.5 }, tag);
          el('text', { x: textX + cardW - 8 - tw / 2, y: -6, 'text-anchor': 'middle' }, tag).textContent = label;
        }
        const from = prev ? { cx: prev.cx, cy: prev.cy, ty: prev.ty } : { cx: t.cx, cy: t.cy - (animate && prevPos.size ? 18 : 0), ty: t.ty - (animate && prevPos.size ? 18 : 0) };
        live.push({ id, g, dot, from, to: t });
      }

      // ghosts for changes that disappeared (abandoned / squashed away)
      if (animate) for (const [id, p] of prevPos) {
        if (target.has(id)) continue;
        const g = el('g', { class: 'card ghost', transform: `translate(0 ${p.ty})` }, nodesG);
        el('rect', { x: textX, y: -24, width: cardW, height: 48, rx: 9, class: 'bg' }, g);
        el('text', { x: textX + 12, y: -5, class: 'cid-change' }, g).textContent = short(id, 12);
        el('text', { x: textX + 12, y: 14, class: 'desc' }, g).textContent = all.get(id)?.abandoned ? 'abandoned' : 'hidden';
        timers.push(window.setTimeout(() => g.remove(), 900));
      }

      const pos = new Map<string, { cx: number; cy: number; ty: number }>();
      const draw = (k: number) => {
        for (const n of live) {
          const p = { cx: n.from.cx + (n.to.cx - n.from.cx) * k, cy: n.from.cy + (n.to.cy - n.from.cy) * k, ty: n.from.ty + (n.to.ty - n.from.ty) * k };
          pos.set(n.id, p);
          n.g.setAttribute('transform', `translate(0 ${p.ty.toFixed(1)})`);
          n.dot.setAttribute('transform', `translate(${p.cx.toFixed(1)} ${p.cy.toFixed(1)})`);
        }
        for (const e of edges) {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) continue;
          const my = (a.cy + b.cy) / 2;
          e.path.setAttribute('d', a.cx === b.cx ? `M${a.cx} ${a.cy}L${b.cx} ${b.cy}` : `M${a.cx} ${a.cy}C${a.cx} ${my} ${b.cx} ${my} ${b.cx} ${b.cy}`);
        }
      };
      const moving = animate && live.some(n => n.from.cx !== n.to.cx || n.from.ty !== n.to.ty);
      if (moving) {
        const t0 = performance.now(), D = 620;
        const stepF = (t: number) => { const k = Math.min(1, (t - t0) / D); draw(ease(k)); if (k < 1 && !disposed) raf = requestAnimationFrame(stepF); };
        draw(0); raf = requestAnimationFrame(stepF);
      } else draw(1);

      prevPos = new Map(order.map(c => { const t = target.get(c.changeId)!; return [c.changeId, { ...t, commitId: c.commitId, desc: c.description }]; }));
      root.classList.toggle('picking', picking);
    }

    svg.addEventListener('click', e => {
      const card = (e.target as Element).closest('.card[data-id]') as SVGGElement | null;
      if (!card) return;
      const id = card.dataset.id!;
      if (picking) { picking = false; $('.jj-pick').hidden = true; void doRebase(selected, id); return; }
      selected = id; renderGraph(false);
    });
    svg.addEventListener('keydown', e => { if (e.key === 'Enter') (e.target as Element).closest('.card')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    /* ---------------- actions ---------------- */
    const sel = () => all.get(selected) ?? all.get(wcId)!;
    const parentChange = (c: Change) => c.parents?.[0];

    async function doNew(on: string) {
      await enqueue(() => act(`jj.new({ parents: ['${short(on)}'] })`, async () => {
        await jj.new({ parents: [on] });
        selected = '';
      }, 'A fresh, empty change on top. It already has a change ID; its commit ID will track whatever you type.'));
    }
    async function doDescribe(id: string, message: string) {
      await enqueue(() => act(`jj.describe({ revision: '${short(id)}', message: ${JSON.stringify(message)} })`,
        () => jj.describe({ revision: id, message }),
        'The message is part of the commit, so the commit ID is recomputed. The change ID is not.'));
    }
    async function doEdit(id: string) {
      await enqueue(() => act(`jj.edit({ changeId: '${short(id)}' })`, async () => {
        await jj.edit({ changeId: id });
      }, 'You are now editing an older change in place. Anything you type amends it directly.'));
    }
    async function doSquash(id: string) {
      const c = all.get(id); const p = c && parentChange(c);
      if (!p) { showErr(new Error('That change has no parent to squash into.')); return; }
      await enqueue(() => act(`jj.squash({ source: '${short(id)}', dest: '${short(p)}' })`,
        () => jj.squash({ source: id, dest: p }),
        'The source change\'s diff is folded into its parent and the source is hidden; its description is appended to the parent. Squashing @ leaves a fresh, empty @ on top.'));
    }
    async function doAbandon(id: string) {
      const c = all.get(id); if (!c) return;
      const p = parentChange(c);
      const children = changes.filter(k => k.parents?.includes(id)).length;
      const isWc = id === wcId;
      if (!p) { showErr(new Error('Cannot abandon the root change.')); return; }
      await enqueue(() => act(`jj.abandon({ changeId: '${short(id)}' })`, () => jj.abandon({ changeId: id }),
        `The change is hidden, not deleted: the operation log still knows it, so you can undo this.${children ? ` Its ${children === 1 ? 'child was' : `${children} children were`} re-parented onto its parent, as <code>jj abandon</code> does.` : ''}${isWc ? ' It was @, so abandon() itself started a fresh, empty @ on its parent (recorded as a second <code>new</code> operation).' : ''}`));
    }
    async function doRebase(id: string, onto: string) {
      if (id === onto || !all.get(id)) return;
      let found: Conflict[] = [];
      await enqueue(() => act(`jj.rebase({ changeId: '${short(id)}', newParent: '${short(onto)}' })`, async () => {
        const r = await jj.rebase({ changeId: id, newParent: onto });
        found = r?.conflicts?.length ? (await jj.conflicts.list()).filter((cf: Conflict) => !cf.resolved) : [];
        // rebase() itself writes the conflict markers into the change (and into @'s file on disk).
        if (found.length && id === wcId) openFile = found[0].path;
      }, () => found.length
        ? `<span class="k-cf">${found.length} conflict${found.length > 1 ? 's' : ''} recorded as data</span>: rebase() ran a three-way merge against the new parent, found the collision, stored base, ours and theirs, and wrote conflict markers into the change instead of stopping. Resolve whenever you like.`
        : 'Same change, new parent. Its commit ID changes because a commit hashes its parents.'));
    }
    async function doResolve(cf: Conflict, how: { strategy?: string; resolution?: string }) {
      await enqueue(() => act(`jj.conflicts.resolve({ conflictId: '${cf.conflictId.slice(0, 17)}…', ${how.strategy ? `strategy: '${how.strategy}'` : 'resolution: <editor text>'} })`,
        () => jj.conflicts.resolve({ conflictId: cf.conflictId, ...how }),
        'Resolution is just another edit to @: the change ID stays, the commit ID moves on. It is an operation too, so undo() brings the conflict back.'));
    }
    async function doUndo() {
      await enqueue(() => act('jj.undo()', () => jj.undo(), () => 'Undo reverts the last operation: graph edges, descriptions, abandoned flags, file contents and conflicts. Press it again to step further back; undo itself is just another operation in the log.'
        + (all.get(wcId)?.abandoned ? ' <span class="k-cf">@ is on an abandoned change:</span> abandoning @ was recorded as two operations (abandon, then the new @), and this undo reverted only the second. Undo once more to bring the change back.' : '')));
    }
    async function doRedo() {
      await enqueue(() => act('jj.redo()', () => jj.redo(), 'Redo re-applies what the last undo reverted.'));
    }
    const opName = (id: string) => esc((timeline.find(o => o.id === id)?.description ?? id).replace(/\b([0-9a-f]{16,})\b/g, m => m.slice(0, 8)));
    /**
     * Rewind (or jump forward) with jj.operations.restore(), then check the result against what the
     * planet recorded right after that operation. If 1.11.0 lands somewhere else (see the note on the
     * page for the two known cases), swap in the whole-disk checkpoint instead and say so.
     */
    async function travel(opId: string) {
      const live = new Set(ops.map(o => o.id));
      // After a fallback, the later operations exist only as checkpoints. A restore() would append to
      // the library's log and drop them, so keep travelling by checkpoint until the next real command.
      const onCheckpoint = timeline.some(o => !live.has(o.id));
      const inLog = live.has(opId) && !onCheckpoint;
      let note = '';
      await enqueue(() => act(inLog ? `jj.operations.restore({ operation: '${short(opId)}' })` : `checkpoint → operation ${short(opId)}`, async () => {
        const want = expected.get(opId);
        if (inLog) {
          await jj.operations.restore({ operation: opId });
          const off = want ? fpDiff(want, await fingerprint()) : [];
          if (!off.length) {
            note = `Graph, descriptions, commit IDs, working files and conflicts are back as they were right after <b>${opName(opId)}</b>${want ? ' (checked against what the planet saw then)' : ''}. The restore is itself a new operation at the top of the log, so it can be undone, and every later operation stays listed: click one to jump forward.`;
            return;
          }
          note = `<span class="k-cf">operations.restore() landed off</span>: ${off.slice(0, 4).join('; ')}${off.length > 4 ? ` (+${off.length - 4} more)` : ''}. The planet swapped in its whole-disk checkpoint for that operation instead (a known 1.11.0 gap, see the note below).`;
        } else note = `Back as it was right after <b>${opName(opId)}</b>, by checkpoint: an earlier rewind fell back to one, so the later operations exist only as checkpoints, not in the library's log. A <code>restore()</code> would append to the log and drop them, so the planet travels by checkpoint until you run a command.`;
        const snap = checkpoints.get(opId);
        if (!snap) throw new Error('No checkpoint recorded for that operation.');
        await mountFS(snap);
        jj = await lib.createJJ({ fs, dir: DIR, git: lib.git, autoSnapshot: false });
      }, () => note));
    }

    $('.jj-bar').addEventListener('click', e => {
      const b = (e.target as Element).closest('button[data-a]') as HTMLButtonElement | null;
      if (!b) return;
      const c = sel();
      if (!c) return;
      switch (b.dataset.a) {
        case 'new': void doNew(c.changeId); break;
        case 'describe': {
          const f = $<HTMLFormElement>('.jj-describe'); f.hidden = false;
          const i = f.querySelector('input')!; i.value = c.description || ''; i.focus(); i.select(); break;
        }
        case 'edit': void doEdit(c.changeId); break;
        case 'squash': void doSquash(c.changeId); break;
        case 'rebase': picking = true; $('.jj-pick').hidden = false; $('.jj-pick-src').textContent = short(c.changeId); root.classList.add('picking'); break;
        case 'abandon': void doAbandon(c.changeId); break;
        case 'undo': void doUndo(); break;
        case 'redo': void doRedo(); break;
      }
    });
    $('.jj-describe').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.currentTarget as HTMLFormElement; f.hidden = true;
      void doDescribe(sel().changeId, f.querySelector('input')!.value.trim() || '(no description set)');
    });
    root.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => {
      ($('.jj-describe') as HTMLElement).hidden = true; ($('.jj-pick') as HTMLElement).hidden = true; picking = false; root.classList.remove('picking');
    }));

    /* ---------------- op log ---------------- */
    const opsEl = $('.jj-ops');
    function renderOps() {
      const live = new Set(ops.map(o => o.id));
      $('.jj-opcount').textContent = `${ops.length} op${ops.length === 1 ? '' : 's'}`;
      // the op whose state we're in: the head, or the target of a head "restore to operation <id>"
      const target = /^restore to operation ([0-9a-f]+)/.exec(ops[0]?.description ?? '')?.[1];
      const hereIdx = Math.max(0, timeline.findIndex(o => o.id === (target ?? ops[0]?.id)));
      opsEl.innerHTML = timeline.map((o, i) => {
        const future = !live.has(o.id);
        const head = o.id === ops[0]?.id;
        const here = i === hereIdx && !head;
        const cls = ['op', future && 'future', head && 'head', here && 'here', !head && i < hereIdx && 'ahead', o.id === selectedOp && 'open'].filter(Boolean).join(' ');
        const wc = o.view?.workingCopy ? `@ ${short(o.view.workingCopy)}` : '';
        const btn = head
          ? `<button class="btn" data-undo>jj.undo()</button>`
          : `<button class="btn primary" data-travel>${i < hereIdx ? '⟳ jump forward here' : here ? '⟲ restore again' : '⟲ rewind to here'}</button>`;
        return `<li class="${cls}" data-op="${o.id}" style="--i:${i}">
          <span class="g">${opGlyph(o.description)}</span>
          <div class="b"><b>${esc(o.description.replace(/\b([0-9a-f]{16,})\b/g, m => m.slice(0, 8)))}</b>
          <small>${short(o.id)} · ${wc} · <time data-ts="${esc(o.timestamp)}">${ago(o.timestamp)}</time>${head ? ' · <em>head</em>' : ''}${here ? ' · <em>you are here</em>' : ''}${future ? ' · <em>checkpoint only</em>' : ''}</small>
          <div class="acts">${btn}</div></div></li>`;
      }).join('');
    }
    opsEl.addEventListener('click', e => {
      const li = (e.target as Element).closest('li[data-op]') as HTMLElement | null;
      if (!li) return;
      const id = li.dataset.op!;
      if ((e.target as Element).closest('[data-travel]')) { selectedOp = ''; void travel(id); return; }
      if ((e.target as Element).closest('[data-undo]')) { selectedOp = ''; void doUndo(); return; }
      selectedOp = selectedOp === id ? '' : id; renderOps();
    });
    timers.push(window.setInterval(() => opsEl.querySelectorAll('time[data-ts]').forEach(t => { t.textContent = ago((t as HTMLElement).dataset.ts!); }), 5000));

    /* ---------------- editor ---------------- */
    const tabsEl = $('.jj-tabs');
    const cfEl = $('.jj-conflict');
    async function renderEditor() {
      const files = await diskFiles();
      const visible = files.filter(f => f !== '.gitignore');
      if (!visible.includes(openFile)) openFile = visible[0] ?? '';
      const cfPaths = new Set(conflicts.map(c => c.path));
      tabsEl.innerHTML = visible.map(f => `<button class="tab${f === openFile ? ' on' : ''}${cfPaths.has(f) ? ' cf' : ''}" data-f="${esc(f)}">${esc(f)}</button>`).join('');
      if (!(document.activeElement === editor && dirty)) {
        editor.value = openFile ? await fs.promises.readFile(`${DIR}/${openFile}`, 'utf8').catch(() => '') as string : '';
        dirty = false;
      }
      editor.disabled = !openFile;
      const cf = conflicts.find(c => c.path === openFile);
      cfEl.hidden = !cf;
      if (cf) {
        cfEl.innerHTML = `<div class="cf-head"><b>⚠ Conflict recorded as data</b><span class="stat">${esc(cf.type)} · ${esc(cf.conflictId.slice(0, 20))}…</span></div>
          <div class="cf-sides">
            <div><span>base</span><pre>${esc(cf.sides.base || '∅')}</pre></div>
            <div><span>ours (@)</span><pre>${esc(cf.sides.left || '∅')}</pre></div>
            <div><span>theirs</span><pre>${esc(cf.sides.right || '∅')}</pre></div>
          </div>
          <div class="cf-acts"><button class="btn" data-s="ours">take ours</button><button class="btn" data-s="theirs">take theirs</button><button class="btn" data-s="union">union</button><button class="btn primary" data-s="editor">use editor text</button></div>`;
        cfEl.querySelectorAll('button[data-s]').forEach(b => b.addEventListener('click', () => {
          const s = (b as HTMLElement).dataset.s!;
          void doResolve(cf, s === 'editor' ? { resolution: editor.value } : { strategy: s });
        }));
      }
    }
    tabsEl.addEventListener('click', e => {
      const b = (e.target as Element).closest('button[data-f]') as HTMLElement | null;
      if (!b) return;
      openFile = b.dataset.f!; dirty = false; void renderEditor();
    });
    let typeT = 0;
    editor.addEventListener('input', () => {
      dirty = true;
      clearTimeout(typeT);
      const path = openFile, data = editor.value;
      typeT = window.setTimeout(() => {
        void enqueue(async () => {
          const oldCommit = all.get(wcId)?.commitId ?? '';
          await editFile(path, data);
          if (editor.value === data) dirty = false;
          await refresh();
          const nowCommit = all.get(wcId)?.commitId ?? '';
          said(`jj.write({ path: '${path}' }) → jj.snapshot()`, oldCommit !== nowCommit
            ? `Snapshotted into @: <span class="k-id">${short(wcId)}</span> kept its change ID; commit <s>${short(oldCommit, 7)}</s> → <span class="k-cid">${short(nowCommit, 7)}</span>`
            : 'Snapshotted into @.');
        });
      }, 450);
    });
    $('.jj-addfile').addEventListener('submit', e => {
      e.preventDefault();
      const i = (e.currentTarget as HTMLFormElement).querySelector('input')!;
      const name = i.value.trim().replace(/^\/+/, '');
      if (!name || /(^|\/)\.(git|jj)(\/|$)/.test(name)) return;
      i.value = '';
      void enqueue(() => act(`jj.write({ path: '${name}' }) → jj.snapshot()`, async () => { await editFile(name, ''); openFile = name; }, 'New files are tracked automatically by the snapshot: there is no <code>add</code>.'));
    });

    /* ---------------- scenarios & tour ---------------- */
    const scenEl = $('.jj-scen');
    scenEl.innerHTML = Object.entries(SCENARIOS).map(([k, v]) => `<button class="btn${k === st.s ? ' primary' : ''}" data-s="${k}" role="tab">${esc(v.label)}</button>`).join('');
    scenEl.addEventListener('click', e => {
      const b = (e.target as Element).closest('button[data-s]') as HTMLElement | null;
      if (!b || b.dataset.s === st.s) return;
      st.s = b.dataset.s!;
      writeState(st, defaults);
      scenEl.querySelectorAll('button').forEach(x => x.classList.toggle('primary', (x as HTMLElement).dataset.s === st.s));
      void enqueue(() => build(st.s));
    });
    $('.jj-link').addEventListener('click', async e => {
      const b = e.currentTarget as HTMLButtonElement; await copyLink(); b.textContent = 'copied ✓'; timers.push(window.setTimeout(() => { b.textContent = 'copy link'; }, 1400));
    });

    const idOf = (desc: string) => changes.find(c => firstLine(c.description) === desc)?.changeId ?? '';

    function renderTour() {
      const s = steps[stepIdx];
      $('.jj-tour-title').textContent = s ? `Step ${stepIdx + 1}/${steps.length} · ${s.title}` : steps.length ? 'Tour complete' : 'Freeform';
      $('.jj-tour-body').innerHTML = s ? s.text : 'Now drive it yourself: select a change, use the buttons, type in the editor, or rewind from the operation log.';
      $('.jj-dots').innerHTML = steps.map((_, i) => `<i class="${i < stepIdx ? 'done' : i === stepIdx ? 'cur' : ''}"></i>`).join('');
      const nb = $<HTMLButtonElement>('.jj-next');
      nb.disabled = !s; nb.textContent = s ? 'Run step ▶' : 'Done ✓'; nb.hidden = !steps.length;
    }
    $('.jj-next').addEventListener('click', () => {
      const s = steps[stepIdx];
      if (!s) return;
      stepIdx++; renderTour();
      void s.run().catch(showErr);
    });

    /** Build a scenario op by op, redrawing after each so the graph grows on screen. */
    async function build(name: string) {
      errBox.hidden = true;
      await fresh();
      const beat = async () => { if (disposed) return; await refresh(); await wait(170); };
      // record what every op left behind, so a rewind to any of them can be checked
      const W = async (path: string, data: string) => { await editFile(path, data); await recordHead(); };
      const D = async (message: string) => { await jj.describe({ message }); await beat(); };
      const N = async (a: object) => { await jj.new(a); await recordHead(); };
      if (name === 'conflict') {
        await W('theme.css', ':root {\n  --accent: blue;\n  --radius: 8px;\n}\n');
        await W('README.md', '# Theme\n');
        await D('theme: base palette');
        const base = wcId;
        await N({ parents: [base] });
        await W('theme.css', ':root {\n  --accent: crimson;\n  --radius: 8px;\n}\n');
        await D('theme: make accent crimson');
        const red = wcId;
        await N({ parents: [base] });
        await W('theme.css', ':root {\n  --accent: seagreen;\n  --radius: 8px;\n}\n');
        await D('theme: make accent seagreen');
        const green = wcId;
        openFile = 'theme.css';
        steps = [
          { title: 'Two divergent edits', text: 'Both children changed <code>--accent</code> from <code>blue</code>. They are siblings, so nothing collides yet. Select <b>seagreen</b> (it is @) and rebase it onto <b>crimson</b>.', run: async () => { selected = green; await doRebase(green, red); } },
          { title: 'Resolve whenever you like', text: 'The conflict is now data on the change: base, ours and theirs are stored and markers sit in <code>theme.css</code>. The change still has a commit ID. Resolve it with a hand-written merge.', run: async () => {
            const cf = conflicts[0]; if (!cf) return;
            editor.value = ':root {\n  --accent: goldenrod; /* crimson + seagreen, negotiated */\n  --radius: 8px;\n}\n';
            await doResolve(cf, { resolution: editor.value });
          } },
          { title: 'Rewind past the conflict', text: 'Change your mind? Rewind the whole repo to before the rebase from the operation log; the siblings reappear side by side.', run: async () => {
            const target = timeline.find(o => o.description.startsWith('describe') && o.description.includes(short(green)));
            if (target) await travel(target.id);
          } },
        ];
      } else if (name === 'blank') {
        await W('notes.md', '# Notes\n\nStart typing. Every pause is snapshotted into @.\n');
        await D('start notes');
        openFile = 'notes.md';
        steps = [];
      } else {
        await W('README.md', '# hello-jj\n\nA tiny site.\n');
        await D('scaffold: readme');
        await N({});
        await W('hello.js', "export const greet = (name) => `Helo, ${name}!`;\n");
        await D('feat: greeting');
        await N({});
        await W('style.css', 'body {\n  color: navy;\n  font-family: system-ui;\n}\n');
        await D('style: colors');
        await N({});
        await W('style.css', 'body {\n  color: navy;\n  font-family: system-ui;\n}\nh1 { letter-spacing: -.02em; }\n');
        await beat();
        const tip = wcId, readme = idOf('scaffold: readme'), greet = idOf('feat: greeting');
        openFile = 'style.css';
        steps = [
          { title: 'Reword an old change', text: 'Rename <b>scaffold: readme</b>. Watch its commit ID flip while the change ID stays put.', run: async () => { selected = readme; await doDescribe(readme, 'docs: project readme'); } },
          { title: 'Go back and fix a typo', text: '<code>hello.js</code> says <em>Helo</em>. <code>jj edit</code> the greeting change and fix it in place; no stash, no interactive rebase.', run: async () => {
            const id = greet; selected = id; openFile = 'hello.js'; await doEdit(id);
            await enqueue(async () => { const before = all.get(id)?.commitId ?? ''; await editFile('hello.js', "export const greet = (name) => `Hello, ${name}!`;\n"); await refresh(); said("jj.write({ path: 'hello.js' }) → jj.snapshot()", `Amended in place: <span class="k-id">${short(id)}</span> kept its change ID; commit <s>${short(before, 7)}</s> → <span class="k-cid">${short(all.get(id)?.commitId ?? '', 7)}</span>`); });
          } },
          { title: 'Return to the tip', text: 'Jump back to the change you were working on. Your uncommitted-looking work was never at risk: it was a commit all along.', run: async () => { selected = tip; openFile = 'style.css'; await doEdit(tip); } },
          { title: 'Squash the tip into its parent', text: 'Fold the unnamed tip into <b>style: colors</b>. The tip is hidden and a fresh @ appears on top, holding what is still in your working directory.', run: async () => { selected = tip; await doSquash(tip); } },
          { title: 'Rewind everything', text: 'Rewind the whole repo to before the reword: every change, message and file snaps back. The later operations stay listed so you can jump forward again.', run: async () => {
            const t = timeline.find(o => o.description.startsWith('describe') && o.description.includes(short(readme)));
            const target = t ? timeline[timeline.indexOf(t) + 1] : undefined;
            if (target) await travel(target.id);
          } },
        ];
      }
      stepIdx = 0;
      selected = wcId;
      await refresh();
      renderTour();
      said(`createJJ({ fs, dir: '${DIR}', git }) → jj.git.init() → ${name === 'blank' ? 'write + describe' : 'write / describe / new …'}`, esc(SCENARIOS[name].blurb));
    }

    /* ---------------- boot ---------------- */
    try {
      lib = await loadLib();
      const caps = lib.browser.detectCapabilities();
      $('.jj-caps').textContent = `fs: createBrowserFS({ fs: LightningFS + MemoryBackend }) · git backend: isomorphic-git · IndexedDB ${caps.indexedDB ? 'available' : 'n/a'}`;
      $('.jj-honest').innerHTML = 'What this planet still patches around in isomorphic-jj 1.11.0: <b>two things.</b> '
        + '<b>1. A rewind fallback.</b> Rewinding and jumping forward use <code>operations.restore()</code>, and every landing is checked against the state the planet recorded right after that operation. Two cases still land off, and for those (only those) the planet swaps in a whole-disk checkpoint and says so: '
        + 'typing into an older change you <code>edit()</code>ed rebases its descendants (new in 1.11.0), but that rebase is not recorded in the operation, so restore() and undo() to before it leave the descendants with the new content and commit IDs (the stack tour\'s last step hits this); '
        + 'and restoring <em>forward</em> to a <code>conflicts.resolve()</code> brings the resolved file back but leaves the conflict marked unresolved (undo/redo of a resolve are fine). '
        + '<b>2. Stranded tips.</b> 1.10.0\'s orphan filter hides every undescribed change that is not an ancestor of @, so an unnamed tip with real work vanishes from <code>log()</code> as soon as you <code>edit()</code> an older change (and <code>edit()</code> records only its target in <code>view.heads</code>). jj keeps such a tip as a head, so the planet keeps drawing it. '
        + '<b>Two settings, not patches:</b> edits go through <code>write()</code> then <code>snapshot()</code> rather than straight to disk (a <code>snapshot()</code> of a file changed behind jj\'s back has no before-image, so restoring to the operation before it would keep the file), and the repo is created with <code>autoSnapshot: false</code> (on LightningFS, the files <code>edit()</code> checks out look modified, so the next <code>status()</code> would silently re-snapshot @ and rebase its descendants to new commit IDs, recorded in no operation). '
        + 'No longer patched (fixed in 1.10/1.11): the log hides undo leftovers itself; rebase() writes conflict markers; write(), snapshot() and resolve() are operations; editing an older change rebases its descendants.';
      await enqueue(() => build(st.s));
    } catch (e) { showErr(e); }

    let lastW = 0, roT = 0;
    const ro = new ResizeObserver(() => {
      const w = svg.parentElement!.clientWidth;
      if (!changes.length || Math.abs(w - lastW) < 4) return;
      lastW = w;
      // wait for any rewrite animation to finish before redrawing at the new width
      clearTimeout(roT);
      roT = window.setTimeout(() => { void chain.then(() => { if (!disposed) renderGraph(false); }); }, Math.max(200, lastAnimAt + 2900 - performance.now()));
    });
    ro.observe(svg.parentElement!);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      timers.forEach(t => { clearTimeout(t); clearInterval(t); });
      clearTimeout(typeT); clearTimeout(roT);
      ro.disconnect();
    };
  },
};
export default playground;
