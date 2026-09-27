import type { Playground } from '../registry';
import { sentence, full, dropoffMethods } from '@johnhenry/semantic-chunker';
import { xenova } from '@johnhenry/semantic-chunker/embed/xenova';
import type {
  DropoffMethod,
  EmbeddedChunk,
  Dropoff,
  SplitMode,
} from '@johnhenry/semantic-chunker';
import { mapConcurrentAsync } from '@johnhenry/iteration';
import { receive, handoffBanner, handoffButton } from '../bus';
import { readState, writeState, copyLink } from '../state';
import './chunker.css';

// ---------------------------------------------------------------------------
// Opt-in real embedder. @huggingface/transformers is NOT an npm dependency of
// this site: it's dynamically imported from jsDelivr only when the visitor
// clicks the button. Issue #11 (closed by PR #12) fixed the library's own
// `embed/xenova` subpath for exactly this case: `xenova(options)` is now a
// factory that does no work at import time (no network, no `process`, no
// top-level await) and takes an already-imported `pipeline` (or the whole
// module) plus a model id — so it can be fed the CDN build directly, with no
// need to reimplement its mean-pool/normalize recipe ourselves.
//
// Issue #13 (0.0.2) went further: `xenova()` now accepts a `pipelineOptions`
// bag forwarded as-is into `pipeline("feature-extraction", model, {...})` —
// `progress_callback` (real per-file download progress), `dtype`/`quantized`,
// `device` ("webgpu" when available), `cache_dir`. This planet uses the real
// adapter for both: a live per-file meter driven straight off transformers.js'
// own callback, and `device: 'webgpu'` when the browser exposes `navigator.gpu`
// (falling back to the WASM/CPU backend otherwise).
// ---------------------------------------------------------------------------

const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers';
const REAL_MODEL = 'Xenova/all-MiniLM-L6-v2';

/** transformers.js' own `progress_callback` shape (subset we use). */
interface TransformersProgress {
  status: string; // 'initiate' | 'download' | 'progress' | 'done' | 'ready'
  file?: string;
  progress?: number; // 0-100
  loaded?: number;
  total?: number;
}

const supportsWebGPU = () => typeof navigator !== 'undefined' && 'gpu' in navigator;

let realEmbedPromise: Promise<(text: string) => Promise<number[]>> | null = null;

/** Loads the real embedder and returns it. `onProgress` gets transformers.js'
 *  real per-file `progress_callback` events (one `initiate` + a stream of
 *  `progress` + one `done` per file that actually needs downloading), and
 *  `onStage` brackets the whole (lazy, first-call-only) download + warm-up. */
function loadRealEmbedder(
  onProgress: (ev: TransformersProgress) => void,
  onStage: (stage: 'downloading' | 'ready') => void,
): Promise<(text: string) => Promise<number[]>> {
  if (realEmbedPromise) return realEmbedPromise;
  realEmbedPromise = (async () => {
    const transformers = await import(/* @vite-ignore */ TRANSFORMERS_CDN);
    const device = supportsWebGPU() ? 'webgpu' : undefined;
    const rawEmbed = xenova({
      model: REAL_MODEL,
      transformers,
      pipelineOptions: {
        progress_callback: (ev: TransformersProgress) => onProgress(ev),
        ...(device ? { device } : {}),
      },
    });
    onStage('downloading');
    await rawEmbed('warm-up'); // forces the lazy pipeline() call + download now, not on the first real segment
    onStage('ready');
    // The WASM session runs one inference at a time; serialize calls so the
    // bounded-concurrency stream can queue work without tripping over itself.
    let chain: Promise<unknown> = Promise.resolve();
    return (text: string) => {
      const next = chain.then(() => rawEmbed(text));
      chain = next.catch(() => undefined);
      return next;
    };
  })();
  realEmbedPromise.catch(() => { realEmbedPromise = null; });
  return realEmbedPromise;
}

// ---------------------------------------------------------------------------
// Third opt-in embedder: the library's own `embed/ollama` adapter talks to a
// local Ollama server, but it does so by `import { Ollama } from "ollama"` —
// a Node-oriented client package that isn't (and can't cleanly be) installed
// here as a browser dependency. Rather than reimplement that adapter, this
// planet speaks the exact same wire request Ollama's own client sends
// (`POST /api/embeddings`, `{ model, prompt }`) straight from `fetch()`,
// against the same default model (`nomic-embed-text:latest`) the library
// hardcodes. This is a real network call to a real local server, not a
// simulation — it just skips the extra client dependency. It only works if
// Ollama is reachable from the browser: run it with
// `OLLAMA_ORIGINS=<this site's origin> ollama serve` (or `*` for local dev),
// since a bare `ollama serve` rejects cross-origin browser requests by CORS.
// ---------------------------------------------------------------------------
const OLLAMA_MODEL = 'nomic-embed-text:latest';

