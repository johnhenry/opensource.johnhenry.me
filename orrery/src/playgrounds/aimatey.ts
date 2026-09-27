import type { Playground } from '../registry';
import { readState, writeState, copyLink } from '../state';
import { handoffButton } from '../bus';
import { probeCompanion, hasDemo, type Companion } from '../companion';
import { createBridge, createRouter, type Bridge, type Router } from '@johnhenry/aimatey-core';
import {
  OpenAIFrontendAdapter, AnthropicFrontendAdapter, createGenericFrontend,
  type OpenAIRequest, type OpenAIResponse, type OpenAIStreamChunk,
  type AnthropicRequest, type AnthropicResponse, type AnthropicStreamEvent,
} from '@johnhenry/aimatey-frontend';
import {
  createLoggingMiddleware, createRetryMiddleware, createCachingMiddleware, InMemoryCacheStorage,
  createCostTrackingMiddleware, type CostCalculation,
} from '@johnhenry/aimatey-middleware';
import type {
  BackendAdapter, AdapterMetadata, FrontendAdapter,
  IRChatRequest, IRChatResponse, IRChatStream, IRStreamChunk, IRMessage, Middleware,
} from '@johnhenry/aimatey-types';
import './aimatey.css';

/* ============================================================== helpers */

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}
const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const errText = (e: unknown): string => {
  if (e instanceof Error) {
    const extra = (e as { code?: string }).code ? ` [${(e as { code?: string }).code}]` : '';
    return `${e.name}${extra}: ${e.message}`;
  }
  return String(e);
};
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const nowId = () => `req_${Math.random().toString(36).slice(2, 10)}`;
function hashStr(s: string): number {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(x);
}
function estimateTokens(s: string): number {
  return Math.max(1, Math.round(s.trim().split(/\s+/).filter(Boolean).length * 1.3));
}
function lastUserText(req: IRChatRequest): string {
  const m = [...req.messages].reverse().find(mm => mm.role === 'user');
  if (!m) return '';
  return typeof m.content === 'string' ? m.content : m.content.map(c => (c.type === 'text' ? c.text : `[${c.type}]`)).join(' ');
}

/* ============================================================== 3 mock backends */

function metaFor(name: string, provider: string): AdapterMetadata {
  return {
    name,
    version: '0.1.0',
    provider,
    capabilities: {
      streaming: true,
      multiModal: false,
      tools: false,
      systemMessageStrategy: 'in-messages',
      supportsMultipleSystemMessages: true,
      supportsTemperature: true,
    },
  };
}

function makeResponse(request: IRChatRequest, text: string, backend: string): IRChatResponse {
  const promptTokens = estimateTokens(lastUserText(request));
  const completionTokens = estimateTokens(text);
  return {
    message: { role: 'assistant', content: text },
    finishReason: 'stop',
    usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    metadata: {
      requestId: request.metadata.requestId,
      timestamp: Date.now(),
      provenance: { backend },
    },
  };
}

const HAIKU_BANK: Array<[string, string]> = [
  ['Silent code awakes', 'dawn compiles the sleeping mind'],
  ['Packets drift like snow', 'servers hum in winter light'],
  ['Tokens fall like rain', 'meaning pools in the buffer'],
  ['Wires hold their breath now', 'a single thought travels far'],
  ['Cursor blinks and waits', 'the answer forms in silence'],
  ['Cache remembers all', 'yet forgets by morning light'],
];
function haikuReply(userText: string): string {
  const words = userText.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  const topic = words ? words.slice(0, 28) : 'an empty prompt';
  const [l1, l3] = HAIKU_BANK[hashStr(userText || 'x') % HAIKU_BANK.length];
  return `${l1}\n${topic}, it seems, drifts through the wire\n${l3}`;
}

/** Fixed-latency, deterministic reply. `execute()`/`executeStream()` share this. */
type Replier = (userText: string) => Promise<string> | string;

class MockBackend implements BackendAdapter<IRChatRequest, IRChatResponse> {
  readonly metadata: AdapterMetadata;
  constructor(name: string, provider: string, private reply: Replier, private streamWordDelayMs = 55) {
    this.metadata = metaFor(name, provider);
  }
  /** Debug-only: this mock speaks IR natively, so both conversions are identity. */
  fromIR(request: IRChatRequest): IRChatRequest { return request; }
  toIR(response: IRChatResponse): IRChatResponse { return response; }

  async execute(request: IRChatRequest, signal?: AbortSignal): Promise<IRChatResponse> {
    const text = await this.reply(lastUserText(request));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return makeResponse(request, text, this.metadata.name);
  }

  async *executeStream(request: IRChatRequest, signal?: AbortSignal): IRChatStream {
    // Computed fully before the first yield: a rejection here happens before any
    // committing chunk is delivered, which is exactly the window the Router's
    // streaming fallback can still exploit to fail over invisibly.
    const text = await this.reply(lastUserText(request));
    let seq = 0;
    yield { type: 'start', sequence: seq++, metadata: { requestId: request.metadata.requestId, timestamp: Date.now(), provenance: { backend: this.metadata.name } } };
    const words = text.split(/(\s+)/);
    let acc = '';
    for (const w of words) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (w.trim()) await delay(this.streamWordDelayMs + Math.random() * 35);
      acc += w;
      yield { type: 'content', sequence: seq++, delta: w, accumulated: acc };
    }
    const promptTokens = estimateTokens(lastUserText(request));
    const completionTokens = estimateTokens(text);
    yield {
      type: 'done', sequence: seq++, finishReason: 'stop',
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      message: { role: 'assistant', content: text },
    };
  }
}

