import { createSignals, pointer, scroll, date } from '@johnhenry/css-signals';
import { getRoomTests, type RoomTests } from './bus';
import { probeCompanion, hasDemo } from './companion';
import { subscribeLiveCounts } from './signal-bus';
import type { PlaygroundEntry } from './registry';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * ok/bad/unknown test badge for a planet, sourced from getRoomTests()
 * (written by the Tester Console into localStorage). `data-badge-room` /
 * `data-badge-compact` let applyBuildTimeFallback() find and, if no live
 * result exists yet, replace these badges in place once dist/tests.json
 * (roadmap 4.5) has loaded.
 */
export function badgeFor(id: string, tests: Record<string, RoomTests>, compact: boolean): string {
  const t = tests[id];
  const attrs = `data-run-tests data-badge-room="${esc(id)}" data-badge-compact="${compact ? '1' : '0'}"`;
  if (!t) {
    const title = 'No test results yet · run in Tester Console';
    return compact
      ? `<span class="test-badge unknown" ${attrs} title="${esc(title)}" role="link" tabindex="0">?</span>`
      : `<span class="test-badge unknown" ${attrs} title="${esc(title)}" role="link" tabindex="0">Run the suite</span>`;
  }
  return `<span ${attrs} ${badgeSpanAttrs(t)}>${badgeLabel(t, compact, false)}</span>`;
}

/**
 * class/title for one known-result badge <span>, shared by the initial
 * (live) render above and applyBuildTimeFallback()'s in-place update below,
 * so "you ran this" and "from last build" badges look identical apart from
 * that one distinction.
 */
function badgeSpanAttrs(t: RoomTests, fromBuild = false): string {
  const cls = `test-badge ${t.fail === 0 ? 'ok' : 'bad'}${fromBuild ? ' from-build' : ''}`;
  const source = fromBuild ? 'from last build (headless CI run)' : 'you ran this · run in Tester Console';
  const title = `${t.pass} passed, ${t.fail} failed · ${source}`;
  return `class="${cls}" title="${esc(title)}" role="link" tabindex="0"`;
}
function badgeLabel(t: RoomTests, compact: boolean, fromBuild: boolean): string {
  const mark = t.fail === 0 ? '✓' : '✕';
  if (compact) return fromBuild ? `⟳${mark}` : mark;
  const base = `${mark} ${t.pass} pass · ${t.fail} fail`;
  return fromBuild ? `⟳ ${base} (last build)` : base;
}

/** Shape written by scripts/run-tests-headless.mjs (roadmap 4.5) into dist/tests.json. */
interface HeadlessTestSnapshot {
  rooms?: Record<string, { pass: number; fail: number; at: number }>;
}

/**
 * Fallback test badges sourced from a build-time dist/tests.json snapshot
 * (roadmap 4.5), for any planet that has no *live* (localStorage) result —
 * i.e. no real visitor has run the Tester Console themselves yet. Fetched at
 * most once per page load, and only if at least one planet actually needs
 * it. Fully silent on failure (missing file on a fresh dev server, network
 * error, bad JSON): the live-only badges already rendered are left as-is,
 * no console noise, no broken UI.
 */
