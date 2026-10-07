---
title: "API"
description: "Every export, grouped: client and sessions, transports, QMux, utilities, the wire protocol, and the @johnhenry/wsh/server subpath."
---

Everything below comes from the package root, which is browser-safe:

```js
import { WshClient, generateKeyPair, MSG } from '@johnhenry/wsh';
```

The Node host lives on its own subpath and is listed at the
[end of this page](#node-server-johnhenrywshserver).

## Client and sessions

| Export | What it is |
| --- | --- |
| `WshClient` | Full-lifecycle client: connect, auth, sessions, files, reverse mode, MCP. `WshClient.exec(url, cmd, opts)` is the one-shot static; it writes a one-byte primer only against hosts that do not advertise `stream-announce` (`primer: false` never sends it). |
| `WshSession` | A single PTY or exec channel — `write`, `resize`, `signal`, `close`, the `onData` byte callback, `onClose(closeReason)` (`Error \| null` — distinguishes a clean close from an abnormal one), `sessionId`/`resumeToken` getters (the credentials for coming back later), and `seq`, the cumulative count of output bytes received. |
| Session lifecycle | open · attach · resume · detach. `detach(id)` leaves a session running host-side (a graceful disconnect or `close()` by the owner ends it); `resumeSession(id, token, { lastSeq })` requires the resume token (the original opener returning) and replays only output after `lastSeq`; `attachSession(id, opts)` takes an optional token — ownership or a `grantSessionAccess` ACL grant suffices without one. Both return the `Presence` reply with a non-enumerable `session` (the re-attached `WshSession`). |
| Session management | `listRemoteSessions()` (server round trip, distinct from the local `listSessions()`), `grantSessionAccess(id, principal, permissions)`, `revokeSessionAccess(id, principal, reason)`. |
| Files | `fileList(path)`, `fileWrite(path, data, offset?)`, `fileRename(from, to)`, `fileRemove(path)` — each resolves with a `FileResult`-shaped object (`success`, `entries`, `error_message`). `fileWrite` and `fileRename` use spec-conformant `FileOp` + `FileChunk` frames and need the host to advertise `file-write` / `file-rename`; the client throws rather than sending to a host that does not. `upload()` / `download()` move whole files. |
| Host key | `connect(url, { expectHostKey, knownHosts, trustOnFirstUse, hostLabel, onHostKey })`, then `client.hostKey` (`{ fingerprint, publicKey, openssh, status }`) and `client.onHostKey`. Failures throw `HostKeyError` with a `code` (`HOST_KEY_MISSING`, `_INVALID`, `_MISMATCH`, `_UNKNOWN`, `_REJECTED`) before any credential is sent. `WshClient.exec()` and `connectReverse()` take the same options. |
| Reverse mode | `connectReverse()` (signs your peer record automatically), `listPeers()` (each entry gains a computed `verified: boolean`), `reverseConnect(fingerprint)` (resolves with `ReverseAccept` or `ReverseReject`; also exposed as `reverseConnectTo`), `trustRelayPeer()` / `untrustRelayPeer()` — relay-forwarded traffic is only delivered from peers you've accepted. |
| `initiateE2E(sessionId, algorithm)` | Ephemeral key exchange deriving an AES-256-GCM key — `'X25519'` (default) or hybrid `'X25519+ML-KEM-768'` (native WebCrypto ML-KEM on Node 24.7+, optional `@noble/post-quantum` fallback; check the returned `hybrid` flag). |
| `session.enableE2E(sharedSecret, { role, coalesce })` | Wires the derived key to real traffic encryption: seals `write()` output into `EncryptedFrame` (AES-256-GCM) and transparently opens incoming sealed frames before `onData` — works on both virtual-mode and stream-mode (PTY/exec) sessions. `role` must be the opposite of the peer's; `coalesce` tunes `WriteCoalescer`'s batching profile. |
| `WshClient.addAuthorizedKey()` | Sends an `AuthorizedKeyAdd` protocol message and resolves with `AuthorizedKeyResult` — replaces the old `wsh copy-id` shell-script approach with a first-class call. |

## Transports

| Export | What it is |
| --- | --- |
| `WshTransport` | Abstract base — implement it for a custom transport. |
| `WebTransportTransport` | Native WebTransport streams. Takes `serverCertificateHashes` (and any other `WebTransport` constructor option) to pin a self-signed certificate. |
| `WebSocketTransport` | WebSocket carrying QMux-multiplexed streams — same API as the above. |

Pick a transport with the `transport` option on `connect` (`'ws'` or `'wt'`);
the session API is identical regardless. To reach a server with a self-signed
certificate over WebTransport, pass
`webTransport: { serverCertificateHashes: [...] }` — `parseCertificateHash()`
decodes a digest given as hex, base64, bytes, or the `openssl x509
-fingerprint` line, and `normalizeWebTransportOptions()` builds the options
dictionary from loose input. Pinning applies to the WebTransport rung only;
a WebSocket fallback is checked against certificate authorities as usual. (`WS_FRAME_TYPE`, the pre-QMux mux's frame bytes, is
still exported but deprecated and unused.)

## QMux

The WebSocket transport's multiplexing layer is QMux
(draft-ietf-quic-qmux-02): QUIC-v1 frames — STREAM, RESET_STREAM,
flow-control, CONNECTION_CLOSE, plus RESET_STREAM_AT — over the reliable,
ordered WebSocket byte stream, with real windowed backpressure. The
primitives are exported so an alternate server can speak the framing without
reimplementing it:

| Export | What it is |
| --- | --- |
| `QMuxConnection` | The stream state machine + flow control — one per connection. |
| `QMUX_DEFAULTS`, `QMUX_ERROR_CODE`, `QMUX_STREAM_INITIATOR` | Transport parameters, error codes, and initiator constants. |
| `firstBidiStreamId` / `nextBidiStreamId` / `isClientInitiated` / `isBidirectional` | Stream-id arithmetic helpers. |

## Utilities

| Export | What it is |
| --- | --- |
| `WshKeyStore` | Ed25519 key management — IndexedDB storage, OPFS encrypted backup (PBKDF2 + AES-256-GCM). |
| `isEd25519Supported()` | Checks Web Crypto Ed25519 availability before generating a key — a clean unsupported-browser check instead of a `generateKeyPair()` throw. |
| `WshKnownHosts` | JS trust-on-first-use host-identity store (the `ssh_known_hosts` model): `verifyHost`, `addHost`, `removeHost`, `list`. Pass it as `knownHosts` to `connect()`. `@johnhenry/wsh/server` populates `ServerHello.host_fingerprint` with a signed proof, so there is a live key to check; the Rust `wsh-server` still advertises none. Defaults to `localStorage` — pass `{ storage }` for a file-backed store in Node. |
| `HostKeyError` | Thrown by `connect()` when a host key fails the caller's policy; carries `code`, and `expected` / `actual` fingerprints where relevant. |
| `WshFileTransfer` | Upload/download via `FileChunk` control messages, 64KB chunks — works on stream-backed and virtual channels alike. `list()` returns decoded entries; `client.fileList()` resolves with the raw `FileResult` whose `entries` is a typed `FileEntry[]`, backing the CLI's `sftp`/`ls` commands on both clients. |
| `WshMcpBridge` | Discover and invoke remote MCP tools over the control channel — calls carry a `call_id` for correlating concurrent in-flight calls. |
| `SessionRecorder` / `SessionPlayer` | Record and replay PTY I/O with original timing. The recording is wsh's own JSON schema, not asciicast v2: it also captures `open` / `exit` lifecycle events that asciicast v2 cannot represent. |
| `WshVirtualSessionBackend`, `normalizeSessionData` | Building blocks for hosting sessions. |
| `generateKeyPair(extractable)` | Create an Ed25519 pair via Web Crypto. |
| `sign(privateKey, message)` / `verify(publicKey, signature, message)` | Raw Ed25519 sign and verify. The positional order `(publicKey, signature, data)` is WebCrypto's, and is the one canonical form across wsh, raijin and browsermesh. |
| `signChallenge()` / `verifyChallenge(publicKey, signature, sessionId, nonce, { username })` | Build the transcript (which binds username and session id) and sign it for the auth handshake, and verify one on the host side. |
| `buildPeerRecordTranscript` / `signPeerRecord` / `verifyPeerRecord` | The signed-peer-record primitives behind reverse-mode registration — a distinct signing domain from the auth challenge. |
| `fingerprint(publicKeyRaw)` | SHA-256 hex fingerprint of a raw public key. |
| `dispatchSerially` / `SerialQueue` | The ordering-safe dispatch primitives both transports use — for anyone reimplementing the wire in another runtime. |

## Wire protocol

The protocol is the part most libraries leave implicit; wsh makes it an
explicit, code-generated contract. These are the primitives, should you need
to speak it directly or debug a frame:

| Export | What it is |
| --- | --- |
| `MSG` | 97 message-type constants (hex opcodes) — handshake, channel, gateway, guest sharing, compression, copilot, policy, … |
| `CHANNEL_KIND` | `pty`, `exec`, `meta`, `file`, `tcp`, `udp`, `job`. |
| `AUTH_METHOD` | `pubkey`, `password`. |
| `cborEncode` / `cborDecode` | The CBOR codec (maps, arrays, strings, ints, bytes, bools, null, floats). |
| `frameEncode` / `FrameDecoder` | 4-byte big-endian length-prefixed framing (`FrameSizeError` on oversized claims). |
| `RELAY_FORWARDABLE` / `isRelayForwardable` | The generated allowlist of message types a relay may forward — single source of truth, shared with the Rust server. |

### The opcodes you'll actually see

The opcode space is organized by prefix, and every ordinary session is built
from the same first page of it. These are the codes worth recognizing in a
frame dump:

| Range | Concern | Opcodes |
| --- | --- | --- |
| `0x01`–`0x07` | Handshake & auth | `Hello 0x01` → `ServerHello 0x02` → `Challenge 0x03` → `Auth 0x05` → `AuthOk 0x06` / `AuthFail 0x07` (`AuthMethods 0x04`) |
| `0x10`–`0x17` | Channel lifecycle | `Open 0x10` → `OpenOk 0x11` / `OpenFail 0x12`, then `Resize 0x13`, `Signal 0x14`, `Exit 0x15`, `Close 0x16`, `SessionData 0x17` |
| `0x20`–`0x22` | Control | `Error 0x20`, `Ping 0x21`, `Pong 0x22` |
| `0x30`–`0x38` | Session management | `Attach 0x30`, `Resume 0x31`, `Rename 0x32`, `IdleWarning 0x33`, `Shutdown 0x34`, `Snapshot 0x35`, `Presence 0x36`, `ControlChanged 0x37`, `Metrics 0x38` |

Higher prefixes carry the specialized subsystems — MCP bridging, reverse
mode and relay forwarding, gateway/TCP/UDP proxying, guest sharing,
compression, file transfer, policy, E2E key exchange. The full map is `MSG`
at runtime and `spec/wsh-v1.yaml` in the repo.

The constants in `MSG` are generated from `spec/wsh-v1.yaml` in the repo, not
hand-maintained — so the documented opcodes and the shipped ones cannot drift.

## Node server (`@johnhenry/wsh/server`)

A separate, Node-only subpath; the root never imports it. It needs the
optional peer `ws`, and `@fails-components/webtransport` plus
`@fails-components/webtransport-transport-http3-quiche` only when the
`webTransport` option is used. See [Node server](/wsh/server/) for worked
examples.

```js
import { createWshServer, createReverseHost, generateSelfSignedCertificate, parseAuthorizedKeys } from '@johnhenry/wsh/server';
```

| Export | What it is |
| --- | --- |
| `createWshServer(options)` | Returns `{ listen(), close(), address(), webTransport(), hostKey(), peerFingerprints() }`. Everything that touches the machine is off unless passed, and with no `auth` every connection is refused. |
| `options.auth` | `{ authorizedKeys, authorize, password, rateLimit }`, or just an `authorize` function. `password` is `(username, password) => boolean`; `rateLimit` is `{ maxFailures, windowMs, lockoutMs, failureDelayMs, key }`. |
| `options.exec` | `true` (run via `/bin/sh`), `{ cwd, env, shell, timeoutMs, clientEnv, run }`, or a custom runner `(command, io) => Promise<exitCode>` for a host with no shell. |
| `options.pty` | `{ spawn, shell, cwd, env, term }` — bring your own `node-pty` `spawn`. |
| `options.fs` | `{ root, readOnly, maxFileBytes }` — list, stat, read, write, rename, mkdir, remove, upload and download, confined to `root` (`..`, absolute paths and escaping symlinks refused). |
| `options.mcp` | `{ tools, client, authorize, maxConcurrent, timeoutMs }` — tools with JSON-Schema-validated arguments; `client` proxies an MCP SDK client's tools. |
| `options.sessions` | `true` or `{ detachTtlMs, maxDetached, ringBytes, sessionSecret }` — sessions outlive their connection; backs attach, resume, detach and `listRemoteSessions()`. |
| `options.hostKey` | `{ file }`, a `CryptoKeyPair`, or `true` — advertise a signed Ed25519 host identity; read it with `server.hostKey()`. |
| `options.webTransport` | `{ port, host, path, cert, privKey, selfSigned, secret }` — also listen over HTTP/3. `server.webTransport()` returns `{ url, certificateHash, certificateHashHex, notAfter, ... }`. |
| `options.relay` | `{ canRegister, canConnect, maxPeers, connectTimeoutMs }` — act as a relay; default deny. |
| `createReverseHost(options)` | A host that dials out to a relay: `{ url, username, keyPair, accept, exec, pty, fs, mcp, reconnect }`; returns `{ start(), close(), fingerprint, connected }`. |
| `generateSelfSignedCertificate({ hosts, validityDays })` | Dependency-free ECDSA P-256 certificate for `serverCertificateHashes`: `{ cert, privKey, hash, hashHex, notBefore, notAfter }`. |
| `parseAuthorizedKeys(text)` | `authorized_keys`-style text to raw 32-byte Ed25519 keys; malformed lines are skipped. |
| `STREAM_ANNOUNCE` | The `'stream-announce'` feature string the host advertises (also `STREAM_ANNOUNCE_FEATURE` and `MCP_CALL_ID_FEATURE` from the root). |
