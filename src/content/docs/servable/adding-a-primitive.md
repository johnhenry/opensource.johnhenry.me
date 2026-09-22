---
title: "Adding a new primitive"
description: "The one test a proposed new tag has to pass, and Host — the real worked example — walked through touchpoint by touchpoint."
---

The [Rejected additions](/servable/api/#rejected-additions) list is really
one test applied nine times: **does this need real compile-time wiring
that a `Use` middleware or an existing prop fundamentally cannot provide?**
`Use` already runs arbitrary code around a subtree at request time — that
covers anything expressible as "inspect/modify the request, call `next()`,
inspect/modify the response" (`<Validate>`, a caching layer, auth). A prop
already covers anything that's just metadata on a single existing node
(`<Header>`/`<Trailer>` → `headers`/`trailers`; `<Video>`/`<Pdf>` → `src`/
`download`). Neither covers a genuinely new **scoping axis** baked into how
requests get matched in the first place, before any handler or middleware
runs at all — that's what actually justifies a new primitive, and it's
exactly why `Host` (hostname-axis scoping, alongside `Group`'s existing
pathname-axis scoping) is real and `<Validate>` isn't.

## `Host`, worked

`Host` is the best real worked example in this package's own history (see
the CHANGELOG's "Unreleased" entry). It touches four places:

1. **A `Props` interface + a `StructuralTag` union entry** (`src/types.ts`)
   — `HostProps { name?: string; pattern?: string }`, `"host"` added to
   the `StructuralTag` union.
2. **A one-line `structural("host", props)` factory** (`src/components.ts`)
   — copy-paste of `Group`'s own.
3. **A `RESERVED_TAGS` entry** (`src/jsx-runtime.ts`) so the bare
   lowercase `<host>` throws a clear "use `<Host>`" error instead of
   silently becoming an unrecognized node, same as every other primitive.
4. **The part that isn't boilerplate: real Layout-stage logic in
   `layout.ts`.** `WalkCtx.hostname` is threaded through the tree walk the
   same way `basePath` already is; `dedupKey()` was widened to include
   `hostname` so two sibling `<Host>`s reusing the same path don't
   collide; `compilePath()` bakes `hostname` into the actual compiled
   `URLPattern` every nested `Route`/`Redirect` gets. `compile.ts`'s
   `nearestScope()` picks a hostname-specific scope over a host-agnostic
   one when both match, so a `<Host>`-scoped `NotFound` doesn't lose to an
   unscoped sibling's.

## Why Layout, and not Build/Resolve

`Host` has to apply **after** every other pipeline stage has finished
expanding the tree (a mounted fileable tree, `Group from="glob"`
file-based routing, a promise-valued `path`, a literal `<Router>` nested
inside a `<Host>`) — Layout is the one stage that runs once everything
else has already produced its routes.

This is also a real bug fix, not just a design preference: `Host` used to
live one layer up, in [`@johnhenry/hostable`](/hostable/), implemented as
a one-pass pre-Build tree rewrite — which meant any route created by a
*later* stage was invisible to that rewrite and leaked across every
`<Host>` in the gateway (confirmed empirically: a `<Host>` that should
only reverse-proxy elsewhere also served a sibling `<Host>`'s mounted
static files). Moving the primitive itself down into servable's own
Layout stage fixed it at the root, for every expansion point at once,
instead of requiring hostable to special-case each one as it was found —
see `test/host.test.ts` (19 tests, including every one of the leak
points) and [hostable's own CHANGELOG](https://github.com/johnhenry/hostable/blob/main/CHANGELOG.md)
for the consuming side of the fix.

Contrast with [hostable's own "Adding a new primitive"
section](/hostable/adding-a-primitive/) — hostable's own worked example
(`ipfs://` support on `Upstream`) is a new *behavior* inside an existing
leaf's existing prop, not a new tag, which is exactly why it needed none
of the four touchpoints above.
