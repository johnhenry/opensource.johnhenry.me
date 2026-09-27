import type { Playground } from '../registry';
import { probeCompanion, hasDemo, companionBanner, type Companion } from '../companion';
import { readState, writeState, copyLink } from '../state';
import './afm.css';

// ---- deep-linkable state ---------------------------------------------------
const STATE_DEFAULTS = {
  instructions: 'You are a helpful, concise assistant.',
  prompt: 'Write a haiku about TypeScript.',
  temperature: 0.8,
  maxTokens: 200,
  sampling: 'greedy' as 'greedy' | 'random',
};
type State = typeof STATE_DEFAULTS;

// ---- the wrapper's real API surface, side by side with the Swift original -
// (from opensource.johnhenry.me/apple-foundation-models/ and API_REFERENCE.md)
const API_ROWS: { swift: string; ts: string }[] = [
  { swift: 'SystemLanguageModel.default', ts: 'SystemLanguageModel.default' },
  { swift: 'model.availability', ts: 'model.availability // getter' },
  { swift: 'model.isAvailable', ts: 'model.isAvailable // getter' },
  { swift: 'LanguageModelSession(model:)', ts: 'new LanguageModelSession(model)' },
  {
    swift: 'LanguageModelSession(model:guardrails:tools:instructions:)',
    ts: 'new LanguageModelSession(model, guardrails, tools, instructions)',
  },
  { swift: 'session.respond(to:)', ts: 'await session.respond(prompt)' },
  { swift: 'session.respond(to:options:)', ts: 'await session.respond(prompt, options)' },
  { swift: 'session.streamResponse(to:)', ts: 'session.streamResponse(prompt) // AsyncIterable<string>' },
  { swift: 'session.transcript', ts: 'session.transcript // getter' },
  { swift: 'session.isResponding', ts: 'session.isResponding // getter' },
  { swift: 'session.prewarm()', ts: 'await session.prewarm()' },
  { swift: 'session.prewarm(promptPrefix:)', ts: 'await session.prewarmWithPrefix(prefix)' },
  { swift: '(ARC deallocation)', ts: 'await session.close() // API deviation: explicit cleanup' },
];

const QUICKSTART_SNIPPET = `import { SystemLanguageModel, LanguageModelSession }
  from '@johnhenry/apple-foundation-models';

const model = SystemLanguageModel.default;
if (!model.isAvailable) {
  console.log('Model not available:', model.availability);
} else {
  const session = new LanguageModelSession(model);
  const response = await session.respond('Write a haiku about TypeScript');
  console.log(response.content);
}`;

const OPTIONS_SNIPPET = `import { LanguageModelSession, SamplingMode }
  from '@johnhenry/apple-foundation-models';

const session = new LanguageModelSession();
const options = {
  sampling: SamplingMode.Random,   // or SamplingMode.Greedy
  temperature: 0.8,                // 0.0-2.0
  maximumResponseTokens: 200,
};
const response = await session.respond('Write a creative poem', options);`;

const STREAM_SNIPPET = `const session = new LanguageModelSession(model, undefined, [], instructions);
for await (const chunk of session.streamResponse(prompt)) {
  process.stdout.write(chunk);
}
await session.close();`;

const AVAILABILITY_REASONS: Record<string, string> = {
  available: 'Available and ready to use.',
  deviceNotEligible: 'Device not eligible (not Apple Silicon, or too old).',
  appleIntelligenceNotEnabled: 'Apple Intelligence is not turned on in System Settings.',
  modelNotReady: "Model isn't ready yet (still downloading/initializing).",
  'wrong-os': 'Requires macOS 26 (Tahoe) or later — this machine reports an older macOS.',
  'wrong-arch': 'Requires Apple Silicon (arm64) — this machine is a different architecture.',
  'not-installed': "@johnhenry/apple-foundation-models isn't installed on the companion.",
  'import-error': 'The package failed to import — usually a broken/missing Swift build.',
  'runtime-error': 'The package imported, but calling into it threw at runtime.',
};

