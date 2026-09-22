---
title: "Adding a new primitive"
description: "Why hostable's capability growth is almost always a new forwarding mechanism on Upstream rather than a new tag, worked through the ipfs:// example."
---

This package only has one new leaf (`Upstream`) plus the reused `Gateway`
root — most capability growth here isn't a new *primitive* at all, it's a
new *forwarding mechanism* on `Upstream` itself (a new `url=` scheme, a
new backend shape for `app=`).

The real worked example in this package's own history is
`url="ipfs://<cid>/<path>"` support (see the CHANGELOG's "Unreleased"
entry), which is the right template because it's the harder of the two
cases: unlike `https://` (already just `fetch()`), `ipfs:` has no native
`fetch()` protocol handler at all, so it can't be "one more branch inside
the same call" the way fileable's `loadSrc()` and servable's
`resolveAsset()` handle their own `ipfs://` support. It touches:

1. **`src/forward.ts`** — `rewriteIpfsUrl(target, gateway)` translates
   `ipfs://<cid>/<path>` into a real `${gateway}<cid>/<path>` URL *before*
   `fetch()` ever sees it. `createUrlUpstream()` checks
   `targetUrl.protocol === "ipfs:"` and rewrites up front, done fresh per
   request inside the same forwarding handler `url=` already builds — not
   a compile-time rewrite, since the target is only known once a request
   actually arrives. `DEFAULT_IPFS_GATEWAY` mirrors fileable's/servable's
   own default (`"https://ipfs.io/ipfs/"`).
2. **`src/compile.ts`'s `TransformCtx`** — gained an `ipfsGateway?: string`
   field, threaded through `transformChildren()`/`transformUpstream()`
   down to `resolveUpstreamHandler()` the same way `pathPrefix` already
   is. This is the one part that isn't boilerplate: `Upstream` handlers
   (including any `url="ipfs://..."` forwarding target) are built during
   hostable's own pre-transform, which runs *before* servable's own
   `compile()` — and therefore before servable's own `ipfsGateway` option
   would normally apply — so the option has to be threaded down through
   this package's private `TransformCtx` explicitly rather than picked up
   for free. No new type was needed for the public option itself:
   `CompileOptions` is imported directly from `@johnhenry/servable`
   (`compile(tree, options: CompileOptions)`), so `options.ipfsGateway`
   was already there — only `compile()`'s own `rootCtx` construction
   needed the one extra field (`{ pathPrefix: "", ipfsGateway:
   options.ipfsGateway }`).
3. **Real tests against a local mock gateway, not a live one**
   (`test/upstream-url.test.ts`) — a real `node:http` server stands in
   for the gateway, because every major public IPFS gateway (`ipfs.io`,
   `dweb.link`, `w3s.link`, `nftstorage.link`) currently rejects direct
   server-side fetches with `429`. Three cases: the happy path (`Group
   prefix` stripped first, then forwarded through
   `${baseUrl}/ipfs/<cid>/...`), a fixed base path joined with the
   forwarded request path, and a real gateway error (missing CID)
   surfacing as-is rather than being swallowed.

No `types.ts`/`jsx-runtime.ts`/`components.ts` changes at all for this
one, since it's a new *behavior* inside an existing leaf's existing `url=`
prop, not a new tag — contrast with servable's own [Adding a new
primitive](/servable/adding-a-primitive/) (a genuinely new tag, `Host`,
which *does* touch `RESERVED_TAGS`/`StructuralTag`/a new factory) for when
a new primitive is warranted instead.
