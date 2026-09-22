---
title: "API"
description: "createRouter, createRoute, HTTPExpression, createRequest/createResponse, createFSRouter, and the deconstruct/cook primitives."
---

## `createRouter(init?: RouterInit): Router`

Creates a new router instance.

```typescript
type RouterInit = {
  baseUrl?: string;
  defaultHandler?: Route;
  errorHandler?: (error: Error, request: Request) => Response | Promise<Response>;
  cache?: CacheOptions;
};
```

```javascript
import { createRouter } from "@johnhenry/letterpress";

const router = createRouter({
  baseUrl: "https://api.example.com",
  errorHandler: (error, request) => {
    console.error("Error:", error);
    return new Response("An error occurred", { status: 500 });
  },
});

router.endpoint`GET /users/:id`(async (request, { params }) => {
  // Handle the request
});
```

Returns a `Router` instance — a function usable as a request handler that
also has an `endpoint` method for defining routes. Its dispatch loop awaits
each handler, so a thrown error inside an `async` handler is caught by the
configured `errorHandler`/`defaultHandler` rather than surfacing as an
unhandled rejection.

## `createRoute(init?: RouteInit)`

Creates a route handler.

```typescript
type RouteInit = {
  headers?: HeadersInit | Headers;
  status?: number;
  statusText?: string;
  streaming?: boolean;
};
```

Returns a function that takes a template literal and returns a `Route` (a
request handler function).

```javascript
import { createRoute } from "@johnhenry/letterpress";

const userRoute = createRoute({ streaming: true })`
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": ${(_, { params }) => params.id},
  "name": "John Doe",
  "email": "john@example.com"
}
`;
```

A `${null}`/`${undefined}` substitution renders as nothing, matching
ordinary template-literal semantics — the same as a substitution *function*
that returns `undefined`. A substitution function returning a
`ReadableStream`/`Blob`/`ArrayBuffer`/`Uint8Array` streams that content
directly, rather than falling through to `.toString()`.

## `HTTPExpression`

A tagged-template function for matching HTTP requests against a
method/path/header pattern — independent of routing.

```javascript
import { HTTPExpression } from "@johnhenry/letterpress";

const expr = HTTPExpression`GET /users/:id`;

expr.test(new Request("https://example.com/users/123")); // true
expr.exec(new Request("https://example.com/users/123"));
// { id: '123', method: 'GET', headers: Headers {} }
```

It returns `{ test(request), exec(request) }` — not a constructor with
`.method`/`.path`/`.version` properties.

## `createRequest`, `createResponse`

Tagged-template functions for building `Request`/`Response` objects from
raw HTTP-message-shaped template literals.

```javascript
import { createRequest } from "@johnhenry/letterpress";

const request = await createRequest()`
GET /api/users HTTP/1.1
Accept: application/json
`;
```

```javascript
import { createResponse } from "@johnhenry/letterpress";

const response = await createResponse`
HTTP/1.1 200 OK
Content-Type: application/json

{"message": "Hello, World!"}
`;
```

## `createFSRouter`

Builds a `Router` from a filesystem-based route directory.

## `deconstruct`, `cook`

Lower-level utility functions the rest of the library is built on.

`deconstruct` breaks a template literal down into its raw pieces without
evaluating substitutions into a final string:

```javascript
import { deconstruct } from "@johnhenry/letterpress";

const { strings, substitutions, raw } = deconstruct`
POST /api/users HTTP/1.1
Content-Type: application/json

{"name": "${"John Doe"}"}
`;
```

`cook` is deconstruct's inverse — it concatenates a template literal's
strings and substitutions back into a single string:

```javascript
import { cook } from "@johnhenry/letterpress";

const message = cook`GET /api/users/${123} HTTP/1.1`;
// "GET /api/users/123 HTTP/1.1"
```

## Note on `serve` and `tagRequest`

`@johnhenry/letterpress` does not export a `serve` function or a
`tagRequest` function. To run a server, pair it with
[leserve](/leserve/) — `import serve from "@johnhenry/leserve"` — or any
server of your choice, as shown in [the quick example](/letterpress/).
