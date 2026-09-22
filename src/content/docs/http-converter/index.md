---
title: "http-converter"
description: "A modern, browser-compatible HTTP format converter library. Transform between HTTP strings, HAR (HTTP Archive), cURL commands, and Fetch API calls."
---

**`@johnhenry/http-converter`** is a modern, browser-compatible HTTP format
converter. It transforms between HTTP strings, HAR (HTTP Archive), cURL
commands, and Fetch API calls — bidirectionally, with auto-detection of
which format a given input is.

> **Provenance:** adopted into the `@johnhenry` npm scope — the unscoped
> `http-converter` name is held by an unrelated, empty package from another
> author, so this is this library's first real npm release, not a
> re-publish. Version restarts at `0.0.0` per the family's scope-adoption
> convention (a new address is a new era), independent of the library's
> actual maturity: 103 tests and a real bug-fix history predate the scope
> move — see the
> [CHANGELOG](https://github.com/johnhenry/http-converter/blob/main/CHANGELOG.md)
> for the fixes that shipped alongside it (a corrupting cURL tokenizer, HAR
> entries that crashed on spec-legal optional fields, CRLF bodies mangled
> on round-trip, and more).

- **Browser-first**: no Node.js dependencies, works in any modern browser
- **Tree-shakeable**: import only what you need, via subpath exports
- **Bidirectional conversions**: convert between any supported format
- **TypeScript support**: full type definitions included
- **Auto-detection**: automatically identifies format types
- **Native API support**: works with `Request`/`Response` objects

## Install

```sh
npm install @johnhenry/http-converter
```

## Quick example

```javascript
import * as http from '@johnhenry/http-converter';

// Parse HTTP string
const request = http.string.parse(`GET /api HTTP/1.1
Host: example.com

`);

// Convert to cURL (fromRequest is async)
const curl = await http.curl.fromRequest(request);
console.log(curl);
// curl 'https://example.com/api' -H 'host: example.com'

// Convert to HAR (fromRequest is async)
const harEntry = await http.har.fromRequest(request);

// Convert to Fetch (fromRequest is async)
const { url, options } = await http.fetch.fromRequest(request);
const response = await fetch(url, options);
```

Every `fromRequest`/`fromResponse`/`stringify*` function is `async` — they
must support native `Request`/`Response` inputs, which require awaiting
`.text()`.

## The pages here

- [API](/http-converter/api/) — the `string`, `har`, `curl`, `fetch`,
  `body`, and `random` modules, plus utilities and the full exports table
- [TypeScript](/http-converter/typescript/) — using the library's type
  definitions, including native `Request`/`Response` typing

## Browser support

This library uses modern JavaScript features: ES Modules, the
`TextEncoder` API, the URL API, and the Headers API (for Fetch
conversions). `Request`/`Response` support is optional. Supported in all
modern browsers (Chrome 61+, Firefox 60+, Safari 10.1+, Edge 79+).

## License

MIT

## Source

[github.com/johnhenry/http-converter](https://github.com/johnhenry/http-converter)
