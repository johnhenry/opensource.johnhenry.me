---
title: "Cron"
description: "Temporal-native cron on @johnhenry/temporals/cron — clock-aligned matching, explicit DST policy, Quartz day specials, and next/previous occurrence APIs."
---

`@johnhenry/temporals/cron` is cron re-founded on Temporal. It is a *matching*
schedule — "fire when the wall clock matches this pattern" — evaluated in an
**explicit IANA time zone**, which is exactly the thing `Date`-based cron
libraries fumble. Cron lives in a subpath so the core entry stays free of the
cron parser.

```ts
import { cron, cronSchedule, describeCron } from "@johnhenry/temporals/cron";

// Next 3 weekday-9am fire times, as ZonedDateTimes.
cron("0 9 * * 1-5", { timeZone: "America/New_York" }).take(3).toArray();
```

`cron(expr, options)` returns an infinite lazy `Seq<Temporal.ZonedDateTime>`
starting from `options.from` (default: now). Occurrences are always
`ZonedDateTime` — cron is wall-clock by nature, and the zone is part of the
question.

## The DST gap: your 2:30 job fires at 3:30 — by policy, not by luck

Test name in the repo: *"cron: DST spring-forward gap fires shifted forward by
default, or skips"*. On spring-forward day in `America/New_York`, 2:30 a.m.
does not exist. The library refuses to make that your surprise:

| Option | Value | Behavior |
| --- | --- | --- |
| `dstGap` | `"fire"` (default) | the occurrence fires shifted forward into real time (≈3:30) |
| `dstGap` | `"skip"` | the occurrence is dropped for that day |
| `dstOverlap` | `"first"` (default) | during fall-back, the 1:30 slot fires **once**, at the first (pre-transition) offset |
| `dstOverlap` | `"second"` | fires once at the second offset instead |

There is no mode where a fall-back job fires twice or a spring-forward job
silently vanishes without you asking for it.

## `*/15` is clock-aligned, not anchored to when you asked

Faithful cron semantics, distinct from RRULE: `*/15` fires at
`:00 :15 :30 :45` regardless of `from`. An RRULE `interval: 15` counts from
its `start`. If you convert between the two, `cronToRule`/`ruleToCron` are
best-effort and **return `null` rather than guess** at non-representable
patterns.

## The day-of-month / day-of-week OR quirk is preserved

When *both* day fields are restricted (`0 0 13 * 5` — the 13th, and Fridays),
classic cron fires when **either** matches: every 13th *and* every Friday.
This library keeps that quirk because deviating from it silently changes
schedules people paste in from crontabs.

## Sparse schedules don't fire early

`0 0 29 2 *` (Feb 29) skips ahead to the next leap year — it does not
"helpfully" fire on Feb 28. Impossible schedules and bad input **throw** at
parse/iteration rather than producing an empty or wrong sequence.

## Expression support

- Standard five fields, plus an optional **leading seconds field**
  (`seconds: true`, or auto-detected on 6-field expressions).
- `*`, `?`, ranges (`1-5`), steps (`*/15`, `10-40/5`), lists (`1,15`), names
  (`JAN`, `MON`, …), and `@daily` / `@hourly` / `@weekly` / `@monthly` /
  `@yearly` macros.
- **Quartz day specials**: `L` (last day of month), `L-n`, `LW` (last
  weekday), `nW` (nearest weekday to day *n*, no month crossing) for
  day-of-month; `dL` (last given weekday) and `d#n` (nth given weekday) for
  day-of-week.

`parseCron(expr)` exposes the parsed structure; `describeCron(expr)` renders a
readable description, specials included.

## Next / previous occurrences: bridge into `Schedule`

`cronSchedule(expr, options)` compiles the expression to the library's unified
`Schedule` interface — the same one RRULE and ranges compile to:

```ts
import { cronSchedule } from "@johnhenry/temporals/cron";

const s = cronSchedule("0 9 * * 1-5", { timeZone: "America/New_York" });
s.next(now);           // next fire strictly after `now`
s.nextN(now, 5);       // the next five
s.between(start, end); // occurrences in [start, end) — half-open, like everything here
```

`Schedule` is pure — it computes *when*, never executes. The repo ships a
[minimal reference scheduler](https://github.com/johnhenry/temporals/tree/main/examples/scheduler)
showing the *when* vs *do it* boundary. Note `Schedule` itself is an opaque
occurrence function — persist the cron **string**, not the object.

## Scope

Cron is Gregorian civil time by design — the non-ISO calendar support in the
core (`recur`, `range`) deliberately does not extend here.
