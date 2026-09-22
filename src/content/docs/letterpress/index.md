---
title: "letterpress"
description: "A tagged-template-string HTTP routing library — define and match request handlers with plain JavaScript syntax, no config objects or decorators."
---

**`@johnhenry/letterpress`** is a routing library built around tagged
template strings: a route's method, path, and even response body can be
written as one literal template rather than assembled from config objects.
It doesn't run a server itself — pair it with [leserve](/leserve/)'s
`serve()` (or any server of your choice) to actually listen for requests.

> Previously published as `leroute`, last unscoped version `0.0.1`. Now
> `@johnhenry/letterpress`, restarting at `0.0.0`.

Letterpress works great with [leserve](/leserve/) — this package carries an
explicit devDependency on `@johnhenry/leserve`, and every usage example
below runs its router through leserve's `serve()`.

## Install

```sh
npm install @johnhenry/letterpress
```

## Quick example

```javascript
import serve from "@johnhenry/leserve";
import { createRouter, createRoute } from "@johnhenry/letterpress";

const router = createRouter();

// A route defined as one tagged template: method, path, and response body.
router.endpoint`GET /``
<!DOCTYPE html>
<html lang="en">
  <body>
    <h1>Welcome to Letterpress</h1>
    <p>The current time is: ${() => new Date().toISOString()}</p>
  </body>
</html>
`;

// Route parameters are just template placeholders in the path.
router.endpoint`GET /user/:id``
<!DOCTYPE html>
<html lang="en">
  <body>
    <h1>User Profile</h1>
    <p>User ID: ${(_, { params }) => params.id}</p>
  </body>
</html>
`;

serve({ port: 8080 }, router);
```

A route handler doesn't have to be a template — a plain function works too,
for cases better expressed as code than markup:

```javascript
router.endpoint`GET /api/data`(async (request) => {
  const data = { message: "Hello, World!", timestamp: new Date().toISOString() };
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
```

Route patterns can also match on headers, not just method and path:

```javascript
router.endpoint`GET /protected [Authorization: Bearer *]``
HTTP/1.1 200 OK
Content-Type: text/plain

This is a protected resource
`;
```

And a router accepts a custom `errorHandler`:

```javascript
const errorHandler = (error, request) => {
  console.error("Error:", error);
  return new Response("An error occurred", { status: 500 });
};

serve({ port: 8080 }, router, { errorHandler });
```

## What's in it

- **`createRouter`** / **`createRoute`** — build a router and individual
  route handlers.
- **`HTTPExpression`** — a tagged-template function for matching requests
  against a method/path/header pattern, independent of routing.
- **`createRequest`** / **`createResponse`** — build `Request`/`Response`
  objects from raw HTTP-message-shaped template literals.
- **`createFSRouter`** — build a `Router` from a filesystem-based route
  directory.
- **`deconstruct`** / **`cook`** — the lower-level tagged-template
  primitives the rest of the library is built on.

See [API](/letterpress/api/) for the full reference.

## License

MIT

## Source

[github.com/johnhenry/letterpress](https://github.com/johnhenry/letterpress)