const haikuBackend = new MockBackend('haiku-bot', 'mock-haiku', (t) => haikuReply(t), 70);
const echoBackend = new MockBackend('echo-uppercase', 'mock-echo', (t) => (t || '…').toUpperCase(), 30);
const flakyBackend = new MockBackend(
  'slow-flaky',
  'mock-flaky',
  async (t) => {
    await delay(700 + Math.random() * 900);
    if (Math.random() < 0.25) throw new Error('slow-flaky: simulated upstream outage (503)');
    return `[slow-flaky, after a long think] acknowledged: "${t}"`;
  },
  40,
);

/* ============================================================== 4th backend: Apple on-device (real, via companion) */

const APPLE_REASON_TEXT: Record<string, string> = {
  'no-companion': 'Node companion is not running — start it with `npm run node`.',
  'no-demo': 'companion is up, but the afm demo failed to mount.',
  deviceNotEligible: 'device not eligible (not Apple Silicon, or too old).',
  appleIntelligenceNotEnabled: 'Apple Intelligence is not turned on in System Settings.',
  modelNotReady: "model isn't ready yet (still downloading/initializing).",
  'wrong-os': 'requires macOS 26 (Tahoe) or later.',
  'wrong-arch': 'requires Apple Silicon (arm64).',
  'not-installed': "@johnhenry/apple-foundation-models isn't installed on the companion.",
  'import-error': 'the package failed to import on the companion.',
  'runtime-error': 'calling into the framework threw at runtime.',
};

function flattenIRContent(content: IRMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.map(c => (c.type === 'text' ? c.text : `[${c.type}]`)).join(' ');
}

interface AfmWireRequest {
  messages: Array<{ role: string; content: string }>;
  options: { temperature?: number; maximumResponseTokens?: number };
}
interface AfmWireResponse { content: string; transcriptEntries?: unknown }

/**
 * Real 4th backend: talks to the optional Node companion's `server/demos/afm.mjs`,
 * which wraps Apple's on-device FoundationModels framework. Implements the exact
 * same BackendAdapter interface the three in-page mocks do — no special-casing
 * anywhere else in the Bridge/Router.
 */
class AppleOnDeviceBackend implements BackendAdapter<AfmWireRequest, AfmWireResponse> {
  readonly metadata: AdapterMetadata;
  constructor(private base: string, private wsBase: string) {
    this.metadata = {
      name: 'apple-foundation-model',
      version: '0.1.0',
      provider: 'apple-on-device',
      capabilities: {
        streaming: true,
        multiModal: false,
        systemMessageStrategy: 'in-messages',
        supportsMultipleSystemMessages: false,
        supportsTemperature: true,
      },
    };
  }

  fromIR(request: IRChatRequest): AfmWireRequest {
    return {
      messages: request.messages.map(m => ({ role: m.role, content: flattenIRContent(m.content) })),
      options: {
        temperature: request.parameters?.temperature,
        maximumResponseTokens: request.parameters?.maxTokens,
      },
    };
  }

  toIR(response: AfmWireResponse, originalRequest: IRChatRequest, latencyMs: number): IRChatResponse {
    const promptTokens = estimateTokens(lastUserText(originalRequest));
    const completionTokens = estimateTokens(response.content ?? '');
    return {
      message: { role: 'assistant', content: response.content ?? '' },
      finishReason: 'stop',
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      metadata: {
        requestId: originalRequest.metadata.requestId,
        timestamp: Date.now(),
        provenance: { backend: this.metadata.name },
      },
      raw: { latencyMs },
    };
  }

  async execute(request: IRChatRequest, signal?: AbortSignal): Promise<IRChatResponse> {
    const body = this.fromIR(request);
    const start = Date.now();
    const res = await fetch(`${this.base}/afm/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const json: (AfmWireResponse & { error?: string; detail?: string }) | Record<string, never> = await res.json().catch(() => ({}));
    if (!res.ok || 'error' in json) {
      const j = json as { error?: string; detail?: string };
      throw new Error(j.error ? `${j.error}${j.detail ? `: ${j.detail}` : ''}` : `afm/chat responded ${res.status}`);
    }
    return this.toIR(json as AfmWireResponse, request, Date.now() - start);
  }

  async *executeStream(request: IRChatRequest, signal?: AbortSignal): IRChatStream {
    const body = this.fromIR(request);
    let seq = 0;
    yield {
      type: 'start', sequence: seq++,
      metadata: { requestId: request.metadata.requestId, timestamp: Date.now(), provenance: { backend: this.metadata.name } },
    };

    const chunks: IRStreamChunk[] = [];
    let waiter: (() => void) | null = null;
    let closed = false;
    let failure: Error | null = null;
    let acc = '';

    const wake = () => { if (waiter) { const w = waiter; waiter = null; w(); } };
    const push = (c: IRStreamChunk) => { chunks.push(c); wake(); };

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${this.wsBase}/afm/stream`);
    } catch (e) {
      throw new Error(`afm/stream WebSocket failed: ${errText(e)}`);
    }

