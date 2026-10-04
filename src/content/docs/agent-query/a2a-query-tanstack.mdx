---
title: '@johnhenry/a2a-query-tanstack'
description: TanStack Query bridge for a2a-query — queryOptions/mutationOptions factories that sync a2a-query's own cache into TanStack's, with zero extra refetches.
---

```bash
npm install @johnhenry/a2a-query-tanstack @johnhenry/a2a-query @tanstack/react-query
```

`queryOptions`/`mutationOptions` factories that delegate fetching to [`a2a-query`](/agent-query/a2a-query/) while syncing its own reactive cache into TanStack Query's — same shape as [`mcp-query-tanstack`](/agent-query/mcp-query-tanstack/).

```tsx
import { QueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { A2AQuery } from '@johnhenry/a2a-query';
import {
  a2aqTaskQueryOptions,
  a2aqCardQueryOptions,
  a2aqSendMessageMutationOptions,
} from '@johnhenry/a2a-query-tanstack';

const queryClient = new QueryClient();
const client = new A2AQuery({ agents: { support: { url: 'https://support.example.com/a2a' } } });

function TaskView({ agent, taskId }: { agent: string; taskId: string }) {
  const { data: card } = useQuery(a2aqCardQueryOptions(client, agent, { staleTime: Infinity }));
  const { data: task } = useQuery(a2aqTaskQueryOptions(client, agent, taskId, { staleTime: Infinity }));
  const send = useMutation(a2aqSendMessageMutationOptions(client, queryClient, agent));

  return (
    <section>
      <h2>{card?.name}</h2>
      <p>{task?.status?.state}</p>
      <button onClick={() => send.mutate(makeMessage('continue'))}>Send</button>
    </section>
  );
}
```

## The three factories

### `a2aqTaskQueryOptions(client, agent, taskId, opts?)`

Returns `queryOptions<Task>` under the key `['a2a-query', agent, 'task', taskId]`. The `queryFn` registers the sync bridge for this key, then resolves `client.task(agent, taskId)` and returns the handle's cached task snapshot — so the first fetch goes through a2a-query (deduped, cached, poll/push-maintained there), and every subsequent update arrives via the bridge, not via TanStack refetching.

Only mount this for a `taskId` you actually hold — one returned by `sendMessage` or an existing `TaskHandle`. For an unknown id the snapshot is empty, the `queryFn` returns `undefined`, and TanStack surfaces its generic "query data cannot be undefined" error rather than anything 404-shaped.

### `a2aqCardQueryOptions(client, agent, opts?)`

Returns `queryOptions<AgentCard>` under `['a2a-query', agent, 'card']`. `opts.refresh: true` forwards to `client.card(agent, { refresh: true })`, forcing a network re-fetch of the card **every time the queryFn runs** — combine it with a long `staleTime` or you've built a card-refetch-on-every-focus loop. Without `refresh`, refetches are served from a2a-query's cache.

### `a2aqSendMessageMutationOptions(client, queryClient, agent, opts?)`

Returns `mutationOptions` whose `mutationFn` is `(message) => client.sendMessage(agent, message, opts)`. On success, if the reply is a `TaskHandle` (detected by its methods — a plain `Message` reply *also* carries a `taskId` field, so key presence alone can't distinguish them), it invalidates that task's own query key. A `Message` reply touches nothing.

Note this factory takes the `QueryClient` explicitly — it needs it inside `onSuccess`, where TanStack doesn't hand one over.

## Query keys and invalidation

Keys are namespaced agent-first, and artifacts nest under their task, so prefix invalidation composes:

| Target | Key | Helper |
|---|---|---|
| One task | `['a2a-query', agent, 'task', taskId]` | `taskQueryKey(agent, taskId)` |
| One artifact | `['a2a-query', agent, 'task', taskId, 'artifact', artifactId]` | `artifactQueryKey(agent, taskId, artifactId)` |
| An agent's card | `['a2a-query', agent, 'card']` | `cardQueryKey(agent)` |
| Everything for one agent | `['a2a-query', agent]` | — |
| The whole namespace | `['a2a-query']` | `A2A_QUERY_NS` |

Invalidating a task's prefix therefore also catches its artifact entries. `tagToQueryKeyPrefix(tag)` maps a2a-query cache tags (`agent:`, `card:`, `task:`, `artifact:`) to these prefixes — it's exported and pure, but as of v1 nothing wires it up: for actively-bridged queries the sync bridge makes tag-wide invalidation redundant, and it's reserved for a future release covering TanStack-inactive queries.

## How the sync bridge works

Every `queryOptions()` factory lazily registers a listener on a2a-query's own cache the first time a query actually runs (`ensureSynced`, or call `attachA2aqSync(client, queryClient)` explicitly up front). From then on, task/card refetches, protocol push events folded via `ingestPush`, and optimistic `patch()`/rollback all mirror straight into TanStack Query's cache via `setQueryData` — no extra network round-trip. `client.cache` is a real `@johnhenry/agent-query-core` `QueryCache`, not a fork, so this bridge consumes its stable, public `subscribe`/`getSnapshot` API directly.

TanStack's own `staleTime`/`gcTime` still apply as a safety margin on top — but for an actively-rendered bridged query, a2a-query's cache is the source of truth. When TanStack garbage-collects a query nobody renders anymore (a `QueryCache` `'removed'` event), the bridge releases its a2a-query-side subscription too, so nothing leaks. If the same query mounts again later, the next `queryFn` run re-registers it.

## Staleness and refetch traps

- **Set a long `staleTime` on bridged queries.** Freshness is a2a-query's job (`taskPollMs` polling, streaming, push) and arrives through the bridge; TanStack's default `staleTime: 0` just makes every remount and window focus re-run the `queryFn`. Those re-runs are served from a2a-query's cache — cheap, but pointless, and with `refresh: true` on a card query they're real network calls. `staleTime: Infinity` is the honest setting.
- **You can't override `queryKey` or `queryFn` through `opts`.** The factories spread your `opts` *first*, then set both — a custom `queryFn` or key passed in is silently discarded. Everything else (`staleTime`, `gcTime`, `enabled`, `select`, …) passes through.
- **Optimistic updates belong on the a2a-query side.** Don't reimplement `onMutate`/rollback against TanStack's cache — call a2a-query's own `patch()` mechanism and the bridge propagates both the patch and any rollback, exactly like a server-confirmed write.
- **`gcTime` bounds bridge teardown, not data freshness.** An aggressive `gcTime` means unmount → gc → bridge unsubscribed; a remount silently re-registers, at the cost of one `queryFn` pass through a2a-query's cache.

## Scope

Verification/simulation-shaped: this package only bridges reads (`task`, `card`) and the one send mutation. `respond`/`cancel`/artifacts aren't wrapped in `queryOptions`/`mutationOptions` yet — use `A2AQuery`/`TaskHandle` directly for those (`artifactQueryKey` exists so your own artifact wrappers land under the right prefix).