const playground: Playground = {
  id: 'afm',
  title: 'Apple On-Device',
  pkg: '@johnhenry/apple-foundation-models',
  hue: 0,
  blurb: "Apple's on-device language model from JavaScript, when the companion runs on macOS 26 Apple Silicon.",
  docs: 'https://opensource.johnhenry.me/apple-foundation-models/',
  async mount(host) {
    try {
      return await buildRoom(host);
    } catch (err) {
      host.innerHTML = `<pre class="code">${escapeHtml(String((err as Error)?.stack ?? err))}</pre>`;
    }
  },
};
export default playground;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

interface StatusPayload {
  available: boolean;
  reason: string | null;
  os: { platform: string; arch: string; release: string; node: string } | null;
  error: string | null;
  availability: string | null;
}

async function buildRoom(host: HTMLElement): Promise<() => void> {
  const state: State = readState(STATE_DEFAULTS);
  const syncUrl = () => writeState(state, STATE_DEFAULTS);

  host.innerHTML = `
    <div class="pg-afm">
      <div class="pg-topbar">
        <p class="pg-hint">
          A 1-to-1 TypeScript wrapper around Apple's on-device <code>FoundationModels</code> framework.
          Runs only via the optional companion, on macOS 26 (Tahoe)+, Apple Silicon, Apple Intelligence enabled.
        </p>
        <button class="btn pg-copy-link" type="button">🔗 copy link</button>
      </div>

      <div class="panel pg-status" data-el="status">
        <div class="pg-status-head">
          <h3>Status</h3>
          <button class="btn pg-recheck" type="button">↻ recheck</button>
        </div>
        <div class="pg-status-grid" data-el="status-grid">checking…</div>
      </div>

      <div class="grid-2 pg-main">
        <div class="panel pg-chat">
          <h3>Chat</h3>
          <div class="pg-banner-slot" data-el="banner"></div>

          <label class="field">
            instructions (system prompt) — <code>new Instructions(text)</code>
            <textarea class="code pg-instructions" rows="2">${escapeHtml(state.instructions)}</textarea>
          </label>

          <div class="pg-opts">
            <label class="field">
              temperature — <code>GenerationOptions.temperature</code>
              <input type="range" min="0" max="2" step="0.05" class="pg-temperature" value="${state.temperature}">
              <span class="stat pg-temperature-val">${state.temperature.toFixed(2)}</span>
            </label>
            <label class="field">
              max tokens — <code>maximumResponseTokens</code>
              <input type="number" min="1" max="4000" class="pg-max-tokens" value="${state.maxTokens}">
            </label>
            <label class="field">
              sampling — <code>SamplingMode</code>
              <select class="pg-sampling">
                <option value="greedy" ${state.sampling === 'greedy' ? 'selected' : ''}>Greedy (deterministic)</option>
                <option value="random" ${state.sampling === 'random' ? 'selected' : ''}>Random</option>
              </select>
            </label>
          </div>

          <label class="field">
            prompt — <code>session.respond(prompt, options)</code>
            <textarea class="code pg-prompt" rows="3">${escapeHtml(state.prompt)}</textarea>
          </label>

          <div class="pg-chat-actions">
            <button class="btn primary pg-send" type="button">respond ▸</button>
            <span class="stat pg-send-status"></span>
          </div>

          <div class="pg-output-wrap">
            <div class="pg-output-label">response</div>
            <pre class="code pg-output" data-el="output"></pre>
          </div>

          <details class="pg-transcript-details">
            <summary>session.transcript</summary>
            <pre class="code pg-transcript" data-el="transcript"></pre>
          </details>
        </div>

        <div class="panel pg-surface">
          <h3>API surface</h3>
          <p class="pg-hint">
            Every call this planet can make, mapped 1-to-1 from Swift.
            Full reference: <a href="https://opensource.johnhenry.me/apple-foundation-models/" target="_blank" rel="noreferrer">opensource.johnhenry.me/apple-foundation-models</a>.
          </p>
          <table class="pg-api-table">
            <thead><tr><th>Swift</th><th>JavaScript / TypeScript</th></tr></thead>
            <tbody data-el="api-rows"></tbody>
          </table>

          <details class="pg-snippet-block" open>
            <summary>quick start</summary>
            <pre class="code">${escapeHtml(QUICKSTART_SNIPPET)}</pre>
          </details>
          <details class="pg-snippet-block">
            <summary>generation options</summary>
            <pre class="code">${escapeHtml(OPTIONS_SNIPPET)}</pre>
          </details>
          <details class="pg-snippet-block">
            <summary>streaming</summary>
            <pre class="code">${escapeHtml(STREAM_SNIPPET)}</pre>
          </details>
          <p class="pg-hint">
            No structured/guided-output type exists in this wrapper (or in Apple's public
            <code>FoundationModels</code> surface it mirrors) — responses are plain strings.
          </p>
        </div>
      </div>
    </div>
  `;

  const statusGrid = host.querySelector<HTMLElement>('[data-el="status-grid"]')!;
  const recheckBtn = host.querySelector<HTMLButtonElement>('.pg-recheck')!;
  const bannerSlot = host.querySelector<HTMLElement>('[data-el="banner"]')!;
  const apiRows = host.querySelector<HTMLElement>('[data-el="api-rows"]')!;
  const instructionsEl = host.querySelector<HTMLTextAreaElement>('.pg-instructions')!;
  const temperatureEl = host.querySelector<HTMLInputElement>('.pg-temperature')!;
  const temperatureVal = host.querySelector<HTMLElement>('.pg-temperature-val')!;
  const maxTokensEl = host.querySelector<HTMLInputElement>('.pg-max-tokens')!;
  const samplingEl = host.querySelector<HTMLSelectElement>('.pg-sampling')!;
  const promptEl = host.querySelector<HTMLTextAreaElement>('.pg-prompt')!;
  const sendBtn = host.querySelector<HTMLButtonElement>('.pg-send')!;
  const sendStatus = host.querySelector<HTMLElement>('.pg-send-status')!;
  const outputEl = host.querySelector<HTMLElement>('[data-el="output"]')!;
  const transcriptEl = host.querySelector<HTMLElement>('[data-el="transcript"]')!;
  const copyLinkBtn = host.querySelector<HTMLButtonElement>('.pg-copy-link')!;

  apiRows.innerHTML = API_ROWS.map(
    (r) => `<tr><td><code>${escapeHtml(r.swift)}</code></td><td><code>${escapeHtml(r.ts)}</code></td></tr>`,
  ).join('');

  let companion: Companion | null = null;
  let status: StatusPayload | null = null;
  let ws: WebSocket | null = null;
  let disposed = false;

  function renderStatus() {
    const companionUp = !!companion;
    const demoUp = hasDemo(companion, 'afm');
    const modelUp = !!status?.available;
    const rows: string[] = [
      row('companion reachable', companionUp, companionUp ? 'localhost:7777 is answering' : 'not running — start it with `npm run node`'),
      row(
        'afm demo mounted',
        demoUp,
        demoUp ? 'server/demos/afm.mjs mounted without throwing' : companionUp ? 'companion is up, but the afm demo failed to mount' : '—',
      ),
      row(
        'framework available',
        modelUp,
        status
          ? modelUp
            ? 'SystemLanguageModel.default.isAvailable === true'
            : AVAILABILITY_REASONS[status.reason ?? ''] ?? status.reason ?? status.error ?? 'unavailable'
          : '—',
      ),
    ];
    if (status?.os) {
      rows.push(
        `<div class="pg-status-row"><span class="pg-status-dot neutral"></span><b>OS / arch</b><span class="pg-status-note">${escapeHtml(
          `${status.os.platform} ${status.os.release} · ${status.os.arch} · node ${status.os.node}`,
        )}</span></div>`,
      );
    }
    statusGrid.innerHTML = rows.join('');

    bannerSlot.innerHTML = '';
    bannerSlot.appendChild(
      companionBanner(
        companion,
        'afm',
        'this planet runs a labelled "API surface stand-in" that shows the exact request it would send and a canned response — never the real model.',
      ),
    );
    if (companionUp && demoUp && !modelUp && status) {
      const note = document.createElement('div');
      note.className = 'companion-banner fallback';
      note.innerHTML = `<span class="dot"></span><b>Companion is live, model is not</b> — ${escapeHtml(
        AVAILABILITY_REASONS[status.reason ?? ''] ?? status.reason ?? status.error ?? 'unavailable',
      )} Chat below still runs the stand-in.`;
      bannerSlot.appendChild(note);
    }
  }

  function row(label: string, ok: boolean, note: string) {
    return `<div class="pg-status-row"><span class="pg-status-dot ${ok ? 'ok' : 'off'}"></span><b>${escapeHtml(label)}</b><span class="pg-status-note">${escapeHtml(note)}</span></div>`;
  }

  async function refreshStatus() {
    statusGrid.textContent = 'checking…';
    companion = await probeCompanion(true);
    status = null;
    if (hasDemo(companion, 'afm') && companion) {
      try {
        const r = await fetch(`${companion.base}/afm/status`);
        status = await r.json();
      } catch (e) {
        status = { available: false, reason: 'fetch-failed', os: null, error: String((e as Error)?.message ?? e), availability: null };
      }
    }
    if (!disposed) renderStatus();
  }

  function isLiveChat(): boolean {
    return !!companion && hasDemo(companion, 'afm') && !!status?.available;
  }

  function currentRequestBody() {
    return {
      messages: [
        { role: 'system', content: instructionsEl.value },
        { role: 'user', content: promptEl.value },
      ],
      options: {
        temperature: Number(temperatureEl.value),
        maximumResponseTokens: Number(maxTokensEl.value) || undefined,
        sampling: samplingEl.value,
      },
    };
  }

  function appendTranscript(entry: unknown) {
    transcriptEl.textContent += (transcriptEl.textContent ? '\n' : '') + JSON.stringify(entry);
  }

  async function runStandIn() {
    const reqBody = currentRequestBody();
    outputEl.textContent = '';
    transcriptEl.textContent = '';
    sendStatus.textContent = 'API surface stand-in — not the real model';
    appendTranscript({ type: 'instructions', instructions: { text: reqBody.messages[0].content } });
    appendTranscript({ type: 'prompt', content: reqBody.messages[1].content });

    const header = `// API surface stand-in — the real model is not running.\n// This is the exact request the companion's POST /afm/chat would receive:\n${JSON.stringify(reqBody, null, 2)}\n\n// stand-in reply (echoes the shape LanguageModelSession.respond() would return):\n`;
    outputEl.textContent = header;

    const canned = `[stand-in] With instructions "${truncate(reqBody.messages[0].content, 60)}" and sampling=${reqBody.options.sampling} temperature=${reqBody.options.temperature}, the on-device model would answer "${truncate(
      reqBody.messages[1].content,
      60,
    )}" here. Run \`npm i @johnhenry/apple-foundation-models\` on a macOS 26 Apple Silicon Mac with Apple Intelligence on, then \`npm run node\`, to see a real streamed response.`;
    const words = canned.split(/(\s+)/);
    for (const w of words) {
      if (disposed) return;
      outputEl.textContent += w;
      outputEl.scrollTop = outputEl.scrollHeight;
      await sleep(18);
    }
    appendTranscript({ type: 'response', content: canned });
    sendStatus.textContent = 'stand-in done';
  }

  function truncate(s: string, n: number) {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function runLive() {
    if (!companion) return;
    outputEl.textContent = '';
    transcriptEl.textContent = '';
    sendStatus.textContent = 'connecting…';
    const reqBody = currentRequestBody();
    appendTranscript({ type: 'instructions', instructions: { text: reqBody.messages[0].content } });
    appendTranscript({ type: 'prompt', content: reqBody.messages[1].content });

    await new Promise<void>((resolve) => {
      try {
        ws = new WebSocket(`${companion!.wsBase}/afm/stream`);
      } catch (e) {
        outputEl.textContent = `WebSocket failed: ${String((e as Error)?.message ?? e)}`;
        sendStatus.textContent = 'error';
        resolve();
        return;
      }
      let full = '';
      ws.addEventListener('open', () => {
        sendStatus.textContent = 'streaming…';
        ws!.send(JSON.stringify(reqBody));
      });
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === 'chunk') {
            full += msg.text;
            outputEl.textContent = full;
            outputEl.scrollTop = outputEl.scrollHeight;
          } else if (msg.type === 'done') {
            appendTranscript({ type: 'response', content: full });
            sendStatus.textContent = 'done';
            ws?.close();
            resolve();
          } else if (msg.type === 'error') {
            outputEl.textContent += `\n[error] ${msg.error}${msg.detail ? `: ${msg.detail}` : ''}`;
            sendStatus.textContent = 'error';
            ws?.close();
            resolve();
          }
        } catch {
          /* ignore malformed frame */
        }
      });
      ws.addEventListener('error', () => {
        sendStatus.textContent = 'connection error';
        resolve();
      });
      ws.addEventListener('close', () => resolve());
    });
  }

  let sending = false;
  const onSend = async () => {
    if (sending) return;
    sending = true;
    sendBtn.disabled = true;
    try {
      state.instructions = instructionsEl.value;
      state.prompt = promptEl.value;
      state.temperature = Number(temperatureEl.value);
      state.maxTokens = Number(maxTokensEl.value) || STATE_DEFAULTS.maxTokens;
      state.sampling = samplingEl.value as State['sampling'];
      syncUrl();
      if (isLiveChat()) await runLive();
      else await runStandIn();
    } catch (e) {
      outputEl.textContent = `error: ${String((e as Error)?.message ?? e)}`;
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  };
  sendBtn.addEventListener('click', onSend);

  const onTemperatureInput = () => {
    temperatureVal.textContent = Number(temperatureEl.value).toFixed(2);
    state.temperature = Number(temperatureEl.value);
    syncUrl();
  };
  temperatureEl.addEventListener('input', onTemperatureInput);

  const onFieldChange = () => {
    state.instructions = instructionsEl.value;
    state.prompt = promptEl.value;
    state.maxTokens = Number(maxTokensEl.value) || STATE_DEFAULTS.maxTokens;
    state.sampling = samplingEl.value as State['sampling'];
    syncUrl();
  };
  instructionsEl.addEventListener('change', onFieldChange);
  promptEl.addEventListener('change', onFieldChange);
  maxTokensEl.addEventListener('change', onFieldChange);
  samplingEl.addEventListener('change', onFieldChange);

  const onRecheck = () => void refreshStatus();
  recheckBtn.addEventListener('click', onRecheck);

  const onCopyLink = async () => {
    syncUrl();
    await new Promise((r) => setTimeout(r, 200));
    await copyLink();
    copyLinkBtn.textContent = '✓ copied';
    setTimeout(() => {
      copyLinkBtn.textContent = '🔗 copy link';
    }, 1400);
  };
  copyLinkBtn.addEventListener('click', onCopyLink);

  await refreshStatus();

  return () => {
    disposed = true;
    ws?.close();
    sendBtn.removeEventListener('click', onSend);
    temperatureEl.removeEventListener('input', onTemperatureInput);
    instructionsEl.removeEventListener('change', onFieldChange);
    promptEl.removeEventListener('change', onFieldChange);
    maxTokensEl.removeEventListener('change', onFieldChange);
    samplingEl.removeEventListener('change', onFieldChange);
    recheckBtn.removeEventListener('click', onRecheck);
    copyLinkBtn.removeEventListener('click', onCopyLink);
  };
}
