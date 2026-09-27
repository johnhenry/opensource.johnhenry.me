import type { Playground } from '../registry';
import * as HTTPFields from '@johnhenry/http-fields';
import type { FieldType, Item, Dictionary, List } from '@johnhenry/http-fields';
import { receive, handoffBanner } from '../bus';
import { readState, writeState, copyLink } from '../state';
import './fields.css';

/**
 * Header Fields — a live RFC 8941 / RFC 9651 Structured Field Values lab.
 *
 * Every parse and serialize call below goes straight through the real
 * `@johnhenry/http-fields` exports (`parse`, `serialize`) — nothing here
 * reimplements the grammar.
 */

export type FType = 'item' | 'list' | 'dictionary';

// The lib's `serialize`/`parse` are declared as overloads keyed on a literal
// fieldType; once that type is only known at runtime (a union variable) TS
// can't pick an overload, so these two thin wrappers do the runtime dispatch.
function parseAny(value: string, type: FType): unknown {
  return (HTTPFields.parse as (v: string, t: FieldType) => unknown)(value, type);
}
function serializeAny(data: unknown, type: FType): string {
  return (HTTPFields.serialize as (d: unknown, t: FieldType) => string)(data, type);
}

interface Preset {
  name: string;
  header: string;
  value: string;
  type: FType | 'auto';
  note: string;
}

const PRESETS: Preset[] = [
  {
    name: 'Priority',
    header: 'priority',
    value: 'u=1, i',
    type: 'dictionary',
    note: 'RFC 9218. A Dictionary: u is client Urgency (Integer 0–7, default 3), i is a bare Boolean incremental flag.',
  },
  {
    name: 'Cache-Status',
    header: 'cache-status',
    value: 'OriginCache; fwd=stale; fwd-status=304, CDN; hit; ttl=545',
    type: 'list',
    note: 'RFC 9211. A List — one item per cache that touched the response — each a Token with Boolean/Token/Integer parameters.',
  },
  {
    name: 'Accept-CH',
    header: 'accept-ch',
    value: 'Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Model',
    type: 'list',
    note: 'RFC 8942. A List of bare Tokens naming the Client Hints the server wants echoed on future requests.',
  },
  {
    name: 'Sec-CH-UA',
    header: 'sec-ch-ua',
    value: '"Chromium";v="128", "Not(A:Brand";v="24", "Google Chrome";v="128"',
    type: 'list',
    note: 'UA Client Hints. Brands are Strings, not Tokens — brand names can contain punctuation a Token grammar forbids.',
  },
  {
    name: 'Signature-Input',
    header: 'signature-input',
    value: 'sig1=("@method" "@authority" "content-digest");created=1618884473;keyid="test-key-rsa-pss";alg="rsa-pss-sha512"',
    type: 'dictionary',
    note: 'RFC 9421. A Dictionary whose value is an Inner List of covered components, itself carrying Integer/String parameters.',
  },
  {
    name: 'Client Hint (Sec-CH-UA-Platform)',
    header: 'sec-ch-ua-platform',
    value: '"macOS"',
    type: 'item',
    note: 'A single resolved Client Hint: an Item whose bare value is a String.',
  },
  {
    name: 'Feature groups (Dictionary + Inner Lists)',
    header: 'x-feature-groups',
    value: 'ui=(dark-mode beta-banner);version=2, api=(v2 v3)',
    type: 'dictionary',
    note: 'A Dictionary whose values are parenthesised Inner Lists of Tokens — two structural levels in one field.',
  },
  {
    name: 'Date example (RFC 9651)',
    header: 'x-cache-expiry',
    value: '@1767225599',
    type: 'item',
    note: 'RFC 9651 adds Date: a Unix timestamp after "@". Timestamps outside the JS Date range still round-trip via `seconds`.',
  },
  {
    name: 'Display String example (RFC 9651)',
    header: 'x-greeting',
    value: '%"Caffè Bene, 東京へようこそ"',
    type: 'item',
    note: 'RFC 9651 adds Display String: Unicode text, percent-encoded as UTF-8 on the wire, decoded back to a JS string on parse.',
  },
];

