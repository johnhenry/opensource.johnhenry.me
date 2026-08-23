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

## The wider family

Three sibling clients share a protocol-agnostic engine, `@johnhenry/agent-query-core` — a reactive cache, a human-in-the-loop broker, and instrumentation:

- **`@johnhenry/mcp-query`** — Model Context Protocol
- **`@johnhenry/a2a-query`** — Agent2Agent: agent-card registry, task-handle store, approvals
- **`@johnhenry/acp-query`** — Agent Client Protocol: session/turn store and permission broker

Each has a matching TanStack binding (`*-tanstack`). This section documents the MCP packages in depth; the A2A and ACP clients follow the same shapes.

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

The renamed packages restarted at `0.0.0` with `^0.0.0` internal ranges. Under npm's pre-1.0 caret rules that matches **only** `0.0.0`. Pin exact versions. `@johnhenry/mcp-gate` is the exception at `0.2.1`, continuing its original line.
