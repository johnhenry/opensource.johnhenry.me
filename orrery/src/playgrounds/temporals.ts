import type { Playground } from '../registry';
import {
  Signal, Computed,
  signal, computed, effect, batch,
} from '@johnhenry/signalle';
import { bindAttribute, computedBind } from '@johnhenry/signalle/dom';
import { createSignals, date, type Signals } from '@johnhenry/css-signals';
import { readState, writeState, copyLink } from '../state';
import './temporals.css';
import { Temporal } from 'temporal-polyfill';
import {
  recur,
  formatRule,
  startOf,
  endOf,
  Interval,
  ruleFromString,
  configureTemporal,
} from '@johnhenry/temporals';
import type { RecurRule, Weekday, WeekdaySpec } from '@johnhenry/temporals';
import { cronToRule, ruleToCron, describeCron } from '@johnhenry/temporals/cron';
import { toICS, fromICS, icsToSeq } from '@johnhenry/temporals/ics';
import type { ICSEvent } from '@johnhenry/temporals/ics';
import {
  meetingSlots,
  usFederalHolidays,
  WorkingHours,
  BusinessCalendar,
} from '@johnhenry/temporals/business';
import type { Participant, MeetingSlot } from '@johnhenry/temporals/business';
import { fromNow } from '@johnhenry/temporals/humanize';

// `fromNow`/`formatRelative` build their own "now" via the library's internal
// getTemporal(), which otherwise falls back to `globalThis.Temporal` — absent
// here since this room imports `temporal-polyfill` locally rather than
// installing it globally. Point the library at the same polyfill explicitly.
configureTemporal(Temporal);

type ZDT = Temporal.ZonedDateTime;
type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';
type BoundMode = 'count' | 'until';

const ZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const WEEKDAYS: { code: Weekday; label: string }[] = [
  { code: 'MO', label: 'Mon' },
  { code: 'TU', label: 'Tue' },
  { code: 'WE', label: 'Wed' },
  { code: 'TH', label: 'Thu' },
  { code: 'FR', label: 'Fri' },
  { code: 'SA', label: 'Sat' },
  { code: 'SU', label: 'Sun' },
];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const ORDINALS: { value: string; label: string }[] = [
  { value: 'any', label: 'every matching weekday' },
  { value: '1', label: '1st' },
  { value: '2', label: '2nd' },
  { value: '3', label: '3rd' },
  { value: '4', label: '4th' },
  { value: '-1', label: 'last' },
];

interface RoomState {
  freq: Freq;
  interval: number;
  weekdays: Set<Weekday>;
  ordinal: string;
  months: Set<number>;
  startDate: string; // YYYY-MM-DD
  hour: number;
  minute: number;
  timeZone: string;
  boundMode: BoundMode;
  count: number;
  until: string; // YYYY-MM-DD
  intervalMode: boolean;
  durationMinutes: number;
}

const LIST_SAFETY_CAP = 400;
const CALENDAR_SAFETY_CAP = 3000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayISO(): string {
  const d = Temporal.Now.plainDateISO();
  return d.toString();
}

function defaultTimeZone(): string {
  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ZONES.includes(local)) return local;
  } catch {
    /* ignore */
  }
  return 'America/New_York';
}

function defaultState(): RoomState {
  const start = Temporal.Now.plainDateISO();
  return {
    freq: 'monthly',
    interval: 1,
    weekdays: new Set<Weekday>(['TU']),
    ordinal: '2',
    months: new Set<number>(),
    startDate: start.toString(),
    hour: 9,
    minute: 0,
    timeZone: defaultTimeZone(),
    boundMode: 'count',
    count: 12,
    until: start.add({ years: 1 }).toString(),
    intervalMode: false,
    durationMinutes: 60,
  };
}

function startZdt(state: RoomState): ZDT {
  const [y, m, d] = state.startDate.split('-').map(Number);
  return Temporal.ZonedDateTime.from({
    timeZone: state.timeZone,
    year: y,
    month: m,
    day: d,
    hour: state.hour,
    minute: state.minute,
    second: 0,
  });
}

function untilZdt(state: RoomState): ZDT {
  const [y, m, d] = state.until.split('-').map(Number);
  return Temporal.ZonedDateTime.from({
    timeZone: state.timeZone,
    year: y,
    month: m,
    day: d,
    hour: 23,
    minute: 59,
    second: 59,
  });
}

function buildByWeekday(state: RoomState): WeekdaySpec[] | undefined {
  if (state.weekdays.size === 0) return undefined;
  const codes = WEEKDAYS.filter((w) => state.weekdays.has(w.code)).map((w) => w.code);
  if ((state.freq === 'monthly' || state.freq === 'yearly') && state.ordinal !== 'any') {
    const nth = Number(state.ordinal);
    return codes.map((weekday) => ({ weekday, nth }));
  }
  return codes;
}

/** Build the exact RecurRule the controls describe (this is *the* rule — the
 * calendar, the list and the code preview are all just different views onto
 * `recur(rule)`). */
function buildRule(state: RoomState): RecurRule<ZDT> {
  const rule: RecurRule<ZDT> = {
    start: startZdt(state),
    freq: state.freq,
    interval: Math.max(1, state.interval || 1),
    byHour: [state.hour],
    byMinute: [state.minute],
  };
  const byWeekday = buildByWeekday(state);
  if (byWeekday && byWeekday.length) rule.byWeekday = byWeekday;
  if (state.freq === 'yearly' && state.months.size) {
    rule.byMonth = [...state.months].sort((a, b) => a - b);
  }
  if (state.boundMode === 'count') {
    rule.count = Math.max(1, state.count || 1);
  } else {
    rule.until = untilZdt(state);
  }
  return rule;
}

function ruleToCode(state: RoomState, rule: RecurRule<ZDT>): string {
  const lines: string[] = [];
  lines.push(`import { recur } from '@johnhenry/temporals';`);
  lines.push('');
  lines.push('recur({');
  lines.push(`  start: Temporal.ZonedDateTime.from("${rule.start.toString()}"),`);
  lines.push(`  freq: "${rule.freq}",`);
  if (rule.interval && rule.interval !== 1) lines.push(`  interval: ${rule.interval},`);
  if (rule.byWeekday?.length) {
    const byday = rule.byWeekday
      .map((w) => (typeof w === 'string' ? `"${w}"` : `{ weekday: "${w.weekday}", nth: ${w.nth} }`))
      .join(', ');
    lines.push(`  byWeekday: [${byday}],`);
  }
  if (rule.byMonth?.length) lines.push(`  byMonth: [${rule.byMonth.join(', ')}],`);
  if (rule.byMonthDay?.length) lines.push(`  byMonthDay: [${rule.byMonthDay.join(', ')}],`);
  if (rule.bySetPos?.length) lines.push(`  bySetPos: [${rule.bySetPos.join(', ')}],`);
  lines.push(`  byHour: [${rule.byHour}],`);
  lines.push(`  byMinute: [${rule.byMinute}],`);
  if (rule.count != null) lines.push(`  count: ${rule.count},`);
  if (rule.until) lines.push(`  until: Temporal.ZonedDateTime.from("${rule.until.toString()}"),`);
  lines.push('}).toArray();');
  lines.push('');
  lines.push(`// RFC 5545 — recur.fromString / formatRule interop:`);
  try {
    lines.push(`// ${formatRule(rule)}`);
  } catch (err) {
    lines.push(`// (formatRule failed: ${(err as Error).message})`);
  }
  if (state.intervalMode) {
    lines.push('');
    lines.push('// interval mode: pair each occurrence with a span');
    lines.push(`occurrence.add({ minutes: ${state.durationMinutes} }); // -> new Interval(occurrence, that)`);
  }
  return lines.join('\n');
}

function fmt(zdt: ZDT, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
  return dtf.format(new Date(zdt.epochMilliseconds));
}

function dateKey(zdt: ZDT): string {
  const p = zdt.toPlainDate();
  return p.toString();
}


type Sig<T> = Signal<T>;
type Comp<T> = Computed<T>;

// ---------------------------------------------------------------------------
// Reactivity inspector. Every signal/computed/effect in this planet is created
// through `Rx`, which wraps the real signalle primitive and counts how often
// it re-runs (the same instrumentation trick as the Signalle Loom: the
// instance's `value` setter is shadowed so writes are observed, and compute
// functions are wrapped so recomputes are counted). Open the panel and watch
// the clock: `now` ticks every second and `countdown` follows, while
// `nextOccurrence` recomputes but returns the same ZonedDateTime instance, so
// the calendar and the list stay still until the occurrence actually passes.
// ---------------------------------------------------------------------------
type RxKind = 'signal' | 'computed' | 'effect';
interface RxNode {
  name: string; kind: RxKind; runs: number; changes: number; value: string; ambient: boolean;
  last: unknown; flash: boolean; row?: HTMLTableRowElement; valEl?: HTMLElement; runEl?: HTMLElement; chgEl?: HTMLElement;
}
function rxFmt(v: unknown): string {
  if (v === undefined) return '…';
  if (typeof v === 'string') return v.length > 42 ? JSON.stringify(v.slice(0, 40) + '…') : JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  if (Array.isArray(v)) return `Array(${v.length})`;
  try { const j = JSON.stringify(v); return j.length > 42 ? j.slice(0, 41) + '…' : j; } catch { return String(v); }
}
class Rx {
  nodes: RxNode[] = [];
  disposers: (() => void)[] = [];
  panel: HTMLElement;
  private body: HTMLElement;
  private summary: HTMLElement;
  private open = false;
  private raf = 0;
  private epoch: { srcs: string[]; ran: string[]; timer: number } | null = null;
  /** True while an ambient write (a tick, a counter) is still propagating. */
  private inAmbient = false;

