---
title: "Browser support"
description: "What css-signals does in each browser, what has actually been verified where, and how to run the self-checking page yourself."
sidebar:
  order: 4
---

Everything works in current evergreen browsers through the JS paths; the native paths are an upgrade. Support facts below were checked in September 2026 from web sources and by running the library — **verify against [caniuse](https://caniuse.com/) before relying on any of it.**

| Feature | Needs | Where it stands |
|---|---|---|
| Typed custom properties | `@property` | Baseline. WebKit 18 rejects `<string>` (the library avoids it) |
| Native scroll progress | scroll-driven animations | Chrome and Edge 115+, Safari 26; not in stable Firefox (confirmed absent in 156) |
| `date()` via Temporal | Temporal | Chrome 144+, Firefox 139+; not Safari 26.5. `Intl` is used otherwise |
| `utils.css` helpers | `@function` | Chromium only (absent in Firefox 156 and Safari 26.5); use the [`@supports` gate](/css-signals/css/#helpers-and-the-supports-gate) |
| CSS `random()` | not used by the library | Safari 26.2; behind a flag in Chrome; absent in Firefox 156 |

## What was verified, and where

`examples/verify.html` in the repository is a self-checking page: it runs the library in a real browser and reports PASS, FAIL or SKIP for each check (scroll progress, dynamic and empty prefixes, the `:root` animation conflict, Temporal against `Intl`, the `@function` helpers, transitions, keyboard, pointer, input and cycle, random, an iframe's window, and disposal).

| Browser | Result |
|---|---|
| Chrome 153 (headless) | 17 passed, three runs |
| Chrome 152 | 17 passed |
| Safari 26.5 (macOS) | 16 passed, 1 skipped (no Temporal); native scroll path; `@function` took the `calc()` fallback |
| Firefox 156 | 15 passed, 2 skipped (no native scroll timeline); Temporal matches `Intl` on 250 fields |
| Firefox 137 | 14 passed, 3 skipped, two runs |
| iOS Safari 18.0 (simulator) | 14 passed, 3 skipped |

**Not exercised in a real browser:** `gamepad` (needs hardware) and `audio` / `microphoneAnalyser` (need a user gesture and a microphone) — unit tests against fakes only. **Not tested:** Firefox with scroll-driven animations enabled (a flag), so the native path is verified in Chrome and Safari only.

Testing in real browsers found three bugs that jsdom could not: WebKit 18's `<string>` rejection, the `@function` fallback pitfall above, and an iframe's window rejecting an `AbortSignal` from another realm (the core now creates its `AbortController` from the target window).

## Run the check yourself

Serve the repository over HTTP (the page imports ES modules, so `file://` will not do), open `examples/verify.html`, and read the summary at the top:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
# then open http://127.0.0.1:8765/examples/verify.html
```

The page title carries the summary (`css-signals verify: PASS: 16 passed, 0 failed, 1 skipped`), so it is readable from a tab strip. Keep the tab in the foreground: a hidden tab does not run animation frames and the checks will not finish.
