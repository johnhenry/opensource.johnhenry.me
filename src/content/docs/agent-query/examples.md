---
title: 'Examples across the family'
description: An annotated cross-index of the 40 numbered, runnable examples shipped in agent-query-core, mcp-query, a2a-query, and acp-query — grouped by task, not by package.
---

Every repo in the family ships numbered examples under `examples/NN-name.ts`, runnable as `npm run example:NN` (or `npx tsx examples/NN-name.ts`) against an in-process mock — no network, no API keys, no subprocess. The two `.tsx` entries at the end of the mcp-query set are the exception: illustrative React/browser code that compiles but needs a bundler and DOM. This page indexes all of them by *what you're trying to do*, since the interesting patterns (approvals, policy, invalidation) repeat across protocols.

The four sets:

- [`agent-query-core`](https://github.com/johnhenry/agent-query-core/tree/main/examples) — 8 examples of the shared engine, protocol-free
- [`mcp-query`](https://github.com/johnhenry/mcp-query/tree/main/packages/mcp-query/examples) — 8 for MCP
- [`a2a-query`](https://github.com/johnhenry/a2a-query/tree/main/examples) — 13 for A2A
- [`acp-query`](https://github.com/johnhenry/acp-query/tree/main/examples) — 11 for ACP

## Start here — the smallest useful program

- [mcp-query 01 · minimal](https://github.com/johnhenry/mcp-query/blob/main/packages/mcp-query/examples/01-minimal.ts) — connect, list, call one tool against the in-memory mock.
- [a2a-query 01 · hello task](https://github.com/johnhenry/a2a-query/blob/main/examples/01-hello-task.ts) — send a message, get a `TaskHandle`, await the result, print the artifact text.
- [acp-query 01 · basic turn](https://github.com/johnhenry/acp-query/blob/main/examples/01-basic-turn.ts) — connect, prompt, watch the session state stream in.
- [agent-query-core 01 · cache basics](https://github.com/johnhenry/agent-query-core/blob/main/examples/01-cache-basics.ts) — write, read, staleness, and subscription on the bare engine (injectable clock).

## Query a server's tools and route across servers

- [mcp-query 01 · minimal](https://github.com/johnhenry/mcp-query/blob/main/packages/mcp-query/examples/01-minimal.ts) — `listTools` is a synchronous cache read after connect; `callTool("server.tool", args)` is namespaced.
- [mcp-query 04 · multi-server](https://github.com/johnhenry/mcp-query/blob/main/packages/mcp-query/examples/04-multi-server.ts) — one client multiplexing several servers: routing by namespace and by URI scheme, with isolated failure.
- [a2a-query 05 · multi-agent](https://github.com/johnhenry/a2a-query/blob/main/examples/05-multi-agent.ts) — one `A2AQuery` over several agents, tasks in flight on both, a mini dashboard rendered purely from cache snapshots.
- [acp-query 05 · multi-session](https://github.com/johnhenry/acp-query/blob/main/examples/05-multi-session.ts) — two sessions on one connection, prompts in flight simultaneously, updates interleaving on the wire.

## Watch a task or turn stream live

- [a2a-query 02 · live status](https://github.com/johnhenry/a2a-query/blob/main/examples/02-live-status.ts) — `subscribe()` to a task's cache entry; structural sharing keeps idle polls silent.
- [a2a-query 08 · streaming](https://github.com/johnhenry/a2a-query/blob/main/examples/08-streaming.ts) — the card advertises `capabilities.streaming`, and the *same* `TaskHandle` surface is driven by `sendMessageStream`/`resubscribeTask` instead of polling.
- [acp-query 02 · tool calls](https://github.com/johnhenry/acp-query/blob/main/examples/02-tool-calls.ts) — the `tool_call` → `tool_call_update` lifecycle, rendered live.
- [mcp-query 03 · live subscriptions](https://github.com/johnhenry/mcp-query/blob/main/packages/mcp-query/examples/03-live-subscriptions.ts) — subscribe to a resource; a server push (`notifications/resources/updated`) invalidates the cache with no polling.
- [a2a-query 12 · push webhook](https://github.com/johnhenry/a2a-query/blob/main/examples/12-push-webhook.ts) — the disconnected-client story: register a webhook on the send and let the agent POST every update instead of polling.

## Caching, tags, and invalidation

- [agent-query-core 02 · tags & invalidation](https://github.com/johnhenry/agent-query-core/blob/main/examples/02-tags-and-invalidation.ts) — RTK-Query-style declared tags, plus a simulated protocol push driving invalidation.
- [mcp-query 02 · cache & invalidation](https://github.com/johnhenry/mcp-query/blob/main/packages/mcp-query/examples/02-cache-and-invalidation.ts) — reads cached and de-duped; a mutation invalidates by tag so the next read refetches.
- [acp-query 10 · session list/load caching](https://github.com/johnhenry/acp-query/blob/main/examples/10-session-list-load.ts) — the thin cacheable-read surface on an otherwise stream-shaped protocol.
- [a2a-query 09 · artifact store](https://github.com/johnhenry/a2a-query/blob/main/examples/09-artifact-store.ts) — artifacts under their own cache keys, so large outputs are individually readable and invalidatable.

## Optimistic updates

- [agent-query-core 03 · optimistic updates](https://github.com/johnhenry/agent-query-core/blob/main/examples/03-optimistic-updates.ts) — patch immediately, roll back when the mutation fails. The pattern the [TanStack bridges](/agent-query/a2a-query-tanstack/) lean on instead of reimplementing `onMutate`.

## Human-in-the-loop approvals

The same `InteractionBroker` engine, applied per protocol:

- [agent-query-core 04 · approval broker](https://github.com/johnhenry/agent-query-core/blob/main/examples/04-approval-broker.ts) — policy allow/deny/ask, a simulated UI resolving the queue, and the audit printout.
- [mcp-query 05 · human-in-the-loop](https://github.com/johnhenry/mcp-query/blob/main/packages/mcp-query/examples/05-human-in-the-loop.ts) — a server tool elicits input, then requests sampling; the broker queues both.
- [a2a-query 03 · approval inbox](https://github.com/johnhenry/a2a-query/blob/main/examples/03-approval-inbox.ts) — the agent pauses `INPUT_REQUIRED`; the broker queues it; a "human" answers.
- [a2a-query 04 · manual resume](https://github.com/johnhenry/a2a-query/blob/main/examples/04-manual-resume.ts) — no broker at all: the app watches the cached snapshot, notices the pause itself, and resumes by hand.
- [acp-query 03 · permission inbox](https://github.com/johnhenry/acp-query/blob/main/examples/03-permission-inbox.ts) — `session/request_permission` queued for a human, approved by a simulated UI, recorded in the audit trail.

## Policy autopilot — no human in the loop

- [a2a-query 06 · policy autopilot](https://github.com/johnhenry/a2a-query/blob/main/examples/06-policy-autopilot.ts) — the broker's trust policy decides; "allow" auto-answers a form-filling agent from app state.
- [acp-query 04 · policy rules](https://github.com/johnhenry/acp-query/blob/main/examples/04-policy-rules.ts) — auto-answer permissions by trust policy; "allow" picks the first `allow_*` option the agent offered.
- [a2a-query 13 · x402 autopilot](https://github.com/johnhenry/a2a-query/blob/main/examples/13-x402-autopilot.ts) — the same broker/policy pattern applied to x402 machine-native payments.

## Resilience: retries, flaky networks, connection status

- [agent-query-core 07 · connection status](https://github.com/johnhenry/agent-query-core/blob/main/examples/07-connection-status.ts) — a flaky peer walked through the gRPC-style connectivity state machine.
- [agent-query-core 08 · retry policy](https://github.com/johnhenry/agent-query-core/blob/main/examples/08-retry-policy.ts) — backoff with an explicit idempotency contract (injected random, deterministic).
- [a2a-query 07 · devtools & resilience](https://github.com/johnhenry/a2a-query/blob/main/examples/07-devtools-and-resilience.ts) — a flaky network, a retry policy, live connectivity status, and a devtools timeline of everything that happened.
- [acp-query 06 · cancel](https://github.com/johnhenry/acp-query/blob/main/examples/06-cancel.ts) — stop a turn mid-flight, including the spec-required answer to the session's pending permission.

## Devtools and wire observability

- [a2a-query 10 · wire log](https://github.com/johnhenry/a2a-query/blob/main/examples/10-wire-log.ts) — `devtoolsWire: true` taps the injected fetch and emits per-call wire summaries (bodies excluded).
- [acp-query 07 · devtools timeline](https://github.com/johnhenry/acp-query/blob/main/examples/07-devtools-timeline.ts) — a `DevtoolsHub` capturing a scripted turn: chunks, a tool call, a permission ask.
- [acp-query 09 · wire timeline](https://github.com/johnhenry/acp-query/blob/main/examples/09-wire-timeline.ts) — the same turn over a *real* stream transport (in-memory duplex; ndJsonStream over stdio in production).

## Engine plumbing: interceptors and persistence

- [agent-query-core 05 · interceptors](https://github.com/johnhenry/agent-query-core/blob/main/examples/05-interceptors.ts) — an auth interceptor and a timing interceptor wrapped Koa-onion style around an operation.
- [agent-query-core 06 · persistence](https://github.com/johnhenry/agent-query-core/blob/main/examples/06-persistence.ts) — dehydrate/hydrate across "sessions", plus `persistCache` against a storage shim.

## Ergonomics and codegen

- [acp-query 08 · client capabilities](https://github.com/johnhenry/acp-query/blob/main/examples/08-client-capabilities.ts) — supply fs + terminal callbacks (in-memory fakes; `node:fs`/`child_process` in a real client) and advertise them.
- [acp-query 11 · attached session](https://github.com/johnhenry/acp-query/blob/main/examples/11-attached-session.ts) — `newAttachedSession()` returns a handle so prompt/cancel/state don't need the session id threaded through.
- [a2a-query 11 · skill codegen](https://github.com/johnhenry/a2a-query/blob/main/examples/11-skill-codegen.ts) — an `AgentCard`'s skills turned into a typed invocation module (the orval / connect-query shape).

## Living alongside agents and other clients

- [mcp-query 06 · alongside another client](https://github.com/johnhenry/mcp-query/blob/main/packages/mcp-query/examples/06-alongside-another-client.ts) — mcp-query is a non-agentic data layer; it runs *beside* your agent or other MCP clients, not instead of them.
- [mcp-query 07 · hybrid agent + UI](https://github.com/johnhenry/mcp-query/blob/main/packages/mcp-query/examples/07-hybrid-agent-ui.tsx) — illustrative (`.tsx`; compiles, needs a bundler/DOM + an LLM): the agent *acts* while mcp-query renders reactive state.
- [mcp-query 08 · WebMCP bridge](https://github.com/johnhenry/mcp-query/blob/main/packages/mcp-query/examples/08-webmcp-bridge.tsx) — experimental, illustrative: `document.modelContext` makes the page itself an agent-controllable server, both directions in one browser app.

The mcp-query monorepo also carries smaller example sets in its sibling packages — [mcp-gate's library mode](https://github.com/johnhenry/mcp-query/blob/main/packages/mcp-gate/examples/01-library-mode.ts), plus recorded-cassette and contract fixtures under [mcp-record](https://github.com/johnhenry/mcp-query/tree/main/packages/mcp-record/examples) and [mcp-contract](https://github.com/johnhenry/mcp-query/tree/main/packages/mcp-contract/examples) — and cross-package examples at the [monorepo root](https://github.com/johnhenry/mcp-query/tree/main/examples) composing client + gate + record + contract in one flow.
