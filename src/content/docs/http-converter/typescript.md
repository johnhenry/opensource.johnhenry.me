---
title: "TypeScript"
description: "Using http-converter's type definitions, including native Request/Response typing."
---

`@johnhenry/http-converter` includes TypeScript type definitions in
`types.d.ts`.

## Using with TypeScript

```typescript
import * as http from '@johnhenry/http-converter';
import type { HttpRequest, HttpResponse, HarEntry } from '@johnhenry/http-converter';

// Type-safe request creation
const request: HttpRequest = {
  method: 'POST',
  url: '/api/users',
  headers: {
    'content-type': 'application/json'
  },
  body: JSON.stringify({ name: 'Test' })
};

// Convert with full type inference
// curl.fromRequest and har.fromRequest always return a Promise
const curl: string = await http.curl.fromRequest(request);
const har: HarEntry = await http.har.fromRequest(request);
```

## Native Request/Response support

The library supports both custom HTTP objects and native Web API
`Request`/`Response` objects:

```typescript
// Using native Request
const request = new Request('https://api.example.com', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ data: 'test' })
});

// Convert native Request to cURL
const curl = await http.curl.fromRequest(request);

// Using native Response
const response = new Response('{"success":true}', {
  status: 200,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Convert native Response to HAR
const harEntry = await http.har.fromResponse(response);
```

## Type definitions

All major types are exported:

- `HttpRequest` — standard HTTP request object
- `HttpResponse` — standard HTTP response object
- `HarEntry` — HAR format entry
- `HarRequest`, `HarResponse` — HAR sub-types
- `CurlOptions` — options for cURL generation
- `FetchOptions` — options for fetch code generation

## Module types

Each module has typed exports:

```typescript
import * as string from '@johnhenry/http-converter/string';
import * as har from '@johnhenry/http-converter/har';
import * as curl from '@johnhenry/http-converter/curl';
import * as fetch from '@johnhenry/http-converter/fetch';

// All methods are fully typed
const parsed: HttpRequest = string.parseRequest('GET / HTTP/1.1\\r\\n\\r\\n');
```
