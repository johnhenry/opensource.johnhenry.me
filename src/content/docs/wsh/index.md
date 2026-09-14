---
title: "wsh"
description: "Browser-native remote command execution over WebTransport and WebSocket, with Ed25519 authentication and a QMux-multiplexed wire."
---

**`@johnhenry/wsh`** ("Web Shell") is a browser-native remote command
execution client: open PTY and exec sessions on a remote host from a web page
or Node.js, authenticated with Ed25519 keys, over either WebTransport or
WebSocket with an identical API. It speaks a compact CBOR wire protocol with
97 message types, and includes file transfer (plus structured `sftp`-style
listing), session recording (asciicast v2), a remote-MCP bridge, and reverse
(peer-accept) mode.

Two things distinguish the current releases. The WebSocket transport
multiplexes with **QMux** (draft-ietf-quic-qmux-02) — real QUIC-v1 frames
with windowed flow control and backpressure, not an ad-hoc mux — and the
primitives are exported so alternate servers can speak the same framing. And
the security story runs deeper than the handshake: auth signs a transcript
that binds the username, reverse-mode peer registrations are self-signed and
verifiable, session traffic can be sealed end-to-end with a hybrid
post-quantum (X25519+ML-KEM-768) key exchange feeding real AES-256-GCM frame
encryption (`session.enableE2E(sharedSecret, { role })` — see the
[guide](/wsh/guide/)), and a JS `WshKnownHosts` store gives trust-on-first-use
host-identity verification.

A parallel **Rust implementation** (`crates/`: `wsh-core`, `wsh-client`,
`wsh-cli`, `wsh-server`) speaks the same wire protocol and ships a `wsh`
CLI binary (`wsh connect`/`scp`/`sftp`/`ls`/`reverse`/`agent`/`copy-id`) —
see the [repo README](https://github.com/johnhenry/wsh#readme) for its
capability matrix against the JS client; it isn't covered on this page yet.

> Previously published as `wsh-upon-star` (last release 0.1.1, now deprecated),
> in the repo `johnhenry/wsh-upon-star`. Renamed to `@johnhenry/wsh` and
> restarted at 0.0.0 on import into the @johnhenry family. The restart was a
> new name and era, not a maturity signal — and the seventeen releases since
> (0.17.0 at this writing) have reworked auth, the mux, file transfer, session
> resumption, and real E2E frame encryption well past what the old name ever
> shipped.

## Install

```sh
npm install @johnhenry/wsh
```

Requires Node.js 24+ or a browser with Web Crypto Ed25519 support. WebTransport
needs Chrome/Edge 97+ or Firefox 114+; the WebSocket transport works
everywhere and presents the same API. The library has zero required runtime
dependencies; for the hybrid post-quantum key exchange it prefers native
WebCrypto ML-KEM-768 (Node 24.7+, some browsers) and falls back to the
optional `@noble/post-quantum` dependency only where native support is
absent.

## Two transports, one API

The single most important thing to know: **you choose the transport, the rest
of your code doesn't change.** WebTransport gives you native multiplexed
streams; WebSocket multiplexes QMux streams over one connection. Same
client, same sessions, same methods — only the `transport` option differs.

```js
import { WshClient, generateKeyPair } from '@johnhenry/wsh';

const keyPair = await generateKeyPair(true);
const client = new WshClient();
await client.connect('wss://shell.example.com', {
  username: 'alice',
  keyPair,
  transport: 'ws', // or 'webtransport' — nothing else changes
});
```

## The pages here

- [Guide](/wsh/guide/) — connect, PTY sessions, one-shot exec, detach/resume, keys
- [API](/wsh/api/) — every export, grouped

Source: [github.com/johnhenry/wsh](https://github.com/johnhenry/wsh) ·
Runnable examples in [`examples/`](https://github.com/johnhenry/wsh/tree/main/examples) —
each named for the behavior it proves (frames surviving a fragmented
transport, a tampered challenge failing auth, …). The
protocol is specified machine-readably in the repo's `spec/wsh-v1.yaml`, from
which the message constants are code-generated — the wire format is a contract,
not folklore.
