---
title: "URL policy: checkUrl"
description: "Reference for checkUrl, UrlCheckResult, SAFE_DEFAULT_URL_SCHEMES and RELATIVE_URL_SCHEME: URL scheme allowlisting with the platform URL parser, never regex."
sidebar:
  order: 104
---

`checkUrl` is the URL-scheme policy every URL-valued attribute goes through during `enforceProfile`. It is exported so you can
apply the same judgement to your own values. It uses the platform `URL` parser, **never regex**: regex scheme checks are a
recurring bypass vector (control characters, tabs or newlines inside the scheme, mixed-case `JaVaScRiPt:`, leading whitespace),
and the WHATWG parser normalizes exactly what browsers' own navigation does. A value it cannot get a scheme out of is blocked,
never treated as relative.

## `checkUrl(rawValue, allowedSchemes, base?)`

```ts
import { checkUrl } from "@johnhenry/safe-fragment";

checkUrl("https://example.com/", ["relative", "https:"]); // { allowed: true,  scheme: "https:" }
checkUrl("/docs/page", ["relative", "https:"]);           // { allowed: true,  scheme: "relative" }
checkUrl("javascript:alert(1)", ["relative", "https:"]);  // { allowed: false, scheme: "javascript:" }
```

| Parameter | Meaning |
| --- | --- |
| `rawValue` | An attribute value taken verbatim from markup. |
| `allowedSchemes` | Allowed schemes: the literal `"relative"` and/or schemes including the trailing colon (`"https:"`, `"mailto:"`), matching `URL#protocol`. |
| `base` | The URL of the document the markup will be inserted into (`document.baseURI`). Optional. |

It returns a [`UrlCheckResult`](#types).

### How a value is judged

1. An empty (after trimming) value is `"relative"`.
2. If `new URL(value)` succeeds with no base, the value is absolute and its `.protocol` is authoritative. This covers
   `javascript:`, `data:`, `vbscript:`, `file:`, `https:`, including whitespace and control-character-obfuscated variants.
3. Otherwise it is resolved against a fixed probe base. If scheme and host are unchanged, the value carried neither: it is a
   same-document path, query or fragment reference, judged against the `"relative"` allowance.
4. A different host means an **authority-bearing** reference: protocol-relative `//host/x` and its backslash variants (`\\host`,
   `/\host`). These inherit their *scheme* from the document, so `base` is used: on an `http:` page `//evil.example/x` is judged as
   `http:`, never assumed `https:`. They are never `"relative"`.
5. When `base` is omitted a fixed HTTPS probe is used (for pure-function callers and tests). When `base` is supplied but is not a
   usable hierarchical URL (`about:blank`, `data:`, unparseable), an authority-bearing reference cannot be resolved and is rejected
   as `"unparseable"`: **fail closed**.
6. Anything that fails to parse is rejected outright.

**Defense in depth.** A value that only becomes a disallowed scheme once whitespace, control and format characters are removed
(`java script:`, `javascript&#8203;:`) is also rejected, even though a browser's parser would treat the original as a harmless
relative reference. That keeps the two engines in agreement.

## Constants

- **`SAFE_DEFAULT_URL_SCHEMES`**: a frozen array, `["relative", "https:", "mailto:"]`. The conservative default shipped profiles use.
- **`RELATIVE_URL_SCHEME`**: the string `"relative"`.

## Types

**`UrlCheckResult`**: `{ allowed: boolean; scheme: string }`. `scheme` is the normalized scheme including its trailing colon,
`"relative"` for same-document URLs, or `"unparseable"`. It is present even when `allowed` is false, for reporting.

`registerProfile` refuses `javascript:`, `data:`, `vbscript:`, `file:` and `blob:` as profile schemes, so `checkUrl` with a
registered profile's `urlSchemes` never allows them.
