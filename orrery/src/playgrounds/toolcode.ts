import type { Playground } from '../registry';
import { readState, writeState, copyLink } from '../state';
import { createBridge } from '@johnhenry/aimatey-core';
import { createGenericFrontend } from '@johnhenry/aimatey-frontend';
import type {
  BackendAdapter, AdapterMetadata, IRChatRequest, IRChatResponse, IRChatStream, IRMessage, Middleware,
} from '@johnhenry/aimatey-types';
import {
  createCodeExecutionMiddleware, toolsToCapabilities, toolsToPreamble,
  extractCodeBlocks, adaptPythonisms, autoAwait, formatResults, resultsToToolCalls,
} from '@johnhenry/aimatey-middleware-andbox';
import type {
  CodeExecutionResult as CodeResult, SyntheticToolCall,
  CodeExecutionResponse as Carrier, CodeExecutionMiddleware as CodeExecMiddleware,
} from '@johnhenry/aimatey-middleware-andbox';
import { createSandbox } from '@johnhenry/andbox';
import type { Sandbox, EvaluateOptions as EvalOpts, GateStatsResult as GateStats, SandboxOptions } from '@johnhenry/andbox';
import './toolcode.css';

type ConsoleFn = (level: string, ...args: string[]) => void;

/* ================================================================ helpers */

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const now = () => performance.now();
const fmtMs = (ms: number) => (ms < 10 ? ms.toFixed(1) : Math.round(ms).toString()) + 'ms';
function short(v: unknown, max = 90): string {
  let s: string;
  try { s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v); } catch { s = String(v); }
  if (s === undefined) s = String(v);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function hashStr(s: string): number {
  let x = 7;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(x);
}
function textOf(m: IRMessage | undefined): string {
  if (!m) return '';
  const c = m.content as unknown;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p: { type: string; text?: string }) => (p.type === 'text' ? p.text ?? '' : '')).join('');
  return '';
}

/* ================================================================ the three host tools */

const TOOLS = [
  { name: 'get_weather', description: 'Current weather for a city', parameters: { city: { type: 'string' } } },
  { name: 'calc', description: 'Evaluate an arithmetic expression', parameters: { expr: { type: 'string' } } },
  { name: 'lookup_user', description: 'Fetch a user record by id', parameters: { id: { type: 'number' } } },
];
const TOOL_HUE: Record<string, string> = { get_weather: 'w', calc: 'c', lookup_user: 'u' };

interface Weather { city: string; temp_c: number; sky: string; humidity: number; rain: boolean }
const WEATHER: Record<string, Omit<Weather, 'city'>> = {
  paris: { temp_c: 18, sky: 'cloudy', humidity: 71, rain: true },
  tokyo: { temp_c: 24, sky: 'sunny', humidity: 60, rain: false },
  oslo: { temp_c: 6, sky: 'overcast', humidity: 84, rain: true },
  cairo: { temp_c: 33, sky: 'clear', humidity: 22, rain: false },
  london: { temp_c: 14, sky: 'drizzle', humidity: 88, rain: true },
  lima: { temp_c: 21, sky: 'hazy', humidity: 79, rain: false },
};
const SKIES = ['sunny', 'cloudy', 'clear', 'overcast', 'windy', 'showers'];
function fakeWeather(city: string): Weather {
  const key = city.trim().toLowerCase();
  const known = WEATHER[key];
  if (known) return { city, ...known };
  const h = hashStr(key);
  return { city, temp_c: 4 + (h % 27), sky: SKIES[h % SKIES.length], humidity: 30 + (h % 60), rain: h % 3 === 0 };
}

interface User { id: number; name: string; city: string; role: string }
const USERS: Record<number, User> = {
  1: { id: 1, name: 'Ada Lovelace', city: 'London', role: 'admin' },
  2: { id: 2, name: 'Katherine Johnson', city: 'Paris', role: 'engineer' },
  3: { id: 3, name: 'Alan Turing', city: 'Oslo', role: 'admin' },
  4: { id: 4, name: 'Grace Hopper', city: 'Tokyo', role: 'engineer' },
};

