---
title: "servable"
description: "Declaratively describe an HTTP server using JSX — a small closed set of primitives, own JSX runtime, compiled into one Fetch-API (Request) => Response dispatcher."
---

**`@johnhenry/servable`** describes an HTTP server as JSX — a small closed
set of primitives, driven by servable's own JSX runtime (no React/Solid/
Astro dependency), compiled into one Fetch-API `(Request) => Response`
dispatcher.

servable is [fileable](/fileable/)'s sibling: same technique (its own JSX
runtime, a small closed primitive set, fail-loudly-on-ambiguity discipline),
different domain — a live HTTP dispatcher instead of a filesystem tree.
They're deliberately separate packages, not a shared dependency; fileable
stays a filesystem tool, servable stays a routing tool. The one place they
meet is optional: servable can *mount* a fileable tree as static routes (see
[Mounting a fileable tree](/servable/mounting-fileable/)).

servable is also the middle package in the `fileable -> servable ->
hostable` lineage: fileable compiles JSX into filesystem artifacts,
servable compiles JSX into *one app's* dispatcher, and
[`@johnhenry/hostable`](/hostable/) is the layer above that — routing
across a *fleet* of apps and backends by `Host` header, on top of this
package's dispatcher.

## The governing rule

> **Functions are always props. Children are always either a static value
> or nested primitives. Containment decides scope, never sibling order.**

This is why `Use`/`ErrorBoundary` wrap a subtree (children = what's
affected) instead of being declared as siblings with "applies to whatever
comes after it" semantics, and why a `Route`'s handler is a `handler` prop,
not its children.

## Install

```sh
npm install @johnhenry/servable
```

## Quick example

```tsx
/** @jsxImportSource @johnhenry/servable */
import { Router, Route, compile } from "@johnhenry/servable";
import { serve } from "@johnhenry/servable/adapters/node";

const app = (
  <Router>
    <Route path="/hello" method="GET">Hello, world!</Route>
    <Route path="/users/:id" method="GET" handler={(req, ctx) => new Response(`user ${ctx.params.id}`)} />
  </Router>
);

const compiled = await compile(app);
serve(compiled, { port: 3000 });
```

`compile()` runs the same four-stage pipeline every time: Build (normalize
the tree) → Resolve (import `handler="./mod.js"` module paths, expand
`<Group from>`) → Layout (assign method+path, build each route's middleware
chain) → Compile (produce the dispatcher). The result is `{ fetch, warnings
}`; `fetch` is a plain `(Request) => Promise<Response>`, usable directly on
Deno/Bun/Cloudflare Workers, or through an adapter (Node needs one).

## The primitives, briefly

- **`Router`** — root container.
- **`Host name="..."` / `Host pattern="*.example.com"`** — a hostname-axis
  scope, independent of `Group`'s pathname-axis scope.
- **`Group prefix="..." from="glob"|fileableTree`** — a path-prefix scope;
  `from` either does file-based routing from a glob, or mounts a fileable
  tree as static routes.
- **`Route path="..." method="GET" handler={} src={}`** — a leaf: a
  function handler, a static/binary `src` (with Range/conditional-request
  support built in), or static children.
- **`Use`** / **`ErrorBoundary`** — wrap a subtree: middleware and error
  handling, onion-style.
- **`NotFound`** / **`Redirect`** / **`Response`** — fallback routing,
  redirects, and per-value response metadata.

See [API](/servable/api/) for the full reference, including why a handful
of tempting additions (`<Header>`, `<Validate>`, `<Stream>`, media-specific
tags) were deliberately rejected.

## The pages here

- [API](/servable/api/) — every primitive, Standard Web API usage, headers
  and trailers, streaming, adapters, non-goals
- [Mounting a fileable tree](/servable/mounting-fileable/) — turning a
  `Dir`/`File` tree into static routes, naming rules, Fragments
- [Adding a new primitive](/servable/adding-a-primitive/) — the test a
  proposed addition has to pass, and `Host`'s real worked example

## License

MIT

## Source

[github.com/johnhenry/servable](https://github.com/johnhenry/servable)
