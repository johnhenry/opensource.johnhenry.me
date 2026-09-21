---
title: "Tutorial: your first A2A client"
description: "Install agent-query-core and a2a-query, send one real message to an agent, and watch the response come back through a cache you can prove is actually caching."
---

This walks you through building the smallest possible `a2a-query` client: connect to one agent, send one message, read the result — then prove to yourself that the second read didn't hit the network. No real server needed; you'll talk to an in-process mock agent that speaks the real A2A wire protocol underneath, so everything you see here behaves exactly like it would against a live agent.

Takes about 5 minutes.

## 1. Install

```sh
npm install @johnhenry/a2a-query @johnhenry/agent-query-core @a2a-js/sdk
```

`a2a-query` is the A2A-specific client; `agent-query-core` is the reactive-cache engine it's built on (you don't need to touch it directly for this tutorial, but it's worth installing explicitly so you know it's there — every client in the family shares it). `@a2a-js/sdk` is the official A2A SDK, a required peer dependency.

## 2. Create the file

Create `hello-agent.ts`:

```ts
import { A2AQuery, type TaskHandle } from "@johnhenry/a2a-query";
import { MockA2AAgent, echoExecutor } from "@johnhenry/a2a-query/testing";
import type { Message } from "@a2a-js/sdk";

// A real in-process A2A agent — same server stack (DefaultRequestHandler +
// JsonRpcTransportHandler + InMemoryTaskStore) a live server uses, just
// wired to an injected fetch instead of a socket. It echoes back whatever
// text you send it, prefixed with "echo: ".
const mock = new MockA2AAgent(echoExecutor(), { name: "echo-agent" });

const q = new A2AQuery({
  agents: { echo: { url: mock.url, fetchImpl: mock.fetchImpl } },
  taskPollMs: 25,
});

const message: Message = {
  messageId: "m-1",
  role: "user",
  parts: [{ content: { $case: "text", value: "hello, agent" } }],
} as never;

// Fetch the agent's card once...
const first = await q.card("echo");
console.log("agent:", first.name);

// ...send a real message and wait for the task to complete...
const reply = await q.sendMessage("echo", message);
if (typeof reply === "object" && "result" in reply) {
  const handle = reply as TaskHandle;
  const task = await handle.result(); // resolves when the task COMPLETES
  const text = (task.artifacts ?? [])
    .flatMap((a) => a.parts.map((p) => (p.content?.$case === "text" ? String(p.content.value) : "")))
    .join("");
  console.log("artifact:", text);
}

// ...then fetch the card again. This second call does NOT go back over
// the wire — it's a cache hit, and you can prove it: the object you get
// back is the exact same object as `first`, not a fresh copy.
const second = await q.card("echo");
console.log("second card fetch is cached (same object):", second === first);
```

## 3. Run it

```sh
npx tsx hello-agent.ts
```

You should see:

```
agent: echo-agent
artifact: echo: hello, agent
second card fetch is cached (same object): true
```

## What just happened

- `q.card("echo")` resolved the agent's card over the (mock) wire and cached it. `a2a-query` keys agent cards by agent name and treats them as fresh for a default stale time (5 minutes) — so the second `q.card("echo")` call returned the cached entry synchronously instead of refetching. `second === first` being `true` is that cache hit made visible: same object reference, not a re-fetched copy that happens to look the same.
- `q.sendMessage("echo", message)` sent a real A2A message and got back a `TaskHandle` — a poll-driven handle whose snapshots land in the same reactive cache. `handle.result()` awaited the task all the way to completion before reading its artifacts.
- None of this touched a network socket. `MockA2AAgent` runs the SDK's real server stack in-process, so swapping `mock.url`/`mock.fetchImpl` for a real agent's URL is the only change needed to point this at production.

## Where to go next

- [Examples across the family](/agent-query/examples/) — the full graded set, including live status subscriptions, human-in-the-loop approvals, and multi-agent dashboards.
- [a2a-query](/agent-query/a2a-query/) — the full reference for this package.
- [Agent Query overview](/agent-query/) — how `mcp-query` and `acp-query` share the same `agent-query-core` engine, if your next agent speaks a different protocol.