function loadOllamaEmbedder(baseUrl: string): (text: string) => Promise<number[]> {
  const base = baseUrl.trim().replace(/\/+$/, '') || 'http://localhost:11434';
  return async (text: string) => {
    const r = await fetch(`${base}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: text }),
    });
    if (!r.ok) throw new Error(`Ollama responded ${r.status} ${r.statusText} (is "${OLLAMA_MODEL}" pulled? try: ollama pull ${OLLAMA_MODEL})`);
    const j = (await r.json()) as { embedding?: number[] };
    if (!Array.isArray(j.embedding)) throw new Error('Ollama response had no "embedding" array');
    return j.embedding;
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Payload sent by Spintax Forge's "Send as document to Chunker" button. */
interface SpintaxDocument { template: string; document: string; topics: string[] }
const SPINTAX_DOC_KEY = 'orrery:chunker:spintax-doc';

// ---------------------------------------------------------------------------
// Embedder: a toy, deterministic, in-page stand-in for a real model
// (OpenAI / Xenova / Ollama). Hashed bag-of-words, feature-hashed into a
// fixed 256-dim vector with TF weighting and L2 normalisation. No network,
// no WASM, no download — just enough signal for neighbour cosine similarity
// to actually drift across topic boundaries.
// ---------------------------------------------------------------------------

const EMBED_DIM = 256;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these',
  'those', 'with', 'as', 'by', 'at', 'from', 'but', 'not', 'has', 'have',
  'had', 'their', 'they', 'he', 'she', 'we', 'you', 'your', 'our', 'which',
  'can', 'will', 'would', 'could', 'should', 'into', 'over', 'than', 'then',
  'also', 'such', 'each', 'more', 'most', 'some', 'any', 'all', 'if', 'so',
]);

/** Crude suffix-stripping stemmer — not Porter, just enough to fold plurals
 *  and common inflections into a shared bucket so "brew"/"brewed"/"brewing"
 *  hash together. */
function stem(word: string): string {
  let w = word;
  if (w.length > 6 && w.endsWith('ational')) return w.slice(0, -7) + 'ate';
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith('edly')) w = w.slice(0, -4);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  if (w.length > 3 && w.endsWith('ly')) w = w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

function hash32(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** BYOE embedding function — the only contract the library needs:
 *  `(text) => number[] | Promise<number[]>`. */
function hashEmbed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const tok of tokens) {
    if (tok.length < 2 || STOPWORDS.has(tok)) continue;
    const bucket = hash32(stem(tok)) % EMBED_DIM;
    vec[bucket] += 1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;
  return vec;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * (b[i] ?? 0); na += a[i] * a[i]; }
  for (let i = 0; i < b.length; i++) nb += b[i] * b[i];
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Eleven boundary-detection methods, straight from the library's README /
// dropoff-chooser.mjs. `dropoffMethods.findSignificantDropoffs<Name>` is a
// real export; "Agentic" re-embeds with a transformers.js model and is
// disabled here on purpose (this planet ships a hashed embedder, not a
// transformer — see the brief above the presets).
// ---------------------------------------------------------------------------

interface ParamDef { key: string; label: string; default: number; step: number; min?: number }
interface MethodDef {
  key: DropoffMethod;
  label: string;
  params: ParamDef[];
  disabled?: boolean;
}

const METHODS: MethodDef[] = [
  { key: 'SD', label: 'SD — z-score vs mean/stdev', params: [
    { key: 'zScoreThreshold', label: 'z-score threshold', default: 0.7, step: 0.1 },
  ] },
  { key: 'IQ', label: 'IQ — interquartile range', params: [
    { key: 'iqrMultiplier', label: 'IQR multiplier', default: 1.5, step: 0.1 },
  ] },
  { key: 'MAD', label: 'MAD — median absolute deviation', params: [
    { key: 'madMultiplier', label: 'MAD multiplier', default: 3, step: 0.5 },
  ] },
  { key: 'PercentChange', label: 'PercentChange — % drop vs previous', params: [
    { key: 'percentThreshold', label: '% threshold', default: 20, step: 5 },
  ] },
  { key: 'MA', label: 'MA — moving-average deviation', params: [
    { key: 'windowSize', label: 'window size', default: 3, step: 1, min: 2 },
    { key: 'deviationThreshold', label: 'deviation ×', default: 1.5, step: 0.1 },
  ] },
  { key: 'LM', label: 'LM — local minima', params: [
    { key: 'sensitivity', label: 'sensitivity', default: 0.2, step: 0.05 },
  ] },
  { key: 'CUSUM', label: 'CUSUM — cumulative sum', params: [
    { key: 'threshold', label: 'threshold', default: 5, step: 0.5 },
  ] },
  { key: 'ChangePoint', label: 'ChangePoint — single max-split', params: [] },
  { key: 'Hampel', label: 'Hampel — windowed median filter', params: [
    { key: 'windowSize', label: 'window size', default: 7, step: 1, min: 3 },
    { key: 'nSigma', label: 'n·sigma', default: 3, step: 0.5 },
  ] },
  { key: 'ModifiedZScore', label: 'ModifiedZScore — median/MAD z', params: [
    { key: 'threshold', label: 'threshold', default: 3.5, step: 0.5 },
  ] },
  { key: 'Agentic', label: 'Agentic — transformer re-embed (disabled)', params: [], disabled: true },
];

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESET_WIKI = `Coffee is a brewed drink prepared from roasted coffee beans, the seeds of berries from certain flowering plants in the Coffea genus. Darker roasts are generally more bitter, while lighter roasts preserve more of the bean's original flavor compounds. The two most commercially important species are Coffea arabica and Coffea canephora, commonly known as robusta. Ethiopia is widely credited as the origin of the coffee plant, with legends dating cultivation back to the ninth century.

Caffeine, the primary psychoactive compound in coffee, is a naturally occurring stimulant that blocks adenosine receptors in the brain, delaying the onset of drowsiness. A typical eight-ounce cup contains roughly 95 milligrams of caffeine, though this varies enormously with roast, brew method, and bean species. Chlorogenic acids, another major class of compounds in the bean, are believed to contribute both to coffee's bitterness and to some of its antioxidant properties. Researchers continue to study how these compounds interact with metabolism, sleep architecture, and cardiovascular health.

The global coffee trade involves an estimated twelve and a half million farms, the overwhelming majority of them smallholdings of a few hectares or less. Brazil, Vietnam, Colombia, and Indonesia are consistently the largest producing countries by volume, though quality and price vary enormously between them. Coffee futures are traded on commodity exchanges in New York and London, and the price paid to farmers can lag far behind the price paid by consumers at the cafe counter. Fair-trade and direct-trade certification schemes emerged in the late twentieth century specifically to address that gap.

In many cultures coffee is inseparable from ritual and hospitality. The Ethiopian coffee ceremony can last several hours and involves roasting green beans over charcoal in front of guests. The Italian espresso bar developed its own social choreography, where a quick standing espresso at the counter is a daily punctuation mark rather than an occasion. Turkish coffee, brewed unfiltered in a small pot called a cezve, leaves grounds in the cup that are traditionally read for fortune-telling after the drink is finished.`;

const PRESET_MEETING = `Q3 roadmap review. Sarah walked through the three top-line initiatives for the quarter: the billing migration, the mobile redesign, and the internal analytics dashboard. The billing migration is on track for a mid-quarter cutover, pending sign-off from finance on the reconciliation report. Mobile redesign is two weeks behind after the navigation rework required a second round of usability testing. The analytics dashboard has no committed date yet since it is still waiting on a data warehouse decision from the platform team.

Hiring update. We have two open reqs on the platform team and one on design, all posted for over a month now. The design req in particular has been hard to fill because we need someone comfortable with both motion design and accessibility auditing. HR proposed loosening the location requirement to fully remote, which should widen the pipeline considerably. We agreed to revisit headcount again at the end of the month if neither req closes.

Budget check-in. Cloud spend crept up eleven percent month over month, mostly driven by the new staging environment nobody remembered to schedule shutdowns for. Finance asked every team lead to submit a Q4 forecast by next Friday so the annual plan can be finalized. Marketing's conference budget for the fall trade show season is already fully allocated, so any additional events this year will need a separate approval.

Facilities and logistics. The lease renewal for the downtown office comes up in ninety days, and the building manager wants an answer on whether we're keeping the fourth floor. Several people asked about standing desks again; procurement says they can order a batch if at least ten people commit. The kitchen coffee machine is still broken and has been for three weeks, which came up twice in this meeting alone.`;

const PRESET_README = `# Widget Kit

A tiny, dependency-free library for building accessible interactive widgets
out of plain HTML elements. It ships as ESM only and weighs under four
kilobytes minified and gzipped.

## Installation

Install it from npm and import the pieces you need.

\`\`\`bash
npm install widget-kit
\`\`\`

## Usage

Create a widget by passing a root element and an options object. Every
widget returns a small controller with \`update\`, \`destroy\`, and an event
emitter you can subscribe to.

\`\`\`js
import { createTabs } from "widget-kit";

const tabs = createTabs(document.querySelector("#tabs"), {
  initial: 0,
});

tabs.on("change", (index) => console.log("active tab:", index));
\`\`\`

Widgets never assume a bundler or a specific CSS framework. You bring your
own class names, and the library only ever touches \`aria-*\` attributes and
a small set of data attributes for state.

## API

- \`createTabs(root, options)\` — roving-tabindex tab panel.
- \`createDisclosure(root, options)\` — a single collapsible section.
- \`createCombobox(root, options)\` — an accessible autocomplete input.

Every factory function follows the same shape: \`(root, options) => controller\`.
Options are always optional, and every controller can be destroyed and
recreated without leaking listeners.

## License

MIT. See the LICENSE file for the full text. Contributions are welcome as
long as new widgets ship with their own test file under \`test/\`.`;

// ---------------------------------------------------------------------------
// Local mirrors of the two internal (non-exported) helpers that turn raw
// dropoffMethods output into final chunks: enforce-chunk-size.mjs and the
// grouping loop inside semantic.mjs's createChunker. semantic() itself
// doesn't hand back the intermediate boundaries, so to draw the seismograph
// this planet re-runs that same, tiny, well-documented arithmetic on top of
// the *real* dropoffMethods exports and a *real* sentence() corpus.
// ---------------------------------------------------------------------------

function enforceChunkSizeLocal(
  corpus: EmbeddedChunk[],
  boundaries: number[],
  dropoffs: Dropoff[],
  maxChunkSize: number,
  minChunkSize: number,
): number[] {
  const dropoffAt = new Map(dropoffs.map((d) => [d.index, d.dropoff]));
  const textLength = (start: number, end: number) =>
    corpus.slice(start, end).map((c) => c[0]).join(' ').length;
  const segmentsFrom = (bounds: number[], length: number): Array<[number, number]> => {
    const segs: Array<[number, number]> = [];
    let start = 0;
    for (const end of [...bounds, length]) { segs.push([start, end]); start = end; }
    return segs;
  };
  let bounds = [...boundaries].sort((a, b) => a - b);

  if (maxChunkSize > 0) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [start, end] of segmentsFrom(bounds, corpus.length)) {
        if (end - start > 1 && textLength(start, end) > maxChunkSize) {
          let best = start + 1, bestValue = -Infinity;
          for (let i = start + 1; i < end; i++) {
            const value = dropoffAt.get(i) ?? 0;
            if (value > bestValue) { bestValue = value; best = i; }
          }
          bounds = [...bounds, best].sort((a, b) => a - b);
          changed = true;
          break;
        }
      }
    }
  }

  if (minChunkSize > 0) {
    let changed = true;
    while (changed && bounds.length > 0) {
      changed = false;
      for (const [start, end] of segmentsFrom(bounds, corpus.length)) {
        if (textLength(start, end) < minChunkSize) {
          const leftDropoff = start > 0 ? dropoffAt.get(start) ?? 0 : Infinity;
          const rightDropoff = end < corpus.length ? dropoffAt.get(end) ?? 0 : Infinity;
          const remove = leftDropoff <= rightDropoff ? start : end;
          bounds = bounds.filter((b) => b !== remove);
          changed = true;
          break;
        }
      }
    }
  }
  return bounds;
}

