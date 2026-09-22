---
title: "API"
description: "The string, HAR, cURL, fetch, body, and random modules, plus utilities and the full exports table."
---

## String module

Parse and stringify HTTP messages:

```javascript
import * as string from '@johnhenry/http-converter/string';

// Parse request
const req = string.parseRequest(`POST /users HTTP/1.1
Host: api.example.com
Content-Type: application/json

{"name": "John Doe"}`);

// Parse response
const res = string.parseResponse(`HTTP/1.1 201 Created
Content-Type: application/json
Location: /users/123

{"id": 123, "name": "John Doe"}`);

// Stringify with absolute URL (default for absolute URLs)
// stringifyRequest/stringifyResponse/stringify always return a Promise
const httpString1 = await string.stringifyRequest({
  method: 'GET',
  url: 'https://www.example.com/path'
});
// GET https://www.example.com/path HTTP/1.1
// host: www.example.com

// Stringify with path only
const httpString2 = await string.stringifyRequest({
  method: 'GET',
  url: 'https://www.example.com/path'
}, { absoluteUrl: false });
// GET /path HTTP/1.1
// host: www.example.com
```

- `parse(httpString)` — auto-detect and parse HTTP string
- `parseRequest(requestString)` — parse HTTP request string
- `parseResponse(responseString)` — parse HTTP response string
- `stringify(httpObject)` — auto-detect and stringify HTTP object (async)
- `stringifyRequest(request)` — stringify HTTP request (async)
- `stringifyResponse(response)` — stringify HTTP response (async)

## HAR module

Convert to/from HAR (HTTP Archive) format:

```javascript
import * as har from '@johnhenry/http-converter/har';

// Convert request to HAR entry (fromRequest is async)
const harEntry = await har.fromRequest({
  method: 'GET',
  url: '/api/users',
  headers: { 'accept': 'application/json' }
});

// Convert response to HAR (can merge with request); fromResponse is async
const completeEntry = await har.fromResponse(response, request);

// Convert back to HTTP objects
const httpRequest = har.toRequest(harEntry);
const httpResponse = har.toResponse(harEntry);
```

- `fromRequest(request, options)` — convert request to HAR entry (async)
- `fromResponse(response, request, options)` — convert response to HAR
  entry (async)
- `toRequest(harEntry)` — convert HAR entry to request
- `toResponse(harEntry)` — convert HAR entry to response

`har.toResponse` decodes base64-encoded HAR content (`content.encoding ===
"base64"`, a spec-documented marker for binary/non-UTF8 bodies) rather than
returning the still-encoded blob as-is.

## cURL module

Convert between cURL commands and HTTP requests:

```javascript
import * as curl from '@johnhenry/http-converter/curl';

// Generate cURL command (fromRequest is async)
const command = await curl.fromRequest({
  method: 'POST',
  url: 'https://api.example.com/users',
  headers: { 'content-type': 'application/json' },
  body: '{"name": "Jane"}'
}, { pretty: true });

// Parse cURL command
const request = curl.toRequest(`curl -X POST 'https://api.example.com/users' \
  -H 'Content-Type: application/json' \
  -d '{"name": "Jane"}'`);

// Generate fetch() code
const fetchCode = curl.toFetchCode(command);
```

- `fromRequest(request, options)` — convert request to cURL command (async)
- `toRequest(curlCommand)` — parse cURL command to request, via a
  character-level tokenizer with correct single/double-quote and
  backslash-escape handling (including Chrome/Firefox's "Copy as cURL"
  escaped-apostrophe pattern, `'it'\''s'`) — throws on non-cURL input or an
  unterminated quote rather than silently mangling it
- `toFetchCode(curlCommand)` — generate `fetch()` code from cURL

## Fetch module

Convert between Fetch API and HTTP objects:

```javascript
import * as fetch from '@johnhenry/http-converter/fetch';

// Convert to Fetch parameters (fromRequest is async)
const { url, options } = await fetch.fromRequest({
  method: 'POST',
  url: '/api/users',
  headers: { 'content-type': 'application/json' },
  body: '{"name": "Alice"}'
});

// Use with fetch()
const response = await fetch(url, options);

// Convert Response to HTTP object
const httpResponse = await fetch.toResponse(response, true);

// Generate fetch() code (toCode is async)
const code = await fetch.toCode(request, { pretty: true, async: true });
```

- `fromRequest(request)` — convert request to Fetch parameters (async)
- `toRequest(url, options)` — convert Fetch parameters to request
- `fromResponse(response, body)` — convert response to Fetch-like object
- `toResponse(fetchResponse, includeBody)` — convert Fetch `Response` to
  HTTP object (async)
