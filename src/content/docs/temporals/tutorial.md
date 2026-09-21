---
title: "Tutorial: business days end to end"
description: "Install @johnhenry/temporals, ask whether a date is a business day, add business days to a date, and count business days in a range — one small, real, approachable task."
---

`@johnhenry/temporals` covers a lot of ground — recurrence rules, cron scheduling, interval algebra, humanized durations. This tutorial picks one task it solves well and does it start to finish: business-day arithmetic on `Temporal.PlainDate`. It's the kind of thing you'd otherwise hand-roll with a weekday check and a holiday list, and getting it slightly wrong is easy (off-by-one at month boundaries, forgetting a holiday falls on a weekend and observance shifts).

Takes about 5 minutes.

## 1. Install

```sh
npm install @johnhenry/temporals temporal-polyfill
```

`Temporal` isn't in every JS runtime yet, so `temporal-polyfill` is a required peer dependency until it is. `@johnhenry/temporals` builds entirely on the standard `Temporal` API — nothing proprietary underneath.

## 2. Create the file

Create `business-days.mjs`:

```js
import "temporal-polyfill/global";
import { BusinessCalendar, usFederalHolidays } from "@johnhenry/temporals/business";

const D = (s) => Temporal.PlainDate.from(s);

// A calendar that knows weekends AND US federal holidays.
const cal = new BusinessCalendar({ holidays: usFederalHolidays() });

console.log("Is 2026-01-01 a business day?", cal.isBusinessDay(D("2026-01-01")));
console.log("Add 5 business days to 2026-01-02:", cal.addBusinessDays(D("2026-01-02"), 5).toString());
console.log("Business days in Jan 2026:", cal.businessDaysBetween(D("2026-01-01"), D("2026-02-01")));
```

## 3. Run it

```sh
node business-days.mjs
```

You should see:

```
Is 2026-01-01 a business day? false
Add 5 business days to 2026-01-02: 2026-01-09
Business days in Jan 2026: 20
```

`2026-01-01` is a Thursday, but it's New Year's Day, so `isBusinessDay` correctly says `false` — that's the holiday calendar working, not just a weekday check. `2026-01-02` (Friday) plus 5 business days skips the weekend and lands on `2026-01-09` (the following Friday). And January 2026 has 20 business days once weekends and New Year's Day are excluded.

## What just happened

- `usFederalHolidays()` returns the real US federal holiday rule set (including holidays whose date depends on the calendar, like the third Monday of a given month) — `BusinessCalendar` combines that with ordinary weekend rules, so `isBusinessDay`/`addBusinessDays`/`businessDaysBetween` all account for both in one call.
- Every value here is a real `Temporal.PlainDate` — `D("2026-01-01")` is `Temporal.PlainDate.from("2026-01-01")`, not a proprietary date type. `@johnhenry/temporals` adds vocabulary on top of the standard `Temporal` API rather than replacing it.
- `addBusinessDays` and `businessDaysBetween` are the two operations most hand-rolled business-day code gets subtly wrong at edges (a holiday landing on a weekend, a range boundary) — this is the same logic the library's own test suite exercises.

## Where to go next

- [Business time](/temporals/business/) — the fuller picture: working hours, business duration across a working-hours boundary, and multi-timezone meeting-slot finding (`meetingSlots`) built on the same `BusinessCalendar`.
- [temporals overview](/temporals/) — `range`, `recur` (RRULE), `cron`, and `Interval`/`IntervalSet` set algebra, if business days aren't the piece you need.
- `temporals`'s own [`examples/`](https://github.com/johnhenry/temporals/tree/main/examples) — `business.mjs` is the fuller version of this tutorial (working hours, overnight shifts, multi-zone availability); `recur.mjs`, `cron.mjs`, and `intervals.mjs` cover the rest of the library the same way.
