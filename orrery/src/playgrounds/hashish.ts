import type { Playground } from '../registry';
import { Hashish, estimateSimilarity, type DocumentId, type StorageAdapter, type HashishExport } from '@johnhenry/hashish';
import { mapConcurrentAsync } from '@johnhenry/iteration';
import { receive, handoffBanner, sendToTab, onTabHandoff } from '../bus';
import { readState, writeState, copyLink } from '../state';
import './hashish.css';

/** Payload sent by Spintax Forge's "Send 200 variants to Hashish" button. */
interface SpintaxVariants { template: string; variants: string[]; total: number | null; stride: number; pulled: number }
/** Payload sent by Chunker Scope's "Send chunks to Hashish" button — a dedupe pipeline. */
interface ChunkerChunksDedupe { chunks: string[] }

// ---------------------------------------------------------------------------
// A real StorageAdapter (the same 8-method interface RedisStorage and
// MemoryStorage implement) backed by IndexedDB, so a Hashish index can be
// shared between browser tabs on this origin instead of living only in one
// tab's memory. `kv` holds documents/signatures; `buckets` holds the LSH
// bucket -> DocumentId[] lists addToBucket/removeFromBucket/getBucket manage.
// ---------------------------------------------------------------------------
class IndexedDBStorage implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;
  constructor(private readonly dbName: string) {}

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          if (!db.objectStoreNames.contains('buckets')) db.createObjectStore('buckets');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private async run<T>(storeName: 'kv' | 'buckets', mode: IDBTransactionMode, fn: (os: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = fn(tx.objectStore(storeName));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const v = await this.run<T>('kv', 'readonly', (os) => os.get(key) as IDBRequest<T>);
    return v ?? undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    await this.run('kv', 'readwrite', (os) => os.put(value, key));
  }
  async delete(key: string): Promise<void> {
    await this.run('kv', 'readwrite', (os) => os.delete(key));
  }
  async has(key: string): Promise<boolean> {
    const n = await this.run<number>('kv', 'readonly', (os) => os.count(key));
    return n > 0;
  }
  async addToBucket(key: string, id: DocumentId): Promise<void> {
    const cur = (await this.run<DocumentId[]>('buckets', 'readonly', (os) => os.get(key) as IDBRequest<DocumentId[]>)) ?? [];
    if (!cur.includes(id)) cur.push(id);
    await this.run('buckets', 'readwrite', (os) => os.put(cur, key));
  }
  async removeFromBucket(key: string, id: DocumentId): Promise<void> {
    const cur = (await this.run<DocumentId[]>('buckets', 'readonly', (os) => os.get(key) as IDBRequest<DocumentId[]>)) ?? [];
    await this.run('buckets', 'readwrite', (os) => os.put(cur.filter((x) => x !== id), key));
  }
  async getBucket(key: string): Promise<DocumentId[]> {
    return (await this.run<DocumentId[]>('buckets', 'readonly', (os) => os.get(key) as IDBRequest<DocumentId[]>)) ?? [];
  }
  async clear(): Promise<void> {
    await this.run('kv', 'readwrite', (os) => os.clear());
    await this.run('buckets', 'readwrite', (os) => os.clear());
  }
}

const SHARED_DB_NAME = 'orrery-hashish-shared';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function clusterColor(i: number): string {
  return `hsl(${Math.round((i * 137.508 + 150) % 360)}, 72%, 60%)`;
}

/** Word-level highlight of what differs from a reference text (for the bucket cards). */
function diffHtml(text: string, ref: string): string {
  const refWords = new Set(ref.toLowerCase().split(/\s+/));
  return text
    .split(/(\s+)/)
    .map((w) => {
      const esc = w.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return /\S/.test(w) && !refWords.has(w.toLowerCase()) ? `<mark>${esc}</mark>` : esc;
    })
    .join('');
}

/** Deterministic across reloads so the same corpus always lands in the same buckets. */
const SEED = 133742;
const QUERY_ID = '__query__';

const PRESETS: string[] = [
  'The quick brown fox jumps over the lazy dog.',
  'The quick brown fox jumps over the lazy dog again.',
  'The quick brown fox leaps over the lazy dog.',
  'Quarterly revenue projections indicate a modest increase across all regions this fiscal year.',
  'Quarterly revenue projections indicate a modest increase across most regions this fiscal year.',
  'A recipe for sourdough bread requires flour, water, salt, and a well-fed starter culture.',
  'Photosynthesis converts sunlight, water, and carbon dioxide into glucose and oxygen in plants.',
  "The stock market experienced significant volatility following the central bank's interest rate announcement.",
  "The stock market saw significant volatility after the central bank's interest rate announcement today.",
  "Migratory birds travel thousands of miles each year, guided in part by the Earth's magnetic field.",
];

interface Doc {
  id: number;
  text: string;
  /** false if the current text is empty and so couldn't be indexed. */
  indexed: boolean;
}

function colorForValue(v: number): string {
  const h = Math.abs(Math.round(v)) % 360;
  return `hsl(${h}, 68%, 56%)`;
}

function bandPalette(bandIndex: number): string {
  const h = (bandIndex * 67) % 360;
  return `hsl(${h}, 85%, 62%)`;
}

/** Purely for the "shingles" chip display — the library does its own shingling internally. */
function displayShingles(text: string, size = 5): string[] {
  const t = text.trim();
  if (t.length < size) return t.length ? [t] : [];
  const out = new Set<string>();
  for (let i = 0; i <= t.length - size; i++) out.add(t.slice(i, i + size));
  return [...out];
}