/** A tiny, eval-free arithmetic parser: + - * / % ^ ( ) and unary minus. */
function calcExpr(src: string): number {
  const toks = src.match(/\d+(?:\.\d+)?|[-+*/%^()]/g) ?? [];
  if (toks.join('') !== src.replace(/\s+/g, '')) throw new Error(`calc: can't parse "${src}"`);
  let i = 0;
  const peek = () => toks[i];
  const eat = (t?: string) => { const x = toks[i++]; if (t && x !== t) throw new Error(`calc: expected "${t}" in "${src}"`); return x; };
  const atom = (): number => {
    const t = peek();
    if (t === '(') { eat('('); const v = sum(); eat(')'); return v; }
    if (t === '-') { eat(); return -atom(); }
    if (t !== undefined && /^\d/.test(t)) { eat(); return parseFloat(t); }
    throw new Error(`calc: unexpected ${t ?? 'end'} in "${src}"`);
  };
  const pow = (): number => { const b = atom(); if (peek() === '^') { eat(); return b ** pow(); } return b; };
  const prod = (): number => {
    let v = pow();
    while (peek() === '*' || peek() === '/' || peek() === '%') { const op = eat(); const r = pow(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; }
    return v;
  };
  const sum = (): number => {
    let v = prod();
    while (peek() === '+' || peek() === '-') { const op = eat(); const r = prod(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  const v = sum();
  if (i !== toks.length) throw new Error(`calc: trailing "${toks.slice(i).join('')}" in "${src}"`);
  return Math.round(v * 1e6) / 1e6;
}

/** Tool stubs pass a single `params` value: a bare string/number or an object. */
function argOf(p: unknown, key: string): unknown {
  if (p && typeof p === 'object' && key in (p as Record<string, unknown>)) return (p as Record<string, unknown>)[key];
  return p;
}

async function runHostTool(name: string, params: unknown): Promise<unknown> {
  if (name === 'get_weather') {
    await delay(60 + Math.random() * 70);
    const city = String(argOf(params, 'city') ?? '').trim();
    if (!city) throw new Error('get_weather: city is required');
    return fakeWeather(city);
  }
  if (name === 'calc') {
    await delay(12 + Math.random() * 10);
    return calcExpr(String(argOf(params, 'expr') ?? ''));
  }
  if (name === 'lookup_user') {
    await delay(70 + Math.random() * 50);
    const id = Number(argOf(params, 'id'));
    const u = USERS[id];
    if (!u) throw new Error(`lookup_user: no user with id ${String(argOf(params, 'id'))}`);
    return u;
  }
  throw new Error(`unknown tool ${name}`);
}

/* ================================================================ mock "LLM" scripts */

interface Script {
  id: string;
  label: string;
  prompt: string;
  keywords: RegExp;
  reply: string;
  /** Prose for the follow-up turn once results are fed back. */
  followup?: (summary: string) => string;
}

const F = '```';
const SCRIPTS: Script[] = [
  {
    id: 'weather', label: 'weather · python-ish',
    prompt: "What's the weather in Paris and Tokyo? Sum the temps.",
    keywords: /weather|temp|paris|tokyo/i,
    reply: `I can't call tools natively, but I can write code that does. Let me fetch both cities and add the temperatures:

${F}python
paris = await get_weather("Paris")
tokyo = await get_weather("Tokyo")
p = paris["temp_c"]
t = tokyo["temp_c"]
total = p + t
rain_in_paris = paris["rain"] == True
print(f"Paris: {p}°C")
print(f"Tokyo: {t}°C")
print(f"Sum of temperatures: {total}°C")
print(f"Umbrella for Paris? {rain_in_paris}")
${F}

That should give you both readings and the sum.`,
    followup: (s) => {
      const p = /Paris: (-?\d+)/.exec(s)?.[1], t = /Tokyo: (-?\d+)/.exec(s)?.[1], sum = /Sum of temperatures: (-?\d+)/.exec(s)?.[1];
      const umb = /Umbrella for Paris\? (true|false)/.exec(s)?.[1];
      if (!sum) return '';
      return `Paris is ${p}°C and Tokyo is ${t}°C, so the two temperatures add up to ${sum}°C.${umb === 'true' ? ' Pack an umbrella for Paris.' : ''}`;
    },
  },
  {
    id: 'js', label: 'plain JS · return value',
    prompt: 'Look up users 1, 2 and 3 and tell me which ones are admins.',
    keywords: /admin|users?\b|look ?up/i,
    reply: `Sure. This time I'll write straight JavaScript and just return the answer instead of printing:

${F}js
const users = await Promise.all([1, 2, 3].map(id => lookup_user(id)));
const admins = users.filter(u => u.role === "admin").map(u => u.name);
return { checked: users.length, admins };
${F}`,
    followup: (s) => {
      const m = /"admins":\s*\[([^\]]*)\]/.exec(s);
      if (!m) return '';
      const names = m[1].split(',').map(x => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
      return `Of the three users, ${names.length} are admins: ${names.join(' and ')}. (No console output, so the middleware JSON-stringified the block's return value.)`;
    },
  },
  {
    id: 'multistep', label: 'multi-step · chained tools',
    prompt: "Where does user 2 live, what's the weather there, and what is that in Fahrenheit?",
    keywords: /fahrenheit|live|where does|user \d/i,
    reply: `Three hops, each feeding the next: look the user up, fetch weather for their city, then convert with the calculator.

${F}js
const user = await lookup_user(2);
const w = await get_weather(user.city);
const f = await calc(\`\${w.temp_c} * 9 / 5 + 32\`);
print(\`\${user.name} lives in \${user.city}\`);
print(\`Weather there: \${w.temp_c}°C, \${w.sky}\`);
print(\`That is \${f}°F\`);
${F}`,
    followup: (s) => {
      const who = /([A-Z][a-z]+(?: [A-Z][a-z]+)*) lives in (\w+)/.exec(s), f = /That is (-?[\d.]+)°F/.exec(s)?.[1], c = /Weather there: (-?\d+)°C, (\w+)/.exec(s);
      return who && f && c ? `User 2 is ${who[1]}, who lives in ${who[2]}. It's ${c[1]}°C and ${c[2]} there, which is ${f}°F.` : '';
    },
  },
  {
    id: 'error', label: 'errors · runtime + syntax',
    prompt: 'Look up user 42, then list the weather in Paris, Tokyo and Lima.',
    keywords: /\b42\b|error|list|lima/i,
    reply: `Two blocks: first the user, then a loop over the cities.

${F}js
const u = await lookup_user(42);
print("found", u.name);
${F}

${F}python
# a real Python loop: '#' comments and 'for x in y:' are not adapted
for city in ["Paris", "Tokyo", "Lima"]:
    w = get_weather(city)
    print(f"{city}: {w}")
${F}`,
  },
  {
    // Was "adapter gaps · f-string edge cases": adaptPythonisms() used to only
    // rewrite the first {name} in an f-string, leave dotted names like {o.city}
    // untouched, and — when a block already had a real ${gap} template literal —
    // double-dollar it into $${gap}. All three are fixed now (dotted/indexed
    // placeholders, every placeholder in a string, and a whole-block bail-out
    // that avoids corrupting an existing template literal at all). This preset
    // demonstrates the fix: no stray "$", no untouched {o.city}.
    id: 'gap', label: 'adapter gaps · dotted f-strings (fixed)',
    prompt: 'Compare the humidity in Oslo and Cairo.',
    keywords: /humid|oslo|cairo|compare/i,
    reply: `Let me pull both and compare (mixing habits, as small models do):

${F}py
o = await get_weather("Oslo")
c = await get_weather("Cairo")
gap = o["humidity"] - c["humidity"]
print(f"Oslo {o.humidity}% vs Cairo {c.humidity}%")
print(f"{o.city} is {o.sky}, {c.city} is {c.sky}")
print(f"difference: {gap} points")
${F}`,
    followup: (s) => {
      const m = /difference: (-?\d+) points/.exec(s);
      if (!m) return '';
      return `Oslo is ${m[1]} points more humid than Cairo. Every placeholder came through correctly this time — dotted names ({o.city}, {c.sky}) and repeated placeholders in one f-string both interpolate now, so Stage 3's diff shows clean rewrites with no stray "$" and nothing left literal.`;
    },
  },
  {
    // The other half of the same fix (issue #10, closed in 0.0.2):
    // adaptPythonisms() used to bail out on the *entire* block the moment it
    // saw any real "${" already in the code — meant to stop it double-dollaring
    // an existing template literal, but it left every f-string in that same
    // block as literal Python syntax, a hard SyntaxError once the sandbox
    // tried to run it. It now rewrites f-strings one string-literal match at
    // a time instead of scanning the whole block, so a real `${...}` template
    // literal elsewhere in the same code is simply never matched by the
    // f-string patterns — both survive, side by side. Verified directly
    // against adaptPythonisms(): the f-string becomes a template literal and
    // the pre-existing `${gap}` literal is untouched.
    id: 'mixed', label: 'adapter gaps · mixed with a template literal (fixed)',
    prompt: 'Compare the humidity in Oslo and Cairo, and also log the raw difference in a template string.',
    keywords: /raw difference|template string|mixed habits/i,
    reply: `Let me pull both, compare, and log the raw difference too:

${F}py
o = await get_weather("Oslo")
c = await get_weather("Cairo")
gap = o["humidity"] - c["humidity"]
print(f"Oslo {o.humidity}% vs Cairo {c.humidity}%")
print(\`raw difference: \${gap} points\`)
${F}`,
    followup: (s) => {
      const hum = /Oslo (-?\d+)% vs Cairo (-?\d+)%/.exec(s);
      const raw = /raw difference: (-?\d+) points/.exec(s);
      if (!hum || !raw) return '';
      return `Oslo is at ${hum[1]}% humidity and Cairo at ${hum[2]}%, a raw difference of ${raw[1]} points. The f-string and the pre-existing template literal both interpolated correctly in the same block — the adapter no longer bails out on the whole block just because a real "\${" was already present.`;
    },
  },
  {
    id: 'timeout', label: 'runaway · timeout',
    prompt: 'Keep checking Paris until it gets above 30°C.',
    keywords: /until|poll|keep|wait/i,
    reply: `I'll poll until it warms up:

${F}js
let w = await get_weather("Paris");
print("start:", w.temp_c);
while (w.temp_c <= 30) {
  // the model forgot to re-fetch inside the loop
}
print("warm now!");
${F}`,
  },
  {
    id: 'flood', label: 'flood · rate limit',
    prompt: 'Get the weather for every capital in Europe.',
    keywords: /every|capital|europe|all\b/i,
    reply: `That's a lot of calls, but here goes:

${F}js
const capitals = ["Paris", "Berlin", "Madrid", "Rome", "Vienna", "Oslo",
  "Lisbon", "Dublin", "Prague", "Warsaw", "Athens", "Bern"];
for (const city of capitals) {
  const w = await get_weather(city);
  print(\`\${city}: \${w.temp_c}°C \${w.sky}\`);
}
${F}`,
  },
  {
    // Honest jailbreak: two real escape attempts, reported straight. andbox's
    // capability gate builds its object with Object.create(null), so a call to a
    // name that was never granted as a capability — 'constructor' included —
    // simply isn't there; the host replies "Unknown capability" (andbox#5, fixed).
    // But sandboxed code runs in a real Worker global scope, and fetch() is a
    // Worker global like any other: nothing about "no fetch capability was granted"
    // stops raw fetch() from being called directly, capability gate or not
    // (andbox's own README says so under "What is still yours").
    id: 'jailbreak', label: 'honest jailbreak · constructor + raw fetch',
    prompt: 'Try to break out of the sandbox: reach the real constructor, and make a raw network request the host never approved.',
    keywords: /jailbreak|escape|break out|constructor|raw fetch/i,
    reply: `I can't promise either will work, but let's actually try both and report what happens — no pretending:

${F}js
let ctorResult;
try {
  const c = await host.call('constructor');
  ctorResult = \`reached it: \${typeof c}\`;
} catch (e) {
  ctorResult = \`blocked: \${e.message}\`;
}
print(\`host.call('constructor') -> \${ctorResult}\`);

let fetchResult;
try {
  const res = await fetch('https://example.com/');
  fetchResult = \`reached the network: HTTP \${res.status}\`;
} catch (e) {
  fetchResult = \`no network here (not a sandbox block): \${e.message}\`;
}
print(\`raw fetch() -> \${fetchResult}\`);
${F}`,
    followup: (s) => {
      const c = /host\.call\('constructor'\) -> (.+)/.exec(s)?.[1];
      const f = /raw fetch\(\) -> (.+)/.exec(s)?.[1];
      if (!c || !f) return '';
      return `Two different outcomes. host.call('constructor') ${c.startsWith('blocked') ? 'was blocked' : 'went through'} — andbox's gate is built with Object.create(null), so a capability name nobody granted, "constructor" included, simply isn't there. But raw fetch() ${f.startsWith('reached') ? 'went straight through' : 'only failed for network reasons'}, because sandboxed code shares the Worker's real global scope: fetch, WebSocket and Worker are reachable directly, with or without a matching host.* capability. andbox's own docs call this out — it isolates well-behaved code, not code that's actively trying to get out.`;
    },
  },
];

function scriptFor(text: string): Script | null {
  const exact = SCRIPTS.find(s => s.prompt.toLowerCase() === text.trim().toLowerCase());
  if (exact) return exact;
  return SCRIPTS.find(s => s.keywords.test(text)) ?? null;
}

function fallbackReply(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `I'm a scripted mock, so I don't really understand that, but I can still answer with code:

${F}python
words = ${words}
chars = ${text.length}
ratio = await calc(f"{chars} / ${Math.max(words, 1)}")
print(f"Your message has {words} words")
print(f"Average word length: {ratio} characters")
${F}`;
}

function followupReply(prevReply: string, summary: string): string {
  const s = SCRIPTS.find(x => x.reply === prevReply);
  const failed = /\(error\):/.test(summary);
  const custom = !failed && s?.followup ? s.followup(summary) : '';
  if (custom) return custom;
  if (failed) {
    const errs = [...summary.matchAll(/(Block \d+|Result) \(error\): ([^\n]+)/g)].map(m => (m[1] === 'Result' ? m[2] : `${m[1].toLowerCase()} failed with ${m[2]}`));
    return `My code didn't work: ${errs.join('; ')}. In a real agent loop this summary is exactly what I'd see next turn, and I'd try again with fixed code.`;
  }
  return `Here's what my code produced: ${summary.replace(/^Result: /, '').replace(/\s*\n\s*/g, ' · ')}`;
}

/* ================================================================ mock backend (real BackendAdapter) */

const MOCK_META: AdapterMetadata = {
  name: 'mock-coder',
  version: '0.1.0',
  provider: 'in-page mock',
  capabilities: {
    streaming: true,
    multiModal: false,
    tools: false, // the whole point: no native tool calling
    systemMessageStrategy: 'in-messages',
    supportsMultipleSystemMessages: true,
    supportsTemperature: true,
  },
};

/** Plays an LLM that cannot call tools: every answer is prose plus fenced code. */
class MockCoderBackend implements BackendAdapter<IRChatRequest, IRChatResponse> {
  readonly metadata = MOCK_META;
  fromIR(request: IRChatRequest): IRChatRequest { return request; }
  toIR(response: IRChatResponse): IRChatResponse { return response; }

  private compose(request: IRChatRequest): string {
    const msgs = request.messages;
    const last = textOf([...msgs].reverse().find(m => m.role === 'user'));
    if (last.startsWith('[tool results]')) {
      const prev = textOf([...msgs].reverse().find(m => m.role === 'assistant'));
      return followupReply(prev, last.replace(/^\[tool results\]\s*/, ''));
    }
    const s = scriptFor(last);
    return s ? s.reply : fallbackReply(last);
  }

  async execute(request: IRChatRequest, signal?: AbortSignal): Promise<IRChatResponse> {
    await delay(260 + Math.random() * 180);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const text = this.compose(request);
    const tokens = Math.round(text.split(/\s+/).length * 1.3);
    return {
      message: { role: 'assistant', content: text },
      finishReason: 'stop',
      usage: { promptTokens: 20, completionTokens: tokens, totalTokens: 20 + tokens },
      metadata: { requestId: request.metadata.requestId, timestamp: Date.now(), provenance: { backend: MOCK_META.name } },
    };
  }

  async *executeStream(request: IRChatRequest, signal?: AbortSignal): IRChatStream {
    const r = await this.execute(request, signal);
    const text = r.message.content as string;
    yield { type: 'start', sequence: 0, metadata: r.metadata } as never;
    yield { type: 'content', sequence: 1, delta: text, accumulated: text } as never;
    yield { type: 'done', sequence: 2, finishReason: 'stop', usage: r.usage, message: r.message } as never;
  }
}

/* ================================================================ trace model */

interface ToolEvent { t: number; name: string; args: unknown; ms?: number; result?: unknown; error?: string }
interface ConsoleEvent { t: number; level: string; text: string }
type FailKind = 'timeout' | 'rate-limit' | 'syntax' | 'runtime';
interface BlockRun {
  index: number;
  fullCode: string;
  t0: number;
  ms?: number;
  tools: ToolEvent[];
  console: ConsoleEvent[];
  ret?: unknown;
  error?: string;
  errorName?: string;
  kind?: FailKind;
}
interface Block { lang: string; code: string }
interface Trace {
  id: number;
  user: string;
  toolsOn: boolean;
  timeoutMs: number;
  maxCalls: number;
  stage: number; // 0..5 progress
  sandboxMs?: number;
  llmMs?: number;
  raw?: string;
  blocks?: Block[];
  executable?: boolean[];
  adapted?: string[];
  runs: BlockRun[];
  carrier?: Carrier;
  gate?: GateStats;
  execMs?: number;
  followupMs?: number;
  followup?: string;
  final?: string;
  error?: string;
  /** codeLanguages passed to createCodeExecutionMiddleware() for this turn (see LANG_GROUPS). */
  langs?: Set<string>;
}

/** Default codeLanguages the middleware executes, grouped for the UI toggle below. */
const LANG_GROUPS: Array<{ key: string; label: string; langs: string[] }> = [
  { key: 'js', label: 'js/javascript', langs: ['js', 'javascript'] },
  { key: 'python', label: 'python/py', langs: ['python', 'py'] },
  { key: 'tool_code', label: 'tool_code', langs: ['tool_code'] },
  { key: 'bare', label: 'bare ```', langs: [''] },
];
const EXEC_LANGS = new Set(LANG_GROUPS.flatMap(g => g.langs));
const PY_LANGS = new Set(['python', 'py', 'tool_code']);

function classify(e: { name?: string; message?: string }): FailKind {
  const m = e.message ?? '';
  if (e.name === 'TimeoutError' || /timed? ?out/i.test(m)) return 'timeout';
  if (/limit exceeded/i.test(m)) return 'rate-limit';
  if (e.name === 'SyntaxError' || /Unexpected (token|identifier|string|number)|missing \) |Invalid or unexpected/i.test(m)) return 'syntax';
  return 'runtime';
}

/* ================================================================ diff + rewrite annotations */

function tokenize(s: string): string[] { return s.match(/\w+|\s+|[^\w\s]/g) ?? []; }
/** Token-level LCS diff → [op, text] runs (op: '=', '-', '+'). */
function diffTokens(a: string, b: string): Array<[string, string]> {
  const A = tokenize(a), B = tokenize(b);
  const n = A.length, m = B.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: Array<[string, string]> = [];
  const push = (op: string, t: string) => { const last = out[out.length - 1]; if (last && last[0] === op) last[1] += t; else out.push([op, t]); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('=', A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) push('-', A[i++]);
    else push('+', B[j++]);
  }
  while (i < n) push('-', A[i++]);
  while (j < m) push('+', B[j++]);
  return out;
}

function rewriteTags(orig: string, adapted: string, py: boolean): Array<{ text: string; warn?: boolean }> {
  const tags: Array<{ text: string; warn?: boolean }> = [];
  if (py) {
    if (/\bTrue\b/.test(orig)) tags.push({ text: 'True → true' });
    if (/\bFalse\b/.test(orig)) tags.push({ text: 'False → false' });
    if (/\bNone\b/.test(orig)) tags.push({ text: 'None → null' });
    if (/f"[^"]*"|f'[^']*'/.test(orig)) tags.push({ text: 'f-string → template literal' });
  }
  const interp = (s: string) => (s.match(/\$\{/g) ?? []).length;
  if (interp(adapted.replace(/\$\$\{/g, '')) > interp(orig)) tags.push({ text: '{name} → ${name}' });
  if ((adapted.match(/\$\$\{/g) ?? []).length > (orig.match(/\$\$\{/g) ?? []).length) tags.push({ text: 'bug: existing ${x} became $${x} (stray "$")', warn: true });
  const aw = (s: string) => (s.match(/await\s+print\s*\(/g) ?? []).length;
  if (aw(adapted) > aw(orig)) tags.push({ text: 'auto-await print()' });
  // braces left literal inside a template literal that came from an f-string
  for (const tl of adapted.match(/`[^`]*`/g) ?? []) {
    const missed = tl.match(/(?<!\$)\{[^{}]+\}/g);
    if (missed && py && /f["']/.test(orig)) tags.push({ text: `missed: ${missed.join(' ')} stays literal`, warn: true });
  }
  return tags;
}

/* ================================================================ planet */

const DEFAULT_LANGS = LANG_GROUPS.map(g => g.key).join('|');
const DEFAULTS = { preset: 'weather', q: '', tools: true, timeout: 2000, maxCalls: 8, langs: DEFAULT_LANGS };
type State = typeof DEFAULTS;

interface Turn { user: string; trace: Trace }

function mountRoom(host: HTMLElement): () => void {
  const state: State = readState(DEFAULTS);
  const cleanups: Array<() => void> = [];
  let alive = true;
  let busy = false;
  let traceSeq = 0;
  let selected: Trace | null = null;
  const turns: Turn[] = [];
  const liveSandboxes = new Set<Sandbox>();
  const on = (el: EventTarget, type: string, fn: (e: Event) => void) => {
    el.addEventListener(type, fn);
    cleanups.push(() => el.removeEventListener(type, fn));
  };
  const persist = () => writeState(state as unknown as Record<string, unknown>, DEFAULTS);

  const PREAMBLE: string = toolsToPreamble(TOOLS);

  host.innerHTML = `
  <div class="pg-toolcode">
    <div class="panel tc-intro">
      <div class="tc-intro-text">
        <h3>What's happening</h3>
        <p>The model on the left is a real <code>aimatey-core</code> <b>Bridge</b> talking to an in-page mock backend whose
        metadata says <code>tools: false</code>. It can't emit tool calls, so it answers with fenced code that calls
        <code>get_weather()</code>, <code>calc()</code> and <code>lookup_user()</code>. The real
        <code>createCodeExecutionMiddleware()</code> from <code>@johnhenry/aimatey-middleware-andbox</code> sits in the Bridge's
        chain: it extracts the blocks, rewrites Python habits, prepends tool stubs and runs everything in an
        <code>@johnhenry/andbox</code> Worker whose capabilities were wired with <code>toolsToCapabilities()</code> at
        <code>createSandbox()</code> time (andbox cannot add capabilities later). The trace shows every stage.</p>
      </div>
      <div class="tc-controls">
        <label class="tc-switch"><input type="checkbox" data-k="tools"><span class="tc-knob"></span><span>tool calling via code</span></label>
        <label class="field">timeout<select data-k="timeout">
          <option value="500">500ms</option><option value="2000">2s</option><option value="5000">5s</option></select></label>
        <label class="field">call budget / turn<select data-k="maxCalls">
          <option value="4">4 calls</option><option value="8">8 calls</option><option value="20">20 calls</option><option value="0">unlimited</option></select></label>
        <div class="tc-langs" data-el="langs" title="createCodeExecutionMiddleware({ codeLanguages }) — which fenced-block languages actually execute">
          <span class="stat">codeLanguages</span>
          ${LANG_GROUPS.map(g => `<button type="button" class="chip tc-lang" data-g="${g.key}">${esc(g.label)}</button>`).join('')}
        </div>
        <button class="btn" data-a="copy" title="Copy a deep link to this preset and settings">copy link</button>
      </div>
    </div>

    <div class="tc-presets" data-el="presets"></div>

    <div class="tc-main">
      <div class="panel tc-chat">
        <div class="tc-chat-head">
          <h3>Chat <span class="tc-model">mock-coder · tools:false</span></h3>
          <button class="btn tc-rerun" data-a="rerun"></button>
        </div>
        <div class="tc-transcript" data-el="transcript"></div>
        <form class="tc-input" data-el="form">
          <input data-el="input" placeholder="Ask something; the mock matches keywords (weather, admin, fahrenheit, humidity, until, every…)" autocomplete="off">
          <button class="btn primary" data-el="send">Send</button>
        </form>
        <div class="tc-tools">
          <div class="tc-tools-head">host tools <span class="stat">(run on the page, reached from the Worker by <code>host.call()</code>)</span></div>
          ${TOOLS.map(t => `<div class="tc-tool tc-h-${TOOL_HUE[t.name]}"><code>${t.name}(${Object.keys(t.parameters)[0]})</code><span>${esc(t.description)}</span></div>`).join('')}
        </div>
      </div>

      <div class="panel tc-trace-panel">
        <div class="tc-trace-head">
          <h3>Pipeline trace</h3>
          <div class="tc-rail" data-el="rail"></div>
        </div>
        <div class="tc-trace" data-el="trace"></div>
      </div>
    </div>
  </div>`;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector(sel) as T;
  const el = {
    tools: $<HTMLInputElement>('[data-k="tools"]'),
    timeout: $<HTMLSelectElement>('[data-k="timeout"]'),
    maxCalls: $<HTMLSelectElement>('[data-k="maxCalls"]'),
    copy: $<HTMLButtonElement>('[data-a="copy"]'),
    rerun: $<HTMLButtonElement>('[data-a="rerun"]'),
    presets: $('[data-el="presets"]'),
    transcript: $('[data-el="transcript"]'),
    form: $<HTMLFormElement>('[data-el="form"]'),
    input: $<HTMLInputElement>('[data-el="input"]'),
    send: $<HTMLButtonElement>('[data-el="send"]'),
    rail: $('[data-el="rail"]'),
    trace: $('[data-el="trace"]'),
    langs: $('[data-el="langs"]'),
  };

  el.tools.checked = state.tools;
  el.timeout.value = String(state.timeout);
  el.maxCalls.value = String(state.maxCalls);
  el.presets.innerHTML = SCRIPTS.map(s => `<button class="tc-preset" data-p="${s.id}" title="${esc(s.prompt)}"><b>${esc(s.label)}</b><span>${esc(s.prompt)}</span></button>`).join('');

  /** Which LANG_GROUPS keys are on, from the deep-linked/persisted pipe-joined state.langs. */
  function activeLangGroups(): Set<string> {
    const g = new Set(state.langs.split('|').filter(Boolean));
    return g.size ? g : new Set(LANG_GROUPS.map(x => x.key));
  }
  /** Flattened codeLanguages array for createCodeExecutionMiddleware({ codeLanguages }). */
  function activeCodeLangs(): string[] {
    const g = activeLangGroups();
    return LANG_GROUPS.filter(x => g.has(x.key)).flatMap(x => x.langs);
  }
  function renderLangChips() {
    const g = activeLangGroups();
    for (const b of el.langs.querySelectorAll<HTMLButtonElement>('.tc-lang')) {
      b.classList.toggle('on', g.has(b.dataset.g!));
    }
  }
  renderLangChips();

  function syncControls() {
    el.rerun.textContent = state.tools ? '↻ run again with tool calling off' : '↻ run again with tool calling on';
    el.rerun.disabled = busy || turns.length === 0;
    el.send.disabled = busy;
    for (const b of el.presets.querySelectorAll<HTMLButtonElement>('.tc-preset')) {
      b.classList.toggle('on', b.dataset.p === state.preset && !state.q);
      b.disabled = busy;
    }
  }

  /* ------------------------------------------------------------ transcript */

  function renderTranscript() {
    if (!turns.length) { el.transcript.innerHTML = '<div class="tc-empty">Pick a preset above or type a message.</div>'; return; }
    el.transcript.innerHTML = turns.map((t, i) => {
      const tr = t.trace;
      let body: string;
      if (tr.error) body = `<div class="tc-err">${esc(tr.error)}</div>`;
      else if (tr.stage < 5) body = `<div class="tc-typing"><i></i><i></i><i></i> ${['thinking', 'model replied', 'extracting', 'adapting', 'running in sandbox'][Math.min(tr.stage, 4)]}…</div>`;
      else if (!tr.toolsOn || !tr.carrier?._codeResults) body = renderProse(tr.raw ?? '');
      else {
        const res = tr.carrier._codeResults;
        const bad = res.filter(r => r.error).length;
        const calls = tr.runs.reduce((a, r) => a + r.tools.length, 0);
        body = `<div class="tc-ran ${bad ? 'bad' : 'ok'}">ran ${res.length} block${res.length > 1 ? 's' : ''} · ${calls} tool call${calls === 1 ? '' : 's'}${bad ? ` · ${bad} failed` : ''}</div>${renderProse(tr.followup ?? '')}`;
      }
      const sel = selected === tr ? ' sel' : '';
      return `<div class="tc-msg user">${esc(t.user)}</div>
        <div class="tc-msg bot${sel}" data-turn="${i}" title="Show this turn's trace">
          <div class="tc-msg-tag">${tr.toolsOn ? 'code tools on' : 'code tools off'} <span>trace #${tr.id}</span></div>${body}</div>`;
    }).join('');
    el.transcript.scrollTop = el.transcript.scrollHeight;
  }

  /** Prose with fenced blocks rendered as code. */
  function renderProse(text: string): string {
    const parts: string[] = [];
    let last = 0;
    const re = /```(\w*)\s*\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push(`<p>${esc(text.slice(last, m.index).trim())}</p>`);
      parts.push(`<pre class="tc-inline-code"><span class="tc-lang">${esc(m[1] || 'text')}</span>${esc(m[2].trimEnd())}</pre>`);
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(`<p>${esc(text.slice(last).trim())}</p>`);
    return parts.filter(p => p !== '<p></p>').join('');
  }

  /* ------------------------------------------------------------ trace rendering */

  const STAGES = ['raw reply', 'extract', 'adapt', 'sandbox', 'final'];

  function renderRail(tr: Trace | null) {
    el.rail.innerHTML = STAGES.map((s, i) => {
      let cls = '';
      if (tr) {
        const skipped = !tr.toolsOn && i >= 1 && i <= 3;
        if (skipped) cls = 'skip';
        else if (tr.stage > i + 1 || tr.stage === 5) cls = 'done';
        else if (tr.stage === i + 1 || (tr.stage === 0 && i === 0)) cls = 'live';
        if (i === 3 && tr.runs.some(r => r.error)) cls += ' bad';
      }
      return `<span class="tc-rail-step ${cls}"><b>${i + 1}</b>${s}</span>`;
    }).join('<span class="tc-rail-arrow">→</span>');
  }

  function stageCard(n: number, title: string, meta: string, body: string, state: 'done' | 'live' | 'wait' | 'skip' | 'bad') {
    return `<section class="tc-stage ${state}"><header><span class="tc-num">${n}</span><h4>${title}</h4><span class="tc-meta">${meta}</span></header><div class="tc-stage-body">${body}</div></section>`;
  }

  function renderRaw(tr: Trace): string {
    const text = tr.raw ?? '';
    const parts: string[] = [];
    const re = /```(\w*)\s*\n([\s\S]*?)```/g;
    let last = 0, idx = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push(`<span class="tc-prose">${esc(text.slice(last, m.index))}</span>`);
      const lang = m[1].toLowerCase();
      const runs = tr.toolsOn && (tr.langs ?? EXEC_LANGS).has(lang);
      parts.push(`<span class="tc-fence ${runs ? 'run' : ''}"><span class="tc-fence-tag">block ${++idx} · ${esc(lang || 'bare')} · ${runs ? 'executable' : tr.toolsOn ? 'ignored' : 'middleware off'}</span>${esc(m[0])}</span>`);
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(`<span class="tc-prose">${esc(text.slice(last))}</span>`);
    return `<pre class="tc-raw">${parts.join('')}</pre>`;
  }

  function renderBlocks(tr: Trace): string {
    const blocks = tr.blocks ?? [];
    if (!blocks.length) return '<div class="tc-note">No fenced blocks; the middleware returns the response untouched.</div>';
    return `<div class="tc-note"><code>extractCodeBlocks(text)</code> → ${blocks.length} block${blocks.length > 1 ? 's' : ''}; this turn's <code>codeLanguages</code> option kept <code>${[...(tr.langs ?? EXEC_LANGS)].map(l => l || "''").join(' ')}</code></div>
      <div class="tc-blocks">${blocks.map((b, i) => `
        <div class="tc-block ${tr.executable?.[i] ? '' : 'off'}">
          <div class="tc-block-head"><span class="chip">${esc(b.lang || "''")}</span> block ${i + 1}
            <span class="tc-pill">${tr.executable?.[i] ? (PY_LANGS.has(b.lang) ? 'adaptPythonisms + autoAwait' : 'autoAwait only') : 'skipped'}</span></div>
          <pre>${esc(b.code)}</pre>
        </div>`).join('')}</div>`;
  }

  function renderAdapted(tr: Trace): string {
    const blocks = tr.blocks ?? [];
    const out: string[] = [];
    let totalRewrites = 0;
    blocks.forEach((b, bi) => {
      if (!tr.executable?.[bi]) return;
      const adapted = tr.adapted?.[bi] ?? b.code;
      const py = PY_LANGS.has(b.lang);
      const oL = b.code.split('\n'), aL = adapted.split('\n');
      const rows: string[] = [];
      const n = Math.max(oL.length, aL.length);
      for (let i = 0; i < n; i++) {
        const o = oL[i] ?? '', a = aL[i] ?? '';
        if (o === a) { rows.push(`<div class="tc-dl same"><span class="tc-ln">${i + 1}</span><code>${esc(o) || ' '}</code></div>`); continue; }
        const d = diffTokens(o, a);
        const minus = d.filter(x => x[0] !== '+').map(([op, t]) => (op === '-' ? `<del>${esc(t)}</del>` : esc(t))).join('');
        const plus = d.filter(x => x[0] !== '-').map(([op, t]) => (op === '+' ? `<ins>${esc(t)}</ins>` : esc(t))).join('');
        const tags = rewriteTags(o, a, py);
        totalRewrites += tags.filter(t => !t.warn).length;
        rows.push(`<div class="tc-dl minus"><span class="tc-ln">-</span><code>${minus}</code></div>
          <div class="tc-dl plus"><span class="tc-ln">+</span><code>${plus}</code><span class="tc-tags">${tags.map(t => `<span class="tc-tag ${t.warn ? 'warn' : ''}">${esc(t.text)}</span>`).join('')}</span></div>`);
      }
      // leftover-brace warnings on unchanged lines too (e.g. f-strings that still hold {x} after rewrite)
      const run = tr.runs.find(r => r.index === bi);
      const sent = run ? run.fullCode === PREAMBLE + '\n' + adapted : null;
      out.push(`<div class="tc-diff">
        <div class="tc-block-head"><span class="chip">${esc(b.lang || "''")}</span> block ${bi + 1} ${py ? '' : '<span class="tc-pill">JS lang: Python-isms left alone</span>'}
          ${sent === null ? '' : `<span class="tc-pill ${sent ? 'ok' : 'bad'}">${sent ? '✓ identical to what the middleware sent' : '≠ differs from what the middleware sent'}</span>`}</div>
        <div class="tc-diff-body">${rows.join('')}</div>
      </div>`);
    });
    return `<div class="tc-note">${totalRewrites} rewrite${totalRewrites === 1 ? '' : 's'} by the exported <code>adaptPythonisms()</code> / <code>autoAwait()</code>, the same functions the middleware calls. Then <code>toolsToPreamble(tools)</code> is prepended:</div>
      <details class="tc-preamble"><summary>preamble · ${PREAMBLE.split('\n').length} lines of tool stubs + <code>print()</code></summary><pre>${esc(PREAMBLE)}</pre></details>
      ${out.join('')}`;
  }

  function renderRuns(tr: Trace): string {
    const out: string[] = [];
    const g = tr.gate;
    for (const r of tr.runs) {
      const total = Math.max(r.ms ?? now() - r.t0, 1);
      const segs = r.tools.map(t => {
        const left = (t.t / total) * 100, w = Math.max(((t.ms ?? total - t.t) / total) * 100, 0.8);
        return `<span class="tc-seg tc-h-${TOOL_HUE[t.name] ?? 'x'} ${t.error ? 'bad' : ''}" style="left:${left}%;width:${w}%" title="${esc(t.name)}(${esc(short(t.args, 40))}) ${t.ms ? fmtMs(t.ms) : '…'}"></span>`;
      }).join('');
      const ticks = r.console.map(c => `<span class="tc-tick" style="left:${(c.t / total) * 100}%" title="${esc(c.text)}"></span>`).join('');
      const events = [
        ...r.tools.map(t => ({ t: t.t, html: `<div class="tc-ev tool ${t.error ? 'bad' : ''}"><span class="tc-at">+${fmtMs(t.t)}</span><span class="tc-dot tc-h-${TOOL_HUE[t.name] ?? 'x'}"></span><code>${esc(t.name)}(${esc(short(t.args, 50))})</code><span class="tc-arrow">${t.error ? '✗' : '→'}</span><code class="tc-res">${t.error ? esc(t.error) : t.ms === undefined ? '…' : esc(short(t.result, 80))}</code><span class="tc-dur">${t.ms !== undefined ? fmtMs(t.ms) : ''}</span></div>` })),
        ...r.console.map(c => ({ t: c.t, html: `<div class="tc-ev con"><span class="tc-at">+${fmtMs(c.t)}</span><span class="tc-dot con"></span><code>${esc(c.text)}</code></div>` })),
      ].sort((a, b) => a.t - b.t).map(e => e.html).join('');
      const status = r.ms === undefined ? '<span class="tc-pill live">running…</span>'
        : r.error ? `<span class="tc-pill bad">${r.kind}</span>` : '<span class="tc-pill ok">ok</span>';
      // Fixed: createCodeExecutionMiddleware() used to discard console output
      // printed before a block threw, reporting only the error. It now keeps
      // it — both in this block's _codeResults.output and folded into
      // _resultSummary/_toolCalls — so partial output survives as debugging signal.
      const lostConsole = r.error && r.console.length ? `<div class="tc-note">${r.console.length} console line${r.console.length > 1 ? 's' : ''} printed before the failure; the middleware keeps them alongside the error (in the result's output and the summary sent back to the model).</div>` : '';
      out.push(`<div class="tc-run">
        <div class="tc-block-head">block ${r.index + 1} ${status}<span class="tc-meta">${r.ms !== undefined ? fmtMs(r.ms) : ''} · ${r.tools.length} tool call${r.tools.length === 1 ? '' : 's'} · ${r.console.length} console</span></div>
        <div class="tc-timeline">${segs}${ticks}${r.ms !== undefined ? `<span class="tc-end ${r.error ? 'bad' : ''}"></span>` : '<span class="tc-cursor"></span>'}</div>
        <div class="tc-events">${events || '<div class="tc-ev dim">no tool calls or console output yet</div>'}</div>
        ${r.error ? `<div class="tc-err"><b>${esc(r.errorName ?? 'Error')}</b>: ${esc(r.error)}${r.kind === 'timeout' ? ' (worker terminated by andbox after ' + tr.timeoutMs + 'ms)' : r.kind === 'rate-limit' ? ' (capability gate: policy.limits.maxCalls = ' + tr.maxCalls + ')' : ''}</div>`
          : r.ms !== undefined ? `<div class="tc-ret">${r.console.length ? 'console output becomes the result' : `no console output, so the return value is used: <code>${esc(short(r.ret, 160))}</code>`}</div>` : ''}
        ${lostConsole}
      </div>`);
    }
    const gateHtml = g ? `<div class="tc-gate">
        <span class="stat">gate: <b>${g.totalCalls}</b>${tr.maxCalls ? ' / ' + tr.maxCalls : ''} calls</span>
        ${Object.entries(g.perCapability).map(([k, v]) => `<span class="tc-gate-cap tc-h-${TOOL_HUE[k] ?? 'x'}">${esc(k)} ×${v.calls} · ${v.argBytes}B</span>`).join('')}
        ${tr.maxCalls ? `<span class="tc-budget"><i style="width:${Math.min(100, (g.totalCalls / tr.maxCalls) * 100)}%"></i></span>` : ''}
      </div>` : '';
    return `<div class="tc-note">A fresh andbox Worker per turn (${tr.sandboxMs !== undefined ? fmtMs(tr.sandboxMs) : '…'} to create) with capabilities from <code>toolsToCapabilities()</code>, <code>policy.limits.maxCalls = ${tr.maxCalls || '∞'}</code>, <code>timeoutMs = ${tr.timeoutMs}</code>. Bars are tool calls on a per-block timeline; ticks are console lines.</div>${gateHtml}${out.join('') || '<div class="tc-note">waiting for the first block…</div>'}`;
  }

  function renderFinal(tr: Trace): string {
    if (!tr.toolsOn) {
      return `<div class="tc-note">Tool calling is off, so the Bridge's chain has no code middleware and the user gets the model's plain reply, code and all:</div>${renderRaw(tr)}`;
    }
    const c = tr.carrier;
    if (!c?._codeResults) return '<div class="tc-note">No executable blocks, so the reply passes through unchanged.</div>';
    // The middleware built _resultSummary/_toolCalls by calling formatResults()/resultsToToolCalls()
    // internally; recompute them here with the same exported functions to show that's really all
    // it did — no hidden extra formatting.
    const recomputedSummary = formatResults(c._codeResults, 1200);
    const recomputedCalls = resultsToToolCalls(c._codeResults);
    const summaryMatches = recomputedSummary === (c._resultSummary ?? '');
    const callsMatch = recomputedCalls.length === (c._toolCalls?.length ?? 0)
      && recomputedCalls.every((rc, i) => c._toolCalls?.[i]?._result.success === rc._result.success && c._toolCalls?.[i]?._result.output === rc._result.output);
    return `<div class="tc-final-grid">
      <div>
        <div class="tc-sub">folded reply · <code>_cleanText</code> + <code>_resultSummary</code></div>
        <pre class="tc-folded"><span class="tc-prose">${esc(c._cleanText ?? '')}</span>\n\n<span class="tc-summary">${esc(c._resultSummary ?? '')}</span></pre>
        <div class="tc-note"><span class="tc-pill ${summaryMatches && callsMatch ? 'ok' : 'bad'}">${summaryMatches && callsMatch ? '✓' : '≠'} matches <code>formatResults()</code> + <code>resultsToToolCalls()</code> called directly on <code>_codeResults</code></span> — that's the whole of what <code>_resultSummary</code>/<code>_toolCalls</code> are.</div>
        <div class="tc-sub"><code>_toolCalls</code> · ${c._toolCalls?.length ?? 0} synthetic <code>_code_exec</code> entr${(c._toolCalls?.length ?? 0) === 1 ? 'y' : 'ies'}</div>
        <pre class="tc-json">${esc(JSON.stringify(c._toolCalls?.map(t => ({ name: t.name, success: t._result.success, output: t._result.output.slice(0, 60) || undefined, error: t._result.error })), null, 1))}</pre>
      </div>
      <div>
        <div class="tc-sub">fed back as the next user turn</div>
        <pre class="tc-json">[tool results]\n${esc(c._resultSummary ?? '')}</pre>
        <div class="tc-sub">model's follow-up ${tr.followupMs !== undefined ? '· ' + fmtMs(tr.followupMs) : ''}</div>
        <div class="tc-followup">${tr.followup ? esc(tr.followup) : '<span class="tc-typing"><i></i><i></i><i></i></span>'}</div>
      </div>
    </div>`;
  }

  function renderTrace() {
    const tr = selected;
    renderRail(tr);
    if (!tr) { el.trace.innerHTML = '<div class="tc-empty">No trace yet.</div>'; return; }
    const st = (i: number): 'done' | 'live' | 'wait' | 'skip' | 'bad' => {
      if (!tr.toolsOn && i >= 2 && i <= 4) return 'skip';
      if (i === 4 && tr.runs.some(r => r.error) && tr.stage >= 4) return 'bad';
      if (tr.stage >= i + (i === 5 ? 0 : 1)) return 'done';
      return tr.stage === i || (i === 1 && tr.stage === 0) ? 'live' : 'wait';
    };
    const skipBody = '<div class="tc-note">skipped: the code middleware is not in the chain</div>';
    const cards: string[] = [];
    cards.push(stageCard(1, 'Raw LLM reply', tr.llmMs !== undefined ? `mock-coder · ${fmtMs(tr.llmMs)}` : 'waiting for the model…',
      tr.raw !== undefined ? renderRaw(tr) : '<div class="tc-typing"><i></i><i></i><i></i></div>', st(1)));
    cards.push(stageCard(2, 'Extracted fenced blocks', tr.blocks ? `${tr.blocks.length} found · ${tr.executable?.filter(Boolean).length ?? 0} executable` : '',
      !tr.toolsOn ? skipBody : tr.blocks ? renderBlocks(tr) : '', st(2)));
    cards.push(stageCard(3, 'Adapted JavaScript', 'original vs adapted, token diff',
      !tr.toolsOn ? skipBody : tr.adapted ? renderAdapted(tr) : '', st(3)));
    cards.push(stageCard(4, 'Sandbox execution', tr.execMs !== undefined ? `${fmtMs(tr.execMs)} total` : tr.runs.length ? 'running…' : '',
      !tr.toolsOn ? skipBody : tr.stage >= 3 ? renderRuns(tr) : '', st(4)));
    cards.push(stageCard(5, 'Final reply', tr.toolsOn ? 'results folded in' : 'plain reply',
      tr.error ? `<div class="tc-err">${esc(tr.error)}</div>` : tr.stage >= 4 || !tr.toolsOn && tr.raw !== undefined ? renderFinal(tr) : '', st(5)));
    const openDetails = [...el.trace.querySelectorAll('details')].map(d => d.open);
    el.trace.innerHTML = cards.join('');
    el.trace.querySelectorAll('details').forEach((d, i) => { if (openDetails[i]) d.open = true; });
  }

  let rafPending = 0;
  function refresh() {
    if (!alive || rafPending) return;
    rafPending = window.setTimeout(() => { rafPending = 0; if (!alive) return; renderTrace(); renderTranscript(); syncControls(); }, 16);
  }
  cleanups.push(() => clearTimeout(rafPending));

  /* ------------------------------------------------------------ one turn through the real pipeline */

  async function runTurn(text: string): Promise<void> {
    if (busy || !alive) return;
    busy = true;
    const tr: Trace = { id: ++traceSeq, user: text, toolsOn: state.tools, timeoutMs: state.timeout, maxCalls: state.maxCalls, stage: 0, runs: [], langs: new Set(activeCodeLangs()) };
    turns.push({ user: text, trace: tr });
    selected = tr;
    refresh();

    // A boxed ref rather than a bare `let`: the only write happens inside the async
    // createSandbox factory below, and TS's control-flow narrowing of a captured `let`
    // across that closure boundary was collapsing the read in `finally` to `never`.
    const sandboxRef: { current: Sandbox | null } = { current: null };
    let current: BlockRun | null = null;
    let phase: 'first' | 'followup' = 'first';

    // Every host tool call from the Worker lands here (via the capability gate).
    const executeToolFn = async (name: string, params: unknown): Promise<unknown> => {
      const run = current;
      const ev: ToolEvent = { t: run ? now() - run.t0 : 0, name, args: params };
      run?.tools.push(ev);
      refresh();
      const t = now();
      try {
        ev.result = await runHostTool(name, params);
        return ev.result;
      } catch (e) {
        ev.error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        ev.ms = now() - t;
        refresh();
      }
    };

    try {
      const tBuild = now();
      const bridge = createBridge(createGenericFrontend({ name: 'toolcode-frontend' }), new MockCoderBackend());

      if (tr.toolsOn) {
        // A thin observer around a real sandbox: records the exact code the middleware sends,
        // per-block timing and console lines, then delegates untouched.
        function observe(real: Sandbox) {
          return {
            evaluate: async (code: string, opts: EvalOpts = {}) => {
              const run: BlockRun = { index: tr.runs.length, fullCode: code, t0: now(), tools: [], console: [] };
              // map to the executable block index
              const execIdx = (tr.executable ?? []).map((x, i) => (x ? i : -1)).filter(i => i >= 0);
              run.index = execIdx[tr.runs.length] ?? tr.runs.length;
              tr.runs.push(run);
              current = run;
              tr.stage = Math.max(tr.stage, 4);
              refresh();
              const passOn = opts.onConsole;
              try {
                run.ret = await real.evaluate(code, {
                  ...opts,
                  onConsole: (level: string, ...args: string[]) => {
                    run.console.push({ t: now() - run.t0, level, text: args.join(' ') });
                    passOn?.(level, ...args);
                    refresh();
                  },
                });
                return run.ret;
              } catch (e) {
                const err = e as { name?: string; message?: string };
                run.error = err.message ?? String(e);
                run.errorName = err.name;
                run.kind = classify(err);
                throw e;
              } finally {
                run.ms = now() - run.t0;
                current = null;
                tr.gate = real.stats().gate;
                refresh();
              }
            },
            dispose: () => real.dispose(),
            stats: () => real.stats(),
          };
        }

        // Rather than pre-building the sandbox ourselves (the option used before), hand the
        // middleware its own `createSandbox` factory + `sandboxOptions`: andbox only accepts
        // capabilities at creation time, so the middleware builds toolsToCapabilities(tools,
        // executeToolFn) itself, merges it with sandboxOptions.capabilities (none here) and
        // calls this factory with the merged options — we just wrap whatever it builds.
        const codeExec = createCodeExecutionMiddleware({
          createSandbox: async (opts: Record<string, unknown> = {}) => {
            const real: Sandbox = await createSandbox(opts as SandboxOptions);
            liveSandboxes.add(real);
            sandboxRef.current = real;
            tr.sandboxMs = now() - tBuild;
            return observe(real);
          },
          sandboxOptions: { defaultTimeoutMs: tr.timeoutMs, policy: { limits: { maxCalls: tr.maxCalls } } },
          tools: TOOLS,
          executeToolFn,
          timeoutMs: tr.timeoutMs,
          maxResultLength: 1200,
          codeLanguages: [...(tr.langs ?? EXEC_LANGS)],
        }) as CodeExecMiddleware;

        // aimatey-core's Bridge takes (context, next) middleware; this package exports an
        // object with an `after(response)` hook that reads `response.content`. Bridge it:
        const adapter: Middleware = async (_ctx, next) => {
          const res = await next();
          if (phase !== 'first') return res;
          const raw = textOf(res.message);
          tr.raw = raw;
          tr.llmMs = now() - tLLM;
          tr.stage = 1;
          // What the middleware is about to do, recomputed with its own exported helpers for display.
          tr.blocks = extractCodeBlocks(raw) as Block[];
          tr.executable = tr.blocks.map(b => (tr.langs ?? EXEC_LANGS).has(b.lang));
          tr.stage = 2;
          tr.adapted = tr.blocks.map(b => autoAwait(PY_LANGS.has(b.lang) ? adaptPythonisms(b.code) : b.code));
          tr.stage = 3;
          refresh();
          await delay(160); // let the first stages paint before the Worker starts
          const carrier: Carrier = { content: raw };
          const tExec = now();
          await codeExec.after(carrier);
          tr.execMs = now() - tExec;
          tr.carrier = carrier;
          tr.stage = 4;
          refresh();
          if (!carrier._codeResults) return res;
          const folded = `${carrier._cleanText ?? ''}\n\n${carrier._resultSummary ?? ''}`.trim();
          return { ...res, message: { ...res.message, content: folded } };
        };
        bridge.use(adapter, { name: 'andbox-code-exec' });
      }

      const tLLM = now();
      const resp = await bridge.chat({
        messages: [{ role: 'user', content: text }],
        parameters: { model: 'mock-coder', maxTokens: 400 },
        metadata: { requestId: `tc_${tr.id}_a`, timestamp: Date.now(), provenance: {} },
      } as never) as unknown as IRChatResponse;

      if (!tr.toolsOn) {
        tr.raw = textOf(resp.message);
        tr.llmMs = now() - tLLM;
        tr.final = tr.raw;
        tr.stage = 5;
        refresh();
      } else if (tr.carrier?._codeResults) {
        tr.final = textOf(resp.message);
        refresh();
        // Second turn: hand the result summary back to the same Bridge, as an agent loop would.
        phase = 'followup';
        const tF = now();
        const r2 = await bridge.chat({
          messages: [
            { role: 'user', content: text },
            { role: 'assistant', content: tr.raw ?? '' },
            { role: 'user', content: `[tool results]\n${tr.carrier._resultSummary ?? ''}` },
          ],
          parameters: { model: 'mock-coder', maxTokens: 400 },
          metadata: { requestId: `tc_${tr.id}_b`, timestamp: Date.now(), provenance: {} },
        } as never) as unknown as IRChatResponse;
        tr.followup = textOf(r2.message);
        tr.followupMs = now() - tF;
        tr.stage = 5;
      } else {
        tr.final = textOf(resp.message);
        tr.stage = 5;
      }
    } catch (e) {
      tr.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      tr.stage = 5;
    } finally {
      const finalSandbox = sandboxRef.current;
      if (finalSandbox) { liveSandboxes.delete(finalSandbox); void finalSandbox.dispose().catch(() => {}); }
      busy = false;
      refresh();
    }
  }

  /* ------------------------------------------------------------ wiring */

  function runPreset(id: string) {
    const s = SCRIPTS.find(x => x.id === id);
    if (!s || busy) return;
    state.preset = id; state.q = '';
    persist();
    void runTurn(s.prompt);
  }

  on(el.presets, 'click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.tc-preset');
    if (b?.dataset.p) runPreset(b.dataset.p);
  });
  on(el.form, 'submit', (e) => {
    e.preventDefault();
    const text = el.input.value.trim();
    if (!text || busy) return;
    el.input.value = '';
    const s = SCRIPTS.find(x => x.prompt.toLowerCase() === text.toLowerCase());
    if (s) { state.preset = s.id; state.q = ''; } else state.q = text;
    persist();
    void runTurn(text);
  });
  on(el.rerun, 'click', () => {
    const last = turns[turns.length - 1];
    if (!last || busy) return;
    state.tools = !state.tools;
    el.tools.checked = state.tools;
    persist();
    void runTurn(last.user);
  });
  on(el.tools, 'change', () => { state.tools = el.tools.checked; persist(); syncControls(); });
  on(el.timeout, 'change', () => { state.timeout = Number(el.timeout.value); persist(); });
  on(el.maxCalls, 'change', () => { state.maxCalls = Number(el.maxCalls.value); persist(); });
  on(el.langs, 'click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.tc-lang');
    if (!b?.dataset.g) return;
    const g = activeLangGroups();
    if (g.has(b.dataset.g)) { if (g.size <= 1) return; g.delete(b.dataset.g); } else g.add(b.dataset.g);
    state.langs = LANG_GROUPS.filter(x => g.has(x.key)).map(x => x.key).join('|');
    persist();
    renderLangChips();
  });
  on(el.copy, 'click', () => {
    void copyLink().then(() => { el.copy.textContent = 'copied ✓'; const t = setTimeout(() => { el.copy.textContent = 'copy link'; }, 1400); cleanups.push(() => clearTimeout(t)); });
  });
  on(el.transcript, 'click', (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>('.tc-msg.bot');
    if (!m?.dataset.turn) return;
    selected = turns[Number(m.dataset.turn)]?.trace ?? selected;
    refresh();
  });

  renderTranscript();
  renderTrace();
  syncControls();

  // zero-input default: run the deep-linked message or preset straight away
  const first = state.q || (SCRIPTS.find(s => s.id === state.preset) ?? SCRIPTS[0]).prompt;
  void runTurn(first);

  return () => {
    alive = false;
    for (const c of cleanups) c();
    for (const s of liveSandboxes) void s.dispose().catch(() => {});
    liveSandboxes.clear();
  };
}

const playground: Playground = {
  id: 'toolcode',
  title: 'Tool by Code',
  pkg: '@johnhenry/aimatey-middleware-andbox',
  hue: 335,
  blurb: 'An LLM with no tool calling writes code instead; the middleware extracts, adapts and runs it in a sandbox.',
  docs: 'https://opensource.johnhenry.me/aimatey-middleware-andbox/',
  mount(host) {
    try {
      return mountRoom(host);
    } catch (e) {
      host.innerHTML = `<pre class="code">${esc(e instanceof Error ? e.stack ?? e.message : String(e))}</pre>`;
      return () => {};
    }
  },
};
export default playground;
