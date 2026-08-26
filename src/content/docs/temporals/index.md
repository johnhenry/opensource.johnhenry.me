---
title: "temporals"
description: "Lazy sequences, ranges, intervals, and RRULE recurrence built on the TC39 Temporal API — with cron, business time, humanizing, and iCalendar as subpaths."
---

**`@johnhenry/temporals`** is the sequence layer Temporal doesn't ship.
[Temporal](https://tc39.es/proposal-temporal/docs/) gives you the *atoms* of
date/time — immutable points, durations, calendar-aware arithmetic — but no way
to say "every second Tuesday" or "the next ten weekdays". `temporals` fills
that gap: feed in parameters, get back a lazy, re-iterable sequence of Temporal
objects — either **points** (`PlainDate`, `ZonedDateTime`, …) or **intervals**
(`{ start, end }` spans) — with the standard iterator-helper surface
(`map`/`filter`/`take`/`drop`/`toArray`/…).

> Previously published as `temporals` (last unscoped release 0.0.2, now
> deprecated). Renamed to `@johnhenry/temporals` and restarted at 0.0.0 on
> import into the @johnhenry family — a new address and era, not a maturity
> signal.

## Install

```sh
npm install @johnhenry/temporals
# On Node < 22, also:
npm install temporal-polyfill
```

Temporal is a **peer**, not a bundled dependency — the engines derive
everything from the values you pass in. On Node < 22, `import
"temporal-polyfill/global"` once at your entry point.

## Quick start

```ts
import { range, recur, Interval } from "@johnhenry/temporals";

// The next 10 weekdays, lazily.
range({ start: Temporal.Now.plainDateISO(), step: { days: 1 } })
  .filter((d) => d.dayOfWeek <= 5)
  .take(10)
  .toArray();

// The 2nd Tuesday of each month, 12 times.
recur({
  start: Temporal.PlainDate.from("2026-01-01"),
  freq: "monthly",
  byWeekday: [{ weekday: "TU", nth: 2 }],
  count: 12,
}).toArray();

// The interval value type Temporal lacks.
Interval.from("2026-01-01/2026-04-01").contains(someDate);
```

## Everything is half-open by default

Ranges, chunks, intervals, and `Schedule.between` all treat spans as
`[start, end)`. A point landing exactly on `end` is excluded unless you pass
`inclusive: true`, and two abutting intervals (`…/10:00` and `10:00/…`) do
**not** conflict. If your off-by-one bugs disagree with the library, this is
almost always why.

## DST is a policy you set, not an accident you discover

For `ZonedDateTime` sequences — cron and RRULE alike — daylight-saving edges
are explicit knobs, with the same names in both engines:

| Knob | Values | Default behavior |
| --- | --- | --- |
| `dstGap` | `"fire"` \| `"skip"` | a 2:30 a.m. job on spring-forward day **fires shifted forward** (≈3:30) rather than silently vanishing |
| `dstOverlap` | `"first"` \| `"second"` | a 1:30 a.m. job on fall-back day **fires once**, at the first offset |

Plain wall-clock stepping (`range` over `ZonedDateTime`) keeps the wall clock
across both transitions, and `startOf(zdt, "day")` is DST-aware midnight.
`isDST`/`nextTransition`/`transitionsBetween` are exported for inspection —
with the caveat that `isDST` is a definition ("offset above the year's
minimum"), which is inherently ambiguous for negative-DST zones like
Europe/Dublin.

## Cron and RRULE count differently — on purpose

`*/15` in cron fires at `:00 :15 :30 :45` — **clock-aligned**, regardless of
when you start asking. An RRULE with `freq: "minutely", interval: 15` is
**anchored to its `start`**. Cron also keeps its historical day-of-month /
day-of-week **OR quirk**: when both fields are restricted, a day matching
*either* fires. The library implements both faithfully rather than papering
over the difference; `cronToRule`/`ruleToCron` convert between them but return
`null` rather than guess when a pattern isn't representable.

## Month-end and leap-day stepping don't drift

Monthly steps are **anchor-relative**: `Jan 31 → Feb 28 → Mar 31`, not
`→ Mar 28`. A yearly Feb 29 anniversary fires **only in leap years** (and the
cron expression for Feb 29 skips ahead to the next leap year rather than
firing on the 28th). Month/year stepping is calendar-aware — it steps
correctly through a Hebrew 13-month leap year. And impossible rules **throw**
instead of silently producing an empty sequence.

## `count` counts what's actually returned

With RFC 5545 `exclude` (EXDATE) in play, `count: 10` yields 10 occurrences
*after* exclusions — not 10-minus-the-excluded. `include` (RDATE) merges extra
dates in sorted order, deduplicated.

## The subpaths

The core entry stays lean; heavier domains live behind subpaths:

| Subpath | What's there |
| --- | --- |
| `@johnhenry/temporals` | `range`/`chunks`/`windows`, `recur` + `splitSeries`, `Interval`/`IntervalSet`/`conflicts`, `Schedule`, `startOf`/`endOf`/quarters, `backoff`, DST helpers |
| `@johnhenry/temporals/cron` | Temporal-native cron: `cron`, `cronSchedule`, `parseCron`, `describeCron`, Quartz `L`/`W`/`#` specials, RRULE converters |
| `@johnhenry/temporals/business` | `BusinessCalendar`, `Holidays` (US federal, Easter-relative), `WorkingHours`, `businessDuration`, `meetingSlots` |
| `@johnhenry/temporals/humanize` | `humanizeDuration`, `parseDuration("1h30m")`, `formatRelative`, `fromNow` |
| `@johnhenry/temporals/ics` | iCalendar import/export: `toICS`, `fromICS`, `icsToSeq` |

## The pages here

- [Cron](/temporals/cron/) — clock-aligned matching, explicit DST semantics,
  Quartz day specials, `Schedule` bridging
- [Business time](/temporals/business/) — business days, holidays, working
  hours, and free = work − busy availability
- [Formatting](/temporals/formatting/) — the humanize and ics subpaths
- [Examples](/temporals/examples/) — the repo's runnable example programs,
  annotated

## Status

143 tests green; runnable examples for every feature area are executed in CI
to prevent drift. Known edges are documented rather than hidden: proleptic
Gregorian only (no 1582 cut-over), partial non-ISO calendar support
(`quarterOf` assumes 12-month years; Chinese leap months are best-effort),
no leap seconds (Temporal doesn't model them either), and `Schedule` is an
opaque occurrence function — serialize its *source* (cron string,
`formatRule(rule)`, or `.ics`) instead.

## Source

[github.com/johnhenry/temporals](https://github.com/johnhenry/temporals) ·
A typedoc config covering every export (all subpaths) ships in the repo —
`npm run docs` generates the full API reference locally.
