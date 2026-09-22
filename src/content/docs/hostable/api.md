---
title: "API"
description: "Upstream's url=/app=/handler= forwarding modes, ipfs:// upstreams, mounting an app without Upstream, ecosystem integration (dialback, browsermesh), adapters, and non-goals."
---

## `Upstream`

```tsx
<Upstream path="/*" url="https://backend:3000" />
<Upstream path="/*" app={compiledServableApp} />
<Upstream path="/*" handler={async (req, ctx) => new Response("...")} />
```

"Forward it there" — the one new leaf. `url`/`app`/`handler` are mutually
exclusive (throws if more than one is set). Unlike `Route` (which defaults
to `GET`), an `Upstream` with no `method` set forwards **every standard
HTTP method** (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS`) —
servable's own dispatch has no "any method" concept, and a reverse proxy
silently 404ing every non-`GET` request would be wrong for the common case.

- **`url`** — reverse-proxy via `fetch()`. Strips the matched `Host`/
  `Group` prefix from the incoming request's path before forwarding (the
  same "serve what's inside this scope" rule fileable-mount uses), strips
  hop-by-hop headers (RFC 9110 §7.6.1: `Connection`, `Keep-Alive`,
  `Transfer-Encoding`, `TE`, `Trailer`, `Upgrade`, `Proxy-Authenticate`,
  `Proxy-Authorization`) from both the outgoing request and the returned
  response, and passes redirects through unfollowed (`redirect: "manual"`)
  rather than silently following them on the client's behalf. `ipfs://`
  URLs are also recognized — see "`ipfs://` upstreams" below.
- **`app`** — any object shaped `{fetch(request): Promise<Response>}`,
  called in-process, zero network hop. Covers a compiled
  `@johnhenry/servable` dispatcher, a [`@johnhenry/dialback`](/dialback/)
  `Server` instance, or anything else with a `.fetch` method.
- **`handler`** — full escape hatch, same shape as `Route`'s `handler`.

## `ipfs://` upstreams

`url="ipfs://<cid>/<path>"` reverse-proxies an entire domain/prefix
straight at an IPFS gateway — the same idea as fileable's `<File
src="ipfs://...">` and servable's `<Route src="ipfs://...">`, one layer up:
instead of resolving one file, a whole `<Upstream>` forwards everything
under its matched path.

```tsx
<Upstream path="/*" url="ipfs://bafybeigdyrzt.../" />
```

Unlike the other two layers, this can't just be "one more branch in the
same `fetch()` call" — `fetch()` has no native `ipfs:` protocol handler at
all, so the outgoing request's URL is rewritten to a real `https://`
gateway URL (`${ipfsGateway}${cid}/${path}`) before `fetch()` ever sees it,
done fresh per request inside the same forwarding handler `url=` already
uses. Configure the gateway via `compile(tree, { ipfsGateway })` (default:
`"https://ipfs.io/ipfs/"`) — the same option name/default/semantics as
fileable's `RenderOptions.ipfsGateway` and servable's
`CompileOptions.ipfsGateway` (re-exported/passed straight through, since
hostable's own `CompileOptions` type comes directly from
`@johnhenry/servable`).

Public gateways (`ipfs.io`, `dweb.link`, `w3s.link`, `nftstorage.link`)
currently return `429` for direct server-side (non-browser) fetches —
they're migrating to service-worker-only access. Point `ipfsGateway` at
your own gateway/pinning service in production, or a local mock in tests.
There's no caching layer here either, same as `url=` in general: every
matching request re-fetches through the gateway; compose a caching `Use`
around it if that cost matters.

## Mounting an app without `Upstream` at all

A Fetch-shaped object (a compiled servable app, a dialback `Server`,
anything with `.fetch()`) can sit directly as a raw JSX child of
`Gateway`/`Host`/`Group` — detected via `typeof value.fetch ===
"function"` duck-typing, no brand/symbol needed (a hostable `Descriptor`
is `{tag,props,children}`-shaped; a Fetch-shaped backend is `{fetch}`-shaped):

```tsx
const app = await compileServable(<Router>...</Router>);

const gateway = (
  <Gateway>
    <Host name="app.example.com">{app}</Host>
  </Gateway>
);
```

## Ecosystem integration

Neither of these gets hostable-specific integration code — both plug in
through `Upstream`'s existing `app=`/`handler=` mechanism, though not
identically: dialback's export already satisfies `FetchLike` directly;
browsermesh's two exports don't, so they go through two small, generic
adapters instead.

- **[`@johnhenry/dialback`](/dialback/)** (reverse-proxy-over-websockets:
  an agent dials out, the server dials back through that connection to
  reach it) — a `Server` instance is already Fetch-shaped
  (`server.fetch(request)`), so forwarding gateway traffic to an agent
  behind NAT/a firewall is just `<Upstream app={dialbackServer} />`, no
  adapter needed.

  **Known constraint**: dialback's `Server#fetch()` picks a connection via
  its own load-balancing strategy across *all* connected agents — there's
  no way to target one specific agent by ID. Use one dedicated `Server`
  instance per `Upstream` that needs a specific agent.

- **[`@johnhenry/browsermesh`](/browsermesh/)** (peer-to-peer mesh
  networking for browser Pods) has its own HTTP-shaped bridges independent
  of dialback, but **neither satisfies `FetchLike` as-is**:
  `createBrowserMeshFetch()` is a bare `fetch(url, init)`-shaped
  *function*, not an object with `.fetch`; `MeshFetchRouter#route()`
  returns `Response | null` (the Service-Worker-interceptor convention),
  not always a `Response`. `fromFetchFn()`/`fromNullableRouter()` (below)
  adapt each into `FetchLike`.

### `fromFetchFn` / `fromNullableRouter`

Two small, generic adapters — not specific to browsermesh, just the two
shapes it happens to need:

```ts
import { fromFetchFn, fromNullableRouter } from "@johnhenry/hostable";
import { createBrowserMeshFetch } from "@johnhenry/browsermesh-apps/mesh-fetch";
import { MeshFetchRouter } from "@johnhenry/browsermesh-discovery";

// Adapts any fetch(url, init)-shaped function into app=.
const meshFetch = createBrowserMeshFetch(meshRpcApi);
<Upstream path="/*" app={fromFetchFn((_url, init) => meshFetch(`mesh://${podId}/greet`, init))} />

// Adapts a (req) => Promise<Response|null> router into app=, with a
// configurable fallback for null (default: a plain 404).
const router = new MeshFetchRouter({ onRpc });
<Host pattern="*.mesh.local">
  <Upstream path="/*" app={fromNullableRouter(router.route.bind(router))} />
</Host>
```

`fromFetchFn` reads a non-`GET`/`HEAD` request's body as text before
calling `fn` (not a raw stream) — matching how both
`createBrowserMeshFetch()` and `MeshFetchRouter#route()` already extract a
body from `init.body`/a real `Request` (read as text, then try
`JSON.parse`), since neither accepts a stream.

## Adapters

Thin re-exports of servable's own — hostable's compiled output IS a
servable-compiled dispatcher:

```ts
import { serve } from "@johnhenry/hostable/adapters/node";
const handle = serve(compiled, { port: 3000 });
```

## Non-goals

- Not a service mesh, not pod discovery, not sidecar injection —
  browsermesh's domain, not duplicated here.
- No built-in TLS/cert management — delegate to the adapter/runtime.
- No built-in load balancing/health checks/circuit breaking in v1 —
  `Upstream` stays single-target; `handler=` covers custom multi-target
  logic without a new primitive.
- No built-in caching layer.
- No built-in DNS/Consul-style service discovery — `url=`/`app=` are
  static per compile; `handler=` is the dynamic-resolution escape hatch.

## Examples

See [`examples/`](https://github.com/johnhenry/hostable/tree/main/examples)
in the repo: `01-multi-domain`, `02-mount-servable-app`,
`03-dialback-tunnel`, `04-full-stack`, `05-nested-jsx` (the flagship — see
[Literal cross-package JSX](/hostable/nested-jsx/)), `06-browsermesh`.
