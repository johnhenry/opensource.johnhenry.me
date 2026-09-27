/**
 * Orrery Almanac (ROADMAP §4.7).
 *
 * Turns the home page's decorative orbit animation into real recurrence
 * data: each planet's on-screen orbit period becomes an `@johnhenry/temporals`
 * `recur` rule anchored to "now"; the narrow window around each recurrence
 * instance is an `Interval`; `IntervalSet` merges a planet's own windows and
 * `conflicts()` finds where two DIFFERENT planets' windows overlap — an
 * "alignment" (conjunction), same idea as a real almanac's planetary
 * conjunctions. `windows()` buckets the lookahead span into a timeline strip
 * showing how many conjunctions are live in each slice. `toICS()` exports the
 * detected conjunctions as calendar events, and `cronToRule` (from
 * `temporals/cron`) drives a scheduled Tester run that fires — by literally
 * navigating to `#/tester?autorun=1` — for as long as this tab stays open.
 *
 * One global dock, mounted once from main.ts, exactly like the Tensor
 * Telemetry dock / HAR recorder it's stacked alongside (left edge instead of
 * right, so none of the docks overlap).
 */
import { Temporal } from 'temporal-polyfill';
import {
  recur, configureTemporal, Interval, IntervalSet, conflicts, windows,
  type RecurRule,
} from '@johnhenry/temporals';
import { cronToRule, cron as cronSeq, describeCron } from '@johnhenry/temporals/cron';
import { toICS, type ICSEvent } from '@johnhenry/temporals/ics';
import { playgrounds } from './registry';
import { registerDevTool } from './dev-drawer';
import './almanac.css';

type ZDT = Temporal.ZonedDateTime;

// This module (mounted before any playground) needs its own Temporal
// implementation configured — the same call `src/playgrounds/temporals.ts`
// makes when IT mounts, but that may never happen in a given session.
configureTemporal(Temporal);

const LOOKAHEAD_HOURS = 3;
const TIMELINE_BUCKETS = 24; // 3h / 24 = 7.5min buckets
const DEFAULT_CRON = '*/10 * * * *'; // every 10 minutes

/**
 * Orbit period, in seconds — the EXACT formula src/home.ts uses for each
 * planet's CSS animation-duration (`--dur`), so the Almanac's notion of
 * "orbit period" is the same one the orrery already animates on screen,
 * not a second, disconnected number. Kepler-ish: outer (later-index)
 * planets orbit slower.
 */
function orbitPeriodSeconds(index: number, total: number): number {
  const r = 0.25 + (index / Math.max(1, total - 1)) * 0.74;
  return Math.round(38 * Math.pow(r / 0.25, 1.3));
}

interface PlanetOrbit {
  id: string;
  title: string;
  hue: number;
  periodSec: number;
  windowHalfSec: number;
  instants: ZDT[];
  intervals: Interval<ZDT>[];
  set: IntervalSet<ZDT>;
}

interface Conjunction {
  a: PlanetOrbit;
  b: PlanetOrbit;
  overlap: Interval<ZDT>;
}

function buildOrbits(now: ZDT): PlanetOrbit[] {
  const n = playgrounds.length;
  return playgrounds.map((p, i) => {
    const periodSec = Math.max(3, orbitPeriodSeconds(i, n));
    // The "conjunction tolerance" -- how close two planets' cycle marks have
    // to land to count as aligned -- scales with the orbit's own period so
    // fast inner orbits and slow outer ones both get a handful of real hits
    // over the lookahead window instead of the fast ones flooding it.
    const windowHalfSec = Math.max(2, Math.round(periodSec * 0.08));
    const rule: RecurRule<ZDT> = { start: now, freq: 'secondly', interval: periodSec };
    const lookaheadCount = Math.max(1, Math.ceil((LOOKAHEAD_HOURS * 3600) / periodSec)) + 1;
    const instants = recur(rule).take(Math.min(lookaheadCount, 400)).toArray();
    const intervals = instants.map((t) => new Interval(t.subtract({ seconds: windowHalfSec }), t.add({ seconds: windowHalfSec })));
    return { id: p.id, title: p.title, hue: p.hue, periodSec, windowHalfSec, instants, intervals, set: IntervalSet.from(intervals) };
  });
}

