import type { Playground } from '../registry';
import { readState, writeState, copyLink } from '../state';
import { probeCompanion, hasDemo, companionBanner, type Companion } from '../companion';
import * as W from '@johnhenry/wsh';
import type {
  WshClient, WshSession, WshMessage, QMuxStream, QMuxConnection,
  SessionRecorder, SessionPlaybackController as PlaybackCtl, WshFileOperationResult,
  SessionRecordingJSON, SessionPlayer,
  WshHostVerifyResult, WshMcpToolSpec, WshMcpCallResult,
} from '@johnhenry/wsh';
// The very same restricted host the Node companion serves at ws://…/wsh. Here it
// runs in-page on the far end of a MessageChannel (see server/demos/wsh.mjs).
import { createWshHost, memoryVfs, COMMANDS, MAX_FILE_BYTES } from '../../server/demos/wsh.mjs';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import './wsh.css';

interface HostConn { receive(b: Uint8Array): void; close(): void }
interface HostLike { attach(pipe: { send(b: Uint8Array): void; close(): void }): HostConn; ready: Promise<void>; readonly hostFingerprint: string | null }

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();
const dec = new TextDecoder();
const hex = (b: Uint8Array, max = Infinity) => {
  let s = '';
  const n = Math.min(b.byteLength, max);
  for (let i = 0; i < n; i++) s += b[i].toString(16).padStart(2, '0');
  return s + (b.byteLength > n ? '…' : '');
};
const b64 = (b: Uint8Array) => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmtB = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(2)} MiB`;
const fmtT = (ms: number) => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}
function lp(bytes: Uint8Array) { const o = new Uint8Array(4 + bytes.length); new DataView(o.buffer).setUint32(0, bytes.length); o.set(bytes, 4); return o; }

/* ------------------------------------------------------------------ */
/* QMux wire tap: an independent decoder of the records both ways      */
/* ------------------------------------------------------------------ */

const QX_TP = 0x3f5153300d0a0d0an;
interface Frame { t: string; sid?: number; off?: number; len?: number; fin?: boolean; v?: number; params?: Record<string, number>; reason?: string }

function rv(b: Uint8Array, o: number): { v: number; big: bigint | null; n: number } {
  const f = b[o];
  const n = 1 << (f >> 6);
  if (o + n > b.length) throw new RangeError('truncated varint');
  if (n <= 4) { let v = f & 0x3f; for (let i = 1; i < n; i++) v = v * 256 + b[o + i]; return { v, big: null, n }; }
  let big = BigInt(f & 0x3f);
  for (let i = 1; i < n; i++) big = (big << 8n) | BigInt(b[o + i]);
  return { v: Number(big), big, n };
}
const TP_NAMES: Record<number, string> = { 1: 'max_idle_timeout', 4: 'initial_max_data', 5: 'initial_max_stream_data_bidi_local', 6: 'initial_max_stream_data_bidi_remote', 7: 'initial_max_stream_data_uni', 8: 'initial_max_streams_bidi', 9: 'initial_max_streams_uni', 32: 'max_datagram_frame_size' };

function parseFrames(rec: Uint8Array): Frame[] {
  const out: Frame[] = [];
  let o = 0;
  try {
    while (o < rec.length) {
      const ty = rv(rec, o); o += ty.n;
      const next = () => { const r = rv(rec, o); o += r.n; return r.v; };
      if (ty.big === QX_TP) {
        const len = next(); const end = o + len; const params: Record<string, number> = {};
        while (o < end) { const id = next(); next(); params[TP_NAMES[id] ?? `0x${id.toString(16)}`] = next(); }
        out.push({ t: 'QX_TRANSPORT_PARAMETERS', params }); continue;
      }
      const t = ty.v;
      if (t >= 0x08 && t <= 0x0f) {
        const sid = next(); const off = t & 4 ? next() : 0; const len = t & 2 ? next() : rec.length - o;
        o += len; out.push({ t: 'STREAM', sid, off, len, fin: !!(t & 1) }); continue;
      }
      switch (t) {
        case 0x00: out.push({ t: 'PADDING' }); break;
        case 0x04: { const sid = next(); next(); const v = next(); out.push({ t: 'RESET_STREAM', sid, v }); break; }
        case 0x24: { const sid = next(); next(); const v = next(); next(); out.push({ t: 'RESET_STREAM_AT', sid, v }); break; }
        case 0x05: { const sid = next(); next(); out.push({ t: 'STOP_SENDING', sid }); break; }
        case 0x10: out.push({ t: 'MAX_DATA', v: next() }); break;
        case 0x11: { const sid = next(); out.push({ t: 'MAX_STREAM_DATA', sid, v: next() }); break; }
        case 0x12: case 0x13: out.push({ t: 'MAX_STREAMS', v: next() }); break;
        case 0x14: out.push({ t: 'DATA_BLOCKED', v: next() }); break;
        case 0x15: { const sid = next(); out.push({ t: 'STREAM_DATA_BLOCKED', sid, v: next() }); break; }
        case 0x16: case 0x17: out.push({ t: 'STREAMS_BLOCKED', v: next() }); break;
        case 0x1c: case 0x1d: {
          const v = next(); if (t === 0x1c) next(); const rl = next();
          out.push({ t: 'CONNECTION_CLOSE', v, reason: dec.decode(rec.subarray(o, o + rl)) }); o += rl; break;
        }
        case 0x30: case 0x31: { const len = t & 1 ? next() : rec.length - o; o += len; out.push({ t: 'DATAGRAM', len }); break; }
        default: out.push({ t: `0x${t.toString(16)}?` }); return out;
      }
    }
  } catch { /* partial / unknown: stop */ }
  return out;
}

class RecordSplitter {
  buf = new Uint8Array(0);
  feed(chunk: Uint8Array): Uint8Array[] {
    const m = new Uint8Array(this.buf.length + chunk.length); m.set(this.buf); m.set(chunk, this.buf.length); this.buf = m;
    const recs: Uint8Array[] = [];
    for (;;) {
      if (!this.buf.length) break;
      let sz;
      try { sz = rv(this.buf, 0); } catch { break; }
      if (this.buf.length < sz.n + sz.v) break;
      recs.push(this.buf.subarray(sz.n, sz.n + sz.v));
      this.buf = this.buf.slice(sz.n + sz.v);
    }
    return recs;
  }
}

interface StreamStat {
  id: number; label: string; sentHi: number; recvHi: number;
  peerLimit: number; ourLimit: number; finOut: boolean; finIn: boolean; reset: boolean;
  peerBlocked: number; weBlocked: number; framesIn: number; framesOut: number; last: number;
}
interface TickerLine { dir: 'in' | 'out'; f: Frame; at: number }

class WireStats {
  bytesIn = 0; bytesOut = 0; recIn = 0; recOut = 0;
  dataIn = 0; dataOut = 0;
  ourMaxData = 0; peerMaxData = 0;
  ourStreamWin = 0; peerStreamWin = 0;
  dataBlockedIn = 0; dataBlockedOut = 0;
  maxDataSent = 0; maxStreamDataSent = 0; maxStreamDataRecv = 0;
  streams = new Map<number, StreamStat>();
  ticker: TickerLine[] = [];
  counts: Record<string, { in: number; out: number }> = {};
  labels = new Map<number, string>();
  backlog = 0;
  private splitIn = new RecordSplitter();
  private splitOut = new RecordSplitter();
  dirty = true;

  stream(id: number): StreamStat {
    let s = this.streams.get(id);
    if (!s) {
      s = { id, label: this.labels.get(id) ?? (id === 0 ? 'control · CBOR + pty (virtual)' : `stream ${id}`), sentHi: 0, recvHi: 0, peerLimit: this.peerStreamWin, ourLimit: this.ourStreamWin, finOut: false, finIn: false, reset: false, peerBlocked: 0, weBlocked: 0, framesIn: 0, framesOut: 0, last: performance.now() };
      this.streams.set(id, s);
    }
    return s;
  }
  setLabel(id: number, label: string) { this.labels.set(id, label); const s = this.streams.get(id); if (s) s.label = label; this.dirty = true; }

  tap(dir: 'in' | 'out', bytes: Uint8Array) {
    this.dirty = true;
    if (dir === 'in') this.bytesIn += bytes.length; else this.bytesOut += bytes.length;
    for (const rec of (dir === 'in' ? this.splitIn : this.splitOut).feed(bytes)) {
      if (dir === 'in') this.recIn++; else this.recOut++;
      for (const f of parseFrames(rec)) this.frame(dir, f);
    }
  }

  private frame(dir: 'in' | 'out', f: Frame) {
    const c = (this.counts[f.t] ??= { in: 0, out: 0 }); c[dir]++;
    const now = performance.now();
    switch (f.t) {
      case 'QX_TRANSPORT_PARAMETERS': {
        const p = f.params ?? {};
        if (dir === 'out') { this.ourMaxData = p.initial_max_data ?? 0; this.ourStreamWin = p.initial_max_stream_data_bidi_local ?? 0; }
        else { this.peerMaxData = p.initial_max_data ?? 0; this.peerStreamWin = p.initial_max_stream_data_bidi_remote ?? 0; for (const s of this.streams.values()) if (!s.peerLimit) s.peerLimit = this.peerStreamWin; }
        break;
      }
      case 'STREAM': {
        const s = this.stream(f.sid!); s.last = now;
        if (dir === 'out') { s.sentHi = Math.max(s.sentHi, f.off! + f.len!); s.framesOut++; this.dataOut += f.len!; if (f.fin) s.finOut = true; }
        else { s.recvHi = Math.max(s.recvHi, f.off! + f.len!); s.framesIn++; this.dataIn += f.len!; if (f.fin) s.finIn = true; }
        break;
      }
      case 'MAX_STREAM_DATA': {
        const s = this.stream(f.sid!);
        if (dir === 'out') { s.ourLimit = f.v!; this.maxStreamDataSent++; } else { s.peerLimit = f.v!; this.maxStreamDataRecv++; }
        break;
      }
      case 'MAX_DATA': if (dir === 'out') { this.ourMaxData = f.v!; this.maxDataSent++; } else this.peerMaxData = f.v!; break;
      case 'STREAM_DATA_BLOCKED': { const s = this.stream(f.sid!); if (dir === 'in') s.peerBlocked++; else s.weBlocked++; break; }
      case 'DATA_BLOCKED': if (dir === 'in') this.dataBlockedIn++; else this.dataBlockedOut++; break;
      case 'RESET_STREAM': case 'RESET_STREAM_AT': this.stream(f.sid!).reset = true; break;
    }
    this.ticker.push({ dir, f, at: now });
    if (this.ticker.length > 400) this.ticker.splice(0, 200);
  }
}

/* ------------------------------------------------------------------ */
/* A WshTransport over any ordered byte pipe (WebSocket or MessagePort) */
/* assembled from the exported QMuxConnection + frameEncode/FrameDecoder */
/* + SerialQueue/dispatchSerially — the same pieces WebSocketTransport   */
/* is built from, with taps so the planet can watch the wire.             */
/* ------------------------------------------------------------------ */

interface Pipe { send(b: Uint8Array): void; close(): void }
interface PipeHooks { onbytes(b: Uint8Array): void; onclose(reason: string): void }
type PipeOpener = (hooks: PipeHooks) => Promise<Pipe>;
interface TransportTaps { wire: WireStats; control(dir: 'in' | 'out', msg: WshMessage): void; rate(): number; onStream(id: number): void }

function adaptStream(qs: QMuxStream) {
  const readable = new ReadableStream<Uint8Array>({
    start(ctl) {
      qs.onData = (d) => { try { ctl.enqueue(d); } catch { /* closed */ } };
      qs.onEnd = () => { try { ctl.close(); } catch { /* */ } };
      qs.onReset = (code) => { try { ctl.error(new Error(`stream ${qs.id} reset (${code})`)); } catch { /* */ } };
      qs.onDestroy = (err) => { try { ctl.error(err); } catch { /* */ } };
    },
    cancel() { qs.stopSending(); },
  });
  const writable = new WritableStream<Uint8Array>({
    write: (chunk) => qs.write(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)),
    close: () => qs.close(),
    abort: () => { qs.reset(); },
  });
  return { readable, writable, id: qs.id };
}

class PipeTransport extends W.WshTransport {
  qmux: QMuxConnection | null = null;
  private control: QMuxStream | null = null;
  private decoder = new W.FrameDecoder();
  private inbox = new W.SerialQueue<Uint8Array>((raw) => this.handleControlBytes(raw));
  private pipe: Pipe | null = null;
  private closedByUs = false;
  private backlog: Uint8Array[] = [];
  private backlogBytes = 0;
  private timer = 0;

  constructor(private opener: PipeOpener, private window: number, private taps: TransportTaps) { super(); }

  protected override async _doConnect(_url: string): Promise<void> {
    this.pipe = await this.opener({ onbytes: (b) => this.ingest(b), onclose: (r) => this.handleClose(r) });
    const q = new W.QMuxConnection({
      isClient: true,
      send: (b) => { this.taps.wire.tap('out', b); this.pipe?.send(b); },
      initialMaxStreamData: this.window,
      initialMaxData: this.window * 4,
    });
    this.qmux = q;
    q.onStreamOpen = (qs) => this._emitStreamOpen(adaptStream(qs));
    q.onError = (e) => this._emitError(e);
    q.onClose = (_code, reason) => this.handleClose(reason || 'peer sent CONNECTION_CLOSE');
    q.sendHandshake();
    const cs = await q.openStream();
    cs.onData = (d) => this.inbox.push(d);
    cs.onReset = (code) => this._emitError(new Error(`control stream reset (${code})`));
    this.control = cs;
    this.timer = window.setInterval(() => this.drain(), 25);
  }

  /** Inbound bytes pass through an optional rate limiter: a deliberately slow consumer. */
  private ingest(b: Uint8Array) {
    if (!this.taps.rate() && !this.backlog.length) { this.deliver(b); return; }
    this.backlog.push(b); this.backlogBytes += b.length; this.taps.wire.backlog = this.backlogBytes;
  }
  private drain() {
    if (!this.backlog.length) return;
    const rate = this.taps.rate();
    let budget = rate ? Math.max(1, Math.round(rate * 0.025)) : Infinity;
    while (budget > 0 && this.backlog.length) {
      const head = this.backlog[0];
      if (head.length <= budget) { this.backlog.shift(); budget -= head.length; this.backlogBytes -= head.length; this.deliver(head); }
      else { this.backlog[0] = head.subarray(budget); this.backlogBytes -= budget; this.deliver(head.subarray(0, budget)); budget = 0; }
    }
    this.taps.wire.backlog = this.backlogBytes;
    this.taps.wire.dirty = true;
  }
  private deliver(b: Uint8Array) {
    if (!this.qmux) return;
    this.taps.wire.tap('in', b);
    this.qmux.receiveBytes(b);
  }

  protected override async _doClose(): Promise<void> {
    this.closedByUs = true;
    clearInterval(this.timer);
    try { this.qmux?.close(); } catch { /* */ }
    try { this.qmux?.destroy(new Error('transport closed')); } catch { /* */ }
    try { this.pipe?.close(); } catch { /* */ }
    this.pipe = null;
  }

  protected override async _doSendControl(msg: object): Promise<void> {
    if (!this.control) throw new Error('control stream is not open');
    this.taps.control('out', msg as WshMessage);
    await this.control.write(W.frameEncode(msg));
  }

  protected override async _doOpenStream() {
    const qs = await this.qmux!.openStream();
    this.taps.onStream(qs.id);
    return adaptStream(qs);
  }

  private async handleControlBytes(p: Uint8Array) {
    let msgs: WshMessage[];
    try { msgs = this.decoder.feed(p) as WshMessage[]; } catch (e) { this._emitError(e as Error); return; }
    await W.dispatchSerially(msgs, (m: WshMessage) => { this.taps.control('in', m); this._emitControl(m); });
  }

  private handleClose(reason: string) {
    clearInterval(this.timer);
    if (this.state === 'closed') return;
    try { this.qmux?.destroy(new Error(reason)); } catch { /* */ }
    this._setState('closed');
    if (!this.closedByUs) this._emitError(new Error(reason));
    this._emitClose();
  }
}

function wsPipe(url: string): PipeOpener {
  return (h) => new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    let open = false;
    ws.onopen = () => { open = true; resolve({ send: (b) => { if (ws.readyState === 1) ws.send(b); }, close: () => { try { ws.close(1000, 'client close'); } catch { /* */ } } }); };
    ws.onerror = () => { if (!open) reject(new Error(`WebSocket to ${url} failed`)); };
    ws.onmessage = (e) => { if (typeof e.data !== 'string') h.onbytes(new Uint8Array(e.data as ArrayBuffer)); };
    ws.onclose = (e) => { if (open) h.onclose(`WebSocket closed (${e.code}${e.reason ? ' ' + e.reason : ''})`); };
  });
}

function channelPipe(host: HostLike): PipeOpener {
  return async (h) => {
    const mc = new MessageChannel();
    let closed = false;
    const hostConn = host.attach({
      send: (b) => { if (!closed) mc.port2.postMessage(b.slice()); },
      close: () => { if (closed) return; closed = true; setTimeout(() => { mc.port1.close(); mc.port2.close(); h.onclose('in-page host closed the channel'); }, 0); },
    });
    mc.port2.onmessage = (e) => hostConn.receive(e.data as Uint8Array);
    mc.port1.onmessage = (e) => h.onbytes(e.data as Uint8Array);
    return {
      send: (b) => { if (!closed) mc.port1.postMessage(b.slice()); },
      close: () => { if (closed) return; closed = true; hostConn.close(); mc.port1.close(); mc.port2.close(); },
    };
  };
}

/* ------------------------------------------------------------------ */
/* Identity (Ed25519 in localStorage)                                  */
/* ------------------------------------------------------------------ */

const KEY_LS = 'orrery.wsh.identity.v1';
interface Identity { keyPair: CryptoKeyPair; raw: Uint8Array; fp: string; ssh: string; created: number }

async function loadOrCreateIdentity(forceNew = false): Promise<Identity> {
  if (!forceNew) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY_LS) || 'null');
      if (saved?.pkcs8 && saved?.raw) {
        const raw = unb64(saved.raw);
        const privateKey = await W.importPrivateKeyPKCS8(unb64(saved.pkcs8), false);
        const publicKey = await W.importPublicKeyRaw(raw);
        return { keyPair: { privateKey, publicKey }, raw, fp: await W.fingerprint(raw), ssh: await W.exportPublicKeySSH(publicKey), created: saved.created ?? Date.now() };
      }
    } catch { /* fall through to generate */ }
  }
  const kp = await W.generateKeyPair(true);
  const raw = await W.exportPublicKeyRaw(kp.publicKey);
  const pkcs8 = await W.exportPrivateKeyPKCS8(kp.privateKey);
  const created = Date.now();
  try { localStorage.setItem(KEY_LS, JSON.stringify({ pkcs8: b64(pkcs8), raw: b64(raw), created })); } catch { /* private mode */ }
  // Re-import the private half as non-extractable for day-to-day signing.
  const privateKey = await W.importPrivateKeyPKCS8(pkcs8, false);
  return { keyPair: { privateKey, publicKey: kp.publicKey }, raw, fp: await W.fingerprint(raw), ssh: await W.exportPublicKeySSH(kp.publicKey), created };
}

/* ------------------------------------------------------------------ */
/* The planet                                                            */
/* ------------------------------------------------------------------ */

type Mode = 'auto' | 'page' | 'live';
const DEFAULTS = { user: 'guest', mode: 'auto' as string, win: '1m', rate: '0', reg: true };
const WINDOWS: Record<string, number> = { '1m': 1024 * 1024, '64k': 64 * 1024, '8k': 8 * 1024 };
const RATES: Record<string, string> = { '0': 'unthrottled', '262144': '256 KB/s', '65536': '64 KB/s', '16384': '16 KB/s' };
const TYPE_GROUP = (name: string): string => {
  if (/HELLO|CHALLENGE|AUTH/.test(name)) return 'auth';
  if (/PING|PONG/.test(name)) return 'keepalive';
  if (/SESSION_DATA/.test(name)) return 'data';
  if (/FILE/.test(name)) return 'file';
  return 'session';
};

const playground: Playground = {
  id: 'wsh',
  title: 'Web Shell',
  pkg: '@johnhenry/wsh',
  hue: 100,
  blurb: 'A browser-native remote shell: Ed25519 auth, CBOR over QMux, file transfer and asciicast recording.',
  docs: 'https://opensource.johnhenry.me/wsh/',
  async mount(host) {
    const disposers: (() => void)[] = [];
    const root = el('div', { class: 'pg-wsh' });
    host.appendChild(root);
    const state = readState(DEFAULTS);
    const save = () => writeState(state, DEFAULTS);
    let pty: WshSession | null = null;
    let recorder: SessionRecorder | null = null;

    let comp: Companion | null = null;
    try { comp = await probeCompanion(); } catch { comp = null; }
    const live = hasDemo(comp, 'wsh');
    root.appendChild(companionBanner(comp, 'wsh', 'the restricted wsh host from <code>server/demos/wsh.mjs</code> runs in this page on the far end of a <code>MessageChannel</code>, speaking byte-identical QMux + CBOR.'));

    const MSG_NAMES = W.MSG_NAMES as Record<number, string>;
    const msgCount = Object.keys(W.MSG).length;

    /* ---------- layout ---------- */
    const top = el('div', { class: 'top-grid' });
    const idPanel = el('div', { class: 'panel' });
    const cxPanel = el('div', { class: 'panel' });
    top.append(idPanel, cxPanel);
    const termPanel = el('div', { class: 'panel' });
    const hsGrid = el('div', { class: 'grid-2' });
    const hsPanel = el('div', { class: 'panel' });
    const txPanel = el('div', { class: 'panel' });
    hsGrid.append(hsPanel, txPanel);
    const inspPanel = el('div', { class: 'panel' });
    const fileGrid = el('div', { class: 'grid-2' });
    const filePanel = el('div', { class: 'panel' });
    const playPanel = el('div', { class: 'panel' });
    fileGrid.append(filePanel, playPanel);
    const trustGrid = el('div', { class: 'grid-2' });
    const trustPanel = el('div', { class: 'panel' });
    const e2ePanel = el('div', { class: 'panel' });
    const mcpPanel = el('div', { class: 'panel' });
    trustGrid.append(trustPanel, e2ePanel, mcpPanel);
    const explain = el('div', { class: 'panel explain' });
    root.append(top, termPanel, hsGrid, inspPanel, fileGrid, trustGrid, explain);

    /* ---------- identity panel ---------- */
    idPanel.innerHTML = `<h3>Identity <span class="sub">Ed25519 · WebCrypto · localStorage</span></h3>
      <div class="ident"><div class="art"></div><div><div class="muted">SHA-256 fingerprint of the raw public key</div><div class="fp"></div></div></div>
      <div class="sshkey"></div>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-a="copy">copy ssh key</button><button class="btn sm" data-a="new">new key</button><span class="spacer"></span><span class="muted" data-r="age"></span></div>
      <pre class="code err" data-r="iderr"></pre>`;
    const artEl = idPanel.querySelector('.art') as HTMLElement;
    const fpEl = idPanel.querySelector('.fp') as HTMLElement;
    const sshEl = idPanel.querySelector('.sshkey') as HTMLElement;
    const ageEl = idPanel.querySelector('[data-r=age]') as HTMLElement;
    const idErr = idPanel.querySelector('[data-r=iderr]') as HTMLElement;
    let ident: Identity | null = null;
    const renderIdent = () => {
      if (!ident) return;
      const bytes = Uint8Array.from(ident.fp.match(/../g)!.map((h) => parseInt(h, 16)));
      artEl.innerHTML = Array.from(bytes, (b, i) => `<i style="background:hsl(${(b * 1.41 + i * 11) % 360} ${55 + (b % 30)}% ${38 + (b >> 3) % 30}%)"></i>`).join('');
      fpEl.innerHTML = `<b>${ident.fp.slice(0, 16)}</b>${ident.fp.slice(16)}`;
      sshEl.textContent = `${ident.ssh} ${state.user}@orrery`;
      ageEl.textContent = `created ${new Date(ident.created).toLocaleString()}`;
    };
    if (!(await W.isEd25519Supported())) {
      idErr.textContent = 'This browser has no WebCrypto Ed25519 (Safari 17+, Chrome 137+, Firefox 130+). wsh deliberately has no pure-JS fallback, so pubkey auth — and this planet — cannot run here.';
    } else {
      try { ident = await loadOrCreateIdentity(); renderIdent(); } catch (e) { idErr.textContent = String((e as Error).message || e); }
    }
    idPanel.querySelector('[data-a=copy]')!.addEventListener('click', async (e) => { if (!ident) return; try { await navigator.clipboard.writeText(sshEl.textContent || ''); (e.target as HTMLElement).textContent = 'copied ✓'; } catch { /* */ } });
    idPanel.querySelector('[data-a=new]')!.addEventListener('click', async () => {
      try { ident = await loadOrCreateIdentity(true); renderIdent(); log(`generated a new Ed25519 key ${ident.fp.slice(0, 12)}… — it is not on any allowlist until you connect with “register key” on`); } catch (e) { idErr.textContent = String((e as Error).message || e); }
    });

    /* ---------- connect panel ---------- */
    cxPanel.innerHTML = `<h3>Connect <span class="sub">WshClient.connectWithTransport()</span><span class="spacer"></span><span class="status" data-r="status">idle</span></h3>
      <div class="row"><div class="seg" data-r="mode"><button data-m="auto">auto</button><button data-m="page">in-page host</button><button data-m="live">companion</button></div><span class="spacer"></span><button class="btn sm" data-a="link">copy link</button></div>
      <div class="fields"><label class="field">username<input data-r="user" spellcheck="false" autocomplete="off" maxlength="32"></label><label class="field">server URL<input data-r="url" spellcheck="false"></label></div>
      <div class="fields three"><label class="field">our receive window<select data-r="win"><option value="1m">1 MiB / stream (default)</option><option value="64k">64 KiB / stream</option><option value="8k">8 KiB / stream (tight)</option></select></label>
        <label class="field">slow consumer<select data-r="rate">${Object.entries(RATES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        <label class="field">key on host allowlist<span class="row" style="min-height:34px"><label class="check"><input type="checkbox" data-r="reg"> register it first</label></span></label></div>
      <div class="row"><button class="btn primary" data-a="connect">Connect</button><button class="btn" data-a="disconnect" disabled>Disconnect</button><button class="btn" data-a="pty" disabled>new PTY</button><span class="spacer"></span><span class="muted" data-r="where"></span></div>
      <pre class="code err" data-r="err"></pre>`;
    const q = <T extends HTMLElement>(p: HTMLElement, sel: string) => p.querySelector(sel) as T;
    const statusEl = q<HTMLElement>(cxPanel, '[data-r=status]');
    const userIn = q<HTMLInputElement>(cxPanel, '[data-r=user]');
    const urlIn = q<HTMLInputElement>(cxPanel, '[data-r=url]');
    const winSel = q<HTMLSelectElement>(cxPanel, '[data-r=win]');
    const rateSel = q<HTMLSelectElement>(cxPanel, '[data-r=rate]');
    const regChk = q<HTMLInputElement>(cxPanel, '[data-r=reg]');
    const errEl = q<HTMLElement>(cxPanel, '[data-r=err]');
    const whereEl = q<HTMLElement>(cxPanel, '[data-r=where]');
    const btnConnect = q<HTMLButtonElement>(cxPanel, '[data-a=connect]');
    const btnDisconnect = q<HTMLButtonElement>(cxPanel, '[data-a=disconnect]');
    const btnPty = q<HTMLButtonElement>(cxPanel, '[data-a=pty]');
    userIn.value = state.user; winSel.value = WINDOWS[state.win] ? state.win : '1m'; rateSel.value = RATES[state.rate] ? state.rate : '0'; regChk.checked = !!state.reg;
    const modeBtns = [...cxPanel.querySelectorAll<HTMLButtonElement>('[data-m]')];
    const liveUrl = comp ? `${comp.wsBase}/wsh` : 'ws://localhost:7777/wsh';
    const PAGE_URL = 'messagechannel://in-page-host/wsh';
    const effMode = (): 'page' | 'live' => (state.mode === 'live' && live) ? 'live' : state.mode === 'page' ? 'page' : live ? 'live' : 'page';
    const renderMode = () => {
      for (const b of modeBtns) { b.classList.toggle('on', b.dataset.m === state.mode); b.disabled = b.dataset.m === 'live' && !live; }
      const m = effMode();
      urlIn.value = m === 'live' ? (urlIn.dataset.custom || liveUrl) : PAGE_URL;
      urlIn.disabled = m === 'page';
      whereEl.textContent = m === 'live' ? 'real WebSocket → Node companion' : 'MessageChannel → in-page host';
    };
    renderMode();
    for (const b of modeBtns) b.addEventListener('click', () => { state.mode = b.dataset.m as Mode; save(); renderMode(); });
    userIn.addEventListener('input', () => { state.user = userIn.value.trim() || 'guest'; save(); renderIdent(); });
    urlIn.addEventListener('input', () => { urlIn.dataset.custom = urlIn.value; });
    winSel.addEventListener('change', () => { state.win = winSel.value; save(); log('receive window applies from the next connection (it is announced in the QMux transport parameters)'); });
    rateSel.addEventListener('change', () => { state.rate = rateSel.value; save(); });
    regChk.addEventListener('change', () => { state.reg = regChk.checked; save(); });
    q<HTMLButtonElement>(cxPanel, '[data-a=link]').addEventListener('click', async (e) => { await copyLink(); (e.target as HTMLElement).textContent = 'copied ✓'; setTimeout(() => ((e.target as HTMLElement).textContent = 'copy link'), 1500); });
    const setStatus = (text: string, cls: '' | 'ok' | 'busy' | 'bad') => { statusEl.textContent = text; statusEl.className = `status ${cls}`; };

    /* ---------- terminal panel ---------- */
    termPanel.innerHTML = `<h3>Terminal <span class="sub" data-r="tsub">@xterm/xterm · PTY channel, data_mode "virtual"</span><span class="spacer"></span><span class="rec" data-r="rec">not recording</span></h3>
      <div class="term-wrap dim" data-r="term"></div>
      <div class="row" style="margin-top:10px"><span class="muted">type into the PTY:</span><div class="chips" data-r="pchips"></div></div>
      <div class="exec-row"><input data-r="exec" spellcheck="false" value="top -n 4" aria-label="exec command"><button class="btn" data-a="exec" disabled>run as exec →</button></div>
      <div class="row" style="margin-top:6px"><span class="muted">exec presets:</span><div class="chips" data-r="echips"></div></div>
      <pre class="code exec-out" data-r="eout">An exec session gets its own QMux stream (data_mode "stream"). Output lands here, not in the PTY.</pre>
      <div class="exec-meta" data-r="emeta"></div>`;
    const termEl = q<HTMLElement>(termPanel, '[data-r=term]');
    const recEl = q<HTMLElement>(termPanel, '[data-r=rec]');
    const execIn = q<HTMLInputElement>(termPanel, '[data-r=exec]');
    const btnExec = q<HTMLButtonElement>(termPanel, '[data-a=exec]');
    const eout = q<HTMLElement>(termPanel, '[data-r=eout]');
    const emeta = q<HTMLElement>(termPanel, '[data-r=emeta]');
    const cs = getComputedStyle(root);
    const fontFamily = (cs.getPropertyValue('--f-mono').trim() || 'ui-monospace, Menlo, monospace');
    const XTHEME = { background: '#060a16', foreground: '#d6deeb', cursor: '#9be564', cursorAccent: '#060a16', selectionBackground: '#3b4a6b', black: '#1d2433', red: '#ff6b6b', green: '#9be564', yellow: '#f5a524', blue: '#6aa9ff', magenta: '#c792ea', cyan: '#4cc9f0', white: '#d6deeb', brightBlack: '#5c6773', brightRed: '#ff8f8f', brightGreen: '#b8f28a', brightYellow: '#ffd27a', brightBlue: '#9cc6ff', brightMagenta: '#dcb6ff', brightCyan: '#8be3ff', brightWhite: '#ffffff' };
    const ROWS = 22;
    const term = new Terminal({ cols: 80, rows: ROWS, fontFamily, fontSize: 13, theme: XTHEME, cursorBlink: true, scrollback: 3000, allowProposedApi: false });
    term.open(termEl);
    disposers.push(() => term.dispose());
    const charWidth = (() => {
      const c = document.createElement('canvas').getContext('2d')!;
      c.font = `13px ${fontFamily}`;
      return c.measureText('WWWWWWWWWW').width / 10 || 7.8;
    })();
    const fitCols = () => Math.max(40, Math.min(160, Math.floor((termEl.clientWidth - 22) / charWidth)));
    let lastCols = 0;
    const doFit = () => {
      const cols = fitCols();
      if (cols === lastCols) return;
      lastCols = cols;
      term.resize(cols, ROWS);
      if (pty && pty.state === 'active') { pty.resize(cols, ROWS).catch(() => {}); recorder?.record('resize', { cols, rows: ROWS }); }
    };
    const ro = new ResizeObserver(() => doFit());
    ro.observe(termEl);
    disposers.push(() => ro.disconnect());
    doFit();
    term.writeln('\x1b[2mWeb Shell · connecting…\x1b[0m');
    const PTY_CHIPS = ['help', 'ls -l', 'cowsay hello, orrery', 'banner wsh', 'top', 'flood 1024', 'date', 'cat haiku.txt', 'whoami'];
    const EXEC_CHIPS = ['date', 'ls -l', 'top -n 4', 'flood 512', 'cowsay exec says hi', 'rm -rf /'];
    q<HTMLElement>(termPanel, '[data-r=pchips]').innerHTML = PTY_CHIPS.map((c) => `<span class="chip" data-c="${esc(c)}">${esc(c)}</span>`).join('');
    q<HTMLElement>(termPanel, '[data-r=echips]').innerHTML = EXEC_CHIPS.map((c) => `<span class="chip" data-c="${esc(c)}">${esc(c)}</span>`).join('');
    q<HTMLElement>(termPanel, '[data-r=pchips]').addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).dataset.c; if (!c || !pty || pty.state !== 'active') return;
      typeInto(c + '\r'); term.focus();
    });
    q<HTMLElement>(termPanel, '[data-r=echips]').addEventListener('click', (e) => { const c = (e.target as HTMLElement).dataset.c; if (!c) return; execIn.value = c; runExec(); });
    btnExec.addEventListener('click', () => runExec());
    execIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') runExec(); });

    /* ---------- handshake viewer ---------- */
    hsPanel.innerHTML = `<h3>Handshake viewer <span class="sub">every CBOR control message · ${msgCount} types in MSG</span></h3>
      <div class="filters" data-r="filters">${['auth', 'session', 'file', 'data', 'keepalive'].map((g) => `<span class="chip ${g === 'data' || g === 'keepalive' ? '' : 'on'}" data-g="${g}">${g}</span>`).join('')}<span class="spacer"></span><span class="muted" data-r="hscount"></span></div>
      <div class="hs-list" data-r="hs"></div>`;
    const hsList = q<HTMLElement>(hsPanel, '[data-r=hs]');
    const hsCount = q<HTMLElement>(hsPanel, '[data-r=hscount]');
    const shown = new Set(['auth', 'session', 'file']);
    q<HTMLElement>(hsPanel, '[data-r=filters]').addEventListener('click', (e) => {
      const g = (e.target as HTMLElement).dataset.g; if (!g) return;
      if (shown.has(g)) shown.delete(g); else shown.add(g);
      (e.target as HTMLElement).classList.toggle('on', shown.has(g));
      for (const it of hsList.querySelectorAll<HTMLElement>('.hs-item')) it.style.display = shown.has(it.dataset.g!) ? '' : 'none';
    });
    hsList.addEventListener('click', (e) => { const h = (e.target as HTMLElement).closest('.hs-head'); if (h) h.parentElement!.classList.toggle('open'); });

    /* ---------- transcript panel ---------- */
    txPanel.innerHTML = `<h3>Signed transcript <span class="sub">buildTranscript() · verifyChallenge()</span></h3>
      <div class="muted">The client signs <span class="mono">SHA-256("wsh-v1\\0" ‖ lp(username) ‖ lp(session_id) ‖ nonce ‖ channel_binding)</span>. The username is inside the signature, so a captured AUTH can't be relabelled, and the session id + fresh nonce stop replays.</div>
      <div data-r="tx"><div class="muted" style="margin-top:12px">Waiting for a CHALLENGE…</div></div>`;
    const txBody = q<HTMLElement>(txPanel, '[data-r=tx]');

    /* ---------- inspector panel ---------- */
    inspPanel.innerHTML = `<h3>QMux stream inspector <span class="sub">RFC 9000 varints · STREAM / MAX_STREAM_DATA / *_BLOCKED, decoded from the raw records both ways</span></h3>
      <div class="kpis" data-r="kpis"></div>
      <div class="tscroll"><table class="streams"><thead><tr><th>id</th><th>carries</th><th>sent</th><th>recv</th><th>send credit (host's window)</th><th>recv credit (our window)</th><th>host stalled</th><th>state</th></tr></thead><tbody data-r="streams"></tbody></table></div>
      <div class="insp-grid"><div><canvas class="spark" data-r="spark"></canvas><div class="legend"><span><i style="background:var(--seg-d)"></i>bytes in / 250 ms</span><span><i style="background:var(--seg-b)"></i>bytes out</span><span><i style="background:var(--seg-e)"></i>host blocked on our window</span></div></div>
        <div class="ticker" data-r="ticker"></div></div>`;
    const kpisEl = q<HTMLElement>(inspPanel, '[data-r=kpis]');
    const streamsEl = q<HTMLElement>(inspPanel, '[data-r=streams]');
    const tickerEl = q<HTMLElement>(inspPanel, '[data-r=ticker]');
    const spark = q<HTMLCanvasElement>(inspPanel, '[data-r=spark]');

    /* ---------- files panel ---------- */
    filePanel.innerHTML = `<h3>Sandbox files <span class="sub">FILE_OP list/remove · upload/download as FILE_CHUNK</span><span class="spacer"></span><button class="btn sm" data-a="refresh" disabled>refresh</button></h3>
      <table class="files"><tbody data-r="files"><tr><td class="muted">connect to list the sandbox</td></tr></tbody></table>
      <div class="drop" data-r="drop">drop a small file here (≤ ${Math.round(MAX_FILE_BYTES / 1024)} KiB) or click to upload<input type="file" hidden data-r="fin"></div>
      <div class="progress"><i data-r="prog"></i></div>
      <div class="muted" data-r="fmsg" style="margin-top:6px"></div>`;
    const filesBody = q<HTMLElement>(filePanel, '[data-r=files]');
    const drop = q<HTMLElement>(filePanel, '[data-r=drop]');
    const fin = q<HTMLInputElement>(filePanel, '[data-r=fin]');
    const prog = q<HTMLElement>(filePanel, '[data-r=prog]');
    const fmsg = q<HTMLElement>(filePanel, '[data-r=fmsg]');
    const btnRefresh = q<HTMLButtonElement>(filePanel, '[data-a=refresh]');

    /* ---------- playback panel ---------- */
    playPanel.innerHTML = `<h3>asciicast v2 <span class="sub">SessionRecorder → SessionPlayer</span></h3>
      <div class="term-wrap" data-r="pterm"></div>
      <div class="scrub"><canvas data-r="density"></canvas><input type="range" min="0" max="1000" value="0" step="1" data-r="scrub"></div>
      <div class="row" style="margin-top:6px"><button class="btn sm" data-a="play">▶ play</button><select data-r="speed" class="btn sm"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select><span class="ptime" data-r="ptime">0:00.0 / 0:00.0</span><span class="spacer"></span></div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-a="grab">load live recording</button><button class="btn sm" data-a="cast">download .cast</button><label class="btn sm">open .cast<input type="file" accept=".cast,.json,application/json" hidden data-r="castin"></label><span class="muted" data-r="pmeta"></span></div>`;
    const ptermEl = q<HTMLElement>(playPanel, '[data-r=pterm]');
    const density = q<HTMLCanvasElement>(playPanel, '[data-r=density]');
    const scrub = q<HTMLInputElement>(playPanel, '[data-r=scrub]');
    const btnPlay = q<HTMLButtonElement>(playPanel, '[data-a=play]');
    const speedSel = q<HTMLSelectElement>(playPanel, '[data-r=speed]');
    const ptime = q<HTMLElement>(playPanel, '[data-r=ptime]');
    const pmeta = q<HTMLElement>(playPanel, '[data-r=pmeta]');
    const pterm = new Terminal({ cols: 80, rows: 14, fontFamily, fontSize: 11, theme: XTHEME, disableStdin: true, cursorBlink: false, scrollback: 500 });
    pterm.open(ptermEl);
    disposers.push(() => pterm.dispose());

    /* ---------- known hosts (TOFU) ---------- */
    trustPanel.innerHTML = `<h3>Known hosts <span class="sub">WshKnownHosts · trust-on-first-use</span></h3>
      <div class="kpis" data-r="trustkpi"></div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-a="rotate">simulate host key rotation</button><button class="btn sm" data-a="forget">forget this host</button></div>
      <div data-r="trustverdict"></div>
      <div class="muted" style="margin-top:8px">Pins the host fingerprint <code>SERVER_HELLO.fingerprints[0]</code> already sends — the same shape a real
      <code>host_fingerprint</code> field would be pinned by once a wsh-server populates it (none does yet; see the class's own doc comment).
      First sight of a host is trust-on-first-use; a later mismatch means either the host's key changed, or something is intercepting the connection.</div>`;
    const trustKpi = q<HTMLElement>(trustPanel, '[data-r=trustkpi]');
    const trustVerdict = q<HTMLElement>(trustPanel, '[data-r=trustverdict]');
    const btnRotate = q<HTMLButtonElement>(trustPanel, '[data-a=rotate]');
    const btnForget = q<HTMLButtonElement>(trustPanel, '[data-a=forget]');

    /* ---------- end-to-end encryption ---------- */
    e2ePanel.innerHTML = `<h3>End-to-end encryption <span class="sub">session.enableE2E() · AES-256-GCM</span></h3>
      <div class="row"><button class="btn sm" data-a="live">attempt real key exchange</button><button class="btn sm" data-a="loop">run local loopback demo</button></div>
      <div class="muted" data-r="e2estatus" style="margin-top:8px">idle</div>
      <pre class="code" data-r="e2elog" style="max-height:170px;overflow:auto;font-size:11px;margin-top:8px"></pre>
      <div class="muted" style="margin-top:8px">"real key exchange" calls <code>WshClient.initiateE2E()</code> on the live connection — a genuine
      <code>KEY_EXCHANGE</code> message goes out (watch the handshake viewer), but this demo host doesn't implement the responder side yet, so it times out.
      "local loopback" builds two real <code>WshSession</code>s in-page, hands both a fresh AES-256-GCM key standing in for what a completed exchange would
      produce, and calls the real <code>enableE2E()</code>/<code>write()</code> on each — including a tampered frame to show authentication failing.</div>`;
    const btnE2eLive = q<HTMLButtonElement>(e2ePanel, '[data-a=live]');
    const btnE2eLoop = q<HTMLButtonElement>(e2ePanel, '[data-a=loop]');
    const e2eStatus = q<HTMLElement>(e2ePanel, '[data-r=e2estatus]');
    const e2eLog = q<HTMLElement>(e2ePanel, '[data-r=e2elog]');

    /* ---------- MCP bridge ---------- */
    mcpPanel.innerHTML = `<h3>MCP bridge <span class="sub">WshMcpBridge.discover() / call()</span></h3>
      <div class="row"><button class="btn sm" data-a="discover">discover()</button><span class="muted" data-r="mcpstat">connect first</span></div>
      <div data-r="mcptools" class="muted" style="margin-top:8px">no tools discovered yet</div>
      <div class="row" style="margin-top:8px"><input data-r="mcpargs" spellcheck="false" placeholder='tool name, then {"json":"args"}' style="flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid var(--line);background:var(--bg-inset);color:var(--ink);font-family:var(--f-mono);font-size:12px" disabled><button class="btn sm" data-a="call" disabled>call()</button></div>
      <div class="muted" style="margin-top:8px">Sends real <code>MCP_DISCOVER</code>/<code>MCP_CALL</code> control messages over the live connection
      (visible in the handshake viewer). This demo host doesn't answer them yet — every unhandled message type is logged and ignored — so
      <code>discover()</code> is expected to time out; that's the bridge and wire protocol working honestly against a host with no MCP tools mounted.</div>`;
    const btnMcpDiscover = q<HTMLButtonElement>(mcpPanel, '[data-a=discover]');
    const mcpStat = q<HTMLElement>(mcpPanel, '[data-r=mcpstat]');
    const mcpTools = q<HTMLElement>(mcpPanel, '[data-r=mcptools]');
    const mcpArgsIn = q<HTMLInputElement>(mcpPanel, '[data-r=mcpargs]');
    const btnMcpCall = q<HTMLButtonElement>(mcpPanel, '[data-a=call]');

    /* ---------- explainer ---------- */
    explain.innerHTML = `<h3>What's happening</h3>
      <ol>
        <li><b>Identity.</b> <code>generateKeyPair(true)</code> makes an Ed25519 pair with WebCrypto; the PKCS#8 private half is kept in localStorage and re-imported non-extractable. The fingerprint is <code>fingerprint(raw)</code> = SHA-256 of the 32-byte public key.</li>
        <li><b>Transport.</b> <code>WshClient.connectWithTransport()</code> is handed a <code>WshTransport</code> subclass built from the package's exported <code>QMuxConnection</code>, <code>frameEncode</code>/<code>FrameDecoder</code> and <code>SerialQueue</code>/<code>dispatchSerially</code> — the pieces its own <code>WebSocketTransport</code> is made of — over either a real WebSocket to the companion or a <code>MessageChannel</code> to the in-page host. Both ends speak QUIC-v1 frames in QMux records: stream 0 is the control channel carrying length-prefixed CBOR.</li>
        <li><b>Auth.</b> HELLO names the user; the host answers SERVER_HELLO + CHALLENGE (session id + 32-byte nonce); the client signs the transcript; the host checks the key against its allowlist (<code>POST /wsh/authorize</code> on the companion) and runs <code>verifyChallenge</code>. Untick “register it first” to watch AUTH_FAIL.</li>
        <li><b>Sessions.</b> The PTY uses <code>data_mode: "virtual"</code> — keystrokes and output ride stream 0 as SESSION_DATA. Exec sessions use <code>data_mode: "stream"</code>: the client opens a fresh QMux stream (4, 8, …) and writes a 1-byte primer so the host can discover it (client-initiated streams are invisible until a byte arrives).</li>
        <li><b>Backpressure.</b> Every host write awaits QMux flow control. Pick an 8 KiB window plus a slow consumer, reconnect, run <code>flood 1024</code>: the host burns through its credit, sends STREAM_DATA_BLOCKED, and waits for our MAX_STREAM_DATA — keystrokes queue behind it, exactly like a real congested link.</li>
        <li><b>Recording.</b> Every PTY byte is fed to <code>SessionRecorder</code>; <code>SessionPlayer</code> replays it with original timing and <code>seek()</code>s under the scrubber. Export is asciicast v2 (<code>asciinema play</code> can read it).</li>
      </ol>
      <div class="muted">Restricted by construction: the host implements ${Object.keys(COMMANDS as Record<string, string>).length} built-in commands (${Object.keys(COMMANDS as Record<string, string>).map((c) => `<code>${c}</code>`).join(' ')}) — no child_process, no eval, one flat sandbox directory.</div>
      <pre class="code hostlog" data-r="hostlog"></pre>`;
    const hostLogEl = q<HTMLElement>(explain, '[data-r=hostlog]');
    const hostLines: string[] = [];
    function log(line: string) {
      hostLines.push(`${new Date().toTimeString().slice(0, 8)}  ${line}`);
      if (hostLines.length > 80) hostLines.shift();
      hostLogEl.textContent = hostLines.join('\n');
      hostLogEl.scrollTop = hostLogEl.scrollHeight;
    }

    /* ---------- in-page host ---------- */
    const pageAllow = new Set<string>();
    const pageHost = createWshHost({
      vfs: memoryVfs(),
      isAuthorized: (fp: string) => pageAllow.has(fp),
      onLog: (m: string) => log(`in-page host ${m}`),
      hostname: 'in-page',
      where: 'browser MessageChannel',
    }) as HostLike;

    /* ---------- connection state ---------- */
    let client: WshClient | null = null;
    let transport: PipeTransport | null = null;
    let wire = new WireStats();
    let recDecoder = new TextDecoder();
    let connT0 = 0;
    let connGen = 0;
    const execLabels: string[] = [];
    let hs: { username?: string; sessionId?: string; nonce?: Uint8Array; signature?: Uint8Array; publicKey?: Uint8Array; result?: string } = {};
    let hsN = 0;
    let authDone = false;

    /* ----- known hosts (TOFU) ----- */
    const knownHosts = new W.WshKnownHosts({ storageKey: 'orrery.wsh.knownhosts.v1' });
    const hostLabel = () => (effMode() === 'live' ? 'companion' : 'in-page-host');
    let lastVerify: WshHostVerifyResult | null = null;
    function renderTrust() {
      const hosts = knownHosts.list();
      const k = (label: string, v: string) => `<div class="kpi"><div class="k">${label}</div><div class="v">${esc(v)}</div></div>`;
      trustKpi.innerHTML = k('this host', hostLabel()) + k('status', lastVerify?.status ?? '—') + k('hosts trusted', String(hosts.length));
      trustVerdict.innerHTML = !lastVerify ? '' : lastVerify.status === 'changed'
        ? `<div class="verdict bad">⚠ fingerprint changed for "${esc(hostLabel())}" — expected ${esc((lastVerify.expected ?? '').slice(0, 20))}…, this connection is unverified until you choose</div>`
        : lastVerify.status === 'known' ? `<div class="verdict ok">✓ known host, fingerprint matches</div>` : '';
    }
    /** SERVER_HELLO.fingerprints[0] is this demo host's own Ed25519 identity — see server/demos/wsh.mjs's serverHello() call. */
    function handleHostFingerprint(fp: string) {
      const label = hostLabel();
      const res = knownHosts.verifyHost(label, fp);
      if (res.status === 'unknown') {
        knownHosts.addHost(label, fp);
        lastVerify = { status: 'known' };
        log(`known hosts: first time seeing "${label}" — trusted ${fp.slice(0, 16)}… (WshKnownHosts.addHost)`);
      } else {
        lastVerify = res;
        if (res.status === 'changed') log(`known hosts: ⚠ "${label}" fingerprint changed — expected ${(res.expected ?? '').slice(0, 16)}…, got ${fp.slice(0, 16)}…`);
      }
      renderTrust();
    }
    btnRotate.addEventListener('click', () => {
      const real = knownHosts.list().find((h) => h.host === hostLabel())?.fingerprint;
      if (!real) { log('known hosts: connect at least once first so there is a trusted fingerprint to rotate away from'); return; }
      // Simulate a rotated host key: flip a hex nibble rather than fabricate an unrelated string,
      // so it still looks like a real fingerprint next to the one it's replacing.
      const rotated = (real[0] === 'f' ? '0' : 'f') + real.slice(1);
      lastVerify = knownHosts.verifyHost(hostLabel(), rotated);
      log(`known hosts: simulated rotation — verifyHost("${hostLabel()}", …) -> ${lastVerify.status} (no live host key rotation to trigger this for real, so this flips a byte locally)`);
      renderTrust();
    });
    btnForget.addEventListener('click', () => {
      const removed = knownHosts.removeHost(hostLabel());
      log(`known hosts: removeHost("${hostLabel()}") -> ${removed}`);
      lastVerify = null;
      renderTrust();
    });
    renderTrust();

    /* ----- MCP bridge ----- */
    let mcpBridge: InstanceType<typeof W.WshMcpBridge> | null = null;
    function e2eLine(text: string) { e2eLog.textContent = `${(e2eLog.textContent ?? '').split('\n').slice(-40).join('\n')}\n${text}`.trim(); e2eLog.scrollTop = e2eLog.scrollHeight; }

    const typeInto = (s: string) => {
      if (!pty || pty.state !== 'active') return;
      recorder?.record('input', s);
      pty.write(s).catch(() => {});
    };

    term.onData((d) => typeInto(d));

    const setConnected = (on: boolean) => {
      btnConnect.disabled = false; btnConnect.textContent = on ? 'Reconnect' : 'Connect'; btnDisconnect.disabled = !on; btnPty.disabled = !on; btnExec.disabled = !on; btnRefresh.disabled = !on;
      termEl.classList.toggle('dim', !on);
    };

    /* ----- handshake viewer rendering ----- */
    const fmtField = (k: string, v: unknown): string => {
      const cls = k === 'username' ? 'a' : k === 'session_id' ? 'b' : k === 'nonce' ? 'c' : k === 'signature' ? 'e' : k === 'public_key' ? 'd' : '';
      let s: string;
      if (v instanceof Uint8Array) s = `bytes(${v.byteLength}) ${hex(v, 20)}`;
      else if (typeof v === 'string') s = JSON.stringify(v.length > 120 ? v.slice(0, 120) + '…' : v);
      else { try { s = JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? `<bytes ${x.byteLength}>` : x)) ?? String(v); } catch { s = String(v); } if (s.length > 260) s = s.slice(0, 260) + '…'; }
      return cls ? `<span class="hl ${cls}">${esc(s)}</span>` : esc(s);
    };
    const summary = (m: WshMessage): string => {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(m)) {
        if (k === 'type') continue;
        if (v instanceof Uint8Array) parts.push(`${k}=${k === 'data' ? JSON.stringify(dec.decode(v.subarray(0, 40))).slice(0, 46) : `‹${v.byteLength}B›`}`);
        else if (typeof v === 'object' && v !== null) parts.push(`${k}=${Array.isArray(v) ? `[${v.length}]` : '{…}'}`);
        else parts.push(`${k}=${typeof v === 'string' ? (v.length > 24 ? v.slice(0, 24) + '…' : v) : v}`);
      }
      return parts.join(' ');
    };
    const onControl = (dir: 'in' | 'out', m: WshMessage) => {
      const name = MSG_NAMES[m.type] ?? W.msgName(m.type) ?? `0x${m.type.toString(16)}`;
      const g = TYPE_GROUP(name);
      // capture the transcript ingredients
      if (m.type === W.MSG.SERVER_HELLO) {
        const fp = (m.fingerprints as string[] | undefined)?.[0];
        if (fp) handleHostFingerprint(fp);
      }
      if (m.type === W.MSG.HELLO) { hs = { username: m.username as string }; renderTranscript(); }
      if (m.type === W.MSG.CHALLENGE) { hs.sessionId = m.session_id as string; hs.nonce = m.nonce as Uint8Array; renderTranscript(); }
      if (m.type === W.MSG.AUTH) { hs.signature = m.signature as Uint8Array; hs.publicKey = m.public_key as Uint8Array; renderTranscript(); }
      if (m.type === W.MSG.AUTH_OK) { hs.result = 'ok'; renderTranscript(); }
      if (m.type === W.MSG.AUTH_FAIL) { hs.result = String(m.reason ?? 'rejected'); renderTranscript(); }
      let cborLen = 0; let cborHex = '';
      try { const c = W.cborEncode(m); cborLen = c.byteLength; cborHex = hex(c, 160); } catch { /* */ }
      hsN++;
      hsCount.textContent = `${hsN} messages`;
      if (g === 'data' && hsList.childElementCount > 600) return; // keep the DOM bounded during floods
      if (!authDone && (m.type === W.MSG.AUTH_OK || m.type === W.MSG.AUTH_FAIL)) authDone = true;
      const item = el('div', { class: `hs-item ${g === 'auth' ? 'auth' : ''} ${m.type === W.MSG.AUTH_FAIL || m.type === W.MSG.OPEN_FAIL ? 'fail' : ''}` });
      item.dataset.g = g;
      if (!shown.has(g)) item.style.display = 'none';
      const kv = Object.entries(m).filter(([k]) => k !== 'type').map(([k, v]) => `<span>${esc(k)}</span><span>${fmtField(k, v)}</span>`).join('');
      item.innerHTML = `<div class="hs-head"><span class="t">+${((performance.now() - connT0) / 1000).toFixed(3)}</span><span class="dir ${dir}">${dir === 'out' ? '→' : '←'}</span><span class="nm">${esc(name)}</span><span class="sum">${esc(summary(m))}</span><span class="sz">${cborLen}B</span></div>
        <div class="hs-body"><div class="kv"><span>type</span><span>0x${m.type.toString(16).padStart(2, '0')} (${esc(name)})</span>${kv}</div><div class="hex">cbor ${esc(cborHex)}</div></div>`;
      if (g === 'auth' && (m.type === W.MSG.CHALLENGE || m.type === W.MSG.AUTH)) item.classList.add('open');
      hsList.appendChild(item);
      if (m.type === W.MSG.AUTH_OK) hsList.appendChild(el('div', { class: 'hs-sep' }, '— authenticated · session traffic below —'));
      while (hsList.childElementCount > 900) hsList.firstElementChild!.remove();
      hsList.scrollTop = hsList.scrollHeight;
    };

    let tamperName = '';
    async function renderTranscript() {
      if (!hs.username) { txBody.innerHTML = '<div class="muted" style="margin-top:12px">Waiting for HELLO…</div>'; return; }
      const u = enc.encode(hs.username);
      const sid = hs.sessionId ? enc.encode(hs.sessionId) : null;
      const segs = [
        { k: 'version', cls: '', color: 'var(--ink-3)', bytes: enc.encode('wsh-v1\0'), note: '"wsh-v1\\0"' },
        { k: 'lp(username)', cls: 'a', color: 'var(--seg-a)', bytes: lp(u), note: JSON.stringify(hs.username) },
        { k: 'lp(session_id)', cls: 'b', color: 'var(--seg-b)', bytes: sid ? lp(sid) : null, note: hs.sessionId ?? 'from CHALLENGE' },
        { k: 'nonce', cls: 'c', color: 'var(--seg-c)', bytes: hs.nonce ?? null, note: '32 random bytes from CHALLENGE' },
        { k: 'channel_binding', cls: '', color: 'var(--line)', bytes: new Uint8Array(0), note: 'empty (none over this transport)' },
      ];
      const total = segs.reduce((a, s) => a + (s.bytes?.length ?? 36), 0);
      let html = `<div class="tx-bar">${segs.map((s) => `<div style="flex:${Math.max(s.bytes?.length ?? 36, 6)} 0 0;background:${s.color};${s.bytes ? '' : 'opacity:.25'}">${s.bytes ? s.bytes.length + 'B' : '?'}</div>`).join('')}</div>`;
      html += `<div class="tx-rows">${segs.map((s) => `<div><span class="lab"><i style="background:${s.color}"></i>${s.k}</span><span class="hx">${s.bytes ? (s.bytes.length ? hex(s.bytes, 44) : '∅') : '…'} <span class="muted">${esc(s.note)}</span></span></div>`).join('')}`;
      if (hs.sessionId && hs.nonce) {
        const digest = await W.buildTranscript(hs.sessionId, hs.nonce, { username: hs.username });
        html += `<div><span class="lab">SHA-256 →</span><span class="hx">${hex(digest)}</span></div>`;
      }
      if (hs.signature) html += `<div><span class="lab"><i style="background:var(--seg-e)"></i>signature</span><span class="hx">${hex(hs.signature, 44)}</span></div><div><span class="lab"><i style="background:var(--seg-d)"></i>public_key</span><span class="hx">${hex(hs.publicKey!)}</span></div>`;
      html += `</div>`;
      let verdict = '';
      if (hs.signature && hs.publicKey && hs.sessionId && hs.nonce) {
        try {
          const pk = await W.importPublicKeyRaw(hs.publicKey);
          const ok = await W.verifyChallenge(pk, hs.signature, hs.sessionId, hs.nonce, { username: hs.username });
          verdict = `<div class="verdict ${ok && hs.result === 'ok' ? 'ok' : ok && !hs.result ? '' : 'bad'}">${ok ? '✓' : '✗'} signature ${ok ? 'valid' : 'invalid'}: verifyChallenge(public_key, signature, session_id, nonce, {username}) = ${ok} · host said: ${hs.result === 'ok' ? 'AUTH_OK' : hs.result ? 'AUTH_FAIL — ' + esc(hs.result) : '…'}</div>`;
          verdict += `<div class="tamper">Replay the same signature as username <input data-r="tamper" value="${esc(tamperName || 'root')}" spellcheck="false"> → <span data-r="tverdict" class="mono">…</span></div>`;
        } catch (e) { verdict = `<div class="verdict bad">${esc(String(e))}</div>`; }
      }
      txBody.innerHTML = html + verdict + `<div class="muted" style="margin-top:6px">${total} transcript bytes before hashing</div>`;
      const tin = txBody.querySelector<HTMLInputElement>('[data-r=tamper]');
      if (tin) {
        const tv = txBody.querySelector<HTMLElement>('[data-r=tverdict]')!;
        const check = async () => {
          tamperName = tin.value;
          const pk = await W.importPublicKeyRaw(hs.publicKey!);
          const ok = await W.verifyChallenge(pk, hs.signature!, hs.sessionId!, hs.nonce!, { username: tin.value });
          tv.innerHTML = ok ? '<span style="color:var(--success)">✓ verifies (same username)</span>' : '<span style="color:var(--error)">✗ fails — the username is bound into the signature</span>';
        };
        tin.addEventListener('input', () => { check(); });
        check();
      }
    }

    /* ----- inspector rendering ----- */
    const samples: { i: number; o: number; b: number }[] = [];
    let lastIn = 0, lastOut = 0, lastBlk = 0;
    const sampleTimer = window.setInterval(() => {
      const blk = [...wire.streams.values()].reduce((a, s) => a + s.peerBlocked, 0) + wire.dataBlockedIn;
      samples.push({ i: wire.bytesIn - lastIn, o: wire.bytesOut - lastOut, b: blk - lastBlk });
      lastIn = wire.bytesIn; lastOut = wire.bytesOut; lastBlk = blk;
      if (samples.length > 160) samples.shift();
      drawSpark();
    }, 250);
    disposers.push(() => clearInterval(sampleTimer));
    function drawSpark() {
      const dpr = devicePixelRatio || 1;
      const w = spark.clientWidth, h = spark.clientHeight;
      if (!w || !h) return;
      if (spark.width !== Math.round(w * dpr)) { spark.width = Math.round(w * dpr); spark.height = Math.round(h * dpr); }
      const g = spark.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const max = Math.max(1024, ...samples.map((s) => Math.max(s.i, s.o)));
      const step = w / 160;
      const line = (key: 'i' | 'o', color: string) => {
        g.beginPath(); g.strokeStyle = color; g.lineWidth = 1.5;
        samples.forEach((s, k) => { const x = w - (samples.length - k) * step; const y = h - 4 - (Math.log1p(s[key]) / Math.log1p(max)) * (h - 10); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      };
      samples.forEach((s, k) => { if (s.b) { g.fillStyle = cs.getPropertyValue('--seg-e') || '#ff7b9c'; g.globalAlpha = .7; g.fillRect(w - (samples.length - k) * step, 0, Math.max(2, step), h); g.globalAlpha = 1; } });
      line('i', getComputedStyle(root).getPropertyValue('--seg-d') || '#7ee787');
      line('o', getComputedStyle(root).getPropertyValue('--seg-b') || '#4cc9f0');
      g.fillStyle = '#8a93a6'; g.font = '10px ' + fontFamily; g.fillText(`peak ${fmtB(max)}/250ms (log scale)`, 6, 12);
    }
    const winBar = (credit: number, full: number) => {
      const f = full ? Math.max(0, Math.min(1, credit / full)) : 0;
      return `<div class="win ${f <= 0.02 ? 'empty' : f < 0.5 ? 'low' : ''}"><i style="width:${(f * 100).toFixed(1)}%"></i><span>${fmtB(Math.max(0, credit))}</span></div>`;
    };
    let tickerShown = -1;
    const renderInspector = () => {
      if (!wire.dirty) return;
      wire.dirty = false;
      const blockedTotal = [...wire.streams.values()].reduce((a, s) => a + s.peerBlocked, 0) + wire.dataBlockedIn;
      const k = (label: string, v: string, hot = false) => `<div class="kpi"><div class="k">${label}</div><div class="v ${hot ? 'hot' : ''}">${v}</div></div>`;
      kpisEl.innerHTML = [
        k('wire out', fmtB(wire.bytesOut)), k('wire in', fmtB(wire.bytesIn)),
        k('records ↑/↓', `${wire.recOut}/${wire.recIn}`),
        k('conn credit (host)', fmtB(Math.max(0, wire.peerMaxData - wire.dataOut))),
        k('conn credit (ours)', fmtB(Math.max(0, wire.ourMaxData - wire.dataIn))),
        k('MAX_*DATA sent', String(wire.maxDataSent + wire.maxStreamDataSent)),
        k('host blocked', String(blockedTotal), blockedTotal > 0),
        k('consumer backlog', fmtB(wire.backlog), wire.backlog > 0),
      ].join('');
      streamsEl.innerHTML = [...wire.streams.values()].sort((a, b) => a.id - b.id).map((s) => {
        const done = (s.finIn && s.finOut) || s.reset;
        return `<tr class="${done ? 'closed' : ''}"><td>${s.id}</td><td class="lbl" title="${esc(s.label)}">${esc(s.label)}</td><td>${fmtB(s.sentHi)}</td><td>${fmtB(s.recvHi)}</td>
          <td>${winBar(s.peerLimit - s.sentHi, wire.peerStreamWin)}</td><td>${winBar(s.ourLimit - s.recvHi, wire.ourStreamWin)}</td>
          <td style="color:${s.peerBlocked ? 'var(--seg-e)' : 'inherit'}">${s.peerBlocked}</td><td>${s.reset ? 'reset' : done ? 'closed' : s.finIn ? 'FIN ←' : s.finOut ? 'FIN →' : 'open'}</td></tr>`;
      }).join('') || '<tr><td colspan="8" class="muted">no streams yet</td></tr>';
      if (tickerShown !== wire.ticker.length) {
        tickerShown = wire.ticker.length;
        const lines = wire.ticker.slice(-14).reverse();
        tickerEl.innerHTML = lines.map(({ dir, f }) => {
          const blk = /BLOCKED/.test(f.t);
          const fc = /^MAX_/.test(f.t);
          const d = f.t === 'STREAM' ? `sid=${f.sid} off=${f.off} len=${f.len}${f.fin ? ' FIN' : ''}` : f.t === 'QX_TRANSPORT_PARAMETERS' ? Object.entries(f.params ?? {}).map(([a, b]) => `${a.replace('initial_max_', '')}=${b}`).join(' ') : `${f.sid !== undefined ? `sid=${f.sid} ` : ''}${f.v !== undefined ? f.v : ''}${f.reason ? ' ' + f.reason : ''}`;
          return `<div class="${dir}${blk ? ' blk' : fc ? ' fc' : ''}">${dir === 'out' ? '→' : '←'} ${esc(f.t)} ${esc(d)}</div>`;
        }).join('') || '<div class="muted">QMux frames appear here</div>';
      }
    };
    const renderTimer = window.setInterval(renderInspector, 120);
    disposers.push(() => clearInterval(renderTimer));

    /* ----- files ----- */
    async function refreshFiles() {
      if (!client) return;
      try {
        const r = await client.fileList('~/sandbox');
        if (!r.success) throw new Error(r.error_message || 'list failed');
        const entries = ((r.metadata?.entries ?? []) as { name: string; size: number; mtime: number }[]);
        filesBody.innerHTML = entries.map((f) => `<tr><td class="n">${esc(f.name)}</td><td class="s">${fmtB(f.size)}</td><td class="m">${new Date(f.mtime).toLocaleTimeString()}</td><td class="a"><button data-f="cat" data-n="${esc(f.name)}">cat</button><button data-f="get" data-n="${esc(f.name)}">download</button><button data-f="rm" data-n="${esc(f.name)}">rm</button></td></tr>`).join('') || '<tr><td class="muted">(empty)</td></tr>';
        fmsg.textContent = `${entries.length} files in ${String(r.metadata?.path ?? '')} on the ${String(r.metadata?.host ?? 'host')}`;
      } catch (e) { fmsg.textContent = `list failed: ${(e as Error).message}`; }
    }
    btnRefresh.addEventListener('click', () => refreshFiles());
    filesBody.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b || !client) return;
      const name = b.dataset.n!;
      if (b.dataset.f === 'cat') { typeInto(`cat ${name}\r`); term.focus(); return; }
      if (b.dataset.f === 'rm') { try { const r = await client.fileRemove(name); fmsg.textContent = r.success ? `removed ${name}` : `rm failed: ${r.error_message}`; } catch (err) { fmsg.textContent = String(err); } refreshFiles(); return; }
      try {
        prog.style.width = '0%';
        const data = await client.download(name, { onProgress: ({ received, total }) => { prog.style.width = `${(received / Math.max(1, total)) * 100}%`; } });
        const url = URL.createObjectURL(new Blob([data as BlobPart]));
        const a = el('a', { href: url, download: name }); a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        fmsg.textContent = `downloaded ${name} — ${fmtB(data.byteLength)} over FILE_CHUNK`;
      } catch (err) { fmsg.textContent = `download failed: ${(err as Error).message}`; }
    });
    async function uploadFile(f: File) {
      if (!client) { fmsg.textContent = 'connect first'; return; }
      if (f.size > MAX_FILE_BYTES) { fmsg.textContent = `${f.name} is ${fmtB(f.size)} — the host caps uploads at ${fmtB(MAX_FILE_BYTES)}`; return; }
      const name = f.name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[^A-Za-z0-9]+/, '') || 'upload.bin';
      try {
        prog.style.width = '0%';
        await client.upload(f, name, { onProgress: (sent) => { prog.style.width = `${(sent / Math.max(1, f.size)) * 100}%`; } });
        prog.style.width = '100%';
        fmsg.textContent = `uploaded ${name} (${fmtB(f.size)})`;
        refreshFiles();
      } catch (e) { fmsg.textContent = `upload failed: ${(e as Error).message}`; }
    }
    drop.addEventListener('click', () => fin.click());
    fin.addEventListener('change', () => { const f = fin.files?.[0]; if (f) uploadFile(f); fin.value = ''; });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer?.files?.[0]; if (f) uploadFile(f); });

    /* ----- exec ----- */
    async function runExec() {
      if (!client) return;
      const command = execIn.value.trim(); if (!command) return;
      execLabels.push(`exec: ${command}`);
      eout.textContent = '';
      emeta.textContent = 'opening exec channel…';
      const t0 = performance.now();
      let bytes = 0;
      try {
        const s = await client.openSession({ type: 'exec', command, cols: lastCols || 80 });
        const d = new TextDecoder();
        s.onData = (b) => { bytes += b.byteLength; const t = d.decode(b, { stream: true }).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''); eout.textContent = (eout.textContent + t).slice(-24000); eout.scrollTop = eout.scrollHeight; };
        const exit = new Promise<number>((res) => { s.onExit = (c) => res(c); });
        await s.write(new Uint8Array([0])); // primer: lets the host discover our client-initiated stream
        emeta.textContent = `channel ${s.channelId} · data_mode ${s.dataMode} · running…`;
        const code = await exit;
        emeta.textContent = `channel ${s.channelId} · data_mode ${s.dataMode} · exit ${code} · ${fmtB(bytes)} in ${((performance.now() - t0) / 1000).toFixed(2)} s`;
      } catch (e) { emeta.textContent = `exec failed: ${(e as Error).message}`; }
    }

    /* ----- PTY + recording ----- */
    async function openPty(greet?: string) {
      if (!client) return;
      try {
        term.reset();
        const cols = fitCols(); lastCols = cols; term.resize(cols, ROWS);
        const s = await client.openSession({ type: 'pty', cols, rows: ROWS });
        pty = s;
        recDecoder = new TextDecoder();
        recorder = new W.SessionRecorder(s.sessionId || client.sessionId || 'wsh', { width: cols, height: ROWS });
        recorder.record('resize', { cols, rows: ROWS });
        recEl.className = 'rec on';
        s.onData = (b) => { term.write(b); recorder?.record('output', recDecoder.decode(b, { stream: true })); updateRec(); };
        s.onClose = () => {
          if (pty === s) { pty = null; recEl.className = 'rec'; recEl.textContent = `recording stopped · ${recorder?.length ?? 0} events`; if (recorder && recorder.length > 2) loadIntoPlayer(recorder.toJSON()); }
          term.write('\r\n\x1b[2m[pty channel closed — “new PTY” opens another]\x1b[0m\r\n');
        };
        term.focus();
        if (greet) setTimeout(() => typeInto(greet), 450);
      } catch (e) { errEl.textContent = `open pty failed: ${(e as Error).message}`; }
    }
    let recTick = 0;
    function updateRec() {
      const now = performance.now(); if (now - recTick < 250 || !recorder) return; recTick = now;
      recEl.textContent = `REC ${recorder.length} events · ${fmtT(recorder.duration)}`;
    }
    btnPty.addEventListener('click', () => openPty());

    /* ----- player ----- */
    type CastJSON = SessionRecordingJSON;
    let rec: CastJSON | null = null;
    let player: SessionPlayer | null = null;
    let ctl: PlaybackCtl | null = null;
    let playing = false; let pos = 0; let baseT = 0; let basePos = 0; let duration = 0;
    const speed = () => Number(speedSel.value) || 1;
    function newCtl(paused: boolean, at: number) {
      ctl?.stop();
      pterm.reset();
      if (!player) return;
      ctl = player.play((d) => pterm.write(d), { speed: speed() });
      if (paused) ctl.pause();
      ctl.seek(at);
      pos = at; basePos = at; baseT = performance.now();
    }
    function loadIntoPlayer(json: CastJSON) {
      rec = json;
      player = new W.SessionPlayer(json);
      const meta = player.metadata;
      duration = meta.duration;
      pterm.resize(Math.max(20, Math.min(200, meta.width || 80)), 14);
      playing = false; btnPlay.textContent = '▶ play';
      newCtl(true, 0);
      pmeta.textContent = `${meta.eventCount} events · ${meta.width}×${meta.height} · ${fmtT(duration)}`;
      drawDensity();
      updatePlayUi();
    }
    function drawDensity() {
      const dpr = devicePixelRatio || 1; const w = density.clientWidth, h = density.clientHeight;
      if (!w || !h) return;
      density.width = Math.round(w * dpr); density.height = Math.round(h * dpr);
      const g = density.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      if (!rec || !duration) return;
      const bins = new Array(Math.max(10, Math.floor(w / 3))).fill(0);
      const ins = new Array(bins.length).fill(0);
      for (const [t, type, data] of rec.events as [number, string, string][]) {
        const i = Math.min(bins.length - 1, Math.floor(((t * 1000) / duration) * bins.length));
        if (type === 'o') bins[i] += String(data).length; else if (type === 'i') ins[i]++;
      }
      const max = Math.max(1, ...bins);
      const accent = getComputedStyle(root).getPropertyValue('--accent') || '#9be564';
      bins.forEach((v, i) => { if (!v) return; const bh = 3 + (Math.log1p(v) / Math.log1p(max)) * (h - 6); g.fillStyle = accent; g.globalAlpha = .75; g.fillRect(i * 3, h - bh, 2, bh); });
      g.globalAlpha = 1; g.fillStyle = '#4cc9f0';
      ins.forEach((v, i) => { if (v) g.fillRect(i * 3, 0, 2, 3); });
    }
    function updatePlayUi() {
      if (playing) { pos = basePos + (performance.now() - baseT) * speed(); if (pos >= duration) { pos = duration; playing = false; btnPlay.textContent = '↺ replay'; } }
      scrub.value = String(duration ? Math.round((pos / duration) * 1000) : 0);
      ptime.textContent = `${fmtT(pos)} / ${fmtT(duration)}`;
    }
    let raf = 0;
    const loop = () => { if (playing) updatePlayUi(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    disposers.push(() => cancelAnimationFrame(raf));
    disposers.push(() => ctl?.stop());
    btnPlay.addEventListener('click', () => {
      if (!player) return;
      if (playing) { ctl?.pause(); updatePlayUi(); playing = false; btnPlay.textContent = '▶ play'; return; }
      if (pos >= duration) newCtl(true, 0);
      basePos = pos; baseT = performance.now();
      ctl?.resume(); playing = true; btnPlay.textContent = '❚❚ pause';
    });
    scrub.addEventListener('input', () => {
      if (!player) return;
      const at = (Number(scrub.value) / 1000) * duration;
      newCtl(!playing, at);
      updatePlayUi();
    });
    speedSel.addEventListener('change', () => { if (!player) return; newCtl(!playing, pos); });
    q<HTMLButtonElement>(playPanel, '[data-a=grab]').addEventListener('click', () => {
      if (recorder && recorder.length) loadIntoPlayer(recorder.toJSON()); else pmeta.textContent = 'nothing recorded yet';
    });
    q<HTMLButtonElement>(playPanel, '[data-a=cast]').addEventListener('click', () => {
      const r = rec ?? recorder?.toJSON(); if (!r) return;
      const header = { version: 2, width: r.width, height: r.height, timestamp: r.timestamp, env: r.env, title: `wsh ${state.user}` };
      const body = [JSON.stringify(header), ...(r.events as unknown[]).map((e) => JSON.stringify(e))].join('\n') + '\n';
      const url = URL.createObjectURL(new Blob([body], { type: 'application/x-asciicast' }));
      const a = el('a', { href: url, download: `wsh-${state.user}-${Date.now()}.cast` }); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
    q<HTMLInputElement>(playPanel, '[data-r=castin]').addEventListener('change', async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
      try {
        const text = await f.text();
        let json: CastJSON;
        if (text.trimStart().startsWith('{') && text.includes('"events"')) json = JSON.parse(text);
        else {
          const [head, ...lines] = text.split('\n').filter((l) => l.trim());
          const h = JSON.parse(head);
          json = { ...h, events: lines.map((l) => JSON.parse(l)) };
        }
        loadIntoPlayer(json);
      } catch (err) { pmeta.textContent = `could not read cast: ${(err as Error).message}`; }
      (e.target as HTMLInputElement).value = '';
    });

    /* ----- connect / disconnect ----- */
    async function connect(greet?: string) {
      errEl.textContent = '';
      if (!ident) { errEl.textContent = 'no Ed25519 identity available'; return; }
      const user = (userIn.value.trim() || 'guest');
      if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/.test(user)) { errEl.textContent = `usernames are letters, digits, _ . - (max 32), starting with a letter`; return; }
      await disconnect(true);
      const gen = ++connGen;
      const mode = effMode();
      const url = mode === 'live' ? urlIn.value.trim() : PAGE_URL;
      setStatus('connecting', 'busy');
      btnConnect.disabled = true;
      // reset views
      wire = new WireStats(); samples.length = 0; lastIn = lastOut = lastBlk = 0; tickerShown = -1;
      hsList.innerHTML = ''; hsN = 0; authDone = false; hs = {}; renderTranscript();
      filesBody.innerHTML = '<tr><td class="muted">…</td></tr>';
      try {
        // allowlist: register (or revoke) our key with the host first
        if (mode === 'live' && comp) {
          const path = state.reg ? '/wsh/authorize' : '/wsh/revoke';
          const r = await fetch(`${comp.base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicKey: b64(ident.raw), username: user }) });
          const j = await r.json().catch(() => ({}));
          log(`companion ${path} → ${r.status} ${JSON.stringify(j)}`);
        } else if (mode === 'page') {
          if (state.reg) pageAllow.add(ident.fp); else pageAllow.delete(ident.fp);
          log(`in-page allowlist: ${state.reg ? 'added' : 'removed'} ${ident.fp.slice(0, 16)}…`);
        }
        const opener = mode === 'live' ? wsPipe(url) : channelPipe(pageHost);
        const t = new PipeTransport(opener, WINDOWS[state.win] ?? WINDOWS['1m'], {
          wire, control: (dir, m) => { if (gen === connGen) onControl(dir, m); }, rate: () => Number(state.rate) || 0,
          onStream: (id) => wire.setLabel(id, execLabels.shift() ?? `stream ${id}`),
        });
        transport = t;
        const c = new W.WshClient();
        client = c;
        c.onClose = () => { if (client === c) { setStatus('closed', ''); setConnected(false); client = null; pty = null; recEl.className = 'rec'; } };
        c.onError = (e) => { if (client === c) log(`client error: ${e.message}`); };
        connT0 = performance.now();
        const sid = await c.connectWithTransport(t, url, { username: user, keyPair: ident.keyPair });
        if (gen !== connGen) return;
        setStatus(`authenticated · ${mode === 'live' ? 'companion' : 'in-page'}`, 'ok');
        setConnected(true);
        log(`authenticated as ${user}; session ${sid}; server features [${c.features.join(', ')}]`);
        mcpBridge = new W.WshMcpBridge(c);
        mcpStat.textContent = 'ready — not discovered yet';
        await openPty(greet);
        refreshFiles();
      } catch (e) {
        if (gen !== connGen) return;
        const msg = (e as Error).message || String(e);
        setStatus(/Authentication failed/.test(msg) ? 'auth failed' : 'error', 'bad');
        errEl.textContent = msg + (/allowlist/.test(msg) ? '\n→ tick “register it first” and connect again.' : '');
        term.write(`\r\n\x1b[31m${msg}\x1b[0m\r\n`);
        setConnected(false);
        client = null;
        filesBody.innerHTML = '<tr><td class="muted">connect to list the sandbox</td></tr>';
      }
    }
    async function disconnect(silent = false) {
      const c = client; client = null; pty = null;
      mcpBridge = null;
      mcpStat.textContent = 'connect first';
      mcpArgsIn.disabled = true; btnMcpCall.disabled = true;
      if (c) { try { await c.disconnect(); } catch { /* */ } }
      else { try { await transport?.close(); } catch { /* */ } }
      transport = null;
      if (!silent) { setStatus('disconnected', ''); setConnected(false); recEl.className = 'rec'; }
    }
    btnConnect.addEventListener('click', () => connect());
    btnDisconnect.addEventListener('click', () => disconnect());
    disposers.push(() => { connGen++; disconnect(true); });

    /* ----- E2E: attempt a real key exchange against the live connection ----- */
    const onE2eLive = async () => {
      if (!client) { e2eLine('connect first'); return; }
      btnE2eLive.disabled = true;
      e2eStatus.textContent = 'sending KEY_EXCHANGE…';
      e2eLine('client.initiateE2E(sessionId, "X25519") — watch the handshake viewer for the real wire message');
      try {
        const r = await client.initiateE2E(client.sessionId ?? 'orrery-demo', 'X25519', 1500);
        e2eLine(`unexpected success: hybrid=${r.hybrid}, peer public key ${r.peerPublicKey.byteLength}B — this demo host doesn't speak KEY_EXCHANGE, so this shouldn't happen`);
        e2eStatus.textContent = 'exchanged (unexpected)';
      } catch (e) {
        e2eLine(`timed out: ${(e as Error).message} — expected: this demo host logs unknown message types and never answers`);
        e2eStatus.textContent = 'real exchange timed out (host has no responder) — see loopback demo below';
      } finally {
        btnE2eLive.disabled = false;
      }
    };
    btnE2eLive.addEventListener('click', () => { void onE2eLive(); });

    /* ----- E2E: local loopback with two real WshSessions ----- */
    const onE2eLoop = async () => {
      btnE2eLoop.disabled = true;
      e2eStatus.textContent = 'running local loopback…';
      try {
        const sessionId = 'orrery-e2e-demo';
        // A fresh AES-256-GCM key stands in for what a completed WshClient.initiateE2E()
        // hands each side; this demo host has no KEY_EXCHANGE responder (see above), so the
        // key itself is generated locally rather than negotiated.
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const a = new W.WshSession(new W.WshTransport(), 1, {}, 'pty', { dataMode: 'virtual', sessionId });
        const b = new W.WshSession(new W.WshTransport(), 1, {}, 'pty', { dataMode: 'virtual', sessionId });
        a._activateVirtual(async (msg) => b._handleControlMessage(msg as WshMessage));
        b._activateVirtual(async (msg) => a._handleControlMessage(msg as WshMessage));
        a.enableE2E(key, { role: 'initiator' });
        b.enableE2E(key, { role: 'responder' });
        e2eLine(`two WshSessions, both enableE2E()'d (e2eEnabled: a=${a.e2eEnabled} b=${b.e2eEnabled})`);

        const received: string[] = [];
        b.onData = (bytes) => received.push(dec.decode(bytes));
        await a.write('hello over E2E\n');
        await new Promise((r) => setTimeout(r, 60));
        e2eLine(`a.write('hello over E2E') -> b.onData: ${JSON.stringify(received.join(''))} (sealed as an ENCRYPTED_FRAME control message, opened with AES-GCM)`);

        // Tamper with the wire: flip a ciphertext byte in flight and confirm it does NOT decrypt.
        received.length = 0;
        let tamperedDelivered = false;
        const c = new W.WshTransport();
        const t = new W.WshSession(c, 2, {}, 'pty', { dataMode: 'virtual', sessionId });
        const rcv = new W.WshSession(new W.WshTransport(), 2, {}, 'pty', { dataMode: 'virtual', sessionId });
        t._activateVirtual(async (msg) => {
          const m = { ...(msg as WshMessage) } as Record<string, unknown>;
          if (m.type === W.MSG.ENCRYPTED_FRAME && m.ciphertext instanceof Uint8Array) {
            const tampered = m.ciphertext.slice();
            tampered[0] ^= 0xff;
            m.ciphertext = tampered;
          }
          rcv._handleControlMessage(m as WshMessage);
        });
        rcv._activateVirtual(async () => {});
        t.enableE2E(key, { role: 'initiator' });
        rcv.enableE2E(key, { role: 'responder' });
        rcv.onData = () => { tamperedDelivered = true; };
        const origErr = console.error;
        let capturedErr = '';
        console.error = (...args: unknown[]) => { capturedErr = args.map(String).join(' '); };
        await t.write('this byte gets flipped in flight\n');
        await new Promise((r) => setTimeout(r, 60));
        console.error = origErr;
        e2eLine(`tampered ciphertext -> delivered to onData: ${tamperedDelivered} (should be false) — ${capturedErr || 'no error captured'}`);
        e2eStatus.textContent = 'loopback demo complete';
      } catch (e) {
        e2eLine(`loopback failed: ${(e as Error).message}`);
        e2eStatus.textContent = 'loopback demo failed';
      } finally {
        btnE2eLoop.disabled = false;
      }
    };
    btnE2eLoop.addEventListener('click', () => { void onE2eLoop(); });

    /* ----- MCP bridge ----- */
    const onMcpDiscover = async () => {
      if (!mcpBridge) { mcpStat.textContent = 'connect first'; return; }
      btnMcpDiscover.disabled = true;
      mcpStat.textContent = 'discover()… (MCP_DISCOVER sent, 1.5s timeout)';
      try {
        const tools: WshMcpToolSpec[] = await mcpBridge.discover({ timeout: 1500 });
        mcpStat.textContent = `${tools.length} tool${tools.length === 1 ? '' : 's'} discovered`;
        mcpTools.innerHTML = tools.length
          ? tools.map((t) => `<div><code>${esc(t.name)}</code> — ${esc(t.description)}</div>`).join('')
          : 'discover() returned zero tools';
        mcpArgsIn.disabled = tools.length === 0;
        btnMcpCall.disabled = tools.length === 0;
      } catch (e) {
        mcpStat.textContent = `discover() timed out: ${(e as Error).message}`;
        mcpTools.textContent = 'expected — this demo host logs MCP_DISCOVER as an unhandled message type and never sends MCP_TOOLS back. Check the handshake viewer.';
      } finally {
        btnMcpDiscover.disabled = false;
      }
    };
    btnMcpDiscover.addEventListener('click', () => { void onMcpDiscover(); });
    const onMcpCall = async () => {
      if (!mcpBridge) return;
      const [name, ...rest] = mcpArgsIn.value.trim().split(/\s+/);
      if (!name) return;
      let args: Record<string, unknown> = {};
      try { args = rest.join(' ') ? JSON.parse(rest.join(' ')) : {}; } catch { /* leave {} */ }
      btnMcpCall.disabled = true;
      try {
        const r: WshMcpCallResult = await mcpBridge.call(name, args, { timeout: 1500 });
        mcpStat.textContent = `call(${name}) -> success=${r.success} ${r.error ? `error=${r.error}` : ''}`;
      } catch (e) {
        mcpStat.textContent = `call(${name}) failed: ${(e as Error).message}`;
      } finally {
        btnMcpCall.disabled = false;
      }
    };
    btnMcpCall.addEventListener('click', () => { void onMcpCall(); });

    // Zero-input default: connect, open a PTY and say hello.
    connect(`cowsay hello from the ${effMode() === 'live' ? 'companion' : 'in-page host'}\r`);

    return () => { for (const d of disposers.reverse()) { try { d(); } catch { /* */ } } };
  },
};

export default playground;
