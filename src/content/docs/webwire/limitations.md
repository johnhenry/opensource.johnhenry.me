---
title: "Limitations and traps"
description: "What fails quietly in webwire, traps first: https URLs, header handling, trailers, 204/304 bodies, IPv6 hosts, hop-by-hop headers, streaming errors and the one-way body. Several are fixed in 0.0.1."
sidebar:
  order: 5
---

Traps first: behaviour that is deliberate or inherited from Node and the Fetch classes,
that you will not guess from the type signatures, and that tends to fail quietly. Each was
checked against the source, with direct scripts on Node 24. The
[package](/webwire/) targets Node 26 (family policy); its own `npm test`
(`node --test test/`) does not start on Node 24.9, so use Node 26 to run the suite.

Several traps below were fixed in **0.0.1** (published 2026-10-03). Those entries are marked
"fixed in 0.0.1"; `0.0.0` still behaves as described under "In 0.0.0", so upgrade.

## Traps

### Server side

#### `request.url` was always `http://` (fixed in 0.0.1)

In 0.0.0, `toWebRequest()` built the URL on `http://` whether the connection was TLS or
not. From 0.0.1 it uses `https://` when `req.socket.encrypted` is true (a request
received by a real `https.createServer()`). It still does **not** look at
`X-Forwarded-Proto`: behind a TLS-terminating proxy the connection to your server is
plain, so `request.url` is `http://`. Code that branches on `new URL(request.url).protocol`
or builds redirects from it is wrong in that setup. Track the scheme yourself.

#### `hostHeaders` was case-sensitive (fixed in 0.0.1)

In 0.0.0 Node lower-cased incoming header names but `hostHeaders` was looked up as
written, so `["X-Forwarded-Host"]` never matched and silently fell back to `localhost`.
From 0.0.1 the configured names are lower-cased, so any case works. The value is still
used as is: a comma-separated list such as
`X-Forwarded-Host: a.com, b.com` (a chain of proxies each appending) is not valid as a
host, so `toWebRequest()` throws the tagged 400. A client-controlled header you list here
is a client-controlled host.

#### A request target can override the host

The URL is `new URL(req.url, "http://" + host)`, so a request target that is itself
absolute or protocol-relative wins: `GET http://other.example/x` and `GET //evil.example/x`
both produce a `request.url` whose host is not the `Host` header. If you route or
authorize on `new URL(request.url).host`, a client can pick it.

#### `GET` and `HEAD` bodies are dropped

For those two methods `request.body` is `null` even if the client sent bytes. The
unread bytes stay on `req`.

#### `CONNECT` and `TRACE` throw an untagged `TypeError`

The `Request` constructor forbids those methods. `toWebRequest()` wraps only a bad URL,
so for these the error has no `.status`. Handle `CONNECT` and `upgrade` on the server's own
events, not through this function.

#### A request body is `req`, and it is read once

The `Request` body is a view over the live `IncomingMessage`. You cannot read it twice,
and nothing has been buffered. Read it before responding (a response sent first can race
the client still uploading on a keep-alive connection, which is why webwire's own tests
read the body inside the handler).

### Response side

#### `statusText` was not written (fixed in 0.0.1)

In 0.0.0, `writeWebResponse()` set the status code only, so
`new Response("x", { statusText: "Custom" })` went out with Node's standard reason
phrase. From 0.0.1 a non-empty `statusText` is written as the reason phrase; an empty one
still leaves Node's default.

#### Trailers are silently dropped if the response has a `content-length`

`res.addTrailers()` only works on chunked responses. A `Response` that you gave a
`content-length` header goes out with a body and no trailers, and no error is raised.
A real `Response` with a string or stream body has no `content-length` unless you add
one, so this bites when you copy headers from elsewhere (a proxy, say).

Trailers are also keyed by the `Response` object. `response.clone()` and a rewrapped
`Response` lose them, `getTrailers()` returning `undefined` for the copy. If the trailers
promise you pass rejects, `onError` is called and the connection is destroyed. A rejected
promise you pass to `setTrailers()` but never hand to `writeWebResponse()` is nobody's
to handle, so it surfaces as an unhandled rejection.

#### A failed stream destroys the connection and still resolves

After headers are sent, a source error, a trailers rejection or a client disconnect
(`ERR_STREAM_PREMATURE_CLOSE`) calls `onError`, destroys `res`, and **resolves** the
promise. `await writeWebResponse(...)` finishing does not mean the client got the whole
body. The default `onError` is `console.error`, so wire your own to count these.

