---
title: "Business time"
description: "Business days, holiday rules, working hours, and availability on @johnhenry/temporals — free = work − busy, with multi-zone meeting slots."
---

Two layers cooperate here. The **core entry** provides the interval algebra —
`Interval`, `IntervalSet`, `conflicts` — and `@johnhenry/temporals/business`
provides the working-time vocabulary on top: calendars, holidays, hours,
durations, and mutual availability.

## free = work − busy

That's a test name (*"free = work − busy (availability)"*), and it's the whole
availability model. `IntervalSet` is a normalized (merged, sorted) set of
intervals with `union` / `intersection` / `difference` / `gaps`:

```ts
import { Interval, IntervalSet, conflicts } from "@johnhenry/temporals";

const free = work.difference(busy); // an IntervalSet of open slots
free.totalDuration();               // summed coverage
free.gaps();                        // the complement, interior or within a bound

conflicts(bookings); // [ [a, b], … ] — every overlapping pair
```

Three behaviors to internalize:

- **Half-open everywhere.** A meeting ending at 10:00 and one starting at
  10:00 do **not** conflict — abutting is not overlapping (and
  `IntervalSet.from` *merges* abutting intervals into one).
- **`conflicts` detects; policy is yours.** It returns the overlapping pairs;
  what to cancel or shift is not the library's call.
- **Allen's 13 relations** are on `Interval` (`a.relation(b)` → `meets`,
  `overlaps`, `during`, …) when a boolean `overlaps()` isn't precise enough.

## Business calendars and holidays

```ts
import {
  BusinessCalendar, Holidays, usFederalHolidays,
  fixedHoliday, nthWeekdayHoliday, easterHoliday,
} from "@johnhenry/temporals/business";

const cal = new BusinessCalendar({ holidays: usFederalHolidays() });
cal.isBusinessDay(date);
cal.addBusinessDays(date, 5);
cal.nthBusinessDay(2026, 1, -1); // last business day of January — payroll
```

Holiday rules are functions `(year) => PlainDate | null`, built from three
combinators that reuse the RRULE nth-weekday logic — Thanksgiving *is*
`nthWeekdayHoliday(11, "TH", 4)`, and `easterHoliday(-2)` is Good Friday
(computus included). `observed` supports `"us"` and `"uk"` weekend-shift
styles, so July 4th on a Saturday lands where HR says it does.

## Working hours — overnight windows are first-class

```ts
import { WorkingHours, businessDuration } from "@johnhenry/temporals/business";

const hours = new WorkingHours({
  windows: [["22:00", "06:00"]],  // cross-midnight shift: valid, tested
  calendar: cal,
});
hours.isOpen(zdt);
hours.nextOpen(zdt);

businessDuration(start, end, hours); // elapsed *working* time only
```

`businessDuration` counts only time inside the windows on business days —
weekends, holidays, and off-hours contribute zero.

## `meetingSlots` — mutual availability across time zones

The capstone: windows in which **every** participant is working and free,
each evaluated in their own zone, compared by instant.

```ts
import { meetingSlots } from "@johnhenry/temporals/business";

const slots = meetingSlots({
  participants: [
    { hours, timeZone: "America/New_York", busy: nyBusy },
    { hours, timeZone: "America/Los_Angeles" },
  ],
  within,                       // Interval<ZonedDateTime>
  duration: { minutes: 30 },
});
```

Each slot is **enriched** so ranking is a one-liner: `localStarts` (each
participant's wall-clock start), `earliestLocalHour`, `latestLocalHour`.

```ts
slots.sort((a, b) => a.latestLocalHour - b.latestLocalHour); // "not too late for anyone"
```

The deliberate limit: **`meetingSlots` finds availability, not the optimal
time.** Scoring by preference, fairness, or fragmentation is a solver concern
the library hands to you — with the inputs pre-computed.

For the worked version, see
[`examples/availability.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/availability.mjs)
(working hours − meetings = open slots) and
[`examples/business.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/business.mjs).