/** Scan top-level (outside quotes/binary/inner-lists) for "=" and "," to steer auto-detect order. */
function scanTopLevel(s: string): { hasEquals: boolean; hasComma: boolean } {
  let inQuote = false;
  let inBinary = false;
  let depth = 0;
  let hasEquals = false;
  let hasComma = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inQuote = false;
      continue;
    }
    if (inBinary) {
      if (c === ':') inBinary = false;
      continue;
    }
    if (c === '"') { inQuote = true; continue; }
    if (c === ':') { inBinary = true; continue; }
    if (c === '(') { depth++; continue; }
    if (c === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    if (c === '=') hasEquals = true;
    if (c === ',') hasComma = true;
  }
  return { hasEquals, hasComma };
}

export type ParseAttempt =
  | { ok: true; type: FType; parsed: unknown }
  | { ok: false; type: FType; error: unknown };

/**
 * Try the chosen type, or cascade through a heuristic order when "auto".
 * Exported so other planets (the HTTP Converter's structured-headers panel)
 * can run the same Item/List/Dictionary cascade this planet uses.
 */
export function attemptParse(value: string, chosen: FType | 'auto'): ParseAttempt {
  if (chosen !== 'auto') {
    try {
      return { ok: true, type: chosen, parsed: parseAny(value, chosen) };
    } catch (error) {
      return { ok: false, type: chosen, error };
    }
  }
  const { hasEquals, hasComma } = scanTopLevel(value);
  const order: FType[] = hasEquals
    ? ['dictionary', 'list', 'item']
    : hasComma
      ? ['list', 'dictionary', 'item']
      : ['item', 'list', 'dictionary'];
  let first: { type: FType; error: unknown } | null = null;
  for (const t of order) {
    try {
      return { ok: true, type: t, parsed: parseAny(value, t) };
    } catch (error) {
      if (!first) first = { type: t, error };
    }
  }
  return { ok: false, type: first!.type, error: first!.error };
}

/** Largest prefix of `value` that parses cleanly as `type` — an approximate error offset. */
function findErrorOffset(value: string, type: FType): number {
  for (let n = value.length - 1; n >= 0; n--) {
    try {
      parseAny(value.slice(0, n), type);
      return n;
    } catch {
      // keep shrinking
    }
  }
  return 0;
}

export function bareType(v: unknown): string {
  if (Array.isArray(v)) return 'innerlist';
  if (v && typeof v === 'object' && 'type' in (v as Record<string, unknown>)) {
    return String((v as { type: unknown }).type);
  }
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'decimal';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'string') return 'string';
  return 'unknown';
}

export const TYPE_LABEL: Record<string, string> = {
  integer: 'Integer',
  decimal: 'Decimal',
  string: 'String',
  token: 'Token',
  binary: 'Byte Sequence',
  boolean: 'Boolean',
  date: 'Date',
  displaystring: 'Display String',
  innerlist: 'Inner List',
  unknown: '?',
};

