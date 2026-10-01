---
title: "Errors"
description: "SafeFragmentError, isSafeFragmentError and every stable error code, matching src/errors.ts."
sidebar:
  order: 103
---

`SafeFragmentError#code` (also a `reject` event's `detail.code`, and `RenderResult#error.code`) is a stable string enum: switch on
it, **not** on `.message`. Message text may change between patch versions; codes will not, except via a major bump.

## `SafeFragmentError`

```ts
class SafeFragmentError extends Error {
  readonly code: SafeFragmentErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: SafeFragmentErrorCode, message: string, options?: { cause?: unknown; details?: Record<string, unknown> });
}
```

`name` is `"SafeFragmentError"`. `instanceof SafeFragmentError` holds across the ESM and CJS builds (and across realms): the class
defines `Symbol.hasInstance` by duck-typing instead of the prototype chain.

## `isSafeFragmentError(value)`

A type guard, safe across realms: checks the shape (an object with `code`, `message` and `name === "SafeFragmentError"`), not
`instanceof`.

## Error codes

`SafeFragmentErrorCode` has these 22 members. "Surfaces as" says where you meet each one: a `reject` event (and a rejected
`render()` result), a thrown error from a function, or the `render()` result only.

### Source resolution

| Code | Surfaces as | Meaning |
| --- | --- | --- |
| `AMBIGUOUS_SOURCE` | `reject` | More than one markup source while `strict`. |
| `NO_SOURCE` | `reject` | No `.html`, `<template>`, `src` or `content`. |
| `INVALID_SOURCE` | `reject`, throw | The source is not a string (never rendered as `[object Object]`). |
| `SOURCE_TOO_LARGE` | `reject`, throw | The source exceeds `maxInputLength`, which bounds the sanitizer's worst-case cost. |

### Profiles

| Code | Surfaces as | Meaning |
| --- | --- | --- |
| `UNKNOWN_PROFILE` | `reject`, throw | The profile is missing or not registered. |
| `PROFILE_MISMATCH` | throw (`registerProfile`) | A `-vN` name suffix disagrees with `version` (for example `"x-v2"` declaring version 1). |
| `INVALID_PROFILE` | throw | A profile definition, or `registerProfile`/`deriveProfile`/`unregisterProfile` arguments, are missing or invalid, or collide with a built-in. |

### Sanitization

| Code | Surfaces as | Meaning |
| --- | --- | --- |
| `SANITIZE_FAILED` | `reject`, throw | The engine threw while sanitizing. |
| `SANITIZER_UNAVAILABLE` | `reject`, throw | DOMPurify is needed but cannot be loaded (the message says how to fix it). |
| `SANITIZER_NOT_READY` | throw (`sanitizeToFragmentSync`) | No engine is ready synchronously; call `preloadSanitizer()`. |

### Remote `src` fetch policy

| Code | Surfaces as | Meaning |
| --- | --- | --- |
| `FETCH_DISABLED` | `reject` | `src` used without enabling the fetch capability. |
| `FETCH_ORIGIN_NOT_ALLOWED` | `reject` | The URL's origin is neither the page's nor in `allowedOrigins` (also: a non-http(s) scheme). |
| `FETCH_REDIRECT_NOT_ALLOWED` | `reject` | With `followRedirects`, the final origin is not allowed. |
| `FETCH_SIZE_EXCEEDED` | `reject` | The body exceeds `maxBytes` (header or streamed). |
| `FETCH_TIMEOUT` | `reject` | The fetch, including reading the body, exceeded `timeoutMs`. |
| `FETCH_ABORTED` | `render()` result only | `clear()`, disabling, disconnecting or page hide cut the fetch short. No event. |
| `FETCH_FAILED` | `reject` | Network failure (including mid-stream, and a refused redirect). |
| `FETCH_NON_2XX` | `reject` | The response was not ok. |
| `FETCH_SUPERSEDED` | `render()` result only | A newer render overtook the fetch. No event. |

### Element and environment state

| Code | Surfaces as | Meaning |
| --- | --- | --- |
| `DISABLED` | `reject`, `render()` result | `render()` was called on a disabled element. |
| `UNSUPPORTED_ENVIRONMENT` | throw | A `register*`, `preloadSanitizer` or `sanitizeToFragment` call without a DOM. |
| `RENDER_ABORTED` | `reject`, `render()` result | A `before-render` listener cancelled the render. |
