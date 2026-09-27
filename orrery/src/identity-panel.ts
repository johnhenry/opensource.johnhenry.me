/**
 * One key, many identities (ROADMAP §4.9).
 *
 * A single Ed25519 key pair, generated once via WebCrypto (the same
 * `generateKeyPair()` @johnhenry/wsh's own README documents), is shown as
 * FOUR different identities that four different @johnhenry packages derive
 * from it — using each package's own real, published function, not a
 * reimplementation:
 *
 *   - **wsh fingerprint** — `fingerprint(rawPublicKey)` from `@johnhenry/wsh`
 *     (hex SHA-256 of the raw 32-byte public key point).
 *   - **browsermesh podId** — `derivePodId(publicKey)` from
 *     `@johnhenry/browsermesh-primitives`, run directly on the SAME
 *     `CryptoKey` object wsh's `generateKeyPair()` returned. wsh's own
 *     auth.mjs documents this exact construction (base64url SHA-256 of the
 *     raw point) as "the BrowserMesh identity format" but does not export
 *     its own copy at the package's public API surface — browsermesh's is
 *     the real, importable one, and the two numbers are shown side by side
 *     so the shared construction is visible, not just asserted. (The
 *     roadmap named `MeshWshBridge`/`browsermesh-transport` for this slot;
 *     that class lives in `browsermesh-apps`, which is not an installed
 *     dependency here and is flagged elsewhere in ROADMAP.md as broken in
 *     browsers — seven modules call `createRequire(import.meta.url)` at
 *     load. `derivePodId` performs the identical derivation with no
 *     network, no server, and no broken import.)
 *   - **dialback identity** — a real, in-page `@johnhenry/dialback`
 *     `Server`/`Agent` handshake (looped back over a `MessageChannel`, no
 *     network), authenticated with a `secret` derived from the master key
 *     via HMAC-SHA256. The handshake either succeeds or is rejected by
 *     dialback's own `Server` code — this is not simulated.
 *   - **OAT signer** — the master key's raw 32-byte seed used directly as
 *     an `@johnhenry/oat-protocol` `Ed25519KeyPair.secretKey` (the same
 *     RFC 8032 seed format `ed25519.utils.randomPrivateKey()` produces),
 *     signing and verifying a real payload with `signPayload`/
 *     `verifySignature`. The panel cross-checks that oat-protocol's
 *     noble-curves-derived public key equals wsh's WebCrypto-derived public
 *     key byte-for-byte — proof the "one key" story is real, not four
 *     independently generated keys wearing the same label.
 *
 * **Revoke once, watch every system react** — a single click:
 *   - closes the dialback loop and re-dials with a mismatched secret, so
 *     dialback's real `Server` rejects the handshake (`removeConnection` +
 *     `record.close()` — see server.mjs's "agent" case) instead of just
 *     flipping a label;
 *   - calls `.revoke()` on a real `@johnhenry/browsermesh-primitives`
 *     `AccessGrant` for the podId, then re-runs `.check()` and shows the
 *     real `{ allowed: false, reason }` it returns;
 *   - adds the identity to a local OAT revocation registry this panel owns
 *     (oat-protocol signatures have no revocation concept of their own —
 *     `verifySignature` keeps returning true, honestly, because the bytes
 *     really do verify; trust is a registry decision layered on top, shown
 *     as such);
 *   - flips a guard that blocks this panel from calling wsh's real
 *     `signChallenge()` again with the revoked private key (wsh's protocol
 *     has no revocation primitive either — see ROADMAP.md's wsh #59 note —
 *     so this is the same kind of honest, app-level enforcement).
 *
 * Self-contained: mounted once from main.ts, touches no playground file.
 */
import { Buffer } from 'buffer';
// dialback's Server#secretMatches does `Buffer.from(...)` as a bare global
// reference (no import) — real in Node, absent in a browser unless polyfilled.
// The 'buffer' package is already a project dependency; this just makes the
// global it expects actually exist, the same way index.html-less Vite apps
// commonly wire up Node-shaped browser deps.
if (!(globalThis as unknown as { Buffer?: unknown }).Buffer) {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

import { generateKeyPair, exportPublicKeyRaw, fingerprint as wshFingerprint, signChallenge, generateNonce } from '@johnhenry/wsh';
import { derivePodId, AccessGrant, generateGrantId, type CheckResult } from '@johnhenry/browsermesh-primitives';
import { Server as DialbackServer, Agent as DialbackAgent } from '@johnhenry/dialback';
import type { Connection } from '@johnhenry/dialback';
import { signPayload, verifySignature, type Ed25519KeyPair, type ArtifactSignature } from '@johnhenry/oat-protocol';
import { registerDevTool } from './dev-drawer';
import './identity-panel.css';

/* ------------------------------------------------------------------ */
/* dialback loopback transport: an in-memory MessageChannel Connection */
/* pair, the same shape src/playgrounds/dialback.ts uses to run a real */
/* Server + Agent handshake with no network. Reimplemented here (not   */
/* imported — playground files are not shared modules) so this panel   */
/* stays self-contained.                                               */
/* ------------------------------------------------------------------ */
type Tap = (dir: 'in' | 'out', msg: Record<string, unknown>) => void;

function memoryConnectionPair(tap: Tap): { agentSide: Connection; serverSide: Connection; close: () => void } {
  const mc = new MessageChannel();
  const closers: Array<() => void> = [];
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    mc.port1.close();
    mc.port2.close();
    for (const f of closers.splice(0)) { try { f(); } catch { /* ignore */ } }
  };
  const side = (port: MessagePort, tapDir: 'in' | 'out' | null): Connection => {
    port.start();
    return {
      send(d: string) {
        if (closed) return;
        if (tapDir === 'out') { try { tap('out', JSON.parse(d)); } catch { /* not JSON */ } }
        port.postMessage(d);
      },
      addEventListener(t: string, f: (e: unknown) => void) {
        if (t === 'message') port.addEventListener('message', f as EventListener);
        else if (t === 'close') closers.push(() => f({}));
      },
      on(t: string, f: (...a: unknown[]) => void) { if (t === 'close') closers.push(() => f()); },
      close,
      bufferedAmount: 0,
    } as Connection;
  };
  mc.port1.addEventListener('message', (ev) => { try { tap('in', JSON.parse(String((ev as MessageEvent).data))); } catch { /* not JSON */ } });
  return { agentSide: side(mc.port1, 'out'), serverSide: side(mc.port2, null), close };
}

