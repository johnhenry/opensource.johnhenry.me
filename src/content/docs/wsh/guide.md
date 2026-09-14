---
title: "Guide"
description: "Connect, open a PTY session, run one-shot commands, detach and resume, and manage keys."
---

## A full PTY session

```js
import { WshClient, generateKeyPair } from '@johnhenry/wsh';

const keyPair = await generateKeyPair(true);

const client = new WshClient();
await client.connect('wss://shell.example.com', {
  username: 'alice',
  keyPair,
  transport: 'ws',
});

const session = await client.openSession({
  type: 'pty',
  command: '/bin/bash',
  cols: 120,
  rows: 40,
});

// Output arrives as bytes — decode it yourself. wsh does not assume UTF-8,
// because a PTY carries control sequences and raw bytes, not just text.
session.onData = (data) => process.stdout.write(new TextDecoder().decode(data));

await session.write('echo hello world\n');
await session.resize(160, 50);   // terminal size is part of the session state
await session.close();
await client.disconnect();
```

Sessions can be opened, attached, resumed, and detached — a detached
session keeps running on the host, and you (or another client) can reattach to
it later. That's the difference between wsh and a raw socket: the session is a
first-class, resumable object, not just a pipe.

`session.onClose` now receives a `closeReason` (`Error | null`) — `null` for
a clean close, an `Error` when the session ended abnormally, so a client can
distinguish "you closed it" from "it died" without guessing from side effects.

## Detach, resume, attach

When a PTY or exec session is opened, the server mints a session id and a
session-scoped resume token, exposed as `session.sessionId` and
`session.resumeToken`. Those two values are the whole story of coming back:

```js
const { sessionId, resumeToken } = session;

await client.detach(sessionId);   // release it; it keeps running host-side

// Later — possibly from a brand-new connection:
await client.resumeSession(sessionId, resumeToken);
```

The distinction between the two reattachment calls is *who you are*:

- `resumeSession(sessionId, token)` — the token is **required**. Resume is
  for the original opener coming back and proving it holds the exact
  credential minted at open time.
- `attachSession(sessionId, { readOnly, token })` — the token is
  **optional**. Attach also works for a principal who owns the session or
  was granted access via `grantSessionAccess(sessionId, principal,
  permissions)` — such a principal never held the token, so the server
  accepts ownership or an ACL grant instead. Omit the token for that
  common case.

`listRemoteSessions()` asks the server which sessions your key owns or has
been granted (distinct from the purely local `listSessions()`), and
`revokeSessionAccess()` undoes a grant.

## One-shot exec

When you don't need an interactive terminal, `WshClient.exec` is a static
convenience that connects, runs one command, collects output, and disconnects:

```js
const { stdout, exitCode } = await WshClient.exec(
  'wss://shell.example.com',
  'ls -la /tmp',
  { username: 'alice', keyPair },
);

console.log(new TextDecoder().decode(stdout), 'exit', exitCode);
```

`stdout` is bytes here too — same reason.

## Keys and authentication

Auth is Ed25519 challenge-response over the Web Crypto API, and the key
material is the security boundary — treat it accordingly:

- `generateKeyPair(extractable)` — pass `true` only if you need to export or
  back the key up; `false` keeps the private key non-extractable in the
  browser, which is the safer default for a long-lived key.
- `WshKeyStore` persists keys in IndexedDB with an **OPFS encrypted backup**
  (PBKDF2 + AES-256-GCM). The backup is encrypted at rest; the passphrase is
  never stored.
- `fingerprint(publicKey)` gives a SHA-256 hex fingerprint — the thing to
  show a user or pin, not the raw key.
- `isEd25519Supported()` checks Web Crypto Ed25519 availability before you
  try to generate a key — useful for a clean unsupported-browser message
  instead of a `generateKeyPair()` throw.

The handshake signs a transcript, not just a nonce — and the transcript binds
the username and session id, so a signature captured on one connection cannot
be replayed against another, or presented under a different identity.

`WshClient.addAuthorizedKey()` sends a real `AuthorizedKeyAdd` protocol
message (replacing the old `wsh copy-id` shell-script approach) and resolves
with the server's `AuthorizedKeyResult` — the same authorization step, now a
first-class client call instead of a side-channel script.

## Reverse mode and verified peers

In reverse mode a peer registers with a relay and accepts incoming
connections. Registrations are **self-signed peer records** (the libp2p
signed-envelope pattern): `connectReverse()` signs your record
automatically, and `listPeers()` verifies each returned entry against the
peer's own key, adding a `verified: boolean` to every result. A relay that
tampers with or forges a registration produces `verified: false` — you're
trusting the peer's signature, not the relay's word.

## End-to-end frame encryption

`initiateE2E(sessionId)` performs an ephemeral X25519 exchange and derives an
AES-256-GCM key. Pass `'X25519+ML-KEM-768'` to get the hybrid post-quantum
mode — native WebCrypto ML-KEM-768 where available (Node 24.7+), the
optional `@noble/post-quantum` package elsewhere — which combines both
secrets via HKDF-SHA256 and falls back to classical automatically if the
peer doesn't support it (check the returned `hybrid` flag).

The derived key is genuinely wired to real traffic encryption:
`session.enableE2E(sharedSecret, { role })` seals every `write()`'s output
into an `EncryptedFrame` (AES-256-GCM, an 8-byte monotonic counter plus a
4-byte per-role tag as the nonce, `session_id` bound as AEAD associated
data) and transparently opens incoming sealed frames before they reach
`onData` — for both virtual-mode sessions and stream-mode (PTY/exec)
sessions, with an optional `{ coalesce }` option tuning `WriteCoalescer`'s
batching profile (latency-first for a PTY, throughput-first for exec).
`role` matters: `openFrame()` checks the expected counterpart role tag, so
the two ends of a session must pass opposite roles (e.g. `'client'`/
`'server'`) or frames won't open.

## Trust-on-first-use host verification

`WshKnownHosts` is a small JS host-identity store (TOFU, matching
`ssh_known_hosts`'s model): record a host's identity fingerprint on first
connect, then detect if a later connection presents a different one — the
same signal SSH gives you against a changed or spoofed host. Server-side
population of `ServerHello.host_fingerprint` isn't shipped by any
`wsh-server` release yet, so this store is ready but has no live fingerprint
to check against until the server side catches up.

## Beyond the basics

The same client also exposes file transfer (`WshFileTransfer` and
`client.upload`/`download` — `FileChunk` control messages in 64KB chunks, so
transfers work identically on stream-backed and virtual channels) with
structured directory listing (`client.list()` returns typed
`FileResult.metadata.entries: FileEntry[]`, backing the CLI's `sftp`/`ls`
commands on both clients), session recording and playback (`SessionRecorder`
/ `SessionPlayer`, asciicast v2), and a remote-MCP bridge (`WshMcpBridge`, to
discover and invoke MCP tools over the control channel — calls now carry a
`call_id` for correlating concurrent in-flight calls). See the
[API](/wsh/api/) for the full surface.
