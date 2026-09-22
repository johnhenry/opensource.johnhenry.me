---
title: "hostable"
description: "Declaratively describe an API gateway using JSX — routes across multiple domains/backend services by Host header, on top of servable's single-app (Request) => Response dispatcher."
---

**`@johnhenry/hostable`** describes an API gateway as JSX — routing across
multiple domains and backend services by `Host` header, on top of
[servable](/servable/)'s single-app `(Request) => Response` dispatcher.

hostable is the third package in the `fileable -> servable -> hostable`
lineage: [fileable](/fileable/) compiles JSX into filesystem artifacts,
servable compiles JSX into *one app's* dispatcher, and hostable is the
layer above that — routing across a *fleet* of apps and backends,
addressed by domain as well as path. It has a real npm dependency on
`@johnhenry/servable`, not just a thematic relationship: `Group`/`Host`/
`Route`/`Use`/`ErrorBoundary`/`NotFound`/`Redirect`/`Response` are all
re-exported from servable directly, unchanged.

## The governing rule

> A gateway matches by domain (`Host`) before path (`Group`/`Route`) —
> `Host` compiles into the same `URLPattern` `hostname` component that
> `Group`'s prefix already uses for `pathname`, so `Host`/`Group`/`Route`
> together are one flat, first-match-wins dispatch table, not a two-phase
> lookup. A leaf either handles the request itself (`Route`, reused
> verbatim from servable) or forwards it elsewhere (`Upstream`, hostable's
> one new leaf) — forwarding is always a leaf, never a wrapper, exactly
> like `Route` is always a leaf.

## Install

```sh
npm install @johnhenry/hostable
```

## Quick example

```tsx
/** @jsxImportSource @johnhenry/hostable */
import { Gateway, Host, Route, Upstream, compile } from "@johnhenry/hostable";

const gateway = (
  <Gateway>
    <Host name="a.example.com">
      <Route path="/health" method="GET">{{ ok: true }}</Route>
      <Upstream path="/*" url="https://backend-a:3000" />
    </Host>
    <Host name="b.example.com">
      <Upstream path="/*" url="https://backend-b:3000" />
    </Host>
  </Gateway>
);

const compiled = await compile(gateway);
```

## Primitives

Mostly **reused, not reimplemented** — `@johnhenry/servable` is a real
dependency, and everything except `Gateway`/`Upstream` is a direct
re-export from it. `Host` — the domain-axis scope this package is named
after — used to be implemented here as a hostable-only pre-transform; it's
a genuine servable primitive now (see servable's own [API](/servable/api/)
and [Adding a new primitive](/servable/adding-a-primitive/) for the full
writeup, including the real cross-`Host` leak bug that move fixed).

One genuinely new primitive, `Upstream` — "forward it there" — with three
mutually exclusive forwarding modes (`url=`, `app=`, `handler=`) and its
own `ipfs://` upstream support. See [API](/hostable/api/) for the full
reference.

## The pages here

- [API](/hostable/api/) — `Upstream`'s forwarding modes, `ipfs://`
  upstreams, ecosystem integration (dialback, browsermesh), adapters,
  non-goals
- [Literal cross-package JSX](/hostable/nested-jsx/) — writing fileable,
  servable, and hostable's tags in one nested JSX expression
- [Adding a new primitive](/hostable/adding-a-primitive/) — why this
  package almost never needs a new *tag*, and the `ipfs://` worked example

## License

MIT

## Source

[github.com/johnhenry/hostable](https://github.com/johnhenry/hostable)
