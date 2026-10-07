import type { Playground } from '../registry';
import { readState, writeState, copyLink } from '../state';
import * as P from '@johnhenry/browsermesh-primitives';
import type { PodIdentity, LWWMap, PNCounter, CheckResult, CapabilityToken } from '@johnhenry/browsermesh-primitives';
import { Pod, BroadcastChannelTransport } from '@johnhenry/browsermesh-pod';
import type { PodMessage as PodWireMessage } from '@johnhenry/browsermesh-pod';
import './mesh.css';

// 0.0.3: probeEd25519Support is now declared in the shipped index.d.ts
// alongside everything else, so the module's own namespace import needs no
// further typing help.

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Profile {
  podId: string; name: string; hue: number; virtual: boolean;
  kind: string; peers: string[]; lastSeen: number; pub?: string;
}
interface ChatEnv { id: string; from: string; name: string; text: string; ts: number; pub: string; sig: string }
interface ChatEntry extends ChatEnv { ok: boolean; why?: string }
interface SignedToken { token: ReturnType<CapabilityToken['toJSON']>; sig: string; pub: string }

type NodeEvent =
  | { kind: 'frame'; dir: 'in' | 'out'; type: number; from: string; to?: string; size: number; hex: string; bcast: boolean }
  | { kind: 'peers' }
  | { kind: 'state'; what: 'counter' | 'pixels' | 'chat' }
  | { kind: 'reject'; author: string; key: string; reason: string }
  | { kind: 'nack'; by: string; key: string; reason: string }
  | { kind: 'cap'; from: string; granted: boolean; ok: boolean; scopes: string[]; why?: string }
  | { kind: 'phase'; phase: number; name: string }
  | { kind: 'log'; text: string };

/* ------------------------------------------------------------------ */
/* Constants + small helpers                                           */
/* ------------------------------------------------------------------ */

const CHANNEL = 'orrery-browsermesh-swarm';
const GRID = 16;
const PIXEL_SCOPE = 'mesh:pixels:write';
const PIXEL_RES = (key: string) => `mesh://pixels/${key}`;
const HEARTBEAT_MS = 2000;
const STALE_MS = 6500;
const DROP_MS = 15000;
const T = P.MESH_TYPE;

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => P.encodeBase64url(u);
const unb64 = (s: string) => P.decodeBase64url(s);
const rid = () => Math.random().toString(36).slice(2, 10);
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const hex = (u: Uint8Array, n = 14) => [...u.slice(0, n)].map(b => b.toString(16).padStart(2, '0')).join(' ') + (u.length > n ? ' …' : '');

const ADJ = ['amber', 'brisk', 'cobalt', 'dusky', 'ember', 'fern', 'gilded', 'hollow', 'indigo', 'jade', 'keen', 'lunar', 'mossy', 'nimble', 'opal', 'plucky', 'quiet', 'rusty', 'sable', 'tidal', 'umber', 'vivid', 'wry', 'zesty'];
const ANIMAL = ['otter', 'heron', 'lynx', 'moth', 'newt', 'orca', 'panda', 'quail', 'raven', 'stoat', 'tapir', 'urchin', 'vole', 'wren', 'yak', 'zebu', 'badger', 'crane', 'dingo', 'egret', 'finch', 'gecko', 'hare', 'ibis'];

function idBytes(podId: string): Uint8Array { try { return unb64(podId); } catch { return enc.encode(podId); } }
function nameOf(podId: string): string { const b = idBytes(podId); return `${ADJ[b[0] % ADJ.length]}-${ANIMAL[b[1] % ANIMAL.length]}`; }
function hueOf(podId: string): number { const b = idBytes(podId); return Math.round(((b[2] << 8) | b[3]) / 65536 * 360); }
const colorOf = (hue: number) => `hsl(${hue} 78% 60%)`;
function fingerprint(podId: string, groups = 4): string {
  const parts: string[] = [];
  for (let i = 0; i < groups; i++) parts.push(podId.slice(i * 4, i * 4 + 4));
  return parts.join('·');
}

/** 5x5 mirrored identicon from the pod ID bytes, as an SVG string. */
function identicon(podId: string, size = 40): string {
  const b = idBytes(podId);
  const col = colorOf(hueOf(podId));
  let cells = '';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    const on = (b[4 + y * 3 + x] ?? 0) & 1;
    if (!on) continue;
    cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    if (x < 2) cells += `<rect x="${4 - x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg class="identicon" viewBox="-0.5 -0.5 6 6" width="${size}" height="${size}" aria-hidden="true"><rect x="-0.5" y="-0.5" width="6" height="6" rx="1.1" fill="color-mix(in srgb, ${col} 16%, #0b1020)"/><g fill="${col}">${cells}</g></svg>`;
}

async function exportPub(id: PodIdentity): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.exportKey('raw', id.keyPair.publicKey)));
}
const keyCache = new Map<string, Promise<CryptoKey>>();
function importPub(pub: string): Promise<CryptoKey> {
  let k = keyCache.get(pub);
  if (!k) { k = crypto.subtle.importKey('raw', unb64(pub) as BufferSource, { name: 'Ed25519' }, true, ['verify']); keyCache.set(pub, k); }
  return k;
}
/** Verify that `pub` hashes to `claimed` (identity binding) and `sig` signs `data`. */
async function verifyFrom(claimed: string, pub: string, data: Uint8Array, sig: string): Promise<{ ok: boolean; why?: string }> {
  try {
    const key = await importPub(pub);
    if (await P.derivePodId(key) !== claimed) return { ok: false, why: 'public key does not hash to sender podId' };
    const ok = await P.PodIdentity.verify(key, unb64(sig) as BufferSource, data as BufferSource);
    return ok ? { ok } : { ok, why: 'Ed25519 signature invalid' };
  } catch (e) { return { ok: false, why: (e as Error).message }; }
}
const chatBytes = (e: ChatEnv) => enc.encode(JSON.stringify([e.id, e.from, e.name, e.text, e.ts]));

/* ------------------------------------------------------------------ */
/* Identity persistence: one localStorage slot per concurrently-open tab */
/* ------------------------------------------------------------------ */