  constructor() {
    this.panel = document.createElement('div');
    this.panel.className = 'rx-panel';
    this.panel.hidden = true;
    this.panel.innerHTML = `
      <div class="rx-head"><b>reactivity inspector</b><span class="rx-legend"><i class="k-signal">signal</i><i class="k-computed">computed</i><i class="k-effect">effect</i></span>
      <button type="button" class="btn small" data-rx="reset">reset counters</button></div>
      <div class="rx-summary">Change any control: only the nodes downstream of what you touched flash. (Start-up counts are 2–3 because a signalle <code>computed()</code> is async: it first runs while its inputs are still resolving, then again once they land.)</div>
      <table class="rx-table"><thead><tr><th></th><th>name</th><th>value</th><th title="writes (signal) / recomputes (computed) / runs (effect)">runs</th><th title="times the value actually changed (Object.is)">Δ</th></tr></thead><tbody></tbody></table>`;
    this.body = this.panel.querySelector('tbody')!;
    this.summary = this.panel.querySelector('.rx-summary')!;
    this.panel.querySelector('[data-rx="reset"]')!.addEventListener('click', () => {
      for (const n of this.nodes) { n.runs = 0; n.changes = 0; }
      this.schedule();
    });
  }

  toggle(): boolean {
    this.open = !this.open;
    this.panel.hidden = !this.open;
    if (this.open) this.schedule();
    return this.open;
  }

  private add(name: string, kind: RxKind, ambient = false): RxNode {
    const n: RxNode = { name, kind, runs: 0, changes: 0, value: '…', ambient, last: undefined, flash: false };
    const row = document.createElement('tr');
    row.className = `k-${kind}`;
    row.innerHTML = `<td><span class="rx-dot"></span></td><td class="rx-name">${name}</td><td class="rx-val"></td><td class="rx-run">0</td><td class="rx-chg">0</td>`;
    n.row = row; n.valEl = row.children[2] as HTMLElement; n.runEl = row.children[3] as HTMLElement; n.chgEl = row.children[4] as HTMLElement;
    this.body.appendChild(row);
    this.nodes.push(n);
    return n;
  }

  private ran(n: RxNode, value?: unknown, hasValue = false) {
    n.runs++;
    n.flash = true;
    if (hasValue) {
      if (!Object.is(value, n.last) || n.runs === 1) n.changes++;
      n.last = value;
      n.value = rxFmt(value);
    } else n.value = `ran ×${n.runs}`;
    if (this.epoch && !n.ambient && !this.inAmbient && !this.epoch.ran.includes(n.name)) this.epoch.ran.push(n.name);
    this.schedule();
  }

  private startEpoch(src: string) {
    if (this.epoch) {
      if (!this.epoch.srcs.includes(src)) this.epoch.srcs.push(src);
      return;
    }
    const ep = { srcs: [src], ran: [] as string[], timer: 0 };
    ep.timer = window.setTimeout(() => {
      if (this.epoch !== ep) return;
      this.epoch = null;
      const derived = this.nodes.filter((n) => n.kind !== 'signal' && !n.ambient);
      const skipped = derived.filter((n) => !ep.ran.includes(n.name)).map((n) => n.name);
      const ran = ep.ran.filter((r) => !ep.srcs.includes(r));
      this.summary.innerHTML = `wrote <b>${ep.srcs.join(', ')}</b> → re-ran <b>${ran.length}</b> of ${derived.length}: ${ran.map((r) => `<code>${r}</code>`).join(' ') || '(nothing)'}`
        + (skipped.length ? `<br><span class="rx-skip">untouched: ${skipped.map((r) => `<code>${r}</code>`).join(' ')}</span>` : '');
    }, 180);
    this.epoch = ep;
  }

  private schedule() {
    if (!this.open || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      for (const n of this.nodes) {
        n.valEl!.textContent = n.value;
        n.runEl!.textContent = String(n.runs);
        n.chgEl!.textContent = n.kind === 'effect' ? '' : String(n.changes);
        if (n.flash) {
          n.flash = false;
          const row = n.row!;
          row.classList.remove('rx-flash');
          void row.offsetWidth; // restart the animation
          row.classList.add('rx-flash');
        }
      }
    });
  }

  /** signal(): a writable source. Writes are observed by shadowing `value`. */
  signal<T>(name: string, init: T, opts: { ambient?: boolean; fmt?: (v: T) => unknown } = {}): Sig<T> {
    const n = this.add(name, 'signal', opts.ambient);
    const s = signal<T>(init);
    const show = opts.fmt ?? ((v: T) => v);
    n.value = rxFmt(show(init)); n.last = init;
    let proto = Object.getPrototypeOf(s);
    let d: PropertyDescriptor | undefined;
    while (proto && !(d = Object.getOwnPropertyDescriptor(proto, 'value'))) proto = Object.getPrototypeOf(proto);
    const desc = d!;
    const rx = this;
    Object.defineProperty(s, 'value', {
      configurable: true,
      get() { return desc.get!.call(s); },
      set(v: T) {
        if (!Object.is(s.peek(), v)) {
          if (!n.ambient) rx.startEpoch(name);
          else if (!rx.inAmbient) {
            // Signalle propagates through promises (microtasks), so anything
            // that re-runs before the next macrotask was caused by this write.
            rx.inAmbient = true;
            setTimeout(() => { rx.inAmbient = false; }, 0);
          }
          n.last = undefined;
          rx.ran(n, show(v), true);
        }
        desc.set!.call(s, v);
      },
    });
    return s;
  }

  private wrap<T>(n: RxNode, fn: (...a: any[]) => T): (...a: any[]) => Promise<T> {
    return async (...args: any[]) => {
      let out: T;
      try { out = fn(...args); } catch (err) { console.error(`[rx:${n.name}]`, err); out = undefined as T; }
      this.ran(n, out, true);
      return out;
    };
  }

  /** computed(deps, fn): signalle's explicit-dependency derived value. */
  computed<T>(name: string, deps: Sig<any> | Sig<any>[], fn: (...a: any[]) => T, opts: { ambient?: boolean } = {}): Comp<T> {
    const n = this.add(name, 'computed', opts.ambient);
    const c = computed<T>(deps, this.wrap(n, fn));
    this.disposers.push(() => c.dispose());
    return c;
  }

  /** computedBind(el, deps, fn): a computed that writes straight into a DOM property. */
  bound<T>(name: string, el: HTMLElement, deps: Sig<any> | Sig<any>[], fn: (...a: any[]) => T, opts: { property?: keyof HTMLElement; ambient?: boolean } = {}): Comp<T> {
    const n = this.add(name, 'computed', opts.ambient);
    const c = computedBind<T>(el, deps, this.wrap(n, fn), opts.property ? { property: opts.property } : {});
    this.disposers.push(() => c.dispose());
    return c;
  }

  /** effect(sig, fn): the library's single-signal subscriber. */
  effect<T>(name: string, sig: Sig<T>, fn: (v: T) => void, opts: { ambient?: boolean } = {}) {
    const n = this.add(name, 'effect', opts.ambient);
    this.disposers.push(effect(sig, (v: T) => {
      this.ran(n);
      try { fn(v); } catch (err) { console.error(`[rx:${name}]`, err); }
    }));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    if (this.epoch) clearTimeout(this.epoch.timer);
    for (const d of this.disposers.splice(0)) { try { d(); } catch { /* ignore */ } }
  }
}

// ---- presets ----------------------------------------------------------

/** A preset is a patch over the planet's signals (applied inside `batch()`). */
type Patch = Partial<Omit<RoomState, 'weekdays' | 'months'>> & { weekdays?: Weekday[]; months?: number[]; payday?: boolean };

function presetPatch(name: string): Patch {
  const today = Temporal.Now.plainDateISO().toString();
  if (name === 'payday') {
    // payday needs BYMONTHDAY ∩ BYDAY ∩ BYSETPOS=-1 — see buildPaydayRule.
    return {
      freq: 'monthly', interval: 1, weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'], ordinal: '-1', months: [],
      startDate: today, hour: 17, minute: 0, timeZone: 'America/New_York', boundMode: 'count', count: 12,
      intervalMode: false, payday: true,
    };
  }
  if (name === 'standup') {
    return {
      freq: 'weekly', interval: 1, weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'], ordinal: 'any', months: [],
      startDate: today, hour: 9, minute: 30, timeZone: 'Asia/Tokyo', boundMode: 'count', count: 20,
      intervalMode: true, durationMinutes: 15, payday: false,
    };
  }
  return {
    freq: 'monthly', interval: 3, weekdays: ['MO'], ordinal: '1', months: [],
    startDate: today, hour: 10, minute: 0, timeZone: defaultTimeZone(), boundMode: 'count', count: 8,
    intervalMode: true, durationMinutes: 90, payday: false,
  };
}