#### A consumed or locked body fails the same way

Passing a `Response` whose body was already read (`await response.text()` first) is not
caught up front: the stream is locked, `Readable.fromWeb()` throws inside the pipeline
branch, and you get `onError` plus a destroyed connection with nothing written.

#### A real `Response` is always streamed

`response.body` is a `ReadableStream` for any `Response` with a body, so the string and
`Uint8Array` branches inside `writeWebResponse()` are for duck-typed objects only. This
is why a plain `Response` goes out chunked.

#### `101` needs the stand-in

`new Response(null, { status: 101 })` throws before `writeWebResponse()` is reached.
Pass `Object.freeze({ status: 101 })`.

### Client side

#### The body is not carried

`toNodeRequestOptions()` has no body in its result, even for a `POST` `Request`. It also
does not carry an `AbortSignal`, and drops URL credentials (`user:pass@`) and the hash.
Use the `Request` you already have for those.

#### IPv6 literals did not connect (fixed in 0.0.1)

In 0.0.0, `hostname` was `url.hostname`, which keeps the brackets (`"[::1]"`), and
`http.request()` then failed with `ENOTFOUND getaddrinfo ENOTFOUND [::1]`. From 0.0.1 the
brackets are stripped (`"::1"`). On 0.0.0 strip them yourself:
`requestOptions.hostname = requestOptions.hostname.replace(/^\[|\]$/g, "")`.

#### Repeated `set-cookie` headers collapsed in `requestOptions.headers` (fixed in 0.0.1)

In 0.0.0 the headers object had one string per name. Most repeated headers arrive
comma-joined (`accept: "x, y"`), which is right for them, but `Set-Cookie` is the
exception: the cookies were comma-joined, which corrupts them. From 0.0.1 repeated
`set-cookie` headers are emitted as an array (via `Headers#getSetCookie()`), one element
per header, and `requestOptions.headers` is typed `Record<string, string | string[]>`.
(A request would not normally have those; a copied response header set might.)

#### `port` was a string when the URL had one (fixed in 0.0.1)

In 0.0.0 it was typed `number` but was `"8080"` for `http://a.com:8080/` (and `80`/`443`
numbers for the defaults). From 0.0.1 it is always a number. On 0.0.0 do arithmetic
only after `Number()`.

#### `method` is not normalized when you pass a URL

`{ method: "post" }` stays `post` in `requestOptions`. A `Request` object normalizes
standard methods to upper-case itself.

#### Only the `Request` class you imported counts as a `Request`

The check is `instanceof Request` against the global. A `Request` from a polyfill, or
another realm, is treated as a URL and fails in `new URL()`.

#### A relative URL throws

`toNodeRequestOptions("/x")` is a `TypeError`. There is no base URL option.

### `toWebResponse()`

#### 204, 205 and 304 rejected any body (fixed in 0.0.1)

In 0.0.0, `toWebResponse(nodeRes, anything)` for status 204 or 304 threw `TypeError` from
the `Response` constructor, even with an empty `Buffer`; on 0.0.0, pass `null`. From
0.0.1 the body is ignored (passed as `null`) for 204, 205 and 304. A `1xx` status still
throws `RangeError`.

#### Hop-by-hop headers pass through

`connection`, `keep-alive`, `transfer-encoding` and the rest are copied into the
`Response`'s headers unchanged, and `writeWebResponse()` sends them on. A proxy built from
these functions has to strip them; see [Calling out](/webwire/calling-out/#a-reverse-proxy-end-to-end).

#### The body is not decoded

If the upstream sent `content-encoding: gzip`, the header is copied and the bytes you pass
are whatever you pass. Decompress before wrapping, or forward both untouched.

## Limits

- **Written for `node:http` and `node:https`.** It takes `IncomingMessage` and
  `ServerResponse`, and its trailers are HTTP/1.1 chunked trailers. HTTP/2 is not covered
  by the tests or the docs.
- **No request building beyond options.** It will not issue a request, follow redirects,
  retry, pool connections, or enforce timeouts.
- **No body parsing**, content negotiation or compression.
- **No hop-by-hop or forwarding-header policy.** Everything is copied; policy is yours (still true in 0.0.1).
- **Node 26 or newer** by `engines`. The package is untranspiled ESM.

See [API](/webwire/api/) for exact behaviour of each function and
[Calling out](/webwire/calling-out/) for the patterns that route around these.