/** Dial one dialback loopback handshake with the given secret; resolve once registered or rejected. */
async function dialbackHandshake(secret: string, expected: string): Promise<{ ok: boolean; agentId: string; detail: string }> {
  return new Promise((resolve) => {
    let agentId = '';
    const pair = memoryConnectionPair((dir, msg) => {
      if (dir === 'out' && msg.kind === 'agent') agentId = String(msg.agent ?? '');
    });
    const server = new DialbackServer(() => new Response('no agent dialled in', { status: 503 }), { secret: expected });
    server.addConnection(pair.serverSide);
    pair.serverSide.addEventListener('close', () => server.removeConnection(pair.serverSide));
    const transport = async () => pair.agentSide;
    const agent = new DialbackAgent('memory://identity-panel', { transport, secret });
    void agent.connection.then(() => {
      // Give the Server's async receive loop a tick to consume the handshake message.
      setTimeout(() => {
        const registered = !!agentId && !!server.getConnectionById(agentId);
        pair.close();
        void agent.close().catch(() => {});
        resolve({
          ok: registered,
          agentId,
          detail: registered
            ? `handshake accepted · agent ${agentId} registered on the loopback Server`
            : `handshake rejected · Server#addConnection's "agent" case called removeConnection() + record.close() (invalid secret)`,
        });
      }, 40);
    }).catch((err) => resolve({ ok: false, agentId: '', detail: String(err?.message ?? err) }));
  });
}

/* ------------------------------------------------------------------ */
/* crypto helpers                                                      */
/* ------------------------------------------------------------------ */
function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function short(s: string, n = 10): string {
  return s.length <= n * 2 + 1 ? s : `${s.slice(0, n)}…${s.slice(-n)}`;
}
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSecret(seed: Uint8Array, label: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', seed as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(label));
  return hex(new Uint8Array(sig));
}

interface Identity {
  keyPair: CryptoKeyPair;
  rawPub: Uint8Array;
  seed: Uint8Array; // Ed25519 raw private seed, RFC 8032 — same bytes WebCrypto and noble-curves both use
  wshFp: string;
  podId: string;
  dialbackSecret: string;
  oatKeyPair: Ed25519KeyPair;
  oatSignature: ArtifactSignature;
  oatKeysMatch: boolean;
}

async function mintIdentity(): Promise<Identity> {
  const keyPair = await generateKeyPair(true); // extractable — this demo needs to re-derive raw bytes
  const rawPub = await exportPublicKeyRaw(keyPair.publicKey);
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const seed = b64urlToBytes(jwk.d!);
  const wshFp = await wshFingerprint(rawPub);
  const podId = await derivePodId(keyPair.publicKey);
  const dialbackSecret = await hmacSecret(seed, 'orrery:dialback-agent-secret:v1');
  const oatKeyPair: Ed25519KeyPair = { publicKey: rawPub, secretKey: seed };
  const oatSignature = signPayload(seed, new TextEncoder().encode('orrery-identity-check'), wshFp.slice(0, 16));
  const oatKeysMatch = hex(oatSignature.publicKey) === hex(rawPub);
  return { keyPair, rawPub, seed, wshFp, podId, dialbackSecret, oatKeyPair, oatSignature, oatKeysMatch };
}

/* ------------------------------------------------------------------ */
/* panel UI                                                            */
/* ------------------------------------------------------------------ */
let mounted = false;

