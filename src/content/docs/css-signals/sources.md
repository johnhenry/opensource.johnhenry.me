---
title: "Sources"
description: "Every css-signals source: what it publishes, its options, and the details that are easy to get wrong — plus how to write your own."
sidebar:
  order: 2
---

A source is a small object: a name, the properties it declares, and a `start(context)`. Keys below are unprefixed; the runtime prefix is applied (`--sig-pointer-x` by default).

## pointer, scroll, viewport

| Source | Publishes |
|---|---|
| `pointer()` | `pointer-x`, `pointer-y` (px); `pointer-x-progress`, `pointer-y-progress` (0–1); `pointer-down`, `pointer-inside` (0/1) |
| `scroll()` | `scroll-x-progress`, `scroll-y-progress` (0–1) |
| `scroll({ raw: true })` | adds `scroll-x`, `scroll-y`, `scroll-x-max`, `scroll-y-max` (px) |
| `viewport()` | `viewport-width`, `viewport-height` (px) |

- `pointer` uses Pointer Events, so touch and pen work. It does **not** publish angle or magnitude: those are pure functions of x and y, and CSS computes them with `atan2()` and `hypot()`.
- `viewport` exists for the one thing viewport *units* cannot do: hand `calc()` or `counter()` a bare number such as `1280`. For lengths, use `100vw`.
- `scroll` progress is **0, not `NaN`,** on a page that cannot scroll, and is clamped for rubber-band over-scroll. `raw` values have no native equivalent, so asking for them always runs a listener (progress still comes from CSS where native works).
- `scroll` native mode only applies to `document.documentElement`. A custom `target` always uses the JS path.

## keyboard

`keyboard({ keys })` publishes `key-alt`, `key-ctrl`, `key-meta`, `key-shift` and `key-{code}` (0/1), where `code` is `KeyboardEvent.code` — the **physical** key, so `key-KeyW` is WASD on any layout.

- Chords need no per-combination variables: `calc(var(--sig-key-ctrl) * var(--sig-key-KeyS, 0))` is 1 only while both are held.
- Held keys are released on window blur, when the tab is hidden, and when Meta is released. macOS never sends `keyup` for other keys pressed under Meta; without that rule they would read as pressed forever.

## date

`date({ timeZone, utc, label, temporal, now })` publishes `date-{tag}-second`, `-minute`, `-hour` (1–12), `-hour24`, `-am`, `-pm`, `-weekday`, `-monthday`, `-month`, `-year`. The tag is empty for local time, `utc` for `{ utc: true }`, otherwise a slug of the zone (`Asia/Tokyo` → `asia-tokyo`) or your `label`.

- It uses **Temporal** when the browser has it and `Intl` otherwise; both give identical values, including for zones other than the local one (checked on 250 fields across five zones).
- Weekday is ISO (Monday = 1, Sunday = 7) and month is 1–12.
- Midnight is hour `0`, never `24`.
- Ticks land just after each second boundary and stop while the tab is hidden.
- Several zones are several `date()` sources: `signals.use(date(), date({ utc: true }), date({ timeZone: "Asia/Tokyo" }))`.

## gamepad

`gamepad({ limit = 4, deadzone = 0.05 })` publishes `gamepad-{i}-connected`, `gamepad-{i}-button-{j}` (0–1) and `gamepad-{i}-axis-{j}` (−1–1).

- It polls once per frame **only while a pad is connected**; an idle page costs nothing.
- Browsers do not report a pad until the user presses a button on it.
- Axis values inside the deadzone read as `0`, which hides stick drift.
- On disconnect every value that pad published is set back to `0`.

## audio

`audio({ analyser, bins })` reads a Web Audio `AnalyserNode` you already have and publishes `audio-level` (RMS), `audio-bass`, `audio-mid`, `audio-treble` (0–1), and with `bins: N`, `audio-bin-0 … audio-bin-{N-1}`. `microphoneAnalyser()` asks for the microphone and returns `{ analyser, stop }`.

Bass is below 250 Hz, mid 250–4000 Hz, treble above. A handful of values is published, not one per sample: the module this replaces wrote hundreds of custom properties every frame, which is what made it slow.

## input and cycle

```html
<input type="range" min="0" max="1" step="any" data-signal="volume">
<button data-signal-cycle="accent" data-signal-values="red;green;blue">Next colour</button>
```

- `input()` publishes `input-{name}`: a number for range and number inputs, `0`/`1` for a checkbox, and a **quoted CSS string** for text, radio and select (so `content: var(--sig-input-name)` works). Controls are read at start, then follow `input` and `change`. One delegated listener means controls added later work.
- `cycle()` publishes `cycle-{name}` (the current value, verbatim) and `cycle-{name}-index`. The first value is published immediately and each click advances, wrapping. The values come from your own markup and are not sanitised; they can be any valid custom-property value.

## random and framed

- `random({ count, seed })` publishes `random-{i}` in [0, 1). A `seed` makes it reproducible, and `reset()` on the returned source re-rolls. For per-element randomness where supported, prefer the CSS `random()` function; this is for a value you need to re-roll or reproduce.
- `framed()` publishes `framed-top` and `framed-iframe` (opposites). CSS cannot tell whether it is in an iframe.

## Writing your own

```js
const time = () => ({
  name: "time",
  properties: { "time-second": { syntax: "<number>", initialValue: 0 } },
  start({ set, signal, window }) {
    const tick = () => set("time-second", new Date().getSeconds());
    const id = window.setInterval(tick, 1000);
    signal.addEventListener("abort", () => clearInterval(id), { once: true });
    tick();
  },
});

signals.use(time());
```

- `set(key, value)` takes an **unprefixed** key. Numbers, strings and booleans work; booleans become 1/0, and `NaN`/`Infinity` are ignored (they would invalidate a `<number>`).
- Pass `{ signal }` to `addEventListener` and there is nothing to clean up by hand.
- For names only known at runtime, call `define(key, { syntax, initialValue })` first.
- Pass `window` to `createSignals` for an iframe or a test; the `AbortController` is created from that window so cross-realm listeners work.