/** Payday needs an AND-intersection RRULE (BYMONTHDAY last-3 ∩ BYDAY Mon-Fri,
 * BYSETPOS -1 picks the final match) that the generic control mapping above
 * can't express — build it directly when the payday preset flag is set. */
function buildPaydayRule(state: RoomState): RecurRule<ZDT> {
  return {
    start: startZdt(state),
    freq: 'monthly',
    interval: state.interval,
    byMonthDay: [-3, -2, -1],
    byWeekday: ['MO', 'TU', 'WE', 'TH', 'FR'],
    bySetPos: [-1],
    byHour: [state.hour],
    byMinute: [state.minute],
    ...(state.boundMode === 'count' ? { count: Math.max(1, state.count || 1) } : { until: untilZdt(state) }),
  };
}

// ---- deep links ---------------------------------------------------------

const FREQS: Freq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const WD_CODES = WEEKDAYS.map((w) => w.code);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function linkDefaults() {
  const d = defaultState();
  return {
    freq: d.freq as string,
    every: d.interval,
    days: [...d.weekdays].join(','),
    ord: d.ordinal,
    months: '',
    start: d.startDate,
    time: `${pad(d.hour)}:${pad(d.minute)}`,
    tz: d.timeZone,
    bound: d.boundMode as string,
    count: d.count,
    until: d.until,
    spans: d.intervalMode,
    dur: d.durationMinutes,
    payday: false,
  };
}
type Link = ReturnType<typeof linkDefaults>;

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

// ---- Tab state / deep links for the 5 new pieces ------------------------

type TabId = 'recur' | 'cron' | 'meet' | 'paste';
const TABS: { id: TabId; label: string }[] = [
  { id: 'recur', label: 'Recurrence' },
  { id: 'cron', label: 'Cron ↔ RRULE' },
  { id: 'meet', label: 'Meeting finder' },
  { id: 'paste', label: 'Paste an RRULE' },
];
const isTime = (s: unknown): s is string => typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s);

/** Defaults for the extra tabs. The meeting-finder range defaults to the next
 * real US federal holiday (via `usFederalHolidays()`), so the room proves
 * holiday exclusion with zero user input. */
function extraLinkDefaults() {
  const today = Temporal.Now.plainDateISO();
  const tz = defaultTimeZone();
  let meetStart = today.add({ days: 5 }).toString();
  try {
    const hol = usFederalHolidays();
    const upcoming = [...hol.inYear(today.year), ...hol.inYear(today.year + 1)]
      .filter((d) => Temporal.PlainDate.compare(d, today) >= 0)
      .sort((a, b) => Temporal.PlainDate.compare(a, b));
    if (upcoming[0]) meetStart = upcoming[0].subtract({ days: 2 }).toString();
  } catch { /* fall back to today+5 above */ }
  return {
    tab: 'recur' as TabId,
    cronExpr: '0 9 * * 1-5',
    cronDate: today.toString(),
    cronTime: '09:00',
    cronTz: tz,
    pasteRule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6',
    pasteDate: today.toString(),
    pasteTime: '09:00',
    pasteTz: tz,
    meetTzA: 'America/New_York',
    meetTzB: 'America/Los_Angeles',
    meetStartA: '09:00',
    meetEndA: '17:00',
    meetStartB: '09:00',
    meetEndB: '17:00',
    meetHolidays: true,
    meetRangeStart: meetStart,
    meetRangeDays: 7,
    meetDuration: 30,
  };
}
type ExtraLink = ReturnType<typeof extraLinkDefaults>;

function countdownText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
}

type RuleResult = { ok: true; rule: RecurRule<ZDT>; state: RoomState } | { ok: false; error: string };

