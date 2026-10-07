---
title: "Node server"
description: "Host the wsh protocol from Node with @johnhenry/wsh/server: WebSocket and WebTransport listeners, opt-in exec, pty, fs and MCP tools, resumable sessions, a pinnable host key, password auth, and relay/reverse mode."
---

The package root is a client and stays browser-safe. `@johnhenry/wsh/server` is
a separate subpath: a Node host for the same protocol, over WebSocket (QMux)
and, optionally, WebTransport. The root never imports it. It needs the
optional peer dependency `ws`:

```sh
npm install @johnhenry/wsh ws
```

Node.js 26 or newer is required, like the rest of the package.

## A minimal host

```js
import { createWshServer } from '@johnhenry/wsh/server';
import { readFileSync } from 'node:fs';

const server = createWshServer({
  host: '127.0.0.1',
  port: 4422,                                     // 0 = pick a free port
  auth: { authorizedKeys: readFileSync('authorized_keys', 'utf8') },  // ssh-ed25519 lines
  hostKey: { file: '/etc/wsh/host_key' },         // advertise a pinnable identity
  exec: true,                                     // opt in: run commands via /bin/sh
  fs: { root: '/srv/share', readOnly: false },    // opt in: file operations under one directory
});

const { port } = await server.listen();           // later: server.address(), await server.close()
```

The design rule is **everything that touches the machine is off unless you
pass it**, and with no `auth` every connection is refused. `exec`, `pty`,
`fs`, `mcp`, `sessions`, `relay` and `webTransport` are each opt-in options;
leaving one out means that capability does not exist on the host, not that it
is merely unconfigured.

`auth` is `{ authorizedKeys, authorize, password, rateLimit }`, or just an
`authorize` function. When both `authorizedKeys` and `authorize` are given, a
key has to be on the list and pass `authorize({ username, fingerprint,
publicKey })`. `parseAuthorizedKeys(text)` is exported if you want the raw
32-byte keys.

The stock client connects with no changes:

```js
import { WshClient, generateKeyPair } from '@johnhenry/wsh';

const keyPair = await generateKeyPair(true);
const { stdout, exitCode } = await WshClient.exec(
  'ws://127.0.0.1:4422',
  'uname -a',
  { username: 'alice', keyPair },
);
```

## exec and pty

`exec: true` runs each command with `/bin/sh`. Pass an options object for
`{ cwd, env, shell, timeoutMs, clientEnv }`, or a custom `run(command, io)`
function for a restricted host with no shell at all. A runner gets the user,
the requested environment, an abort signal, `write()`, and `onInput` /
`onInputEnd` / `onSignal` hooks, and resolves with the exit code:

```js
createWshServer({
  auth,
  exec: async (command, io) => {
    if (command !== 'date') {
      await io.write('only `date` is allowed\n');
      return 1;
    }
    await io.write(new Date().toISOString() + '\n');
    return 0;
  },
});
```

`pty` is bring-your-own: the package has no native dependency, so you hand it
`node-pty`'s `spawn` (or anything shaped like it):

```js
import * as nodePty from 'node-pty';

createWshServer({ auth, pty: { spawn: nodePty.spawn, shell: '/bin/bash' } });
```

## Files

`fs: { root, readOnly, maxFileBytes }` serves list, stat, read, write,
rename, mkdir and remove, plus upload and download, from one directory.
`root` confines every path: `..`, absolute paths and symlinks that point out
of it are refused, for `write` and `rename` (both paths) exactly as for
`read`.

On the client, `fileWrite(path, data, offset?)` and `fileRename(from, to)` are
real: the bytes and the destination ride spec-conformant `FileOp` plus
`FileChunk` frames. Without `offset`, `fileWrite` replaces the file; with one
it writes in place at that byte offset without truncating. `fileRename`
refuses to overwrite an existing destination. A failure comes back as
`success: false` with an `error_message`. The host advertises `file-write` /
`file-rename` in `ServerHello`, and the client throws instead of sending to a
host that does not.

```js
await client.fileWrite('todo.txt', 'ship it\n');   // creates or replaces
await client.fileRename('todo.txt', 'done.txt');
const listing = await client.fileList('/');
```

## Host key and trust on first use