interface Slot { slot: number; release: () => void }
/** Web Locks give each open tab its own slot, so two tabs never share a keypair. */
async function claimSlot(): Promise<Slot> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return { slot: 100 + Math.floor(Math.random() * 900), release: () => {} };
  for (let i = 0; i < 12; i++) {
    let release!: () => void;
    const held = new Promise<void>(r => { release = r; });
    const got = await new Promise<boolean>(res => {
      locks.request(`orrery-mesh-slot-${i}`, { ifAvailable: true }, async lock => {
        if (!lock) { res(false); return; }
        res(true);
        await held;
      }).catch(() => res(false));
    });
    if (got) return { slot: i, release };
  }
  return { slot: 100 + Math.floor(Math.random() * 900), release: () => {} };
}
const storeKey = (slot: number) => `orrery.mesh.identity.${slot}`;
async function loadOrCreateIdentity(slot: number): Promise<{ id: PodIdentity; restored: boolean }> {
  try {
    const raw = localStorage.getItem(storeKey(slot));
    if (raw) {
      const { pub, priv } = JSON.parse(raw) as { pub: JsonWebKey; priv: JsonWebKey };
      const publicKey = await crypto.subtle.importKey('jwk', pub, { name: 'Ed25519' }, true, ['verify']);
      const privateKey = await crypto.subtle.importKey('jwk', priv, { name: 'Ed25519' }, true, ['sign']);
      const podId = await P.derivePodId(publicKey);
      return { id: new P.PodIdentity({ keyPair: { publicKey, privateKey }, podId }), restored: true };
    }
  } catch { /* corrupt entry: fall through and regenerate */ }
  const id = await P.PodIdentity.generate();
  try {
    const pub = await crypto.subtle.exportKey('jwk', id.keyPair.publicKey);
    const priv = await crypto.subtle.exportKey('jwk', id.keyPair.privateKey);
    localStorage.setItem(storeKey(slot), JSON.stringify({ pub, priv }));
  } catch { /* storage may be unavailable; identity still works for this session */ }
  return { id, restored: false };
}

/* ------------------------------------------------------------------ */
/* SwarmNode: a Pod plus CRDT replicas, an ACL, and signed chat         */
/* ------------------------------------------------------------------ */

class SwarmNode {
  pod: Pod;
  podId: string;
  name: string;
  hue: number;
  pub = '';
  counter: PNCounter = new P.PNCounter();
  pixels: LWWMap<string> = new P.LWWMap<string>();
  chat = new Map<string, ChatEntry>();
  acl = new P.ACLEngine();
  revoked = new Set<string>();
  profiles = new Map<string, Profile>();
  private lastTs = 0;
  private timers: number[] = [];
  private listeners: ((e: NodeEvent) => void)[] = [];

  constructor(public identity: PodIdentity, public virtual: boolean) {
    this.pod = new Pod();
    this.podId = identity.podId;
    this.name = nameOf(this.podId);
    this.hue = hueOf(this.podId);
  }

  get color() { return colorOf(this.hue); }
  on(fn: (e: NodeEvent) => void) { this.listeners.push(fn); }
  private fire(e: NodeEvent) { for (const f of this.listeners) { try { f(e); } catch (err) { console.error(err); } } }

  async boot(): Promise<void> {
    this.pub = await exportPub(this.identity);
    this.pod.on('phase', (d: { phase: number; name: string }) => this.fire({ kind: 'phase', ...d }));
    this.pod.on('peer:found', (d: { podId: string; kind?: string }) => {
      this.touch(d.podId, { kind: d.kind });
      this.fire({ kind: 'log', text: `peer:found ${nameOf(d.podId)} via HELLO/HELLO_ACK` });
      if (this.pod.state === 'ready') { this.announce(d.podId); this.sendFull(d.podId); }
    });
    this.pod.on('peer:lost', (d: { podId: string }) => {
      this.profiles.delete(d.podId);
      this.fire({ kind: 'log', text: `peer:lost ${nameOf(d.podId)} (GOODBYE)` });
      this.fire({ kind: 'peers' });
    });
    this.pod.on('message', (m: PodWireMessage) => { this.receive(m).catch(err => this.fire({ kind: 'log', text: `bad frame: ${err}` })); });

    // A virtual peer gets a stub global so it doesn't clobber the tab's pod runtime slot
    // or listen to window.postMessage; its transport is still a real BroadcastChannel.
    const stub: Record<string, unknown> = { document: {} };
    stub.window = stub; stub.parent = stub;
    await this.pod.boot({
      identity: this.identity,
      transport: new BroadcastChannelTransport(CHANNEL),
      discoveryTimeout: 350,
      handshakeTimeout: 150,
      // The stub only needs to look enough like `globalThis` to the pod
      // runtime's own duck-typed checks (document/window/parent); it is not
      // a real Window, so PodBootOptions's real `typeof globalThis` type is
      // asserted rather than satisfied structurally.
      ...(this.virtual ? { globalThis: stub as unknown as typeof globalThis } : {}),
    });
    this.announce();
    this.sendFull();
    this.emit(T.CRDT_SYNC, { k: 'want' });
    this.timers.push(window.setInterval(() => this.heartbeat(), HEARTBEAT_MS));
    this.heartbeat();
  }

