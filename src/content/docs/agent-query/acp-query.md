---
title: '@johnhenry/acp-query'
description: A reactive session/turn store and permission broker for the Agent Client Protocol — for web UIs, notebooks, dashboards, and editors hosting coding agents.
---

```bash
npm install @johnhenry/acp-query
```

The official [`@agentclientprotocol/sdk`](https://github.com/agentclientprotocol/typescript-sdk) gives you the wire: a fluent `client()` builder, typed handlers, stdio/HTTP/SSE/WebSocket transports. `acp-query` adds the state stratum an embedding app needs on top.

```ts
import { AcpQuery, InteractionBroker } from '@johnhenry/acp-query';

const broker = new InteractionBroker();
const q = new AcpQuery({ interactions: broker });
q.connect(myAgentStream); // ndJsonStream over stdio, WebSocket, ... or an AgentApp

const sid = await q.newSession('/workspace');
q.subscribe(sid, () => render(q.session(sid))); // live turn state
await q.prompt(sid, 'refactor the auth module');
// broker.list() -> pending permission requests for your approval inbox
```

## The pieces

- **Reactive session store** — `session/update` streams fold into observable per-session state (`messageText`, `toolCalls` with live statuses, `plan`, `availableCommands`, `currentMode`, stop reasons, plus the raw update log). `subscribe()` is `useSyncExternalStore`-ready.
- **Permission broker** — ACP's `session/request_permission` (typed `allow_once`/`always`/`reject_once`/`always` options) routes through the shared [`InteractionBroker`](/agent-query/): trust policy auto-answers, "ask" queues for your approval UI (`resolve` with an `optionId`), every outcome audited.
- **Fail-safe by default.** With no broker configured, permission requests **reject** rather than hang or auto-approve. An agent asking to write outside its sandbox with nothing wired up to answer gets a "no," not a stall.
- **In-process mock agent** (`@johnhenry/acp-query/testing`) — the SDK's own `agent()` builder wired straight to the client (`connect(mockAcpAgent(...))`): real protocol, no transport, with `say`/`toolCall`/`askPermission` turn helpers.
- **Cancellation honors the full ACP contract** — `cancel(sessionId)` sends `session/cancel` *and* resolves that session's pending permission requests with `{outcome: "cancelled"}`, so a turn blocked on an unanswered permission finishes with `stopReason: "cancelled"` instead of hanging forever.

## Wire protocol version — v1 only, deliberately

acp-query supports **ACP wire protocol v1 only**. v2 (schema alpha as of this writing) is explicitly out of scope until it stabilizes ([issue #5](https://github.com/johnhenry/acp-query/issues/5)).

- Built on `@agentclientprotocol/sdk`, pinned **exactly** (not a caret range) in both `dependencies` and `peerDependencies` — the SDK's own semver is independent of the wire protocol version it implements, so a caret here would silently let in a different protocol version.
- The SDK package itself was renamed from `@zed-industries/agent-client-protocol` (now deprecated on npm) to `@agentclientprotocol/sdk` as governance moved out of Zed Industries into its own org. If you find the old name in a search result or an older tutorial, it's the same protocol under new stewardship — the SDK is current, the old package name isn't.

## Opt-in client capabilities

`fs`/`terminal` capabilities are config-supplied callbacks, **default off**. When enabled, writes are gated through the broker via `gateWrites` — so turning the capability on doesn't bypass the permission system, it just gives the agent something to ask permission *for*.

## Subpath exports

- `@johnhenry/acp-query/testing` — the mock agent
- `@johnhenry/acp-query/react` — `useSession`, `useToolCalls`, `usePermissions`, the re-exported core hooks, and `<AgentQueryDevtools>`

Also: a devtools wire tap (`instrumentAcpStream`), `session/list`/`session/load`/slash-command caching, and `AcpSessionHandle` (`attach()`/`newAttachedSession()`) for bound-session ergonomics with a `states()` async-iterable over folded snapshots.