With `hostKey`, the server has an Ed25519 identity and signs a proof of
possession into its `ServerHello`, so clients can pin it. `hostKey` is `{ file
}` (a PKCS#8 PEM, created mode 0600 on first start; use this), a
`CryptoKeyPair`, or `true` (a fresh key every start, for tests and demos).

```js
// server
await server.listen();
server.hostKey();   // { fingerprint, publicKey, openssh } -- publish this out of band

// client
import { WshClient, WshKnownHosts, HostKeyError } from '@johnhenry/wsh';

const client = new WshClient();
await client.connect(url, { username, keyPair, expectHostKey: fingerprint });  // pin; refuses on mismatch

// or trust on first use, remembered in a store:
await client.connect(url, {
  username, keyPair,
  knownHosts: new WshKnownHosts(),
  trustOnFirstUse: true,
});
client.hostKey;   // { fingerprint, publicKey, openssh, status: 'pinned' | 'known' | 'unknown' | 'unpinned' }
```

`expectHostKey` takes a hex fingerprint (a `sha256:` prefix is fine), a raw
32-byte key, or an `ssh-ed25519 AAAA...` line. With `knownHosts`, a changed
key is always refused and never overwrites the pin; an unseen host is refused
unless `trustOnFirstUse` is set or `onHostKey` accepts it. Refusals are
`HostKeyError` with a `code` of `HOST_KEY_MISSING`, `HOST_KEY_INVALID`,
`HOST_KEY_MISMATCH`, `HOST_KEY_UNKNOWN` or `HOST_KEY_REJECTED`, thrown before
any signature or password is sent. `WshClient.exec()` and `connectReverse()`
take the same options.

Two limits worth knowing. `WshKnownHosts` defaults to `localStorage`, which
in Node is not a persistent file store; pass `new WshKnownHosts({ storage })`
with a `getItem` / `setItem` / `removeItem` object you back with a file for a
real TOFU file. And the proof authenticates the `ServerHello`, not the byte
stream: over plain `ws://` an active attacker can relay a genuine hello and
then read or alter the rest. Pinning keeps you from talking to the wrong
host; confidentiality still needs `wss://` or a link you trust.

## Password auth

```js
createWshServer({
  auth: {
    password: async (username, password) => verifyAgainstYourHashes(username, password),
    // authorizedKeys / authorize may be given too: both methods are then served.
    rateLimit: { maxFailures: 5, windowMs: 60_000, lockoutMs: 60_000, failureDelayMs: 250 },
  },
});

await client.connect(url, { username, password });
```

The password travels as plain text inside the connection, so serve password
logins over `wss://` (a TLS-terminating proxy) or a link you trust, and pin
the host key so the password is only ever sent to the right host. Compare
against stored hashes in constant time, never with `===` on plaintext.

Failures are throttled per peer address (override with `rateLimit.key`, for
example to read `x-forwarded-for` behind a proxy). After `maxFailures` inside
`windowMs` the caller is locked out for `lockoutMs`, and the callback is not
even consulted during lockout, so the right password does not get through
either. The counter lives in process memory, per server. A host configured
with only `password` refuses key logins, and vice versa.

## Resumable sessions

By default a pty or exec session dies with the connection that opened it.
Pass `sessions` and it outlives it:

```js
createWshServer({
  auth, exec: true,
  sessions: {
    detachTtlMs: 300_000,   // how long a session nobody is attached to keeps running
    maxDetached: 16,        // unattended sessions kept at once
    ringBytes: 1 << 20,     // output history kept per session: what a resume can replay
    // sessionSecret: process.env.WSH_SESSION_SECRET,  // fix the token key across restarts
  },
});
```

`sessions: true` takes the defaults. On the client:

```js
const s = await client.openSession({ type: 'exec', command: 'make watch' });
s.onData = (d) => process.stdout.write(d);          // s.seq counts output bytes received
const { sessionId, resumeToken } = s;
const lastSeq = s.seq;

await client.detach(sessionId);                     // leave it running; then the socket can go
await client.disconnect();

// fresh connection, same key
const { session } = await client2.resumeSession(sessionId, resumeToken, { lastSeq });
session.onData = (d) => process.stdout.write(d);    // only the bytes after lastSeq, then live output
```

- `seq` is the cumulative count of output bytes the host has produced for a
  session. The client counts what it received (`WshSession.seq`), so there is
  no per-frame field and `lastSeq` is exactly that number.
- The host keeps the newest `ringBytes` of output. A `lastSeq` older than the
  ring still holds is refused with an `output gap` error naming where the
  history starts (fall back to `attachSession()` for the retained tail); one
  newer than the session has produced is refused too. While nobody is
  attached the process keeps running and keeps filling the ring, so a chatty
  process loses its oldest output rather than blocking.
- `resumeSession()` needs the token and ownership (the same key, or for a
  password login the same username). `attachSession()` accepts the token or
  ownership, so the owner can re-attach with just the session id and a token
  holder can join as a guest. Both return the `Presence` reply with a
  non-enumerable `session` property: a `WshSession` to read and write the
  re-attached channel.
- Up to 16 connections can attach to one session. Output fans out to all of
  them, and `attachSession(id, { readOnly: true })` attaches a viewer whose
  input is dropped.
- Ending versus leaving: `Close` from the owner ends the session, which is
  what `session.close()` and a graceful `client.disconnect()` send. To walk
  away and keep it running, call `client.detach(sessionId)` first; simply
  losing the connection also detaches. `client.listRemoteSessions()` lists
  the sessions your key owns, attached or not.
- Sessions are in memory: a server restart ends them all. ACL grants
  (`SessionGrant` / `SessionRevoke`) and `ControlChanged` are not built on
  this host.

## MCP tools

`mcp` makes the host answer `McpDiscover` and `McpCall`, so `client.discoverTools()`,
`client.callTool()` and `WshMcpBridge` work against it:

```js
createWshServer({
  auth,
  mcp: {
    tools: [{
      name: 'read_note',
      description: 'Read a note by id',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
      call: async ({ id }, { user, signal }) => ({ success: true, output: await readNote(id, { signal }) }),
    }],
    authorize: (user, tool) => tool.name !== 'admin_only' || user === 'root',
    // client: mcpSdkClient,   // proxy an @modelcontextprotocol/sdk Client's tools too
    // maxConcurrent: 8, timeoutMs: 30_000,
  },
});

const result = await client.callTool('read_note', { id: '7' });
```

Arguments are untrusted. They are validated against `inputSchema` before
`call()` runs, and invalid arguments never reach the tool. The package has no
runtime dependencies, so the validator covers the keywords tool schemas
actually use (`type`, `enum`, `const`, `properties`, `required`,
`additionalProperties`, `items`, length and range bounds, `pattern`,
`multipleOf`, `allOf` / `anyOf` / `oneOf` / `not`, local `$ref`). A schema
using any other keyword is refused when the server is created rather than
silently enforced less strictly. Only tools you list are reachable.

A tool that throws, an unknown tool, invalid arguments, a timeout, or the
concurrency cap all answer `{ success: false, error }`, so throw messages you
are happy for the caller to read. `authorize(user, tool, who)` filters
discovery and calls alike, and a hidden tool looks the same as one that does
not exist. `client` takes anything with `listTools()` / `callTool()`; this
package does not import the MCP SDK itself. Without `mcp`, discovery answers
an empty list.

## WebTransport listener

The client prefers WebTransport (`https://`) and falls back to `wss://`.
`webTransport` gives the Node host the first rung, with independent QUIC
streams and no head-of-line blocking across channels:

```js
const server = createWshServer({
  auth, exec: true, fs: { root: '/srv/share' },
  webTransport: { port: 4433, selfSigned: true },   // or { cert, privKey } as PEM
});
await server.listen();                               // the WebSocket listener still runs
const { url, certificateHash } = server.webTransport();   // https://127.0.0.1:4433/wsh, sha-256 of the cert

// a browser, or Node with a WebTransport implementation
await client.connect(url, {
  username, keyPair, transport: 'wt',
  webTransport: { serverCertificateHashes: [{ algorithm: 'sha-256', value: certificateHash }] },
});
```

- The listener needs two optional peers, imported only when `webTransport` is
  set: `npm install @fails-components/webtransport
  @fails-components/webtransport-transport-http3-quiche` (a native HTTP/3
  build). Without them `listen()` rejects with that instruction, and a server
  with no `webTransport` never loads them.
- Auth, `exec`, `pty`, `fs`, `mcp`, `sessions` and `relay` behave identically
  on both wires; only the transport differs.
- `selfSigned: true` generates an ECDSA P-256 certificate valid for 13 days,
  because browsers refuse a pinned certificate valid for more than 14, and
  exposes its SHA-256 for `serverCertificateHashes`. Pass `{ selfSigned: {
  hosts, validityDays } }` to change the names or the lifetime. It is **not
  renewed**: restart before `notAfter` and re-pin. A certificate you pass as
  `cert` / `privKey` is used as is, and `certificateHash` is then `null`.
- `generateSelfSignedCertificate()` is exported for the same certificate
  without a server. It returns `{ cert, privKey, hash, hashHex, notBefore,
  notAfter }`.
- Node has no `WebTransport` global, so a Node client needs
  `globalThis.WebTransport = (await import('@fails-components/webtransport')).WebTransport`
  first. The transport is UDP, so a firewall must allow the port, and there is
  no TLS terminator in front: the certificate is the one this process serves.
- The platform's pinning rules apply: an `https:` URL and HTTP/3 only. If the
  WebTransport attempt fails and the client falls back to WebSocket, that
  connection is subject to the ordinary certificate check again; pass
  `transport: 'wt'` to fail instead.

## Relay and reverse mode

A host that cannot accept connections (behind NAT, or a browser tab) dials out
and registers; an operator reaches it through a relay. The server subpath
provides both ends:

```js
import { createWshServer, createReverseHost } from '@johnhenry/wsh/server';

// The relay: nothing is permitted by default.
createWshServer({
  auth: { authorizedKeys },
  relay: {
    canRegister: (who, record) => who.username === 'build-box',   // who may be a peer
    canConnect: (from, to) => from.username === 'alice',          // who may list and reach which peer
  },
});

// The peer, on the machine behind the NAT: same backends as createWshServer.
const host = createReverseHost({
  url: 'wss://relay.example/', username: 'build-box', keyPair,
  exec: true, fs: { root: '/srv/share' },
  accept: ({ fingerprint, username }) => fingerprint === aliceFingerprint,   // default: nobody
});
await host.start();     // host.fingerprint is what operators connect to

// The operator: the stock client.
const peers = await client.listPeers();        // each entry's signed record is verified client-side
await client.reverseConnect(peers[0].fingerprint);   // resolves with ReverseAccept or ReverseReject
const s = await client.openSession({ type: 'exec', command: 'echo hello' });
```

- **Default deny, three times.** The relay admits no peer (`canRegister`) and
  lets no one connect (`canConnect`) unless you say so; the peer refuses every
  operator unless `accept` says otherwise; and the client's `trustRelayPeer()`
  is the third gate. A peer an operator may not connect to is not listed and
  looks the same as an absent one. Relay roles need a key login; password
  logins can still use the relay server as an ordinary host.
- **Signed records.** A registration is checked against the connection's own
  authenticated key and its self-signed record is verified at the relay, then
  verified again by each operator. The record's `seq` must increase per
  fingerprint, so an old record cannot regress a peer.
- **One operator per peer at a time.** A second `reverseConnect` is rejected
  as `busy`. A bridge lasts as long as both connections; when either ends the
  relay closes the other, so nothing an operator started outlives it.
  `createReverseHost` redials with backoff unless you pass `reconnect: false`.
- **Across the relay,** exec sessions are `data_mode: 'virtual'`: stdin and
  output ride `SessionData`, and there is no stdin EOF.
- **Not provided:** end-to-end encryption between operator and peer.
  `KeyExchange` and `EncryptedFrame` are not on the spec's forwardable list,
  so the relay sees the traffic in clear. Serve the relay over `wss://` and
  treat its operator as trusted. Client-side feature gates such as
  `fileWrite`'s `file-write` check read the relay's `ServerHello`, which says
  nothing about the peer behind it, so against a relay without `fs`,
  `fileWrite()` refuses locally.

## Compatibility with other hosts

An exec session's output flows on a second, client-opened stream, and a QMux
stream is invisible on the wire until its first byte. This host advertises
`stream-announce`, so the stock client announces the stream itself and writes
no primer byte. Against a host that does not advertise it (for example the
Rust `wsh-server`), the client writes a one-byte primer for you, and that
host strips it. Pass `primer: false` to `WshClient.exec()` or `openSession()` to never send it.
If a client primes anyway, this server drops a leading lone `0x00` from the
first chunk of an exec stream rather than forwarding it to the process's
stdin.

See the [Guide](/wsh/guide/) for the client side and the [API](/wsh/api/) for
every export.
