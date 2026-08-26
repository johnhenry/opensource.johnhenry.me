---
title: "Examples"
description: "The repo's runnable example programs, annotated — one per feature area, executed in CI so they can't drift from the library."
---

The repo ships runnable, self-contained example programs — one per feature
area, plus a reference scheduler. They import the package by its published
name (`@johnhenry/temporals`), like a consumer would, and `npm run examples`
executes every one of them in CI so the examples **cannot silently drift**
from the library. This is the pattern the rest of the @johnhenry family
copies.

```sh
git clone https://github.com/johnhenry/temporals && cd temporals
npm install && npm run build
npm run examples          # run them all
node examples/cron.mjs    # or any single one
```

Named by what each one demonstrates, in the style of the repo's own test
names:

## [`basic.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/basic.mjs) — one tour touches every layer

The whole library in one file: a range, a recurrence, a cron expression, a
`Schedule`, an interval set, a business calendar, a humanized duration. Start
here to see how the layers hand off to each other.

## [`range.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/range.mjs) — half-open stepping, chunks cover exactly, month-ends don't drift

`range` / `chunks` / `windows`, the fluent `seq()` builder, and calendar
rounding (`startOf` / `endOf` / `quarterOf`). Shows the `[start, end)`
contract and anchor-relative month stepping in running code.

## [`recur.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/recur.mjs) — EXDATE removes before count applies; DST is a knob

RRULE recurrence end to end: nth-weekday rules, `include`/`exclude`
(RDATE/EXDATE), the `dstGap`/`dstOverlap` policy on zoned starts,
`splitSeries` for this-and-following edits, and RRULE-string round-trips.

## [`cron.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/cron.mjs) — `*/15` aligns to the clock; `L` and `#` actually work

Temporal-native cron: field syntax, Quartz day specials (`L`, `LW`, `nW`,
`d#n`), `describeCron` humanizing, and the lossy-by-design
`cronToRule`/`ruleToCron` converters returning `null` instead of guessing.

## [`intervals.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/intervals.mjs) — abutting is not overlapping

`Interval` with Allen's 13 relations, `IntervalSet` algebra
(union/intersection/difference/gaps), `conflicts` pair detection, and the
free/busy foundations.

## [`business.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/business.mjs) — Thanksgiving is `nthWeekdayHoliday(11, "TH", 4)`

Business-day navigation, US federal and Easter-relative holidays with
observed-day shifting, overnight working-hours windows, `businessDuration`,
and multi-zone `meetingSlots`.

## [`availability.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/availability.mjs) — free = work − busy

The worked availability story: working hours minus meetings equals open
slots, with humanized output. The shortest path from this library to a
scheduling feature.

## [`humanize.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/humanize.mjs) — 90 minutes stays "90 minutes" until you round

Duration humanizing (long/short/max/locale forms), relative time, and
`parseDuration` shorthand.

## [`backoff.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/backoff.mjs) — retry delays are just another lazy sequence

Exponential backoff with jitter as a `Seq<Duration>`, plus the DST-transition
helpers (`isDST`, `nextTransition`, `transitionsBetween`).

## [`ics.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/ics.mjs) — an event survives the round-trip, TZID included

iCalendar import/export: build events with RRULE/EXDATE, serialize with
`toICS`, parse back with `fromICS`, expand with `icsToSeq`.

## [`scheduler/`](https://github.com/johnhenry/temporals/tree/main/examples/scheduler) — Schedule is *when*; the scheduler is *do it*

A minimal reference scheduler (with its own tests: `npm run test:example`)
demonstrating the deliberate boundary: `temporals` computes occurrences,
purely; this thin layer owns timers and execution. It's a demo of the
boundary, not a durable job runner.
