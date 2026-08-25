---
title: "Guide"
description: "Connect, open a PTY session, run one-shot commands, and manage keys."
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

Sessions can be opened, attached, resumed, detached, and renamed — a detached
session keeps running on the host, and you (or another client) can reattach to
it later. That's the difference between wsh and a raw socket: the session is a
first-class, resumable object, not just a pipe.

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

The handshake signs a transcript, not just a nonce, so a signature captured on
one connection cannot be replayed against another.

## Beyond the basics

The same client also exposes file transfer (`WshFileTransfer`, scp-like over
dedicated 64KB-chunk streams), session recording and playback
(`SessionRecorder` / `SessionPlayer`, asciicast v2), a remote-MCP bridge
(`WshMcpBridge`, to discover and invoke MCP tools over the control channel),
and reverse mode (register as a peer through a relay and accept incoming
connections). See the [API](/wsh/api/) for the full surface.