  async shutdown() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    try { await this.pod.shutdown(); } catch { /* already down */ }
  }

  /* ---- wire ---- */
  private emit(type: number, payload: unknown, to?: string) {
    if (this.pod.state !== 'ready') return;
    const bytes = P.encodeMeshMessage({ type, from: this.podId, to, payload });
    try { if (to) this.pod.send(to, bytes); else this.pod.broadcast(bytes); } catch { return; }
    this.fire({ kind: 'frame', dir: 'out', type, from: this.podId, to, size: bytes.length, hex: hex(bytes), bcast: !to });
  }

  private async receive(m: PodWireMessage) {
    if (!(m.payload instanceof Uint8Array)) return;
    const msg = P.decodeMeshMessage(m.payload);
    const from = m.from;
    if (msg.from !== from) return; // envelope and wire frame must agree on the author
    this.fire({ kind: 'frame', dir: 'in', type: msg.type, from, to: msg.to, size: m.payload.length, hex: hex(m.payload), bcast: m.to === '*' });
    const p = (msg.payload ?? {}) as Record<string, any>;
    switch (msg.type) {
      case T.IDENTITY_ANNOUNCE:
      case T.SWARM_HEARTBEAT:
        this.touch(from, { name: p.name, hue: p.hue, virtual: p.virtual, peers: p.peers, pub: p.pub, kind: p.kind });
        break;
      case T.CRDT_SYNC:
        this.touch(from, {});
        if (p.k === 'counter') this.mergeCounter(p.state);
        else if (p.k === 'px') this.applyPixel(from, p.key, p.color, p.ts);
        else if (p.k === 'want') this.sendFull(from);
        else if (p.k === 'full') await this.mergeFull(from, p);
        break;
      case T.BROADCAST:
        this.touch(from, {});
        if (p.k === 'chat') await this.acceptChat(p.env as ChatEnv);
        break;
      case T.CAP_GRANT:
      case T.CAP_REVOKE: {
        const st = p as SignedToken;
        const v = await verifyFrom(from, st.pub, enc.encode(JSON.stringify(st.token)), st.sig);
        const tok = new P.CapabilityToken(st.token);
        const granted = msg.type === T.CAP_GRANT;
        const ok = v.ok && tok.subject === this.podId && tok.issuer === from && !tok.isExpired();
        this.fire({ kind: 'cap', from, granted, ok, scopes: tok.scopes, why: v.why });
        break;
      }
      case T.UNICAST:
        if (p.k === 'nack') this.fire({ kind: 'nack', by: from, key: p.key, reason: p.reason });
        break;
    }
  }

  private touch(podId: string, info: Partial<Profile>) {
    if (podId === this.podId) return;
    const prev = this.profiles.get(podId);
    const next: Profile = {
      podId,
      name: info.name ?? prev?.name ?? nameOf(podId),
      hue: info.hue ?? prev?.hue ?? hueOf(podId),
      virtual: info.virtual ?? prev?.virtual ?? false,
      kind: info.kind ?? prev?.kind ?? 'window',
      peers: info.peers ?? prev?.peers ?? [],
      pub: info.pub ?? prev?.pub,
      lastSeen: Date.now(),
    };
    this.profiles.set(podId, next);
    this.ensureGrant(podId);
    if (!prev) this.fire({ kind: 'peers' });
  }

  private hello() {
    return { name: this.name, hue: this.hue, virtual: this.virtual, pub: this.pub, kind: this.pod.kind ?? 'window', peers: [...this.pod.peers.keys()] };
  }
  announce(to?: string) { this.emit(T.IDENTITY_ANNOUNCE, this.hello(), to); }
  private heartbeat() {
    this.emit(T.SWARM_HEARTBEAT, this.hello());
    const now = Date.now();
    let changed = false;
    for (const [id, pr] of this.profiles) if (now - pr.lastSeen > DROP_MS) { this.profiles.delete(id); changed = true; }
    if (changed) this.fire({ kind: 'peers' });
  }

  /* ---- counter (PNCounter) ---- */
  bump(delta: number) {
    if (delta >= 0) this.counter.increment(this.podId, delta); else this.counter.decrement(this.podId, -delta);
    this.fire({ kind: 'state', what: 'counter' });
    this.emit(T.CRDT_SYNC, { k: 'counter', state: this.counter.toJSON() });
  }
  private mergeCounter(state: ReturnType<PNCounter['toJSON']>) {
    const before = this.counter.value;
    this.counter = this.counter.merge(P.PNCounter.fromJSON(state));
    if (this.counter.value !== before) this.fire({ kind: 'state', what: 'counter' });
  }

  /* ---- pixels (LWWMap) gated by ACLEngine ---- */
  private nextTs() { this.lastTs = Math.max(Date.now(), this.lastTs + 1); return this.lastTs; }
  ensureGrant(peer: string) {
    if (peer === this.podId || this.revoked.has(peer)) return;
    if (this.acl.listGrants(peer).some(g => !g.revoked)) return;
    this.acl.addGrant(new P.AccessGrant({
      id: P.generateGrantId(), grantee: peer, grantor: this.podId,
      permissions: [{ resource: 'mesh://pixels/**', actions: ['write'] }],
    }));
  }
  canPaint(peer: string, key: string) {
    if (peer === this.podId) return { allowed: true } as CheckResult;
    this.ensureGrant(peer);
    return this.acl.check(peer, PIXEL_RES(key), 'write');
  }
  isGranted(peer: string) { return !this.revoked.has(peer); }
  authorOf(key: string): string | undefined { return this.pixels.state().get(key)?.state().nodeId; }

  paint(key: string, color: string | null) {
    const ts = this.nextTs();
    if (color === null) this.pixels.delete(key, ts, this.podId); else this.pixels.set(key, color, ts, this.podId);
    this.fire({ kind: 'state', what: 'pixels' });
    this.emit(T.CRDT_SYNC, { k: 'px', key, color, ts });
  }
  private applyPixel(from: string, key: string, color: string | null, ts: number) {
    if (typeof key !== 'string' || typeof ts !== 'number') return;
    const verdict = this.canPaint(from, key);
    if (!verdict.allowed) {
      const reason = verdict.reason ?? 'denied';
      this.fire({ kind: 'reject', author: from, key, reason });
      this.emit(T.UNICAST, { k: 'nack', key, reason }, from);
      return;
    }
    this.lastTs = Math.max(this.lastTs, ts);
    if (color === null) this.pixels.delete(key, ts, from); else this.pixels.set(key, color, ts, from);
    this.fire({ kind: 'state', what: 'pixels' });
  }

  /* ---- full-state anti-entropy ---- */
  sendFull(to?: string) {
    const chat = [...this.chat.values()].sort((a, b) => a.ts - b.ts).slice(-40)
      .map(({ ok: _ok, why: _why, ...env }) => env);
    this.emit(T.CRDT_SYNC, { k: 'full', counter: this.counter.toJSON(), pixels: this.pixels.toJSON(), chat }, to);
  }
  private async mergeFull(from: string, p: Record<string, any>) {
    if (p.counter) this.mergeCounter(p.counter);
    if (p.pixels?.entries) {
      // Every register carries its author (nodeId); drop the ones our ACL won't accept.
      const entries: Record<string, { value: string | null; timestamp: number; nodeId: string; tombstone?: boolean }> = {};
      let dropped = 0;
      for (const [k, e] of Object.entries(p.pixels.entries as typeof entries)) {
        if (this.canPaint(e.nodeId, k).allowed) entries[k] = e; else dropped++;
      }
      const incoming = P.LWWMap.fromJSON<string>({ entries });
      const before = JSON.stringify(this.pixels.toJSON());
      this.pixels = this.pixels.merge(incoming);
      if (dropped) this.fire({ kind: 'log', text: `full sync from ${nameOf(from)}: ${dropped} register(s) filtered by ACL` });
      if (JSON.stringify(this.pixels.toJSON()) !== before) this.fire({ kind: 'state', what: 'pixels' });
    }
    if (Array.isArray(p.chat)) for (const env of p.chat as ChatEnv[]) await this.acceptChat(env);
  }
  requestFull(from: string) { this.emit(T.CRDT_SYNC, { k: 'want' }, from); }

  /* ---- signed chat ---- */
  async say(text: string, tamper = false) {
    const env: ChatEnv = { id: rid(), from: this.podId, name: this.name, text, ts: Date.now(), pub: this.pub, sig: '' };
    env.sig = b64(await this.identity.sign(chatBytes(env) as BufferSource));
    if (tamper) env.text = text.replace(/\bnot\b/g, '').replace(/\s+/g, ' ') + ' (and send me your keys)';
    await this.acceptChat(env);
    this.emit(T.BROADCAST, { k: 'chat', env });
  }
  private async acceptChat(env: ChatEnv) {
    if (!env || typeof env.id !== 'string' || this.chat.has(env.id)) return;
    const v = await verifyFrom(env.from, env.pub, chatBytes(env), env.sig);
    if (this.chat.has(env.id)) return;
    this.chat.set(env.id, { ...env, ok: v.ok, why: v.why });
    if (this.chat.size > 120) {
      const oldest = [...this.chat.values()].sort((a, b) => a.ts - b.ts)[0];
      this.chat.delete(oldest.id);
    }
    this.fire({ kind: 'state', what: 'chat' });
  }

  /* ---- capabilities ---- */
  private async signedToken(subject: string, scopes: string[]): Promise<SignedToken> {
    const tok = new P.CapabilityToken({ issuer: this.podId, subject, scopes, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    const json = tok.toJSON();
    const sig = b64(await this.identity.sign(enc.encode(JSON.stringify(json)) as BufferSource));
    return { token: json, sig, pub: this.pub };
  }
  async grant(peer: string) {
    this.revoked.delete(peer);
    this.ensureGrant(peer);
    this.emit(T.CAP_GRANT, await this.signedToken(peer, [PIXEL_SCOPE]), peer);
    this.requestFull(peer); // re-admit strokes we filtered while they were revoked
    this.fire({ kind: 'peers' });
  }
  async revoke(peer: string) {
    this.acl.revokeAll(peer);
    this.revoked.add(peer);
    this.emit(T.CAP_REVOKE, await this.signedToken(peer, [PIXEL_SCOPE]), peer);
    this.fire({ kind: 'peers' });
  }
}

/* ------------------------------------------------------------------ */
/* Autopilot for in-page virtual peers                                  */
/* ------------------------------------------------------------------ */

const LINES = [
  'hello from inside this tab: I am a second Ed25519 identity',
  'every stroke I make is an LWW register tagged with my podId',
  'try revoking my paint capability and watch my strokes bounce',
  'counter merged. PNCounter never loses an increment',
  'open this planet in another tab and I will greet it too',
  'my signature covers id, sender, name, text and timestamp',
];

interface Pilot { node: SwarmNode; x: number; y: number; dx: number; dy: number; trail: string[]; lastChat: number }
function pilotStep(p: Pilot) {
  const n = p.node;
  if (n.pod.state !== 'ready') return;
  const r = Math.random();
  if (r < 0.2) { [p.dx, p.dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)]; }
  p.x = (p.x + p.dx + GRID) % GRID; p.y = (p.y + p.dy + GRID) % GRID;
  const key = `${p.x},${p.y}`;
  n.paint(key, n.color);
  p.trail.push(key);
  if (p.trail.length > 18) {
    const old = p.trail.shift()!;
    if (!p.trail.includes(old) && n.authorOf(old) === n.podId && n.pixels.get(old) === n.color) n.paint(old, null);
  }
  if (Math.random() < 0.12) n.bump(1);
  if (Date.now() - p.lastChat > 14000 + Math.random() * 8000) {
    p.lastChat = Date.now();
    n.say(LINES[Math.floor(Math.random() * LINES.length)]);
  }
}