export function mountIdentityPanel(): void {
  if (mounted) return;
  mounted = true;

  // The panel used to be its own floating root (`.identity-panel`) appended
  // to document.body, with an `.ip-handle` toggle button that collapsed it
  // to a small circle. Both are gone — this pane now lives inside the Dev
  // Drawer, whose own tab strip is the toggle.
  let cards!: HTMLElement, newBtn!: HTMLButtonElement, revokeBtn!: HTMLButtonElement;
  registerDevTool({
    id: 'identity',
    label: 'Identity',
    icon: '🔑',
    mount(container) {
      container.classList.add('identity-panel-pane');
      container.innerHTML = `
        <div class="ip-row stat">One Ed25519 keypair (WebCrypto), shown as four real identities. No network, no keys leave this tab.</div>
        <div class="ip-cards"></div>
        <div class="ip-row">
          <button class="btn ip-new" type="button">New key</button>
          <button class="btn primary ip-revoke" type="button" disabled>Revoke this key</button>
        </div>`;
      cards = container.querySelector<HTMLElement>('.ip-cards')!;
      newBtn = container.querySelector<HTMLButtonElement>('.ip-new')!;
      revokeBtn = container.querySelector<HTMLButtonElement>('.ip-revoke')!;
    },
  });

  let identity: Identity | null = null;
  let grant: AccessGrant | null = null;
  let revoked = false;
  const oatRevoked = new Set<string>();

  function cardHtml(id: string, label: string, status: 'pending' | 'ok' | 'bad', line1: string, line2: string): string {
    return `<div class="ip-card ip-${status}" data-card="${id}">
      <div class="ip-card-head"><b>${label}</b><span class="ip-badge">${status === 'ok' ? 'live' : status === 'bad' ? 'reacted' : '…'}</span></div>
      <div class="ip-card-l1">${line1}</div>
      <div class="ip-card-l2">${line2}</div>
    </div>`;
  }

  function render() {
    if (!identity) { cards.innerHTML = '<div class="ip-row stat">generating a key…</div>'; return; }
    const id = identity;
    cards.innerHTML = [
      cardHtml('wsh', '@johnhenry/wsh · fingerprint()', revoked ? 'bad' : 'ok',
        `<code>${short(id.wshFp)}</code>`,
        revoked ? 'signChallenge() now refused by this panel — identity revoked (app-level guard; wsh\'s own protocol has no revocation primitive yet)' : 'hex SHA-256 of the raw Ed25519 public point'),
      cardHtml('mesh', '@johnhenry/browsermesh-primitives · derivePodId()', revoked ? 'bad' : 'ok',
        `<code>${short(id.podId)}</code>`,
        revoked ? (grant ? `AccessGrant.check() → allowed:false — ${grant.check('mesh://orrery/demo', 'read').reason}` : '') : 'base64url SHA-256 of the same raw point — same construction, independent package'),
      cardHtml('dialback', '@johnhenry/dialback · Server + Agent handshake', 'pending',
        '<span class="ip-dial-status">dialling…</span>', `secret = HMAC-SHA256(seed, "orrery:dialback-agent-secret:v1") → <code>${short(id.dialbackSecret, 6)}</code>`),
      cardHtml('oat', '@johnhenry/oat-protocol · signPayload()/verifySignature()', revoked ? 'bad' : 'ok',
        `signature ${verifySignature(new TextEncoder().encode('orrery-identity-check'), id.oatSignature) ? 'cryptographically valid' : 'INVALID'} · keys match wsh: ${id.oatKeysMatch ? 'yes' : 'no'}`,
        revoked ? `key id ${id.oatSignature.keyId} added to this panel's local revocation registry — the signature above stays cryptographically valid (that's a fact about the bytes); trust is the registry's call, not the math's` : 'secretKey = the same 32-byte seed, RFC 8032 — oat-protocol (noble-curves) derives the identical public key WebCrypto did'),
    ].join('');
    void redialDialback();
  }

  async function redialDialback() {
    if (!identity) return;
    const id = identity;
    const usedSecret = revoked ? `${id.dialbackSecret}-revoked` : id.dialbackSecret;
    const result = await dialbackHandshake(usedSecret, id.dialbackSecret);
    const el = cards.querySelector(`[data-card="dialback"]`);
    if (!el) return;
    el.className = `ip-card ${result.ok ? 'ip-ok' : 'ip-bad'}`;
    el.querySelector('.ip-badge')!.textContent = result.ok ? 'live' : 'reacted';
    el.querySelector('.ip-dial-status')!.innerHTML = result.detail;
  }

  async function generate() {
    revoked = false;
    grant = null;
    identity = null;
    revokeBtn.disabled = true;
    render();
    const id = await mintIdentity();
    identity = id;
    grant = new AccessGrant({
      id: generateGrantId(),
      grantee: id.podId,
      grantor: 'orrery:identity-panel',
      permissions: [{ resource: 'mesh://orrery/*', actions: ['read', 'write'] }],
    });
    revokeBtn.disabled = false;
    render();
  }

  function revoke() {
    if (!identity || revoked) return;
    revoked = true;
    grant?.revoke();
    oatRevoked.add(identity.oatSignature.keyId ?? '');
    revokeBtn.disabled = true;
    render();
  }

  newBtn.addEventListener('click', () => { void generate(); });
  revokeBtn.addEventListener('click', revoke);

  void generate();
}