function numToDecimalStr(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

export function formatBareValue(v: unknown): string {
  const t = bareType(v);
  switch (t) {
    case 'integer':
      return String(v);
    case 'decimal':
      return numToDecimalStr(typeof v === 'object' ? (v as { value: number }).value : (v as number));
    case 'boolean':
      return v ? '?1' : '?0';
    case 'string':
      return JSON.stringify(v);
    case 'token':
      return (v as { value: string }).value;
    case 'binary': {
      const b = v as { value: string; decoded?: string };
      return `:${b.value}:${b.decoded !== undefined ? ` → "${b.decoded}"` : ''}`;
    }
    case 'date': {
      const d = v as { value: Date; seconds?: number };
      const secs = d.seconds ?? Math.floor(d.value.getTime() / 1000);
      const iso = Number.isNaN(d.value.getTime()) ? 'outside JS Date range' : d.value.toISOString();
      return `@${secs} (${iso})`;
    }
    case 'displaystring':
      return `%"${(v as { value: string }).value}"`;
    default:
      return String(v);
  }
}

export interface AnyItem { value: unknown; parameters: Record<string, unknown> }

function renderItemNode(item: AnyItem, label: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'fld-node';

  const head = document.createElement('div');
  head.className = 'fld-node-head';

  const lbl = document.createElement('span');
  lbl.className = 'fld-node-label mono';
  lbl.textContent = label;
  head.appendChild(lbl);

  const isInner = Array.isArray(item.value);
  const t = bareType(item.value);
  const badge = document.createElement('span');
  badge.className = `fld-badge bd-${t}`;
  badge.textContent = TYPE_LABEL[t] ?? t;
  head.appendChild(badge);

  if (!isInner) {
    const val = document.createElement('span');
    val.className = 'fld-node-value mono';
    val.textContent = formatBareValue(item.value);
    head.appendChild(val);
  }
  wrap.appendChild(head);

  const paramKeys = Object.keys(item.parameters ?? {});
  if (paramKeys.length) {
    const params = document.createElement('div');
    params.className = 'fld-params';
    for (const k of paramKeys) {
      const pv = item.parameters[k];
      const pill = document.createElement('span');
      pill.className = `fld-pill bd-${bareType(pv)}`;
      pill.textContent = `;${k}=${formatBareValue(pv)}`;
      params.appendChild(pill);
    }
    wrap.appendChild(params);
  }

  if (isInner) {
    const inner = document.createElement('div');
    inner.className = 'fld-inner';
    (item.value as AnyItem[]).forEach((it, i) => inner.appendChild(renderItemNode(it, `(${i})`)));
    wrap.appendChild(inner);
  }
  return wrap;
}

/** Renders a parsed Item/List/Dictionary into `container` as a typed mini-tree.
 *  Exported so the HTTP Converter's "Structured headers" panel can render the
 *  exact same tree shape inline under each detected header. */
export function renderTree(container: HTMLElement, parsed: unknown, type: FType) {
  container.innerHTML = '';
  if (type === 'item') {
    container.appendChild(renderItemNode(parsed as AnyItem, 'item'));
  } else if (type === 'list') {
    (parsed as List).forEach((it, i) => container.appendChild(renderItemNode(it as AnyItem, `[${i}]`)));
  } else {
    const dict = parsed as Dictionary;
    for (const key of Object.keys(dict)) {
      container.appendChild(renderItemNode(dict[key] as AnyItem, key));
    }
  }
}

type DiffOp = { op: 'eq' | 'del' | 'ins'; ch: string };

/** Plain O(n·m) char-level LCS diff — fine for header-sized strings. */
function diffChars(a: string, b: string): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ op: 'eq', ch: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: 'del', ch: a[i] }); i++; }
    else { ops.push({ op: 'ins', ch: b[j] }); j++; }
  }
  while (i < n) { ops.push({ op: 'del', ch: a[i] }); i++; }
  while (j < m) { ops.push({ op: 'ins', ch: b[j] }); j++; }
  return ops;
}

function visibleCh(ch: string): string {
  return ch === ' ' ? '·' : ch === '\t' ? '⇥' : ch;
}

/** Renders an input/canonical diff pair into `container`; returns whether anything changed. */
function renderDiff(container: HTMLElement, before: string, after: string): boolean {
  container.innerHTML = '';
  const beforeRow = document.createElement('div');
  beforeRow.className = 'fld-diff-row';
  const afterRow = document.createElement('div');
  afterRow.className = 'fld-diff-row';

  const beforeChip = document.createElement('span');
  beforeChip.className = 'chip';
  beforeChip.textContent = 'input';
  const afterChip = document.createElement('span');
  afterChip.className = 'chip';
  afterChip.textContent = 'canonical';

  const beforeLine = document.createElement('pre');
  beforeLine.className = 'code fld-diff-line';
  const afterLine = document.createElement('pre');
  afterLine.className = 'code fld-diff-line';

  const tooBig = before.length + after.length > 8000;
  if (tooBig) {
    beforeLine.textContent = before;
    afterLine.textContent = after;
  } else {
    for (const { op, ch } of diffChars(before, after)) {
      if (op === 'eq') {
        beforeLine.appendChild(document.createTextNode(ch));
        afterLine.appendChild(document.createTextNode(ch));
      } else if (op === 'del') {
        const s = document.createElement('span');
        s.className = 'fld-diff-del';
        s.textContent = visibleCh(ch);
        beforeLine.appendChild(s);
      } else {
        const s = document.createElement('span');
        s.className = 'fld-diff-ins';
        s.textContent = visibleCh(ch);
        afterLine.appendChild(s);
      }
    }
  }

  beforeRow.append(beforeChip, beforeLine);
  afterRow.append(afterChip, afterLine);
  container.append(beforeRow, afterRow);
  return before !== after;
}

/** Deep-walk a plain-JSON tree and turn `{type:'date', value:<iso string>}` back into a real Date. */
function reviveDates(node: unknown): unknown {
  if (Array.isArray(node)) {
    node.forEach(reviveDates);
    return node;
  }
  if (node && typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    if (rec.type === 'date' && typeof rec.value === 'string') {
      rec.value = new Date(rec.value);
      return node;
    }
    for (const k of Object.keys(rec)) reviveDates(rec[k]);
  }
  return node;
}

