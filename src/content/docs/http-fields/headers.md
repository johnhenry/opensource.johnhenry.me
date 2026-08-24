---
title: "Header helpers"
description: "Typed parsers for real headers built on Structured Fields: Priority, Cache-Status, Accept-CH, Sec-CH-UA, No-Vary-Search."
---

The core module parses the *generic* RFC 8941/9651 grammar. The
`@johnhenry/http-fields/headers` subpath maps that generic result into named,
typed fields for real headers built on Structured Field Values — and back:

```javascript
import {
  parsePriority,       // RFC 9218:  "u=2, i" → { urgency: 2, incremental: true }
  serializePriority,
  parseCacheStatus,    // RFC 9211:  'CDN; hit; ttl=545' → [{ cache, hit, ttl, … }]
  serializeCacheStatus,
  parseAcceptCH,       // RFC 8942:  "Sec-CH-UA-Platform, Device-Memory" → [names]
  parseSecCHUA,        // UA Client Hints: '"Chromium";v="112"' → [{ brand, version }]
  parseNoVarySearch,   // HTML spec: 'params, except=("q")' → { keyOrder, params, except }
} from "@johnhenry/http-fields/headers";
```

```javascript
parseCacheStatus('OriginCache; fwd=stale; fwd-status=304, CDN; hit; ttl=545');
// → [
//     { cache: "OriginCache", hit: false, stored: false, collapsed: false,
//       fwd: "stale", fwdStatus: 304 },
//     { cache: "CDN", hit: true, stored: false, collapsed: false, ttl: 545 },
//   ]
```

## The two-tier error model

This is the part worth internalizing, because the two tiers behave
differently on purpose:

- **Syntactically invalid Structured Field Values throw** — same strict
  behavior as the core `parse()`. A malformed `Priority` header is an error.
- **Semantically out-of-spec members are silently normalized** per each
  header's own RFC. A `Priority` urgency of `9` (valid grammar, outside the
  defined 0–7 range) doesn't throw — it falls back to the default `3`,
  because that's what RFC 9218 says a recipient must do.

So "it didn't throw" does not mean "the sender's value survived". If you need
to detect out-of-range senders, parse with the core module and inspect the
raw result; the helpers deliberately give you the *effective* value.
