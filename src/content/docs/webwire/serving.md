---
title: "Serving"
description: "Guide: answer Node http requests with Web Request and Response objects, including reverse-proxy hosts, bad request targets, streaming, cookies, trailers and WebSocket upgrades."
sidebar:
  order: 3
---

The server direction uses two functions: [`toWebRequest()`](/webwire/api/#towebrequestreq-options)
on the way in and [`writeWebResponse()`](/webwire/api/#writewebresponseresponse-res-options)
on the way out. Everything between them is your own code in `Request`/`Response` terms.

## The shape of a handler

```js
import http from "node:http";
import { toWebRequest, writeWebResponse } from "@johnhenry/webwire";

async function handle(request) {
  if (new URL(request.url).pathname === "/echo") {
    return new Response(await request.text(), {
      headers: { "content-type": request.headers.get("content-type") ?? "text/plain" },
    });
  }
  return new Response("not found", { status: 404 });
}

http.createServer(async (req, res) => {
  let request;
  try {
    request = toWebRequest(req);
  } catch (err) {
    res.statusCode = err.status ?? 500;
    return res.end("bad request");
  }
  await writeWebResponse(await handle(request), res);
}).listen(8000);
```

Convert inside the `try`. A client can send a request target that Node's parser
accepts but is not a valid URL (an absolute-form target with malformed IPv6 brackets,
for instance). `toWebRequest()` then throws an error tagged `.status = 400`, which you
can turn into a response. Left uncaught inside an async handler, it is an unhandled
rejection that can take the process down. `err.status` is only set on that error; other
throws (a `CONNECT` request, which `Request` refuses) have none, so the `?? 500` above
is deliberate.

## Behind a reverse proxy

By default the URL's host comes from `Host`, which behind a proxy is the proxy's own
address. To reflect what the client typed, name the forwarding header first:

```js
const request = toWebRequest(req, { hostHeaders: ["x-forwarded-host", "host"] });
```

Only do this when a proxy you control sets that header and strips the client's copy.
The first header present wins, with no checks, so a client that can send
`X-Forwarded-Host` directly chooses `request.url`'s host. The scheme is not derived from
`X-Forwarded-Proto`; it is always `http:`. Read the forwarded protocol yourself if you
need it.

## Streaming bodies

A request body is `req` itself, so it streams and is read once:

```js
const request = toWebRequest(req);
for await (const chunk of request.body) { /* Uint8Array chunks */ }
```

A response body that is a `ReadableStream` is piped to `res` with backpressure:

```js
const stream = new ReadableStream({
  async start(controller) {
    for (const part of ["a", "b", "c"]) {
      controller.enqueue(new TextEncoder().encode(part));
      await new Promise((r) => setTimeout(r, 100));
    }
    controller.close();
  },
});
await writeWebResponse(new Response(stream), res);
```

A real `Response` always has a stream (or no) body, so no `Content-Length` is set and
Node uses chunked transfer encoding, unless you set a `content-length` header yourself.
If the client goes away mid-stream the source stream is cancelled and `onError` is
called with `ERR_STREAM_PREMATURE_CLOSE`. See
[Errors after the headers are sent](#errors-after-the-headers-are-sent).

## Cookies

```js
const headers = new Headers();
headers.append("set-cookie", "a=1; Path=/");
headers.append("set-cookie", "b=2; Path=/");
await writeWebResponse(new Response("ok", { headers }), res);
```

The client sees two `Set-Cookie` lines. This is the case that makes naive converters
wrong: `Object.fromEntries(response.headers)` keeps only one of them. The webwire README
reports that dialback's own copy of this code had exactly that bug before it moved here.

## Trailers

```js
import { createHash } from "node:crypto";
import { setTrailers, writeWebResponse } from "@johnhenry/webwire";

const hash = createHash("sha256");
let resolveChecksum;
const checksum = new Promise((r) => (resolveChecksum = r));

const body = new ReadableStream({
  start(controller) {
    const bytes = new TextEncoder().encode("hello");
    hash.update(bytes);
    controller.enqueue(bytes);
    controller.close();
    resolveChecksum({ "x-checksum": hash.digest("hex") });
  },
});

const response = new Response(body);   // no content-length: chunked, so trailers can ride
setTrailers(response, checksum);
await writeWebResponse(response, res);
```

Set the trailers on the exact object you hand to `writeWebResponse()`. They are keyed
by that `Response` instance, so `response.clone()` or a new `Response` wrapped around
its body will not carry them. See the caveats in
[Limitations](/webwire/limitations/#trailers-are-silently-dropped-if-the-response-has-a-content-length).

## Errors after the headers are sent

Once a streamed body starts, there is no status code left to send. `writeWebResponse()`
therefore reports a failing body to `onError` and destroys the connection; the
promise still resolves.

```js
await writeWebResponse(response, res, {
  onError: (err) => console.warn("response stream failed", err),
});
```

The client sees a reset connection or a truncated chunked body, not an error status.
Errors thrown before the body starts (an invalid header name, say) reject the promise
instead, and nothing has been sent yet, so you can still write a 500.

## WebSocket upgrades

A real `Response` cannot hold status 101, so a handler that has already taken over the
socket for an upgrade returns a stand-in:

```js
const UPGRADED = Object.freeze({ status: 101 });

// in a handler whose socket was already handed to a WebSocket library:
await writeWebResponse(UPGRADED, res);   // returns immediately, touches nothing
```

`toWebRequest(req, { attachRaw: true })` exposes `request.raw`, the original
`IncomingMessage`, so the code that does the upgrade can reach `request.raw.socket`.
The webwire README cites [leserve](/leserve/)'s `WEBSOCKET_UPGRADE_RESPONSE` as the
precedent for this convention.
