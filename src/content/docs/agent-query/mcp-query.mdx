---
title: '@johnhenry/mcp-query'
description: A reactive, cached, embeddable MCP client for non-agentic apps — query keys, cache tags, and LSP-style lifecycle on top of the official MCP SDK.
---

```bash
npm install @johnhenry/mcp-query
```

An MCP client shaped like a data layer rather than an agent loop. It wraps the official `@modelcontextprotocol/sdk` and adds the machinery an application needs: a reactive cache, stable query keys, tag-based invalidation, and connection lifecycle modelled on an LSP client.

```ts
import { MCPClient } from '@johnhenry/mcp-query';
```

## Why not use the SDK directly

The SDK gives you a correct protocol client. An application additionally needs to know *when a tool list changed*, *whether a call is in flight*, *what to re-render*, and *how to survive a reconnect without losing state*. That's cache and lifecycle work, and it's the same work every MCP-consuming UI ends up reimplementing.

`mcp-query` does it once: query keys in the TanStack idiom, invalidation tags in the RTK Query idiom, and an LSP-style connection lifecycle that handles reconnects, capability renegotiation, and server-initiated push.

## Human-in-the-loop

Elicitation is first-class. The client advertises both `form` and `url` elicitation capabilities and routes requests through an `InteractionBroker`, so an approval UI can sit between the server's request and the user's answer.

A note learned the hard way: servers gate each elicitation mode on its own sub-capability. Advertising a bare `{}` only works for form mode via a backwards-compatibility transform in the SDK's schema — declaring `url` requires declaring `form` explicitly too, or form-mode elicitation breaks with *"Client does not support form elicitation."*

## Subpath exports

- `@johnhenry/mcp-query/server` — server-side helpers
- `@johnhenry/mcp-query/testing` — `MockMCPServer` and friends for tests
- `@johnhenry/mcp-query/react` — React bindings
- `@johnhenry/mcp-query/devtools` — inspection UI
- `@johnhenry/mcp-query/webmcp` — WebMCP integration

## Binaries

```bash
npx @johnhenry/mcp-query mcp-query-codegen   # generate typed clients
npx @johnhenry/mcp-query mcp-query-inspect   # inspect a server
```

## What else is in the repository

[`johnhenry/mcp-query`](https://github.com/johnhenry/mcp-query) is a monorepo of 9 packages and 10 apps, but only **three publish to npm** — this package, [`mcp-query-tanstack`](/agent-query/mcp-query-tanstack/), and [`mcp-gate`](/agent-query/mcp-gate/).

The rest are internal (`mcp-contract`, `mcp-bench`, `mcp-lint`, `mcp-record`, `mcp-docs`, `cli`) or demo applications (approvals, composer, console, inspector, notebook, ops-cockpit, prompt-studio, switchboard, and others). They're worth reading as usage examples; they aren't installable.
