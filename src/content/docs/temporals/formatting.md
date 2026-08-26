---
title: "Formatting: humanize & ics"
description: "Human-readable durations and relative time (@johnhenry/temporals/humanize), and iCalendar import/export (@johnhenry/temporals/ics)."
---

Two output-oriented subpaths: one talks to humans, one talks to calendars.

## `@johnhenry/temporals/humanize`

```ts
import {
  humanizeDuration, parseDuration, formatRelative, fromNow,
} from "@johnhenry/temporals/humanize";

humanizeDuration(Temporal.Duration.from({ hours: 2, minutes: 3 }));
// "2 hours, 3 minutes"
humanizeDuration(dur, { short: true });   // "2h 3m"
humanizeDuration(dur, { max: 1 });        // "2 hours" — largest units only
humanizeDuration(dur, { locale: "fr" });  // localized (see caveat below)

parseDuration("1h30m");   // Temporal.Duration — shorthand in, real duration out
formatRelative(from, to); // "in 5 days"  (Intl.RelativeTimeFormat)
fromNow(someDate);        // "3 days ago"
```

### `humanizeDuration` reads units as-is — it does not balance

A `Duration` of `{ minutes: 90 }` renders as **"90 minutes"**, not "1 hour,
30 minutes". Balancing is a rounding decision with a calendar-dependent answer
(how long is a month?), so the library leaves it to you: `.round()` the
duration first if you want it rebalanced.

### Localization is opt-in and runtime-gated

Passing `locale` uses `Intl.DurationFormat` **when the runtime has it**
(Node 24+, modern browsers) and silently falls back to the built-in English
rendering otherwise. Same-version output can differ across runtimes — don't
snapshot-test localized strings across Node versions.

`formatRelative`/`fromNow` pick the largest sensible unit via
`Intl.RelativeTimeFormat`; zero-difference inputs render as "now"-equivalents
rather than "in 0 seconds".

## `@johnhenry/temporals/ics`

Minimal RFC 5545 import/export for recurring events — `DTSTART`, `RRULE`,
`EXDATE`, `RDATE` — bridging `recur` rules to the format calendars actually
speak.

```ts
import { toICS, fromICS, icsToSeq } from "@johnhenry/temporals/ics";

const ics = toICS([{ start, rrule: "FREQ=WEEKLY;COUNT=4", exdate: [skipDay] }]);

const [event] = fromICS(ics); // Temporal values + the RRULE string
icsToSeq(event).toArray();    // expand DTSTART + RRULE + EXDATE/RDATE → Seq
```

### Round-trips are tested, zones included

`toICS(fromICS(x))` is exercised in the suite for all-day events *and* zoned
events — a `ZonedDateTime` start emits `DTSTART;TZID=…` and comes back as a
`ZonedDateTime` in the same zone. All-day `PlainDate` starts use `VALUE=DATE`.

### Expansion obeys the same rules as `recur`

`icsToSeq` runs the same recurrence engine as the core, so everything on the
[index page](/temporals/) holds: EXDATE removes occurrences *before* `COUNT`
is applied to what remains, RDATE merges sorted and deduplicated, and DST
policy applies to zoned starts.

### Scope

This is an event-recurrence codec, not a full iCalendar suite — no VTODO,
VALARM, VTIMEZONE generation, or free/busy publishing. It covers the subset
where Temporal values and RRULEs need to enter or leave `.ics` files; zone
names ride on `TZID` and resolve through Temporal's own IANA handling.

Worked examples:
[`examples/humanize.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/humanize.mjs) ·
[`examples/ics.mjs`](https://github.com/johnhenry/temporals/blob/main/examples/ics.mjs).
