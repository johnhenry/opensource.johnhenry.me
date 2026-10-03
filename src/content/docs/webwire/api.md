---
title: "API"
description: "Every export of @johnhenry/webwire: toWebRequest, toWebResponse, writeWebResponse, toNodeRequestOptions, setTrailers and getTrailers, with signatures, options, return values and errors."
sidebar:
  order: 2
---

Six functions, all exported from the package root and from their own subpaths. Types
are in `index.d.ts`. Where the shipped types and the behaviour disagree, this page
says so.

| Export | Subpath | Direction |
|---|---|---|
| `toWebRequest` | `@johnhenry/webwire/to-web-request` | server `IncomingMessage` → `Request` |
| `toWebResponse` | `@johnhenry/webwire/to-web-response` | client `IncomingMessage` → `Response` |
| `writeWebResponse` | `@johnhenry/webwire/write-web-response` | `Response` → `ServerResponse` |
| `toNodeRequestOptions` | `@johnhenry/webwire/to-node-request-options` | `Request` or URL → `http.request()` options |
| `setTrailers`, `getTrailers` | `@johnhenry/webwire/trailers` | attach and read `Response` trailers |

## `toWebRequest(req, options?)`

```ts
function toWebRequest(
  req: import("http").IncomingMessage,
  options?: { attachRaw?: boolean; hostHeaders?: string[] },
): Request;
```

Converts the `req` of `server.on("request", (req, res) => ...)` into a Web `Request`.
Synchronous.

**Options**

- `attachRaw` (`boolean`, default `false`): attach `req` to the `Request` as a
  non-enumerable `.raw` property, so middleware can reach the socket (for WebSocket
  upgrades, say). It does not show up in `Object.keys()`.
