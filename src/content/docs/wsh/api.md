---
title: "API"
description: "Every export, grouped: client and sessions, transports, QMux, utilities, and the wire protocol."
---

All exports come from the package root:

```js
import { WshClient, generateKeyPair, MSG } from '@johnhenry/wsh';
```

## Client and sessions

| Export | What it is |
| --- | --- |
| `WshClient` | Full-lifecycle client: connect, auth, sessions, reverse mode, MCP. `WshClient.exec(url, cmd, opts)` is the one-shot static. |
| `WshSession` | A single PTY or exec channel — `write`, `resize`, `signal`, `close`, the `onData` byte callback, and `sessionId`/`resumeToken` getters (the credentials for coming back later). |
| Session lifecycle | open · attach · resume · detach. `detach(id)` leaves a session running host-side; `resumeSession(id, token)` requires the resume token (the original opener returning); `attachSession(id, opts)` takes an optional token — ownership or a `grantSessionAccess` ACL grant suffices without one. |
| Session management | `listRemoteSessions()` (server round trip, distinct from the local `listSessions()`), `grantSessionAccess(id, principal, permissions)`, `revokeSessionAccess(id, principal, reason)`. |
| Reverse mode | `connectReverse()` (signs your peer record automatically), `listPeers()` (each entry gains a computed `verified: boolean`), `reverseConnect()`, `trustRelayPeer()` / `untrustRelayPeer()` — relay-forwarded traffic is only delivered from peers you've accepted. |
| `initiateE2E(sessionId, algorithm)` | Ephemeral key exchange deriving an AES-256-GCM key — `'X25519'` (default) or hybrid `'X25519+ML-KEM-768'` (native WebCrypto ML-KEM on Node 24.7+, optional `@noble/post-quantum` fallback; check the returned `hybrid` flag). Experimental: the key is not yet wired to `EncryptedFrame` encryption. |

## Transports

| Export | What it is |
| --- | --- |
| `WshTransport` | Abstract base — implement it for a custom transport. |
| `WebTransportTransport` | Native WebTransport streams. |
| `WebSocketTransport` | WebSocket carrying QMux-multiplexed streams — same API as the above. |

Pick a transport with the `transport` option on `connect`; the session API is
identical regardless. (`WS_FRAME_TYPE`, the pre-QMux mux's frame bytes, is
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
| `WshFileTransfer` | Upload/download via `FileChunk` control messages, 64KB chunks — works on stream-backed and virtual channels alike. |
| `WshMcpBridge` | Discover and invoke remote MCP tools over the control channel. |
| `SessionRecorder` / `SessionPlayer` | Record and replay PTY I/O with original timing (asciicast v2). |
| `WshVirtualSessionBackend`, `normalizeSessionData` | Building blocks for hosting sessions. |
| `generateKeyPair(extractable)` | Create an Ed25519 pair via Web Crypto. |
| `signChallenge()` | Build the transcript (which binds username and session id) and sign it for the auth handshake. |
| `buildPeerRecordTranscript` / `signPeerRecord` / `verifyPeerRecord` | The signed-peer-record primitives behind reverse-mode registration — a distinct signing domain from the auth challenge. |
| `fingerprint(publicKey)` | SHA-256 hex fingerprint of a public key. |
| `dispatchSerially` / `SerialQueue` | The ordering-safe dispatch primitives both transports use — for anyone reimplementing the wire in another runtime. |

## Wire protocol

The protocol is the part most libraries leave implicit; wsh makes it an
explicit, code-generated contract. These are the primitives, should you need
to speak it directly or debug a frame:

| Export | What it is |
| --- | --- |
| `MSG` | 90+ message-type constants (hex opcodes) — handshake, channel, gateway, guest sharing, compression, copilot, policy, … |
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