function groupChunks(corpus: EmbeddedChunk[], boundaries: number[], overlap: number) {
  if (corpus.length === 0) return [] as { text: string }[];
  const bounds = [...boundaries].sort((a, b) => a - b);
  const chunks: { text: string }[] = [];
  let startIndex = 0;
  for (const endIndex of [...bounds, corpus.length]) {
    const from = startIndex === 0 ? 0 : Math.max(0, startIndex - overlap);
    const text = corpus.slice(from, endIndex).map((c) => c[0]).join(' ');
    chunks.push({ text });
    startIndex = endIndex;
  }
  return chunks;
}

type Threshold =
  | { type: 'line'; value: number }
  | { type: 'curve'; values: number[] }
  | { type: 'none' };

function thresholdInfo(method: DropoffMethod, dvals: number[], p: Record<string, number>): Threshold {
  const n = dvals.length;
  if (n === 0) return { type: 'none' };
  const mean = dvals.reduce((s, v) => s + v, 0) / n;
  switch (method) {
    case 'SD': {
      const std = Math.sqrt(dvals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
      return { type: 'line', value: mean + std * (p.zScoreThreshold ?? 2) };
    }
    case 'IQ': {
      const sorted = [...dvals].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length / 4)];
      const q3 = sorted[Math.floor((sorted.length * 3) / 4)];
      return { type: 'line', value: q3 + (q3 - q1) * (p.iqrMultiplier ?? 1.5) };
    }
    case 'MAD': {
      const sorted = [...dvals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const mad = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
      return { type: 'line', value: median + mad * (p.madMultiplier ?? 3) };
    }
    case 'ModifiedZScore': {
      const sorted = [...dvals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const mad = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)] || 1;
      const threshold = p.threshold ?? 3.5;
      return { type: 'line', value: median + (threshold * mad) / 0.6745 };
    }
    case 'MA': {
      const windowSize = p.windowSize ?? 3;
      const deviationThreshold = p.deviationThreshold ?? 1.5;
      const values = dvals.map((_, i, arr) => {
        const start = Math.max(0, i - windowSize + 1);
        const window = arr.slice(start, i + 1);
        const avg = window.reduce((s, v) => s + v, 0) / window.length;
        return avg * (1 - deviationThreshold);
      });
      return { type: 'curve', values };
    }
    case 'Hampel': {
      const windowSize = p.windowSize ?? 7;
      const nSigma = p.nSigma ?? 3;
      const k = 1.4826;
      const values = dvals.map((_, i, arr) => {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(arr.length, i + Math.floor(windowSize / 2) + 1);
        const window = arr.slice(start, end);
        const sortedW = [...window].sort((a, b) => a - b);
        const median = sortedW[Math.floor(window.length / 2)];
        const mad = k * [...window].map((v) => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(window.length / 2)];
        return median + nSigma * mad;
      });
      return { type: 'curve', values };
    }
    default:
      return { type: 'none' };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ---------------------------------------------------------------------------
// Planet
// ---------------------------------------------------------------------------

const playground: Playground = {
  id: 'chunker',
  title: 'Chunker Scope',
  pkg: '@johnhenry/semantic-chunker',
  hue: 90,
  blurb: 'Split text at topic boundaries with a bring-your-own embedder. Eleven cut strategies.',
  docs: 'https://opensource.johnhenry.me/semantic-chunker/',
  mount(host) {
    const root = document.createElement('div');
    root.className = 'pg-chunker';
    root.innerHTML = `
      <div class="panel ck-bar">
        <div class="ck-presets">
          <span class="stat">presets</span>
          <button class="btn" data-preset="wiki">Wikipedia-style</button>
          <button class="btn" data-preset="meeting">Meeting notes</button>
          <button class="btn" data-preset="readme">Markdown README</button>
          <button class="btn" data-preset="spintax" hidden>Spintax document</button>
          <button class="btn ck-copy" data-copy title="Copy a link to these settings">🔗 copy link</button>
        </div>
        <div class="ck-controls">
          <label class="field">segmenter
            <select data-f="splitMode">
              <option value="sentence">sentence</option>
              <option value="paragraph">paragraph</option>
              <option value="markdown">markdown</option>
            </select>
          </label>
          <label class="field">method
            <select data-f="method">
              ${METHODS.map((m) => `<option value="${m.key}" ${m.disabled ? 'disabled' : ''}>${m.label}</option>`).join('')}
            </select>
          </label>
          <span class="ck-params" data-params></span>
        </div>
        <div class="ck-controls ck-controls-2">
          <label class="field">overlap (segments)<input type="number" min="0" step="1" value="0" data-f="overlap"></label>
          <label class="field">min chunk size (chars)<input type="number" min="0" step="20" value="0" data-f="minChunkSize"></label>
          <label class="field">max chunk size (chars)<input type="number" min="0" step="50" value="0" data-f="maxChunkSize"></label>
        </div>
      </div>

      <div class="panel ck-embed">
        <div class="ck-embed-head">
          <h3 class="ck-h">embedder</h3>
          <div class="ck-embed-pick">
            <label class="ck-radio"><input type="radio" name="ck-emb" value="toy" checked> <span><b>toy</b> · 256-dim hashed bag-of-words <em>(default, in-page, instant)</em></span></label>
            <label class="ck-radio"><input type="radio" name="ck-emb" value="minilm" disabled data-real-radio> <span><b>real</b> · all-MiniLM-L6-v2, 384-dim <em data-real-state>(not loaded)</em></span></label>
            <label class="ck-radio"><input type="radio" name="ck-emb" value="ollama" disabled data-ollama-radio> <span><b>ollama</b> · nomic-embed-text, local server <em data-ollama-state>(not connected)</em></span></label>
          </div>
          <button class="btn" data-load-real title="Downloads @huggingface/transformers from jsDelivr and a ~23 MB quantized model from the Hugging Face Hub, once">⬇ Use a real embedder</button>
        </div>
        <div class="ck-dl" data-dl hidden></div>
        <div class="ck-ollama-row">
          <input type="text" class="ck-ollama-url" data-ollama-url value="http://localhost:11434" spellcheck="false" title="Ollama server base URL">
          <button class="btn" data-connect-ollama title="Sends a real POST /api/embeddings to this server, using @johnhenry/semantic-chunker's default model, nomic-embed-text:latest">🔌 Connect to Ollama</button>
        </div>
        <div class="ck-dl" data-ollama-dl hidden></div>
        <div class="ck-controls">
          <label class="field">embed concurrency<span class="ck-row"><input type="range" min="1" max="12" step="1" value="4" data-f="conc"> <span class="ck-val" data-conc-val>4</span></span></label>
          <label class="field">toy latency (ms, simulated)<span class="ck-row"><input type="range" min="0" max="120" step="5" value="15" data-f="lat"> <span class="ck-val" data-lat-val>15</span></span></label>
        </div>
        <div class="ck-progress"><div class="ck-progress-fill" data-pfill></div></div>
        <p class="stat ck-pstats" data-pstats>—</p>
      </div>

      <div class="grid-2">
        <div class="panel">
          <h3 class="ck-h">document</h3>
          <textarea class="code" spellcheck="false" data-input></textarea>
        </div>
        <div class="panel">
          <h3 class="ck-h">chunked output <span class="stat" data-stats></span></h3>
          <div class="ck-doc" data-doc></div>
        </div>
      </div>

      <div class="panel">
        <h3 class="ck-h">similarity seismograph
          <span class="stat">bar height = 1 − cosine(segment<sub>i-1</sub>, segment<sub>i</sub>) · dashed line = threshold · red = cut</span>
        </h3>
        <div class="ck-chart" data-chart></div>
        <p class="stat ck-chart-note" data-chart-note></p>
      </div>

      <div class="panel">
        <h3 class="ck-h">fixed-size baseline <span class="stat" data-full-stats></span></h3>
        <p class="hint">A real <code>full({ split })</code> call, run on the same document — no boundary detection, no embedder,
          just hard slices every <b><span data-full-val>400</span></b> characters. Compare its chunk count and boundaries (dashed
          lines below) against the semantic cuts above: <code>full()</code> can split mid-sentence and never respects topic
          boundaries, which is exactly the gap <code>semantic()</code> exists to close.</p>
        <label class="field">slice size (chars)<input type="range" min="60" max="1200" step="20" value="400" data-f="fullSplit"></label>
        <div class="ck-doc ck-doc-baseline" data-full-doc></div>
      </div>

      <div class="panel ck-explain">
        <h3 class="ck-h">what's happening</h3>
        <p><b>Streaming.</b> <code>sentence({ splitMode })</code> is first run with the library's default null embedder just to
        segment the text; the segments are then streamed through the active embedder with
        <code>mapConcurrentAsync(embed, segments, { concurrency, ordered: true, signal })</code> from <code>@johnhenry/iteration</code>
        — bounded parallelism, input order preserved, and a stale run is aborted the moment you type again. Embeddings are cached per
        (embedder, segment), so only new or edited segments are re-embedded.</p>
        <p><b>Real embedder (opt-in).</b> "Use a real embedder" dynamically imports <code>@huggingface/transformers</code> from jsDelivr
        at runtime (it is not a dependency of this site) and hands the imported module straight to the library's own
        <code>xenova()</code> factory from its <code>embed/xenova</code> subpath, loading <code>Xenova/all-MiniLM-L6-v2</code> — the same
        default model the library's Agentic method uses. As of 0.0.1 (issue #11, closed by PR #12) <code>xenova(options)</code> does no
        work at import time and never imports a transformers package itself — it takes your already-imported <code>pipeline</code> (or
        the whole module) and a model id, and returns a plain BYOE <code>(text) =&gt; Promise&lt;number[]&gt;</code> that does the real
        feature-extraction, mean pooling and normalize on first call. This planet only wraps that in a call-serializing queue for the
        single-threaded WASM session; the embedding math itself is the library's, not a reimplementation.</p>
        <p><code>@johnhenry/semantic-chunker</code> is BYOE — bring your own embedder. It never ships a model; by default every
        segment below is embedded by a
        <b>toy 256-dim hashed bag-of-words vector</b> — lowercase, crude-stem, feature-hash each token into a
        bucket, count term frequency, then L2-normalize. It's fast, deterministic, and has zero network calls —
        and it's a stand-in for the real <code>embed/xenova</code> adapter above (or the package's <code>embed/ollama</code> adapter),
        not a substitute for one. Expect coarse but real topic drift on the presets, and don't expect nuance.</p>
        <p>The pipeline: <code>sentence()</code> segments the document (a real library export) and the stream above embeds it. Its neighbour-pair cosine similarities become <code>dropoff = 1 − similarity</code> —
        exactly what <code>semantic()</code> computes internally. Then the method you pick calls the matching
        <code>dropoffMethods.findSignificantDropoffs&lt;Name&gt;</code> export directly on those dropoffs to find
        boundaries. <code>Agentic</code> is greyed out: it re-embeds candidate boundaries with a real
        transformers.js model, which this toy embedder can't stand in for.</p>
        <p><b>Ollama (opt-in).</b> The library's own <code>embed/ollama</code> subpath does <code>import { Ollama } from "ollama"</code>,
        a Node-oriented client that isn't installed here as a browser dependency. Rather than pull that in, "Connect to Ollama"
        sends the exact same request that client sends — <code>POST /api/embeddings</code> with
        <code>{ model: "nomic-embed-text:latest", prompt }</code> — straight from <code>fetch()</code> to whatever base URL you give
        it. It's a real local model, not a simulation, but it only reaches a server that allows this page's origin: start Ollama
        with <code>OLLAMA_ORIGINS=*</code> (or this site's origin) set, and have <code>nomic-embed-text</code> pulled.</p>
        <p><b>Fixed-size baseline.</b> The panel below runs the library's own <code>full({ split })</code> export — the chunker's
        simplest strategy, with no embedder and no boundary detection: it just slices the document every <code>split</code>
        characters via the library's internal splitter. It's what "chunking" means before you have an embedder at all, and it's
        the honest baseline every dropoff method above is trying to beat.</p>
      </div>`;
    host.innerHTML = '';
    host.appendChild(root);

    const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
    const ta = $<HTMLTextAreaElement>('[data-input]');
    const splitModeSel = $<HTMLSelectElement>('[data-f=splitMode]');
    const methodSel = $<HTMLSelectElement>('[data-f=method]');
    const paramsEl = $<HTMLElement>('[data-params]');
    const overlapIn = $<HTMLInputElement>('[data-f=overlap]');
    const minIn = $<HTMLInputElement>('[data-f=minChunkSize]');
    const maxIn = $<HTMLInputElement>('[data-f=maxChunkSize]');
    const docEl = $<HTMLElement>('[data-doc]');
    const statsEl = $<HTMLElement>('[data-stats]');
    const chartEl = $<HTMLElement>('[data-chart]');
    const chartNoteEl = $<HTMLElement>('[data-chart-note]');
    const concIn = $<HTMLInputElement>('[data-f=conc]');
    const latIn = $<HTMLInputElement>('[data-f=lat]');
    const concVal = $<HTMLElement>('[data-conc-val]');
    const latVal = $<HTMLElement>('[data-lat-val]');
    const pFill = $<HTMLElement>('[data-pfill]');
    const pStats = $<HTMLElement>('[data-pstats]');
    const loadRealBtn = $<HTMLButtonElement>('[data-load-real]');
    const realRadio = $<HTMLInputElement>('[data-real-radio]');
    const realState = $<HTMLElement>('[data-real-state]');
    const dlEl = $<HTMLElement>('[data-dl]');
    const spintaxBtn = $<HTMLButtonElement>('[data-preset=spintax]');
    const copyBtn = $<HTMLButtonElement>('[data-copy]');
    const ollamaRadio = $<HTMLInputElement>('[data-ollama-radio]');
    const ollamaState = $<HTMLElement>('[data-ollama-state]');
    const ollamaUrlIn = $<HTMLInputElement>('[data-ollama-url]');
    const connectOllamaBtn = $<HTMLButtonElement>('[data-connect-ollama]');
    const ollamaDlEl = $<HTMLElement>('[data-ollama-dl]');
    const fullSplitIn = $<HTMLInputElement>('[data-f=fullSplit]');
    const fullValEl = $<HTMLElement>('[data-full-val]');
    const fullStatsEl = $<HTMLElement>('[data-full-stats]');
    const fullDocEl = $<HTMLElement>('[data-full-doc]');

    // ---- send chunks to Laya ----
    const toLaya = handoffButton({
      from: 'chunker',
      to: 'laya',
      kind: 'chunker-chunks',
      label: 'Send chunks to Laya',
      getPayload: () => ({ chunks: lastChunks.map((c) => c.text) }),
    });
    toLaya.title = 'Runs the moderationQuestions() preset in Laya Playground against every current chunk';
    toLaya.disabled = true;
    root.querySelector('.ck-presets')!.appendChild(toLaya);

    // ---- send chunks to Hashish, to find near-duplicate chunks ----
    const toHashishDedupe = handoffButton({
      from: 'chunker',
      to: 'hashish',
      kind: 'chunker-chunks-dedupe',
      label: 'Send chunks to Hashish',
      getPayload: () => ({ chunks: lastChunks.map((c) => c.text) }),
    });
    toHashishDedupe.title = 'Indexes every current chunk in Hashish Lab (MinHash + LSH) to find near-duplicate chunks';
    toHashishDedupe.disabled = true;
    root.querySelector('.ck-presets')!.appendChild(toHashishDedupe);

    // ---- embedders + cache ----
    type EmbedderId = 'toy' | 'minilm' | 'ollama';
    let embedderId: EmbedderId = 'toy';
    let realEmbed: ((t: string) => Promise<number[]>) | null = null;
    let ollamaEmbed: ((t: string) => Promise<number[]>) | null = null;
    const cache = new Map<string, number[]>();
    const cacheKey = (id: EmbedderId, t: string) => `${id}\u0000${t}`;
    let destroyed = false;
    let runAbort: AbortController | null = null;
    let lastChunks: { text: string }[] = [];
    let fullBaselineToken = 0;

    // ---- spintax handoff ----
    let spintaxDoc: SpintaxDocument | null = null;
    try {
      const saved = sessionStorage.getItem(SPINTAX_DOC_KEY);
      if (saved) spintaxDoc = JSON.parse(saved);
    } catch { /* ignore */ }
    const handoff = receive<SpintaxDocument>('chunker');
    if (handoff && handoff.kind === 'spintax-document' && typeof handoff.payload?.document === 'string') {
      spintaxDoc = handoff.payload;
      try { sessionStorage.setItem(SPINTAX_DOC_KEY, JSON.stringify(spintaxDoc)); } catch { /* ignore */ }
      const order = (spintaxDoc.topics ?? []).map((t) => `<b>${escapeHtml(t)}</b>`).join(' → ');
      root.prepend(
        handoffBanner(
          handoff,
          `<span>Loaded a topic-shifting spintax document (${order}) as the <b>Spintax document</b> preset. Each paragraph break is a topic shift —
           ▼ markers on the seismograph show where the true shifts are, so you can see which methods cut there.</span>`,
        ),
      );
    }
    if (spintaxDoc) spintaxBtn.hidden = false;

    // ---- deep link ----
    const stateDefaults = { preset: 'wiki', split: '', method: 'SD', overlap: 0, min: 0, max: 0, conc: 4, lat: 15, emb: 'toy', full: 400, pr: {} as Record<string, number> };
    const linked = readState(stateDefaults);
    let currentPreset = String(linked.preset);
    if (handoff && spintaxDoc && handoff.kind === 'spintax-document') currentPreset = 'spintax';

    ta.value = PRESET_WIKI;
    methodSel.value = 'SD';

    function currentMethodDef(): MethodDef {
      return METHODS.find((m) => m.key === (methodSel.value as DropoffMethod)) ?? METHODS[0];
    }

    function renderParams(values: Record<string, number> = {}) {
      const def = currentMethodDef();
      paramsEl.innerHTML = def.params
        .map((p) => `<label class="field">${p.label}<input type="number" step="${p.step}" ${p.min != null ? `min="${p.min}"` : ''} value="${Number.isFinite(values[p.key]) ? values[p.key] : p.default}" data-param="${p.key}"></label>`)
        .join('') || '<span class="stat">no parameters</span>';
    }

    function saveState() {
      const pr: Record<string, number> = {};
      root.querySelectorAll<HTMLInputElement>('[data-param]').forEach((el) => {
        const def = currentMethodDef().params.find((p) => p.key === el.dataset.param);
        if (def && Number(el.value) !== def.default) pr[el.dataset.param!] = Number(el.value);
      });
      writeState(
        {
          preset: currentPreset,
          split: splitModeSel.value === ({ meeting: 'paragraph', readme: 'markdown' } as Record<string, string>)[currentPreset] || (splitModeSel.value === 'sentence' && !['meeting', 'readme'].includes(currentPreset)) ? '' : splitModeSel.value,
          method: methodSel.value,
          overlap: Number(overlapIn.value) || 0,
          min: Number(minIn.value) || 0,
          max: Number(maxIn.value) || 0,
          conc: Number(concIn.value),
          lat: Number(latIn.value),
          emb: embedderId,
          full: Number(fullSplitIn.value) || 400,
          pr,
        },
        stateDefaults,
      );
    }

    /** Segment indices (pair indices, as in Dropoff.index) where a new spintax paragraph — i.e. a new topic — starts. */
    function trueShifts(corpus: EmbeddedChunk[]): Set<number> {
      const out = new Set<number>();
      if (!spintaxDoc || ta.value !== spintaxDoc.document) return out;
      const paraStarts = spintaxDoc.document.split(/\n\s*\n/).slice(1).map((p) => p.trim().slice(0, 24));
      corpus.forEach(([seg], i) => {
        if (i > 0 && paraStarts.some((ps) => seg.trim().startsWith(ps))) out.add(i);
      });
      return out;
    }

    let timer: number | undefined;
    let version = 0;
    function schedule(delay = 260) {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(run, delay);
    }

    async function run() {
      const myVersion = ++version;
      const text = ta.value;
      const splitMode = splitModeSel.value as SplitMode;
      const def = currentMethodDef();
      const overlap = Math.max(0, Number(overlapIn.value) || 0);
      const minChunkSize = Math.max(0, Number(minIn.value) || 0);
      const maxChunkSize = Math.max(0, Number(maxIn.value) || 0);
      const paramValues: Record<string, number> = {};
      root.querySelectorAll<HTMLInputElement>('[data-param]').forEach((el) => {
        paramValues[el.dataset.param!] = Number(el.value);
      });

      try {
        if (!text.trim()) {
          docEl.innerHTML = '<p class="stat">Nothing to chunk yet — type something on the left.</p>';
          statsEl.textContent = '';
          chartEl.innerHTML = '';
          chartNoteEl.textContent = '';
          return;
        }

        // 1) segment with the library itself (default null embedder)…
        const segments: string[] = [];
        for await (const [seg] of sentence({ splitMode })(text)) segments.push(seg);
        if (myVersion !== version) return;

        // 2) …then stream the segments through the embedder with bounded concurrency.
        runAbort?.abort();
        const ac = new AbortController();
        runAbort = ac;
        const id: EmbedderId = embedderId === 'minilm' && realEmbed ? 'minilm' : embedderId === 'ollama' && ollamaEmbed ? 'ollama' : 'toy';
        const conc = Math.max(1, Number(concIn.value) || 1);
        const lat = Math.max(0, Number(latIn.value) || 0);
        let done = 0, inFlight = 0, peak = 0, cached = 0;
        const t0 = performance.now();
        const label = id === 'minilm' ? 'all-MiniLM-L6-v2' : id === 'ollama' ? 'ollama: nomic-embed-text' : 'toy hashed BoW';
        const paintProgress = (final = false) => {
          pFill.style.width = `${segments.length ? (done / segments.length) * 100 : 100}%`;
          pFill.classList.toggle('live', !final);
          pStats.innerHTML = `${final ? 'embedded' : 'embedding'} <b>${done}</b> / ${segments.length} segments with <b>${label}</b> · in flight <b>${inFlight}</b> (peak ${peak}, limit ${conc}) · cache hits <b>${cached}</b> · ${(performance.now() - t0).toFixed(0)} ms`;
        };
        const embedOne = async (seg: string): Promise<EmbeddedChunk> => {
          const key = cacheKey(id, seg);
          const hit = cache.get(key);
          if (hit) { cached++; return [seg, hit]; }
          inFlight++;
          peak = Math.max(peak, inFlight);
          paintProgress();
          try {
            let vec: number[];
            if (id === 'minilm' && realEmbed) vec = await realEmbed(seg);
            else if (id === 'ollama' && ollamaEmbed) vec = await ollamaEmbed(seg);
            else {
              if (lat > 0) await sleep(lat * (0.5 + Math.random()));
              vec = hashEmbed(seg);
            }
            if (cache.size > 4000) cache.clear();
            cache.set(key, vec);
            return [seg, vec];
          } finally {
            inFlight--;
          }
        };
        const corpus: EmbeddedChunk[] = [];
        paintProgress();
        try {
          for await (const item of mapConcurrentAsync(embedOne, segments, { concurrency: conc, ordered: true, signal: ac.signal })) {
            if (myVersion !== version || destroyed) return;
            corpus.push(item);
            done++;
            paintProgress();
          }
        } catch (err) {
          if (ac.signal.aborted || myVersion !== version || destroyed) return;
          throw err;
        }
        if (myVersion !== version || destroyed) return;
        paintProgress(true);

        const dropoffs: Dropoff[] = [];
        for (let i = 1; i < corpus.length; i++) {
          const sim = cosine(corpus[i - 1][1], corpus[i][1]);
          dropoffs.push({ index: i, dropoff: 1 - sim, text: corpus[i][0] });
        }

        let boundaries: number[] = [];
        if (def.disabled) {
          chartNoteEl.textContent = 'Agentic is disabled in this planet (see "what\'s happening" below) — showing raw similarity only.';
        } else if (dropoffs.length > 0) {
          const fn = (dropoffMethods as Record<string, (d: Dropoff[], ...a: number[]) => number[] | Promise<number[]>>)[
            `findSignificantDropoffs${def.key}`
          ];
          const args = def.params.map((p) => paramValues[p.key] ?? p.default);
          boundaries = fn ? await fn(dropoffs, ...args) : [];
          if (maxChunkSize > 0 || minChunkSize > 0) {
            boundaries = enforceChunkSizeLocal(corpus, boundaries, dropoffs, maxChunkSize, minChunkSize);
          }
          chartNoteEl.textContent = '';
        }

        const chunks = groupChunks(corpus, boundaries, overlap);
        lastChunks = chunks;
        toLaya.disabled = !chunks.length;
        toHashishDedupe.disabled = !chunks.length;

        // --- render document ---
        docEl.innerHTML = chunks.length
          ? chunks
              .map(
                (c, i) =>
                  `<div class="ck-chunk" style="--tint:${(i * 47) % 360}"><span class="ck-chunk-idx">chunk ${i + 1} · ${c.text.length} chars</span>${escapeHtml(c.text)}</div>`,
              )
              .join('')
          : '<p class="stat">Single segment, no boundaries found.</p>';

        // --- stats ---
        if (chunks.length) {
          const sizes = chunks.map((c) => c.text.length);
          const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
          statsEl.textContent = `${chunks.length} chunk${chunks.length === 1 ? '' : 's'} · mean ${mean.toFixed(0)} · min ${Math.min(...sizes)} · max ${Math.max(...sizes)} chars`;
        } else {
          statsEl.textContent = '';
        }

        // --- seismograph ---
        const dvals = dropoffs.map((d) => d.dropoff);
        if (dvals.length === 0) {
          chartEl.innerHTML = '<p class="stat">Need at least two segments to compare.</p>';
        } else {
          const cutSet = new Set(boundaries);
          const threshold = def.disabled ? { type: 'none' as const } : thresholdInfo(def.key, dvals, paramValues);
          const shifts = trueShifts(corpus);
          chartEl.innerHTML = renderChart(dvals, cutSet, threshold, shifts);
          if (shifts.size) {
            const hitCount = [...shifts].filter((i) => cutSet.has(i)).length;
            statsEl.textContent += ` · ${hitCount}/${shifts.size} topic shifts cut`;
          }
          if (threshold.type === 'none' && !def.disabled) {
            chartNoteEl.textContent = 'This method doesn\'t reduce to a single similarity threshold (it\'s shape- or position-based) — cuts are still marked in red.';
          }
        }

        void runFullBaseline(text, chunks.length);
      } catch (err) {
        docEl.innerHTML = `<pre class="code error">${escapeHtml(err instanceof Error ? `${err.name}: ${err.message}` : String(err))}</pre>`;
        chartEl.innerHTML = '';
        statsEl.textContent = '';
      }
    }

    /** Runs the library's own full({ split }) fixed-size baseline chunker on the same text,
     *  purely for comparison — no embedder, no boundary detection, just hard character slices. */
    async function runFullBaseline(text: string, semanticChunkCount: number) {
      const myToken = ++fullBaselineToken;
      const splitSize = Math.max(20, Number(fullSplitIn.value) || 400);
      fullValEl.textContent = String(splitSize);
      if (!text.trim()) {
        fullDocEl.innerHTML = '<p class="stat">Nothing to chunk yet.</p>';
        fullStatsEl.textContent = '';
        return;
      }
      try {
        const slices: string[] = [];
        for await (const [chunk] of full({ split: splitSize })(text)) {
          if (myToken !== fullBaselineToken || destroyed) return;
          slices.push(chunk);
        }
        if (myToken !== fullBaselineToken || destroyed) return;
        fullDocEl.innerHTML = slices.length
          ? slices
              .map((s, i) => `<div class="ck-chunk ck-chunk-flat"><span class="ck-chunk-idx">slice ${i + 1} · ${s.length} chars</span>${escapeHtml(s)}</div>`)
              .join('')
          : '<p class="stat">Single slice, text is shorter than the slice size.</p>';
        const diff = slices.length - semanticChunkCount;
        const diffLabel = diff === 0 ? 'same count as semantic' : diff > 0 ? `${diff} more than semantic's ${semanticChunkCount}` : `${-diff} fewer than semantic's ${semanticChunkCount}`;
        fullStatsEl.textContent = `${slices.length} slice${slices.length === 1 ? '' : 's'} of ≤${splitSize} chars · ${diffLabel}`;
      } catch (err) {
        if (myToken !== fullBaselineToken || destroyed) return;
        fullDocEl.innerHTML = `<pre class="code error">${escapeHtml(err instanceof Error ? `${err.name}: ${err.message}` : String(err))}</pre>`;
        fullStatsEl.textContent = '';
      }
    }

    function renderChart(dvals: number[], cutSet: Set<number>, threshold: Threshold, shifts: Set<number> = new Set()): string {
      const n = dvals.length;
      const W = Math.max(360, n * 26);
      const H = 160;
      const pad = 6;
      const thrMax = threshold.type === 'line' ? threshold.value : threshold.type === 'curve' ? Math.max(...threshold.values) : 0;
      const maxV = Math.max(...dvals, thrMax, 0.02) * 1.15;
      const barW = (W - pad * 2) / n;
      const y = (v: number) => H - pad - (v / maxV) * (H - pad * 2);

      let bars = '';
      for (let i = 0; i < n; i++) {
        const pairIndex = i + 1; // matches library's Dropoff.index
        const isCut = cutSet.has(pairIndex);
        const x = pad + i * barW;
        const top = y(dvals[i]);
        bars += `<rect x="${(x + barW * 0.12).toFixed(1)}" y="${top.toFixed(1)}" width="${(barW * 0.76).toFixed(1)}" height="${Math.max(1, H - pad - top).toFixed(1)}" class="${isCut ? 'ck-bar-cut' : 'ck-bar'}"><title>segments ${i}→${i + 1}: dropoff ${dvals[i].toFixed(3)}${isCut ? ' — CUT' : ''}</title></rect>`;
        if (isCut) {
          const cx = (x + barW).toFixed(1);
          bars += `<line x1="${cx}" y1="0" x2="${cx}" y2="${H}" class="ck-cutline" />`;
        }
        if (shifts.has(pairIndex)) {
          const mx = x + barW / 2;
          bars += `<path d="M${(mx - 5).toFixed(1)},1 L${(mx + 5).toFixed(1)},1 L${mx.toFixed(1)},9 Z" class="ck-shift ${isCut ? 'hit' : 'miss'}"><title>true topic shift (spintax paragraph break)${isCut ? ' — cut here ✓' : ' — missed'}</title></path>`;
        }
      }

      let thr = '';
      if (threshold.type === 'line') {
        const ty = y(threshold.value).toFixed(1);
        thr = `<line x1="0" y1="${ty}" x2="${W}" y2="${ty}" class="ck-threshold" />`;
      } else if (threshold.type === 'curve') {
        const pts = threshold.values.map((v, i) => `${(pad + i * barW + barW / 2).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        thr = `<polyline points="${pts}" class="ck-threshold" fill="none" />`;
      }

      return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" class="ck-svg">${bars}${thr}</svg>`;
    }

    function markPreset() {
      root.querySelectorAll<HTMLElement>('[data-preset]').forEach((b) => b.classList.toggle('primary', b.dataset.preset === currentPreset));
    }
    function applyPreset(id: string): boolean {
      if (id === 'wiki') { ta.value = PRESET_WIKI; splitModeSel.value = 'sentence'; }
      else if (id === 'meeting') { ta.value = PRESET_MEETING; splitModeSel.value = 'paragraph'; }
      else if (id === 'readme') { ta.value = PRESET_README; splitModeSel.value = 'markdown'; }
      else if (id === 'spintax' && spintaxDoc) { ta.value = spintaxDoc.document; splitModeSel.value = 'sentence'; }
      else return false;
      currentPreset = id;
      markPreset();
      return true;
    }
    function loadPreset(id: string) {
      applyPreset(id);
      saveState();
      schedule(0);
    }

    const onPresetClick = (e: Event) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-preset]');
      if (btn) loadPreset(btn.dataset.preset!);
    };
    const onInput = () => {
      if (currentPreset !== 'custom') { currentPreset = 'custom'; markPreset(); saveState(); }
      schedule();
    };
    const onMethodChange = () => { renderParams(); saveState(); schedule(0); };
    const onParamsInput = (e: Event) => { if ((e.target as HTMLElement).matches('[data-param]')) { saveState(); schedule(0); } };
    const onControl = () => { saveState(); schedule(0); };
    const onConc = () => { concVal.textContent = concIn.value; saveState(); schedule(0); };
    const onLat = () => { latVal.textContent = latIn.value; saveState(); };
    const onEmbPick = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.name !== 'ck-emb') return;
      embedderId = t.value as EmbedderId;
      saveState();
      schedule(0);
    };
    const onCopy = async () => {
      saveState();
      await sleep(180);
      await copyLink();
      copyBtn.textContent = '✓ copied';
      setTimeout(() => { copyBtn.textContent = '🔗 copy link'; }, 1400);
    };
    const onLoadReal = async () => {
      loadRealBtn.disabled = true;
      const usingWebGPU = supportsWebGPU();
      loadRealBtn.textContent = '⏳ loading transformers.js from jsDelivr…';
      dlEl.hidden = false;
      dlEl.innerHTML = `<div class="ck-dl-files" data-dl-files></div><p class="stat">Live per-file download progress from transformers.js' own <code>progress_callback</code>, forwarded through <code>xenova({ pipelineOptions })</code> (issue #13). Device: <code>${usingWebGPU ? 'webgpu' : 'wasm (no navigator.gpu — falling back)'}</code>.</p>`;
      const filesEl = dlEl.querySelector('[data-dl-files]') as HTMLElement;
      const rows = new Map<string, { row: HTMLElement; bar: HTMLElement; pct: HTMLElement }>();
      const rowFor = (file: string) => {
        let r = rows.get(file);
        if (!r) {
          const row = document.createElement('div');
          row.className = 'ck-dl-row';
          row.innerHTML = `<span class="ck-dl-file">${escapeHtml(file)}</span><span class="ck-dl-bar"><span class="ck-dl-live"></span></span><span class="ck-dl-pct">…</span>`;
          filesEl.appendChild(row);
          r = {
            row,
            bar: row.querySelector('.ck-dl-bar > span') as HTMLElement,
            pct: row.querySelector('.ck-dl-pct') as HTMLElement,
          };
          rows.set(file, r);
        }
        return r;
      };
      try {
        const fn = await loadRealEmbedder(
          (ev) => {
            if (destroyed) return;
            const file = ev.file ?? REAL_MODEL;
            const r = rowFor(file);
            if (ev.status === 'initiate') {
              r.bar.classList.add('ck-dl-live');
              r.pct.textContent = 'starting…';
            } else if (ev.status === 'progress') {
              r.bar.classList.remove('ck-dl-live');
              const pct = Math.round(ev.progress ?? 0);
              r.bar.style.width = `${pct}%`;
              const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
              r.pct.textContent = ev.total ? `${pct}% (${mb(ev.loaded ?? 0)}/${mb(ev.total)} MB)` : `${pct}%`;
            } else if (ev.status === 'done') {
              r.bar.classList.remove('ck-dl-live');
              r.bar.style.width = '100%';
              r.pct.textContent = '✓ done';
            }
          },
          (stage) => {
            if (destroyed) return;
            if (stage === 'downloading') {
              loadRealBtn.textContent = '⏳ downloading model + compiling session…';
            } else {
              loadRealBtn.textContent = '✓ real embedder ready';
            }
          },
        );
        if (destroyed) return;
        realEmbed = fn;
        realRadio.disabled = false;
        realRadio.checked = true;
        embedderId = 'minilm';
        realState.textContent = `(loaded — running locally, ${usingWebGPU ? 'WebGPU' : 'WASM'})`;
        loadRealBtn.textContent = '✓ real embedder ready';
        saveState();
        schedule(0);
      } catch (err) {
        if (destroyed) return;
        loadRealBtn.disabled = false;
        loadRealBtn.textContent = '⬇ Retry real embedder';
        dlEl.innerHTML = `<pre class="code error">Couldn't load the real embedder: ${escapeHtml(err instanceof Error ? err.message : String(err))}\nThe toy embedder is still active.</pre>`;
      }
    };

    const onConnectOllama = async () => {
      connectOllamaBtn.disabled = true;
      connectOllamaBtn.textContent = '⏳ connecting…';
      ollamaDlEl.hidden = false;
      const baseUrl = ollamaUrlIn.value.trim() || 'http://localhost:11434';
      ollamaDlEl.innerHTML = `<p class="stat">Sending a real <code>POST ${escapeHtml(baseUrl)}/api/embeddings</code> with <code>{ model: "${OLLAMA_MODEL}" }</code>…</p>`;
      try {
        const fn = loadOllamaEmbedder(baseUrl);
        await fn('warm-up'); // real request: confirms the server is reachable, CORS-allowed, and has the model pulled
        if (destroyed) return;
        ollamaEmbed = fn;
        ollamaRadio.disabled = false;
        ollamaRadio.checked = true;
        embedderId = 'ollama';
        ollamaState.textContent = `(connected — ${baseUrl})`;
        connectOllamaBtn.textContent = '✓ connected';
        ollamaDlEl.innerHTML = `<p class="stat">✓ ${escapeHtml(baseUrl)} answered with a real embedding from <code>${OLLAMA_MODEL}</code>.</p>`;
        saveState();
        schedule(0);
      } catch (err) {
        if (destroyed) return;
        connectOllamaBtn.disabled = false;
        connectOllamaBtn.textContent = '🔌 Retry connect';
        ollamaDlEl.innerHTML = `<pre class="code error">Couldn't reach Ollama at ${escapeHtml(baseUrl)}: ${escapeHtml(err instanceof Error ? err.message : String(err))}\nMake sure "ollama serve" is running with OLLAMA_ORIGINS set to allow this page's origin (a bare CORS rejection shows up here as a generic "Failed to fetch"). The toy embedder is still active.</pre>`;
      }
    };

    root.addEventListener('click', onPresetClick);
    ta.addEventListener('input', onInput);
    splitModeSel.addEventListener('change', onControl);
    methodSel.addEventListener('change', onMethodChange);
    overlapIn.addEventListener('input', onControl);
    minIn.addEventListener('input', onControl);
    maxIn.addEventListener('input', onControl);
    paramsEl.addEventListener('input', onParamsInput);
    concIn.addEventListener('input', onConc);
    latIn.addEventListener('input', onLat);
    latIn.addEventListener('change', onControl);
    root.addEventListener('change', onEmbPick);
    copyBtn.addEventListener('click', onCopy);
    loadRealBtn.addEventListener('click', onLoadReal);
    connectOllamaBtn.addEventListener('click', onConnectOllama);
    fullSplitIn.addEventListener('input', () => { fullValEl.textContent = fullSplitIn.value; void runFullBaseline(ta.value, lastChunks.length); saveState(); });

    // ---- initial state from deep link (+ handoff) ----
    if (!applyPreset(currentPreset)) { currentPreset = 'wiki'; applyPreset('wiki'); }
    if (['sentence', 'paragraph', 'markdown'].includes(String(linked.split)) && !(handoff && currentPreset === 'spintax')) splitModeSel.value = String(linked.split);
    if (METHODS.some((m) => m.key === linked.method && !m.disabled)) methodSel.value = String(linked.method);
    renderParams(typeof linked.pr === 'object' && linked.pr ? (linked.pr as Record<string, number>) : {});
    overlapIn.value = String(Math.max(0, Number(linked.overlap) || 0));
    minIn.value = String(Math.max(0, Number(linked.min) || 0));
    maxIn.value = String(Math.max(0, Number(linked.max) || 0));
    concIn.value = String(Math.min(12, Math.max(1, Number(linked.conc) || 4)));
    latIn.value = String(Math.min(120, Math.max(0, Number(linked.lat) || 0)));
    concVal.textContent = concIn.value;
    latVal.textContent = latIn.value;
    fullSplitIn.value = String(Math.min(1200, Math.max(60, Number(linked.full) || 400)));
    fullValEl.textContent = fullSplitIn.value;
    if (linked.emb === 'minilm') {
      // opt-in stays opt-in: a shared link only *suggests* the real embedder.
      loadRealBtn.classList.add('ck-suggest');
      realState.textContent = '(this link used it — click "Use a real embedder" to download)';
    } else if (linked.emb === 'ollama') {
      connectOllamaBtn.classList.add('ck-suggest');
      ollamaState.textContent = '(this link used it — click "Connect to Ollama" to reconnect)';
    }
    saveState();

    run();

    return () => {
      destroyed = true;
      runAbort?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      root.removeEventListener('change', onEmbPick);
      root.removeEventListener('click', onPresetClick);
      ta.removeEventListener('input', onInput);
      methodSel.removeEventListener('change', onMethodChange);
      paramsEl.removeEventListener('input', onParamsInput);
    };
  },
};

export default playground;
