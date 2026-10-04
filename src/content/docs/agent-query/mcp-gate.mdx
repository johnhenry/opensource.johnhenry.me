---
title: '@johnhenry/mcp-gate'
description: A config-driven MCP security and policy proxy — authorization, DLP redaction, rate limiting, circuit breaking, and audit, fronting many upstreams as one endpoint.
---

```bash
npm install @johnhenry/mcp-gate
```

A policy proxy that sits in front of one or more MCP servers and presents them to a client as a single endpoint. Built on [`@johnhenry/mcp-query`](/agent-query/mcp-query/).

```ts
import { createGate } from '@johnhenry/mcp-gate';
```

## What it enforces

**Authorization** — which callers may reach which tools, resources, and prompts.

**DLP redaction** — pattern-based scrubbing of tool results before they reach the client, so an upstream that over-returns doesn't leak through.

**Rate limiting** — per-caller and per-tool budgets.

**Circuit breaking** — a failing upstream stops being called rather than timing out every request behind it.

**Audit** — a `CallAuditEntry` stream of what was called, by whom, and what the policy decided.

## Fan-in

The gate fronts **many upstreams as one MCP endpoint**. Clients see a merged catalog; the gate routes each call to the right server and applies policy uniformly. That's what makes it useful beyond single-server access control — it's the seam where a fleet of MCP servers becomes one governed surface.

## A note on the SDK

`mcp-gate` depends on `@modelcontextprotocol/client` and `@modelcontextprotocol/server` (the v2 split packages), not the v1 monolith `@modelcontextprotocol/sdk` that `mcp-query` itself peer-depends on.

## Versions

Unlike its siblings, `mcp-gate` was not renamed and continues its original line — currently **0.2.1**. Versions `0.0.1` through `0.2.0` are deprecated: they depend on the pre-rename `@johnhenry/mcpq`. Use `0.2.1` or later.
