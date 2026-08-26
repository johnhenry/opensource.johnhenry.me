---
title: "API"
description: "Every export, grouped: client and sessions, transports, utilities, and the wire protocol."
---

All exports come from the package root:

```js
import { WshClient, generateKeyPair, MSG } from '@johnhenry/wsh';
```

## Client and sessions

| Export | What it is |
| --- | --- |
| `WshClient` | Full-lifecycle client: connect, auth, sessions, reverse mode, MCP. `WshClient.exec(url, cmd, opts)` is the one-shot static. |
| `WshSession` | A single PTY or exec channel — `write`, `resize`, `signal`, `close`, and the `onData` byte callback. |
| `WshSession`'s lifecycle | open · attach · resume · detach · rename. A detached session keeps running host-side. |

## Transports

| Export | What it is |
| --- | --- |
| `WshTransport` | Abstract base — implement it for a custom transport. |
| `WebTransportTransport` | Native WebTransport streams. |
| `WebSocketTransport` | WebSocket with multiplexed virtual streams — same API as the above. |

Pick a transport with the `transport` option on `connect`; the session API is
identical regardless.

## Utilities

| Export | What it is |
| --- | --- |
| `WshKeyStore` | Ed25519 key management — IndexedDB storage, OPFS encrypted backup (PBKDF2 + AES-256-GCM). |
| `WshFileTransfer` | Upload/download over dedicated streams, 64KB chunks. |
| `WshMcpBridge` | Discover and invoke remote MCP tools over the control channel. |
| `SessionRecorder` / `SessionPlayer` | Record and replay PTY I/O with original timing (asciicast v2). |
| `WshVirtualSessionBackend`, `normalizeSessionData` | Building blocks for hosting sessions. |
| `generateKeyPair(extractable)` | Create an Ed25519 pair via Web Crypto. |
| `signChallenge()` | Build the transcript and sign it for the auth handshake. |
| `fingerprint(publicKey)` | SHA-256 hex fingerprint of a public key. |

## Wire protocol

The protocol is the part most libraries leave implicit; wsh makes it an
explicit, code-generated contract. These are the primitives, should you need
to speak it directly or debug a frame:

| Export | What it is |
| --- | --- |
| `MSG` | 80+ message-type constants (hex opcodes) — handshake, channel, gateway, guest sharing, compression, copilot, policy, … |
| `CHANNEL_KIND` | `pty`, `exec`, `meta`, `file`, `tcp`, `udp`, `job`. |
| `AUTH_METHOD` | `pubkey`, `password`. |
| `cborEncode` / `cborDecode` | The CBOR codec (maps, arrays, strings, ints, bytes, bools, null, floats). |
| `frameEncode` / `FrameDecoder` | 4-byte big-endian length-prefixed framing. |

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
mode, gateway/TCP/UDP proxying, guest sharing, compression, file transfer,
policy. The full map is `MSG` at runtime and `spec/wsh-v1.yaml` in the repo.

The constants in `MSG` are generated from `spec/wsh-v1.yaml` in the repo, not
hand-maintained — so the documented opcodes and the shipped ones cannot drift.