/** Every overlapping pair of windows belonging to two DIFFERENT planets, via temporals' own sweep-line conflicts(). */
function findConjunctions(orbits: PlanetOrbit[]): Conjunction[] {
  const flat: Interval<ZDT>[] = [];
  const owner = new Map<Interval<ZDT>, PlanetOrbit>();
  for (const o of orbits) for (const iv of o.intervals) { flat.push(iv); owner.set(iv, o); }
  const pairs = conflicts(flat);
  const out: Conjunction[] = [];
  const seen = new Set<string>();
  for (const [x, y] of pairs) {
    const a = owner.get(x)!, b = owner.get(y)!;
    if (a.id === b.id) continue; // a planet's own successive orbits overlapping isn't a "conjunction"
    const overlap = x.intersection(y);
    if (!overlap) continue;
    const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
    const key = `${lo.id}|${hi.id}|${overlap.start.toString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ a: lo, b: hi, overlap });
  }
  out.sort((p, q) => Temporal.ZonedDateTime.compare(p.overlap.start, q.overlap.start));
  return out;
}

/** Sky-wide coverage: union every planet's IntervalSet, measure how much of the lookahead span has >=1 conjunction-eligible window open. */
function skyCoverage(orbits: PlanetOrbit[], span: Interval<ZDT>): number {
  let sky = IntervalSet.empty<ZDT>();
  for (const o of orbits) sky = sky.union(o.set);
  const clipped = IntervalSet.from([...sky].map((iv) => iv.intersection(span)).filter((iv): iv is Interval<ZDT> => iv !== null && !iv.isEmpty));
  const covered = clipped.totalDuration().total({ unit: 'seconds' });
  const total = span.toDuration().total({ unit: 'seconds' });
  return total > 0 ? Math.min(1, covered / total) : 0;
}

/** `windows()`-driven timeline: fixed-size, non-overlapping buckets across the lookahead span, each counting live conjunctions. */
function buildTimeline(conj: Conjunction[], span: Interval<ZDT>): number[] {
  const size = span.toDuration().total({ unit: 'seconds' }) / TIMELINE_BUCKETS;
  const buckets = windows({ start: span.start, end: span.end, size: { seconds: size }, step: { seconds: size } }).toArray();
  return buckets.map((b) => conj.filter((c) => b.overlaps(c.overlap)).length);
}

function fmtDur(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}
function fmtWhen(t: ZDT, now: ZDT): string {
  const secs = t.since(now).total({ unit: 'seconds' });
  return secs < 0 ? `${fmtDur(-secs)} ago` : `in ${fmtDur(secs)}`;
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let mounted = false;

export function mountAlmanac(): void {
  if (mounted) return;
  mounted = true;

  // The dock used to be its own floating root (`.almanac-dock`) appended to
  // document.body, with an `.al-handle` toggle button that collapsed it to a
  // small circle. Both are gone — this pane now lives inside the Dev
  // Drawer, whose own tab strip is the toggle. The conjunction-count readout
  // that used to live inside the removed handle is relocated into the first
  // section's label row.
  let root!: HTMLElement;
  registerDevTool({
    id: 'almanac',
    label: 'Almanac',
    icon: '🪐',
    mount(container) {
      root = container;
      root.classList.add('almanac-dock-pane');
      root.innerHTML = `
        <div class="al-section">
          <div class="al-row">
            <div class="al-label">Next conjunctions (${LOOKAHEAD_HOURS}h lookahead)</div>
            <span class="stat" data-el="al-count">…</span>
          </div>
          <ul class="al-list" data-el="al-conj"></ul>
          <div class="al-row">
            <span class="stat">sky coverage over the window</span>
            <span class="stat" data-el="al-cov-pct">…</span>
          </div>
          <div class="al-coverage"><div class="al-coverage-fill" data-el="al-cov-fill" style="width:0%"></div></div>
        </div>
        <div class="al-section">
          <div class="al-label">Timeline (windows(), ${TIMELINE_BUCKETS} buckets)</div>
          <div class="al-timeline" data-el="al-timeline"></div>
        </div>
        <div class="al-section">
          <div class="al-label">Export</div>
          <div class="al-actions">
            <button class="btn" type="button" data-el="al-ics">.ics download</button>
            <button class="btn" type="button" data-el="al-refresh">recompute now</button>
          </div>
        </div>
        <div class="al-section">
          <div class="al-label">Scheduled Tester run (cronToRule)</div>
          <label class="al-cron-enable">
            <input type="checkbox" data-el="al-cron-enabled" />
            Enabled — while on, this really navigates this tab to <code>#/tester</code> on schedule, even away from whatever room you're using
          </label>
          <div class="al-cron-row">
            <input type="text" data-el="al-cron" value="${DEFAULT_CRON}" spellcheck="false" autocomplete="off" />
            <button class="btn" type="button" data-el="al-cron-apply">apply</button>
          </div>
          <div class="stat" data-el="al-cron-desc"></div>
          <div class="al-next" data-el="al-next"></div>
          <div class="al-actions">
            <button class="btn primary" type="button" data-el="al-run-now">run Tester now</button>
          </div>
          <ul class="al-list" data-el="al-runs"></ul>
        </div>`;
    },
  });

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(`[data-el="${sel}"]`) as T;

  let orbits: PlanetOrbit[] = [];
  let conjunctions: Conjunction[] = [];

  function recompute(): void {
    const now = Temporal.Now.zonedDateTimeISO();
    orbits = buildOrbits(now);
    conjunctions = findConjunctions(orbits);
    const span = new Interval(now, now.add({ hours: LOOKAHEAD_HOURS }));

    $('al-count').textContent = `${conjunctions.length} conjunction${conjunctions.length === 1 ? '' : 's'}`;

    const conjList = $('al-conj');
    conjList.innerHTML = conjunctions.length
      ? conjunctions.slice(0, 12).map((c) => `<li><span class="who"><b style="color:hsl(${c.a.hue} 90% 60%)">${esc(c.a.title)}</b> × <b style="color:hsl(${c.b.hue} 90% 60%)">${esc(c.b.title)}</b></span><span class="when">${esc(fmtWhen(c.overlap.start, now))}</span></li>`).join('')
      : `<li class="al-empty">No two planets' orbits line up in the next ${LOOKAHEAD_HOURS}h — try recompute, or widen a planet's window in code.</li>`;

    const cov = skyCoverage(orbits, span);
    $('al-cov-pct').textContent = `${(cov * 100).toFixed(1)}%`;
    $<HTMLElement>('al-cov-fill').style.width = `${(cov * 100).toFixed(1)}%`;

    const buckets = buildTimeline(conjunctions, span);
    const max = Math.max(1, ...buckets);
    $('al-timeline').innerHTML = buckets.map((c) =>
      `<div class="al-tl-bar${c > 0 ? ' hot' : ''}" style="height:${c === 0 ? 2 : Math.round((c / max) * 20)}px" title="${c} conjunction(s)"></div>`).join('');
  }
  recompute();
  $<HTMLButtonElement>('al-refresh').addEventListener('click', recompute);
  // Recurrence is deterministic from "now", so a slow tick keeps the dock honest without churn.
  setInterval(recompute, 30_000);

  // ---- .ics export (toICS) -------------------------------------------------
  $<HTMLButtonElement>('al-ics').addEventListener('click', () => {
    const events: ICSEvent<ZDT>[] = conjunctions.map((c, i) => ({
      uid: `orrery-almanac-${c.a.id}-${c.b.id}-${i}@opensource.johnhenry.me`,
      summary: `${c.a.title} × ${c.b.title} conjunction`,
      start: c.overlap.start,
      end: c.overlap.end,
    }));
    const text = toICS(events);
    const blob = new Blob([text], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'orrery-almanac.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  // ---- cronToRule-scheduled Tester run --------------------------------------
  // Off by default: this is a REAL location.hash navigation away from
  // whatever room the tab is currently showing, not just a notification.
  // Arming it unconditionally at mount time (the original ROADMAP 4.7
  // behavior) surprised a user mid-session on an unrelated planet — it now
  // requires the "Enabled" checkbox below before scheduleNext() actually
  // arms a real timer.
  const cronEnabledEl = $<HTMLInputElement>('al-cron-enabled');
  const cronInput = $<HTMLInputElement>('al-cron');
  const cronDescEl = $('al-cron-desc');
  const nextEl = $('al-next');
  const runsEl = $('al-runs');
  const runLog: { at: ZDT; note: string }[] = [];
  let fireTimer: number | undefined;
  let tickTimer: number | undefined;
  let nextFire: ZDT | null = null;
  let usedFallback = false;

  function logRun(note: string): void {
    runLog.unshift({ at: Temporal.Now.zonedDateTimeISO(), note });
    if (runLog.length > 8) runLog.length = 8;
    runsEl.innerHTML = runLog.map((r) => `<li><span class="who">${esc(r.note)}</span><span class="when">${esc(r.at.toPlainTime().toString({ smallestUnit: 'second' }))}</span></li>`).join('');
  }

  function triggerTesterRun(reason: string): void {
    logRun(reason);
    // "while the tab is open": this is a real hash navigation, driving the
    // Tester room's own `?autorun=1` deep link (see src/playgrounds/tester.ts).
    location.hash = '#/tester?autorun=1';
  }

  function scheduleNext(): void {
    clearTimeout(fireTimer);
    const expr = cronInput.value.trim() || DEFAULT_CRON;
    try {
      cronDescEl.textContent = describeCron(expr);
    } catch (err) {
      cronDescEl.textContent = `invalid cron: ${(err as Error).message}`;
      nextEl.innerHTML = '<span class="al-err">not scheduled</span>';
      nextFire = null;
      return;
    }
    if (!cronEnabledEl.checked) {
      nextEl.innerHTML = '<span class="stat">scheduling is off — check "Enabled" above to arm it</span>';
      nextFire = null;
      return;
    }
    const anchor = Temporal.Now.zonedDateTimeISO();
    const timeZone = anchor.timeZoneId;
    const rule = cronToRule(expr, anchor);
    usedFallback = rule === null;
    let next: ZDT | undefined;
    if (rule) {
      next = recur(rule).take(1).toArray()[0];
    }
    if (!next) {
      // cronToRule() returns null for patterns RRULE can't represent (its own
      // docs list multi-hour/minute sets, "W", the dom/dow OR case, …) — fall
      // straight back to the cron engine's own matching schedule so the
      // dock still works, just without the RecurRule storyline for that pattern.
      next = cronSeq(expr, { timeZone }).take(1).toArray()[0];
    }
    nextFire = next ?? null;
    if (!nextFire) { nextEl.textContent = 'no upcoming fire time'; return; }
    const ms = Math.max(0, nextFire.since(anchor).total({ unit: 'milliseconds' }));
    fireTimer = window.setTimeout(() => {
      triggerTesterRun(`scheduled (cron ${expr}${usedFallback ? ', fallback: cronToRule → null' : ''})`);
      scheduleNext();
    }, ms);
  }
  function paintCountdown(): void {
    if (!nextFire) return;
    const secs = Math.max(0, nextFire.since(Temporal.Now.zonedDateTimeISO()).total({ unit: 'seconds' }));
    nextEl.innerHTML = `next run <b>${fmtDur(secs)}</b>${usedFallback ? ' <span class="stat">(cron() fallback — cronToRule() returned null for this expression)</span>' : ''}`;
  }
  $<HTMLButtonElement>('al-cron-apply').addEventListener('click', scheduleNext);
  cronEnabledEl.addEventListener('change', scheduleNext);
  $<HTMLButtonElement>('al-run-now').addEventListener('click', () => triggerTesterRun('manual "run Tester now"'));
  scheduleNext();
  tickTimer = window.setInterval(paintCountdown, 1000);
  paintCountdown();
  void tickTimer;
}
