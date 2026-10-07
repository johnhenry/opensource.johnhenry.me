import type { Playground } from '../registry';
import {
  InMemoryStateStore,
  accountKey,
  encodeAccount,
  ed25519Verifier,
  hash,
  hashString,
  encodeTxSigned,
  equal,
  toHex,
  fromHex,
} from '@johnhenry/raijin-core';
import type { Block, TransactionReceipt, Account, Transaction } from '@johnhenry/raijin-core';
import { ValidatorSet } from '@johnhenry/raijin-consensus';
import type {
  ConsensusMessage,
  ConsensusTimer,
  NetworkTransport,
} from '@johnhenry/raijin-consensus';
import { defaultFeeExtractor } from '@johnhenry/raijin-mempool';
import { LocalDA, CelestiaDA, EthBlobDA, encode, decode } from '@johnhenry/raijin-da';
import type { DALayer, DACommitment } from '@johnhenry/raijin-da';
import { ValidatorNode } from '@johnhenry/raijin-validator';
import { RaijinClient, Wallet } from '@johnhenry/raijin-sdk';
import type { ClientTransport } from '@johnhenry/raijin-sdk';
import { readState, writeState, copyLink } from '../state';
import { sendToTab, onTabHandoff } from '../bus';
import type { Handoff } from '../bus';
import './raijin.css';

/* ────────────────────────────────────────────────────────────────────────────
 * Raijin Ledger
 *
 * N real ValidatorNodes (raijin-validator) run in this page. Everything the
 * framework asks to have injected is written here:
 *   - transport: an in-memory pub/sub bus with per-hop latency, a per-receiver
 *     serial inbox, structured-clone "wire" copies, and partition/kill faults
 *   - timer: plain setTimeout; block time and view timeout go in as ValidatorNode
 *     config (`blockTime`, `viewTimeout`)
 *   - storage: one InMemoryStateStore per validator (genesis-funded identically)
 *   - identity: WebCrypto Ed25519 Wallets (raijin-sdk) + ed25519Verifier (core)
 *   - DA: a LocalDA that every canonical block is encoded into and verified from
 * The UI talks to the mesh only through RaijinClient over a ClientTransport.
 *
 * Below that, two independent, opt-in additions (item 2.7 of the roadmap):
 *   - Cross-tab validators: same ValidatorNode/PBFTConsensus classes, but the
 *     NetworkTransport is real — backed by bus.ts's sendToTab()/onTabHandoff(),
 *     which is @johnhenry/browsermesh-pod's BroadcastChannelTransport. Each
 *     browser tab that opts in is ONE real validator process; consensus
 *     genuinely crosses the browser's process/tab boundary.
 *   - A DA panel comparing LocalDA / CelestiaDA / EthBlobDA from raijin-da,
 *     including the latter's real, documented "not yet implemented" errors.
 * ──────────────────────────────────────────────────────────────────────────── */

const CHAIN_ID = 10n;
const MAX_TX_PER_BLOCK = 8;
const GENESIS = 1000n;
const ACCOUNTS = ['alice', 'bob', 'carol', 'dave', 'erin'];
const HISTORY_MS = 3200;
const FUTURE_MS = 700;

/* ── cross-tab validators: identity, coordination, transport ──────────────
 * Each tab that opts in generates a genuinely random Ed25519 identity
 * (Wallet.generate()) — that IS the validator. Tabs find each other by
 * broadcasting short-lived "hello" heartbeats over the tab bus, tagged with
 * a room key that folds in both the user-chosen room name and the target
 * validator count (so two tabs only coordinate if they agree on both — no
 * separate protocol needed to agree on N). Once >= N distinct identities
 * have been seen, every tab independently sorts the same set of hex pubkeys
 * ascending and takes the first N: since sorting is a pure function of the
 * roster, tabs that converge on the same roster snapshot compute the same
 * ValidatorSet, in the same order (order matters — ValidatorSet#epoch()
 * digests it, and leaderForView() picks by index). A short debounce after
 * first reaching N gives slower tabs a chance to be seen before locking.
 * Genesis accounts (alice..erin, the ones the compose form sends between)
 * must be byte-identical across tabs with zero coordination too, so instead
 * of Wallet.generate() they're imported from a PKCS8 key deterministically
 * derived from hashString('...account name...') via Wallet.fromKey() — the
 * account keys are reproducible, the validator identities are not.
 */
const CT_CHAIN_ID = 20n; // distinct from the in-page demo's CHAIN_ID — separate deployments, separate votes
const CT_BLOCK_TIME = 3000; // generous: background-tab timer throttling is real here, unlike the in-page mesh
const CT_VIEW_TIMEOUT = 15000;
const CT_HEARTBEAT_MS = 800;
const CT_PEER_TTL_MS = 3000;
const CT_LOCK_DEBOUNCE_MS = 900;

/** Fixed 16-byte PKCS8 DER prefix for an Ed25519 private key (RFC 8410): SEQUENCE { version 0, AlgorithmIdentifier{OID 1.3.101.112}, OCTET STRING { OCTET STRING <32-byte seed> } }. Appending any 32-byte seed yields a valid, importable PKCS8 document. */
const ED25519_PKCS8_PREFIX = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
function pkcs8FromSeed(seed: Uint8Array): Uint8Array {
  const out = new Uint8Array(48);
  out.set(ED25519_PKCS8_PREFIX, 0);
  out.set(seed.subarray(0, 32), 16);
  return out;
}
/** The genesis account wallets (ACCOUNTS), rederived identically by every tab — no bus traffic needed. Memoized once per page load. */
let genesisWalletsPromise: Promise<Wallet[]> | null = null;
function getGenesisWallets(): Promise<Wallet[]> {
  if (!genesisWalletsPromise) {
    genesisWalletsPromise = Promise.all(
      ACCOUNTS.map(async (name) => Wallet.fromKey(pkcs8FromSeed(await hashString(`raijin-orrery-crosstab-genesis:${name}`)))),
    );
  }
  return genesisWalletsPromise;
}