    ws.addEventListener('open', () => ws.send(JSON.stringify(body)));
    ws.addEventListener('message', (ev) => {
      let msg: { type?: string; text?: string; error?: string; detail?: string };
      try { msg = JSON.parse(String((ev as MessageEvent).data)); } catch { return; }
      if (msg.type === 'chunk') {
        acc += msg.text ?? '';
        push({ type: 'content', sequence: seq++, delta: msg.text ?? '', accumulated: acc });
      } else if (msg.type === 'done') {
        const promptTokens = estimateTokens(lastUserText(request));
        const completionTokens = estimateTokens(acc);
        push({
          type: 'done', sequence: seq++, finishReason: 'stop',
          usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
          message: { role: 'assistant', content: acc },
        });
        closed = true;
        ws.close();
      } else if (msg.type === 'error') {
        failure = new Error(msg.error ? `${msg.error}${msg.detail ? `: ${msg.detail}` : ''}` : 'afm/stream error');
        closed = true;
        ws.close();
      }
    });
    ws.addEventListener('error', () => { failure = failure ?? new Error('afm/stream WebSocket error'); closed = true; wake(); });
    ws.addEventListener('close', () => { closed = true; wake(); });

    const onAbort = () => { try { ws.close(); } catch { /* already closed */ } };
    signal?.addEventListener('abort', onAbort);

    try {
      for (;;) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (chunks.length) { yield chunks.shift()!; continue; }
        if (closed) { if (failure) throw failure; return; }
        await new Promise<void>((resolve) => { waiter = resolve; });
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

/** Probe the companion for a live, real Apple on-device backend. Never throws. */
async function detectAppleBackend(): Promise<{ backend: AppleOnDeviceBackend | null; reason: string | null }> {
  try {
    const companion: Companion | null = await probeCompanion();
    if (!companion) return { backend: null, reason: APPLE_REASON_TEXT['no-companion'] };
    if (!hasDemo(companion, 'afm')) return { backend: null, reason: APPLE_REASON_TEXT['no-demo'] };
    const r = await fetch(`${companion.base}/afm/status`);
    const status: { available?: boolean; reason?: string | null; error?: string | null } = await r.json();
    if (status?.available) return { backend: new AppleOnDeviceBackend(companion.base, companion.wsBase), reason: null };
    const reasonKey = status?.reason ?? '';
    return { backend: null, reason: APPLE_REASON_TEXT[reasonKey] ?? status?.reason ?? status?.error ?? 'unavailable' };
  } catch (e) {
    return { backend: null, reason: errText(e) };
  }
}

/* ============================================================== custom middleware */

/** The one hand-written middleware in this planet — shows the real (context, next) shape. */
function createSystemPromptMiddleware(prompt: string): Middleware {
  return async (context, next) => {
    const text = prompt.trim();
    if (text && !context.request.messages.some(m => m.role === 'system')) {
      context.request = { ...context.request, messages: [{ role: 'system', content: text }, ...context.request.messages] };
    }
    return next();
  };
}

/* ============================================================== state & wiring */

type FormatId = 'openai' | 'anthropic' | 'generic';
type RoutingId = 'explicit' | 'round-robin' | 'model-based';

const BASE_MODEL_MAP: Record<string, string> = { 'haiku-mini': 'haiku-bot', 'echo-fast': 'echo-uppercase', 'flaky-test': 'slow-flaky' };
const BASE_MODEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'haiku-mini', label: 'haiku-mini → haiku-bot' },
  { id: 'echo-fast', label: 'echo-fast → echo-uppercase' },
  { id: 'flaky-test', label: 'flaky-test → slow-flaky' },
];
/** The routing-key model id / mapped backend name for the real Apple backend. */
const APPLE_MODEL_ID = 'apple-on-device';
const APPLE_BACKEND_NAME = 'apple-foundation-model';

const DEFAULTS = {
  format: 'openai' as FormatId,
  model: 'flaky-test',
  routing: 'explicit' as RoutingId,
  stream: true,
  mwSystem: true,
  mwLogging: true,
  mwRetry: true,
  mwCaching: true,
  mwCost: true,
  appleEnabled: true,
  prompt: 'You are the Aimatey Router demo. Reply briefly, and stay true to whichever backend answers.',
};
type State = typeof DEFAULTS;

interface ChatTurn { role: 'user' | 'assistant'; text: string; isError?: boolean }

interface MwDef { key: keyof State; name: string; desc: string }
const MW_DEFS: MwDef[] = [
  { key: 'mwSystem', name: 'system-prompt (custom)', desc: 'prepends a system message — the one hand-written middleware here' },
  { key: 'mwLogging', name: 'logging', desc: 'createLoggingMiddleware — request/response/error log' },
  { key: 'mwRetry', name: 'retry', desc: 'createRetryMiddleware — retries the whole chain on failure' },
  { key: 'mwCaching', name: 'caching', desc: 'createCachingMiddleware — short-circuits on a repeat prompt' },
  { key: 'mwCost', name: 'cost-tracking', desc: 'createCostTrackingMiddleware — token counting / $ estimate' },
];

