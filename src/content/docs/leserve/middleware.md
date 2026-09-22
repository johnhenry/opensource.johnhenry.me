---
title: "Middleware & helpers"
description: "Body parsing, response helpers, authentication middleware, middleware composition, and the test harness."
---

Everything on this page is built around the same `(Request) => Response`
handler shape `serve()` expects, so it all composes with `compose()` and
with each other.

## Body parsing & response helpers

```js
import { json, text, form, buffer, respond, error, redirect } from "@johnhenry/leserve/body";
```

### Request parsing

```js
const handler = async (request) => {
  const data = await json(request);              // parse JSON body
  const body = await text(request, { limit: 1024 }); // with size limit
  const formData = await form(request);          // parse FormData
  const raw = await buffer(request);             // parse ArrayBuffer
};
```

The `limit` option (bytes) throws with `{ status: 413 }` when exceeded — the
body is streamed and counted, not fully buffered before the check runs.

### Response helpers

```js
respond({ ok: true })               // → 200 JSON response
respond({ id: 1 }, { status: 201 }) // → 201 JSON response
error("Not found", 404)             // → 404 JSON error
redirect("/login")                  // → 302 redirect
```

## Authentication middleware

```js
import { basicAuth, bearerAuth, apiKeyAuth } from "@johnhenry/leserve/auth";
```

Each factory takes a validation function and returns a handler wrapper:

```js
const requireAuth = bearerAuth(async (token) => token === process.env.SECRET);
const handler = requireAuth((request) => respond({ ok: true }));
```

### `basicAuth(validate)`

```js
basicAuth(async (username, password, request) => {
  return username === "admin" && password === "secret";
});
```

### `bearerAuth(validate)`

```js
bearerAuth(async (token, request) => {
  return token === process.env.API_TOKEN;
});
```

### `apiKeyAuth(validate, options?)`

```js
apiKeyAuth(async (key, request) => {
  return key === process.env.API_KEY;
}, { header: "x-api-key" }); // default header
```

A malformed (non-base64) `Authorization: Basic` header, or one missing the
`:` separator, correctly returns `401` rather than throwing a raw 500.

## Middleware composition

```js
import { compose } from "@johnhenry/leserve/compose";
```

Chain middleware and a base handler — all in the `(Request) => Response`
shape used by `serve()` — into a single handler:

```js
const app = compose(withCache(), requireAuth, handler);
serve(app, { port: 3000 });
```

### `compose(...fns)`

- Each middleware has the signature `(next) => (request, ctx) => Response`.
- The last argument is the base handler: `(request, ctx) => Response`.
- Middleware run in the order passed, each wrapping the next, with the base
  handler innermost — the same composition order used by `onWebSocket()`
  and `@johnhenry/leserve/auth`.

## Test harness

```js
import { testHandler } from "@johnhenry/leserve/test-harness";
```

Test `(Request) => Response` handlers without starting a server:

```js
import { describe, it } from "node:test";
import assert from "node:assert";

const app = testHandler(myHandler);

const res = await app.get("/users");
assert.strictEqual(res.status, 200);

const res2 = await app.post("/users", { name: "Ada" });
const body = await res2.json();
assert.strictEqual(body.name, "Ada");
```

Methods: `app.get()`, `app.head()`, `app.post()`, `app.put()`, `app.patch()`,
`app.delete()`. Objects and strings passed as a body are auto-serialized
with the appropriate `content-type`.
