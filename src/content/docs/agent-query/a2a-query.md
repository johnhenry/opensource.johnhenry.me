---
title: '@johnhenry/a2a-query'
description: A reactive, cached, embeddable A2A client for non-agentic apps — a multi-agent registry, task-handle store, and approval broker on top of the official A2A SDK.
---

```bash
npm install @johnhenry/a2a-query
```

The official [`@a2a-js/sdk`](https://github.com/a2aproject/a2a-js) gives you transports, wire codecs, and a single-endpoint client. `a2a-query` adds the stratum apps need on top — the same [TanStack-Query-of-A2A](https://github.com/johnhenry/mcp-query) move `mcp-query` makes for MCP.

```ts
import { A2AQuery, InteractionBroker } from '@johnhenry/a2a-query';
```

## The pieces

- **Multi-agent registry/router** — one `A2AQuery` over many agents; cards resolved and cached (`card(agent)`), SDK clients memoized per endpoint.
- **Task-handle store** — `sendMessage()` returns a poll-driven `TaskHandle` whose snapshots land in a reactive cache (`task()`, `subscribe()`, `result()`), so a dashboard observes live task state without hand-rolling a poll loop.
- **Approval broker for paused tasks** — A2A's `INPUT_REQUIRED`/`AUTH_REQUIRED` are first-class human-in-the-loop resume points. They route through the shared [`InteractionBroker`](/agent-query/) (policy allow/deny/ask, a pending queue for UI binding, an audit trail); an approved decision's message resumes the task via `respond()`.
- **Streaming** — `sendMessageStream`/`resubscribeTask` drive the handle over SSE, with drop → `degraded` → resubscribe (retried) → poll-fallback handled for you, and a `getTask` reconcile after every reattach.
- **Artifact accessors** — artifact-kind cache entries, reactive chunk reads (`partText`/`artifactText`/`artifactsText`), and `detachArtifacts` for eviction control.
- **Devtools wire tap** — `tapFetch` + `devtoolsWire` summarize every JSON-RPC exchange (method, ids, sizes, status — never bodies) into the same timeline `AgentQueryDevtools` renders for the whole family.
- **Skill codegen** — the `a2a-query-codegen` CLI (and `generateSkillModule`) turn an `AgentCard`'s skills into a typed `sendX(...)` module, with `useX(...)` hooks via `--hooks`.
- **Webhook push adapter** — `createWebhookHandler` turns an agent's push notifications into the same cache folds the poll/stream drivers write, followed by a reconcile read.

## Human-in-the-loop is the same broker as MCP and ACP

`InteractionBroker` isn't reimplemented per protocol — a2a-query, mcp-query, and acp-query all route their pause points through the one shared instance from `@johnhenry/agent-query-core`. Wire one broker into all three clients in an app that talks to multiple protocols, and approvals, policy, and audit are unified across them.

## Subpath exports

- `@johnhenry/a2a-query/testing` — an in-process mock agent using the SDK's own server stack (`DefaultRequestHandler` + `JsonRpcTransportHandler` + `InMemoryTaskStore`) behind an injected `fetch`, so tests exercise the real wire with no sockets
- `@johnhenry/a2a-query/react` — `useAgentCard`, `useTask`/`useTaskStatus`/`useTaskArtifacts`, `usePendingInput`, `useSkillTask`, plus the re-exported core hooks

## Binary

```bash
npx @johnhenry/a2a-query a2a-query-codegen
```

## TanStack bridge

[`@johnhenry/a2a-query-tanstack`](/agent-query/a2a-query-tanstack/) syncs this package's cache into TanStack Query's with zero extra refetches.