- `hostHeaders` (`string[]`, default `["host"]`): header names to read the host from,
  in priority order. The first one present with a non-empty value wins; if none is
  present the host is `localhost`. A reverse proxy usually wants
  `["x-forwarded-host", "host"]`. Names are matched case-insensitively (they are lower-cased
  internally, because Node lower-cases incoming header names). That is **0.0.1**
  behaviour; in 0.0.0 you must write them lower-case (see
  [Limitations](/webwire/limitations/#hostheaders-was-case-sensitive-fixed-in-001)).

**How the `Request` is built**

- The URL is `new URL(req.url, scheme + "://" + host)`. From 0.0.1
  the scheme is `https` when `req.socket.encrypted` is true and `http` otherwise;
  0.0.0 always used `http`. `X-Forwarded-Proto` is never consulted. An absolute-form
  request target (`GET http://other/x`) or a `//host/path` target replaces the host.
- The method and all headers are copied from `req`.
- For any method other than `GET` and `HEAD`, the body is `req` itself (with
  `duplex: "half"`), so it is streamed, not buffered, and reading it consumes `req`. `GET`
  and `HEAD` requests have `request.body === null`, even if the client sent a body.

**Errors**

- If `req.url` does not form a valid URL, throws an `Error` with `message` `Invalid request URL: <req.url>`,
  `.status = 400` and `.cause` set to the original `TypeError`.
- Anything the `Request` constructor rejects is not wrapped. For example, a `CONNECT`
  or `TRACE` request throws a plain `TypeError` (`'CONNECT' HTTP method is unsupported`),
  with no `.status`.

## `toWebResponse(nodeRes, body?)`

```ts
function toWebResponse(
  nodeRes: import("http").IncomingMessage,
  body?: BodyInit | null,
): Response;
```

Converts the response Node gives you from an **outbound** `http.request()` (the `res` in
`http.request(url, (res) => ...)`) into a Web `Response`. Synchronous.

It copies `statusCode`, `statusMessage` (as `statusText`) and the headers, and wraps
whatever you pass as `body`. **It never reads `nodeRes`.** Buffer it, stream it, transform
it, or omit it, and pass the result in. An omitted or `null` body gives a bodyless
`Response`.

Header handling: array-valued headers (`set-cookie` is the one Node gives you as an
array) are appended one by one, so `response.headers.getSetCookie()` returns every
cookie; other headers are set as given.

**Errors**: none of its own, but the `Response` constructor is strict and its errors
pass straight through:

- In 0.0.0, a `204` or `304` status with any body, including an empty `Buffer`, threw
  `TypeError`. From 0.0.1 the body is ignored (passed as `null`) for
  204, 205 and 304.
- A status outside 200 to 599 (a `1xx`) throws `RangeError`.
- A body the `Response` constructor does not accept throws `TypeError`. A Node
  `Readable` is accepted (it is an async iterable); a web `ReadableStream` must yield
  `Uint8Array` chunks, not strings.

## `writeWebResponse(response, res, options?)`

```ts
function writeWebResponse(
  response: Response | { status: 101 },
  res: import("http").ServerResponse,
  options?: { onError?: (error: Error) => void },
): Promise<void>;
```

Writes a `Response` out through a `ServerResponse`: status, headers, body, trailers,
then `res.end()`. Resolves when the response has been written. Call it once per `res`.

**Status.** `res.statusCode` is set from `response.status`. From 0.0.1
a non-empty `response.statusText` is also written as the reason phrase; 0.0.0 never
wrote it, and an empty one always uses Node's default phrase for the code.

**Headers.** Same-named headers are collected and passed to `res.setHeader()` as an
array, so repeated `Set-Cookie` headers go out as separate header lines instead of one
comma-joined line.

**Body.** For a real `Response`, `response.body` is a `ReadableStream` (or `null`),
which is piped to `res` with backpressure. The function also accepts duck-typed
objects whose `body` is a string, a `Uint8Array`, a Node `Readable` (anything with
`.pipe()`), or anything else (written via `String()`). Those shapes only come up when
you pass your own object instead of a `Response`.

**Trailers.** After the body is written, if `getTrailers(response)` returned a promise,
it is awaited, converted with `new Headers(...)`, and sent with `res.addTrailers()`
before `res.end()`. See [`setTrailers()`](#settrailersresponse-trailers--gettrailersresponse).

**`status === 101`.** Returns immediately without touching `res`. A real `Response`
cannot have that status (the constructor throws outside 200 to 599), so pass a duck-typed
`Object.freeze({ status: 101 })` to signal "a WebSocket upgrade, handled elsewhere".

**Options**

- `onError(error)`: called, not thrown, when writing a *streamed* body fails after
  headers are sent: the source stream errors, the client disconnects mid-body
  (`ERR_STREAM_PREMATURE_CLOSE`), or a trailers promise rejects. Defaults to
  `console.error("Error streaming response body:", err)`. After `onError` runs the
  connection is destroyed with `res.destroy(err)` and the returned promise **still
  resolves**.

**Errors.** Failures before the body starts reject the promise: `res.setHeader()`
throws for an invalid header name or value (for example `ERR_INVALID_HTTP_TOKEN`).
For a stream body, nothing is thrown afterwards; use `onError`.

## `toNodeRequestOptions(requestOrUrl, options?)`

```ts
function toNodeRequestOptions(
  requestOrUrl: Request | string | URL,
  options?: { method?: string; headers?: HeadersInit },
): {
  url: URL;
  isHTTPS: boolean;
  requestOptions: {
    hostname: string;
    port: number;
    path: string;
    method: string;
    headers: Record<string, string | string[]>;
  };
};
```

Converts a `Request`, or a bare URL plus `{ method, headers }`, into the pieces for an
outbound `http.request()` / `https.request()` call. Synchronous. It returns **plain data,
not a live request**, so you choose when and how to issue it.

- If `requestOrUrl` is a `Request` (checked with `instanceof Request`), its URL, method
  and headers are used and `options` is ignored.
- Otherwise it is passed to `new URL()`, with `options.method` (default `"GET"`) and
  `options.headers` (any `HeadersInit`).

**Return value**

- `url`: the parsed `URL`.
- `isHTTPS`: `url.protocol === "https:"`. Any other protocol (`ws:`, `ftp:`) is `false`.
- `requestOptions.hostname`: `url.hostname` with IPv6 brackets stripped (`[::1]` becomes
  `::1`). In 0.0.0 the brackets were kept and `http.request()` failed with `ENOTFOUND`.
- `requestOptions.port`: always a number: the URL's explicit port, else `443` or `80`.
  In 0.0.0 an explicit port was the string `"8080"`, although `index.d.ts` typed it as
  `number`.
- `requestOptions.path`: pathname plus search. The hash is dropped.
- `requestOptions.method`: as given. It is **not** upper-cased when you pass lower-case
  to `options.method`.
- `requestOptions.headers`: a plain object with lower-case keys. A `Headers` instance is
  not accepted by `http.request()` as it is, which is why this conversion exists.
  Repeated `set-cookie` headers are an array (one element per header) from 0.0.1;
  0.0.0 collapsed them.

**Errors**: `new URL()` throws `TypeError` (`ERR_INVALID_URL`) for a relative or
unparseable URL. Nothing is validated beyond that.

**What it does not carry**: the request body, URL credentials (`user:pass@`), and
the abort signal. See [Calling out](/webwire/calling-out/).

## `setTrailers(response, trailers)` / `getTrailers(response)`

```ts
function setTrailers(
  response: Response,
  trailers: HeadersInit | Promise<HeadersInit>,
): void;

function getTrailers(response: Response): Promise<HeadersInit> | undefined;
```

HTTP trailers are not part of the Fetch model: a `Response` has no `trailers`.
`setTrailers()` attaches some to a `Response` you are about to return, held in a
module-level `WeakMap` keyed by that `Response` object. `getTrailers()` returns the
(always promise-wrapped) value, or `undefined` if none were set. `writeWebResponse()`
is the consumer.

Pass a `Promise` when the trailer is computed from the streamed body, such as a running
checksum or `Server-Timing`. It is awaited only after the body has finished. Calling
`setTrailers()` again on the same `Response` replaces the earlier value.

Trailers only travel on chunked responses; see
[Limitations](/webwire/limitations/#trailers-are-silently-dropped-if-the-response-has-a-content-length).