export async function applyBuildTimeFallback(
  main: HTMLElement,
  entries: PlaygroundEntry[],
  liveTests: Record<string, RoomTests>,
  signal: AbortSignal,
): Promise<void> {
  const missing = entries.filter(e => !liveTests[e.id]);
  if (missing.length === 0) return;

  let snapshot: HeadlessTestSnapshot;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}tests.json`, { signal, cache: 'no-store' });
    if (!res.ok) return;
    snapshot = await res.json();
  } catch {
    return; // no dist/tests.json yet, or a network hiccup — just skip the fallback
  }
  const rooms = snapshot?.rooms;
  if (!rooms || signal.aborted) return;

  for (const e of missing) {
    const t = rooms[e.id];
    if (!t) continue;
    main.querySelectorAll<HTMLElement>(`[data-badge-room="${e.id}"]`).forEach(el => {
      const compact = el.dataset.badgeCompact === '1';
      el.className = `test-badge ${t.fail === 0 ? 'ok' : 'bad'} from-build`;
      el.title = `${t.pass} passed, ${t.fail} failed · from last build (headless CI run)`;
      el.textContent = badgeLabel(t, compact, true);
      // No home.css rule owns `.from-build` yet, so distinguish it inline
      // too (dashed border, slightly dimmer) rather than relying on the
      // text/tooltip difference alone.
      el.style.borderStyle = 'dashed';
      el.style.opacity = '0.82';
    });
  }
}

/**
 * "live in N tabs" chip (ROADMAP 4.6/4.11's Signal Bus): a placeholder,
 * hidden until subscribeLiveCounts() reports a nonzero count for this
 * planet id from wireRoomCardInteractions() below. Cross-tab presence is
 * tracked in src/signal-bus.ts, not here.
 */
export function liveFor(id: string): string {
  return `<span class="live-chip" data-live-room="${esc(id)}" hidden><span class="dot"></span><span class="n"></span></span>`;
}

/** Plug icon for planets that can use the optional Node companion. Coloured once the probe answers. */
export function plugFor(e: PlaygroundEntry, compact: boolean): string {
  if (!e.companion) return '';
  const title = 'Uses the optional Node companion (npm run node) · click for settings';
  return `<span class="companion-plug unknown" data-companion="${esc(e.id)}" data-open-settings title="${esc(title)}" role="link" tabindex="0">⚡${compact ? '' : ' companion'}</span>`;
}

/**
 * One planet card's markup — the "All planets" list, shared by the home
 * page's inline grid (pre-P0.8/sidebar move) and, since the "All planets"
 * grid moved into a header-toggleable sidebar (see planets-sidebar.ts), the
 * sidebar itself. Kept here (not planets-sidebar.ts) since it needs the
 * same badgeFor()/plugFor() this file already owns.
 */
export function roomCardHtml(e: PlaygroundEntry, roomTests: Record<string, RoomTests>): string {
  return `<a class="room-card" href="#/${e.id}" style="--h:${e.hue}"><h3>${esc(e.title)}</h3><p>${esc(e.blurb)}</p><span class="pkg">${esc(e.pkg)}</span>${plugFor(e, false)}${badgeFor(e.id, roomTests, false)}${liveFor(e.id)}</a>`;
}

/**
 * Wires the two interactive behaviours every room-card list needs, whether
 * it's the sidebar or (historically) the inline home-page grid:
 *  - test badges route to the Tester Console instead of the planet underneath them
 *  - companion plugs (⚡) get coloured once probeCompanion() answers
 * `container` must contain the `.room-card`s (their `[data-run-tests]`/
 * `[data-open-settings]`/`.companion-plug` descendants specifically).
 */
export function wireRoomCardInteractions(container: HTMLElement, signal: AbortSignal): void {
  const handler = (ev: Event) => {
    const t = ev.target as Element | null;
    const plug = t?.closest?.('[data-open-settings]');
    if (plug) { ev.preventDefault(); ev.stopPropagation(); location.hash = '#/settings'; return; }
    const badge = t?.closest?.('[data-run-tests]');
    if (!badge) return;
    ev.preventDefault();
    ev.stopPropagation();
    location.hash = '#/tester';
  };
  container.addEventListener('click', handler, { signal });
  container.addEventListener('keydown', ev => {
    if ((ev as KeyboardEvent).key !== 'Enter' && (ev as KeyboardEvent).key !== ' ') return;
    const t = ev.target as Element | null;
    if (t?.closest?.('[data-open-settings]')) { ev.preventDefault(); location.hash = '#/settings'; return; }
    const badge = t?.closest?.('[data-run-tests]');
    if (!badge) return;
    ev.preventDefault();
    location.hash = '#/tester';
  }, { signal });

  void probeCompanion().then((c) => {
    if (signal.aborted) return;
    container.querySelectorAll<HTMLElement>('.companion-plug').forEach((el) => {
      const id = el.dataset.companion || '';
      el.classList.remove('unknown', 'live', 'off', 'bad');
      if (!c) { el.classList.add('off'); el.title = 'Optional Node companion not running — this planet uses its in-page stand-in · click for settings'; }
      else if (hasDemo(c, id)) { el.classList.add('live'); el.title = `Live: Node companion at ${c.base} · click for settings`; }
      else { el.classList.add('bad'); el.title = 'Companion is up but this demo failed to mount · click for settings'; }
    });
  });

  // "live in N tabs" (ROADMAP 4.11, Signal Bus): cross-tab presence, kept
  // live for as long as this card list stays mounted.
  const offLive = subscribeLiveCounts((counts) => {
    if (signal.aborted) return;
    container.querySelectorAll<HTMLElement>('[data-live-room]').forEach((el) => {
      const id = el.dataset.liveRoom || '';
      const n = counts[id] ?? 0;
      el.hidden = n <= 0;
      if (n > 0) {
        el.querySelector('.n')!.textContent = `${n} live`;
        el.title = `${n} tab${n === 1 ? '' : 's'} currently have this planet open`;
      }
    });
  });
  signal.addEventListener('abort', () => offLive());
}

/** Deterministic PRNG so the starfield and orbital phases are stable across visits. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One layer of stars as a single element's box-shadow list: painted once, then only transformed. */
function starShadows(rand: () => number, count: number, size: number, alpha: number) {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(rand() * 2400 - 1200);
    const y = Math.round(rand() * 1600 - 800);
    const warm = rand();
    const hue = warm < 0.15 ? 30 : warm < 0.3 ? 210 : 230;
    const sat = warm < 0.3 ? 80 : 20;
    const a = (alpha * (0.45 + rand() * 0.55)).toFixed(2);
    out.push(`${x}px ${y}px 0 ${size}px hsl(${hue} ${sat}% 88% / ${a})`);
  }
  return out.join(',');
}

export function renderHome(app: HTMLElement, entries: PlaygroundEntry[]): () => void {
  const rand = mulberry32(0x0e11e5);
  const n = entries.length;
  const roomTests = getRoomTests();

  const planets = entries.map((e, i) => {
    // Kepler-ish: outer orbits are slower. Radii as a fraction of the stage half-width.
    const r = 0.25 + (i / Math.max(1, n - 1)) * 0.74;
    const dur = Math.round(38 * Math.pow(r / 0.25, 1.3));
    const phase = (i * 0.618034 + rand() * 0.2) % 1;
    const size = 11 + Math.round(((i * 7) % 5) * 2.4 + (i % 3) * 1.5);
    return `
      <div class="orbit" style="--r:${r.toFixed(4)};--dur:${dur}s;--phase:${phase.toFixed(4)};--h:${e.hue}">
        <div class="ring" aria-hidden="true"></div>
        <div class="arm">
          <a class="planet" href="#/${e.id}" data-i="${i}" style="--size:${size}px" aria-label="${esc(e.title)}: ${esc(e.pkg)}">
            <span class="body" aria-hidden="true"></span>
            <span class="label">${esc(e.title)}${plugFor(e, true)}${badgeFor(e.id, roomTests, true)}${liveFor(e.id)}</span>
          </a>
        </div>
      </div>`;
  }).join('');

  const main = document.createElement('main');
  // The orrery is a fixed dark starfield (see .home's hardcoded #03050d
  // background in home.css) regardless of the site-wide theme toggle. Circuit's
  // `.dark` class opts this subtree's tokens (--ink, --bg-panel, --line, ...)
  // out of the light theme so panel text stays readable in light mode instead
  // of resolving to light-theme's dark ink on this always-dark background.
  main.className = 'home dark';
  main.innerHTML = `
    <div class="sky" aria-hidden="true">
      <div class="nebula"></div>
      <div class="stars s1"></div>
      <div class="stars s2"></div>
      <div class="stars s3"></div>
    </div>

    <section class="hero">
      <p class="eyebrow"><span class="dot"></span>running live &middot; <span class="clock" title="Your local time, published as CSS variables by @johnhenry/css-signals date()"></span></p>
      <h1 class="sr-only">ORRERY</h1>
      <p class="lede">Fun and interesting demos centering around the <code>@johnhenry/*</code> ecosystem of libraries. Every planet represents a real npm package that you can prod, poke, break, and rewire.</p>
    </section>

    <section class="orrery-wrap" aria-label="The orrery: one planet per library">
      <div class="stage">
        <div class="plane">
          <div class="disc" aria-hidden="true"></div>
          ${planets}
          <div class="sun" aria-hidden="true">
            <div class="corona"></div>
            <div class="core"></div>
            <div class="wordmark"><b>@</b>johnhenry</div>
          </div>
        </div>
      </div>
      <aside class="info" aria-live="polite">
        <p class="kicker">planet</p>
        <h2 class="title">Choose a world</h2>
        <p class="blurb">Hover or focus a planet to inspect its library. Click to enter the planet. The sky tilts with your pointer and is tinted by your local time of day, all through CSS custom properties from <code>@johnhenry/css-signals</code>.</p>
        <p class="pkg">@johnhenry/*</p>
        <p class="enter" hidden><a href="#/">enter planet &rarr;</a></p>
      </aside>
    </section>

    <section class="rooms-wrap" aria-label="All planets">
      <p class="rooms-title">All planets</p>
      <div class="rooms">
        ${entries.map(e => roomCardHtml(e, roomTests)).join('')}
      </div>
    </section>`;

  // Starfield: three depths, parallaxed by the pointer purely in CSS.
  const layers: [string, number, number, number][] = [['.s1', 260, 0, 0.55], ['.s2', 120, 0.5, 0.8], ['.s3', 45, 1, 1]];
  for (const [sel, count, size, alpha] of layers) {
    (main.querySelector(sel) as HTMLElement).style.boxShadow = starShadows(rand, count, size, alpha);
  }

  app.appendChild(main);

  // Live browser state as typed CSS custom properties: --sky-pointer-*, --sky-scroll-*, --sky-date-*.
  const signals = createSignals({ prefix: 'sky' }).use(pointer(), scroll(), date());

  // Side panel: the only JS in the interaction loop is swapping text on hover/focus.
  const ac = new AbortController();

  // Orbiting labels cluster and overlap near the sun, and can spill past the
  // stage's right edge (issue #18, home P2 — orbit labels collide). Orbits
  // move slowly (30-90s periods), so a cheap poll is enough: no need for a
  // per-frame rAF loop. Overlapping labels get nudged apart vertically
  // (--label-dy, composed with the CSS `translate` centering); any label
  // whose right edge would exit .stage gets pulled back in with `transform`.
  const stageEl = main.querySelector('.stage') as HTMLElement;
  function resolveLabelLayout() {
    const labels = Array.from(main.querySelectorAll<HTMLElement>('.planet .label'));
    if (!labels.length) return;
    const stageBox = stageEl.getBoundingClientRect();
    // One DOM read per label (already reflects last tick's --label-dy), then
    // several rounds of pure-number relaxation — no DOM in the loop — so a
    // dense cluster near the sun fully untangles within a single tick
    // instead of creeping apart 2px/tick over several seconds.
    const rects = labels.map((l) => l.getBoundingClientRect());
    const dy = new Array(labels.length).fill(0);
    for (let iter = 0; iter < 16; iter++) {
      let moved = false;
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const a = rects[i], b = rects[j];
          const aTop = a.top + dy[i], aBottom = a.bottom + dy[i];
          const bTop = b.top + dy[j], bBottom = b.bottom + dy[j];
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);
          if (overlapX <= 0 || overlapY <= 0) continue;
          const push = overlapY / 2 + 1.5;
          if (aTop <= bTop) { dy[i] -= push; dy[j] += push; } else { dy[i] += push; dy[j] -= push; }
          moved = true;
        }
      }
      if (!moved) break;
    }
    labels.forEach((l, i) => {
      l.style.setProperty('--label-dy', `${Math.max(-90, Math.min(90, dy[i]))}px`);
      const overshoot = rects[i].right - stageBox.right;
      l.style.transform = overshoot > 0 ? `translateX(${-(overshoot + 4)}px)` : '';
    });
  }
  resolveLabelLayout();
  const labelLayoutId = window.setInterval(resolveLabelLayout, 400);

  // Build-time test badges (roadmap 4.5): for any planet with no live
  // (localStorage) result yet, fetch dist/tests.json once and patch its
  // badges in place. No-ops quietly if the file doesn't exist (a fresh dev
  // server with no headless run performed yet) or the fetch otherwise fails.
  void applyBuildTimeFallback(main, entries, roomTests, ac.signal);

  const info = main.querySelector('.info') as HTMLElement;
  const title = info.querySelector('.title')!;
  const blurb = info.querySelector('.blurb')!;
  const pkg = info.querySelector('.pkg')!;
  const kicker = info.querySelector('.kicker')!;
  const enter = info.querySelector('.enter') as HTMLElement;
  const enterLink = enter.querySelector('a')!;
  let active: HTMLElement | null = null;

  // Leaving a planet un-highlights it but keeps its card in the panel, so "enter planet" stays reachable.
  const release = () => { active?.classList.remove('active'); active = null; main.classList.remove('inspecting'); };
  const show = (el: HTMLElement | null) => {
    if (el === active) return;
    if (!el) return release();
    active?.classList.remove('active');
    active = el;
    main.classList.add('inspecting');
    el.classList.add('active');
    const e = entries[Number(el.dataset.i)];
    info.style.setProperty('--h', String(e.hue));
    kicker.textContent = `orbit ${String(Number(el.dataset.i) + 1).padStart(2, '0')} / ${n}`;
    title.textContent = e.title;
    blurb.textContent = e.blurb;
    pkg.textContent = e.pkg;
    enterLink.href = `#/${e.id}`;
    enter.hidden = false;
  };

  const plane = main.querySelector('.plane') as HTMLElement;
  const planetOf = (t: EventTarget | null) => (t as Element | null)?.closest?.('.planet') as HTMLElement | null;
  plane.addEventListener('pointerover', ev => { const p = planetOf(ev.target); if (p) show(p); }, { signal: ac.signal });
  plane.addEventListener('pointerout', ev => {
    const p = planetOf(ev.target);
    if (p && !p.contains(ev.relatedTarget as Node | null)) release();
  }, { signal: ac.signal });
  plane.addEventListener('focusin', ev => show(planetOf(ev.target)), { signal: ac.signal });
  plane.addEventListener('focusout', ev => { if (!plane.contains(ev.relatedTarget as Node | null)) release(); }, { signal: ac.signal });

  // Test badges + companion plugs on the orbit-diagram planet labels: same
  // click/keydown routing and companion-probe colouring the sidebar's room
  // cards use, shared via wireRoomCardInteractions().
  wireRoomCardInteractions(main, ac.signal);

  return () => {
    ac.abort();
    window.clearInterval(labelLayoutId);
    signals.dispose();
    main.remove();
  };
}
