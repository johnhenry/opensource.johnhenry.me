---
title: "Tutorial: handshake to exec"
description: "Authenticate with an Ed25519 challenge-response handshake and run one exec command over real wsh wire frames — the same bytes a real WebSocket/WebTransport connection would carry, with no network involved."
---

wsh's real job is talking to a remote host over a network. But its protocol — Ed25519 challenge-response auth, then a channel open for a command, then streamed output — is entirely expressible as plain function calls exchanging bytes, which makes it possible to see the whole conversation end to end without standing up a server first. This tutorial does exactly that: authenticate, then run one command, using wsh's own wire-format encode/decode functions directly. Every byte that moves is the real length-prefixed CBOR frame format a live server or `wsh-cli` would produce and consume.

Takes about 10 minutes.

## 1. Install

```sh
npm install @johnhenry/wsh
```

Requires Node.js 24+ (for Web Crypto Ed25519) or a browser with the same support.

## 2. Create the file

Create `exec-demo.mjs`. It has two parts: a tiny in-process "server" that enforces the same ordering rule a real `wsh-server` does (no channel opens before authentication), and the client-side conversation that drives it.

```js
import assert from 'node:assert/strict';
import {
  frameEncode, FrameDecoder,
  MSG, msgName, CHANNEL_KIND, AUTH_METHOD,
  hello, serverHello, challenge, auth, authOk, authFail,
  open, openOk, sessionData, exit,
  generateKeyPair, generateNonce, signChallenge, exportPublicKeyRaw,
  importPublicKeyRaw, verifyChallenge, fingerprint,
} from '@johnhenry/wsh';

// ── A tiny in-process "server" that speaks real wsh wire frames ────────
function makeServer(sendToClient, authorizedFingerprints) {
  const decoder = new FrameDecoder();
  const state = { sessionId: 'sess-demo', nonce: null, username: '', authed: false };
  const send = (msg) => sendToClient(frameEncode(msg));

  return async (chunk) => {
    for (const msg of decoder.feed(chunk)) {
      switch (msg.type) {
        case MSG.HELLO: {
          state.nonce = generateNonce();
          state.username = msg.username;
          send(serverHello({ sessionId: state.sessionId, features: ['exec'] }));
          send(challenge({ nonce: state.nonce, sessionId: state.sessionId }));
          break;
        }
        case MSG.AUTH: {
          const fp = await fingerprint(msg.public_key);
          const key = await importPublicKeyRaw(msg.public_key);
          const ok = authorizedFingerprints.has(fp) &&
            await verifyChallenge(key, msg.signature, state.sessionId, state.nonce, { username: state.username });
          if (ok) {
            state.authed = true;
            send(authOk({ sessionId: state.sessionId, token: crypto.getRandomValues(new Uint8Array(32)), ttl: 3600 }));
          } else {
            send(authFail({ reason: 'signature or key rejected' }));
          }
          break;
        }
        case MSG.OPEN: {
          assert.equal(msg.kind, CHANNEL_KIND.EXEC);
          send(openOk({ channelId: 1, dataMode: 'virtual' }));
          const output = `hello from ${msg.command}\n`;
          send(sessionData({ channelId: 1, data: new TextEncoder().encode(output) }));
          send(exit({ channelId: 1, code: 0 }));
          break;
        }
      }
    }
  };
}

// ── Wire a client and the server together over plain callbacks ─────────
// (a real transport is a WebSocket/WebTransport stream; here it's a
// function call, but the bytes crossing it are identical either way)
const clientDecoder = new FrameDecoder();
const fromServer = [];
let serverIngest;
const clientSend = (msg) => serverIngest(frameEncode(msg));

const { publicKey, privateKey } = await generateKeyPair();
const clientFp = await fingerprint(await exportPublicKeyRaw(publicKey));
serverIngest = makeServer((bytes) => fromServer.push(...clientDecoder.feed(bytes)), new Set([clientFp]));

const nextFromServer = async (type) => {
  while (fromServer.length === 0) await new Promise((r) => setTimeout(r, 1));
  const msg = fromServer.shift();
  assert.equal(msg.type, type, `expected ${msgName(type)}, got ${msgName(msg.type)}`);
  return msg;
};

// ── The conversation: HELLO → CHALLENGE → AUTH → OPEN(exec) → EXIT ─────
await clientSend(hello({ username: 'demo', authMethod: AUTH_METHOD.PUBKEY }));
await nextFromServer(MSG.SERVER_HELLO);
const chal = await nextFromServer(MSG.CHALLENGE);

const { signature, publicKeyRaw } = await signChallenge(privateKey, publicKey, chal.session_id, chal.nonce, { username: 'demo' });
await clientSend(auth({ method: AUTH_METHOD.PUBKEY, signature, publicKey: publicKeyRaw }));
const ok = await nextFromServer(MSG.AUTH_OK);
console.log(`authenticated: session ${ok.session_id}`);

await clientSend(open({ kind: CHANNEL_KIND.EXEC, command: 'uname', cols: 80, rows: 24 }));
await nextFromServer(MSG.OPEN_OK);
const data = await nextFromServer(MSG.SESSION_DATA);
const done = await nextFromServer(MSG.EXIT);

console.log(`exec output: ${new TextDecoder().decode(data.data)}`.trim());
console.log(`exit code: ${done.code}`);
```

## 3. Run it

```sh
node exec-demo.mjs
```

You should see:

```
authenticated: session sess-demo
exec output: hello from uname
exit code: 0
```

## What just happened

- `generateKeyPair()` creates a real Ed25519 keypair via Web Crypto. The client never sends its private key anywhere — it signs a **transcript** (`signChallenge`, binding the session id, the nonce, and the username) and the server verifies that signature against the public key it received (`verifyChallenge`), the same challenge-response shape SSH pubkey auth uses.
- Every message — `hello`, `serverHello`, `challenge`, `auth`, `authOk`, `open`, `openOk`, `sessionData`, `exit` — is a real wsh protocol message, and `frameEncode`/`FrameDecoder` are the actual length-prefixed CBOR framing a live transport carries. Nothing here is a fake or simplified protocol; only the transport (a function call instead of a socket) is swapped out.
- The server enforces the spec's ordering for real: it only accepts `OPEN` after `state.authed` is `true`. Try sending `open(...)` before the `HELLO`/`AUTH` exchange and it's refused (see `wsh`'s own `examples/03-handshake-to-exec-over-in-process-pipe.mjs` for that refusal shown explicitly).

## Where to go next

- [wsh overview](/wsh/) and [Guide](/wsh/guide/) — the higher-level `WshClient`/`WshSession` API (`client.connect()`, `client.openSession()`, `WshClient.exec()`) that wraps this protocol for a real WebSocket/WebTransport connection to an actual server, instead of hand-driving frames like this tutorial does.
- [API](/wsh/api/) — every export, grouped.
- `wsh`'s own [`examples/`](https://github.com/johnhenry/wsh/tree/main/examples) — `01` shows frames surviving a fragmented transport, `02` shows a tampered challenge failing authentication, `04` shows session recording/replay, and `05` shows remote MCP tools called through the bridge.