function renderErrorText(value: string, type: FType, offset: number, msg: string): string {
  const caret = ' '.repeat(offset) + '^';
  return `${type} parse error (offset ${offset}): ${msg}\n\n${value.length ? value : '(empty)'}\n${caret}`;
}

const playground: Playground = {
  id: 'fields',
  title: 'Header Fields',
  pkg: '@johnhenry/http-fields',
  hue: 215,
  blurb: 'RFC 8941 Structured Field Values: parse, inspect, and serialize modern HTTP headers.',
  docs: 'https://opensource.johnhenry.me/http-fields/',
  mount(host) {
    const root = document.createElement('div');
    root.className = 'pg-fields';
    root.innerHTML = `
      <div class="panel fld-input">
        <div class="fld-row">
          <label class="field">
            <span>Preset</span>
            <select class="fld-preset"></select>
          </label>
          <label class="field">
            <span>Header name</span>
            <input class="fld-name mono" type="text" spellcheck="false" autocomplete="off">
          </label>
          <label class="field">
            <span>Field type</span>
            <select class="fld-type">
              <option value="auto">Auto-detect</option>
              <option value="item">Item</option>
              <option value="list">List</option>
              <option value="dictionary">Dictionary</option>
            </select>
          </label>
          <span class="chip fld-detected">type: —</span>
          <button class="btn fld-copy-link" type="button" title="Copy a link to this header state">Copy link</button>
        </div>
        <label class="field">
          <span><b class="fld-name-echo mono">header</b>: </span>
          <textarea class="code fld-value mono" spellcheck="false" rows="2"></textarea>
        </label>
        <p class="fld-note"></p>
        <pre class="code fld-error" hidden></pre>
      </div>

      <div class="grid-2">
        <div class="panel">
          <h3>Parsed tree</h3>
          <div class="fld-tree"></div>
        </div>
        <div class="panel">
          <h3>Canonical re-serialization <span class="chip fld-diff-status"></span></h3>
          <div class="fld-diff"></div>
        </div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <h3>JSON</h3>
          <pre class="code fld-json"></pre>
        </div>
        <div class="panel">
          <h3>Editor <span class="chip">edit JSON → serialize</span></h3>
          <textarea class="code fld-editor mono" spellcheck="false" rows="10"></textarea>
          <div class="fld-editor-actions">
            <button class="btn primary fld-editor-run">Serialize →</button>
            <button class="btn fld-editor-reset">Reset from parse</button>
          </div>
          <pre class="code fld-editor-out"></pre>
        </div>
      </div>

      <div class="panel fld-explain">
        <h3>Why structured fields?</h3>
        <p>Before RFC&nbsp;8941, every HTTP header invented its own tiny grammar, so generic tools like proxies,
        caches and WAFs had to special-case each one or treat headers as opaque strings. Structured Field Values
        give headers a small shared type system — Items, Lists, Dictionaries, Inner Lists and eight bare item
        types — so any conformant parser understands any structured header without knowing what it means.
        New headers (Priority, Cache-Status, Client Hints, HTTP Message Signatures) just declare which shape
        they use and inherit exact, canonical, round-trippable parsing and serialization for free.</p>
      </div>`;
    host.appendChild(root);

    const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
    const presetSel = $<HTMLSelectElement>('.fld-preset');
    const nameIn = $<HTMLInputElement>('.fld-name');
    const nameEcho = $<HTMLElement>('.fld-name-echo');
    const typeSel = $<HTMLSelectElement>('.fld-type');
    const detectedChip = $<HTMLSpanElement>('.fld-detected');
    const valueTa = $<HTMLTextAreaElement>('.fld-value');
    const noteEl = $<HTMLParagraphElement>('.fld-note');
    const errorEl = $<HTMLPreElement>('.fld-error');
    const treeEl = $<HTMLDivElement>('.fld-tree');
    const diffEl = $<HTMLDivElement>('.fld-diff');
    const diffStatus = $<HTMLSpanElement>('.fld-diff-status');
    const jsonEl = $<HTMLPreElement>('.fld-json');
    const editorTa = $<HTMLTextAreaElement>('.fld-editor');
    const editorRunBtn = $<HTMLButtonElement>('.fld-editor-run');
    const editorResetBtn = $<HTMLButtonElement>('.fld-editor-reset');
    const editorOut = $<HTMLPreElement>('.fld-editor-out');
    const copyLinkBtn = $<HTMLButtonElement>('.fld-copy-link');

    const listeners: Array<() => void> = [];
    const on = (el: EventTarget, ev: string, fn: EventListener) => {
      el.addEventListener(ev, fn);
      listeners.push(() => el.removeEventListener(ev, fn));
    };

    PRESETS.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = p.name;
      presetSel.appendChild(opt);
    });

    let editorDirty = false;
    let lastParsed: unknown = null;
    let lastType: FType = 'item';

    // Deep-linkable state: #/fields?name=...&value=...&type=...
    const linkDefaults = { name: PRESETS[0].header, value: PRESETS[0].value, type: PRESETS[0].type as string };

    function update() {
      nameEcho.textContent = nameIn.value.trim() || '(header)';
      const value = valueTa.value;
      const chosen = typeSel.value as FType | 'auto';
      const result = attemptParse(value, chosen);
      detectedChip.textContent = `type: ${result.type}`;
      writeState({ name: nameIn.value, value, type: chosen }, linkDefaults);

      if (!result.ok) {
        errorEl.hidden = false;
        const offset = findErrorOffset(value, result.type);
        const msg = result.error instanceof Error
          ? `${result.error.name}: ${result.error.message}`
          : String(result.error);
        errorEl.textContent = renderErrorText(value, result.type, offset, msg);
        treeEl.innerHTML = '<p class="fld-empty">— parse failed, see error above —</p>';
        diffEl.innerHTML = '';
        diffStatus.textContent = '';
        jsonEl.textContent = '';
        return;
      }

      errorEl.hidden = true;
      lastParsed = result.parsed;
      lastType = result.type;
      renderTree(treeEl, result.parsed, result.type);
      let canonical = '';
      try {
        canonical = serializeAny(result.parsed, result.type);
      } catch (e) {
        canonical = `(serialize failed: ${e instanceof Error ? e.message : String(e)})`;
      }
      const changed = renderDiff(diffEl, value, canonical);
      diffStatus.textContent = changed ? 'normalized' : 'identical';
      jsonEl.textContent = JSON.stringify(result.parsed, null, 2);
      if (!editorDirty) editorTa.value = JSON.stringify(result.parsed, null, 2);
    }

    function applyPreset(i: number) {
      const p = PRESETS[i];
      nameIn.value = p.header;
      valueTa.value = p.value;
      typeSel.value = p.type;
      noteEl.textContent = p.note;
      editorDirty = false;
      update();
    }

    on(presetSel, 'change', () => applyPreset(Number(presetSel.value)));
    on(nameIn, 'input', update);
    on(valueTa, 'input', update);
    on(typeSel, 'change', update);
    on(editorTa, 'input', () => { editorDirty = true; });

    on(editorRunBtn, 'click', () => {
      try {
        const obj = reviveDates(JSON.parse(editorTa.value));
        const out = serializeAny(obj, lastType);
        editorOut.classList.remove('fld-error-text');
        editorOut.textContent = out;
      } catch (e) {
        editorOut.classList.add('fld-error-text');
        editorOut.textContent = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      }
    });

    on(editorResetBtn, 'click', () => {
      editorTa.value = JSON.stringify(lastParsed, null, 2);
      editorDirty = false;
      editorOut.textContent = '';
      editorOut.classList.remove('fld-error-text');
    });

    on(copyLinkBtn, 'click', async () => {
      await copyLink();
      const original = copyLinkBtn.textContent;
      copyLinkBtn.textContent = 'Copied!';
      window.setTimeout(() => { copyLinkBtn.textContent = original; }, 1200);
    });

    // Priority on load: an incoming handoff (e.g. from the HTTP Converter's
    // "Structured headers" panel) wins, then a shareable deep link, then the
    // first preset.
    const handoff = receive<{ name: string; value: string; type: FType | 'auto' }>('fields');
    if (handoff && handoff.kind === 'header-field') {
      nameIn.value = handoff.payload.name;
      valueTa.value = handoff.payload.value;
      typeSel.value = handoff.payload.type;
      noteEl.textContent = '';
      editorDirty = false;
      root.prepend(handoffBanner(handoff, `loaded header "${handoff.payload.name}" for inspection.`));
      update();
    } else if (location.hash.includes('?')) {
      const s = readState(linkDefaults);
      nameIn.value = s.name;
      valueTa.value = s.value;
      typeSel.value = s.type;
      noteEl.textContent = '';
      editorDirty = false;
      update();
    } else {
      presetSel.value = '0';
      applyPreset(0);
    }

    return () => {
      for (const off of listeners) off();
      root.remove();
    };
  },
};
export default playground;
