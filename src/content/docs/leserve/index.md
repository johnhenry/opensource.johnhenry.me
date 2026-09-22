---
title: "leserve"
description: "A simple HTTP/HTTPS server for Node.js built around one API, serve() — a plain (Request) => Response handler, no routing/middleware/event framework attached."
---

**`@johnhenry/leserve`** ships one API: `serve()` — a plain
`(Request) => Response` handler, no routing, no middleware stack, no event
framework attached. If that sounds Deno-flavored, it's deliberate: the shape
matches [`Deno.serve`](https://docs.deno.com/api/deno/~/Deno.serve) closely
enough that code written against one reads naturally against the other.

> **Provenance:** previously published as unscoped `leserve@0.0.0`. Adopted
> into the `@johnhenry` scope; version restarts at `0.0.0` there too (it was
> already at `0.0.0` unscoped, so this isn't a downgrade — just a new home).

If you want a batteries-included server instead — routing, middleware,
events — see [`@johnhenry/servant`](https://github.com/johnhenry/servant),
an independent implementation built on a different design (the two don't
interoperate). If you want JSX-described routes running *on top of*
leserve, see [`@johnhenry/servable`](https://github.com/johnhenry/servable)
(and its sibling [`@johnhenry/hostable`](https://github.com/johnhenry/hostable))
— servable's Node adapter delegates to leserve internally rather than
reimplementing the Node `IncomingMessage` → Web `Request` conversion. And if
you want tagged-template-string route matching against a leserve handler,
see [letterpress](/letterpress/), which is built specifically to pair with
`serve()`.

## Install

```sh
npm install @johnhenry/leserve
```

## Quick example

```javascript
import serve from "@johnhenry/leserve/serve";

const handler = (request) => {
  return new Response("Hello, World!", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
};

const server = serve(handler, { port: 3000 });
```

`Request`, `Response`, `Headers`, `URL`, `URLSearchParams`, and (in modern
Node.js) `WebSocket` are standard Node.js runtime globals (Node 18+) —
leserve doesn't add or polyfill them.

## The pages here

- [API](/leserve/api/) — `serve()`, `onWebSocket()`, options, exports
- [Middleware & helpers](/leserve/middleware/) — body parsing, response
  helpers, auth middleware, `compose()`
- [CLI](/leserve/cli/) — serving a module's export straight from the
  command line

## License

MIT

## Source

[github.com/johnhenry/serve-cold](https://github.com/johnhenry/serve-cold)
(the GitHub repository name predates the `@johnhenry/leserve` package name
and is kept as-is rather than renamed to match)