- `toCode(request, options)` — generate `fetch()` code (async); every
  interpolated string is built with `JSON.stringify()`, not manual quote
  wrapping, so a value containing a single quote (`?q=O'Brien`) still
  generates syntactically valid JavaScript
- `createMockResponse(httpResponse)` — create mock `Response` object

## Utilities

Available both as the root package export
(`import { parseQueryString } from '@johnhenry/http-converter'`) and via
the `@johnhenry/http-converter/core/utils` subpath.

```javascript
import { detectType, normalizeHeaders } from '@johnhenry/http-converter';

// Auto-detect format type
detectType('GET / HTTP/1.1'); // 'request'
detectType('HTTP/1.1 200 OK'); // 'response'
detectType('curl -X GET'); // 'curl'
detectType({ log: {}, entries: [] }); // 'har'

// Normalize headers from various formats
normalizeHeaders({ 'Content-Type': 'text/html' });
normalizeHeaders([{ name: 'Content-Type', value: 'text/html' }]); // HAR format
normalizeHeaders(new Headers({ 'Content-Type': 'text/html' })); // Fetch Headers
```

- `detectType(input)` — detect format type
- `normalizeHeaders(headers)` — normalize headers to plain object
- `parseQueryString(url)` — parse URL query parameters
- `buildUrl(baseUrl, queryParams)` — build URL with query parameters
- `getByteSize(str)` — calculate byte size of string
- `formatHeaders(headers)` — format headers object as an HTTP header block

## Body module

Parse request/response bodies with automatic format detection:

```js
import { parseBody } from '@johnhenry/http-converter/body';

const parsed = parseBody('{"hello":"world"}', 'application/json');
// { type: 'json', formatted: '{\n  "hello": "world"\n}', raw: '...' }
```

`parseBody(text, contentType?)` detects JSON, XML, HTML, form-encoded, or
plain text, and returns `{ type, formatted, raw }`.

## All formats in one call

```js
import { allFormats } from '@johnhenry/http-converter';
const formats = await allFormats(request);
// { httpString, curl, fetchCode, har }
```

`allFormats(request, options?)` generates all format representations (HTTP
string, cURL, fetch code, HAR) for a request in one call.

## Random module

Generate random HTTP requests for testing, demos, and development:

```js
import { randomRequest, randomMethod, randomPath, randomHeaders, randomBody } from '@johnhenry/http-converter/random';

// Generate a random request
const req = randomRequest();
// { method: 'POST', url: '/api/users/4217', headers: {...}, body: '{"name":"Alice",...}', httpVersion: '1.1' }

// Deterministic output with seed
const seeded = randomRequest({ seed: 42 });

// Generate multiple requests
const batch = randomRequest({ count: 10 });

// Constrain methods
const getOnly = randomRequest({ methods: ['GET'] });

// Custom options
const custom = randomRequest({
  methods: ['POST', 'PUT'],
  baseUrl: 'https://api.example.com',
  headers: { 'authorization': 'Bearer my-token' },
  body: { custom: 'payload' },
});
```

`randomRequest(options?)` returns an `HttpRequest` object (or array when
`count` is set). Seeded output (`seed`) is byte-identical across repeated
calls and round-trips cleanly through `string`/`curl` conversion.

Options:

- `seed` (number) — deterministic PRNG seed
- `methods` (string[]) — allowed HTTP methods (default: weighted pool
  favoring GET/POST)
- `paths` (string[] | function) — path templates with `:id` interpolation,
  or generator `(rng) => string`
- `headers` (boolean | object) — `true`=generate, `false`=empty,
  object=use as-is
- `body` (boolean | string | object | function) — `true`=auto
  (method-aware), `false`=none, string/object=use directly,
  function=`(rng, method) => string`
- `baseUrl` (string) — URL prefix
- `count` (number) — return array of N requests

`randomMethod(options?)`, `randomPath(options?)`, `randomHeaders(options?)`,
and `randomBody(options?)` are the individual generators behind
`randomRequest`, and accept the same relevant options.

## Exports

| Export | Description |
|--------|-------------|
| `@johnhenry/http-converter` | Core: `detectType`, `normalizeHeaders`, `allFormats`, `parseQueryString`, `buildUrl`, `getByteSize`, `formatHeaders` |
| `@johnhenry/http-converter/string` | HTTP string parsing and stringification |
| `@johnhenry/http-converter/har` | HAR format conversion |
| `@johnhenry/http-converter/curl` | cURL command conversion |
| `@johnhenry/http-converter/fetch` | Fetch API conversion |
| `@johnhenry/http-converter/body` | Body parsing and formatting |
| `@johnhenry/http-converter/random` | Random HTTP request generation |