async function mountRoom(host: HTMLElement): Promise<() => void> {
  const state: State = readState(DEFAULTS);
  const cleanups: Array<() => void> = [];
  const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K, fn: (e: Event) => void) => {
    el.addEventListener(type, fn);
    cleanups.push(() => el.removeEventListener(type, fn));
  };

  // Probed once at mount: a real 4th backend when the companion's afm demo says the
  // on-device model is available, or the reason it isn't. The three mocks below never
  // depend on this — they work identically either way.
  const { backend: appleBackend, reason: appleReason } = await detectAppleBackend();
  const appleAvailable = !!appleBackend;
  const modelOptionsForUi = appleAvailable
    ? [...BASE_MODEL_OPTIONS, { id: APPLE_MODEL_ID, label: `${APPLE_MODEL_ID} → ${APPLE_BACKEND_NAME}` }]
    : BASE_MODEL_OPTIONS;

  host.innerHTML = `
    <div class="pg-aimatey">
      <div class="panel">
        <h3>What's happening</h3>
        <p class="am-sub">
          A real <code>@johnhenry/aimatey-core</code> <b>Bridge</b> + <b>Router</b> sit behind this chat.
          Three in-page mock backends (<code>haiku-bot</code>, <code>echo-uppercase</code>, <code>slow-flaky</code> — 25% failure
          rate) implement the real <code>BackendAdapter</code> interface; no network calls, no API keys.
          ${appleAvailable
            ? `A real <b>fourth backend</b>, <code>${APPLE_BACKEND_NAME}</code>, is also registered — it talks to Apple's
               on-device model through the Node companion (<code>POST /afm/chat</code>, <code>WS /afm/stream</code>), no mocking.`
            : `A real fourth backend for Apple's on-device model can join too — see the dimmed chip below for why it isn't
               registered right now.`}
          Pick a wire format below and the real <code>OpenAIFrontendAdapter</code> / <code>AnthropicFrontendAdapter</code> /
          generic IR adapter converts your message to the Intermediate Representation and back — shown side by side.
          Toggle real middleware from <code>@johnhenry/aimatey-middleware</code> and watch the request travel through
          the chain in the flow diagram.
        </p>
        <div class="am-controls">
          <label class="field">Frontend format
            <select data-k="format">
              <option value="openai">OpenAI-style</option>
              <option value="anthropic">Anthropic-style</option>
              <option value="generic">Generic (raw IR)</option>
            </select>
          </label>
          <label class="field">Model (routing key)
            <select data-k="model">${modelOptionsForUi.map(o => `<option value="${o.id}">${esc(o.label)}</option>`).join('')}</select>
          </label>
          <label class="field">Routing strategy
            <select data-k="routing">
              <option value="explicit">Fallback chain (primary → backups)</option>
              <option value="round-robin">Round-robin</option>
              <option value="model-based">By model name</option>
            </select>
          </label>
        </div>
      </div>

      <div class="am-row">
        <div class="panel am-chat">
          <h3>Chat</h3>
          <div class="am-transcript" data-el="transcript"></div>
          <div class="am-inputrow">
            <input type="text" data-el="input" placeholder="Say something…" />
            <button class="btn primary" data-el="send">Send</button>
          </div>
          <div class="am-toggles">
            <label><input type="checkbox" data-k="stream" /> stream tokens</label>
            <button class="btn" data-el="copy" type="button">copy link</button>
            <span data-el="laya-slot"></span>
          </div>
        </div>

        <div class="panel">
          <h3>Wire format ↔ Intermediate Representation</h3>
          <p class="am-sub">Built with the real <code>frontend.toIR()</code> — shown before and after the middleware chain runs.</p>
          <div class="am-wire-grid">
            <div>
              <div class="am-wire-label">Raw request (wire format)</div>
              <pre class="code" data-el="wire-raw">—</pre>
            </div>
            <div>
              <div class="am-wire-label">IR (frontend.toIR)</div>
              <pre class="code" data-el="wire-ir0">—</pre>
            </div>
            <div>
              <div class="am-wire-label"><span>IR sent to backend</span><span data-el="wire-ir1-note"></span></div>
              <pre class="code" data-el="wire-ir1">—</pre>
            </div>
            <div>
              <div class="am-wire-label">Response (wire format, frontend.fromIR)</div>
              <pre class="code" data-el="wire-resp">—</pre>
            </div>
          </div>
        </div>
      </div>

      <div class="am-row">
        <div class="panel">
          <h3>Middleware chain</h3>
          <p class="am-sub">Registration order = onion order. First registered runs outermost.</p>
          <div class="am-mw-list" data-el="mwlist"></div>
        </div>
        <div class="panel">
          <h3>Event log</h3>
          <div class="am-log" data-el="log"></div>
        </div>
      </div>

      <div class="panel">
        <h3>Routing</h3>
        <div class="am-backend-chips" data-el="chips"></div>
        <div class="am-flow" data-el="flow"></div>
        <div class="am-flow-note" data-el="flownote"></div>
      </div>
    </div>
  `;

  const el = {
    transcript: $(host, '[data-el="transcript"]'),
    input: $<HTMLInputElement>(host, '[data-el="input"]'),
    send: $<HTMLButtonElement>(host, '[data-el="send"]'),
    copy: $<HTMLButtonElement>(host, '[data-el="copy"]'),
    layaSlot: $(host, '[data-el="laya-slot"]'),
    wireRaw: $(host, '[data-el="wire-raw"]'),
    wireIr0: $(host, '[data-el="wire-ir0"]'),
    wireIr1: $(host, '[data-el="wire-ir1"]'),
    wireIr1Note: $(host, '[data-el="wire-ir1-note"]'),
    wireResp: $(host, '[data-el="wire-resp"]'),
    mwlist: $(host, '[data-el="mwlist"]'),
    log: $(host, '[data-el="log"]'),
    chips: $(host, '[data-el="chips"]'),
    flow: $(host, '[data-el="flow"]'),
    flownote: $(host, '[data-el="flownote"]'),
    format: $<HTMLSelectElement>(host, '[data-k="format"]'),
    model: $<HTMLSelectElement>(host, '[data-k="model"]'),
    routing: $<HTMLSelectElement>(host, '[data-k="routing"]'),
    stream: $<HTMLInputElement>(host, '[data-k="stream"]'),
  };
  el.format.value = state.format;
  el.model.value = state.model;
  el.routing.value = state.routing;
  el.stream.checked = state.stream;

  const history: ChatTurn[] = [];

  // ---- send the latest reply to Laya for moderation ----
  const toLaya = handoffButton({
    from: 'aimatey',
    to: 'laya',
    kind: 'aimatey-reply',
    label: 'Moderate this reply',
    getPayload: () => ({ text: [...history].reverse().find(t => t.role === 'assistant')?.text ?? '' }),
  });
  toLaya.title = 'Sends the latest assistant reply to Laya Playground to run the moderationQuestions() preset against it';
  toLaya.disabled = true;
  el.layaSlot.appendChild(toLaya);

  const cacheStorage = new InMemoryCacheStorage();
  let router: Router = buildRouter(state.routing);
  let bridge: Bridge<FrontendAdapter> = buildBridge();
  let capturedIR: IRChatRequest | null = null;
  let busy = false;

  function persist(): void { writeState(state, DEFAULTS); }

  function buildRouter(routing: RoutingId): Router {
    const r = createRouter({
      routingStrategy: routing,
      fallbackStrategy: 'sequential',
      defaultBackend: 'slow-flaky',
      trackLatency: true,
    });
    r.register('haiku-bot', haikuBackend);
    r.register('echo-uppercase', echoBackend);
    r.register('slow-flaky', flakyBackend);
    const chain = ['slow-flaky', 'haiku-bot', 'echo-uppercase'];
    const modelMap: Record<string, string> = { ...BASE_MODEL_MAP };
    // Only registered — and only in the fallback chain / model mapping — while both
    // "available" (companion says so) and "enabled" (the chip's own on/off toggle) hold.
    // Disabling the chip un-registers it, so a message routed to it by model name falls
    // through the same sequential chain the three mocks already use (→ slow-flaky → haiku-bot).
    if (appleBackend && state.appleEnabled) {
      r.register(APPLE_BACKEND_NAME, appleBackend);
      chain.unshift(APPLE_BACKEND_NAME);
      modelMap[APPLE_MODEL_ID] = APPLE_BACKEND_NAME;
    }
    r.setFallbackChain(chain);
    r.setModelMapping(modelMap);
    return r;
  }

  function buildFrontend(): FrontendAdapter {
    if (state.format === 'openai') return new OpenAIFrontendAdapter();
    if (state.format === 'anthropic') return new AnthropicFrontendAdapter();
    return createGenericFrontend({ name: 'generic-frontend' });
  }

  function buildBridge(): Bridge<FrontendAdapter> {
    const b = createBridge(buildFrontend(), router);
    if (state.mwSystem) b.use(createSystemPromptMiddleware(state.prompt), { name: 'system-prompt' });
    if (state.mwLogging) {
      b.use(createLoggingMiddleware({
        level: 'debug', sanitize: true,
        logger: {
          debug: (m) => logEvent('log', m),
          info: (m) => logEvent('log', m),
          warn: (m) => logEvent('log', m),
          error: (m) => logEvent('error', m),
        },
      }), { name: 'logging' });
    }
    if (state.mwRetry) {
      b.use(createRetryMiddleware({
        maxAttempts: 3, initialDelay: 250, backoffMultiplier: 2, maxDelay: 4000,
        onRetry: (err, attempt, ms) => { retriesThisTurn++; logEvent('retry', `retry ${attempt} after "${errText(err)}" — waiting ${Math.round(ms)}ms`); },
      }), { name: 'retry' });
    }
    if (state.mwCaching) {
      b.use(createCachingMiddleware({ storage: cacheStorage, ttl: 30_000, unidentified: 'share' }), { name: 'caching' });
    }
    if (state.mwCost) {
      b.use(createCostTrackingMiddleware({
        onCost: (c: CostCalculation) => logEvent('cost', `$${c.totalCost.toFixed(6)} · ${c.totalTokens} tok · ${c.provider}/${c.model}`),
      }), { name: 'cost-tracking' });
    }
    // Always-on, innermost: captures the exact IR that reaches the router/backend,
    // after every enabled middleware's request phase has run.
    b.use(async (ctx, next) => { capturedIR = ctx.request; return next(); }, { name: 'capture' });
    return b;
  }

  function rebuild(): void {
    router = buildRouter(state.routing);
    bridge = buildBridge();
    renderMwList();
    renderChips();
    renderFlow();
  }

  /* ---------------------------------------------------------------- log */
  const logLines: Array<{ kind: string; text: string; t: number }> = [];
  function logEvent(kind: string, text: string): void {
    logLines.push({ kind, text, t: Date.now() });
    if (logLines.length > 200) logLines.shift();
    renderLog();
  }
  function renderLog(): void {
    el.log.innerHTML = logLines.slice(-80).map(l =>
      `<div class="l kind-${esc(l.kind)}"><span class="t">${new Date(l.t).toLocaleTimeString()}</span>${esc(l.text)}</div>`,
    ).join('');
    el.log.scrollTop = el.log.scrollHeight;
  }

  /* ---------------------------------------------------------------- transcript */
  function renderTranscript(streamingText?: string): void {
    const rows = history.map(t =>
      `<div class="am-msg ${t.role}${t.isError ? ' err' : ''}"><span class="am-tag">${t.role}</span>${esc(t.text)}</div>`,
    );
    if (streamingText !== undefined) rows.push(`<div class="am-msg assistant"><span class="am-tag">assistant</span>${esc(streamingText)}<span class="am-note">▌</span></div>`);
    el.transcript.innerHTML = rows.join('') || '<p class="am-sub">Nothing yet — say hello.</p>';
    el.transcript.scrollTop = el.transcript.scrollHeight;
    toLaya.disabled = streamingText !== undefined || !history.some(t => t.role === 'assistant');
  }

  /* ---------------------------------------------------------------- middleware editor */
  function renderMwList(): void {
    el.mwlist.innerHTML = MW_DEFS.map(d => `
      <div class="am-mw-row" data-mw="${d.key}">
        <input type="checkbox" data-mwtoggle="${d.key}" ${state[d.key] ? 'checked' : ''} />
        <div>
          <div class="am-mw-name">${esc(d.name)}</div>
          <div class="am-mw-desc">${esc(d.desc)}</div>
          ${d.key === 'mwSystem' ? `<input type="text" data-mwprompt value="${esc(state.prompt)}" />` : ''}
        </div>
      </div>
    `).join('');
    el.mwlist.querySelectorAll<HTMLInputElement>('[data-mwtoggle]').forEach(cb => {
      on(cb, 'change', () => {
        const key = cb.dataset.mwtoggle as keyof State;
        (state as any)[key] = cb.checked;
        persist();
        rebuild();
      });
    });
    const pi = el.mwlist.querySelector<HTMLInputElement>('[data-mwprompt]');
    if (pi) on(pi, 'change', () => { state.prompt = pi.value; persist(); rebuild(); });
  }

  /* ---------------------------------------------------------------- routing chips */
  function renderChips(landed?: { ok: string[]; bad: string[] }): void {
    const info = router.getBackendInfo();
    const mockChips = info.filter(b => b.name !== APPLE_BACKEND_NAME).map(b => {
      const cls = landed?.ok.includes(b.name) ? 'hit-ok' : landed?.bad.includes(b.name) ? 'hit-fail' : '';
      const circuit = b.circuitBreakerState !== 'closed' ? `<span class="circuit-open"> · circuit ${b.circuitBreakerState}</span>` : '';
      return `<div class="am-bchip ${cls}">
        <div class="n"><span>${esc(b.name)}</span><span>${b.stats.totalRequests}</span></div>
        <div class="s">✓${b.stats.successfulRequests} ✗${b.stats.failedRequests}${circuit}</div>
      </div>`;
    }).join('');

    let appleChip: string;
    const appleInfo = appleBackend ? info.find(b => b.name === APPLE_BACKEND_NAME) : undefined;
    if (appleInfo) {
      // Registered and live — real requests hit the companion.
      const cls = landed?.ok.includes(appleInfo.name) ? 'hit-ok' : landed?.bad.includes(appleInfo.name) ? 'hit-fail' : '';
      const circuit = appleInfo.circuitBreakerState !== 'closed' ? `<span class="circuit-open"> · circuit ${appleInfo.circuitBreakerState}</span>` : '';
      appleChip = `<div class="am-bchip am-bchip-apple ${cls}">
        <div class="n"><span>${esc(appleInfo.name)} <span class="am-badge am-badge-live">on-device · live</span></span><span>${appleInfo.stats.totalRequests}</span></div>
        <div class="s">✓${appleInfo.stats.successfulRequests} ✗${appleInfo.stats.failedRequests}${circuit}</div>
        <button class="btn am-apple-toggle" type="button" data-apple-toggle="off">disable</button>
      </div>`;
    } else if (appleBackend) {
      // Companion confirms it's available, but the chip's own toggle is off.
      appleChip = `<div class="am-bchip am-bchip-apple am-bchip-dim">
        <div class="n"><span>${esc(APPLE_BACKEND_NAME)} <span class="am-badge am-badge-dim">on-device · disabled</span></span></div>
        <div class="s">Turned off for this session — model=<code>${esc(APPLE_MODEL_ID)}</code> falls through the chain to slow-flaky → haiku-bot.</div>
        <button class="btn am-apple-toggle" type="button" data-apple-toggle="on">enable</button>
      </div>`;
    } else {
      // Not available at all: no companion, no afm demo, or the framework itself said no.
      appleChip = `<div class="am-bchip am-bchip-apple am-bchip-dim">
        <div class="n"><span>${esc(APPLE_BACKEND_NAME)} <span class="am-badge am-badge-dim">on-device · unavailable</span></span></div>
        <div class="s">${esc(appleReason ?? 'unavailable')} See <a href="#/settings">settings</a> or the <a href="#/afm">Apple On-Device planet</a>.</div>
      </div>`;
    }

    el.chips.innerHTML = mockChips + appleChip;
    const toggleBtn = el.chips.querySelector<HTMLButtonElement>('[data-apple-toggle]');
    if (toggleBtn) {
      on(toggleBtn, 'click', () => {
        state.appleEnabled = toggleBtn.dataset.appleToggle === 'on';
        persist();
        rebuild();
      });
    }
  }

  /* ---------------------------------------------------------------- flow diagram */
  function flowNodeList(): Array<{ key: string; label: string; on: boolean }> {
    const nodes: Array<{ key: string; label: string; on: boolean }> = [{ key: 'req', label: 'Request', on: true }];
    for (const d of MW_DEFS) nodes.push({ key: d.key, label: d.name.split(' ')[0], on: !!state[d.key] });
    nodes.push({ key: 'router', label: 'Router', on: true });
    for (const name of router.listBackends()) nodes.push({ key: `b:${name}`, label: name, on: true });
    nodes.push({ key: 'resp', label: 'Response', on: true });
    return nodes;
  }
  function renderFlow(): void {
    const nodes = flowNodeList();
    el.flow.innerHTML = nodes.map((n, i) =>
      (i > 0 ? '<span class="am-arrow">→</span>' : '') + `<div class="am-node ${n.on ? 'on' : 'off'}" data-node="${esc(n.key)}">${esc(n.label)}</div>`,
    ).join('');
  }
  function flowEl(key: string): HTMLElement | null { return el.flow.querySelector(`[data-node="${key}"]`); }
  async function pulse(key: string, cls: 'pulse' | 'ok' | 'bad', hold = 260): Promise<void> {
    const node = flowEl(key);
    if (!node) return;
    node.classList.add(cls);
    await delay(hold);
    if (cls === 'pulse') node.classList.remove('pulse');
  }

  /* ---------------------------------------------------------------- wire request/response builders */
  function buildRawRequest(): OpenAIRequest | AnthropicRequest | IRChatRequest {
    const msgs = history.slice(-12);
    if (state.format === 'openai') {
      return {
        model: state.model,
        messages: msgs.map(m => ({ role: m.role, content: m.text })),
        max_tokens: 300,
        temperature: 0.7,
      } satisfies OpenAIRequest;
    }
    if (state.format === 'anthropic') {
      return {
        model: state.model,
        max_tokens: 300,
        messages: msgs.map(m => ({ role: m.role, content: m.text })),
      } satisfies AnthropicRequest;
    }
    return {
      messages: msgs.map(m => ({ role: m.role, content: m.text })),
      parameters: { model: state.model, maxTokens: 300 },
      metadata: { requestId: nowId(), timestamp: Date.now(), provenance: {} },
      stream: state.stream,
    } satisfies IRChatRequest;
  }

  function extractResponseText(resp: unknown): string {
    if (state.format === 'openai') return (resp as OpenAIResponse).choices?.[0]?.message?.content as string ?? '';
    if (state.format === 'anthropic') {
      return ((resp as AnthropicResponse).content ?? []).filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
    }
    const c = (resp as IRChatResponse).message?.content;
    if (typeof c === 'string') return c;
    return (c ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
  }

  function extractDelta(chunk: unknown): string {
    if (state.format === 'openai') return (chunk as OpenAIStreamChunk).choices?.[0]?.delta?.content ?? '';
    if (state.format === 'anthropic') {
      const c = chunk as AnthropicStreamEvent;
      if (c.type === 'content_block_delta' && c.delta.type === 'text_delta') return c.delta.text;
      return '';
    }
    const c = chunk as IRStreamChunk;
    return c.type === 'content' ? c.delta : '';
  }

  function pretty(v: unknown): string { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }

  /* ---------------------------------------------------------------- send */
  let retriesThisTurn = 0;

  async function send(): Promise<void> {
    const text = el.input.value.trim();
    if (!text || busy) return;
    busy = true;
    el.send.setAttribute('disabled', 'true');
    el.input.value = '';
    retriesThisTurn = 0;
    capturedIR = null;
    history.push({ role: 'user', text });
    renderTranscript();

    const rawRequest = buildRawRequest();
    el.wireRaw.textContent = pretty(rawRequest);
    el.wireIr1.textContent = '(pending — after middleware runs)';
    el.wireIr1Note.textContent = '';

    const frontendForIR = buildFrontend();
    try {
      const ir0 = state.format === 'generic' ? rawRequest as IRChatRequest : await frontendForIR.toIR(rawRequest as never);
      el.wireIr0.textContent = pretty(ir0);
    } catch (e) {
      el.wireIr0.textContent = errText(e);
    }

    logEvent('request', `→ sending via ${state.format} · routing=${state.routing} · model=${state.model} · stream=${state.stream}`);
    const before = router.getBackendInfo().reduce((m, b) => (m[b.name] = b.stats.totalRequests, m), {} as Record<string, number>);

    await pulse('req', 'pulse', 180);
    for (const d of MW_DEFS) { if (state[d.key]) await pulse(String(d.key), 'pulse', 160); }
    await pulse('router', 'pulse', 160);

    let landedOk: string | null = null;
    let landedBad: string[] = [];
    let responseText = '';
    let failed = false;

    try {
      if (state.stream) {
        let acc = '';
        const stream = bridge.chatStream(rawRequest as never);
        for await (const chunk of stream as AsyncIterable<unknown>) {
          const piece = extractDelta(chunk);
          if (piece) { acc += piece; renderTranscript(acc); }
        }
        responseText = acc;
        el.wireResp.textContent = '(streamed — no single response object; shown as assembled text)';
      } else {
        const resp = await bridge.chat(rawRequest as never);
        responseText = extractResponseText(resp);
        el.wireResp.textContent = pretty(resp);
      }
      history.push({ role: 'assistant', text: responseText || '(empty response)' });
      logEvent('success', 'response received');
    } catch (e) {
      failed = true;
      history.push({ role: 'assistant', text: `⚠ ${errText(e)}`, isError: true });
      logEvent('error', errText(e));
      el.wireResp.textContent = errText(e);
    }

    if (capturedIR) {
      el.wireIr1.textContent = pretty(capturedIR);
      el.wireIr1Note.textContent = '';
      el.wireIr1Note.className = '';
    } else {
      el.wireIr1.textContent = '(not reached — served from cache before the innermost middleware)';
      el.wireIr1Note.textContent = ' cache hit';
      el.wireIr1Note.className = 'am-cache-hit';
    }

    // Stats deltas tell us which backends were actually dispatched to. Order them
    // by the fallback chain (the real attempt order for 'sequential' fallback) so
    // the animation walks them in the sequence the Router actually tried.
    const after = router.getBackendInfo().reduce((m, b) => (m[b.name] = b.stats.totalRequests, m), {} as Record<string, number>);
    const chainOrder = router.getFallbackChain();
    const attempted = chainOrder
      .filter(n => (after[n] ?? 0) > (before[n] ?? 0))
      .concat(router.listBackends().filter(n => !chainOrder.includes(n) && (after[n] ?? 0) > (before[n] ?? 0)));

    if (failed) {
      landedBad = attempted;
      landedOk = null;
    } else {
      // Sequential fallback tries backends in order until one succeeds; since the
      // overall call did not throw, the last backend attempted is the one that answered.
      landedBad = attempted.slice(0, -1);
      landedOk = attempted[attempted.length - 1] ?? null;
    }

    for (const name of landedBad) await pulse(`b:${name}`, 'bad', 220);
    if (landedOk) await pulse(`b:${landedOk}`, 'ok', 260);

    if (retriesThisTurn > 0) el.flownote.textContent = `${retriesThisTurn} retry pass(es) via the retry middleware, plus ${Math.max(0, attempted.length - 1)} router-level fallback hop(s).`;
    else if (attempted.length > 1) el.flownote.textContent = `${attempted.length - 1} router-level fallback hop(s) before landing.`;
    else el.flownote.textContent = '';

    renderChips({ ok: landedOk ? [landedOk] : [], bad: landedBad });
    renderTranscript();
    setTimeout(() => {
      host.querySelectorAll('.am-node.ok, .am-node.bad').forEach(n => n.classList.remove('ok', 'bad'));
    }, 1600);

    busy = false;
    el.send.removeAttribute('disabled');
    el.input.focus();
  }

  /* ---------------------------------------------------------------- wiring */
  on(el.send, 'click', () => { void send().catch(e => logEvent('error', errText(e))); });
  on(el.input, 'keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { void send().catch(err => logEvent('error', errText(err))); } });
  on(el.copy, 'click', () => { void copyLink(); });
  on(el.format, 'change', () => { state.format = el.format.value as FormatId; persist(); rebuild(); });
  on(el.model, 'change', () => { state.model = el.model.value; persist(); });
  on(el.routing, 'change', () => { state.routing = el.routing.value as RoutingId; persist(); rebuild(); });
  on(el.stream, 'change', () => { state.stream = el.stream.checked; persist(); });

  renderTranscript();
  rebuild();
  logEvent('log', 'planet ready — default routing is "explicit" with slow-flaky as primary, so failovers show up often');
  logEvent('log', appleAvailable
    ? `apple-foundation-model is live — pick routing="By model name" + model="${APPLE_MODEL_ID}" to reach it`
    : `apple-foundation-model unavailable: ${appleReason ?? 'unavailable'}`);

  return () => { for (const c of cleanups) c(); };
}

const playground: Playground = {
  id: 'aimatey',
  title: 'Aimatey Router',
  pkg: '@johnhenry/aimatey',
  hue: 350,
  blurb: 'One chat, many providers: middleware and routing across mocked backends, no API keys needed.',
  docs: 'https://opensource.johnhenry.me/aimatey/',
  async mount(host) {
    try {
      return await mountRoom(host);
    } catch (e) {
      host.innerHTML = `<div class="panel"><pre class="error">${esc(errText(e))}</pre></div>`;
      return undefined;
    }
  },
};
export default playground;