/* ------------------------------------------------------------------ */
/* Planet                                                                */
/* ------------------------------------------------------------------ */

const DEFAULTS = { vp: 1, auto: true };
const PHASES = ['install-runtime', 'install-listeners', 'self-classification', 'parent-handshake', 'peer-discovery', 'role-finalization'];

const playground: Playground = {
  id: 'mesh',
  title: 'Browsermesh Swarm',
  pkg: '@johnhenry/browsermesh-primitives',
  hue: 140,
  blurb: 'Open this planet in two tabs: they find each other, share a CRDT, and sign with Ed25519 identities.',
  docs: 'https://opensource.johnhenry.me/browsermesh/',
  mount(host) {
    const st = readState(DEFAULTS);
    const state = { vp: Math.max(0, Math.min(4, Number(st.vp) || 0)), auto: st.auto !== false };
    let disposed = false;
    let me: SwarmNode | null = null;
    let slot: Slot | null = null;
    const pilots: Pilot[] = [];
    const timers: number[] = [];
    let raf = 0;

    const root = document.createElement('div');
    root.className = 'pg-mesh';
    root.innerHTML = `
      <section class="panel me-card">
        <div class="me-avatar" data-r="avatar"><div class="spin"></div></div>
        <div class="me-info">
          <div class="me-name" data-r="name">booting pod…</div>
          <div class="me-fp mono" data-r="fp" title="podId = base64url(SHA-256(Ed25519 public key))">—</div>
          <div class="stat" data-r="meta">generating identity</div>
          <ol class="phases" data-r="phases">${PHASES.map((p, i) => `<li data-i="${i}"><span>${i}</span>${p}</li>`).join('')}</ol>
        </div>
        <div class="me-actions">
          <a class="btn primary" data-r="newtab" href="#/mesh" target="_blank" rel="noopener">Open a second tab ↗</a>
          <button class="btn" data-r="addvp">+ virtual peer</button>
          <button class="btn" data-r="rmvp">− virtual peer</button>
          <label class="toggle"><input type="checkbox" data-r="auto"> autopilot</label>
          <div class="row-mini">
            <button class="btn ghost" data-r="rotate" title="Forget this tab's stored keypair and reload">rotate identity</button>
            <button class="btn ghost" data-r="copy">copy link</button>
          </div>
        </div>
      </section>

      <div class="mesh-row">
        <section class="panel graph-panel">
          <header><h3>Mesh, as this pod sees it</h3><span class="stat" data-r="gstat"></span></header>
          <svg data-r="graph" viewBox="0 0 440 300" preserveAspectRatio="xMidYMid meet"></svg>
          <div class="legend stat"><span><i class="lg me"></i>you</span><span><i class="lg tab"></i>other tab</span><span><i class="lg vp"></i>virtual (in this tab)</span><span><i class="lg pulse"></i>frame on the wire</span></div>
        </section>
        <section class="panel peers-panel">
          <header><h3>Peers</h3><span class="stat" data-r="pcount"></span></header>
          <div class="peer-list" data-r="peers"></div>
          <p class="hint">Rows come from <code>peer:found</code> (HELLO / HELLO_ACK over BroadcastChannel) and are kept alive by signed-identity heartbeats (<code>SWARM_HEARTBEAT</code>). The toggle is <em>your</em> ACL: whether that peer may write pixels into <em>your</em> replica.</p>
        </section>
      </div>

      <div class="mesh-row">
        <section class="panel canvas-panel">
          <header><h3>Shared pixels <span class="chip">LWWMap</span></h3><span class="stat" data-r="pxstat"></span></header>
          <canvas data-r="canvas" width="${GRID * 22}" height="${GRID * 22}"></canvas>
          <div class="canvas-foot">
            <span class="stat" data-r="hover">click or drag to paint in your colour · shift/right-click erases, or tap "erase" below</span>
            <button class="btn ghost" data-r="erase" type="button" aria-pressed="false">erase</button>
            <button class="btn ghost" data-r="clear">clear my strokes</button>
          </div>
        </section>
        <section class="panel side-stack">
          <div class="counter-box">
            <header><h3>Counter <span class="chip">PNCounter</span></h3></header>
            <div class="counter-row">
              <button class="btn" data-r="dec">−1</button>
              <div class="counter-val" data-r="cval">0</div>
              <button class="btn primary" data-r="inc">+1</button>
            </div>
            <div class="contrib" data-r="contrib"></div>
          </div>
          <div class="cap-box">
            <header><h3>Capabilities <span class="chip">ACLEngine</span></h3></header>
            <div class="cap-log" data-r="caplog"><div class="empty">Revoke a peer's paint grant (in the peer list) and its next stroke lands here as a rejected write.</div></div>
          </div>
        </section>
      </div>

      <div class="mesh-row">
        <section class="panel chat-panel">
          <header><h3>Signed chat <span class="chip">Ed25519</span></h3><span class="stat" data-r="chatstat"></span></header>
          <div class="chat-log" data-r="chat"></div>
          <form class="chat-form" data-r="chatform">
            <input data-r="chatin" maxlength="200" placeholder="say something to the swarm…" autocomplete="off">
            <button class="btn primary" type="submit">Sign &amp; send</button>
            <button class="btn ghost" type="button" data-r="tamper" title="Sign a message, then alter its text after signing">send tampered</button>
          </form>
        </section>
        <section class="panel wire-panel">
          <header><h3>Wire</h3><span class="stat">encodeMeshMessage · 1B type + 4B length + JSON</span></header>
          <div class="wire" data-r="wire"></div>
        </section>
      </div>

      <section class="panel explain">
        <h3>What's happening</h3>
        <ol>
          <li><b>Identity.</b> <code>PodIdentity.generate()</code> makes an Ed25519 keypair; your podId is <code>base64url(SHA-256(publicKey))</code>. It's stored in <code>localStorage</code> under a per-tab slot claimed with a Web Lock, so a reload keeps your identity but a second tab gets its own.</li>
          <li><b>Discovery.</b> A <code>Pod</code> from <code>@johnhenry/browsermesh-pod</code> boots through six phases and announces itself with HELLO on a <code>BroadcastChannelTransport</code>; existing pods answer HELLO_ACK. Same protocol as the "two peers, one message" tutorial, over a real browser channel instead of an in-process bus.</li>
          <li><b>Wire.</b> Every app frame is <code>encodeMeshMessage({ type: MESH_TYPE.*, from, payload })</code>: announces, heartbeats, CRDT syncs, capability grants and NACKs.</li>
          <li><b>CRDTs.</b> The counter is a <code>PNCounter</code> (per-node tallies, merge = max). Pixels are an <code>LWWMap</code>: each cell is a last-writer-wins register tagged with its author, so concurrent strokes converge in every replica without coordination. Joiners get full state and merge it.</li>
          <li><b>Capabilities.</b> Each replica runs an <code>ACLEngine</code>. Every peer gets an <code>AccessGrant</code> on <code>mesh://pixels/**</code>; revoking marks it revoked, sends a signed <code>CapabilityToken</code> in a <code>CAP_REVOKE</code> frame, and further writes fail <code>check()</code> with a reason, get a NACK, and are filtered out of later full syncs.</li>
          <li><b>Signatures.</b> Chat envelopes carry the sender's public key and an Ed25519 signature. Receivers check the key hashes to the claimed podId and verify with <code>PodIdentity.verify</code>. "Send tampered" alters the text after signing, and every peer rejects it.</li>
        </ol>
      </section>
      <pre class="code err" data-r="err" hidden></pre>`;
    host.appendChild(root);

    const $ = <E extends Element = HTMLElement>(r: string) => root.querySelector(`[data-r="${r}"]`) as unknown as E;
    const errBox = $<HTMLPreElement>('err');
    const showErr = (e: unknown) => { errBox.hidden = false; errBox.textContent = `${(e as Error)?.message ?? e}`; };

    /* ---- UI-only state ---- */
    const frames: (NodeEvent & { kind: 'frame'; t: number })[] = [];
    const capEvents: { t: number; html: string; bad: boolean }[] = [];
    const flashes = new Map<string, number>(); // key -> until
    const pulses: { a: string; b: string; t0: number; col: string }[] = [];
    let dirty = { peers: true, counter: true, pixels: true, chat: true, wire: true, cap: true };
    let renderQueued = false;
    const queue = (k: keyof typeof dirty) => { dirty[k] = true; if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); } };

    const nick = (id: string) => me && id === me.podId ? 'you' : (me?.profiles.get(id)?.name ?? nameOf(id));
    const virtualIds = () => new Set(pilots.map(p => p.node.podId));

    /* ---- node events ---- */
    function attach(node: SwarmNode) {
      node.on(e => {
        if (disposed) return;
        switch (e.kind) {
          case 'phase': {
            root.querySelectorAll<HTMLElement>('.phases li').forEach(li => {
              const i = Number(li.dataset.i);
              li.classList.toggle('done', i < e.phase);
              li.classList.toggle('now', i === e.phase);
            });
            break;
          }
          case 'frame': {
            frames.unshift({ ...e, t: Date.now() });
            if (frames.length > 40) frames.pop();
            addPulse(e);
            queue('wire');
            break;
          }
          case 'peers': queue('peers'); break;
          case 'state': queue(e.what === 'counter' ? 'counter' : e.what); break;
          case 'reject': {
            flashes.set(e.key, Date.now() + 900);
            capEvents.unshift({ t: Date.now(), bad: true, html: `<b>✕ rejected</b> ${esc(nick(e.author))} → pixel <code>${e.key}</code> <span class="why">${esc(e.reason)}</span>` });
            queue('cap'); queue('pixels');
            break;
          }
          case 'nack': {
            flashes.set(e.key, Date.now() + 900);
            capEvents.unshift({ t: Date.now(), bad: true, html: `<b>✕ your stroke</b> <code>${e.key}</code> was refused by ${esc(nick(e.by))}'s replica <span class="why">${esc(e.reason)}</span>` });
            queue('cap'); queue('pixels');
            break;
          }
          case 'cap': {
            const verb = e.granted ? 'granted you' : 'revoked your';
            capEvents.unshift({ t: Date.now(), bad: !e.granted || !e.ok, html: `${e.granted ? '<b>✓</b>' : '<b>⚠</b>'} ${esc(nick(e.from))} ${verb} <code>${esc(e.scopes.join(','))}</code> · token signature ${e.ok ? 'verified' : `<span class="why">${esc(e.why ?? 'invalid')}</span>`}` });
            queue('cap');
            break;
          }
          case 'log': {
            capEvents.unshift({ t: Date.now(), bad: false, html: `<span class="dim">${esc(e.text)}</span>` });
            queue('cap');
            break;
          }
        }
        if (capEvents.length > 30) capEvents.length = 30;
      });
    }

    function addPulse(e: NodeEvent & { kind: 'frame' }) {
      if (!me || e.type === T.SWARM_HEARTBEAT && Math.random() < 0.5) return;
      const col = e.type === T.CRDT_SYNC ? 'var(--accent)' : e.type === T.BROADCAST ? '#f5c451' : e.type === T.CAP_GRANT || e.type === T.CAP_REVOKE || e.type === T.UNICAST ? '#ff6b6b' : '#8ab4ff';
      const t0 = performance.now();
      if (e.dir === 'out') {
        const targets = e.to ? [e.to] : [...me.profiles.keys()];
        for (const b of targets) pulses.push({ a: me.podId, b, t0, col });
      } else if (e.bcast) {
        // A broadcast reaches every pod on the channel: show it fanning out from the sender.
        pulses.push({ a: e.from, b: me.podId, t0, col });
        const sender = me.profiles.get(e.from);
        for (const b of sender?.peers ?? []) if (b !== me.podId && me.profiles.has(b)) pulses.push({ a: e.from, b, t0, col });
      } else pulses.push({ a: e.from, b: me.podId, t0, col });
      if (pulses.length > 120) pulses.splice(0, pulses.length - 120);
    }

    /* ---- rendering ---- */
    const typeName = (t: number) => P.messageTypeRegistry.get(t) ?? `0x${t.toString(16)}`;
    const ago = (t: number) => { const s = (Date.now() - t) / 1000; return s < 1 ? 'now' : s < 60 ? `${s.toFixed(1)}s ago` : `${Math.floor(s / 60)}m ago`; };

    function renderPeers() {
      if (!me) return;
      const vps = virtualIds();
      const list = [...me.profiles.values()].sort((a, b) => a.name.localeCompare(b.name));
      $('pcount').textContent = `${list.length} peer${list.length === 1 ? '' : 's'} · booted as ${me.pod.role}`;
      const box = $('peers');
      if (!list.length) {
        box.innerHTML = `<div class="empty">Alone on <code>${CHANNEL}</code>. Open a second tab, or add a virtual peer.</div>`;
        return;
      }
      box.innerHTML = list.map(pr => {
        const local = vps.has(pr.podId);
        const pilot = pilots.find(p => p.node.podId === pr.podId);
        const theyAllowMe = pilot ? pilot.node.isGranted(me!.podId) : null;
        const stale = Date.now() - pr.lastSeen > STALE_MS;
        return `<div class="peer ${stale ? 'stale' : ''}" data-id="${pr.podId}">
          ${identicon(pr.podId, 34)}
          <div class="pinfo">
            <div class="pname" style="color:${colorOf(pr.hue)}">${esc(pr.name)} <span class="tag">${pr.virtual ? (local ? 'virtual · this tab' : 'virtual · other tab') : 'tab'}</span></div>
            <div class="mono pfp">${fingerprint(pr.podId, 3)}… · <span data-seen="${pr.podId}">${ago(pr.lastSeen)}</span></div>
          </div>
          <div class="pacts">
            <button class="cap-btn ${me!.isGranted(pr.podId) ? 'on' : 'off'}" data-act="toggle" title="May this peer write pixels into your replica?">${me!.isGranted(pr.podId) ? '✓ can paint' : '✕ revoked'}</button>
            ${theyAllowMe === null ? '' : `<button class="cap-btn small ${theyAllowMe ? 'on' : 'off'}" data-act="theirs" title="This virtual peer's ACL entry for you">${theyAllowMe ? 'lets you paint' : 'blocks you'}</button>`}
          </div>
        </div>`;
      }).join('');
    }

    function renderCounter() {
      if (!me) return;
      $('cval').textContent = String(me.counter.value);
      const js = me.counter.toJSON();
      const ids = new Set([...Object.keys(js.pos), ...Object.keys(js.neg)]);
      const rows = [...ids].map(id => ({ id, v: (js.pos[id] ?? 0) - (js.neg[id] ?? 0), pos: js.pos[id] ?? 0, neg: js.neg[id] ?? 0 }))
        .sort((a, b) => b.pos + b.neg - (a.pos + a.neg));
      const max = Math.max(1, ...rows.map(r => r.pos + r.neg));
      $('contrib').innerHTML = rows.length ? rows.map(r => `<div class="crow"><span class="cn" style="color:${colorOf(hueOf(r.id))}">${esc(nick(r.id))}</span>
        <span class="cbar"><i class="p" style="width:${r.pos / max * 100}%;background:${colorOf(hueOf(r.id))}"></i><i class="n" style="width:${r.neg / max * 100}%"></i></span>
        <span class="mono cv">+${r.pos} −${r.neg}</span></div>`).join('')
        : `<div class="empty">Per-node tallies appear here. merge() takes the max of each.</div>`;
    }

    const canvas = $<HTMLCanvasElement>('canvas');
    const ctx = canvas.getContext('2d')!;
    const CELL = canvas.width / GRID;
    function drawPixels() {
      if (!me) return;
      const now = Date.now();
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [key, color] of me.pixels.entries()) {
        const [x, y] = key.split(',').map(Number);
        ctx.fillStyle = color;
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 1; i < GRID; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL + .5, 0); ctx.lineTo(i * CELL + .5, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * CELL + .5); ctx.lineTo(canvas.width, i * CELL + .5); ctx.stroke();
      }
      for (const [key, until] of flashes) {
        if (until < now) { flashes.delete(key); continue; }
        const [x, y] = key.split(',').map(Number);
        const a = (until - now) / 900;
        ctx.strokeStyle = `rgba(255,80,80,${a})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
        ctx.beginPath(); ctx.moveTo(x * CELL + 6, y * CELL + 6); ctx.lineTo((x + 1) * CELL - 6, (y + 1) * CELL - 6);
        ctx.moveTo((x + 1) * CELL - 6, y * CELL + 6); ctx.lineTo(x * CELL + 6, (y + 1) * CELL - 6); ctx.stroke();
      }
      const authors = new Set<string>();
      for (const k of me.pixels.keys()) { const a = me.authorOf(k); if (a) authors.add(a); }
      $('pxstat').textContent = `${me.pixels.size} cells · ${authors.size} author${authors.size === 1 ? '' : 's'}`;
    }

    function renderChat() {
      if (!me) return;
      const list = [...me.chat.values()].sort((a, b) => a.ts - b.ts).slice(-60);
      const box = $('chat');
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      box.innerHTML = list.length ? list.map(c => `<div class="msg ${c.ok ? '' : 'bad'}">
        ${identicon(c.from, 22)}
        <div class="mbody"><div class="mhead"><b style="color:${colorOf(hueOf(c.from))}">${esc(c.from === me!.podId ? `${c.name} (you)` : c.name)}</b>
          <span class="sig ${c.ok ? 'ok' : 'no'}" title="sig ${esc(c.sig.slice(0, 24))}…">${c.ok ? '✓ Ed25519 verified' : `✕ ${esc(c.why ?? 'rejected')}`}</span></div>
          <div class="mtext">${esc(c.text)}</div></div></div>`).join('')
        : `<div class="empty">No messages yet. Every line is signed by its sender and verified by each receiver.</div>`;
      if (atBottom || list.length < 6) box.scrollTop = box.scrollHeight;
      const bad = list.filter(c => !c.ok).length;
      $('chatstat').textContent = `${list.length} messages · ${bad} rejected`;
    }

    function renderWire() {
      $('wire').innerHTML = frames.slice(0, 14).map(f => `<div class="frame ${f.dir}">
        <span class="dir">${f.dir === 'out' ? '↑' : '↓'}</span>
        <span class="ty">${typeName(f.type)}</span>
        <span class="who">${esc(f.dir === 'out' ? (f.to ? `→ ${nick(f.to)}` : '→ *') : `← ${nick(f.from)}`)}</span>
        <span class="sz mono">${f.size}B</span>
        <span class="hx mono">${f.hex}</span></div>`).join('') || `<div class="empty">No frames yet.</div>`;
    }

    function renderCap() {
      const box = $('caplog');
      if (!capEvents.length) return;
      box.innerHTML = capEvents.slice(0, 12).map(c => `<div class="cev ${c.bad ? 'bad' : ''}">${c.html}</div>`).join('');
    }

    function render() {
      renderQueued = false;
      if (disposed || !me) return;
      if (dirty.peers) renderPeers();
      if (dirty.counter) renderCounter();
      if (dirty.pixels) drawPixels();
      if (dirty.chat) renderChat();
      if (dirty.wire) renderWire();
      if (dirty.cap) renderCap();
      dirty = { peers: false, counter: false, pixels: false, chat: false, wire: false, cap: false };
    }

    /* ---- graph (animated every frame) ---- */
    const svg = $<SVGSVGElement>('graph');
    function graphFrame(now: number) {
      raf = requestAnimationFrame(graphFrame);
      if (!me) return;
      const W = 440, H = 300, cx = W / 2, cy = H / 2;
      const vps = virtualIds();
      const peers = [...me.profiles.values()].sort((a, b) => a.podId.localeCompare(b.podId));
      const pos = new Map<string, { x: number; y: number }>();
      pos.set(me.podId, { x: cx, y: cy });
      const n = peers.length;
      const rot = now / 40000;
      peers.forEach((p, i) => {
        const ang = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2 + rot;
        const r = 112 + Math.sin(now / 1400 + i) * 4;
        pos.set(p.podId, { x: cx + Math.cos(ang) * r * 1.35, y: cy + Math.sin(ang) * r * 0.95 });
      });
      let edges = '';
      const seen = new Set<string>();
      const edge = (a: string, b: string, cls: string) => {
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(k) || !pos.has(a) || !pos.has(b)) return;
        seen.add(k);
        const A = pos.get(a)!, B = pos.get(b)!;
        edges += `<line class="${cls}" x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}"/>`;
      };
      for (const p of peers) edge(me.podId, p.podId, 'e me');
      for (const p of peers) for (const q of p.peers) edge(p.podId, q, 'e far');
      let dots = '';
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pl = pulses[i];
        const t = (now - pl.t0) / 650;
        if (t >= 1) { pulses.splice(i, 1); continue; }
        const A = pos.get(pl.a), B = pos.get(pl.b);
        if (!A || !B || t < 0) continue;
        const e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        dots += `<circle class="pulse" cx="${(A.x + (B.x - A.x) * e).toFixed(1)}" cy="${(A.y + (B.y - A.y) * e).toFixed(1)}" r="${(4 - t * 1.5).toFixed(2)}" fill="${pl.col}" opacity="${(1 - t * .6).toFixed(2)}"/>`;
      }
      let nodes = '';
      const drawNode = (id: string, name: string, hue: number, cls: string) => {
        const p = pos.get(id)!;
        const col = colorOf(hue);
        nodes += `<g class="n ${cls}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
          <circle r="${cls.includes('self') ? 20 : 15}" fill="color-mix(in srgb, ${col} 22%, #0a0f1c)" stroke="${col}"/>
          <text class="nl" y="${cls.includes('self') ? 34 : 28}">${esc(name)}</text>
          <text class="ni" y="4">${esc(name.slice(0, 1).toUpperCase())}</text></g>`;
      };
      for (const p of peers) {
        const stale = Date.now() - p.lastSeen > STALE_MS;
        drawNode(p.podId, p.name, p.hue, `${vps.has(p.podId) || p.virtual ? 'vp' : 'tab'} ${stale ? 'stale' : ''}`);
      }
      drawNode(me.podId, `${me.name} (you)`, me.hue, 'self');
      svg.innerHTML = `<g>${edges}</g><g>${dots}</g><g>${nodes}</g>`;
      $('gstat').textContent = `${peers.length + 1} pods · ${seen.size} links`;
      // live "last seen" labels without re-rendering the peer list
      root.querySelectorAll<HTMLElement>('[data-seen]').forEach(el => {
        const pr = me!.profiles.get(el.dataset.seen!);
        if (pr) el.textContent = ago(pr.lastSeen);
      });
      if (flashes.size) drawPixels();
    }
    raf = requestAnimationFrame(graphFrame);

    /* ---- controls ---- */
    const autoBox = $<HTMLInputElement>('auto');
    autoBox.checked = state.auto;
    const persist = () => writeState(state, DEFAULTS);

    async function addVirtual() {
      if (pilots.length >= 4) return;
      const node = new SwarmNode(await P.PodIdentity.generate(), true);
      if (disposed) return;
      const pilot: Pilot = { node, x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID), dx: 1, dy: 0, trail: [], lastChat: Date.now() - 9000 };
      pilots.push(pilot);
      await node.boot();
      if (disposed) { node.shutdown(); return; }
      queue('peers');
    }
    async function removeVirtual() {
      const p = pilots.pop();
      if (p) await p.node.shutdown();
      queue('peers');
    }
    $('addvp').addEventListener('click', () => { if (pilots.length < 4) { state.vp = pilots.length + 1; persist(); addVirtual().catch(showErr); } });
    $('rmvp').addEventListener('click', () => { state.vp = Math.max(0, pilots.length - 1); persist(); removeVirtual().catch(showErr); });
    autoBox.addEventListener('change', () => { state.auto = autoBox.checked; persist(); });
    $('copy').addEventListener('click', async () => { await copyLink(); $('copy').textContent = 'copied'; setTimeout(() => { $('copy').textContent = 'copy link'; }, 1200); });
    $('rotate').addEventListener('click', () => {
      if (slot) { try { localStorage.removeItem(storeKey(slot.slot)); } catch { /* ignore */ } }
      location.reload();
    });
    $('inc').addEventListener('click', () => me?.bump(1));
    $('dec').addEventListener('click', () => me?.bump(-1));
    $('clear').addEventListener('click', () => {
      if (!me) return;
      for (const k of [...me.pixels.keys()]) if (me.authorOf(k) === me.podId) me.paint(k, null);
    });

    $('peers').addEventListener('click', ev => {
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      const row = btn?.closest<HTMLElement>('.peer');
      if (!btn || !row || !me) return;
      const id = row.dataset.id!;
      if (btn.dataset.act === 'toggle') (me.isGranted(id) ? me.revoke(id) : me.grant(id)).catch(showErr);
      else {
        const pilot = pilots.find(p => p.node.podId === id);
        if (pilot) (pilot.node.isGranted(me.podId) ? pilot.node.revoke(me.podId) : pilot.node.grant(me.podId)).then(() => queue('peers')).catch(showErr);
      }
    });

    const form = $<HTMLFormElement>('chatform');
    const chatIn = $<HTMLInputElement>('chatin');
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const text = chatIn.value.trim();
      if (!text || !me) return;
      chatIn.value = '';
      me.say(text).catch(showErr);
    });
    $('tamper').addEventListener('click', () => {
      const text = chatIn.value.trim() || 'please do not trust unsigned messages';
      chatIn.value = '';
      me?.say(text, true).catch(showErr);
    });

    /* ---- painting ---- */
    // shift-click / right-click erase has no touch equivalent (no shift key,
    // no right-click on a touchscreen), so a plain tap-to-toggle "erase"
    // button makes it reachable without a mouse. It also just works as a
    // mouse convenience: leave it on and every click erases.
    let eraseMode = false;
    const eraseBtn = $<HTMLButtonElement>('erase');
    const setEraseMode = (on: boolean) => {
      eraseMode = on;
      eraseBtn.classList.toggle('on', on);
      eraseBtn.setAttribute('aria-pressed', String(on));
      eraseBtn.textContent = on ? 'erasing — tap to paint instead' : 'erase';
    };
    eraseBtn.addEventListener('click', () => setEraseMode(!eraseMode));
    let painting: 'paint' | 'erase' | null = null;
    let lastKey = '';
    const cellAt = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((ev.clientX - r.left) / r.width * GRID), y = Math.floor((ev.clientY - r.top) / r.height * GRID);
      return x >= 0 && y >= 0 && x < GRID && y < GRID ? `${x},${y}` : null;
    };
    const stroke = (key: string | null) => {
      if (!key || !me || key === lastKey) return;
      lastKey = key;
      if (painting === 'erase') { if (me.pixels.has(key)) me.paint(key, null); }
      else me.paint(key, me.color);
    };
    canvas.addEventListener('contextmenu', ev => ev.preventDefault());
    canvas.addEventListener('pointerdown', ev => {
      painting = ev.button === 2 || ev.shiftKey || eraseMode ? 'erase' : 'paint';
      lastKey = '';
      canvas.setPointerCapture(ev.pointerId);
      stroke(cellAt(ev));
    });
    canvas.addEventListener('pointermove', ev => {
      const key = cellAt(ev);
      if (painting) stroke(key);
      if (key && me) {
        const a = me.authorOf(key);
        $('hover').textContent = me.pixels.has(key) && a ? `${key} · last writer ${nick(a)} (LWW register)` : `${key} · empty`;
      }
    });
    const stop = () => { painting = null; lastKey = ''; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    /* ---- lifecycle ---- */
    const onHide = () => { me?.pod.shutdown().catch(() => {}); for (const p of pilots) p.node.pod.shutdown().catch(() => {}); };
    addEventListener('pagehide', onHide);

    timers.push(window.setInterval(() => {
      if (!state.auto) return;
      for (const p of pilots) pilotStep(p);
    }, 650));
    timers.push(window.setInterval(() => queue('peers'), 3000)); // stale dimming

    (async () => {
      if (!(await P.probeEd25519Support())) throw new Error('WebCrypto Ed25519 is not available in this browser (needs Safari 17+ / Chromium 137+). browsermesh has no software fallback.');
      slot = await claimSlot();
      if (disposed) { slot.release(); return; }
      const { id, restored } = await loadOrCreateIdentity(slot.slot);
      if (disposed) return;
      me = new SwarmNode(id, false);
      attach(me);
      $('avatar').innerHTML = identicon(id.podId, 76);
      $('name').innerHTML = `<span style="color:${me.color}">${esc(me.name)}</span>`;
      $('fp').textContent = fingerprint(id.podId, 11);
      $('meta').innerHTML = `slot <b>#${slot.slot}</b> · ${restored ? 'restored from localStorage' : 'fresh keypair, saved to localStorage'} · booting…`;
      await me.boot();
      if (disposed) { await me.shutdown(); return; }
      $('meta').innerHTML = `slot <b>#${slot.slot}</b> · ${restored ? 'restored from localStorage' : 'fresh keypair, saved'} · kind <b>${me.pod.kind}</b> · booted as <b>${me.pod.role}</b> · channel <b>${CHANNEL}</b>`;
      root.querySelectorAll('.phases li').forEach(li => { li.classList.add('done'); li.classList.remove('now'); });
      $<HTMLAnchorElement>('newtab').href = location.href.split('#')[0] + '#/mesh';
      queue('peers'); queue('counter'); queue('pixels'); queue('chat');
      for (let i = 0; i < state.vp; i++) await addVirtual();
    })().catch(showErr);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      for (const t of timers) clearInterval(t);
      removeEventListener('pagehide', onHide);
      me?.shutdown();
      for (const p of pilots) p.node.shutdown();
      pilots.length = 0;
      slot?.release();
    };
  },
};

export default playground;
