---
title: Agent Query
description: Reactive, cached, embeddable clients for MCP, A2A, and ACP — built for apps that aren't agents.
---

A family of data-layer clients for agent protocols, plus a policy gate.

The premise: most code that talks to an MCP or A2A server **is not itself an agent**. It's a dashboard, an inspector, an approval queue, a notebook. Those apps want what a data layer gives you — a reactive cache, query keys, optimistic updates, lifecycle management — not an autonomous loop.

| Package | What it is |
|---|---|
| [`@johnhenry/mcp-query`](/agent-query/mcp-query/) | Reactive, cached MCP client. TanStack Query keys + RTK Query tags + LSP-client lifecycle, on the official MCP SDK. |
| [`@johnhenry/mcp-query-tanstack`](/agent-query/mcp-query-tanstack/) | TanStack Query bridge — `queryOptions`/`mutationOptions` factories with zero extra refetches |
| [`@johnhenry/mcp-gate`](/agent-query/mcp-gate/) | Config-driven MCP security proxy — authorization, DLP redaction, rate limiting, circuit breaking, audit |
| [`@johnhenry/a2a-query`](/agent-query/a2a-query/) | Reactive A2A client — multi-agent registry, task-handle store, approval broker, on the official A2A SDK |
| [`@johnhenry/a2a-query-tanstack`](/agent-query/a2a-query-tanstack/) | TanStack Query bridge for a2a-query |
| [`@johnhenry/acp-query`](/agent-query/acp-query/) | Reactive session/turn store and permission broker for the Agent Client Protocol |

## The wider family

All three clients share a protocol-agnostic engine, `@johnhenry/agent-query-core` — a reactive cache, a human-in-the-loop broker (`InteractionBroker`), and instrumentation. Wiring one `InteractionBroker` instance into clients for more than one protocol in the same app unifies approvals, policy, and audit across them.

- **`@johnhenry/mcp-query`** — Model Context Protocol
- **`@johnhenry/a2a-query`** — Agent2Agent: agent-card registry, task-handle store, approvals
- **`@johnhenry/acp-query`** — Agent Client Protocol: session/turn store and permission broker

Each has a matching TanStack binding (`*-tanstack`), except acp-query, which doesn't have one yet.

## Renamed 2026-08-23

These packages used short handles that didn't match their repositories. They now match:

| Old | New |
|---|---|
| `@johnhenry/mcpq` | `@johnhenry/mcp-query` |
| `@johnhenry/a2aq` | `@johnhenry/a2a-query` |
| `@johnhenry/acpq` | `@johnhenry/acp-query` |
| `@johnhenry/mcpq-tanstack` | `@johnhenry/mcp-query-tanstack` |
| `@johnhenry/a2aq-tanstack` | `@johnhenry/a2a-query-tanstack` |

**The old names are gone or deprecated — install the new ones.** `a2aq`, `acpq`, and both old `-tanstack` names are unpublished; `mcpq` is deprecated and points here. The short names are reserved for future CLIs.

The rename went deeper than the package name: CLI binaries, cache namespaces, storage keys, and the A2A `skillId` metadata key all changed. Code written against the old packages needs updating, not just its `package.json`.

## Versions

The renamed packages restarted at `0.0.0` with `^0.0.0` internal ranges. Under npm's pre-1.0 caret rules that matches **only** `0.0.0`. Pin exact versions. Two exceptions continue their own version lines instead of the shared `0.0.0` restart: `@johnhenry/mcp-gate` (`0.2.1`) and `@johnhenry/acp-query` (`0.0.2`, after `agent-query-core` was promoted to a stable `0.1.0`).

Both `a2a-query` and `acp-query` published early releases before the rename that recommended installing via an `@rc` dist-tag — that dist-tag and those versions no longer exist. Plain `npm install @johnhenry/a2a-query` / `acp-query` gets the current code; ignore any `@rc` instruction you find in an older cached copy of either README.

## Source & examples

Annotated, runnable examples for the whole family are indexed at
[Examples](/agent-query/examples/). Sources:
[`mcp-query`](https://github.com/johnhenry/mcp-query) (monorepo — also home of mcp-gate and mcp-query-tanstack) ·
[`a2a-query`](https://github.com/johnhenry/a2a-query) ·
[`a2a-query-tanstack`](https://github.com/johnhenry/a2a-query-tanstack) ·
[`acp-query`](https://github.com/johnhenry/acp-query) ·
[`agent-query-core`](https://github.com/johnhenry/agent-query-core)