const playground: Playground = {
  id: 'temporals',
  title: 'Temporal Loom',
  pkg: '@johnhenry/temporals',
  hue: 200,
  blurb: '"Every second Tuesday" as a lazy, re-iterable sequence of Temporal objects.',
  docs: 'https://opensource.johnhenry.me/temporals/',
  mount(host) {
    const defaults = linkDefaults();
    const extraDefaults = extraLinkDefaults();
    const init = readState<Link & ExtraLink>({ ...defaults, ...extraDefaults });
    const [ih, im] = (/^\d{1,2}:\d{2}$/.test(init.time) ? init.time : defaults.time).split(':').map(Number);

    // Plain (non-Rx) state for the 4 new tabs — these are simple widgets, not
    // part of the reactivity inspector's demo of the main rule engine.
    const ex: ExtraLink = {
      tab: TABS.some((t) => t.id === init.tab) ? init.tab : extraDefaults.tab,
      cronExpr: typeof init.cronExpr === 'string' && init.cronExpr.trim() ? init.cronExpr : extraDefaults.cronExpr,
      cronDate: isDate(init.cronDate) ? init.cronDate : extraDefaults.cronDate,
      cronTime: isTime(init.cronTime) ? init.cronTime : extraDefaults.cronTime,
      cronTz: ZONES.includes(init.cronTz) ? init.cronTz : extraDefaults.cronTz,
      pasteRule: typeof init.pasteRule === 'string' && init.pasteRule.trim() ? init.pasteRule : extraDefaults.pasteRule,
      pasteDate: isDate(init.pasteDate) ? init.pasteDate : extraDefaults.pasteDate,
      pasteTime: isTime(init.pasteTime) ? init.pasteTime : extraDefaults.pasteTime,
      pasteTz: ZONES.includes(init.pasteTz) ? init.pasteTz : extraDefaults.pasteTz,
      meetTzA: ZONES.includes(init.meetTzA) ? init.meetTzA : extraDefaults.meetTzA,
      meetTzB: ZONES.includes(init.meetTzB) ? init.meetTzB : extraDefaults.meetTzB,
      meetStartA: isTime(init.meetStartA) ? init.meetStartA : extraDefaults.meetStartA,
      meetEndA: isTime(init.meetEndA) ? init.meetEndA : extraDefaults.meetEndA,
      meetStartB: isTime(init.meetStartB) ? init.meetStartB : extraDefaults.meetStartB,
      meetEndB: isTime(init.meetEndB) ? init.meetEndB : extraDefaults.meetEndB,
      meetHolidays: typeof init.meetHolidays === 'boolean' ? init.meetHolidays : extraDefaults.meetHolidays,
      meetRangeStart: isDate(init.meetRangeStart) ? init.meetRangeStart : extraDefaults.meetRangeStart,
      meetRangeDays: clampInt(init.meetRangeDays, 1, 60, extraDefaults.meetRangeDays),
      meetDuration: clampInt(init.meetDuration, 5, 480, extraDefaults.meetDuration),
    };

    // ---- sources: one signalle signal per control ------------------------
    const rx = new Rx();
    const freq = rx.signal<Freq>('freq', FREQS.includes(init.freq as Freq) ? (init.freq as Freq) : 'monthly');
    const interval = rx.signal<number>('interval', clampInt(init.every, 1, 24, 1));
    const weekdays = rx.signal<Weekday[]>('weekdays', WD_CODES.filter((c) => String(init.days).split(',').includes(c)));
    const ordinal = rx.signal<string>('ordinal', ORDINALS.some((o) => o.value === init.ord) ? init.ord : defaults.ord);
    const months = rx.signal<number[]>('months', String(init.months).split(',').map(Number).filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b));
    const startDate = rx.signal<string>('startDate', isDate(init.start) ? init.start : defaults.start);
    const hour = rx.signal<number>('hour', clampInt(ih, 0, 23, 9));
    const minute = rx.signal<number>('minute', clampInt(im, 0, 59, 0));
    const timeZone = rx.signal<string>('timeZone', ZONES.includes(init.tz) ? init.tz : defaults.tz);
    const boundMode = rx.signal<BoundMode>('boundMode', init.bound === 'until' ? 'until' : 'count');
    const count = rx.signal<number>('count', clampInt(init.count, 1, 200, 12));
    const until = rx.signal<string>('until', isDate(init.until) ? init.until : defaults.until);
    const intervalMode = rx.signal<boolean>('intervalMode', init.spans === true);
    const durationMinutes = rx.signal<number>('durationMinutes', clampInt(init.dur, 1, 1440, 60));
    const payday = rx.signal<boolean>('payday', init.payday === true);
    // The wall clock, fed by @johnhenry/css-signals date() (see below).
    const now = rx.signal<number>('now', Date.now(), { ambient: true, fmt: (ms) => new Date(ms).toISOString().slice(11, 19) + 'Z' });

    const ruleInputs = [freq, interval, weekdays, ordinal, months, startDate, hour, minute, timeZone, boundMode, count, until, payday];
    const allInputs = [...ruleInputs, intervalMode, durationMinutes];

    host.innerHTML = `
      <div class="pg-temporals">
        <div class="panel loom-now">
          <div class="loom-clock" title="Published as --loom-date-rule-* CSS custom properties by @johnhenry/css-signals date(); this text is drawn by CSS counters">
            <span class="clk-ring"></span>
            <span class="clk-time"></span>
            <span class="clk-zone" id="clk-zone"></span>
          </div>
          <div class="loom-next">
            <div class="next-label">next occurrence in</div>
            <div class="next-count" id="out-countdown">…</div>
            <div class="next-when" id="out-nextwhen"></div>
            <code class="next-rrule" id="out-rrule" title="formatRule(rule): the RFC 5545 form of the same rule"></code>
          </div>
          <div class="loom-tools">
            <button type="button" class="btn small" id="t-rx" aria-pressed="false">◉ reactivity inspector</button>
            <button type="button" class="btn small" id="t-ics">⬇ export .ics</button>
            <button type="button" class="btn small" id="t-copy">⧉ copy link</button>
            <span class="stat" id="t-note">every control is a <code>signal()</code>; the URL is a <code>computed()</code></span>
          </div>
        </div>
        <div id="rx-slot"></div>

        <div class="loom-tabs" id="loom-tabs" role="tablist">
          ${TABS.map((t) => `<button type="button" class="tab-btn" data-tab="${t.id}" role="tab">${t.label}</button>`).join('')}
        </div>

        <div id="tab-recur" class="tab-panel">
        <div class="grid-2">
          <div class="panel controls">
            <div class="presets">
              <button class="btn" data-preset="payday">payday: last weekday of month</button>
              <button class="btn" data-preset="standup">standup: weekdays 9:30 in Tokyo</button>
              <button class="btn" data-preset="quarterly">quarterly review</button>
            </div>

            <div class="ctl-row">
              <label class="field"><span>Frequency</span>
                <select id="c-freq">
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                  <option value="yearly">yearly</option>
                </select>
              </label>
              <label class="field"><span>Every N</span>
                <input id="c-interval" type="number" min="1" max="24" value="1" />
              </label>
              <label class="field" id="c-ordinal-field"><span>Ordinal</span>
                <select id="c-ordinal"></select>
              </label>
            </div>

            <div class="ctl-row">
              <span class="ctl-label">On weekday(s)</span>
              <div class="chip-row" id="c-weekdays"></div>
            </div>

            <div class="ctl-row" id="c-months-row">
              <span class="ctl-label">In month(s) (yearly, optional)</span>
              <div class="chip-row" id="c-months"></div>
            </div>

            <div class="ctl-row">
              <label class="field"><span>Start date</span>
                <input id="c-start" type="date" />
              </label>
              <label class="field"><span>Time of day</span>
                <input id="c-time" type="time" />
              </label>
              <label class="field"><span>Time zone</span>
                <select id="c-zone"></select>
              </label>
            </div>

            <div class="ctl-row">
              <span class="ctl-label">Bound by</span>
              <label class="radio"><input type="radio" name="c-bound" value="count" /> count</label>
              <input id="c-count" type="number" min="1" max="200" value="12" />
              <label class="radio"><input type="radio" name="c-bound" value="until" /> until</label>
              <input id="c-until" type="date" />
            </div>

            <div class="ctl-row">
              <label class="radio"><input id="c-interval-mode" type="checkbox" /> interval mode ({start,end} spans)</label>
              <label class="field mini"><span>span length (min)</span>
                <input id="c-duration" type="number" min="1" max="1440" value="60" />
              </label>
            </div>

            <div class="stat" id="c-stat"></div>
          </div>

          <div class="panel">
            <div class="panel-title">the exact library call</div>
            <pre class="code" id="out-code"></pre>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">three-month calendar — click a day to set it as the start date <span class="cal-key"><i class="k-today">today</i><i class="k-next">next</i><i class="k-match">occurrence</i></span></div>
          <div class="cal-grid" id="out-calendar"></div>
        </div>

        <div class="grid-2">
          <div class="panel">
            <div class="panel-title">next occurrences</div>
            <div class="occ-list" id="out-list"></div>
          </div>
          <div class="panel" id="timeline-panel">
            <div class="panel-title">interval spans</div>
            <div class="timeline" id="out-timeline"></div>
          </div>
        </div>

        <pre class="code error-box" id="out-error" hidden></pre>
        <pre class="code error-box" id="out-ics-status" hidden></pre>
        </div>

        <div id="tab-cron" class="tab-panel" hidden>
          <div class="panel">
            <div class="panel-title">cron ↔ RRULE — <code>/cron</code> <code>cronToRule</code>, <code>ruleToCron</code>, <code>describeCron</code></div>
            <p class="tab-copy">Type a cron expression (5 or 6 fields, Quartz <code>L</code>/<code>#</code> specials ok) or an RFC&nbsp;5545 RRULE string — each side converts the other live. The anchor date/time/zone below is the DTSTART used for the RRULE side (cron itself is clock-aligned and needs no anchor to fire, but an RRULE needs a start point).</p>
            <div class="ctl-row">
              <label class="field"><span>Anchor date</span><input id="cr-date" type="date" /></label>
              <label class="field"><span>Anchor time</span><input id="cr-time" type="time" /></label>
              <label class="field"><span>Anchor zone</span><select id="cr-zone"></select></label>
            </div>
            <div class="grid-2">
              <label class="field"><span>Cron expression</span>
                <input id="cr-cron" type="text" class="code" spellcheck="false" />
              </label>
              <label class="field"><span>RRULE string</span>
                <input id="cr-rrule" type="text" class="code" spellcheck="false" />
              </label>
            </div>
            <div class="stat" id="cr-describe"></div>
            <div class="stat" id="cr-roundtrip"></div>
            <pre class="code error-box" id="cr-error" hidden></pre>
          </div>
        </div>

        <div id="tab-meet" class="tab-panel" hidden>
          <div class="panel">
            <div class="panel-title">meeting finder — <code>/business</code> <code>meetingSlots</code>, <code>usFederalHolidays</code>, <code>WorkingHours</code></div>
            <p class="tab-copy">Two people, each with their own working hours and time zone. Slots must fall inside <em>both</em> people's working hours and, when the checkbox is on, must not land on a US federal holiday (weekend-observed).</p>
            <div class="grid-2">
              <div class="ctl-row">
                <span class="ctl-label">Person A</span>
                <label class="field mini"><span>zone</span><select id="mt-tza"></select></label>
                <label class="field mini"><span>start</span><input id="mt-starta" type="time" /></label>
                <label class="field mini"><span>end</span><input id="mt-enda" type="time" /></label>
              </div>
              <div class="ctl-row">
                <span class="ctl-label">Person B</span>
                <label class="field mini"><span>zone</span><select id="mt-tzb"></select></label>
                <label class="field mini"><span>start</span><input id="mt-startb" type="time" /></label>
                <label class="field mini"><span>end</span><input id="mt-endb" type="time" /></label>
              </div>
            </div>
            <div class="ctl-row">
              <label class="field"><span>Search from</span><input id="mt-start" type="date" /></label>
              <label class="field mini"><span>for N days</span><input id="mt-days" type="number" min="1" max="60" /></label>
              <label class="field mini"><span>meeting length (min)</span><input id="mt-dur" type="number" min="5" max="480" /></label>
              <label class="radio"><input id="mt-holidays" type="checkbox" /> exclude US federal holidays</label>
            </div>
            <div class="stat" id="mt-holiday-note"></div>
            <div class="occ-list" id="mt-slots"></div>
            <pre class="code error-box" id="mt-error" hidden></pre>
          </div>
        </div>

        <div id="tab-paste" class="tab-panel" hidden>
          <div class="panel">
            <div class="panel-title">paste an RRULE — <code>ruleFromString</code></div>
            <p class="tab-copy"><strong>RRULE syntax only, not natural language.</strong> Paste a real RFC&nbsp;5545 recurrence rule, e.g. <code>FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6</code>. Typing English like "every second Tuesday" will <em>not</em> work — this parses the standard's field syntax (<code>FREQ</code>, <code>BYDAY</code>, <code>INTERVAL</code>, <code>COUNT</code>, <code>UNTIL</code>, …), not free text.</p>
            <div class="ctl-row">
              <label class="field"><span>Anchor date</span><input id="ps-date" type="date" /></label>
              <label class="field"><span>Anchor time</span><input id="ps-time" type="time" /></label>
              <label class="field"><span>Anchor zone</span><select id="ps-zone"></select></label>
            </div>
            <label class="field"><span>RRULE string</span>
              <input id="ps-rrule" type="text" class="code" spellcheck="false" />
            </label>
            <div class="stat" id="ps-stat"></div>
            <div class="occ-list" id="ps-list"></div>
            <pre class="code error-box" id="ps-error" hidden></pre>
          </div>
        </div>
      </div>
    `;

    const root = host.querySelector<HTMLDivElement>('.pg-temporals')!;
    host.querySelector('#rx-slot')!.appendChild(rx.panel);

    // populate static option lists
    const ordinalSel = host.querySelector<HTMLSelectElement>('#c-ordinal')!;
    ordinalSel.innerHTML = ORDINALS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');

    const zoneSel = host.querySelector<HTMLSelectElement>('#c-zone')!;
    zoneSel.innerHTML = ZONES.map((z) => `<option value="${z}">${z}</option>`).join('');

    const wdRow = host.querySelector<HTMLDivElement>('#c-weekdays')!;
    wdRow.innerHTML = WEEKDAYS.map(
      (w) => `<button type="button" class="chip toggle" data-wd="${w.code}">${w.label}</button>`,
    ).join('');

    const monthsRow = host.querySelector<HTMLDivElement>('#c-months')!;
    monthsRow.innerHTML = MONTH_NAMES.map(
      (name, i) => `<button type="button" class="chip toggle" data-month="${i + 1}">${name}</button>`,
    ).join('');

    const freqSel = host.querySelector<HTMLSelectElement>('#c-freq')!;
    const intervalInput = host.querySelector<HTMLInputElement>('#c-interval')!;
    const ordinalField = host.querySelector<HTMLElement>('#c-ordinal-field')!;
    const monthsRowWrap = host.querySelector<HTMLDivElement>('#c-months-row')!;
    const startInput = host.querySelector<HTMLInputElement>('#c-start')!;
    const timeInput = host.querySelector<HTMLInputElement>('#c-time')!;
    const countInput = host.querySelector<HTMLInputElement>('#c-count')!;
    const untilInput = host.querySelector<HTMLInputElement>('#c-until')!;
    const boundRadios = Array.from(host.querySelectorAll<HTMLInputElement>('input[name="c-bound"]'));
    const intervalModeCb = host.querySelector<HTMLInputElement>('#c-interval-mode')!;
    const durationInput = host.querySelector<HTMLInputElement>('#c-duration')!;
    const statEl = host.querySelector<HTMLDivElement>('#c-stat')!;
    const codeEl = host.querySelector<HTMLPreElement>('#out-code')!;
    const calEl = host.querySelector<HTMLDivElement>('#out-calendar')!;
    const listEl = host.querySelector<HTMLDivElement>('#out-list')!;
    const timelinePanel = host.querySelector<HTMLDivElement>('#timeline-panel')!;
    const timelineEl = host.querySelector<HTMLDivElement>('#out-timeline')!;
    const errorEl = host.querySelector<HTMLPreElement>('#out-error')!;
    const countdownEl = host.querySelector<HTMLDivElement>('#out-countdown')!;
    const nextWhenEl = host.querySelector<HTMLDivElement>('#out-nextwhen')!;
    const zoneLabel = host.querySelector<HTMLSpanElement>('#clk-zone')!;
    const noteEl = host.querySelector<HTMLSpanElement>('#t-note')!;
    const rruleEl = host.querySelector<HTMLElement>('#out-rrule')!;
    const icsStatusEl = host.querySelector<HTMLPreElement>('#out-ics-status')!;

    // ---- tabs -------------------------------------------------------------
    const tabsEl = host.querySelector<HTMLDivElement>('#loom-tabs')!;
    const tabButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('.tab-btn'));
    const tabPanels: Record<TabId, HTMLElement> = {
      recur: host.querySelector<HTMLElement>('#tab-recur')!,
      cron: host.querySelector<HTMLElement>('#tab-cron')!,
      meet: host.querySelector<HTMLElement>('#tab-meet')!,
      paste: host.querySelector<HTMLElement>('#tab-paste')!,
    };

    // ---- cron ↔ RRULE tab ---------------------------------------------------
    const crDateInput = host.querySelector<HTMLInputElement>('#cr-date')!;
    const crTimeInput = host.querySelector<HTMLInputElement>('#cr-time')!;
    const crZoneSel = host.querySelector<HTMLSelectElement>('#cr-zone')!;
    const crCronInput = host.querySelector<HTMLInputElement>('#cr-cron')!;
    const crRruleInput = host.querySelector<HTMLInputElement>('#cr-rrule')!;
    const crDescribeEl = host.querySelector<HTMLDivElement>('#cr-describe')!;
    const crRoundtripEl = host.querySelector<HTMLDivElement>('#cr-roundtrip')!;
    const crErrorEl = host.querySelector<HTMLPreElement>('#cr-error')!;

    // ---- meeting finder tab -------------------------------------------------
    const mtTzASel = host.querySelector<HTMLSelectElement>('#mt-tza')!;
    const mtTzBSel = host.querySelector<HTMLSelectElement>('#mt-tzb')!;
    const mtStartAInput = host.querySelector<HTMLInputElement>('#mt-starta')!;
    const mtEndAInput = host.querySelector<HTMLInputElement>('#mt-enda')!;
    const mtStartBInput = host.querySelector<HTMLInputElement>('#mt-startb')!;
    const mtEndBInput = host.querySelector<HTMLInputElement>('#mt-endb')!;
    const mtStartInput = host.querySelector<HTMLInputElement>('#mt-start')!;
    const mtDaysInput = host.querySelector<HTMLInputElement>('#mt-days')!;
    const mtDurInput = host.querySelector<HTMLInputElement>('#mt-dur')!;
    const mtHolidaysCb = host.querySelector<HTMLInputElement>('#mt-holidays')!;
    const mtHolidayNoteEl = host.querySelector<HTMLDivElement>('#mt-holiday-note')!;
    const mtSlotsEl = host.querySelector<HTMLDivElement>('#mt-slots')!;
    const mtErrorEl = host.querySelector<HTMLPreElement>('#mt-error')!;

    // ---- paste-an-RRULE tab --------------------------------------------------
    const psDateInput = host.querySelector<HTMLInputElement>('#ps-date')!;
    const psTimeInput = host.querySelector<HTMLInputElement>('#ps-time')!;
    const psZoneSel = host.querySelector<HTMLSelectElement>('#ps-zone')!;
    const psRruleInput = host.querySelector<HTMLInputElement>('#ps-rrule')!;
    const psStatEl = host.querySelector<HTMLDivElement>('#ps-stat')!;
    const psListEl = host.querySelector<HTMLDivElement>('#ps-list')!;
    const psErrorEl = host.querySelector<HTMLPreElement>('#ps-error')!;

    for (const sel of [crZoneSel, mtTzASel, mtTzBSel, psZoneSel]) {
      sel.innerHTML = ZONES.map((z) => `<option value="${z}">${z}</option>`).join('');
    }

    // ---- derived values: computed() over the sources -----------------------

    /** The one RecurRule the controls describe. Every view below is a
     * different window onto `recur(rule)`. */
    const rule = rx.computed<RuleResult>('rule', ruleInputs, (
      f: Freq, iv: number, wds: Weekday[], ord: string, ms: number[], sd: string, h: number, mi: number,
      tz: string, bm: BoundMode, c: number, u: string, pd: boolean,
    ) => {
      const st: RoomState = {
        freq: f, interval: iv, weekdays: new Set(wds), ordinal: ord, months: new Set(ms), startDate: sd,
        hour: h, minute: mi, timeZone: tz, boundMode: bm, count: c, until: u,
        intervalMode: intervalMode.peek(), durationMinutes: durationMinutes.peek(),
      };
      try {
        return { ok: true, rule: pd ? buildPaydayRule(st) : buildRule(st), state: st };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
      }
    });

    rx.bound('rrule', rruleEl, rule, (r: RuleResult | undefined) => {
      if (!r?.ok) return '';
      try { return formatRule(r.rule); } catch (err) { return `(formatRule failed: ${(err as Error).message})`; }
    });

    rx.bound('code', codeEl, [rule, intervalMode, durationMinutes], (r: RuleResult | undefined, im: boolean, dm: number) =>
      r?.ok ? ruleToCode({ ...r.state, intervalMode: im, durationMinutes: dm }, r.rule) : '');

    /** One lazy Seq, materialised once per rule change (capped). */
    const occurrences = rx.computed<ZDT[]>('occurrences', rule, (r: RuleResult | undefined) =>
      r?.ok ? recur(r.rule).take(CALENDAR_SAFETY_CAP).toArray() : []);

    const calendar = rx.computed('calendarWindow', [rule, occurrences], (r: RuleResult | undefined, occ: ZDT[] | undefined) => {
      if (!r?.ok || !occ) return null;
      const winStart = startOf(r.rule.start, 'month');
      const winEnd = endOf(winStart.add({ months: 2 }), 'month');
      const win = new Interval(winStart, winEnd);
      const inWindow = occ.filter((zdt) => win.contains(zdt));
      return { winStart, win, inWindow, matchKeys: new Set(inWindow.map(dateKey)) };
    });

    const errorText = rx.computed<string>('error', rule, (r: RuleResult | undefined) => (r && !r.ok ? r.error : ''));

    // Clock-driven nodes: `now` ticks every second, but these return the
    // same string / the same ZonedDateTime instance until something actually
    // changes, so Object.is stops the cascade right there.
    const todayKey = rx.computed<string>('todayKey', [now, timeZone], (ms: number, tz: string) =>
      Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(tz).toPlainDate().toString());

    const nextOcc = rx.computed<ZDT | null>('nextOccurrence', [occurrences, now], (occ: ZDT[] | undefined, ms: number) =>
      occ?.find((z) => z.epochMilliseconds > ms) ?? null);

    const nextKey = rx.computed<string>('nextKey', nextOcc, (z: ZDT | null | undefined) => (z ? dateKey(z) : ''));

    rx.bound('countdown', countdownEl, [nextOcc, now, occurrences], (z: ZDT | null | undefined, ms: number, occ: ZDT[] | undefined) => {
      if (z) return countdownText(z.epochMilliseconds - ms);
      return occ && occ.length ? 'all past' : '—';
    }, { ambient: true });

    rx.bound('nextWhen', nextWhenEl, [nextOcc, occurrences], (z: ZDT | null | undefined, occ: ZDT[] | undefined) => {
      if (!occ || !occ.length) return 'no occurrences match these controls';
      if (!z) return `all ${occ.length} occurrences are in the past`;
      return `#${occ.indexOf(z) + 1} of ${occ.length}${occ.length >= CALENDAR_SAFETY_CAP ? '+' : ''} · ${fmt(z, z.timeZoneId)} · ${z.timeZoneId}`;
    });

    rx.bound('statLine', statEl, [occurrences, calendar], (occ: ZDT[] | undefined, cal: { win: Interval<ZDT>; inWindow: ZDT[] } | null | undefined) => {
      if (!occ || !cal) return '';
      const shown = Math.min(LIST_SAFETY_CAP, occ.length);
      return `<b>${shown}</b> shown &middot; <b>${cal.inWindow.length}</b> in the 3-month window &middot; window <b>${cal.win.toDuration({ largestUnit: 'day' }).days}d</b>`;
    }, { property: 'innerHTML' });

    rx.bound('calendarCells', calEl, [calendar, todayKey, nextKey], (
      cal: { winStart: ZDT; matchKeys: Set<string> } | null | undefined, today: string, next: string,
    ) => {
      if (!cal) return '';
      const out: string[] = [];
      for (let i = 0; i < 3; i++) {
        const monthStart = cal.winStart.add({ months: i });
        const leading = monthStart.dayOfWeek - 1; // 1=Mon..7=Sun
        const cells: string[] = [];
        for (let b = 0; b < leading; b++) cells.push('<div class="cal-cell empty"></div>');
        for (let d = 1; d <= monthStart.daysInMonth; d++) {
          const key = monthStart.with({ day: d }).toPlainDate().toString();
          const cls = `${cal.matchKeys.has(key) ? ' match' : ''}${key === today ? ' today' : ''}${key === next ? ' next' : ''}`;
          const title = `${key}${key === today ? ' · today' : ''}${key === next ? ' · next occurrence' : ''}`;
          cells.push(`<button type="button" class="cal-cell${cls}" data-date="${key}" title="${title}">${d}</button>`);
        }
        out.push(`
          <div class="cal-month">
            <div class="cal-month-title">${MONTH_NAMES[monthStart.month - 1]} ${monthStart.year}</div>
            <div class="cal-dow">${WEEKDAYS.map((w) => `<span>${w.label[0]}</span>`).join('')}</div>
            <div class="cal-days">${cells.join('')}</div>
          </div>`);
      }
      return out.join('');
    }, { property: 'innerHTML' });

    // fromNow() (temporals/humanize): humanized alongside the raw date. `now`
    // is a dependency so "in 3 days" ages into "in 2 days" as the clock ticks.
    rx.bound('occurrenceList', listEl, [occurrences, nextOcc, now], (occ: ZDT[] | undefined, next: ZDT | null | undefined) => {
      if (!occ || !occ.length) return `<div class="empty-note">No occurrences match these controls.</div>`;
      const nextIdx = next ? occ.indexOf(next) : occ.length;
      return occ.slice(0, LIST_SAFETY_CAP).map((zdt, i) => {
        const cls = i < nextIdx ? ' past' : i === nextIdx ? ' next' : '';
        const tag = i === nextIdx ? '<span class="occ-tag">next</span>' : '';
        let rel = '';
        try { rel = fromNow(zdt); } catch { /* ignore */ }
        return `<div class="occ-row${cls}"><span class="occ-idx">${i + 1}</span><span class="occ-date">${fmt(zdt, zdt.timeZoneId)}</span><span class="occ-fromnow">${rel}</span>${tag}</div>`;
      }).join('');
    }, { property: 'innerHTML' });

    rx.bound('spans', timelineEl, [occurrences, intervalMode, durationMinutes], (occ: ZDT[] | undefined, on: boolean, dm: number) => {
      if (!on || !occ) return '';
      const spans = occ.slice(0, 20).map((o) => new Interval(o, o.add({ minutes: dm })));
      if (!spans.length) return `<div class="empty-note">No spans to show.</div>`;
      const min = spans[0].start.epochMilliseconds;
      const max = spans[spans.length - 1].end.epochMilliseconds;
      const span = Math.max(1, max - min);
      return spans.map((iv) => {
        const left = ((iv.start.epochMilliseconds - min) / span) * 100;
        const width = Math.max(0.6, ((iv.end.epochMilliseconds - iv.start.epochMilliseconds) / span) * 100);
        const dur = iv.toDuration();
        return `<div class="tl-row">
            <span class="tl-label">${fmt(iv.start, iv.start.timeZoneId)}</span>
            <div class="tl-track"><div class="tl-bar" style="left:${left}%;width:${width}%" title="${iv.toString()}"></div></div>
            <span class="tl-dur">${dur.hours ? dur.hours + 'h' : ''}${dur.minutes ? dur.minutes + 'm' : ''}</span>
          </div>`;
      }).join('');
    }, { property: 'innerHTML' });

    rx.bound('errorBox', errorEl, errorText, (e: string | undefined) => e ?? '');
    bindAttribute(errorEl, 'hidden', rx.computed('errorHidden', errorText, (e: string | undefined) => !e));

    // ---- controls ← signals ----------------------------------------------
    // One snapshot computed drives the form, so presets / deep links /
    // calendar clicks all land in the inputs through the same path.
    const form = rx.computed('formSnapshot', allInputs, (...vals: unknown[]) => vals);
    rx.effect('syncControls', form, (vals) => {
      if (!vals) return;
      const [f, iv, wds, ord, ms, sd, h, mi, tz, bm, c, u, , im, dm] = vals as [
        Freq, number, Weekday[], string, number[], string, number, number, string, BoundMode, number, string, boolean, boolean, number];
      const set = (el: HTMLInputElement | HTMLSelectElement, v: string) => { if (el !== document.activeElement && el.value !== v) el.value = v; };
      set(freqSel, f);
      set(intervalInput, String(iv));
      set(ordinalSel, ord);
      set(startInput, sd);
      set(timeInput, `${pad(h)}:${pad(mi)}`);
      set(zoneSel, tz);
      set(countInput, String(c));
      set(untilInput, u);
      for (const r of boundRadios) r.checked = r.value === bm;
      countInput.disabled = bm !== 'count';
      untilInput.disabled = bm !== 'until';
      intervalModeCb.checked = im;
      set(durationInput, String(dm));
      durationInput.disabled = !im;
      wdRow.querySelectorAll<HTMLButtonElement>('[data-wd]').forEach((btn) => btn.classList.toggle('active', wds.includes(btn.dataset.wd as Weekday)));
      monthsRow.querySelectorAll<HTMLButtonElement>('[data-month]').forEach((btn) => btn.classList.toggle('active', ms.includes(Number(btn.dataset.month))));
    });
    const showOrdinal = rx.computed<boolean>('showOrdinal', freq, (f: Freq) => f === 'monthly' || f === 'yearly');
    rx.effect('ordinalVisible', showOrdinal, (on) => { ordinalField.style.display = on ? '' : 'none'; });
    const showMonths = rx.computed<boolean>('showMonths', freq, (f: Freq) => f === 'yearly');
    rx.effect('monthsVisible', showMonths, (on) => { monthsRowWrap.style.display = on ? '' : 'none'; });
    rx.effect('spansVisible', intervalMode, (on) => { timelinePanel.style.display = on ? '' : 'none'; });

    // ---- the URL is just another computed ------------------------------------
    const link = rx.computed<string>('link', allInputs, (
      f: Freq, iv: number, wds: Weekday[], ord: string, ms: number[], sd: string, h: number, mi: number,
      tz: string, bm: BoundMode, c: number, u: string, pd: boolean, im: boolean, dm: number,
    ) => JSON.stringify({
      freq: f, every: iv, days: wds.join(','), ord, months: ms.join(','), start: sd, time: `${pad(h)}:${pad(mi)}`,
      tz, bound: bm, count: c, until: u, spans: im, dur: dm, payday: pd,
    }));
    // Deep links for the 4 new tabs live in `ex` (plain state, not signalle
    // signals) and are merged with the main rule's link JSON on every write —
    // writeState() replaces the whole query string, so a partial write from
    // one side would silently drop the other's fields.
    const allLinkDefaults: Record<string, unknown> = { ...defaults, ...extraDefaults };
    function persist(mainJson?: string) {
      if (!host.isConnected) return;
      const main = mainJson ? JSON.parse(mainJson) : JSON.parse(link.peek() ?? '{}');
      writeState({ ...main, ...ex }, allLinkDefaults);
    }
    // isConnected: a planet whose route was superseded mid-load must not rewrite the next planet's URL.
    rx.effect('writeURL', link, (json) => persist(json));

    // ---- the live clock: @johnhenry/css-signals date() -----------------------
    // date() publishes --loom-date-rule-{year,month,monthday,hour24,minute,second}
    // on this planet's root element once per second, in the rule's time zone.
    // The clock face is pure CSS (counters + a conic ring). A MutationObserver
    // reads the same properties back into the `now` signal, which drives the
    // countdown and the today/next highlights.
    let css: Signals | null = null;
    const field = (k: string) => Number(root.style.getPropertyValue(css ? css.name(`date-rule-${k}`) : `--loom-date-rule-${k}`));
    const readClock = () => {
      if (!css) return;
      const year = field('year');
      if (!year) return; // not flushed yet
      try {
        const zdt = Temporal.ZonedDateTime.from({
          timeZone: timeZone.peek(), year, month: field('month'), day: field('monthday'),
          hour: field('hour24'), minute: field('minute'), second: field('second'),
        });
        now.value = zdt.epochMilliseconds;
      } catch { /* mid-swap between zones */ }
    };
    const mo = new MutationObserver(readClock);
    mo.observe(root, { attributes: true, attributeFilter: ['style'] });
    rx.effect('clockZone', timeZone, (tz) => {
      css?.dispose();
      css = createSignals({ prefix: 'loom', target: root }).use(date({ timeZone: tz, label: 'rule' }));
      zoneLabel.textContent = tz;
    });

    // ---- wiring: every handler is a signal write -----------------------------
    const ac = new AbortController();
    const on = (el: EventTarget, type: string, fn: (e: Event) => void) => el.addEventListener(type, fn, { signal: ac.signal });

    on(freqSel, 'change', () => { freq.value = freqSel.value as Freq; });
    on(intervalInput, 'input', () => { interval.value = Number(intervalInput.value) || 1; });
    on(ordinalSel, 'change', () => { ordinal.value = ordinalSel.value; });
    on(startInput, 'change', () => { startDate.value = startInput.value || todayISO(); });
    on(timeInput, 'change', () => {
      const [h, m] = (timeInput.value || '09:00').split(':').map(Number);
      void batch(async () => { hour.value = h; minute.value = m; });
    });
    on(zoneSel, 'change', () => { timeZone.value = zoneSel.value; });
    on(countInput, 'input', () => { count.value = Number(countInput.value) || 1; });
    on(untilInput, 'change', () => { until.value = untilInput.value || until.peek(); });
    for (const r of boundRadios) on(r, 'change', () => { boundMode.value = r.value as BoundMode; });
    on(intervalModeCb, 'change', () => { intervalMode.value = intervalModeCb.checked; });
    on(durationInput, 'input', () => { durationMinutes.value = Number(durationInput.value) || 1; });

    on(wdRow, 'click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-wd]');
      if (!btn) return;
      const code = btn.dataset.wd as Weekday;
      const cur = weekdays.peek();
      const next = cur.includes(code) ? cur.filter((c) => c !== code) : WD_CODES.filter((c) => c === code || cur.includes(c));
      void batch(async () => { weekdays.value = next; payday.value = false; });
    });
    on(monthsRow, 'click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-month]');
      if (!btn) return;
      const m = Number(btn.dataset.month);
      const cur = months.peek();
      months.value = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort((a, b) => a - b);
    });
    on(calEl, 'click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-date]');
      if (btn) startDate.value = btn.dataset.date!;
    });

    const sigs = { freq, interval, ordinal, startDate, hour, minute, timeZone, boundMode, count, until, intervalMode, durationMinutes } as Record<string, Signal<any>>;
    host.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
      on(btn, 'click', () => {
        const p = presetPatch(btn.dataset.preset!);
        void batch(async () => {
          for (const [k, v] of Object.entries(p)) {
            if (k === 'weekdays') weekdays.value = v as Weekday[];
            else if (k === 'months') months.value = v as number[];
            else if (k === 'payday') payday.value = v as boolean;
            else if (sigs[k]) sigs[k].value = v;
          }
        });
      });
    });

    // ---- .ics export (temporals/ics: toICS, fromICS, icsToSeq) -------------
    function handleIcsExport() {
      const r = rule.peek();
      icsStatusEl.hidden = false;
      if (!r || !r.ok) {
        icsStatusEl.textContent = 'No valid rule to export — fix the controls above first.';
        return;
      }
      try {
        const event: ICSEvent<ZDT> = {
          uid: `temporal-loom-${Date.now()}@opensource.johnhenry.me`,
          summary: 'Temporal Loom recurrence',
          start: r.rule.start,
          rrule: r.rule,
        };
        const ics = toICS([event]);
        // Round-trip validation, not just "did a download fire": parse the
        // generated text back with fromICS()+icsToSeq() and confirm it
        // reproduces the same occurrences, plus a structural sanity check.
        const parsedBack = fromICS(ics)[0] as ICSEvent<ZDT> | undefined;
        const back = parsedBack ? icsToSeq(parsedBack).take(50).toArray() : [];
        const forward = recur(r.rule).take(50).toArray();
        const sameCount = back.length === forward.length;
        const sameInstants = sameCount && back.every((z, i) => z.epochMilliseconds === forward[i].epochMilliseconds);
        const hasStructure = /BEGIN:VCALENDAR[\s\S]*BEGIN:VEVENT[\s\S]*DTSTART[:;][\s\S]*RRULE:[\s\S]*END:VEVENT[\s\S]*END:VCALENDAR/.test(ics)
          && /\r\n/.test(ics); // RFC 5545 requires CRLF line endings
        icsStatusEl.textContent = sameInstants && hasStructure
          ? `.ics downloaded — round-trip verified: fromICS() + icsToSeq() reproduce the same ${back.length} occurrence(s) parsed back out, and the text has a well-formed VCALENDAR/VEVENT/DTSTART/RRULE structure.`
          : `.ics downloaded, but the round-trip check found a mismatch (same instants: ${sameInstants}, structure ok: ${hasStructure}) — see console for the raw text.`;
        if (!sameInstants || !hasStructure) console.warn('[temporals/ics] round-trip check', { ics, back, forward });

        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'temporal-loom.ics';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (err) {
        icsStatusEl.textContent = `toICS() failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    on(host.querySelector('#t-ics')!, 'click', handleIcsExport);

    // ---- tabs ---------------------------------------------------------------
    function showTab(id: TabId) {
      ex.tab = id;
      for (const btn of tabButtons) btn.classList.toggle('active', btn.dataset.tab === id);
      (Object.keys(tabPanels) as TabId[]).forEach((k) => { tabPanels[k].hidden = k !== id; });
      persist();
    }
    on(tabsEl, 'click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
      if (btn) showTab(btn.dataset.tab as TabId);
    });
    showTab(ex.tab);

    // ---- cron ↔ RRULE tab (temporals/cron: cronToRule, ruleToCron, describeCron) ----
    let crSyncing = false;
    function crAnchor(): ZDT {
      const [y, m, d] = ex.cronDate.split('-').map(Number);
      const [hh, mm] = ex.cronTime.split(':').map(Number);
      return Temporal.ZonedDateTime.from({ timeZone: ex.cronTz, year: y, month: m, day: d, hour: hh, minute: mm, second: 0 });
    }
    function renderCronFromCron() {
      crErrorEl.hidden = true;
      try {
        const anchor = crAnchor();
        let desc = '';
        try { desc = describeCron(ex.cronExpr); } catch { /* best-effort */ }
        crDescribeEl.textContent = desc ? `describeCron(): ${desc}` : '';
        const derivedRule = cronToRule(ex.cronExpr, anchor);
        if (!derivedRule) {
          crSyncing = true; crRruleInput.value = ''; crSyncing = false;
          crRoundtripEl.textContent = '';
          crErrorEl.hidden = false;
          crErrorEl.textContent = 'cronToRule(): this cron expression can\'t be represented as an RRULE (e.g. multiple hours/minutes, nearest-weekday "W", or a day-of-month/day-of-week OR condition) — returned null.';
          return;
        }
        crSyncing = true;
        crRruleInput.value = formatRule(derivedRule);
        crSyncing = false;
        const backToCron = ruleToCron(derivedRule);
        crRoundtripEl.textContent = backToCron
          ? `round-trip cron → RRULE → cron = "${backToCron}"${backToCron === ex.cronExpr.trim() ? ' — identical ✓' : ' (normalized, same schedule)'}`
          : 'ruleToCron(): the derived rule can\'t be expressed back as cron.';
      } catch (err) {
        crErrorEl.hidden = false;
        crErrorEl.textContent = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        crSyncing = true; crRruleInput.value = ''; crSyncing = false;
      }
    }
    function renderCronFromRrule() {
      crErrorEl.hidden = true;
      try {
        const anchor = crAnchor();
        const parsed = ruleFromString(crRruleInput.value.trim(), anchor);
        const cronStr = ruleToCron(parsed);
        if (!cronStr) {
          crRoundtripEl.textContent = '';
          crErrorEl.hidden = false;
          crErrorEl.textContent = 'ruleToCron(): this RRULE can\'t be represented as cron (e.g. INTERVAL>1, BYSETPOS, sub-daily rates, or an ordinal other than "last") — returned null.';
          return;
        }
        crSyncing = true;
        crCronInput.value = cronStr;
        crSyncing = false;
        ex.cronExpr = cronStr;
        try { crDescribeEl.textContent = `describeCron(): ${describeCron(cronStr)}`; } catch { crDescribeEl.textContent = ''; }
        crRoundtripEl.textContent = `parsed via ruleFromString() → ruleToCron() = "${cronStr}"`;
        persist();
      } catch (err) {
        crErrorEl.hidden = false;
        crErrorEl.textContent = `${err instanceof Error ? `${err.name}: ${err.message}` : String(err)} (ruleFromString expects RFC 5545 RRULE syntax, e.g. FREQ=DAILY;BYHOUR=9)`;
      }
    }
    crDateInput.value = ex.cronDate;
    crTimeInput.value = ex.cronTime;
    crZoneSel.value = ex.cronTz;
    crCronInput.value = ex.cronExpr;
    on(crCronInput, 'input', () => { if (crSyncing) return; ex.cronExpr = crCronInput.value; renderCronFromCron(); persist(); });
    on(crRruleInput, 'input', () => { if (crSyncing) return; renderCronFromRrule(); });
    on(crDateInput, 'change', () => { ex.cronDate = crDateInput.value || ex.cronDate; renderCronFromCron(); persist(); });
    on(crTimeInput, 'change', () => { ex.cronTime = crTimeInput.value || ex.cronTime; renderCronFromCron(); persist(); });
    on(crZoneSel, 'change', () => { ex.cronTz = crZoneSel.value; renderCronFromCron(); persist(); });
    renderCronFromCron();

    // ---- meeting finder tab (temporals/business: meetingSlots, usFederalHolidays, WorkingHours) ----
    function buildParticipant(tz: string, start: string, end: string, holidays: boolean): Participant {
      const cal = holidays ? new BusinessCalendar({ holidays: usFederalHolidays() }) : new BusinessCalendar();
      const hours = new WorkingHours({ windows: [[start, end]], calendar: cal });
      return { hours, timeZone: tz };
    }
    function renderMeetings() {
      mtErrorEl.hidden = true;
      mtSlotsEl.innerHTML = '';
      mtHolidayNoteEl.textContent = '';
      try {
        const [y, m, d] = ex.meetRangeStart.split('-').map(Number);
        const rangeStart = Temporal.ZonedDateTime.from({ timeZone: 'UTC', year: y, month: m, day: d, hour: 0, minute: 0, second: 0 });
        const rangeEnd = rangeStart.add({ days: ex.meetRangeDays });
        const within = new Interval(rangeStart, rangeEnd);
        const participants: Participant[] = [
          buildParticipant(ex.meetTzA, ex.meetStartA, ex.meetEndA, ex.meetHolidays),
          buildParticipant(ex.meetTzB, ex.meetStartB, ex.meetEndB, ex.meetHolidays),
        ];
        const slots: MeetingSlot[] = meetingSlots({ participants, within, duration: { minutes: ex.meetDuration }, limit: 30 });

        if (ex.meetHolidays) {
          const hol = usFederalHolidays();
          const holsInRange: string[] = [];
          let cursor = rangeStart.toPlainDate();
          const endDate = rangeEnd.toPlainDate();
          while (Temporal.PlainDate.compare(cursor, endDate) < 0) {
            if (hol.has(cursor)) holsInRange.push(cursor.toString());
            cursor = cursor.add({ days: 1 });
          }
          if (holsInRange.length) {
            const slotDates = new Set(slots.map((s) => s.start.toPlainDate().toString()));
            const clean = holsInRange.every((h) => !slotDates.has(h));
            mtHolidayNoteEl.textContent = `US federal holiday(s) in range (usFederalHolidays()): ${holsInRange.join(', ')} — ${clean ? 'correctly excluded from every slot ✓' : 'WARNING: a slot landed on a holiday'}`;
          } else {
            mtHolidayNoteEl.textContent = 'No US federal holidays fall inside this search range — widen it to see one excluded.';
          }
        } else {
          mtHolidayNoteEl.textContent = 'Holiday exclusion is off — slots may land on federal holidays.';
        }

        if (!slots.length) {
          mtSlotsEl.innerHTML = `<div class="empty-note">No overlapping working-hours slot found — widen the range or hours.</div>`;
          return;
        }
        mtSlotsEl.innerHTML = slots.map((s, i) => {
          const localA = s.localStarts[0]?.toString().slice(0, 5) ?? '?';
          const localB = s.localStarts[1]?.toString().slice(0, 5) ?? '?';
          let rel = '';
          try { rel = fromNow(s.start); } catch { /* ignore */ }
          return `<div class="occ-row"><span class="occ-idx">${i + 1}</span><span class="occ-date">${fmt(s.start, s.start.timeZoneId)}</span><span class="occ-fromnow">${rel}</span><span class="occ-tag">A ${localA} · B ${localB}</span></div>`;
        }).join('');
      } catch (err) {
        mtErrorEl.hidden = false;
        mtErrorEl.textContent = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      }
    }
    mtTzASel.value = ex.meetTzA; mtTzBSel.value = ex.meetTzB;
    mtStartAInput.value = ex.meetStartA; mtEndAInput.value = ex.meetEndA;
    mtStartBInput.value = ex.meetStartB; mtEndBInput.value = ex.meetEndB;
    mtStartInput.value = ex.meetRangeStart;
    mtDaysInput.value = String(ex.meetRangeDays);
    mtDurInput.value = String(ex.meetDuration);
    mtHolidaysCb.checked = ex.meetHolidays;
    on(mtTzASel, 'change', () => { ex.meetTzA = mtTzASel.value; renderMeetings(); persist(); });
    on(mtTzBSel, 'change', () => { ex.meetTzB = mtTzBSel.value; renderMeetings(); persist(); });
    on(mtStartAInput, 'change', () => { ex.meetStartA = mtStartAInput.value || ex.meetStartA; renderMeetings(); persist(); });
    on(mtEndAInput, 'change', () => { ex.meetEndA = mtEndAInput.value || ex.meetEndA; renderMeetings(); persist(); });
    on(mtStartBInput, 'change', () => { ex.meetStartB = mtStartBInput.value || ex.meetStartB; renderMeetings(); persist(); });
    on(mtEndBInput, 'change', () => { ex.meetEndB = mtEndBInput.value || ex.meetEndB; renderMeetings(); persist(); });
    on(mtStartInput, 'change', () => { ex.meetRangeStart = mtStartInput.value || ex.meetRangeStart; renderMeetings(); persist(); });
    on(mtDaysInput, 'input', () => { ex.meetRangeDays = clampInt(mtDaysInput.value, 1, 60, ex.meetRangeDays); renderMeetings(); persist(); });
    on(mtDurInput, 'input', () => { ex.meetDuration = clampInt(mtDurInput.value, 5, 480, ex.meetDuration); renderMeetings(); persist(); });
    on(mtHolidaysCb, 'change', () => { ex.meetHolidays = mtHolidaysCb.checked; renderMeetings(); persist(); });
    renderMeetings();

    // ---- paste-an-RRULE tab (ruleFromString — RRULE syntax only, not NLP) ----
    function psAnchor(): ZDT {
      const [y, m, d] = ex.pasteDate.split('-').map(Number);
      const [hh, mm] = ex.pasteTime.split(':').map(Number);
      return Temporal.ZonedDateTime.from({ timeZone: ex.pasteTz, year: y, month: m, day: d, hour: hh, minute: mm, second: 0 });
    }
    function renderPaste() {
      psErrorEl.hidden = true;
      psListEl.innerHTML = '';
      psStatEl.textContent = '';
      const text = ex.pasteRule.trim();
      if (!text) {
        psListEl.innerHTML = `<div class="empty-note">Paste an RRULE string above.</div>`;
        return;
      }
      try {
        const anchor = psAnchor();
        const parsed = ruleFromString(text, anchor);
        const occ = recur(parsed).take(LIST_SAFETY_CAP).toArray();
        psStatEl.innerHTML = `ruleFromString() parsed to <code>${formatRule(parsed)}</code> — ${occ.length}${occ.length >= LIST_SAFETY_CAP ? '+' : ''} occurrence(s)`;
        if (!occ.length) {
          psListEl.innerHTML = `<div class="empty-note">Parsed fine, but this rule produces no occurrences.</div>`;
          return;
        }
        psListEl.innerHTML = occ.map((zdt, i) => {
          let rel = '';
          try { rel = fromNow(zdt); } catch { /* ignore */ }
          return `<div class="occ-row"><span class="occ-idx">${i + 1}</span><span class="occ-date">${fmt(zdt, zdt.timeZoneId)}</span><span class="occ-fromnow">${rel}</span></div>`;
        }).join('');
      } catch (err) {
        psErrorEl.hidden = false;
        psErrorEl.textContent = `Not a valid RRULE — ruleFromString() only parses RFC 5545 syntax (FREQ=...;BYDAY=...), not natural language like "every second Tuesday": ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    psDateInput.value = ex.pasteDate;
    psTimeInput.value = ex.pasteTime;
    psZoneSel.value = ex.pasteTz;
    psRruleInput.value = ex.pasteRule;
    on(psRruleInput, 'input', () => { ex.pasteRule = psRruleInput.value; renderPaste(); persist(); });
    on(psDateInput, 'change', () => { ex.pasteDate = psDateInput.value || ex.pasteDate; renderPaste(); persist(); });
    on(psTimeInput, 'change', () => { ex.pasteTime = psTimeInput.value || ex.pasteTime; renderPaste(); persist(); });
    on(psZoneSel, 'change', () => { ex.pasteTz = psZoneSel.value; renderPaste(); persist(); });
    renderPaste();

    const rxBtn = host.querySelector<HTMLButtonElement>('#t-rx')!;
    on(rxBtn, 'click', () => rxBtn.setAttribute('aria-pressed', String(rx.toggle())));
    let noteTimer = 0;
    on(host.querySelector('#t-copy')!, 'click', () => {
      void copyLink().then(() => {
        noteEl.textContent = 'link copied: it reloads into this exact rule';
        clearTimeout(noteTimer);
        noteTimer = window.setTimeout(() => { noteEl.innerHTML = 'every control is a <code>signal()</code>; the URL is a <code>computed()</code>'; }, 2200);
      });
    });

    return () => {
      ac.abort();
      mo.disconnect();
      clearTimeout(noteTimer);
      css?.dispose();
      css = null;
      rx.dispose();
    };
  },
};

export default playground;