function ctSanitizeRoom(s: string): string {
  const clean = (s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
  return clean || 'lobby';
}
function ctSanitizeN(n: number): number {
  return Math.min(7, Math.max(2, Math.round(n) || 4));
}

interface CTHelloPayload { room: string; pk: string; n: number; ts: number }
interface CTByePayload { room: string; pk: string }
interface CTMsgPayload { room: string; from: string; to: string | null; msg: ConsensusMessage }
interface CTTxPayload { room: string; tx: Transaction }
type CTEnvelopeKind = 'ct-hello' | 'ct-bye' | 'ct-msg' | 'ct-tx';

interface CTBlockRec { h: bigint; block: Block; root: string; proposer: number; ok: number; rev: number }
interface CTPeer { ts: number }
interface CTStateShape {
  enabled: boolean;
  room: string;
  targetN: number;
  roomKey: string;
  wallet: Wallet | null;
  selfHex: string;
  roster: Map<string, CTPeer>;
  locked: boolean;
  participants: string[];
  idx: number;
  node: ValidatorNode | null;
  genesisWallets: Wallet[] | null;
  timers: Set<number>;
  offHandoff: (() => void) | null;
  blocks: CTBlockRec[];
  log: string[];
  destroyed: boolean;
}
function freshCT(): CTStateShape {
  return {
    enabled: false, room: '', targetN: 4, roomKey: '', wallet: null, selfHex: '',
    roster: new Map(), locked: false, participants: [], idx: -1, node: null,
    genesisWallets: null, timers: new Set(), offHandoff: null, blocks: [], log: [], destroyed: false,
  };
}

/* ── DA panel: LocalDA vs CelestiaDA vs EthBlobDA ──────────────────────── */
interface DAResult { name: string; ok: boolean; commitment?: DACommitment; verified?: boolean; verifyError?: string; retrieveOk?: boolean; retrieveError?: string; error?: string }
const DA_CELESTIA_NAMESPACE = 'a1b2c3d4e5f60718'; // 8 bytes hex, as CelestiaDAOptions.namespace documents

type Status = 'up' | 'down' | 'partitioned' | 'syncing';
type Handler = (from: Uint8Array, msg: ConsensusMessage) => unknown;

interface V {
  idx: number;
  wallet: Wallet;
  pk: Uint8Array;
  hex: string;
  store: InMemoryStateStore;
  node: ValidatorNode;
  handlers: Handler[];
  status: Status;
  inbox: Promise<void>;
  height: bigint;
  roots: Map<string, string>; // height → root hex ('sync' when imported)
  syncs: number;
  lagChecks: number;
  behindSince: number | null; // when this node first trailed netHeight at its current height
  mismatches: number; // heights where this node's root disagreed with the majority (detected, never repaired)
  lastProgress: number; // last finalize / view change / sync (watchdog liveness check)
  rearms: number;
  busy: boolean;
  seenPP: Set<string>; // "view:seq" of PRE-PREPAREs delivered here (to count votes that beat theirs)
}

interface BlockRec {
  h: bigint;
  block: Block;
  ok: number;
  rev: number;
  proposer: number;
  root: string;
  da?: { hash: string; bytes: number; magic: string; verified: boolean; roundTrip: boolean };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const short = (hex: string, n = 8) => hex.slice(0, n);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function feeBytes(fee: bigint): Uint8Array {
  // data[0] = 0x01 (TransactionType.Transfer, read by the state machine),
  // data[1..9] = fee as big-endian u64 (read by the mempool's defaultFeeExtractor).
  const d = new Uint8Array(9);
  d[0] = 0x01;
  let f = fee;
  for (let i = 8; i >= 1; i--) { d[i] = Number(f & 0xffn); f >>= 8n; }
  return d;
}

function serializeBlock(b: Block): string {
  return JSON.stringify(b, (_k, v) => {
    if (typeof v === 'bigint') return { $n: v.toString() };
    if (v instanceof Uint8Array) return { $b: toHex(v) };
    return v;
  });
}

function rootHue(hex: string): number {
  return (parseInt(hex.slice(0, 4), 16) % 360);
}

const playground: Playground = {
  id: 'raijin',
  title: 'Raijin Ledger',
  pkg: '@johnhenry/raijin-core',
  hue: 10,
  blurb: 'A browser-native rollup: in-page validators run PBFT rounds with leader rotation over a fee-ordered mempool.',
  docs: 'https://opensource.johnhenry.me/raijin/',
  mount(host) {
    const defaults = { n: 4, lat: 60, bt: 800, vt: 4, auto: true, shuffle: false, ct: false, ctRoom: 'lobby', ctN: 4 };
    const state = readState(defaults);
    state.n = Math.min(7, Math.max(4, Math.round(Number(state.n) || 4)));
    state.lat = Math.min(400, Math.max(0, Math.round(Number(state.lat) || 0)));
    if (![400, 800, 2000].includes(Number(state.bt))) state.bt = 800;
    state.vt = Math.min(10, Math.max(1, Math.round((Number(state.vt) || 4) * 2) / 2));
    state.auto = state.auto !== false;
    state.shuffle = state.shuffle === true;
    state.ct = state.ct === true;
    state.ctRoom = ctSanitizeRoom(String(state.ctRoom ?? defaults.ctRoom));
    state.ctN = ctSanitizeN(Number(state.ctN) || defaults.ctN);

    let disposed = false;
    const intervals: number[] = [];
    let raf = 0;

    host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'pg-raijin';
    host.appendChild(root);

    root.innerHTML = `
      <div class="rj-bar panel">
        <label class="field rj-n">validators <b data-o="n"></b><input type="range" min="4" max="7" step="1" data-i="n"></label>
        <label class="field rj-lat">hop latency <b data-o="lat"></b><input type="range" min="0" max="400" step="10" data-i="lat"></label>
        <label class="field">block time <b class="rj-bt-ghost">&nbsp;</b>
          <select data-i="bt"><option value="400">0.4 s</option><option value="800">0.8 s</option><option value="2000">2 s (library default)</option></select>
        </label>
        <label class="field rj-vt" title="ValidatorNodeConfig.viewTimeout: how long a node waits for the leader before broadcasting VIEW-CHANGE (library default 10 s)">view timeout <b data-o="vt"></b><input type="range" min="1" max="10" step="0.5" data-i="vt"></label>
        <label class="rj-check"><input type="checkbox" data-i="auto"> auto traffic</label>
        <label class="rj-check" title="Per-packet latency jitter ±90% instead of ±15%: votes routinely overtake the PRE-PREPARE they depend on"><input type="checkbox" data-i="shuffle"> shuffle delivery order</label>
        <span class="rj-spacer"></span>
        <button class="btn" data-a="chaos" title="Stop the current leader's ValidatorNode for 8 seconds">⚡ crash leader 8s</button>
        <button class="btn" data-a="copy">copy link</button>
      </div>
      <div class="rj-quorum" data-o="quorum"></div>
      <div class="rj-vals" data-o="vals"></div>
      <div class="panel rj-tl">
        <div class="rj-h">PBFT timeline <span class="rj-legend">
          <i class="k-pp"></i>pre-prepare <i class="k-p"></i>prepare <i class="k-c"></i>commit <i class="k-vc"></i>view-change <i class="k-nv"></i>state sync <i class="k-drop"></i>dropped
        </span><span class="rj-spacer"></span><button class="tb-btn" data-a="pause">pause</button></div>
        <div class="rj-svgwrap" data-o="svgwrap"></div>
      </div>
      <div class="grid-2">
        <div class="panel rj-compose">
          <div class="rj-h">Submit through <code>RaijinClient</code></div>
          <div class="rj-form">
            <label class="field">from<select data-i="from"></select></label>
            <label class="field">to<select data-i="to"></select></label>
            <label class="field">amount<input type="number" min="1" max="1000" value="25" data-i="amount"></label>
            <label class="field">fee <b data-o="fee"></b><input type="range" min="0" max="99" value="50" data-i="fee"></label>
          </div>
          <div class="rj-hint" data-o="hint"></div>
          <div class="rj-actions">
            <button class="btn primary" data-a="send">sign &amp; submit</button>
            <button class="btn" data-a="spam">spam 20 random txs</button>
          </div>
          <div class="rj-h rj-sub">receipts</div>
          <ol class="rj-receipts" data-o="receipts"></ol>
        </div>
        <div class="panel rj-mempool">
          <div class="rj-h">Mempool <span class="rj-dim" data-o="mpsrc"></span></div>
          <div class="rj-mplist" data-o="mempool"></div>
        </div>
      </div>
      <div class="grid-2">
        <div class="panel rj-blocks">
          <div class="rj-h">Blocks <span class="rj-dim">(canonical, posted to LocalDA)</span></div>
          <div class="rj-blist" data-o="blocks"></div>
        </div>
        <div class="panel rj-bal">
          <div class="rj-h">Per-validator state <span class="rj-badge" data-o="det"></span></div>
          <div data-o="balances"></div>
        </div>
      </div>
      <div class="panel rj-ct">
        <div class="rj-h">Cross-tab validators <span class="rj-dim">— real @johnhenry/raijin-validator nodes, one per browser tab, wired over a genuine BroadcastChannel via bus.ts's sendToTab()/onTabHandoff() (item 2.7)</span></div>
        <div class="rj-ct-setup">
          <label class="rj-check"><input type="checkbox" data-i="ct"> this tab is a validator</label>
          <label class="field">room <input type="text" maxlength="24" data-i="ctRoom"></label>
          <label class="field">validators <input type="number" min="2" max="7" data-i="ctN"></label>
          <span class="rj-dim">Opt-in, off by default. Open this same URL in another tab and check the box there too — with the default room and count, two default tabs find each other with zero setup. "copy link" above carries the room/count so you can paste it into a second tab.</span>
        </div>
        <div class="rj-ct-body" data-o="ctbody" hidden></div>
      </div>
      <div class="panel rj-da">
        <div class="rj-h">Data availability <span class="rj-dim">— LocalDA vs CelestiaDA vs EthBlobDA (@johnhenry/raijin-da)</span><span class="rj-spacer"></span><button class="tb-btn" data-a="da-run">post latest block to all three</button></div>
        <p class="rj-dim rj-da-note"><code>verify()</code> below only re-hashes the bytes a backend still happens to have and compares — it proves the backend has <em>these exact bytes right now</em>, not that the data is actually available to anyone else, was sampled, or survives past this call. That's a real limit of this abstraction, not a bug in the demo.</p>
        <div class="rj-da-grid" data-o="dagrid"><div class="rj-empty">waiting for a finalized block…</div></div>
      </div>
      <div class="grid-2">
        <div class="panel rj-explain">
          <div class="rj-h">What's happening</div>
          <p class="rj-now" data-o="narr"></p>
          <ul>
            <li><b>Rounds.</b> The leader for view <i>v</i> is <code>validators[v % n]</code>. Every ${'<span data-o="bt">0.8s</span>'} its <code>BlockProducer</code> takes the first ${MAX_TX_PER_BLOCK} of <code>mempool.pendingForProposer()</code> and calls <code>propose()</code>: PRE-PREPARE → everyone PREPAREs → at quorum <code>n − f</code> everyone COMMITs → at quorum each node runs <code>StateMachine.applyBlock()</code> itself.</li>
            <li><b>Real signatures.</b> Every vote is Ed25519-signed over <code>voteDigest({phase, chainId, epoch, view, sequence, digest})</code> and verified by <code>ed25519Verifier</code>; transactions are signed by SDK <code>Wallet</code>s.</li>
            <li><b>Unordered delivery.</b> Each packet gets its own latency, so a PREPARE or COMMIT often lands before the PRE-PREPARE it votes on (dashed arrows). The engine buffers those votes until the PRE-PREPARE arrives, and since raijin-consensus 0.0.4 it also holds back a PRE-PREPARE for the next round that overtakes this round's COMMITs. Since 0.0.5 it ignores a proposal that isn't <i>last finalized + 1</i> on its own tip as soon as it arrives, so a leader that fell behind can't get a stale block prepared and halt the chain (raijin#50). Tick <i>shuffle delivery order</i> to make overtaking constant.</li>
            <li><b>Faults.</b> Crash or partition up to <i>f</i> validators and rounds still finalize. Kill the leader and the others' view timers (<code>viewTimeout</code>, set above) expire, they broadcast VIEW-CHANGE, and at quorum the next index leads. With an empty mempool the same timer rotates leaders on its own.</li>
            <li><b>Recovery.</b> A restarted or healed node calls <code>importSyncState(await peer.exportSyncState())</code> (what <code>syncFrom(peer)</code> does): it takes the peer's state, re-verifies the signed VIEW-CHANGE quorum behind its view, replays the in-flight round's signed votes and drops every mempool tx the imported state already includes. Since 0.0.5 any peer is a safe source, even one mid-finalize (raijin#51). The engine never fetches missed blocks, so the planet re-syncs any node that stays behind or sits in an older view. One thing is still done by the room: it restarts the timers (<code>stop()</code>/<code>start()</code>) of a node with no progress for 2.5 view timeouts. After a partition heals, the validators can end up split across two views. The library's VIEW-CHANGE retry (raijin#48) only re-sends the same target view with a backoff of up to 60 s, and peers already in that view ignore it, so without the restart the mesh can stay halted.</li>
            <li><b>Fees.</b> <code>tx.data = [0x01 transfer, fee u64]</code>. The mempool keeps a nonce-ordered lane per sender and lets only each lane's head compete on fee, so outbidding your own pending tx is harmless: the later nonce waits its turn (purple ⤴ rows).</li>
          </ul>
        </div>
        <div class="panel rj-events">
          <div class="rj-h">Event log</div>
          <ol class="rj-log" data-o="log"></ol>
        </div>
      </div>
      <pre class="code rj-err" data-o="err" hidden></pre>
    `;

    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
    const out = (k: string) => $(`[data-o="${k}"]`);
    const inp = <T extends HTMLElement = HTMLInputElement>(k: string) => $<T>(`[data-i="${k}"]`);
    const errBox = out('err') as HTMLPreElement;
    const showErr = (e: unknown) => {
      errBox.hidden = false;
      errBox.textContent = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e);
    };

    /* ── controls ─────────────────────────────────────────────────────────── */
    const nIn = inp('n'); const latIn = inp('lat');
    const btIn = inp<HTMLSelectElement>('bt'); const vtIn = inp('vt'); const autoIn = inp('auto'); const shufIn = inp('shuffle');
    nIn.value = String(state.n); latIn.value = String(state.lat);
    btIn.value = String(state.bt); vtIn.value = String(state.vt); autoIn.checked = state.auto; shufIn.checked = state.shuffle;
    const ctIn = inp<HTMLInputElement>('ct'); const ctRoomIn = inp<HTMLInputElement>('ctRoom'); const ctNIn = inp<HTMLInputElement>('ctN');
    ctIn.checked = state.ct; ctRoomIn.value = state.ctRoom; ctNIn.value = String(state.ctN);
    const syncLabels = () => {
      out('n').textContent = String(state.n);
      out('lat').textContent = `${state.lat} ms`;
      out('bt').textContent = `${state.bt / 1000}s`;
      out('vt').innerHTML = `${state.vt} s${state.vt * 1000 < 2 * state.bt ? ' <span class="warn">≤ 2× block time: rounds may time out</span>' : ''}`;
    };
    syncLabels();
    const persist = () => writeState(state, defaults);
    const viewTimeoutMs = () => state.vt * 1000;

    /* ── event log ────────────────────────────────────────────────────────── */
    const logEl = out('log');
    let t0 = performance.now();
    const log = (html: string, kind = '') => {
      const li = document.createElement('li');
      if (kind) li.className = kind;
      li.innerHTML = `<span class="rj-t">${((performance.now() - t0) / 1000).toFixed(1)}s</span> ${html}`;
      logEl.prepend(li);
      while (logEl.children.length > 60) logEl.lastElementChild!.remove();
    };

    /* ── accounts (persist across mesh rebuilds) ─────────────────────────── */
    let wallets: Wallet[] = [];
    const nameOf = (pk: Uint8Array | null) => {
      if (!pk) return '∅';
      const i = wallets.findIndex((w) => equal(w.publicKey, pk));
      return i >= 0 ? ACCOUNTS[i] : short(toHex(pk), 6);
    };

    /* ── the mesh ─────────────────────────────────────────────────────────── */
    interface Mesh {
      vals: V[];
      timers: Set<number>;
      deliveries: Set<number>;
      early: number;
      staleIgnored: number;
      blocks: Map<string, BlockRec>;
      blockOrder: BlockRec[];
      blockSubs: Set<(b: Block) => void>;
      waiters: Map<string, { resolve: (r: TransactionReceipt) => void; reject: (e: Error) => void; timer: number }>;
      receiptHeight: Map<string, bigint>;
      da: LocalDA;
      client: RaijinClient;
      quorum: number;
      f: number;
      cfg: string;
      dead: boolean;
    }
    let mesh: Mesh | null = null;
    const meshCfg = () => `${state.n}/${state.bt}/${state.vt}`;
    let building = false;

    const reachable = (m: Mesh) => m.vals.filter((v) => v.status === 'up');

    function netView(m: Mesh): bigint {
      const r = reachable(m);
      if (!r.length) return 0n;
      const counts = new Map<string, number>();
      for (const v of r) {
        const k = v.node.consensus.currentView.toString();
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      let best = 0n; let bc = -1;
      for (const [k, c] of counts) {
        const kv = BigInt(k);
        if (c > bc || (c === bc && kv > best)) { best = kv; bc = c; }
      }
      return best;
    }
    const netHeight = (m: Mesh) => reachable(m).reduce((a, v) => (v.height > a ? v.height : a), 0n);
    const leaderIdx = (m: Mesh, view: bigint) => Number(view % BigInt(m.vals.length));

    /* timeline hooks (defined further down) */
    let tl: Timeline | null = null;

    function deliver(m: Mesh, from: V, to: V, msg: ConsensusMessage, pathId: number | null) {
      if (m.dead) return;
      const reach = to.status === 'up' && (from.status === 'up' || from.status === 'syncing');
      if (!reach) {
        if (pathId !== null) tl?.markDropped(pathId);
        return;
      }
      const wire = structuredClone(msg); // what a real wire would do: no shared objects
      if ((msg.type === 'pre-prepare' || msg.type === 'prepare' || msg.type === 'commit')) {
        const k = `${msg.view}:${msg.sequence}`;
        if (msg.type === 'pre-prepare') {
          to.seenPP.add(k);
          // 0.0.5 (raijin#50): #handlePrePrepare drops a proposal that is not this node's
          // lastFinalized + 1 on its tip, before anyone PREPAREs it. Counted here, from the outside,
          // for the #50 case only: a block number the receiver has already finalized. (One that is
          // ahead of the receiver is just an overtaking PRE-PREPARE, buffered since 0.0.4.)
          if (msg.block.header.number <= to.height) m.staleIgnored++;
        }
        else if (!to.seenPP.has(k)) {
          m.early++;
          if (pathId !== null) tl?.markEarly(pathId);
        }
        if (to.seenPP.size > 400) to.seenPP.clear();
      }
      to.inbox = to.inbox.then(async () => {
        if (m.dead || to.status !== 'up') return;
        for (const h of to.handlers) await h(from.pk, wire);
      }).catch((e: unknown) => onEngineError(m, to, e));
    }

    function makeTransport(m: Mesh, v: V): NetworkTransport {
      const sendOne = (to: V, msg: ConsensusMessage) => {
        if (m.dead) return;
        const t = performance.now();
        // No per-link ordering: every packet gets its own latency, so a PREPARE or COMMIT can
        // overtake the PRE-PREPARE it depends on. raijin-consensus buffers such early votes
        // (issue #44). "shuffle" widens the jitter to ±90% so overtaking happens constantly.
        const j = state.shuffle ? 0.9 : 0.15;
        const lat = Math.max(1, state.lat * (1 + (Math.random() * 2 - 1) * j));
        const senderOk = v.status === 'up';
        const receiverOk = to.status === 'up';
        const pathId = tl ? tl.addMsg(v.idx, to.idx, msg, t, t + Math.max(lat, 8), !(senderOk && receiverOk)) : null;
        if (!senderOk) return; // a partitioned/stopped sender's packets never leave
        const id = window.setTimeout(() => { m.deliveries.delete(id); deliver(m, v, to, msg, pathId); }, lat);
        m.deliveries.add(id);
      };
      return {
        broadcast(msg) {
          for (const to of m.vals) if (to !== v) sendOne(to, msg);
        },
        send(toPk, msg) {
          const to = m.vals.find((x) => equal(x.pk, toPk));
          if (to) sendOne(to, msg);
        },
        onMessage(h) { v.handlers.push(h as Handler); },
      };
    }

    async function buildMesh(n: number): Promise<Mesh> {
      if (!wallets.length) wallets = await Promise.all(ACCOUNTS.map(() => Wallet.generate()));
      const valWallets = await Promise.all(Array.from({ length: n }, () => Wallet.generate()));
      const keys = valWallets.map((w) => w.publicKey);
      const set = new ValidatorSet(keys);
      const timers = new Set<number>();
      const timer: ConsensusTimer = {
        set(ms, cb) {
          const id = window.setTimeout(() => { timers.delete(id); cb(); }, ms);
          timers.add(id);
          return id;
        },
        clear(h) { window.clearTimeout(h as number); timers.delete(h as number); },
      };
      const m: Mesh = {
        vals: [], timers, deliveries: new Set(), early: 0, staleIgnored: 0, blocks: new Map(), blockOrder: [],
        blockSubs: new Set(), waiters: new Map(), receiptHeight: new Map(), da: new LocalDA(),
        client: null as unknown as RaijinClient, quorum: set.quorumSize(), f: set.maxFaults, dead: false, cfg: meshCfg(),
      };
      for (let i = 0; i < n; i++) {
        const w = valWallets[i];
        const store = new InMemoryStateStore();
        for (const acct of wallets) {
          await store.put(accountKey(acct.publicKey), encodeAccount({ balance: GENESIS, nonce: 0n, reputation: 0n }));
        }
        const v = {
          idx: i, wallet: w, pk: w.publicKey, hex: toHex(w.publicKey), store,
          node: null as unknown as ValidatorNode, handlers: [], status: 'up' as Status, inbox: Promise.resolve(),
          height: 0n, roots: new Map(), syncs: 0, lagChecks: 0, behindSince: null, mismatches: 0, lastProgress: performance.now(), rearms: 0, busy: false, seenPP: new Set<string>(),
        } satisfies V;
        m.vals.push(v);
      }
      for (const v of m.vals) {
        v.node = new ValidatorNode({
          chainId: CHAIN_ID,
          identity: { publicKey: v.pk, sign: (msg) => v.wallet.sign(msg), verify: ed25519Verifier },
          transport: makeTransport(m, v),
          timer,
          store: v.store,
          blockTime: state.bt,
          viewTimeout: viewTimeoutMs(), // ValidatorNodeConfig.viewTimeout (0.0.3, raijin#45)
          validators: keys,
          maxTxPerBlock: MAX_TX_PER_BLOCK,
        });
        v.node.onBlockFinalized((block, receipts) => onFinalized(m, v, block, receipts));
        v.node.consensus.onViewChange((view) => onViewChange(m, v, view));
      }
      m.client = new RaijinClient(makeClientTransport(m));
      m.client.subscribe((b) => onCanonical(m, b));
      return m;
    }

    function onFinalized(m: Mesh, v: V, block: Block, receipts: TransactionReceipt[]) {
      if (m.dead) return;
      const h = block.header.number;
      const rootHex = toHex(block.header.stateRoot);
      // No gap check: since raijin-consensus 0.0.4 (raijin#47) a PRE-PREPARE for s+1 that overtakes
      // the COMMITs for s is buffered until round s finalizes, and since 0.0.5 (raijin#50) a proposal
      // that is not lastFinalized + 1 on the right parent is dropped before anyone PREPAREs it.
      v.height = h;
      v.lastProgress = performance.now();
      v.roots.set(h.toString(), rootHex);
      tl?.addFinal(v.idx, h, performance.now());
      // resolve SDK waiters (first node to finalize wins)
      void (async () => {
        for (let i = 0; i < block.transactions.length; i++) {
          const r = receipts[i];
          if (!r) continue;
          const id = toHex(r.txHash);
          const w = m.waiters.get(id);
          if (w) { m.waiters.delete(id); clearTimeout(w.timer); m.receiptHeight.set(id, h); w.resolve(r); }
        }
      })();
      const key = h.toString();
      if (!m.blocks.has(key)) {
        const ok = receipts.filter((r) => r.status === 'success').length;
        const rec: BlockRec = {
          h, block, ok, rev: receipts.length - ok,
          proposer: m.vals.findIndex((x) => equal(x.pk, block.header.proposer)),
          root: rootHex,
        };
        m.blocks.set(key, rec);
        m.blockOrder.unshift(rec);
        if (m.blockOrder.length > 60) m.blockOrder.pop();
        for (const s of m.blockSubs) s(block);
      }
      scheduleRefresh();
    }

    /** Errors thrown out of the engine's message handlers (the transport inbox catches them). */
    function onEngineError(m: Mesh, v: V, e: unknown) {
      if (m.dead) return;
      // Since 0.0.5 a stale proposal is dropped at PRE-PREPARE time, so the apply-time
      // "refusing to apply" error no longer occurs in practice; anything thrown is just shown.
      // A node left behind for any reason is re-synced by the watchdog's height check.
      log(`<b>#${v.idx}</b> engine error: ${esc(e instanceof Error ? e.message : String(e))}`, 'ev-bad');
    }

    function onViewChange(m: Mesh, v: V, view: bigint) {
      if (m.dead) return;
      v.lastProgress = performance.now();
      tl?.addView(v.idx, view, performance.now());
      const nv = netView(m);
      if (view === nv && !announcedViews.has(view)) {
        announcedViews.add(view);
        const li = leaderIdx(m, view);
        log(`view → <b>${view}</b>: quorum of VIEW-CHANGE votes; leader is now <b>#${li}</b>`, 'ev-view');
      }
    }
    const announcedViews = new Set<bigint>();

    function makeClientTransport(m: Mesh): ClientTransport {
      const best = () => {
        const r = reachable(m);
        return r.sort((a, b) => (b.height > a.height ? 1 : b.height < a.height ? -1 : 0))[0] ?? m.vals[0];
      };
      return {
        async submitTransaction(tx) {
          const id = toHex(await hash(encodeTxSigned(tx)));
          const targets = reachable(m);
          if (!targets.length) throw new Error('no reachable validator');
          const receipt = new Promise<TransactionReceipt>((resolve, reject) => {
            const timer = window.setTimeout(() => { m.waiters.delete(id); reject(new Error('not included within 30s')); }, 30000);
            m.waiters.set(id, { resolve, reject, timer });
          });
          // no mempool gossip is wired inside ValidatorNode, so the client fans out
          const res = await Promise.allSettled(targets.map((v) => v.node.submitTransaction(tx)));
          if (!res.some((r) => r.status === 'fulfilled')) {
            const w = m.waiters.get(id);
            if (w) { clearTimeout(w.timer); m.waiters.delete(id); }
            const first = res.find((r) => r.status === 'rejected') as PromiseRejectedResult;
            throw first.reason instanceof Error ? first.reason : new Error(String(first.reason));
          }
          return receipt;
        },
        getAccount: (addr) => best().node.stateMachine.getAccount(addr),
        async getBlock(num) { return m.blocks.get(num.toString())?.block ?? null; },
        onBlock(h) { m.blockSubs.add(h); return () => { m.blockSubs.delete(h); }; },
      };
    }

    async function onCanonical(m: Mesh, block: Block) {
      const rec = m.blocks.get(block.header.number.toString());
      if (!rec) return;
      try {
        const bytes = new TextEncoder().encode(serializeBlock(block));
        const payload = await encode(bytes);
        const c = await m.da.submit(payload);
        m.da.nextBlock();
        const verified = await m.da.verify(c);
        const back = JSON.parse(new TextDecoder().decode(await decode(await m.da.retrieve(c))));
        rec.da = {
          hash: toHex(c.hash), bytes: payload.length, magic: String.fromCharCode(payload[0], payload[1], payload[2]),
          verified, roundTrip: Array.isArray(back.transactions) && back.transactions.length === block.transactions.length,
        };
      } catch (e) {
        rec.da = { hash: 'error', bytes: 0, magic: '—', verified: false, roundTrip: false };
        showErr(e);
      }
      scheduleRefresh();
    }

    /* ── faults and recovery ──────────────────────────────────────────────── */
    /*
     * Sync source: the reachable peer with the highest block, then the highest view. Any phase is
     * fine since 0.0.5 (raijin#51): exportSyncState() now waits until the whole apply-and-finalize
     * step is done, so the store always hashes to latestBlock's stateRoot, even mid-'committed'.
     * Preferring the higher view matters after a partition heals with the views split: syncing from
     * a peer in the same stale view would just copy that view back.
     */
    function pickSource(m: Mesh, except: V): V | null {
      const r = reachable(m).filter((x) => x !== except && !x.busy);
      if (!r.length) return null;
      const key = (x: V) => [x.height, x.node.consensus.currentView] as const;
      return r.sort((a, b) => {
        const [ha, va] = key(a), [hb, vb] = key(b);
        return hb !== ha ? (hb > ha ? 1 : -1) : vb > va ? 1 : vb < va ? -1 : 0;
      })[0];
    }

    /**
     * Catch-up through the library: `await peer.exportSyncState()` → `node.importSyncState()`,
     * which is exactly what `node.syncFrom(peer)` does; it is split here only so the log can show
     * what crossed the "wire" (the snapshot is structured-cloned like a real wire would). The node
     * re-verifies the VIEW-CHANGE quorum that justifies the peer's view, replays the in-flight
     * round's signed votes, and (0.0.5, raijin#51) prunes every mempool tx the imported state
     * already includes.
     */
    async function catchUp(m: Mesh, v: V, reason: string) {
      if (v.busy) return;
      v.busy = true;
      try {
        let src = pickSource(m, v);
        for (let i = 0; i < 100 && !src && reachable(m).some((x) => x !== v); i++) {
          await sleep(15); // every other reachable peer is itself mid-sync
          src = pickSource(m, v);
        }
        if (m.dead) return;
        if (!v.node.running) v.node.start(); // importSyncState needs a running engine
        v.status = 'up';
        v.lastProgress = performance.now();
        v.lagChecks = 0;
        v.behindSince = null;
        if (!src) { log(`<b>#${v.idx}</b> ${reason}: no healthy peer to sync from`, 'ev-sync'); return; }
        const viewBefore = v.node.consensus.currentView;
        const mpBefore = v.node.mempool.size;
        const snap = structuredClone(await src.node.exportSyncState());
        if (m.dead) return;
        const t = performance.now();
        tl?.addSync(src.idx, v.idx, t);
        await v.node.importSyncState(snap);
        if (m.dead) return;
        const h = snap.latestBlock?.header.number ?? 0n;
        for (const [k, r] of src.roots) if (BigInt(k) <= h && v.roots.get(k) !== r) v.roots.set(k, 'sync');
        v.height = h;
        v.syncs++;
        const parts = [`<code>importSyncState(#${src.idx}.exportSyncState())</code>: ${snap.storeData.size} state keys @ height ${h}`];
        const viewNow = v.node.consensus.currentView;
        if (viewNow !== viewBefore) parts.push(`view ${viewBefore} → ${viewNow}, justified by ${snap.consensus.viewChangeJustification.length} re-verified VIEW-CHANGE signatures`);
        if (snap.consensus.prePrepare) parts.push(`joined in-flight round s${snap.consensus.sequence} (${snap.consensus.prepares.length} prepares, ${snap.consensus.commits.length} commits replayed)`);
        const pruned = mpBefore - v.node.mempool.size;
        if (pruned > 0) parts.push(`mempool ${mpBefore} → ${v.node.mempool.size} (already-included txs pruned by <code>importSyncState</code>)`);
        log(`<b>#${v.idx}</b> ${reason}: ${parts.join(' · ')}`, 'ev-sync');
      } catch (e) {
        log(`<b>#${v.idx}</b> ${reason}: sync refused: ${esc(e instanceof Error ? e.message : String(e))}`, 'ev-bad');
      } finally {
        v.busy = false;
        scheduleRefresh();
      }
    }

    function kill(m: Mesh, v: V) {
      if (v.status === 'down') return;
      v.node.stop();
      v.status = 'down';
      tl?.setStatus(v.idx, 'down', performance.now());
      log(`<b>#${v.idx}</b> crashed (<code>node.stop()</code>)${leaderIdx(m, netView(m)) === v.idx ? ' — it was the leader' : ''}`, 'ev-bad');
      renderVals();
    }
    function partition(m: Mesh, v: V) {
      if (v.status !== 'up') return;
      v.status = 'partitioned';
      tl?.setStatus(v.idx, 'partitioned', performance.now());
      log(`<b>#${v.idx}</b> partitioned: still running, but every packet in or out is dropped`, 'ev-bad');
      renderVals();
    }
    async function restore(m: Mesh, v: V) {
      if (v.status === 'up' || v.status === 'syncing') return;
      const was = v.status;
      v.status = 'syncing';
      tl?.setStatus(v.idx, 'up', performance.now());
      renderVals();
      await catchUp(m, v, was === 'down' ? 'restarted' : 'partition healed');
      renderVals();
    }

    /*
     * Watchdog. What 0.0.5 still leaves to the embedder, handled through public API:
     *  1. Catch-up. The engine has no block fetch: a node that misses a round (crashed or cut off)
     *     stays at its height. One that trails the reachable network for longer than a few rounds,
     *     or sits in an older view, is re-synced with exportSyncState/importSyncState. Root
     *     disagreements are only counted: none occur since 0.0.4 (raijin#47).
     *  2. Re-arm. 0.0.4 closed raijin#48 with a VIEW-CHANGE retry, but it backs off (2x, 4x ... the
     *     view timeout, up to 60 s) and only re-sends the same target view. After a partition heals
     *     the mesh can split across two views (the 3 healed nodes in view 1, the other 4 still in
     *     view 0, say): each side's VIEW-CHANGE targets a view the other side is already in or can't
     *     reach alone, so no quorum forms. Node soak, 0.0.5, n=7, 3 of 7 partitioned for 12 s:
     *     without this re-arm (with or without the catch-up above) 6 of 11 runs never recovered
     *     (up to 180 s after the heal) and 5 took 17 to 22 s; with it 4 of 4 recovered in 6 to 8 s.
     *     A node with no progress for 2.5 view timeouts restarts its timers with node.stop();
     *     node.start(), which also resets that backoff.
     */
    function watchdog() {
      const m = mesh;
      if (!m || m.dead) return;
      const nv = netView(m);
      const nh = netHeight(m);
      const now = performance.now();
      const up = reachable(m);
      const live = up.length >= m.quorum;
      const behindLimit = Math.max(3000, 3 * state.bt + 8 * state.lat);
      for (const v of up) {
        if (v.busy) continue;
        const mine = v.roots.get(v.height.toString());
        const maj = majorityRoot(m, v.height);
        if (mine && mine !== 'sync' && maj && mine !== maj && !v.roots.has(`!${v.height}`)) {
          v.roots.set(`!${v.height}`, mine);
          v.mismatches++;
          log(`<b>#${v.idx}</b> has a different state root at height ${v.height} than the majority`, 'ev-bad');
        }
        if (v.height < nh) v.behindSince ??= now; else v.behindSince = null;
        if (v.node.consensus.currentView < nv) v.lagChecks++; else v.lagChecks = 0;
        const behind = v.behindSince !== null && now - v.behindSince > behindLimit;
        if (behind || v.lagChecks >= 3) {
          void catchUp(m, v, behind ? `${nh - v.height} block${nh - v.height > 1n ? 's' : ''} behind for ${((now - v.behindSince!) / 1000).toFixed(1)}s` : `stuck in view ${v.node.consensus.currentView} < ${nv}`);
          continue;
        }
        if (live && now - v.lastProgress > 2.5 * viewTimeoutMs()) {
          v.node.stop(); v.node.start();
          v.lastProgress = now;
          v.rearms++;
          log(`<b>#${v.idx}</b> no progress for ${(2.5 * viewTimeoutMs() / 1000).toFixed(1)}s: restarted its timers (<code>stop()</code>/<code>start()</code>) instead of waiting out the VIEW-CHANGE backoff`, 'ev-sync');
        }
      }
    }
    function majorityRoot(m: Mesh, h: bigint): string | null {
      const c = new Map<string, number>();
      for (const v of m.vals) {
        const r = v.roots.get(h.toString());
        if (r && r !== 'sync') c.set(r, (c.get(r) ?? 0) + 1);
      }
      let best: string | null = null; let bc = 0;
      for (const [r, k] of c) if (k > bc) { best = r; bc = k; }
      return best;
    }

    /* ── wallet-side nonce management ────────────────────────────────────── */
    // Fees are free per transaction: raijin-mempool 0.0.2 orders each sender's txs by
    // nonce and lets only lane heads compete on fee, so no fee discipline is needed here.
    const inflight = new Map<number, Map<bigint, bigint>>(); // acct → nonce → fee
    const pendingOf = (a: number) => { if (!inflight.has(a)) inflight.set(a, new Map()); return inflight.get(a)!; };
    async function nextNonce(m: Mesh, a: number): Promise<bigint> {
      const p = pendingOf(a);
      if (p.size) return [...p.keys()].reduce((x, y) => (y > x ? y : x)) + 1n;
      const acct: Account = await m.client.getAccount(wallets[a].publicKey);
      return acct.nonce;
    }

    const receiptsEl = out('receipts');
    function receiptLine(html: string, cls: string) {
      const li = document.createElement('li');
      li.className = cls;
      li.innerHTML = html;
      receiptsEl.prepend(li);
      while (receiptsEl.children.length > 10) receiptsEl.lastElementChild!.remove();
    }

    const reserveChain = new Map<number, Promise<unknown>>();
    /** Nonce reservation is serialized per sender so concurrent submits never collide. */
    function reserve(m: Mesh, a: number, fee: bigint): Promise<bigint> {
      const prev = reserveChain.get(a) ?? Promise.resolve();
      const p = prev.then(async () => {
        const n = await nextNonce(m, a);
        pendingOf(a).set(n, fee);
        return n;
      });
      reserveChain.set(a, p.catch(() => {}));
      return p;
    }

    async function submit(from: number, to: number, amount: bigint, fee: bigint, quiet = false) {
      const m = mesh;
      if (!m || m.dead) return;
      let nonce: bigint;
      try { nonce = await reserve(m, from, fee); } catch (e) { showErr(e); return; }
      const label = `${ACCOUNTS[from]} → ${ACCOUNTS[to]} <b>${amount}</b> <span class="rj-dim">fee ${fee} · nonce ${nonce}</span>`;
      try {
        const tx = await wallets[from].buildTx({ to: wallets[to].publicKey, value: amount, nonce, data: feeBytes(fee), chainId: CHAIN_ID });
        const r = await m.client.submitTransaction(tx);
        if (m.dead) return;
        const h = m.receiptHeight.get(toHex(r.txHash));
        if (r.status === 'success') receiptLine(`✓ ${label} <span class="rj-dim">→ block ${h ?? '?'} [${r.index}]</span>`, 'ok');
        else receiptLine(`✗ ${label} <span class="rj-rev">${esc(r.revertReason ?? 'revert')}</span>`, 'bad');
        if (r.status !== 'success' && !quiet) log(`receipt revert: ${esc(r.revertReason ?? '')}`, 'ev-bad');
      } catch (e) {
        if (!m.dead) receiptLine(`⚠ ${label} <span class="rj-rev">${esc(e instanceof Error ? e.message : String(e))}</span>`, 'bad');
      } finally {
        if (!m.dead) pendingOf(from).delete(nonce);
      }
    }

    function randInt(a: number, b: number) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function spam(count: number, quiet = false) {
      const m = mesh;
      if (!m) return;
      const plan: { from: number; to: number; amount: bigint; fee: bigint }[] = [];
      for (let i = 0; i < count; i++) {
        const from = randInt(0, ACCOUNTS.length - 1);
        let to = randInt(0, ACCOUNTS.length - 2); if (to >= from) to++;
        plan.push({ from, to, amount: BigInt(randInt(1, 40)), fee: BigInt(randInt(1, 99)) });
      }
      for (const p of plan) void submit(p.from, p.to, p.amount, p.fee, quiet);
    }

    /* ── UI: composer ────────────────────────────────────────────────────── */
    const fromSel = inp<HTMLSelectElement>('from');
    const toSel = inp<HTMLSelectElement>('to');
    fromSel.innerHTML = ACCOUNTS.map((a, i) => `<option value="${i}">${a}</option>`).join('');
    toSel.innerHTML = ACCOUNTS.map((a, i) => `<option value="${i}">${a}</option>`).join('');
    toSel.value = '1';
    const feeIn = inp('fee'); const amtIn = inp('amount');
    const updateHint = () => {
      out('fee').textContent = feeIn.value;
      const a = Number(fromSel.value);
      const p = pendingOf(a);
      const hint = out('hint');
      const lower = [...p.values()].filter((f) => f < BigInt(feeIn.value));
      if (fromSel.value === toSel.value) hint.innerHTML = '<span class="warn">from and to are the same account</span>';
      else if (lower.length) hint.innerHTML = `<span class="rj-dim">${ACCOUNTS[a]} has ${p.size} pending tx${p.size > 1 ? 's' : ''}, ${lower.length} at a lower fee. This one gets the next nonce and waits in ${ACCOUNTS[a]}'s lane behind them: the mempool lets only each sender's lowest pending nonce compete on fee.</span>`;
      else hint.innerHTML = `<span class="rj-dim">signed by ${ACCOUNTS[a]}'s Ed25519 <code>Wallet</code>, sent to every reachable validator's mempool</span>`;
    };
    updateHint();

    /* ── UI: validator cards ─────────────────────────────────────────────── */
    const valsEl = out('vals');
    function buildVals() {
      const m = mesh;
      valsEl.innerHTML = '';
      if (!m) return;
      for (const v of m.vals) {
        const c = document.createElement('div');
        c.className = 'rj-val';
        c.dataset.idx = String(v.idx);
        c.innerHTML = `
          <div class="rj-vh"><b>#${v.idx}</b><span class="rj-key">${short(v.hex, 10)}</span><span class="rj-pill" data-f="st"></span></div>
          <div class="rj-vs"><span data-f="role"></span></div>
          <div class="rj-vs">view <b data-f="view"></b> · seq <b data-f="seq"></b> · <span data-f="phase"></span></div>
          <div class="rj-vs">height <b data-f="h"></b> · mempool <b data-f="mp"></b></div>
          <div class="rj-vs">root <span class="rj-root" data-f="root"></span></div>
          <div class="rj-vb"><button class="tb-btn" data-v="kill"></button><button class="tb-btn" data-v="part"></button></div>`;
        valsEl.appendChild(c);
      }
    }
    const rootCache = new Map<number, string>();
    function renderVals() {
      const m = mesh;
      if (!m) return;
      const nv = netView(m);
      const L = leaderIdx(m, nv);
      const n0 = m.vals.length, w0 = valsEl.clientWidth;
      const cols = w0 / n0 >= 160 ? n0 : w0 / Math.ceil(n0 / 2) >= 140 ? Math.ceil(n0 / 2) : 0;
      const gtc = cols ? `repeat(${cols}, minmax(0, 1fr))` : '';
      if (valsEl.style.gridTemplateColumns !== gtc) valsEl.style.gridTemplateColumns = gtc;
      for (const v of m.vals) {
        const c = valsEl.querySelector<HTMLElement>(`.rj-val[data-idx="${v.idx}"]`);
        if (!c) continue;
        const f = (k: string) => c.querySelector<HTMLElement>(`[data-f="${k}"]`)!;
        c.dataset.status = v.status;
        c.classList.toggle('leader', v.idx === L && v.status === 'up');
        f('st').textContent = v.status;
        const cv = v.node.consensus.currentView;
        f('role').innerHTML = v.status === 'down' ? '<span class="rj-dim">stopped · state frozen</span>' : v.status === 'partitioned' ? '<span class="rj-dim">running, cut off</span>' : v.idx === L ? '<span class="rj-lead">▲ leader</span>' : leaderIdx(m, cv) === v.idx && cv !== nv ? '<span class="rj-dim">thinks it leads (stale view)</span>' : '<span class="rj-dim">replica</span>';
        f('view').textContent = String(cv);
        f('seq').textContent = String(v.node.consensus.currentSequence);
        f('phase').textContent = v.node.consensus.phase;
        f('h').textContent = String(v.height);
        f('mp').textContent = String(v.node.mempool.size);
        const r = rootCache.get(v.idx);
        f('root').innerHTML = r ? `<i style="--rh:${rootHue(r)}"></i>${short(r, 10)}` : '—';
        const kb = c.querySelector<HTMLButtonElement>('[data-v="kill"]')!;
        const pb = c.querySelector<HTMLButtonElement>('[data-v="part"]')!;
        kb.textContent = v.status === 'down' ? 'restart' : 'kill';
        pb.textContent = v.status === 'partitioned' ? 'heal' : 'partition';
        kb.disabled = v.status === 'partitioned' || v.status === 'syncing';
        pb.disabled = v.status === 'down' || v.status === 'syncing';
      }
      // quorum bar
      const up = reachable(m).length;
      const n = m.vals.length;
      const q = out('quorum');
      const halted = up < m.quorum;
      const sum = (f: (v: V) => number) => m.vals.reduce((a, v) => a + f(v), 0);
      q.className = `rj-quorum${halted ? ' halted' : ''}`;
      q.innerHTML = `
        <span class="stat">n <b>${n}</b></span><span class="stat">f <b>${m.f}</b></span>
        <span class="stat">quorum n−f <b>${m.quorum}</b></span>
        <span class="stat">reachable <b>${up}/${n}</b></span>
        <span class="stat">view <b>${nv}</b></span><span class="stat">leader <b>#${L}</b></span>
        <span class="stat">height <b>${netHeight(m)}</b></span>
        <span class="stat" title="PREPARE/COMMIT votes delivered before the receiver had the PRE-PREPARE they refer to. The engine buffers them and replays them when it arrives (since raijin-consensus 0.0.3).">early votes buffered <b>${m.early}</b></span>
        <span class="stat" title="Heights at which some validator's state root differed from the majority. Detected, never repaired. It stays at 0 since 0.0.4 buffers a PRE-PREPARE that overtakes the previous round's COMMITs.">root mismatches <b>${sum((v) => v.mismatches)}</b></span>
        <span class="stat" title="PRE-PREPAREs delivered to a validator for a block number it has already finalized: the leader fell behind (restarted, or missed a round). Since raijin-consensus 0.0.5 (raijin#50) the engine drops these before anyone PREPAREs them; in 0.0.4 everyone committed such a block, refused to apply it, and re-proposed it after every view change, halting the chain for good.">stale proposals ignored <b>${m.staleIgnored}</b></span>
        <span class="stat" title="exportSyncState/importSyncState catch-ups of nodes that fell behind (the engine has no block fetch). Since 0.0.5 (raijin#51) any peer, in any phase, hands out a consistent snapshot and the import prunes the mempool itself.">syncs <b>${sum((v) => v.syncs)}</b></span>
        <span class="stat" title="stop()/start() timer restarts for nodes with no progress for 2.5 view timeouts. Still room-side with 0.0.5: after a partition heals the validators can sit in different views, and the library's VIEW-CHANGE retry (raijin#48, backoff up to 60 s) only re-sends the same target view, which peers already past it ignore.">re-arms <b>${sum((v) => v.rearms)}</b></span>
        <span class="rj-qdots">${m.vals.map((v) => `<i class="${v.status}"></i>`).join('')}</span>
        <span class="rj-qmsg">${halted
          ? `HALTED — ${up} reachable &lt; quorum ${m.quorum}. No block can finalize and no view change can complete: PBFT gives up liveness to keep safety. Bring a validator back.`
          : up < n ? `tolerating ${n - up} fault${n - up > 1 ? 's' : ''} (max f = ${m.f}${n - up > m.f ? ' — beyond f, but a quorum of ' + m.quorum + ' is still reachable' : ''})` : 'all validators healthy'}</span>`;
    }

    /* ── UI: mempool ─────────────────────────────────────────────────────── */
    function renderMempool() {
      const m = mesh;
      const el = out('mempool');
      if (!m) { el.innerHTML = ''; return; }
      const nv = netView(m);
      const L = m.vals[leaderIdx(m, nv)];
      const ref = L.status === 'up' ? L : reachable(m)[0];
      if (!ref) { out('mpsrc').textContent = '(no reachable validator)'; el.innerHTML = ''; return; }
      const list = ref.node.mempool.pending();
      out('mpsrc').textContent = `as seen by #${ref.idx}${ref === L ? ' (leader)' : ''} · ${list.length} pending · pending(): per-sender nonce lanes, heads ranked by fee`;
      if (!list.length) { el.innerHTML = '<div class="rj-empty">empty — the leader has nothing to propose, so idle view timers will rotate the leader</div>'; return; }
      const rows: string[] = [];
      const heads = new Map<string, bigint>(); // sender → fee of its lowest pending nonce
      list.slice(0, 30).forEach((tx, i) => {
        if (i === MAX_TX_PER_BLOCK) rows.push(`<div class="rj-cut">▲ next block takes these ${MAX_TX_PER_BLOCK} (maxTxPerBlock) · rest wait</div>`);
        const fee = defaultFeeExtractor(tx);
        const who = toHex(tx.from);
        const head = heads.get(who);
        if (head === undefined) heads.set(who, fee);
        // a higher bid than its own sender's head: it only gets here because nonce order wins
        const held = head !== undefined && fee > head;
        rows.push(`<div class="rj-mp${i < MAX_TX_PER_BLOCK ? ' next' : ''}${held ? ' held' : ''}"${held ? ` title="fee ${fee} outbids ${nameOf(tx.from)}'s earlier tx (fee ${head}), but nonce ${tx.nonce} can't run before it: it waits in the sender's lane"` : ''}><span class="rj-fee"><i style="width:${Number(fee)}%"></i><b>${fee}</b></span><span>${nameOf(tx.from)} → ${nameOf(tx.to)}</span><span class="rj-amt">${tx.value}</span><span class="rj-dim">n${tx.nonce}${held ? ' ⤴' : ''}</span></div>`);
      });
      if (list.length > 30) rows.push(`<div class="rj-empty">+${list.length - 30} more</div>`);
      el.innerHTML = rows.join('');
    }

    /* ── UI: blocks ──────────────────────────────────────────────────────── */
    function renderBlocks() {
      const m = mesh;
      const el = out('blocks');
      if (!m) { el.innerHTML = ''; return; }
      if (!m.blockOrder.length) { el.innerHTML = '<div class="rj-empty">waiting for the first finalized block…</div>'; return; }
      el.innerHTML = m.blockOrder.slice(0, 24).map((b) => {
        const dots = m.vals.map((v) => {
          const r = v.roots.get(b.h.toString());
          const cls = !r ? 'miss' : r === 'sync' ? 'sync' : r === b.root ? 'ok' : 'bad';
          return `<i class="${cls}" title="#${v.idx}: ${!r ? 'did not execute' : r === 'sync' ? 'state imported by sync' : r === b.root ? 'same root' : 'DIFFERENT root ' + short(r)}"></i>`;
        }).join('');
        const da = b.da
          ? `<span class="rj-blkda" title="LocalDA.submit(encode(block)) → commitment; verify() re-hashes what the layer serves; decode() round-trips the block">DA commitment ${short(b.da.hash, 12)} · ${b.da.magic === 'RJC' ? 'RJC deflate' : 'RJR raw'} ${b.da.bytes} B · verify ${b.da.verified ? '✓' : '✗'} · decode ${b.da.roundTrip ? '✓' : '✗'}</span>`
          : '<span class="rj-blkda rj-dim">posting to DA…</span>';
        return `<div class="rj-blk">
          <span class="rj-bh">#${b.h}</span>
          <span>${b.block.transactions.length} tx <span class="rj-dim">(${b.ok}✓${b.rev ? ` <span class="rj-rev">${b.rev}✗</span>` : ''})</span></span>
          <span class="rj-dim">by #${b.proposer}</span>
          <span class="rj-root"><i style="--rh:${rootHue(b.root)}"></i>${short(b.root, 10)}</span>
          <span class="rj-dots" title="per-validator state root at this height">${dots}</span>
          ${da}
        </div>`;
      }).join('');
    }

    /* ── UI: balances (determinism) ──────────────────────────────────────── */
    let refreshQueued = false;
    let refreshing = false;
    function scheduleRefresh() {
      if (refreshQueued) return;
      refreshQueued = true;
      window.setTimeout(() => { refreshQueued = false; void refreshBalances(); }, 120);
    }
    async function refreshBalances() {
      const m = mesh;
      if (!m || m.dead || refreshing || !wallets.length) return;
      refreshing = true;
      try {
        const grid: bigint[][] = [];
        const roots: string[] = [];
        for (const v of m.vals) {
          const col: bigint[] = [];
          for (const w of wallets) col.push((await v.node.stateMachine.getAccount(w.publicKey)).balance);
          grid.push(col);
          const r = toHex(await v.node.stateMachine.stateRoot());
          roots.push(r);
          rootCache.set(v.idx, r);
        }
        if (m.dead) return;
        const nh = netHeight(m);
        const upToDate = m.vals.filter((v) => v.status === 'up' && v.height === nh);
        const refRoot = upToDate.length ? roots[upToDate[0].idx] : roots[0];
        const allSame = upToDate.every((v) => roots[v.idx] === refRoot);
        const total = grid[0]?.reduce((a, b) => a + b, 0n) ?? 0n;
        const head = `<tr><th></th>${m.vals.map((v) => `<th class="st-${v.status}">#${v.idx}</th>`).join('')}</tr>`;
        const body = ACCOUNTS.map((a, i) => `<tr><td>${a}</td>${m.vals.map((v) => {
          const bal = grid[v.idx][i];
          const cur = v.height === nh && v.status === 'up';
          const refBal = upToDate.length ? grid[upToDate[0].idx][i] : bal;
          const cls = !cur ? 'lag' : bal !== refBal ? 'bad' : '';
          return `<td class="${cls}">${bal}</td>`;
        }).join('')}</tr>`).join('');
        const hrow = `<tr class="rj-meta"><td>height</td>${m.vals.map((v) => `<td class="${v.height === nh ? '' : 'lag'}">${v.height}</td>`).join('')}</tr>`;
        const rrow = `<tr class="rj-meta"><td>root</td>${m.vals.map((v) => `<td class="rj-root"><i style="--rh:${rootHue(roots[v.idx])}"></i>${short(roots[v.idx], 6)}</td>`).join('')}</tr>`;
        out('balances').innerHTML = `<table class="rj-table">${head}${body}${hrow}${rrow}</table>
          <p class="rj-dim rj-foot">Each column is read from that validator's own <code>stateMachine.getAccount()</code> and <code>stateRoot()</code>. Supply is conserved: ${total} = ${ACCOUNTS.length} × ${GENESIS}. Amber = behind the tip (down, partitioned or mid-round).</p>`;
        const det = out('det');
        det.className = `rj-badge ${allSame ? 'ok' : 'bad'}`;
        det.textContent = allSame ? `✓ ${upToDate.length} up-to-date validators, identical roots` : '✗ roots differ';
      } catch (e) {
        showErr(e);
      } finally {
        refreshing = false;
      }
    }

    /* ── narrative ───────────────────────────────────────────────────────── */
    function renderNarr() {
      const m = mesh;
      if (!m) return;
      const up = reachable(m);
      const nv = netView(m);
      const L = m.vals[leaderIdx(m, nv)];
      const mp = up[0]?.node.mempool.size ?? 0;
      let s: string;
      if (up.length < m.quorum) s = `Only ${up.length} of ${m.vals.length} validators are reachable, fewer than the quorum of ${m.quorum}. Votes are still being sent (look at the timeline) but nothing can reach quorum, so the chain is frozen rather than risk two conflicting histories.`;
      else if (L.status !== 'up') s = `The leader for view ${nv}, #${L.idx}, is ${L.status}. The remaining validators will stop hearing PRE-PREPAREs, their view timers (${state.vt}s) will expire, and they'll broadcast VIEW-CHANGE for view ${nv + 1n}, handing the lead to #${leaderIdx(m, nv + 1n)}.`;
      else if (mp === 0) s = `#${L.idx} leads view ${nv} but its mempool is empty, so it proposes nothing. If that lasts ${state.vt}s, the view timers rotate the leader. Submit a transaction to start rounds.`;
      else s = `#${L.idx} leads view ${nv}: every ${state.bt / 1000}s it proposes the ${Math.min(mp, MAX_TX_PER_BLOCK)} highest-fee transactions. ${up.length} validators exchange PREPARE and COMMIT votes; each finalizes independently once ${m.quorum} matching signed votes arrive.`;
      out('narr').textContent = s;
    }

    /* ── timeline (SVG) ──────────────────────────────────────────────────── */
    const NS = 'http://www.w3.org/2000/svg';
    const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      return e;
    };
    const TYPE_CLASS: Record<string, string> = { 'pre-prepare': 'pp', prepare: 'p', commit: 'c', 'view-change': 'vc', 'new-view': 'nv' };

    class Timeline {
      svg: SVGSVGElement;
      lanes: SVGGElement;
      world: SVGGElement;
      nowLine: SVGLineElement;
      width = 800;
      laneH = 30;
      top = 8;
      x0 = 64;
      n: number;
      origin: number;
      paused = false;
      pausedAt = 0;
      items: { el: SVGElement; tEnd: number }[] = [];
      paths = new Map<number, { el: SVGPathElement; x0: number; y0: number; x1: number; y1: number }>();
      nextId = 1;
      open = new Map<number, { el: SVGRectElement; t: number; item: { el: SVGElement; tEnd: number } }>();
      frameNo = 0;
      labeled = new Set<string>();
      ticks = new Set<number>();
      ro: ResizeObserver;
      constructor(public wrap: HTMLElement, n: number) {
        this.n = n;
        this.origin = performance.now();
        this.svg = svgEl('svg', { class: 'rj-svg' });
        const defs = svgEl('defs');
        for (const k of ['pp', 'p', 'c', 'vc', 'nv', 'drop']) {
          const mk = svgEl('marker', { id: `rj-m-${k}`, viewBox: '0 0 6 6', refX: 5, refY: 3, markerWidth: 5, markerHeight: 5, orient: 'auto' });
          mk.appendChild(svgEl('path', { d: 'M0,0 L6,3 L0,6 z', class: `mk-${k}` }));
          defs.appendChild(mk);
        }
        const clip = svgEl('clipPath', { id: 'rj-clip' });
        clip.appendChild(svgEl('rect', { x: this.x0, y: 0, width: 5000, height: 1000, class: 'rj-cliprect' }));
        defs.appendChild(clip);
        this.svg.appendChild(defs);
        this.lanes = svgEl('g');
        this.svg.appendChild(this.lanes);
        const clipG = svgEl('g', { 'clip-path': 'url(#rj-clip)' });
        this.world = svgEl('g');
        clipG.appendChild(this.world);
        this.svg.appendChild(clipG);
        this.nowLine = svgEl('line', { class: 'rj-nowline' });
        this.svg.appendChild(this.nowLine);
        wrap.innerHTML = '';
        wrap.appendChild(this.svg);
        this.ro = new ResizeObserver(() => this.layout());
        this.ro.observe(wrap);
        this.layout();
      }
      get height() { return this.top + this.n * this.laneH + 22; }
      get nowX() { return this.x0 + (this.width - this.x0 - 8) * (HISTORY_MS / (HISTORY_MS + FUTURE_MS)); }
      get ppm() { return (this.nowX - this.x0) / HISTORY_MS; }
      laneY(i: number) { return this.top + i * this.laneH + this.laneH / 2; }
      wx(t: number) { return (t - this.origin) * this.ppm; }
      layout() {
        const w = Math.max(320, Math.floor(this.wrap.clientWidth));
        const changed = w !== this.width;
        this.width = w;
        this.svg.setAttribute('viewBox', `0 0 ${w} ${this.height}`);
        this.svg.setAttribute('height', String(this.height));
        this.lanes.innerHTML = '';
        for (let i = 0; i < this.n; i++) {
          const g = svgEl('g', { class: 'rj-lane', 'data-lane': i });
          g.appendChild(svgEl('rect', { x: 0, y: this.top + i * this.laneH, width: w, height: this.laneH, class: 'rj-lanebg' }));
          g.appendChild(svgEl('line', { x1: this.x0, x2: w, y1: this.laneY(i), y2: this.laneY(i), class: 'rj-laneline' }));
          const t = svgEl('text', { x: 8, y: this.laneY(i) + 4, class: 'rj-lanelabel' });
          t.textContent = `#${i}`;
          g.appendChild(t);
          const s = svgEl('text', { x: 30, y: this.laneY(i) + 4, class: 'rj-lanestat' });
          g.appendChild(s);
          this.lanes.appendChild(g);
        }
        this.nowLine.setAttribute('x1', String(this.nowX));
        this.nowLine.setAttribute('x2', String(this.nowX));
        this.nowLine.setAttribute('y1', String(this.top - 4));
        this.nowLine.setAttribute('y2', String(this.top + this.n * this.laneH + 4));
        if (changed) this.rescale();
      }
      /** pixels-per-ms changed: rebuild world geometry from stored times */
      rescale() {
        for (const it of this.items) it.el.remove();
        this.items = []; this.paths.clear(); this.open.clear(); this.ticks.clear();
      }
      add(el: SVGElement, tEnd: number) { this.world.appendChild(el); this.items.push({ el, tEnd }); }
      addMsg(from: number, to: number, msg: ConsensusMessage, t0: number, t1: number, dropped: boolean): number {
        const id = this.nextId++;
        const k = TYPE_CLASS[msg.type] ?? 'p';
        const x0 = this.wx(t0), x1 = this.wx(t1), y0 = this.laneY(from), y1 = this.laneY(to);
        const el = svgEl('path', { class: `rj-msg m-${k}` }) as SVGPathElement;
        const tt = svgEl('title');
        const vs = msg.type === 'view-change' ? `→v${msg.newView}`
          : msg.type === 'new-view' ? `v${msg.view}`
          : msg.type === 'tx-gossip' ? `hop ${msg.hops}`
          : msg.type === 'genesis-request' || msg.type === 'genesis-response' ? ''
          : `v${msg.view} s${msg.sequence}`;
        tt.textContent = `${msg.type} ${vs}  #${from} → #${to}`;
        el.appendChild(tt);
        this.paths.set(id, { el, x0, y0, x1, y1 });
        this.add(el, t1);
        if (dropped) this.markDropped(id);
        else { el.setAttribute('d', `M${x0},${y0} L${x1},${y1}`); el.setAttribute('marker-end', `url(#rj-m-${k})`); }
        if (this.paths.size > 4000) { const first = this.paths.keys().next().value; if (first !== undefined) this.paths.delete(first); }
        return id;
      }
      markDropped(id: number) {
        const p = this.paths.get(id);
        if (!p) return;
        const mx = p.x0 + (p.x1 - p.x0) * 0.55, my = p.y0 + (p.y1 - p.y0) * 0.55;
        p.el.setAttribute('class', 'rj-msg m-drop');
        p.el.removeAttribute('marker-end');
        p.el.setAttribute('d', `M${p.x0},${p.y0} L${mx},${my} M${mx - 3},${my - 3} L${mx + 3},${my + 3} M${mx - 3},${my + 3} L${mx + 3},${my - 3}`);
      }
      addSync(from: number, to: number, t: number) {
        const x0 = this.wx(t), x1 = this.wx(t + 60), y0 = this.laneY(from), y1 = this.laneY(to);
        const el = svgEl('path', { class: 'rj-msg m-nv rj-sync', d: `M${x0},${y0} L${x1},${y1}`, 'marker-end': 'url(#rj-m-nv)' });
        const tt = svgEl('title');
        tt.textContent = `state sync: #${from}.exportSyncState() → #${to}.importSyncState()`;
        el.appendChild(tt);
        this.add(el, t + 60);
      }
      markEarly(id: number) {
        const p = this.paths.get(id);
        if (p) p.el.classList.add('early');
      }
      addFinal(lane: number, h: bigint, t: number) {
        const x = this.wx(t), y = this.laneY(lane);
        const g = svgEl('g', { class: 'rj-final' });
        g.appendChild(svgEl('rect', { x: x - 4, y: y - 4, width: 8, height: 8, transform: `rotate(45 ${x} ${y})` }));
        if (!this.labeled.has(h.toString())) {
          this.labeled.add(h.toString());
          // Lane 0 has no row above it to spill into: label below the marker there
          // instead of above, so it never rides the diagram's own top edge.
          const tx = svgEl('text', { x: x + 6, y: lane === 0 ? y + 14 : y - 6 });
          tx.textContent = `#${h}`;
          g.appendChild(tx);
          if (this.labeled.size > 500) this.labeled.clear();
        }
        this.add(g, t);
      }
      lastViewMark = new Map<string, number>();
      addView(lane: number, view: bigint, t: number) {
        const x = this.wx(t);
        const y = this.laneY(lane);
        this.add(svgEl('circle', { cx: x, cy: y, r: 4, class: 'rj-vcdot' }), t);
        const key = view.toString();
        const prev = this.lastViewMark.get(key);
        if (prev === undefined || t - prev > 1500) {
          this.lastViewMark.set(key, t);
          const g = svgEl('g', { class: 'rj-viewmark' });
          g.appendChild(svgEl('line', { x1: x, x2: x, y1: this.top, y2: this.top + this.n * this.laneH }));
          const tx = svgEl('text', { x: x + 4, y: this.top + this.n * this.laneH + 14 });
          tx.textContent = `view ${view} → lead #${Number(view % BigInt(this.n))}`;
          g.appendChild(tx);
          this.add(g, t + 2500);
        }
      }
      setStatus(lane: number, status: 'down' | 'partitioned' | 'up', t: number) {
        const o = this.open.get(lane);
        if (o) { o.item.tEnd = t; this.open.delete(lane); }
        if (status === 'up') return;
        const el = svgEl('rect', { x: this.wx(t), y: this.top + lane * this.laneH + 3, width: 1, height: this.laneH - 6, class: `rj-fault f-${status}` }) as SVGRectElement;
        this.world.insertBefore(el, this.world.firstChild);
        const item = { el: el as SVGElement, tEnd: Infinity };
        this.items.push(item);
        this.open.set(lane, { el, t, item });
        const lbl = svgEl('text', { x: this.wx(t) + 4, y: this.laneY(lane) + 4, class: 'rj-faultlbl' });
        lbl.textContent = status === 'down' ? 'crashed' : 'partitioned';
        this.add(lbl, t + 3000);
      }
      frame(now: number, leader: number, labels: string[]) {
        const tnow = this.paused ? this.pausedAt : now;
        const tx = this.nowX - this.wx(tnow);
        this.world.setAttribute('transform', `translate(${tx.toFixed(2)},0)`);
        for (const [, o] of this.open) o.el.setAttribute('width', String(Math.max(1, this.wx(now) - this.wx(o.t))));
        // ticks every second
        const s0 = Math.ceil((tnow - HISTORY_MS - this.origin) / 1000), s1 = Math.floor((tnow + FUTURE_MS - this.origin) / 1000);
        for (let s = Math.max(0, s0); s <= s1; s++) {
          if (this.ticks.has(s)) continue;
          this.ticks.add(s);
          const x = s * 1000 * this.ppm;
          const g = svgEl('g', { class: 'rj-tick' });
          g.appendChild(svgEl('line', { x1: x, x2: x, y1: this.top, y2: this.top + this.n * this.laneH }));
          const t = svgEl('text', { x: x + 3, y: this.top + this.n * this.laneH + 14 });
          t.textContent = `${s}s`;
          g.appendChild(t);
          this.add(g, this.origin + s * 1000);
        }
        if (!this.paused && ++this.frameNo % 20 === 0) {
          const cutoff = now - HISTORY_MS - 400;
          {
            this.items = this.items.filter((it) => {
              if (it.tEnd < cutoff) { it.el.remove(); return false; }
              return true;
            });
            for (const s of this.ticks) if (this.origin + s * 1000 < cutoff) this.ticks.delete(s);
          }
        }
        this.lanes.querySelectorAll<SVGGElement>('.rj-lane').forEach((g, i) => {
          g.classList.toggle('leader', i === leader);
          const st = g.querySelector('.rj-lanestat');
          if (st && st.textContent !== labels[i]) st.textContent = labels[i];
        });
      }
      destroy() { this.ro.disconnect(); this.wrap.innerHTML = ''; }
    }

    /* ── mesh lifecycle ─────────────────────────────────────────────────── */
    function disposeMesh() {
      const m = mesh;
      if (!m) return;
      m.dead = true;
      for (const v of m.vals) { try { v.node.stop(); } catch { /* ignore */ } }
      for (const id of m.timers) clearTimeout(id);
      for (const id of m.deliveries) clearTimeout(id);
      for (const [, w] of m.waiters) { clearTimeout(w.timer); w.reject(new Error('mesh rebuilt')); }
      m.waiters.clear();
      mesh = null;
      inflight.clear();
      reserveChain.clear();
    }

    async function rebuild() {
      if (building) return;
      building = true;
      try {
        disposeMesh();
        tl?.destroy();
        valsEl.innerHTML = '<div class="rj-empty">generating Ed25519 keys and funding genesis…</div>';
        const m = await buildMesh(state.n);
        if (disposed) { m.dead = true; return; }
        mesh = m;
        announcedViews.clear();
        rootCache.clear();
        t0 = performance.now();
        tl = new Timeline(out('svgwrap'), state.n);
        buildVals();
        for (const v of m.vals) v.node.start();
        log(`mesh up: <b>${state.n}</b> validators, quorum ${m.quorum}, f=${m.f}, chainId ${CHAIN_ID}, blockTime ${state.bt} ms, viewTimeout ${state.vt * 1000} ms; ${ACCOUNTS.length} accounts funded with ${GENESIS} each on every node`, 'ev-view');
        renderVals(); renderBlocks(); renderMempool(); scheduleRefresh();
        if (state.n !== Number(nIn.value)) nIn.value = String(state.n);
        // kick things off so the default state has blocks immediately
        spam(10, true);
      } catch (e) {
        showErr(e);
        valsEl.innerHTML = '<div class="rj-empty">could not start the mesh (this browser may lack WebCrypto Ed25519)</div>';
      } finally {
        building = false;
        if (mesh && mesh.cfg !== meshCfg()) void rebuild();
      }
    }

    /* ── cross-tab validators (2.7) ───────────────────────────────────────
     * Independent of `mesh` above: this section runs at most one real
     * ValidatorNode per tab, over a NetworkTransport backed by the tab bus
     * instead of the in-memory `makeTransport()`. See the top-of-file
     * comment for the identity/coordination scheme.
     */
    let ct = freshCT();
    let ctMsgHandler: Handler | null = null;
    const ctBody = out('ctbody');

    function ctLog(msg: string) {
      ct.log.unshift(`<span class="rj-t">${new Date().toLocaleTimeString()}</span> ${msg}`);
      if (ct.log.length > 40) ct.log.length = 40;
    }

    function ctMakeTransport(): NetworkTransport {
      return {
        broadcast(msg) {
          if (ct.destroyed) return;
          sendToTab<CTMsgPayload>('raijin', 'raijin', 'ct-msg', { room: ct.roomKey, from: ct.selfHex, to: null, msg });
        },
        send(toPk, msg) {
          if (ct.destroyed) return;
          sendToTab<CTMsgPayload>('raijin', 'raijin', 'ct-msg', { room: ct.roomKey, from: ct.selfHex, to: toHex(toPk), msg });
        },
        onMessage(h) { ctMsgHandler = h as Handler; },
      };
    }

    function ctMaybeLock() {
      if (ct.locked || !ct.enabled || ct.roster.size < ct.targetN) return;
      // debounce: give a few more heartbeats a chance to arrive before every tab
      // freezes its own snapshot of the roster, so independently-sorted
      // snapshots are more likely to agree on the same first-N participants.
      const id = window.setTimeout(() => { void ctLockAndStart(); }, CT_LOCK_DEBOUNCE_MS);
      ct.timers.add(id);
    }

    async function ctLockAndStart() {
      if (ct.locked || !ct.enabled || ct.destroyed) return;
      ct.locked = true;
      const all = new Set(ct.roster.keys());
      all.add(ct.selfHex);
      const participants = [...all].sort().slice(0, ct.targetN);
      ct.participants = participants;
      ct.idx = participants.indexOf(ct.selfHex);
      ctLog(`locked ${participants.length} validators in room "${esc(ct.room)}": ${participants.map((p, i) => `#${i} ${short(p, 8)}${p === ct.selfHex ? '(you)' : ''}`).join(', ')}`);
      if (ct.idx === -1) { ctLog(`spectator — room already reached ${ct.targetN} validators before this tab was seen. Try a different room name.`); ctRender(); return; }
      try {
        const genesis = await getGenesisWallets();
        if (ct.destroyed) return;
        ct.genesisWallets = genesis;
        const store = new InMemoryStateStore();
        for (const w of genesis) await store.put(accountKey(w.publicKey), encodeAccount({ balance: GENESIS, nonce: 0n, reputation: 0n }));
        if (ct.destroyed) return;
        const keys = participants.map(fromHex);
        const timer: ConsensusTimer = {
          set(ms, cb) {
            const id = window.setTimeout(() => { ct.timers.delete(id); cb(); }, ms);
            ct.timers.add(id);
            return id;
          },
          clear(h) { window.clearTimeout(h as number); ct.timers.delete(h as number); },
        };
        const node = new ValidatorNode({
          chainId: CT_CHAIN_ID,
          identity: { publicKey: ct.wallet!.publicKey, sign: (m) => ct.wallet!.sign(m), verify: ed25519Verifier },
          transport: ctMakeTransport(),
          timer,
          store,
          blockTime: CT_BLOCK_TIME,
          viewTimeout: CT_VIEW_TIMEOUT,
          validators: keys,
          maxTxPerBlock: MAX_TX_PER_BLOCK,
        });
        node.onBlockFinalized((block, receipts) => {
          const ok = receipts.filter((r) => r.status === 'success').length;
          ct.blocks.unshift({
            h: block.header.number, block, root: toHex(block.header.stateRoot),
            proposer: participants.indexOf(toHex(block.header.proposer)), ok, rev: receipts.length - ok,
          });
          if (ct.blocks.length > 20) ct.blocks.length = 20;
          ctLog(`block <b>#${block.header.number}</b> finalized: ${block.transactions.length} tx, root ${short(toHex(block.header.stateRoot))} — real PRE-PREPARE/PREPARE/COMMIT quorum across ${participants.length} tabs`);
        });
        ct.node = node;
        node.start();
        ctLog(`ValidatorNode started (chainId ${CT_CHAIN_ID}, blockTime ${CT_BLOCK_TIME}ms, viewTimeout ${CT_VIEW_TIMEOUT}ms) — this tab is validator #${ct.idx}`);
      } catch (e) {
        ctLog(`failed to start: ${esc(e instanceof Error ? e.message : String(e))}`);
      }
      ctRender();
    }

    function ctHandleEnvelope(h: Handoff<unknown>) {
      if (!ct.enabled || ct.destroyed) return;
      const kind = h.kind as CTEnvelopeKind;
      if (kind === 'ct-hello') {
        const p = h.payload as CTHelloPayload;
        if (p.room !== ct.roomKey) return;
        ct.roster.set(p.pk, { ts: Date.now() });
        ctMaybeLock();
      } else if (kind === 'ct-bye') {
        const p = h.payload as CTByePayload;
        if (p.room !== ct.roomKey || ct.locked) return;
        ct.roster.delete(p.pk);
      } else if (kind === 'ct-msg') {
        const p = h.payload as CTMsgPayload;
        // Tag every message with the sender's identity and the room it belongs to, and
        // ignore anything not addressed to this tab: BroadcastChannel never echoes a tab's
        // own sends back to it (see bus.ts), but sendToTab('raijin','raijin',...) is heard by
        // every OTHER tab running this room, including ones in a different cross-tab room or
        // running the plain in-page demo — both room and self-address are checked so those
        // don't get fed into this tab's (possibly nonexistent) consensus engine.
        if (!ct.locked || p.room !== ct.roomKey || p.from === ct.selfHex) return;
        if (p.to !== null && p.to !== ct.selfHex) return;
        if (ctMsgHandler) void ctMsgHandler(fromHex(p.from), p.msg);
      } else if (kind === 'ct-tx') {
        const p = h.payload as CTTxPayload;
        if (!ct.locked || !ct.node || p.room !== ct.roomKey) return;
        void ct.node.submitTransaction(p.tx).catch(() => { /* duplicate/invalid — the mempool already rejected it locally too */ });
      }
    }

    async function ctStartFromControls() {
      if (ct.enabled) return;
      ct = freshCT();
      ct.enabled = true;
      ct.room = ctSanitizeRoom(ctRoomIn.value);
      ct.targetN = ctSanitizeN(Number(ctNIn.value));
      ct.roomKey = `${ct.room}:n${ct.targetN}`;
      ctRender();
      try {
        ct.wallet = await Wallet.generate();
        if (!ct.enabled) return; // toggled off while awaiting key generation
        ct.selfHex = toHex(ct.wallet.publicKey);
        ct.roster.set(ct.selfHex, { ts: Date.now() });
        ctLog(`identity ${short(ct.selfHex, 10)} — waiting for ${ct.targetN} total in room "${esc(ct.room)}"`);
        ct.offHandoff = onTabHandoff('raijin', (h) => ctHandleEnvelope(h));
        const hello = () => sendToTab<CTHelloPayload>('raijin', 'raijin', 'ct-hello', { room: ct.roomKey, pk: ct.selfHex, n: ct.targetN, ts: Date.now() });
        hello();
        const hb = window.setInterval(hello, CT_HEARTBEAT_MS);
        ct.timers.add(hb);
        const prune = window.setInterval(() => {
          if (ct.locked) return;
          const now = Date.now();
          for (const [pk, p] of ct.roster) if (pk !== ct.selfHex && now - p.ts > CT_PEER_TTL_MS) ct.roster.delete(pk);
        }, 500);
        ct.timers.add(prune);
        ctMaybeLock();
        ctRender();
      } catch (e) {
        ctLog(`could not start: ${esc(e instanceof Error ? e.message : String(e))}`);
        ctRender();
      }
    }

    function ctStop() {
      if (ct.locked && ct.selfHex) { try { sendToTab<CTByePayload>('raijin', 'raijin', 'ct-bye', { room: ct.roomKey, pk: ct.selfHex }); } catch { /* ignore */ } }
      ct.destroyed = true;
      ct.offHandoff?.();
      for (const id of ct.timers) window.clearInterval(id);
      try { ct.node?.stop(); } catch { /* ignore */ }
      ctMsgHandler = null;
      ct = freshCT();
      ctRender();
    }

    async function ctSend() {
      if (!ct.node || ct.idx === -1 || !ct.genesisWallets) return;
      const fromSelEl = $('[data-i="ctFrom"]') as HTMLSelectElement | null;
      const toSelEl = $('[data-i="ctTo"]') as HTMLSelectElement | null;
      const amtEl = $('[data-i="ctAmount"]') as HTMLInputElement | null;
      if (!fromSelEl || !toSelEl || !amtEl) return;
      const fromI = Number(fromSelEl.value), toI = Number(toSelEl.value);
      if (fromI === toI) return;
      const amount = BigInt(Math.max(1, Math.floor(Number(amtEl.value) || 1)));
      const fromW = ct.genesisWallets[fromI], toW = ct.genesisWallets[toI];
      try {
        const acct = await ct.node.stateMachine.getAccount(fromW.publicKey);
        const tx = await fromW.buildTx({ to: toW.publicKey, value: amount, nonce: acct.nonce, data: feeBytes(1n), chainId: CT_CHAIN_ID });
        await ct.node.submitTransaction(tx);
        sendToTab<CTTxPayload>('raijin', 'raijin', 'ct-tx', { room: ct.roomKey, tx });
        ctLog(`submitted ${ACCOUNTS[fromI]} → ${ACCOUNTS[toI]} <b>${amount}</b> to this tab's mempool and broadcast it to every peer tab's mempool`);
      } catch (e) {
        ctLog(`submit failed: ${esc(e instanceof Error ? e.message : String(e))}`);
      }
      ctRender();
    }

    function ctToggleFault() {
      if (!ct.node) return;
      if (ct.node.running) { ct.node.stop(); ctLog(`you stopped this tab's validator (crash simulation) — the other tabs' view timers should expire and rotate the leader past #${ct.idx}`); }
      else { ct.node.start(); ctLog(`restarted this tab's validator`); }
      ctRender();
    }

    function ctRender() {
      if (!ct.enabled) { ctBody.hidden = true; return; }
      ctBody.hidden = false;
      if (!ct.locked) {
        const rows = [...ct.roster.keys()].sort()
          .map((pk) => `<li>${short(pk, 12)}${pk === ct.selfHex ? ' <b>(you)</b>' : ''}</li>`).join('');
        ctBody.innerHTML = `
          <div class="rj-ct-lobby">
            <p>waiting for <b>${ct.targetN}</b> validators in room <code>${esc(ct.room)}</code> — <b>${ct.roster.size}/${ct.targetN}</b> joined${ct.roster.size >= ct.targetN ? ' <span class="rj-dim">(locking…)</span>' : ''}</p>
            <ul class="rj-ct-roster">${rows || '<li class="rj-dim">nobody else here yet — open this URL in another tab and enable cross-tab mode there</li>'}</ul>
          </div>
          <ol class="rj-log">${ct.log.slice(0, 10).join('</li><li>').replace(/^/, ct.log.length ? '<li>' : '').replace(/$/, ct.log.length ? '</li>' : '')}</ol>`;
        return;
      }
      if (ct.idx === -1) {
        ctBody.innerHTML = `<p class="warn">spectator — room "${esc(ct.room)}" already locked its ${ct.targetN} validators before this tab joined. Try a different room name or a fresh one.</p>`;
        return;
      }
      const node = ct.node;
      if (!node) { ctBody.innerHTML = `<p class="rj-dim">starting this tab's validator…</p>`; return; }
      const c = node.consensus;
      const leader = Number(c.currentView % BigInt(ct.participants.length));
      const blocksHtml = ct.blocks.length
        ? ct.blocks.map((b) => `<div class="rj-blk"><span class="rj-bh">#${b.h}</span><span>${b.block.transactions.length} tx <span class="rj-dim">(${b.ok}✓${b.rev ? ` <span class="rj-rev">${b.rev}✗</span>` : ''})</span></span><span class="rj-dim">by #${b.proposer}</span><span class="rj-root">${short(b.root, 10)}</span></div>`).join('')
        : '<div class="rj-empty">no blocks finalized yet</div>';
      ctBody.innerHTML = `
        <div class="rj-ct-status">
          <span class="stat">you are <b>#${ct.idx}</b> / ${ct.participants.length}</span>
          <span class="stat">view <b>${c.currentView}</b></span>
          <span class="stat">leader <b>#${leader}${leader === ct.idx ? ' (you)' : ''}</b></span>
          <span class="stat">seq <b>${c.currentSequence}</b></span>
          <span class="stat">phase <b>${c.phase}</b></span>
          <span class="stat">height <b>${node.latestBlock?.header.number ?? 0n}</b></span>
          <span class="stat">mempool <b>${node.mempool.size}</b></span>
          <span class="stat">running <b>${node.running ? 'yes' : 'no'}</b></span>
          <button class="tb-btn" data-a="ct-fault">${node.running ? 'stop this validator' : 'restart this validator'}</button>
        </div>
        <div class="rj-ct-compose">
          <label class="field">from <select data-i="ctFrom">${ACCOUNTS.map((a, i) => `<option value="${i}">${a}</option>`).join('')}</select></label>
          <label class="field">to <select data-i="ctTo">${ACCOUNTS.map((a, i) => `<option value="${i}"${i === 1 ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
          <label class="field">amount <input type="number" min="1" max="1000" value="10" data-i="ctAmount"></label>
          <button class="btn primary" data-a="ct-send">sign &amp; submit</button>
        </div>
        <div class="rj-blist">${blocksHtml}</div>
        <ol class="rj-log">${ct.log.slice(0, 10).map((l) => `<li>${l}</li>`).join('')}</ol>`;
    }

    /* ── DA panel: LocalDA vs CelestiaDA vs EthBlobDA ─────────────────────── */
    const daLocal = new LocalDA();
    const daCelestia = new CelestiaDA({ namespace: DA_CELESTIA_NAMESPACE, endpoint: 'http://localhost:26658' });
    const daEth = new EthBlobDA();
    let daResults: DAResult[] = [];
    let daRunning = false;
    let daAutoRan = false;
    let daSource = '';

    async function daTry(name: string, da: DALayer, bytes: Uint8Array): Promise<DAResult> {
      try {
        const c = await da.submit(bytes);
        const r: DAResult = { name, ok: true, commitment: c };
        try { r.verified = await da.verify(c); } catch (e) { r.verifyError = e instanceof Error ? e.message : String(e); }
        try { const back = await da.retrieve(c); r.retrieveOk = back.length === bytes.length; } catch (e) { r.retrieveError = e instanceof Error ? e.message : String(e); }
        return r;
      } catch (e) {
        return { name, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    function daLatestBlock(): { bytes: Uint8Array; label: string } | null {
      const m = mesh;
      if (m && m.blockOrder.length) {
        const b = m.blockOrder[0];
        return { bytes: new TextEncoder().encode(serializeBlock(b.block)), label: `in-page block #${b.h}` };
      }
      if (ct.blocks.length) {
        const b = ct.blocks[0];
        return { bytes: new TextEncoder().encode(serializeBlock(b.block)), label: `cross-tab block #${b.h} (this tab, validator #${ct.idx})` };
      }
      return null;
    }

    async function daRun() {
      if (daRunning) return;
      const src = daLatestBlock();
      if (!src) { daRenderNow(); return; }
      daRunning = true;
      daRenderNow();
      try {
        const payload = await encode(src.bytes);
        daResults = await Promise.all([
          daTry('local', daLocal, payload),
          daTry('celestia', daCelestia, payload),
          daTry('eth-blobs', daEth, payload),
        ]);
        daSource = `${src.label} · ${payload.length} B encoded`;
      } finally {
        daRunning = false;
        daRenderNow();
      }
    }

    function daRenderNow() {
      const grid = out('dagrid');
      if (!daResults.length) { grid.innerHTML = `<div class="rj-empty">${daRunning ? 'posting to all three backends…' : 'waiting for a finalized block'}</div>`; return; }
      grid.innerHTML = `<p class="rj-dim rj-da-src">${esc(daSource)}</p>` + daResults.map((r) => `
        <div class="rj-da-card ${r.ok ? 'ok' : 'bad'}">
          <div class="rj-da-name">${r.name}</div>
          ${r.ok ? `
            <div class="rj-da-row">commitment <code>${short(toHex(r.commitment!.hash), 14)}</code> @ height ${r.commitment!.height}</div>
            <div class="rj-da-row">verify() ${r.verifyError ? `<span class="rj-rev">threw: ${esc(r.verifyError)}</span>` : r.verified ? '✓ hash matches' : '✗ mismatch'}</div>
            <div class="rj-da-row">retrieve() ${r.retrieveError ? `<span class="rj-rev">threw: ${esc(r.retrieveError)}</span>` : r.retrieveOk ? '✓ round-tripped' : '✗ length mismatch'}</div>
          ` : `<div class="rj-da-row rj-da-err"><pre class="code">${esc(r.error ?? 'unknown error')}</pre></div>`}
        </div>`).join('');
    }

    /* ── wire events ────────────────────────────────────────────────────── */
    let nTimer = 0;
    // n, blockTime and viewTimeout are ValidatorNode constructor config, so a change builds a fresh mesh
    const scheduleRebuild = () => { clearTimeout(nTimer); nTimer = window.setTimeout(() => void rebuild(), 450); };
    root.addEventListener('input', (e) => {
      const t = e.target as HTMLElement;
      const k = t.dataset.i;
      if (k === 'n') {
        state.n = Number(nIn.value); syncLabels(); persist();
        scheduleRebuild();
      } else if (k === 'vt') {
        state.vt = Number(vtIn.value); syncLabels(); persist(); scheduleRebuild();
      } else if (k === 'lat') { state.lat = Number(latIn.value); syncLabels(); persist(); }
      else if (k === 'fee' || k === 'from' || k === 'to') updateHint();
      else if (k === 'ctRoom' || k === 'ctN') { state.ctRoom = ctSanitizeRoom(ctRoomIn.value); state.ctN = ctSanitizeN(Number(ctNIn.value)); persist(); }
    });
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLElement;
      const k = t.dataset.i;
      if (k === 'bt') { state.bt = Number(btIn.value); syncLabels(); persist(); scheduleRebuild(); }
      else if (k === 'auto') { state.auto = autoIn.checked; persist(); }
      else if (k === 'shuffle') { state.shuffle = shufIn.checked; persist(); log(state.shuffle ? 'delivery order shuffled: ±90% jitter per packet, votes now routinely beat their PRE-PREPARE' : 'delivery jitter back to ±15%'); }
      else if (k === 'from' || k === 'to') updateHint();
      else if (k === 'ct') {
        state.ct = ctIn.checked; persist();
        if (state.ct) void ctStartFromControls(); else ctStop();
      } else if (k === 'ctRoom' || k === 'ctN') {
        state.ctRoom = ctSanitizeRoom(ctRoomIn.value); state.ctN = ctSanitizeN(Number(ctNIn.value));
        ctRoomIn.value = state.ctRoom; ctNIn.value = String(state.ctN); persist();
        if (ct.enabled) { ctStop(); void ctStartFromControls(); } // room/count changed mid-session: rejoin fresh
      }
    });
    root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!t) return;
      const m = mesh;
      const a = t.dataset.a;
      if (a === 'copy') { void copyLink().then(() => { t.textContent = 'copied ✓'; window.setTimeout(() => { t.textContent = 'copy link'; }, 1200); }); return; }
      if (a === 'pause' && tl) { tl.paused = !tl.paused; tl.pausedAt = performance.now(); t.textContent = tl.paused ? 'resume' : 'pause'; return; }
      if (a === 'ct-send') { void ctSend(); return; }
      if (a === 'ct-fault') { ctToggleFault(); return; }
      if (a === 'da-run') { void daRun(); return; }
      if (!m) return;
      if (a === 'send') {
        const from = Number(fromSel.value), to = Number(toSel.value);
        if (from === to) return;
        const amt = BigInt(Math.max(1, Math.floor(Number(amtIn.value) || 1)));
        void submit(from, to, amt, BigInt(feeIn.value)).then(updateHint);
        window.setTimeout(updateHint, 50);
        return;
      }
      if (a === 'spam') { spam(20); return; }
      if (a === 'chaos') {
        const L = m.vals[leaderIdx(m, netView(m))];
        if (L.status !== 'up') return;
        kill(m, L);
        const id = window.setTimeout(() => { m.timers.delete(id); if (!m.dead) void restore(m, L); }, 8000);
        m.timers.add(id);
        return;
      }
      const card = t.closest<HTMLElement>('.rj-val');
      if (card && t.dataset.v) {
        const v = m.vals[Number(card.dataset.idx)];
        if (t.dataset.v === 'kill') { if (v.status === 'down') void restore(m, v); else kill(m, v); }
        if (t.dataset.v === 'part') { if (v.status === 'partitioned') void restore(m, v); else partition(m, v); }
      }
    });

    /* ── loops ──────────────────────────────────────────────────────────── */
    intervals.push(window.setInterval(() => {
      renderVals(); renderMempool(); renderBlocks(); renderNarr();
      ctRender();
      if (!daAutoRan && daLatestBlock()) { daAutoRan = true; void daRun(); }
    }, 250));
    intervals.push(window.setInterval(watchdog, 1000));
    intervals.push(window.setInterval(() => {
      const m = mesh;
      if (!m || !state.auto || m.dead) return;
      if (reachable(m).length === 0) return;
      const pend = [...inflight.values()].reduce((a, p) => a + p.size, 0);
      if (pend < 24) spam(randInt(1, 3), true);
    }, 1400));
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const m = mesh;
      if (!m || !tl) return;
      const nv = netView(m);
      const L = leaderIdx(m, nv);
      const labels = m.vals.map((v) => (v.status === 'up' ? `v${v.node.consensus.currentView}` : v.status));
      tl.frame(performance.now(), L, labels);
    };
    raf = requestAnimationFrame(loop);

    void rebuild();
    daRenderNow();
    if (state.ct) void ctStartFromControls(); // shared/deep-linked "join this room" URL — opt-in state carried through copy link

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      intervals.forEach((id) => clearInterval(id));
      clearTimeout(nTimer);
      disposeMesh();
      ctStop();
      tl?.destroy();
      tl = null;
      host.innerHTML = '';
    };
  },
};

export default playground;