function snippet(text: string, n = 46): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export default {
  id: 'hashish',
  title: 'Hashish Lab',
  pkg: '@johnhenry/hashish',
  hue: 150,
  blurb: 'MinHash + LSH banding finds near-duplicate text without comparing every pair.',
  docs: 'https://opensource.johnhenry.me/hashish/',

  mount(host: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'pg-hashish';
    root.innerHTML = `
      <div class="panel">
        <p style="margin:0 0 8px;color:var(--ink-2)">
          Every document below is split into overlapping 5-character <b>shingles</b>, hashed
          <span class="stat"><b id="hf-label">50</b></span> ways into a <b>MinHash signature</b>,
          then that signature is cut into <b>bands</b>. Two documents only become LSH
          <b>candidates</b> if they agree on <i>every</i> position within at least one band —
          that's what makes lookup sub-linear instead of comparing every pair. Type a query below
          to watch it happen.
        </p>
        <div class="stats-row">
          <span class="stat">docs indexed <b id="stat-count">0</b></span>
          <span class="stat">hash functions <b id="stat-hf">–</b></span>
          <span class="stat">band width <b id="stat-bw">–</b></span>
          <span class="stat">bands <b id="stat-bands">–</b></span>
          <span class="stat">last (re)index <b id="stat-time">–</b> ms</span>
          <span class="stat">near-dup groups <b id="stat-groups">–</b></span>
        </div>
      </div>






    
      <div class="grid-2">
        <div class="panel query-panel">
          <strong>Query — search the index</strong>
          <p class="hint" style="margin:4px 0 8px">Type any sentence. It is shingled, MinHashed and banded exactly like the corpus, then looked up in the index. Documents that share a bucket with it are the candidates shown below. Click <b>use as query</b> on any corpus document to try a near-duplicate.</p>
          <input class="query-box" id="query-box" placeholder="Type or paste a sentence to search the index…" spellcheck="false">
          <div class="top-matches" id="top-matches"><span class="hint">Top matches update as you type.</span></div>
          <div class="shingle-chips" id="query-shingles"></div>
        </div>
        <div class="panel">
          <strong>Index parameters</strong>
          <div class="sliders" style="margin-top:10px">
            <label class="field">
              <span class="field-row"><span>MinHash functions (signature length)</span><span class="field-val" id="hf-val">120</span></span>
              <input type="range" id="hf-slider" min="10" max="150" step="5" value="50">
            </label>
            <label class="field">
              <span class="field-row"><span>Rows per band (bucketSize)</span><span class="field-val" id="bw-val">3</span></span>
              <input type="range" id="bw-slider" min="1" max="10" step="1" value="3">
              <span style="color:var(--ink-3);font-size:11px">smaller = looser matching, more (and weaker) candidates</span>
            </label>
            <label class="field">
              <span class="field-row"><span>Indexing concurrency (mapConcurrentAsync)</span><span class="field-val" id="conc-val">4</span></span>
              <input type="range" id="conc-slider" min="1" max="16" step="1" value="4">
            </label>
            <label class="field">
              <span class="field-row"><span>Simulated storage latency per doc</span><span class="field-val" id="lat-val">20</span> ms</span>
              <input type="range" id="lat-slider" min="0" max="120" step="5" value="20">
              <span style="color:var(--ink-3);font-size:11px">stand-in for a network <code>StorageAdapter</code> (e.g. <code>RedisStorage</code>) so concurrency is visible; 0 = pure in-memory</span>
            </label>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
            <button class="btn small" id="btn-reindex">↻ re-stream index</button>
            <button class="btn small" id="btn-copy" title="Copy a link to these settings and query">🔗 copy link</button>
          </div>
        </div>
      </div>
      <div class="panel">
        <strong>Storage backend &amp; snapshot</strong>
        <p class="hint" style="margin:6px 0 10px">
          A <code>Hashish</code> index is just a config plus a <code>StorageAdapter</code> — the same 8-method interface the
          library's own <code>RedisStorage</code> implements. Switching to <b>IndexedDB</b> below hands it an adapter backed by
          the browser's IndexedDB instead of the default in-memory <code>Map</code>: open this planet in a second tab, switch both
          to IndexedDB, and they read and write the <i>same</i> index — add a document here, watch it appear there.
        </p>
        <div class="storage-row">
          <label class="storage-radio"><input type="radio" name="hh-storage" value="memory" checked> <span><b>in-memory</b> — this tab only</span></label>
          <label class="storage-radio"><input type="radio" name="hh-storage" value="shared"> <span><b>IndexedDB</b> — shared across tabs <em>(locks the MinHash function count — signatures must match)</em></span></label>
          <span class="stat" id="storage-status"></span>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
          <button class="btn small" id="btn-export" title="Downloads exportIndex() — config + every document's raw text — as JSON">⬇ export index (.json)</button>
          <button class="btn small" id="btn-import" title="Rebuilds an index from an exportIndex() snapshot via Hashish.importIndex()">⬆ import index (.json)</button>
          <input type="file" id="file-import" accept="application/json" hidden>
          <span class="stat" id="snapshot-status"></span>
        </div>
      </div>
      <div class="panel">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
          <strong>Corpus — what gets indexed</strong>
          <span>
            <button class="btn small" id="btn-add">+ add document</button>
            <button class="btn small" id="btn-reset">reset presets</button>
          </span>
        </div>
        <p class="hint" style="margin:0 0 8px">Every document is scored against the query above and shows its match rank; shared shingles are <mark>highlighted</mark>. Order never changes. Click a document to edit it.</p>
        <div class="corpus-list" id="corpus-list"></div>
      </div>
      <div class="panel">
        <strong>Signature &amp; bands</strong>
        <div id="viz-empty" class="empty-note">Type a query above to see its MinHash signature and which corpus documents share a bucket with it.</div>
        <div id="viz-body" style="display:none">
          <div class="sig-grid" id="sig-grid"></div>
          <div class="candidate-list" id="candidate-list"></div>
          <div class="dim-list" id="dim-list"></div>
        </div>
      </div>
      <div class="panel">
        <strong>Estimated vs. exact Jaccard similarity</strong>
        <div id="table-empty" class="empty-note">No query yet.</div>
        <table class="sim-table" id="sim-table" style="display:none">
          <thead><tr><th>document</th><th>LSH candidate?</th><th>estimated (signature)</th><th>exact (shingles)</th></tr></thead>
          <tbody id="sim-tbody"></tbody>
        </table>
      </div>
      <div class="panel stream-panel">
        <div class="stream-head">
          <strong>Stream indexing</strong>
          <span class="stat" id="stream-status">idle</span>
        </div>
        <p class="hint">
          Documents don't go through a blocking <code>for</code> loop: they're piped through
          <code>mapConcurrentAsync(addDocument, docs, { concurrency, ordered: false, signal })</code> from
          <code>@johnhenry/iteration</code>, so at most <b id="conc-label">4</b> <code>addDocument()</code> calls are in flight
          at once and results arrive in completion order. Each cell is one document: <span class="lg lg-q"></span> queued
          <span class="lg lg-f"></span> in flight <span class="lg lg-d"></span> indexed (tinted by near-duplicate group).
        </p>
        <div class="progress"><div class="progress-fill" id="stream-fill"></div></div>
        <div class="stream-stats">
          <span class="stat">indexed <b id="stream-done">0</b> / <b id="stream-total">0</b></span>
          <span class="stat">in flight <b id="stream-inflight">0</b></span>
          <span class="stat">peak in flight <b id="stream-peak">0</b></span>
          <span class="stat">throughput <b id="stream-rate">–</b> docs/s</span>
        </div>
        <div class="doc-cells" id="doc-cells"></div>
      </div>
      <div class="panel">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <strong>LSH buckets — who lands together</strong>
          <span class="stat" id="bucket-summary"></span> <span class="stat q-note" id="bucket-query-note"></span>
        </div>
        <p class="hint"><b>Corpus vs corpus, no query needed.</b> Each band of the signature is hashed into a bucket; documents that agree on every row of a band share that bucket.
          These are the fullest buckets (identical member sets across bands are merged). Words that differ from the bucket's first member are
          <mark>highlighted</mark>. Click a bucket to light up its members in the cell map above.</p>
        <div class="query-bands-wrap">
          <div class="qb-head"><strong>Where the current query lands</strong> <span class="stat" id="qb-summary"></span></div>
          <div class="query-bands" id="query-bands"><span class="hint">Type a query to see, band by band, which documents it shares a bucket with.</span></div>
        </div>
        <label class="field link-field">
          group docs that share at least <span class="field-val" id="link-val">3</span> bucket(s)
          <input type="range" id="link-slider" min="1" max="10" step="1" value="3">
        </label>
        <div class="group-strip" id="group-strip"></div>
        <div class="bucket-list" id="bucket-list"></div>
      </div>
    `;
    host.appendChild(root);

    // ---------- element refs ----------
    const el = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    const corpusListEl = el<HTMLDivElement>('#corpus-list');
    const hfSlider = el<HTMLInputElement>('#hf-slider');
    const bwSlider = el<HTMLInputElement>('#bw-slider');
    const hfVal = el<HTMLSpanElement>('#hf-val');
    const hfLabel = el<HTMLElement>('#hf-label');
    const bwVal = el<HTMLSpanElement>('#bw-val');
    const queryBox = el<HTMLInputElement>('#query-box');
    const queryShingles = el<HTMLDivElement>('#query-shingles');
    const vizEmpty = el<HTMLDivElement>('#viz-empty');
    const vizBody = el<HTMLDivElement>('#viz-body');
    const sigGrid = el<HTMLDivElement>('#sig-grid');
    const candidateList = el<HTMLDivElement>('#candidate-list');
    const dimList = el<HTMLDivElement>('#dim-list');
    const tableEmpty = el<HTMLDivElement>('#table-empty');
    const simTable = el<HTMLTableElement>('#sim-table');
    const simTbody = el<HTMLTableSectionElement>('#sim-tbody');
    const topMatches = el<HTMLDivElement>('#top-matches');
    const docCellsEl = el<HTMLDivElement>('#doc-cells');
    const bucketListEl = el<HTMLDivElement>('#bucket-list');
    const bucketNoteEl = el<HTMLSpanElement>('#bucket-query-note');
    const queryBandsEl = el<HTMLDivElement>('#query-bands');
    const qbSummaryEl = el<HTMLSpanElement>('#qb-summary');
    /** Results of the most recent query, used to paint the corpus list. */
    let lastRows: { doc: Doc; matchedBands: number[]; est: number; exact: number }[] = [];
    let lastCandidates = new Set<DocumentId>();
    let lastQueryShingles = new Set<string>();
    const statCount = el<HTMLElement>('#stat-count');
    const statHf = el<HTMLElement>('#stat-hf');
    const statBw = el<HTMLElement>('#stat-bw');
    const statBands = el<HTMLElement>('#stat-bands');
    const statTime = el<HTMLElement>('#stat-time');
    const statGroups = el<HTMLElement>('#stat-groups');
    const concSlider = el<HTMLInputElement>('#conc-slider');
    const concVal = el<HTMLElement>('#conc-val');
    const concLabel = el<HTMLElement>('#conc-label');
    const latSlider = el<HTMLInputElement>('#lat-slider');
    const latVal = el<HTMLElement>('#lat-val');
    const streamStatus = el<HTMLElement>('#stream-status');
    const streamFill = el<HTMLElement>('#stream-fill');
    const streamDone = el<HTMLElement>('#stream-done');
    const streamTotal = el<HTMLElement>('#stream-total');
    const streamInflight = el<HTMLElement>('#stream-inflight');
    const streamPeak = el<HTMLElement>('#stream-peak');
    const streamRate = el<HTMLElement>('#stream-rate');
    const docCells = el<HTMLDivElement>('#doc-cells');
    const bucketList = el<HTMLDivElement>('#bucket-list');
    const bucketSummary = el<HTMLElement>('#bucket-summary');
    const copyBtn = el<HTMLButtonElement>('#btn-copy');
    const linkSlider = el<HTMLInputElement>('#link-slider');
    const linkVal = el<HTMLElement>('#link-val');
    const groupStrip = el<HTMLDivElement>('#group-strip');
    const storageStatus = el<HTMLElement>('#storage-status');
    const exportBtn = el<HTMLButtonElement>('#btn-export');
    const importBtn = el<HTMLButtonElement>('#btn-import');
    const importFile = el<HTMLInputElement>('#file-import');
    const snapshotStatus = el<HTMLElement>('#snapshot-status');

    // ---------- deep link + handoff ----------
    const DEFAULT_QUERY = 'The quick brown fox jumps over a lazy dog';
    const stateDefaults = { hf: 50, bw: 3, conc: 4, lat: 20, link: 3, q: DEFAULT_QUERY };
    const linked = readState(stateDefaults);
    const clampNum = (v: unknown, lo: number, hi: number, d: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
    };
    hfSlider.value = String(clampNum(linked.hf, 10, 150, 50));
    bwSlider.value = String(clampNum(linked.bw, 1, 10, 5));
    concSlider.value = String(clampNum(linked.conc, 1, 16, 4));
    latSlider.value = String(clampNum(linked.lat, 0, 120, 20));
    hfVal.textContent = hfLabel.textContent = hfSlider.value;
    bwVal.textContent = bwSlider.value;
    concVal.textContent = concLabel.textContent = concSlider.value;
    latVal.textContent = latSlider.value;
    let minShared = clampNum(linked.link, 1, 30, 3);
    let initialQuery = linked.q;

    const handoff = receive<SpintaxVariants | ChunkerChunksDedupe>('hashish');
    let handoffDocs: string[] | null = null;
    if (handoff && handoff.kind === 'spintax-variants' && Array.isArray((handoff.payload as SpintaxVariants)?.variants)) {
      const p = handoff.payload as SpintaxVariants;
      const variants = p.variants.filter((v) => typeof v === 'string' && v.trim().length >= 5);
      if (variants.length) {
        handoffDocs = variants;
        initialQuery = variants[Math.floor(Math.random() * variants.length)];
        const totalLabel = p.total != null ? p.total.toLocaleString('en-US') : '∞';
        root.prepend(
          handoffBanner(
            handoff,
            `<span>Indexed <b>${variants.length}</b> spintax variants (every ${p.stride.toLocaleString('en-US')}${p.stride === 1 ? 'st' : 'th'} of ${totalLabel}, pulled lazily from <code>parse()</code>).
             The query is one of them — near-identical siblings pile into the same LSH buckets below.</span>`,
          ),
        );
      }
    } else if (handoff && handoff.kind === 'chunker-chunks-dedupe' && Array.isArray((handoff.payload as ChunkerChunksDedupe)?.chunks)) {
      const p = handoff.payload as ChunkerChunksDedupe;
      const chunks = p.chunks.filter((c) => typeof c === 'string' && c.trim().length >= 5);
      if (chunks.length) {
        handoffDocs = chunks;
        initialQuery = chunks[0];
        root.prepend(
          handoffBanner(
            handoff,
            `<span>Indexed <b>${chunks.length}</b> chunks from Chunker Scope's current document — a dedupe pipeline: chunks that
             land in the same LSH bucket below are near-identical, and worth merging or dropping before they go into an index or
             a prompt.</span>`,
          ),
        );
      }
    }

    // ---------- state ----------
    let nextId = 1;
    let docs: Doc[] = (handoffDocs ?? PRESETS).map((text) => ({ id: nextId++, text, indexed: true }));
    let numberOfHashFunctions = Number(hfSlider.value);
    let bucketSize = Number(bwSlider.value);
    /** 'shared' hands the index an IndexedDBStorage adapter instead of the default in-memory Map. */
    let storageMode: 'memory' | 'shared' = 'memory';
    const makeHashish = () =>
      new Hashish({
        seed: SEED,
        numberOfHashFunctions,
        bucketSize,
        ...(storageMode === 'shared' ? { storage: new IndexedDBStorage(SHARED_DB_NAME) } : {}),
      });
    let hashish = makeHashish();
    let destroyed = false;
    let queryDebounce: ReturnType<typeof setTimeout> | undefined;
    const editDebounces = new Map<number, ReturnType<typeof setTimeout>>();
    let queryToken = 0;
    let concurrency = Number(concSlider.value);
    let latencyMs = Number(latSlider.value);
    let reindexAbort: AbortController | null = null;
    /** docId -> near-duplicate group index (connected components over shared buckets). */
    let groupOf = new Map<number, number>();
    let selectedBucket: number[] | null = null;

    function saveState() {
      writeState({ hf: numberOfHashFunctions, bw: bucketSize, conc: concurrency, lat: latencyMs, link: minShared, q: queryBox.value }, stateDefaults);
    }

    function setIndexStats(ms: number) {
      statCount.textContent = String(docs.filter((d) => d.indexed).length);
      statHf.textContent = String(numberOfHashFunctions);
      statBw.textContent = String(bucketSize);
      statBands.textContent = String(Math.ceil(numberOfHashFunctions / bucketSize));
      statTime.textContent = ms.toFixed(2);
    }

    // ---------- stream indexing ----------
    function renderCells() {
      docCells.innerHTML = docs
        .map((d) => `<span class="doc-cell q" data-id="${d.id}" title="#${d.id} ${snippet(d.text, 60).replace(/"/g, '&quot;')}"></span>`)
        .join('');
    }
    function cell(id: number) {
      return docCells.querySelector<HTMLElement>(`.doc-cell[data-id="${id}"]`);
    }
    function paintCellGroups() {
      docCells.querySelectorAll<HTMLElement>('.doc-cell').forEach((c) => {
        const g = groupOf.get(Number(c.dataset.id));
        c.style.setProperty('--cl', g === undefined ? '' : clusterColor(g));
        c.classList.toggle('grouped', g !== undefined);
        c.classList.toggle('sel', !!selectedBucket && selectedBucket.includes(Number(c.dataset.id)));
      });
      docCells.classList.toggle('has-sel', !!selectedBucket);
    }

    async function fullReindex() {
      reindexAbort?.abort();
      const ac = new AbortController();
      reindexAbort = ac;
      const idx = makeHashish();
      hashish = idx;
      const list = docs.slice();
      renderCells();
      let inFlight = 0;
      let peak = 0;
      let done = 0;
      const t0 = performance.now();
      const paint = () => {
        streamDone.textContent = String(done);
        streamTotal.textContent = String(list.length);
        streamInflight.textContent = String(inFlight);
        streamPeak.textContent = String(peak);
        streamFill.style.width = `${list.length ? (done / list.length) * 100 : 100}%`;
        const s = (performance.now() - t0) / 1000;
        streamRate.textContent = s > 0.01 ? Math.round(done / s).toLocaleString('en-US') : '–';
      };
      streamStatus.textContent = `streaming ${list.length} docs · concurrency ${concurrency}`;
      streamStatus.classList.add('live');
      paint();

      const indexOne = async (d: Doc) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        const c = cell(d.id);
        c?.classList.replace('q', 'f');
        paint();
        try {
          if (latencyMs > 0) await sleep(latencyMs * (0.5 + Math.random()));
          await idx.addDocument(d.id, d.text);
          return { d, ok: true };
        } catch {
          return { d, ok: false };
        } finally {
          inFlight--;
        }
      };

      try {
        for await (const r of mapConcurrentAsync(indexOne, list, { concurrency, ordered: false, signal: ac.signal })) {
          if (ac.signal.aborted || destroyed) return;
          r.d.indexed = r.ok;
          done++;
          const c = cell(r.d.id);
          c?.classList.remove('f', 'q');
          c?.classList.add(r.ok ? 'd' : 'x');
          paint();
        }
      } catch (err) {
        if (ac.signal.aborted || destroyed) return;
        streamStatus.textContent = `error: ${(err as Error)?.message ?? err}`;
        return;
      }
      if (ac.signal.aborted || destroyed) return;
      const ms = performance.now() - t0;
      streamStatus.classList.remove('live');
      streamStatus.textContent = `done — ${done} docs in ${ms.toFixed(0)} ms, never more than ${concurrency} in flight`;
      paint();
      setIndexStats(ms);
      renderCorpusList();
      await renderBuckets();
      await runQuery();
      if (storageMode === 'shared') sendToTab('hashish', 'hashish', 'shared-index-changed', { at: Date.now() });
    }

    // ---------- LSH buckets / near-duplicate groups ----------
    async function renderBuckets() {
      await renderBucketsInner();
      paintQueryOnIndexPanels();
    }
    async function renderBucketsInner() {
      const idx = hashish;
      const bands = Math.ceil(numberOfHashFunctions / bucketSize);
      const buckets = new Map<string, number[]>();
      const sigs = new Map<number, number[]>();
      for (const d of docs) {
        if (!d.indexed) continue;
        const sig = await idx.getSignature(d.id);
        if (!sig) continue;
        sigs.set(d.id, sig);
        for (let b = 0; b < bands; b++) {
          const key = `${b}:${sig.slice(b * bucketSize, Math.min((b + 1) * bucketSize, sig.length)).join(',')}`;
          const arr = buckets.get(key);
          if (arr) arr.push(d.id); else buckets.set(key, [d.id]);
        }
      }
      if (destroyed || idx !== hashish) return;

      // how many buckets each pair shares (a pair sharing k of b bands is a strong near-dup)
      const shared = [...buckets.entries()].filter(([, ids]) => ids.length > 1);
      const pairShared = new Map<number, number>();
      for (const [, ids] of shared) {
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const a = Math.min(ids[i], ids[j]);
          const b = Math.max(ids[i], ids[j]);
          const k = a * 1_000_003 + b;
          pairShared.set(k, (pairShared.get(k) ?? 0) + 1);
        }
      }
      linkSlider.max = String(bands);
      minShared = Math.min(minShared, bands);
      linkSlider.value = String(minShared);
      linkVal.textContent = String(minShared);

      // union-find over pairs sharing >= minShared buckets -> near-duplicate groups
      const parent = new Map<number, number>();
      const find = (x: number): number => {
        let r = x;
        while (parent.get(r) !== r) r = parent.get(r)!;
        let c = x;
        while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
        return r;
      };
      for (const id of sigs.keys()) parent.set(id, id);
      for (const [k, n] of pairShared) {
        if (n < minShared) continue;
        const a = find(Math.floor(k / 1_000_003));
        const b = find(k % 1_000_003);
        if (a !== b) parent.set(b, a);
      }
      const comps = new Map<number, number[]>();
      for (const id of sigs.keys()) {
        const r = find(id);
        const arr = comps.get(r);
        if (arr) arr.push(id); else comps.set(r, [id]);
      }
      const groups = [...comps.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
      groupOf = new Map();
      groups.forEach((g, i) => g.forEach((id) => groupOf.set(id, i)));
      statGroups.textContent = `${groups.length}`;
      const textOfDoc = new Map(docs.map((d) => [d.id, d.text]));
      groupStrip.innerHTML = groups.length
        ? groups
            .slice(0, 24)
            .map((g, i) => `<button class="group-chip" data-group="${i}" style="--cl:${clusterColor(i)}" title="${snippet(textOfDoc.get(g[0]) ?? '', 80).replace(/"/g, '&quot;')}"><b>${g.length}</b> ${snippet(textOfDoc.get(g[0]) ?? '', 28).replace(/</g, '&lt;')}</button>`)
            .join('') + (groups.length > 24 ? `<span class="chip">+${groups.length - 24} groups</span>` : '')
        : '<span class="empty-note">No pair shares that many buckets — lower the threshold.</span>';
      groupStrip.querySelectorAll<HTMLButtonElement>('.group-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ids = groups[Number(btn.dataset.group)];
          const same = selectedBucket && selectedBucket.join() === ids.join();
          selectedBucket = same ? null : ids;
          groupStrip.querySelectorAll('.group-chip').forEach((b) => b.classList.toggle('active', !same && b === btn));
          bucketList.querySelectorAll('.bucket-card').forEach((b) => b.classList.remove('active'));
          paintCellGroups();
        });
      });

      // merge buckets whose member sets are identical across bands
      const merged = new Map<string, { ids: number[]; bands: number[] }>();
      for (const [key, ids] of shared) {
        const band = Number(key.slice(0, key.indexOf(':')));
        const sig = [...ids].sort((a, b) => a - b).join(',');
        const m = merged.get(sig);
        if (m) m.bands.push(band); else merged.set(sig, { ids: [...ids].sort((a, b) => a - b), bands: [band] });
      }
      const top = [...merged.values()].sort((a, b) => b.ids.length - a.ids.length || b.bands.length - a.bands.length);
      const singletons = sigs.size - [...groupOf.keys()].length;
      bucketSummary.innerHTML = `<b>${shared.length}</b> shared buckets · <b>${groups.length}</b> near-dup group${groups.length === 1 ? '' : 's'} (≥${minShared} of ${bands} bands) · ${singletons} loner${singletons === 1 ? '' : 's'}`;
      const textOf = new Map(docs.map((d) => [d.id, d.text]));
      const SHOW = 12;
      bucketList.innerHTML = top.length
        ? top
            .slice(0, SHOW)
            .map((bk, i) => {
              const g = groupOf.get(bk.ids[0]);
              const ref = textOf.get(bk.ids[0]) ?? '';
              const members = bk.ids
                .slice(0, 5)
                .map((id) => `<div class="bk-member"><span class="bk-id">#${id}</span> ${diffHtml(snippet(textOf.get(id) ?? '', 110), id === bk.ids[0] ? (textOf.get(id) ?? '') : ref)}</div>`)
                .join('');
              const more = bk.ids.length > 5 ? `<div class="bk-more">+ ${bk.ids.length - 5} more</div>` : '';
              const bandChips = bk.bands.slice(0, 8).map((b) => `<span class="chip band-chip" style="border-color:${bandPalette(b)};color:${bandPalette(b)}">b${b}</span>`).join(' ') + (bk.bands.length > 8 ? ` +${bk.bands.length - 8}` : '');
              return `<button class="bucket-card" data-bucket="${i}" data-ids="${bk.ids.join(',')}" data-bands="${bk.bands.join(',')}" style="--cl:${g === undefined ? 'var(--ink-3)' : clusterColor(g)}">
                <div class="bk-head"><b>${bk.ids.length} docs</b> share ${bk.bands.length} bucket${bk.bands.length === 1 ? '' : 's'} ${bandChips}</div>
                ${members}${more}
              </button>`;
            })
            .join('') + (top.length > SHOW ? `<div class="empty-note">…and ${top.length - SHOW} smaller bucket sets.</div>` : '')
        : '<div class="empty-note">No two documents share a bucket at these settings — every doc is a loner. Try fewer rows per band.</div>';
      bucketList.querySelectorAll<HTMLButtonElement>('.bucket-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          const bk = top[Number(btn.dataset.bucket)];
          const same = selectedBucket && selectedBucket.join() === bk.ids.join();
          selectedBucket = same ? null : bk.ids;
          bucketList.querySelectorAll('.bucket-card').forEach((b) => b.classList.toggle('active', !same && b === btn));
          groupStrip.querySelectorAll('.group-chip').forEach((b) => b.classList.remove('active'));
          paintCellGroups();
          if (!same) docCells.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
      selectedBucket = null;
      paintCellGroups();
      paintCorpusGroups();
    }

    function paintCorpusGroups() {
      corpusListEl.querySelectorAll<HTMLElement>('.corpus-item').forEach((item) => {
        const g = groupOf.get(Number(item.dataset.id));
        item.style.setProperty('--cl', g === undefined ? 'transparent' : clusterColor(g));
      });
    }

    async function reindexOneDoc(doc: Doc) {
      const t0 = performance.now();
      if (await hashish.hasDocument(doc.id)) await hashish.removeDocument(doc.id);
      try {
        await hashish.addDocument(doc.id, doc.text);
        doc.indexed = true;
      } catch {
        doc.indexed = false;
      }
      const ms = performance.now() - t0;
      if (destroyed) return;
      setIndexStats(ms);
      renderCorpusItemState(doc);
      const c = cell(doc.id);
      if (c) { c.classList.remove('q', 'f', 'd', 'x'); c.classList.add(doc.indexed ? 'd' : 'x'); c.title = `#${doc.id} ${snippet(doc.text, 60)}`; }
      await renderBuckets();
      await runQuery();
      if (storageMode === 'shared') sendToTab('hashish', 'hashish', 'shared-index-changed', { at: Date.now() });
    }

    // ---------- corpus panel ----------
    function renderCorpusList() {
      corpusListEl.innerHTML = '';
      for (const doc of docs) {
        const item = document.createElement('div');
        item.className = 'corpus-item' + (doc.indexed ? '' : ' invalid');
        item.dataset.id = String(doc.id);
        item.innerHTML = `
          <div class="doc-view" title="Click to edit">${doc.text.replace(/</g, '&lt;')}</div>
          <textarea rows="2" hidden>${doc.text.replace(/</g, '&lt;')}</textarea>
          <button class="remove-btn" title="remove">✕</button>
          <button class="use-btn" title="Copy this document into the query box">use as query</button>
          <div class="corpus-id"><span class="group-dot" title="near-duplicate group (corpus vs corpus)"></span>#${doc.id}${doc.indexed ? '' : ' — <span class="warn-inline"></span>'}</div>
          <div class="match-line">type a query to compare</div>
          ${doc.indexed ? '' : '<div class="warn">empty documents can\'t be indexed</div>'}
        `;
        const ta = item.querySelector('textarea')!;
        const view = item.querySelector<HTMLDivElement>('.doc-view')!;
        view.addEventListener('click', () => { view.hidden = true; ta.hidden = false; ta.focus(); });
        ta.addEventListener('blur', () => { ta.hidden = true; view.hidden = false; paintCorpusMatches(); });
        ta.addEventListener('input', () => {
          doc.text = ta.value;
          const existing = editDebounces.get(doc.id);
          if (existing) clearTimeout(existing);
          editDebounces.set(
            doc.id,
            setTimeout(() => {
              editDebounces.delete(doc.id);
              void reindexOneDoc(doc);
            }, 350),
          );
        });
        item.querySelector('.use-btn')!.addEventListener('click', () => {
          queryBox.value = doc.text;
          queryBox.dispatchEvent(new Event('input', { bubbles: true }));
          queryBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          queryBox.focus();
        });
        item.querySelector('.remove-btn')!.addEventListener('click', async () => {
          docs = docs.filter((d) => d.id !== doc.id);
          if (await hashish.hasDocument(doc.id)) await hashish.removeDocument(doc.id);
          setIndexStats(0);
          renderCorpusList();
          cell(doc.id)?.remove();
          await renderBuckets();
          await runQuery();
          if (storageMode === 'shared') sendToTab('hashish', 'hashish', 'shared-index-changed', { at: Date.now() });
        });
        corpusListEl.appendChild(item);
      }
      paintCorpusGroups();
    }

    function renderCorpusItemState(doc: Doc) {
      const item = corpusListEl.querySelector<HTMLDivElement>(`.corpus-item[data-id="${doc.id}"]`);
      if (!item) return;
      item.classList.toggle('invalid', !doc.indexed);
      let warn = item.querySelector('.warn');
      if (!doc.indexed && !warn) {
        warn = document.createElement('div');
        warn.className = 'warn';
        warn.textContent = "empty documents can't be indexed";
        item.appendChild(warn);
      } else if (doc.indexed && warn) {
        warn.remove();
      }
    }

    // ---------- query ----------
    async function runQuery() {
      const token = ++queryToken;
      const text = queryBox.value;
      if (!text.trim()) {
        vizEmpty.style.display = '';
        vizBody.style.display = 'none';
        tableEmpty.style.display = '';
        tableEmpty.textContent = 'No query yet.';
        topMatches.innerHTML = '<span class="hint">Top matches update as you type.</span>';
        simTable.style.display = 'none';
        lastRows = []; lastCandidates = new Set(); lastQueryShingles = new Set();
        paintCorpusMatches();
        paintQueryOnIndexPanels();
        queryShingles.innerHTML = '';
        return;
      }

      queryShingles.innerHTML = displayShingles(text)
        .slice(0, 200)
        .map((s) => `<span class="chip">${s.replace(/</g, '&lt;').replace(/ /g, '·')}</span>`)
        .join('');

      if (await hashish.hasDocument(QUERY_ID)) await hashish.removeDocument(QUERY_ID);
      try {
        await hashish.addDocument(QUERY_ID, text);
      } catch {
        vizEmpty.style.display = '';
        vizEmpty.textContent = 'Query text could not be indexed.';
        vizBody.style.display = 'none';
        tableEmpty.style.display = '';
        tableEmpty.textContent = 'Query text could not be indexed.';
        simTable.style.display = 'none';
        return;
      }
      if (token !== queryToken || destroyed) return;

      const querySig = (await hashish.getSignature(QUERY_ID))!;
      const results = await hashish.query({ id: QUERY_ID, rerank: true });
      const candidateIds = new Set(results.filter((r) => r.id !== QUERY_ID).map((r) => r.id));
      const exactSimById = new Map(results.filter((r) => r.id !== QUERY_ID).map((r) => [r.id, r.similarity ?? 0]));

      await hashish.removeDocument(QUERY_ID);
      if (token !== queryToken || destroyed) return;

      vizEmpty.style.display = 'none';
      vizBody.style.display = '';
      tableEmpty.style.display = 'none';
      simTable.style.display = '';

      const bands = Math.ceil(numberOfHashFunctions / bucketSize);

      // per doc: signature + which bands fully agree with the query
      type Row = { doc: Doc; sig: number[] | undefined; matchedBands: number[]; est: number; exact: number };
      const rows: Row[] = [];
      for (const doc of docs) {
        if (!doc.indexed) continue;
        const sig = await hashish.getSignature(doc.id);
        let est = 0;
        const matchedBands: number[] = [];
        if (sig) {
          est = estimateSimilarity(querySig, sig);
          for (let b = 0; b < bands; b++) {
            const start = b * bucketSize;
            const end = Math.min(start + bucketSize, numberOfHashFunctions);
            let agree = true;
            for (let p = start; p < end; p++) {
              if (sig[p] !== querySig[p]) { agree = false; break; }
            }
            if (agree) matchedBands.push(b);
          }
        }
        const exact = exactSimById.has(doc.id) ? exactSimById.get(doc.id)! : hashish.similarity(text, doc.text);
        rows.push({ doc, sig, matchedBands, est, exact });
      }
      if (token !== queryToken || destroyed) return;

      renderSignatureGrid(querySig, rows, bands, candidateIds);
      renderSimilarityTable(rows, candidateIds);
      renderTopMatches(rows, candidateIds);
      lastRows = rows; lastCandidates = candidateIds; lastQueryShingles = new Set(displayShingles(text));
      paintCorpusMatches();
      paintQueryOnIndexPanels();
    }

    /** Paint every corpus item with its relationship to the current query, and sort by similarity. */
    function paintCorpusMatches() {
      const byId = new Map(lastRows.map((r) => [r.doc.id, r]));
      const rank = new Map([...lastRows].sort((a, b) => b.exact - a.exact).map((r, i) => [r.doc.id, i + 1]));
      const items = [...corpusListEl.querySelectorAll<HTMLElement>('.corpus-item')];
      for (const item of items) {
        const id = Number(item.dataset.id);
        const doc = docs.find((d) => d.id === id);
        const r = byId.get(id);
        const view = item.querySelector<HTMLDivElement>('.doc-view');
        const line = item.querySelector<HTMLDivElement>('.match-line');
        if (!doc || !view || !line) continue;
        if (!r) {
          item.style.setProperty('--sim', '0');
          item.classList.remove('cand', 'has-query');
          view.innerHTML = doc.text.replace(/</g, '&lt;');
          line.textContent = lastRows.length ? 'not indexed' : 'type a query to compare';
          continue;
        }
        const isCand = lastCandidates.has(id);
        item.classList.add('has-query');
        item.classList.toggle('cand', isCand);
        item.style.setProperty('--sim', String(r.exact));
        view.innerHTML = highlightShared(doc.text, lastQueryShingles);
        line.innerHTML = `<span class="rank ${rank.get(id) === 1 ? 'top' : ''}">match ${rank.get(id)}/${lastRows.length}</span> <b>${(r.exact * 100).toFixed(0)}%</b> exact · ${(r.est * 100).toFixed(0)}% est · ${
          isCand ? `<span class="cand-tag">✓ LSH candidate · shares ${r.matchedBands.length} band${r.matchedBands.length === 1 ? '' : 's'}</span>` : '<span class="nocand-tag">no shared band</span>'
        }`;
      }
    }

    /** Mark, on the corpus-only panels, where the current query lands. */
    function paintQueryOnIndexPanels() {
      const matched = new Map(lastRows.map((r) => [r.doc.id, new Set(r.matchedBands)]));
      // doc cells in the stream panel
      docCellsEl.querySelectorAll<HTMLElement>('.doc-cell.d').forEach((c) => {
        const id = Number(c.dataset.id);
        c.classList.toggle('q-cand', lastCandidates.has(id));
      });
      // bucket cards: the query lands in a bucket if it agrees on one of the card's bands with one of its members
      let hits = 0;
      bucketListEl.querySelectorAll<HTMLElement>('.bucket-card').forEach((card) => {
        const ids = (card.dataset.ids || '').split(',').filter(Boolean).map(Number);
        const bands = (card.dataset.bands || '').split(',').filter(Boolean).map(Number);
        const hit = ids.some((id) => { const mb = matched.get(id); return !!mb && bands.some((b) => mb.has(b)); });
        card.classList.toggle('q-hit', hit);
        let tag = card.querySelector<HTMLElement>('.q-tag');
        if (hit && !tag) { tag = document.createElement('span'); tag.className = 'q-tag'; tag.textContent = '◆ query lands here'; card.querySelector('.bk-head')?.appendChild(tag); }
        if (!hit && tag) tag.remove();
        if (hit) hits++;
      });
      const note = bucketNoteEl;
      if (note) note.textContent = lastRows.length ? `the current query lands in ${hits} of these bucket${hits === 1 ? '' : 's'}` : '';

      // band-by-band strip: which documents share each of the query's buckets
      if (!lastRows.length) {
        queryBandsEl.innerHTML = '<span class="hint">Type a query to see, band by band, which documents it shares a bucket with.</span>';
        qbSummaryEl.textContent = '';
        return;
      }
      const nBands = Math.ceil(numberOfHashFunctions / bucketSize);
      const perBand: number[][] = Array.from({ length: nBands }, () => []);
      for (const r of lastRows) for (const b of r.matchedBands) perBand[b]?.push(r.doc.id);
      const shared = perBand.filter((d) => d.length).length;
      qbSummaryEl.textContent = shared
        ? `shares a bucket in ${shared} of ${nBands} bands → ${lastCandidates.size} candidate${lastCandidates.size === 1 ? '' : 's'}`
        : `alone in all ${nBands} bands → no candidates (try fewer rows per band, or a query closer to a document)`;
      queryBandsEl.innerHTML = perBand.map((ids, b) =>
        `<span class="qb ${ids.length ? 'hit' : ''}" title="band ${b + 1}: ${ids.length ? 'shares a bucket with #' + ids.join(', #') : 'the query is alone in this bucket'}">
          <span class="qb-n">${b + 1}</span>${ids.length ? `<span class="qb-ids">${ids.map((i) => '#' + i).join(' ')}</span>` : ''}</span>`).join('');
    }

    /** Wrap every character run covered by a shingle the query also has in <mark>. */
    function highlightShared(text: string, qs: Set<string>): string {
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      if (!qs.size) return esc(text);
      const t = text.trim();
      const off = text.indexOf(t);
      const covered = new Uint8Array(text.length);
      for (let i = 0; i + 5 <= t.length; i++) if (qs.has(t.slice(i, i + 5))) covered.fill(1, off + i, off + i + 5);
      let html = '', run = '', on = false;
      const flush = () => { if (run) html += on ? `<mark>${esc(run)}</mark>` : esc(run); run = ''; };
      for (let i = 0; i < text.length; i++) { const c = !!covered[i]; if (c !== on) { flush(); on = c; } run += text[i]; }
      flush();
      return html;
    }

    function renderSignatureGrid(
      querySig: number[],
      rows: { doc: Doc; sig: number[] | undefined; matchedBands: number[] }[],
      bands: number,
      candidateIds: Set<DocumentId>,
    ) {
      sigGrid.innerHTML = '';

      function bandGroupsHtml(sig: number[], highlightBands?: Set<number>) {
        let html = '';
        for (let b = 0; b < bands; b++) {
          const start = b * bucketSize;
          const end = Math.min(start + bucketSize, sig.length);
          const hl = highlightBands?.has(b);
          html += `<div class="band-group" data-band="${b}" style="${hl ? `outline:2px solid ${bandPalette(b)};border-radius:3px` : ''}">`;
          for (let p = start; p < end; p++) {
            html += `<div class="sig-cell" title="pos ${p}: ${sig[p]}" style="background:${colorForValue(sig[p])}"></div>`;
          }
          html += `</div>`;
        }
        return html;
      }

      const bandLabelsRow = document.createElement('div');
      bandLabelsRow.className = 'band-labels';
      let lbl = '';
      for (let b = 0; b < bands; b++) lbl += `<div class="band-group" data-band="${b}">b${b}</div>`;
      bandLabelsRow.innerHTML = lbl;
      sigGrid.appendChild(bandLabelsRow);

      const queryRow = document.createElement('div');
      queryRow.className = 'sig-row query';
      queryRow.innerHTML = `<span class="row-label">query</span>${bandGroupsHtml(querySig)}`;
      sigGrid.appendChild(queryRow);

      const MAX_SIG_ROWS = 20;
      const allCandidateRows = rows
        .filter((r) => candidateIds.has(r.doc.id) && r.sig)
        .sort((a, b) => b.matchedBands.length - a.matchedBands.length);
      const candidateRows = allCandidateRows.slice(0, MAX_SIG_ROWS);
      const docRowEls: { row: HTMLDivElement; matchedBands: number[] }[] = [];
      for (const r of candidateRows) {
        const rowEl = document.createElement('div');
        rowEl.className = 'sig-row';
        const g = groupOf.get(r.doc.id);
        if (g !== undefined) rowEl.style.setProperty('--cl', clusterColor(g));
        rowEl.innerHTML = `<span class="row-label" title="${r.doc.text.replace(/"/g, '&quot;')}">#${r.doc.id} ${snippet(r.doc.text, 26)}</span>${bandGroupsHtml(r.sig!, new Set(r.matchedBands))}`;
        sigGrid.appendChild(rowEl);
        docRowEls.push({ row: rowEl, matchedBands: r.matchedBands });
      }

      // connecting lines, drawn after layout so getBoundingClientRect is accurate
      const svgNs = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('class', 'sig-lines');
      sigGrid.style.position = 'relative';
      sigGrid.appendChild(svg);

      requestAnimationFrame(() => {
        if (destroyed) return;
        const gridBox = sigGrid.getBoundingClientRect();
        svg.setAttribute('width', String(gridBox.width));
        svg.setAttribute('height', String(gridBox.height));
        svg.setAttribute('viewBox', `0 0 ${gridBox.width} ${gridBox.height}`);

        // Match each band-label's width to its real band-group width (issue #18,
        // Hashish Lab P1): the header row only ever renders a "bN" text label, so
        // left auto-sized it's narrower than the data columns (which are sized by
        // their sig-cell count) and drifts out of alignment as bands progress.
        for (let b = 0; b < bands; b++) {
          const dataCell = queryRow.querySelector<HTMLElement>(`.band-group[data-band="${b}"]`);
          const labelCell = bandLabelsRow.querySelector<HTMLElement>(`.band-group[data-band="${b}"]`);
          if (dataCell && labelCell) labelCell.style.width = `${dataCell.getBoundingClientRect().width}px`;
        }

        const bandCenterX = (b: number): number | undefined => {
          const cell = queryRow.querySelector<HTMLElement>(`.band-group[data-band="${b}"]`);
          if (!cell) return undefined;
          const box = cell.getBoundingClientRect();
          return box.left - gridBox.left + box.width / 2;
        };
        const queryBottom = queryRow.getBoundingClientRect().bottom - gridBox.top;
        let linesHtml = '';
        for (const { row, matchedBands } of docRowEls) {
          const rowTop = row.getBoundingClientRect().top - gridBox.top;
          for (const b of matchedBands) {
            const x = bandCenterX(b);
            if (x === undefined) continue;
            linesHtml += `<line x1="${x}" y1="${queryBottom}" x2="${x}" y2="${rowTop}" stroke="${bandPalette(b)}" stroke-width="1.5" opacity="0.75" />`;
          }
        }
        svg.innerHTML = linesHtml;
      });

      // candidate summary list
      candidateList.innerHTML = candidateRows.length
        ? candidateRows
            .map((r) => {
              const bandChips = r.matchedBands.map((b) => `<span class="chip band-chip" style="border-color:${bandPalette(b)};color:${bandPalette(b)}">band ${b}</span>`).join(' ');
              return `<div><span class="chip">#${r.doc.id}</span> ${snippet(r.doc.text)} — shares ${r.matchedBands.length} band${r.matchedBands.length === 1 ? '' : 's'}: ${bandChips}</div>`;
            })
            .join('')
        : '<div class="empty-note" style="padding:2px 0">No candidates in any bucket at these settings — try fewer rows per band, or more of them.</div>';
      if (allCandidateRows.length > candidateRows.length) {
        candidateList.insertAdjacentHTML('beforeend', `<div class="empty-note" style="padding:2px 0">…plus ${allCandidateRows.length - candidateRows.length} more candidates (showing the ${MAX_SIG_ROWS} sharing the most bands).</div>`);
      }

      const nonCandidates = rows.filter((r) => !candidateIds.has(r.doc.id));
      dimList.innerHTML = nonCandidates.length
        ? `<span style="font-size:11px;color:var(--ink-3);align-self:center">not in any shared bucket:</span>` +
          nonCandidates.slice(0, 40).map((r) => `<span class="chip">#${r.doc.id} ${snippet(r.doc.text, 24)}</span>`).join('') +
          (nonCandidates.length > 40 ? `<span class="chip">+${nonCandidates.length - 40} more</span>` : '')
        : '';
    }

    function renderTopMatches(rows: { doc: Doc; est: number; exact: number }[], candidateIds: Set<DocumentId>) {
      const best = [...rows].sort((a, b) => b.exact - a.exact)[0];
      const nCand = rows.filter((r) => candidateIds.has(r.doc.id)).length;
      topMatches.innerHTML = `<span class="tm-head"><b>${nCand}</b> LSH candidate${nCand === 1 ? '' : 's'} · best match ${
        best ? `<b>#${best.doc.id}</b> at <b>${(best.exact * 100).toFixed(0)}%</b> exact` : 'none'
      } · documents keep their order; each shows its match rank and shared shingles are <mark>highlighted</mark></span>`;
    }

    function renderSimilarityTable(rows: { doc: Doc; est: number; exact: number }[], candidateIds: Set<DocumentId>) {
      const MAX_ROWS = 60;
      const all = [...rows].sort((a, b) => b.exact - a.exact);
      const sorted = all.slice(0, MAX_ROWS);
      simTbody.innerHTML = sorted
        .map((r) => {
          const isCand = candidateIds.has(r.doc.id);
          const bar = (v: number) => `<span class="bar" style="width:${Math.max(2, Math.round(v * 60))}px"></span>${v.toFixed(3)}`;
          return `<tr class="${isCand ? 'is-candidate' : ''}">
            <td>#${r.doc.id} ${snippet(r.doc.text, 40)}</td>
            <td>${isCand ? '✓' : '–'}</td>
            <td class="num">${bar(r.est)}</td>
            <td class="num">${bar(r.exact)}</td>
          </tr>`;
        })
        .join('') + (all.length > MAX_ROWS ? `<tr><td colspan="4" style="color:var(--ink-3)">…${all.length - MAX_ROWS} more rows (lowest similarity) hidden</td></tr>` : '');
    }

    // ---------- wiring ----------
    hfSlider.addEventListener('input', () => {
      numberOfHashFunctions = Number(hfSlider.value);
      hfVal.textContent = String(numberOfHashFunctions);
      hfLabel.textContent = String(numberOfHashFunctions);
    });
    hfSlider.addEventListener('change', () => { saveState(); void fullReindex(); });
    bwSlider.addEventListener('input', () => {
      bucketSize = Number(bwSlider.value);
      bwVal.textContent = String(bucketSize);
    });
    bwSlider.addEventListener('change', () => { saveState(); void fullReindex(); });
    concSlider.addEventListener('input', () => {
      concurrency = Number(concSlider.value);
      concVal.textContent = concLabel.textContent = String(concurrency);
    });
    concSlider.addEventListener('change', () => { saveState(); void fullReindex(); });
    latSlider.addEventListener('input', () => {
      latencyMs = Number(latSlider.value);
      latVal.textContent = String(latencyMs);
    });
    latSlider.addEventListener('change', () => { saveState(); void fullReindex(); });
    linkSlider.addEventListener('input', () => {
      minShared = Number(linkSlider.value);
      linkVal.textContent = String(minShared);
    });
    linkSlider.addEventListener('change', () => { saveState(); void renderBuckets().then(() => runQuery()); });
    el<HTMLButtonElement>('#btn-reindex').addEventListener('click', () => { void fullReindex(); });
    copyBtn.addEventListener('click', async () => {
      saveState();
      await sleep(180);
      await copyLink();
      copyBtn.textContent = '✓ copied';
      setTimeout(() => { copyBtn.textContent = '🔗 copy link'; }, 1400);
    });

    queryBox.addEventListener('input', () => {
      if (queryDebounce) clearTimeout(queryDebounce);
      queryDebounce = setTimeout(() => { saveState(); void runQuery(); }, 150);
    });

    el<HTMLButtonElement>('#btn-add').addEventListener('click', () => {
      docs.push({ id: nextId++, text: 'New document — click in and start typing to see it join the index.', indexed: false });
      void fullReindex();
    });
    el<HTMLButtonElement>('#btn-reset').addEventListener('click', () => {
      editDebounces.forEach((t) => clearTimeout(t));
      editDebounces.clear();
      docs = PRESETS.map((text) => ({ id: nextId++, text, indexed: true }));
      void fullReindex();
    });

    // ---------- storage backend: in-memory vs IndexedDB shared across tabs ----------
    // A shared index needs every writer using the same numberOfHashFunctions (it fixes
    // the signature length); bucketSize is purely query-time math over per-position
    // buckets (see renderBucketsInner), so it stays free to change per tab.
    function applyStorageLock() {
      hfSlider.disabled = storageMode === 'shared';
    }

    /** Pulls whatever documents are already in the shared store (written by another tab, maybe) into `docs`. */
    async function loadFromShared(idx: Hashish): Promise<Doc[]> {
      const ids = (await idx.documentIds()).filter((id) => id !== QUERY_ID);
      const loaded: Doc[] = [];
      for (const id of ids) {
        const text = await idx.getDocument(id);
        if (text !== undefined) loaded.push({ id: Number(id), text, indexed: true });
      }
      return loaded.sort((a, b) => a.id - b.id);
    }

    async function switchStorage(mode: 'memory' | 'shared') {
      if (mode === storageMode || destroyed) return;
      storageMode = mode;
      applyStorageLock();
      if (mode === 'shared') {
        storageStatus.textContent = 'connecting…';
        const shared = makeHashish();
        const loaded = await loadFromShared(shared);
        if (destroyed) return;
        hashish = shared;
        if (loaded.length) {
          docs = loaded;
          nextId = Math.max(0, ...loaded.map((d) => d.id)) + 1;
          renderCorpusList();
          renderCells();
          docs.forEach((d) => cell(d.id)?.classList.add('d'));
          setIndexStats(0);
          await renderBuckets();
          await runQuery();
          storageStatus.textContent = `connected — loaded ${loaded.length} document${loaded.length === 1 ? '' : 's'} another tab already wrote to IndexedDB`;
        } else {
          storageStatus.textContent = 'connected — this tab is the first writer, pushing its corpus in…';
          await fullReindex();
          storageStatus.textContent = 'connected — this tab is the first writer';
        }
      } else {
        storageStatus.textContent = '';
        await fullReindex();
      }
    }

    /** Another tab wrote to the shared store: reload our view of it from scratch. */
    async function refreshFromShared() {
      if (storageMode !== 'shared' || destroyed) return;
      const loaded = await loadFromShared(hashish);
      if (destroyed) return;
      docs = loaded;
      nextId = Math.max(0, ...loaded.map((d) => d.id), nextId - 1) + 1;
      renderCorpusList();
      renderCells();
      docs.forEach((d) => cell(d.id)?.classList.add('d'));
      setIndexStats(0);
      await renderBuckets();
      await runQuery();
      storageStatus.textContent = `connected — synced ${loaded.length} document${loaded.length === 1 ? '' : 's'} (another tab just wrote)`;
    }

    const offTabHandoff = onTabHandoff('hashish', (h) => {
      if (h.kind === 'shared-index-changed') void refreshFromShared();
    });

    root.querySelectorAll<HTMLInputElement>('input[name="hh-storage"]').forEach((r) => {
      r.addEventListener('change', () => { if (r.checked) void switchStorage(r.value as 'memory' | 'shared'); });
    });

    // ---------- export / import a portable snapshot (exportIndex / Hashish.importIndex) ----------
    exportBtn.addEventListener('click', async () => {
      try {
        const snap: HashishExport = await hashish.exportIndex();
        const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hashish-index.json';
        a.click();
        URL.revokeObjectURL(url);
        snapshotStatus.textContent = `exported ${snap.documents.length} document${snap.documents.length === 1 ? '' : 's'} — this file is also what Packfile Vault or Jujutsu Timeline could carry`;
      } catch (err) {
        snapshotStatus.textContent = `export failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async () => {
      const file = importFile.files?.[0];
      importFile.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text()) as HashishExport;
        if (!data || !Array.isArray(data.documents)) throw new Error('not a Hashish exportIndex() snapshot (missing "documents")');
        snapshotStatus.textContent = `importing ${data.documents.length} document${data.documents.length === 1 ? '' : 's'}…`;
        const storage = storageMode === 'shared' ? new IndexedDBStorage(SHARED_DB_NAME) : undefined;
        const imported = await Hashish.importIndex(data, storage);
        if (destroyed) return;
        hashish = imported;
        if (data.options.numberOfHashFunctions) {
          numberOfHashFunctions = data.options.numberOfHashFunctions;
          hfSlider.value = String(Math.min(150, Math.max(10, numberOfHashFunctions)));
          hfVal.textContent = hfLabel.textContent = hfSlider.value;
        }
        if (data.options.bucketSize) {
          bucketSize = data.options.bucketSize;
          bwSlider.value = String(Math.min(10, Math.max(1, bucketSize)));
          bwVal.textContent = bwSlider.value;
        }
        docs = data.documents.map((d) => ({ id: Number(d.id), text: d.text, indexed: true }));
        nextId = Math.max(0, ...docs.map((d) => d.id)) + 1;
        renderCorpusList();
        renderCells();
        docs.forEach((d) => cell(d.id)?.classList.add('d'));
        setIndexStats(0);
        await renderBuckets();
        await runQuery();
        snapshotStatus.textContent = `imported ${docs.length} document${docs.length === 1 ? '' : 's'} via Hashish.importIndex()${data.options.seed == null ? ' (no seed in the file — signatures were freshly re-derived)' : ''}`;
      } catch (err) {
        snapshotStatus.textContent = `import failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    });

    // ---------- initial render ----------
    queryBox.value = initialQuery;
    renderCorpusList();
    void fullReindex();
    if (handoffDocs) saveState();

    return () => {
      destroyed = true;
      reindexAbort?.abort();
      if (queryDebounce) clearTimeout(queryDebounce);
      editDebounces.forEach((t) => clearTimeout(t));
      editDebounces.clear();
      offTabHandoff();
    };
  },
} satisfies Playground;
