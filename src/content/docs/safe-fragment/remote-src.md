---
title: "Remote src"
description: "The src fetch capability: disabled by default, GET-only, origin-allowlisted, redirect-refusing, time- and size-capped, and never able to overwrite a newer render."
sidebar:
  order: 5
---

`<safe-fragment src="...">` can fetch its markup from a URL. The capability is **disabled by default**: using `src` without
enabling it rejects with `FETCH_DISABLED`. Enable it explicitly, with an origin allowlist:

```ts
registerSafeFragment({
  fetch: {
    enabled: true,
    allowedOrigins: ["https://cdn.example.com"], // same-origin is always allowed once enabled
    maxBytes: 250_000, // default
    timeoutMs: 8_000, // default; stays armed until the body is fully read
    followRedirects: false, // default: redirects are refused (redirect: "error")
  },
  maxInputLength: 1_000_000, // default; applies to every source, not just src
});
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Turn the capability on. |
| `allowedOrigins` | `[]` | Cross-origin origins (for example `"https://cdn.example.com"`) allowed in addition to the page's own origin. Same-origin is always allowed once enabled; nothing else is, unless listed. |
| `maxBytes` | `250000` | Hard cap on response body size, in bytes. |
| `timeoutMs` | `8000` | Abort the fetch if it has not completed within this many milliseconds. |
| `followRedirects` | `false` | Opt in to following redirects. |

`maxInputLength` (default 1,000,000 UTF-16 code units) is separate and applies to every markup source; the fetch's own byte cap
is smaller.

## What the fetch does

- **GET only**, and not configurable: there is no parameter to request another method. `credentials: "same-origin"`.
- **Only `http:` and `https:` URLs** are fetchable; any other scheme rejects with `FETCH_ORIGIN_NOT_ALLOWED`. The `src` value is
  resolved against `document.baseURI`; an unresolvable one is `FETCH_FAILED`.
- **Origin check.** The URL's origin must be the page's own or listed in `allowedOrigins`, else `FETCH_ORIGIN_NOT_ALLOWED`.
- **Non-2xx responses** reject with `FETCH_NON_2XX` (the status is in `details`).

## Redirects

Redirects are **refused** by default (`redirect: "error"`), which surfaces as `FETCH_FAILED`. A same-origin endpoint (or an
allowed CDN) that redirected elsewhere would otherwise make an unlisted origin's markup render. With `followRedirects: true`, the
final `response.url` origin is re-validated against the same-origin and `allowedOrigins` policy after the fetch, and a redirect to
any other origin rejects with `FETCH_REDIRECT_NOT_ALLOWED`.

## Timeouts

The timeout stays armed **until the body is fully read**, so a server that sends headers and then stalls cannot hold a render
open. Exceeding it rejects with `FETCH_TIMEOUT`. Network and abort failures, including mid-stream ones, map to `FETCH_FAILED`,
`FETCH_ABORTED` or `FETCH_TIMEOUT`, never to a sanitize error.

## Size limits

The size cap is enforced twice: against `Content-Length` up front, and **while streaming**, because a header can lie or be
absent. Either way the result is `FETCH_SIZE_EXCEEDED`. The fetched text then still goes through the `maxInputLength` check and
the full sanitization pipeline like any other source.

## Superseded and aborted fetches

Each render has its own `AbortController` and token. The previous one is aborted when a new render starts, and every `await`
re-checks both, so **a stale fetch can never overwrite a newer render**. A render overtaken by a newer one resolves `superseded`
with `FETCH_SUPERSEDED`; an abort from `clear()`, disabling, disconnecting or the element's window going away resolves
`superseded` with `FETCH_ABORTED`. Neither emits an event. See [the render result](/safe-fragment/element/#the-render-result).

With `loading="lazy"` the fetch is deferred until the element intersects the viewport.

## Related

Every code above is listed in [Error codes](/safe-fragment/api/errors/). The exported `FetchCapability` type and
`DEFAULT_FETCH_CAPABILITY` constant are in the [API reference](/safe-fragment/api/).
