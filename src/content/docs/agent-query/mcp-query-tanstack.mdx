---
title: '@johnhenry/mcp-query-tanstack'
description: TanStack Query bridge for mcp-query — queryOptions and mutationOptions factories that sync its reactive cache into TanStack Query with no extra refetches.
---

```bash
npm install @johnhenry/mcp-query-tanstack
```

Peer-depends on `@johnhenry/mcp-query` and `@tanstack/react-query`.

## What it does

`mcp-query` already maintains its own reactive cache. If you also use TanStack Query, you don't want two caches disagreeing, and you don't want TanStack refetching data the MCP client already has fresh.

This package bridges them: `queryOptions` and `mutationOptions` factories that read through to `mcp-query`'s cache, including protocol push and optimistic updates, **without triggering extra network round-trips**. TanStack becomes a view over the MCP client's state rather than a second source of truth.

```ts
import { queryOptions, mutationOptions } from '@johnhenry/mcp-query-tanstack';
```

## Invalidation

Cache keys derive from `mcp-query`'s own key scheme, so tag-based invalidation on the MCP side propagates into TanStack. Server-initiated `listChanged` notifications invalidate the right keys without a poll.

One known gap: tag-wide `invalidateQueries` needs a post-construction cache-listener hook that isn't in place yet — tracked at [mcp-query#24](https://github.com/johnhenry/mcp-query/issues/24).

## Sibling

`@johnhenry/a2a-query-tanstack` is the same bridge for the A2A client, published from its own repository at [`johnhenry/a2a-query-tanstack`](https://github.com/johnhenry/a2a-query-tanstack).
