---
title: "Calling out"
description: "Guide: make outbound requests with Node's raw http/https client from Web Request objects and get Web Response objects back, buffered or streamed, including a reverse proxy."
sidebar:
  order: 4
---

The client direction uses [`toNodeRequestOptions()`](/webwire/api/#tonoderequestoptionsrequestorurl-options)
to go from a `Request` to `http.request()` options and
[`toWebResponse()`](/webwire/api/#towebresponsenoderes-body) to come back. You keep control of the
request itself, which is the point: attach socket event hooks, set timeouts, write
the body your way. If you do not need that control, Node's global `fetch()` is simpler.

## Buffered

```js
import http from "node:http";
import https from "node:https";
import { toNodeRequestOptions, toWebResponse } from "@johnhenry/webwire";

export function nodeFetch(request) {
  const { isHTTPS, requestOptions } = toNodeRequestOptions(request);
  const doRequest = isHTTPS ? https.request : http.request;
  return new Promise((resolve, reject) => {
    const req = doRequest(requestOptions, async (nodeRes) => {
      try {
        const chunks = [];
        for await (const chunk of nodeRes) chunks.push(chunk);
        resolve(toWebResponse(nodeRes, Buffer.concat(chunks)));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
    req.end();
  });
}
```

Choose `http` or `https` from `isHTTPS`: `toNodeRequestOptions()` does not pick a module
for you, and `https.request()` is needed for `https:` URLs.

## From a URL, without building a `Request`

```js
const { requestOptions } = toNodeRequestOptions("http://localhost:8000/items?id=3", {
  method: "POST",
  headers: { "content-type": "application/json" },
});
const req = http.request(requestOptions, (res) => { /* ... */ });
req.end(JSON.stringify({ name: "x" }));
```

`options` applies only to this bare-URL form. Given a `Request`, the method and
headers on it win and `options` is ignored.

## Sending a body

`toNodeRequestOptions()` returns no body, even if the `Request` has one. Write it
yourself:

```js
import { Readable } from "node:stream";

const { requestOptions } = toNodeRequestOptions(request);
const req = http.request(requestOptions, onResponse);
if (request.body) Readable.fromWeb(request.body).pipe(req);
else req.end();
```

When the `Request` was built with a body, the headers include whatever `Content-Type`
the constructor derived (a string body gives `text/plain;charset=UTF-8`), but no
`Content-Length`. Node will use chunked encoding unless you set one.

## Streaming the response

`toWebResponse()` does not read `nodeRes`, so a streamed body is just a different
argument. A Node `Readable` is accepted directly, so you can hand over `nodeRes`:

```js
const response = toWebResponse(nodeRes, nodeRes);   // streams; nothing is buffered
```

Do this only for statuses that may have a body. In 0.0.0, for `204` and `304` the
`Response` constructor threw if any body was passed, even an empty one, so branch (from
0.0.1, `toWebResponse()` does this for 204, 205 and 304 itself, and the
branch is harmless):

```js
const noBody = nodeRes.statusCode === 204 || nodeRes.statusCode === 304;
const response = toWebResponse(nodeRes, noBody ? null : nodeRes);
```

## A reverse proxy end to end

`toWebRequest()`, `toNodeRequestOptions()`, `toWebResponse()` and `writeWebResponse()`
together make a streaming proxy in a page of code:

```js
import http from "node:http";
import { Readable } from "node:stream";
import {
  toWebRequest, toNodeRequestOptions, toWebResponse, writeWebResponse,
} from "@johnhenry/webwire";

const UPSTREAM = new URL("http://localhost:9000");

http.createServer(async (req, res) => {
  let request;
  try { request = toWebRequest(req); }
  catch (err) { res.statusCode = err.status ?? 500; return res.end(); }

  const target = new URL(request.url);
  target.hostname = UPSTREAM.hostname;
  target.port = UPSTREAM.port;

  const { requestOptions } = toNodeRequestOptions(target, {
    method: request.method,
    headers: request.headers,
  });
  requestOptions.headers.host = UPSTREAM.host;           // see the note below

  const out = http.request(requestOptions, async (nodeRes) => {
    const noBody = nodeRes.statusCode === 204 || nodeRes.statusCode === 304;
    await writeWebResponse(toWebResponse(nodeRes, noBody ? null : nodeRes), res);
  });
  out.on("error", () => { if (!res.headersSent) { res.statusCode = 502; res.end(); } });

  if (request.body) Readable.fromWeb(request.body).pipe(out);
  else out.end();
}).listen(8000);
```

The body streams through in both directions and repeated `Set-Cookie` lines survive.
Two things this does *not* do, and webwire does not do for you:

- **Hop-by-hop headers are copied.** `connection`, `keep-alive` and
  `transfer-encoding` from the upstream response pass straight through to the client
  response. Strip the ones you do not want before building the `Response`.
- **The incoming `Host` header is copied too**, so without the override line above the
  upstream sees the proxy's host.

For the other direction of mixing in HTTP text formats (turning a captured request into
a `Request` in the first place), see [http-converter](/http-converter/).
