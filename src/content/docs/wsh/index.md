---
title: "wsh"
description: "Browser-native remote command execution over WebTransport and WebSocket, with Ed25519 authentication."
---

**`@johnhenry/wsh`** ("Web Shell") is a browser-native remote command
execution client: open PTY and exec sessions on a remote host from a web page
or Node.js, authenticated with Ed25519 keys, over either WebTransport or
WebSocket with an identical API. It speaks a compact CBOR wire protocol with
80+ message types, and includes file transfer, session recording (asciicast
v2), a remote-MCP bridge, and reverse (peer-accept) mode.

> Previously published as `wsh-upon-star` (last release 0.1.1, now deprecated),
> in the repo `johnhenry/wsh-upon-star`. Renamed to `@johnhenry/wsh` and
> restarted at 0.0.0 on import into the @johnhenry family — a new name and era,
> not a maturity signal.

## Install

```sh
npm install @johnhenry/wsh
```

Requires Node.js 24+ or a browser with Web Crypto Ed25519 support. WebTransport
needs Chrome/Edge 97+ or Firefox 114+; the WebSocket transport works
everywhere and presents the same API.

## Two transports, one API

The single most important thing to know: **you choose the transport, the rest
of your code doesn't change.** WebTransport gives you native multiplexed
streams; WebSocket multiplexes virtual streams over one connection. Same
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

- [Guide](/wsh/guide/) — connect, PTY sessions, one-shot exec, keys
- [API](/wsh/api/) — every export, grouped

Source: [github.com/johnhenry/wsh](https://github.com/johnhenry/wsh). The
protocol is specified machine-readably in the repo's `spec/wsh-v1.yaml`, from
which the message constants are code-generated — the wire format is a contract,
not folklore.
