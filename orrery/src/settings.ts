import { DEFAULT_COMPANION_URL, getCompanionUrl, setCompanionUrl, probeCompanion, type Companion } from './companion';
import { playgrounds } from './registry';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** The #/settings page: where the optional Node companion lives, and what it hosts. */
export function renderSettings(app: HTMLElement): () => void {
  const main = document.createElement('main');
  main.className = 'planet settings';
  const companionRooms = playgrounds.filter((p) => p.companion);
  main.innerHTML = `
    <div class="room-head"><h1>Settings</h1><p>Where ORRERY looks for the optional Node companion. Every planet works without it; these planets get a real server when it answers.</p></div>
    <div class="panel">
      <strong>Companion server</strong>
      <p class="hint">Start it with <code>npm run node</code> in the repo (default <code>${DEFAULT_COMPANION_URL}</code>), or point this at one running elsewhere (an SSH tunnel, or a machine started with <code>ORRERY_HOST=0.0.0.0</code> and <code>ORRERY_ALLOWED_ORIGINS=&lt;this site's origin&gt;</code>). The origin only; no path.</p>
      <form id="cform" class="settings-form">
        <label class="field">Companion URL
          <input id="curl" type="url" placeholder="${DEFAULT_COMPANION_URL}" value="${esc(getCompanionUrl())}" spellcheck="false" />
        </label>
        <div class="settings-actions">
          <button class="btn primary" type="submit">Save &amp; test</button>
          <button class="btn" type="button" id="creset">Reset to default</button>
          <button class="btn" type="button" id="cprobe">Test again</button>
        </div>
      </form>
      <div id="cstatus" class="companion-banner"><span class="dot"></span>probing…</div>
      <div id="cdemos"></div>
    </div>
    <div class="panel">
      <strong>Planets that use the companion</strong>
      <ul class="settings-rooms">
        ${companionRooms.map((r) => `<li><a href="#/${r.id}">${esc(r.title)}</a> <span class="pkg">${esc(r.pkg)}</span> <span class="companion-plug unknown" data-companion="${r.id}">⚡</span></li>`).join('')}
      </ul>
      <p class="hint">On the home page these planets carry a ⚡ plug: green when the companion answers, dim when they're running their in-page stand-in.</p>
    </div>
    <div class="panel">
      <strong>Running it</strong>
      <pre class="code">git clone &lt;this repo&gt; &amp;&amp; cd orrery
npm install
npm run node        # companion on :7777 (+ :7778 leserve, :7779 servant)
npm run dev         # the site, http://localhost:5173</pre>
      <p class="hint">The companion is a plain Node process (<code>server/index.mjs</code>). Demos live in <code>server/demos/*.mjs</code>; one that fails to mount is reported below instead of taking the process down. Apple On-Device additionally needs macOS 26 on Apple Silicon, Node 26, and <code>npm i @johnhenry/apple-foundation-models</code>.</p>
    </div>`;
  app.appendChild(main);

  const input = main.querySelector<HTMLInputElement>('#curl')!;
  const status = main.querySelector<HTMLDivElement>('#cstatus')!;
  const demos = main.querySelector<HTMLDivElement>('#cdemos')!;
  const ac = new AbortController();

  const paint = (c: Companion | null) => {
    const url = getCompanionUrl();
    status.className = `companion-banner ${c ? 'live' : 'fallback'}`;
    status.innerHTML = c
      ? `<span class="dot"></span><b>Reachable</b> — ${esc(c.name)} at <code>${esc(c.base)}</code> · Node ${esc(c.node)} on ${esc(c.platform)}/${esc(c.arch)} · ${c.demos.filter((d) => d.ok).length}/${c.demos.length} demos mounted`
      : `<span class="dot"></span><b>Not reachable</b> at <code>${esc(url)}</code> — planets use their in-page stand-ins. Start it with <code>npm run node</code>, then "Test again".`;
    demos.innerHTML = c
      ? `<table class="settings-table"><thead><tr><th>demo</th><th>status</th><th>describe</th></tr></thead><tbody>${c.demos.map((d) =>
          `<tr class="${d.ok ? 'ok' : 'bad'}"><td><code>${esc(d.id)}</code></td><td>${d.ok ? '✓ mounted' : '✕ failed'}</td><td>${esc(d.describe || '')}${d.error ? `<div class="err">${esc(d.error.split('\n')[0])}</div>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '';
    main.querySelectorAll<HTMLElement>('.companion-plug').forEach((el) => {
      const ok = !!c?.demos.find((d) => d.id === el.dataset.companion && d.ok);
      el.classList.remove('unknown', 'live', 'off', 'bad');
      el.classList.add(!c ? 'off' : ok ? 'live' : 'bad');
    });
  };
  const probe = async () => {
    status.className = 'companion-banner'; status.innerHTML = '<span class="dot"></span>probing…';
    const c = await probeCompanion(true);
    if (!ac.signal.aborted) paint(c);
  };

  main.querySelector('#cform')!.addEventListener('submit', (e) => {
    e.preventDefault();
    let v = input.value.trim();
    if (v && !/^https?:\/\//.test(v)) v = 'http://' + v;
    try { if (v) v = new URL(v).origin; } catch { status.className = 'companion-banner fallback'; status.innerHTML = '<span class="dot"></span><b>That is not a valid URL.</b>'; return; }
    setCompanionUrl(v); input.value = getCompanionUrl(); void probe();
  }, { signal: ac.signal });
  main.querySelector('#creset')!.addEventListener('click', () => { setCompanionUrl(''); input.value = getCompanionUrl(); void probe(); }, { signal: ac.signal });
  main.querySelector('#cprobe')!.addEventListener('click', () => { void probe(); }, { signal: ac.signal });
  void probe();

  return () => { ac.abort(); main.remove(); };
}
