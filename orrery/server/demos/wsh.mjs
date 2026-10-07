/**
 * wsh demo hosts. Two of them share one restricted command set (COMMANDS):
 *
 *   - the ORRERY companion (`npm run node`) mounts the REAL Node host,
 *     `createWshServer` from `@johnhenry/wsh/server`, on its own port (7780),
 *     with real Ed25519 auth against an allowlist the planet fills via
 *     POST /wsh/authorize, a persisted host key (host-key TOFU), a real
 *     directory sandbox behind `fs` (list/stat/read/write/rename/mkdir/remove,
 *     uploads/downloads), MCP tools, and `exec` / `pty` wired to the
 *     restricted commands below;
 *   - the browser: the Web Shell planet imports createWshHost + memoryVfs and
 *     attaches it to one end of a MessageChannel. A browser tab cannot run
 *     `@johnhenry/wsh/server` (it needs Node), so this is a hand-built
 *     wsh-v1 host made from the package's exported primitives
 *     (QMuxConnection, frameEncode/FrameDecoder, the message constructors,
 *     verifyChallenge/fingerprint) that speaks byte-identical QMux/CBOR.
 *
 * NEVER a real shell: every command is a pure function in COMMANDS below.
 * There is no child_process, no eval, no path outside the sandbox directory.
 * (`createWshServer({ exec: true })` would run /bin/sh; a localhost companion
 * that a web page can reach must not offer that, so exec/pty here are custom
 * runners over the restricted set.)
 *
 * This module imports nothing Node-specific at the top level.
 */
import {
  MSG, FrameDecoder, frameEncode,
  serverHello, challenge, authOk, authFail, openOk, openFail, sessionData,
  exit as exitMsg, close as closeMsg, fileResult, fileChunk, pong,
  generateNonce, verifyChallenge, fingerprint, importPublicKeyRaw,
  generateKeyPair, exportPublicKeyRaw, QMuxConnection,
  base64Decode, parseSSHPublicKey, extractRawFromSSHWire,
  mcpTools as mcpToolsMsg, mcpResult, MCP_CALL_ID_FEATURE,
} from '@johnhenry/wsh';

export const id = 'wsh';
export const PORT = Number(globalThis.process?.env?.ORRERY_WSH_PORT || 7780);
export const describe = `real @johnhenry/wsh/server host on ws://127.0.0.1:${PORT} (restricted commands, sandbox dir, MCP tools), Ed25519 allowlist via POST /wsh/authorize on the companion`;

const enc = new TextEncoder();
const dec = new TextDecoder();
export const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 48;
const FILE_CHUNK_BYTES = 64 * 1024;
const FLOOD_CHUNK = 4 * 1024;

/* ------------------------------------------------------------------ */
/* Sandbox files                                                       */
/* ------------------------------------------------------------------ */

export const SEED_FILES = {
  'README.txt': [
    'Welcome to the wsh demo sandbox.',
    '',
    'Everything you see here lives in one flat directory. The host is',
    'restricted: there is no real shell, just a handful of built-in',
    'commands (type `help`). Files can be listed, uploaded and downloaded',
    'over the wsh file channel (FileOp / FileChunk control messages).',
    '',
  ].join('\n'),
  'motd.txt': 'Nothing here can touch the machine it runs on. Enjoy.\n',
  'notes.md': [
    '# wire notes',
    '',
    '- control channel = QMux stream 0, length-prefixed CBOR',
    '- pty sessions: data_mode "virtual" (SessionData on stream 0)',
    '- exec sessions: data_mode "stream" (their own QMux stream)',
    '- auth: Ed25519 over SHA-256("wsh-v1\\0" || lp(user) || lp(sid) || nonce)',
    '',
  ].join('\n'),
  'orbits.csv': 'planet,period_days,semi_major_au\nmercury,88,0.387\nvenus,225,0.723\nearth,365,1.000\nmars,687,1.524\njupiter,4333,5.203\n',
  'haiku.txt': 'frames cross the socket\nwindows open, then they close\nthe cow says hello\n',
};

export function safeName(name) {
  const base = String(name ?? '').trim().replace(/^.*[\\/]/, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(base)) throw new Error(`illegal file name ${JSON.stringify(String(name ?? ''))}`);
  return base;
}

/** In-memory sandbox (the browser stand-in). */
export function memoryVfs(seed = SEED_FILES) {
  const files = new Map();
  const t0 = Date.now();
  for (const [n, text] of Object.entries(seed)) files.set(n, { data: enc.encode(text), mtime: t0 });
  return {
    label: 'memory://sandbox',
    async list() {
      return [...files].map(([name, f]) => ({ name, size: f.data.byteLength, mtime: f.mtime, type: 'file' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async read(name) { return files.get(safeName(name))?.data ?? null; },
    async write(name, data) { files.set(safeName(name), { data: new Uint8Array(data), mtime: Date.now() }); },
    async remove(name) { return files.delete(safeName(name)); },
  };
}

/** A real directory in os.tmpdir() (the companion). Node modules loaded lazily. */
async function nodeVfs() {
  const spec = (s) => s; // keep bundlers from trying to resolve these for the browser
  const fs = await import(/* @vite-ignore */ spec('node:fs/promises'));
  const os = await import(/* @vite-ignore */ spec('node:os'));
  const path = await import(/* @vite-ignore */ spec('node:path'));
  const dir = path.join(os.tmpdir(), 'orrery-wsh-sandbox');
  await fs.mkdir(dir, { recursive: true });
  for (const [n, text] of Object.entries(SEED_FILES)) {
    try { await fs.writeFile(path.join(dir, n), text, { flag: 'wx' }); } catch { /* already there */ }
  }
  const at = (name) => path.join(dir, safeName(name));
  return {
    label: dir,
    async list() {
      const out = [];
      for (const n of await fs.readdir(dir)) {
        try {
          const st = await fs.stat(path.join(dir, n));
          if (st.isFile()) out.push({ name: n, size: st.size, mtime: Math.round(st.mtimeMs), type: 'file' });
        } catch { /* raced */ }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    async read(name) { try { return new Uint8Array(await fs.readFile(at(name))); } catch { return null; } },
    async write(name, data) { await fs.writeFile(at(name), data); },
    async remove(name) { try { await fs.unlink(at(name)); return true; } catch { return false; } },
  };
}

/* ------------------------------------------------------------------ */
/* Restricted command set                                              */
/* ------------------------------------------------------------------ */

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', blue: '\x1b[34m', cyan: '\x1b[36m', yellow: '\x1b[33m', magenta: '\x1b[35m', red: '\x1b[31m' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tokenize(line) {
  const out = []; let cur = ''; let q = null; let any = false;
  for (const ch of line) {
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; any = true; continue; }
    if (/\s/.test(ch)) { if (any || cur) out.push(cur); cur = ''; any = false; continue; }
    cur += ch;
  }
  if (any || cur) out.push(cur);
  return out;
}

function fmtSize(n) { return n < 1024 ? `${n}B` : n < 1048576 ? `${(n / 1024).toFixed(1)}K` : `${(n / 1048576).toFixed(1)}M`; }

function cow(text) {
  const t = text || 'moo';
  const lines = [];
  for (let i = 0; i < t.length; i += 38) lines.push(t.slice(i, i + 38));
  const w = Math.max(...lines.map((l) => l.length));
  const out = [' ' + '_'.repeat(w + 2)];
  if (lines.length === 1) out.push(`< ${lines[0]} >`);
  else lines.forEach((l, i) => out.push(`${i === 0 ? '/' : i === lines.length - 1 ? '\\' : '|'} ${l.padEnd(w)} ${i === 0 ? '\\' : i === lines.length - 1 ? '/' : '|'}`));
  out.push(' ' + '-'.repeat(w + 2));
  out.push('        \\   ^__^', '         \\  (oo)\\_______', '            (__)\\       )\\/\\', '                ||----w |', '                ||     ||');
  return out.join('\n') + '\n';
}

const PROCS = ['wsh-host', 'qmux-pump', 'cbor-codec', 'ed25519-verify', 'asciicast-rec', 'sftp-lite', 'flow-ctl', 'cowsay', 'orrery-orbit', 'idle-hands'];
function topFrame(tick, user, cols, t0) {
  const now = new Date();
  const up = Math.floor((Date.now() - t0) / 1000);
  const la = [0.42, 0.37, 0.31].map((v, i) => (v + Math.sin(tick / (3 + i)) * 0.2 + 0.2).toFixed(2));
  const rows = PROCS.map((name, i) => {
    const cpu = Math.max(0, (Math.sin(tick * 0.7 + i * 1.9) + 1) * (i < 3 ? 18 : 6) + ((tick * 7 + i * 13) % 5));
    const mem = 0.4 + ((i * 37) % 23) / 10;
    return { pid: 1000 + i * 17, user: i % 3 === 0 ? 'root' : user, cpu, mem, name, time: `${Math.floor((up * (i + 1)) / 60) % 60}:${String((up * (i + 3)) % 60).padStart(2, '0')}` };
  }).sort((a, b) => b.cpu - a.cpu);
  const w = Math.max(40, Math.min(cols || 80, 100));
  const lines = [
    `top - ${now.toTimeString().slice(0, 8)} up ${Math.floor(up / 60)}:${String(up % 60).padStart(2, '0')},  1 user,  load average: ${la.join(', ')}`,
    `Tasks: ${PROCS.length} total,   ${rows.filter((r) => r.cpu > 10).length} running,   ${rows.filter((r) => r.cpu <= 10).length} sleeping   (fake: nothing here is real)`,
    '',
    `${'  PID'} ${'USER'.padEnd(8)} ${'%CPU'.padStart(5)} ${'%MEM'.padStart(5)} ${'TIME+'.padStart(7)}  COMMAND`,
    ...rows.map((r) => `${String(r.pid).padStart(5)} ${r.user.slice(0, 8).padEnd(8)} ${r.cpu.toFixed(1).padStart(5)} ${r.mem.toFixed(1).padStart(5)} ${r.time.padStart(7)}  ${r.name}`),
  ];
  return lines.map((l) => l.slice(0, w));
}

export const COMMANDS = {
  help: 'list the commands this restricted host knows',
  echo: 'echo [text…] — print its arguments',
  date: 'print the host clock',
  whoami: 'your username and key fingerprint',
  ls: 'ls [-l] — list the sandbox directory',
  cat: 'cat <file> — print a sandbox text file',
  cowsay: 'cowsay [text] — a cow says it',
  banner: 'banner [text] — boxed banner',
  top: 'top [-n N] — fake process table that streams (q / Ctrl-C to quit)',
  flood: 'flood [KB] — emit KB kilobytes quickly (watch QMux backpressure)',
  uname: 'what is this host',
  history: 'your command history (pty only)',
  clear: 'clear the screen',
  exit: 'close the session',
};

/**
 * Run one command line. `io.write(text)` resolves when the bytes have been
 * accepted by QMux flow control — awaiting it is what makes backpressure real.
 */
async function runCommand(line, io) {
  const argv = tokenize(line);
  const cmd = argv[0];
  const args = argv.slice(1);
  const nl = io.pty ? '\r\n' : '\n';
  const w = (s) => io.write(s.replace(/\r?\n/g, nl));
  switch (cmd) {
    case undefined: return 0;
    case 'help':
      await w(`${C.bold}restricted wsh host${C.reset} — no real shell, just these:\n` + Object.entries(COMMANDS).map(([k, v]) => `  ${C.cyan}${k.padEnd(8)}${C.reset} ${v}`).join('\n') + '\n');
      return 0;
    case 'echo': await w(args.join(' ') + '\n'); return 0;
    case 'date': { const d = new Date(); await w(`${d.toString()}\n${d.toISOString()}\n`); return 0; }
    case 'whoami': await w(`${io.user}  ${C.dim}(key ${io.fp.slice(0, 16)}…)${C.reset}\n`); return 0;
    case 'uname': await w(`wsh-demo ${io.hostname} restricted wsh-v1 qmux/cbor (${io.where})\n`); return 0;
    case 'clear': await io.write('\x1b[H\x1b[2J'); return 0;
    case 'history': await w((io.history || []).map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join('\n') + '\n'); return 0;
    case 'ls': {
      const long = args.includes('-l') || args.includes('-la') || args.includes('-al');
      const list = await io.vfs.list();
      if (!list.length) { await w('(empty)\n'); return 0; }
      if (long) {
        await w(`total ${list.length}\n` + list.map((f) => `-rw-r--r--  1 ${io.user.padEnd(8)} ${fmtSize(f.size).padStart(7)}  ${new Date(f.mtime).toISOString().slice(0, 16).replace('T', ' ')}  ${C.green}${f.name}${C.reset}`).join('\n') + '\n');
      } else {
        await w(list.map((f) => `${C.green}${f.name}${C.reset}`).join('  ') + '\n');
      }
      return 0;
    }
    case 'cat': {
      if (!args.length) { await w('cat: missing file operand\n'); return 1; }
      for (const a of args) {
        let data;
        try { data = await io.vfs.read(a); } catch (e) { await w(`cat: ${e.message}\n`); return 1; }
        if (!data) { await w(`cat: ${a}: No such file in sandbox\n`); return 1; }
        if (data.byteLength > 64 * 1024) { await w(`cat: ${a}: too large to print (${fmtSize(data.byteLength)}), use the file panel\n`); return 1; }
        const text = dec.decode(data);
        if (/[\x00-\x08\x0e-\x1a]/.test(text)) { await w(`cat: ${a}: binary file\n`); return 1; }
        await w(text.endsWith('\n') ? text : text + '\n');
      }
      return 0;
    }
    case 'cowsay': await w(cow(args.join(' '))); return 0;
    case 'banner': {
      const t = (args.join(' ') || io.user).toUpperCase().slice(0, 60);
      const inner = ` ${t.split('').join(' ')} `;
      await w(`${C.magenta}╔${'═'.repeat(inner.length)}╗\n║${C.bold}${inner}${C.reset}${C.magenta}║\n╚${'═'.repeat(inner.length)}╝${C.reset}\n`);
      return 0;
    }
    case 'top': {
      const ni = args.indexOf('-n');
      const limit = ni >= 0 ? Math.max(1, Math.min(60, parseInt(args[ni + 1], 10) || 5)) : (io.pty ? Infinity : 5);
      for (let tick = 0; tick < limit && !io.cancelled(); tick++) {
        const frame = topFrame(tick, io.user, io.cols(), io.t0);
        if (io.pty) {
          const [h1, h2, blank, head, ...rows] = frame;
          await io.write('\x1b[H\x1b[2J' + [h1, h2, blank, `\x1b[7m${head.padEnd(Math.min(io.cols(), 100))}\x1b[0m`, ...rows.map((r, i) => (i < 3 ? C.yellow + r + C.reset : r))].join('\r\n') + `\r\n\r\n${C.dim}q or Ctrl-C to quit · frame ${tick + 1}${C.reset}`);
        } else {
          await w(frame.join('\n') + '\n\n');
        }
        if (tick + 1 < limit) await io.sleep(700);
      }
      if (io.pty) await io.write('\r\n');
      return 0;
    }
    case 'flood': {
      const kb = Math.max(1, Math.min(4096, parseInt(args[0], 10) || 256));
      const total = kb * 1024;
      let sent = 0; let n = 0;
      const t0 = Date.now();
      while (sent < total && !io.cancelled()) {
        let chunk = '';
        while (chunk.length < FLOOD_CHUNK - 80) {
          n++;
          chunk += `${String(n).padStart(6, '0')} ${'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(2).slice(n % 36, (n % 36) + 48)}${nl}`;
        }
        chunk = chunk.slice(0, Math.min(chunk.length, total - sent));
        await io.write(chunk);
        sent += chunk.length;
      }
      const ms = Date.now() - t0;
      await w(`${C.yellow}flood: ${fmtSize(sent)} in ${ms} ms${io.cancelled() ? ' (interrupted)' : ''} — every write awaited QMux flow control${C.reset}\n`);
      return io.cancelled() ? 130 : 0;
    }
    case 'exit': io.requestExit?.(); return 0;
    default:
      await w(`${C.red}wsh: ${cmd}: command not found${C.reset} ${C.dim}(restricted demo host — try \`help\`)${C.reset}\n`);
      return 127;
  }
}

/* ------------------------------------------------------------------ */
/* Interactive restricted shell (line editor over runCommand)          */
/* ------------------------------------------------------------------ */

/**
 * A tiny line-editing shell for the pty channel, shared by the in-page host and the
 * companion's `pty.spawn` adapter. It owns no transport: `out(text)` ships bytes,
 * `onExit(code)` is called once when the session ends.
 *
 * @param {object} o
 * @param {string} o.user @param {string} o.fp @param {object} o.vfs
 * @param {string} o.hostname @param {string} o.where @param {number} o.t0
 * @param {number} o.cols @param {number} o.rows
 * @param {(text: string) => Promise<unknown>|unknown} o.out
 * @param {(code: number) => unknown} o.onExit
 * @param {() => boolean} [o.isDead] true once the transport is gone
 */
function createShell({ user, fp, vfs, hostname, where, t0, cols, rows, out, onExit, isDead = () => false }) {
  const ch = { cols: cols || 80, rows: rows || 24, line: '', history: [], hIdx: -1, running: null, cancel: false, esc: '', exitRequested: false, finished: false };
  const ps1 = () => `${C.green}${C.bold}${user}@${hostname}${C.reset}:${C.blue}${C.bold}~/sandbox${C.reset}$ `;
  const prompt = () => out(ps1());
  const redraw = () => out(`\r\x1b[K${ps1()}${ch.line}`);
  const finish = async (code) => {
    if (ch.finished) return;
    ch.finished = true;
    await onExit(code);
  };
  const run = (line) => {
    const io = {
      pty: true, user, fp, vfs, hostname, where, t0, sleep, write: out, history: ch.history,
      cols: () => ch.cols, cancelled: () => ch.cancel || ch.finished || isDead(),
      requestExit: () => { ch.exitRequested = true; },
    };
    ch.cancel = false;
    ch.running = runCommand(line, io).catch((e) => out(`\r\nerror: ${e.message}\r\n`)).then(async () => {
      ch.running = null;
      if (ch.finished || isDead()) return;
      if (ch.exitRequested) { await out('logout\r\n'); return finish(0); }
      await prompt();
    });
  };
  return {
    async start() {
      await out(`${C.dim}restricted wsh host · ${where} · sandbox ${vfs.label}${C.reset}\r\n${C.cyan}${dec.decode((await vfs.read('motd.txt')) ?? new Uint8Array())}${C.reset}`.replace(/\n/g, '\r\n'));
      await out(`type ${C.bold}help${C.reset} for the command list\r\n`);
      await prompt();
    },
    input(data) {
      const s = typeof data === 'string' ? data : dec.decode(data);
      if (ch.running) {
        if (s.includes('\x03') || s.includes('q')) { ch.cancel = true; if (s.includes('\x03')) out('^C'); }
        return;
      }
      for (const c of s) {
        if (ch.esc) {
          ch.esc += c;
          if (ch.esc.length >= 3) {
            if (ch.esc === '\x1b[A' || ch.esc === '\x1b[B') {
              if (ch.history.length) {
                ch.hIdx = ch.esc === '\x1b[A' ? Math.max(0, (ch.hIdx < 0 ? ch.history.length : ch.hIdx) - 1) : Math.min(ch.history.length, ch.hIdx + 1);
                ch.line = ch.history[ch.hIdx] ?? '';
                redraw();
              }
            }
            ch.esc = '';
          }
          continue;
        }
        if (c === '\x1b') { ch.esc = c; continue; }
        if (c === '\r' || c === '\n') {
          const line = ch.line.trim();
          ch.line = ''; ch.hIdx = -1;
          out('\r\n');
          if (line) { ch.history.push(line); if (ch.history.length > 100) ch.history.shift(); run(line); return; }
          prompt();
          continue;
        }
        if (c === '\x7f' || c === '\b') { if (ch.line.length) { ch.line = ch.line.slice(0, -1); out('\b \b'); } continue; }
        if (c === '\x03') { ch.line = ''; out('^C\r\n'); prompt(); continue; }
        if (c === '\x04') { if (!ch.line) { out('logout\r\n'); finish(0); return; } continue; }
        if (c === '\x0c') { out('\x1b[H\x1b[2J'); redraw(); continue; }
        if (c === '\t') {
          const hits = Object.keys(COMMANDS).filter((k) => k.startsWith(ch.line) && ch.line && !ch.line.includes(' '));
          if (hits.length === 1) { const add = hits[0].slice(ch.line.length) + ' '; ch.line += add; out(add); }
          continue;
        }
        if (c >= ' ' && ch.line.length < 512) { ch.line += c; out(c); }
      }
    },
    resize(c, r) { ch.cols = c || ch.cols; ch.rows = r || ch.rows; },
    signal(sig) { if (/INT/.test(String(sig))) ch.cancel = true; },
    kill() { ch.cancel = true; ch.finished = true; },
  };
}

/* ------------------------------------------------------------------ */
/* MCP tools (answered by the real server and by the in-page host)     */
/* ------------------------------------------------------------------ */

/**
 * The tool list both hosts serve for McpDiscover/McpCall. Shaped like
 * `createWshServer({ mcp: { tools } })` wants: `{ name, description, inputSchema, call }`.
 * Arguments are validated against `inputSchema` by the real server before `call()` runs;
 * the in-page host checks `required` and `type` itself (see validateArgs).
 */
export function demoMcpTools(vfs) {
  return [
    {
      name: 'list_files',
      description: 'List the files in the demo sandbox with their sizes.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      call: async () => ({ success: true, output: (await vfs.list()).map((f) => `${f.name}\t${f.size} B`).join('\n') || '(empty)' }),
    },
    {
      name: 'read_file',
      description: 'Read a text file from the demo sandbox (up to 64 KiB).',
      inputSchema: { type: 'object', properties: { name: { type: 'string', maxLength: 64 } }, required: ['name'], additionalProperties: false },
      call: async ({ name }) => {
        const data = await vfs.read(safeName(name));
        if (!data) throw new Error(`${name}: no such file in sandbox`);
        if (data.byteLength > 64 * 1024) throw new Error(`${name}: too large to return (${fmtSize(data.byteLength)})`);
        return { success: true, output: dec.decode(data) };
      },
    },
    {
      name: 'kepler',
      description: "Orbital period in years for a semi-major axis in AU (Kepler's third law, T = a^1.5).",
      inputSchema: { type: 'object', properties: { au: { type: 'number', minimum: 0.001, maximum: 1000 } }, required: ['au'], additionalProperties: false },
      call: async ({ au }) => ({ success: true, output: `${(au ** 1.5).toFixed(3)} years (${Math.round(au ** 1.5 * 365.25)} days) at ${au} AU` }),
    },
  ];
}

/** The subset of JSON Schema the demo tools use: type, required, additionalProperties, min/max. */
function validateArgs(schema, args) {
  const a = args ?? {};
  if (typeof a !== 'object' || Array.isArray(a)) return 'arguments must be an object';
  for (const k of schema.required ?? []) if (!(k in a)) return `missing required argument "${k}"`;
  for (const [k, v] of Object.entries(a)) {
    const prop = schema.properties?.[k];
    if (!prop) { if (schema.additionalProperties === false) return `unexpected argument "${k}"`; continue; }
    if (prop.type === 'string' && typeof v !== 'string') return `"${k}" must be a string`;
    if (prop.type === 'number' && typeof v !== 'number') return `"${k}" must be a number`;
    if (typeof v === 'number' && ((prop.minimum !== undefined && v < prop.minimum) || (prop.maximum !== undefined && v > prop.maximum))) return `"${k}" must be between ${prop.minimum} and ${prop.maximum}`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The host: one QMux connection per attached pipe                     */
/* ------------------------------------------------------------------ */

function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }

/**
 * @param {object} opts
 * @param {{list, read, write, remove, label}} opts.vfs
 * @param {(fp: string, username: string) => boolean|Promise<boolean>} opts.isAuthorized
 * @param {(line: string) => void} [opts.onLog]
 * @param {string} [opts.hostname]
 * @param {string} [opts.where] - shown by `uname`
 */
export function createWshHost({ vfs, isAuthorized, onLog = () => {}, hostname = 'orrery', where = 'node' }) {
  let hostFp = null;
  const ready = (async () => {
    try {
      const kp = await generateKeyPair(true);
      hostFp = await fingerprint(await exportPublicKeyRaw(kp.publicKey));
    } catch (e) { onLog(`host key unavailable: ${e.message}`); }
  })();
  const t0 = Date.now();
  let connCounter = 0;
  const mcpTools = demoMcpTools(vfs);

  function attach(pipe) {
    const cid = ++connCounter;
    const log = (m) => onLog(`[conn ${cid}] ${m}`);
    const conn = { sessionId: crypto.randomUUID(), nonce: null, username: null, authed: false, fp: '', nextChannel: 0, closed: false };
    /** @type {Map<number, any>} */
    const channels = new Map();
    const pendingStreamChannels = [];
    const decoder = new FrameDecoder();
    let control = null;
    const pendingSends = [];
    let chain = Promise.resolve();

    const qmux = new QMuxConnection({ isClient: false, send: (b) => { if (!conn.closed) pipe.send(b); } });

    const send = (msg) => {
      if (conn.closed) return Promise.resolve();
      const bytes = frameEncode(msg);
      if (control) return control.write(bytes).catch(() => {});
      pendingSends.push(bytes);
      return Promise.resolve();
    };

    function shutdown(why) {
      if (conn.closed) return;
      conn.closed = true;
      for (const ch of channels.values()) ch.kill?.();
      channels.clear();
      try { qmux.destroy(new Error(why)); } catch { /* */ }
      log(`closed (${why})`);
    }

    qmux.onError = (e) => log(`qmux error: ${e.message}`);
    qmux.onClose = () => { shutdown('peer sent CONNECTION_CLOSE'); try { pipe.close(); } catch { /* */ } };
    qmux.onStreamOpen = (s) => {
      if (s.id !== 0) { bindDataStream(s); return; }
      control = s;
      s.onData = (d) => {
        let msgs;
        try { msgs = decoder.feed(d); } catch (e) { log(`frame decode error: ${e.message}`); return; }
        for (const m of msgs) chain = chain.then(() => handle(m)).catch((e) => log(`handler error: ${e.message}`));
      };
      s.onEnd = () => shutdown('control stream FIN');
      s.onReset = () => shutdown('control stream reset');
      for (const b of pendingSends.splice(0)) s.write(b).catch(() => {});
    };
    qmux.sendHandshake();

    function bindDataStream(s) {
      const channelId = pendingStreamChannels.shift();
      const ch = channelId !== undefined ? channels.get(channelId) : undefined;
      if (!ch) { s.close().catch(() => {}); return; }
      ch.bind(s);
    }

    async function handle(m) {
      if (conn.closed) return;
      if (!conn.authed) return handleAuth(m);
      switch (m.type) {
        case MSG.PING: return send(pong({ id: m.id }));
        case MSG.OPEN: return handleOpen(m);
        case MSG.SESSION_DATA: channels.get(m.channel_id)?.input?.(m.data); return;
        case MSG.RESIZE: channels.get(m.channel_id)?.resize?.(m.cols, m.rows); return;
        case MSG.SIGNAL: channels.get(m.channel_id)?.signal?.(m.signal); return;
        case MSG.CLOSE: { const ch = channels.get(m.channel_id); if (ch) { ch.kill?.(); channels.delete(m.channel_id); } return; }
        case MSG.FILE_OP: return handleFileOp(m);
        case MSG.FILE_CHUNK: return channels.get(m.channel_id)?.chunk?.(m);
        case MSG.MCP_DISCOVER: return send(mcpToolsMsg({ tools: mcpTools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })) }));
        case MSG.MCP_CALL: return handleMcpCall(m);
        default: log(`ignored message type 0x${m.type.toString(16)}`);
      }
    }

    async function handleAuth(m) {
      if (m.type === MSG.HELLO) {
        await ready;
        const user = String(m.username ?? '');
        if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/.test(user)) {
          await send(authFail({ reason: `bad username ${JSON.stringify(user)} (letters, digits, _ . - ; max 32)` }));
          setTimeout(() => { shutdown('bad username'); pipe.close(); }, 50);
          return;
        }
        if (m.auth_method && m.auth_method !== 'pubkey') {
          await send(authFail({ reason: 'this host only accepts Ed25519 pubkey auth' }));
          setTimeout(() => { shutdown('password auth refused'); pipe.close(); }, 50);
          return;
        }
        conn.username = user;
        conn.nonce = generateNonce();
        await send(serverHello({ sessionId: conn.sessionId, features: ['pty', 'exec', 'file', 'restricted', MCP_CALL_ID_FEATURE], fingerprints: hostFp ? [hostFp] : [] }));
        await send(challenge({ nonce: conn.nonce, sessionId: conn.sessionId }));
        log(`HELLO from ${user}; challenge sent`);
        return;
      }
      if (m.type === MSG.AUTH) {
        if (!conn.nonce) return;
        const fail = async (reason) => {
          log(`AUTH_FAIL: ${reason}`);
          await send(authFail({ reason }));
          setTimeout(() => { shutdown('auth failed'); try { pipe.close(); } catch { /* */ } }, 80);
        };
        if (m.method !== 'pubkey' || !(m.public_key instanceof Uint8Array) || !(m.signature instanceof Uint8Array)) return fail('expected a pubkey AUTH with public_key and signature');
        const fp = await fingerprint(m.public_key);
        if (!(await isAuthorized(fp, conn.username))) return fail(`key ${fp.slice(0, 16)}… is not on this host's allowlist`);
        let ok = false;
        try {
          ok = await verifyChallenge(await importPublicKeyRaw(m.public_key), m.signature, conn.sessionId, conn.nonce, { username: conn.username });
        } catch { ok = false; }
        if (!ok) return fail('signature does not verify over the transcript');
        conn.authed = true;
        conn.fp = fp;
        conn.nonce = null;
        await send(authOk({ sessionId: conn.sessionId, token: randomBytes(16), ttl: 3600 }));
        log(`authenticated ${conn.username} (${fp.slice(0, 12)}…)`);
      }
    }

    /** McpCall: the same tools the real server serves, minus its full JSON-Schema validator. */
    async function handleMcpCall(m) {
      const callId = m.call_id;
      const tool = mcpTools.find((t) => t.name === m.tool);
      const reply = (result) => send(mcpResult({ result, callId }));
      if (!tool) return reply({ success: false, error: `unknown tool "${m.tool}"` });
      const bad = validateArgs(tool.inputSchema, m.arguments);
      if (bad) return reply({ success: false, error: `invalid arguments: ${bad}` });
      try { return reply(await tool.call(m.arguments ?? {})); } catch (e) { return reply({ success: false, error: e.message }); }
    }

    function baseIo(ch, pty) {
      return {
        pty, user: conn.username, fp: conn.fp, vfs, hostname, where, t0,
        cols: () => ch.cols, sleep,
        cancelled: () => ch.cancel || conn.closed,
      };
    }

    function handleOpen(m) {
      const kind = m.kind;
      if (kind === 'pty') return openPty(m);
      if (kind === 'exec') return openExec(m);
      if (kind === 'file') return openFile(m);
      return send(openFail({ reason: `kind "${kind}" is not offered by this restricted host (pty, exec, file only)` }));
    }

    async function openPty(m) {
      const channelId = ++conn.nextChannel;
      const shell = createShell({
        user: conn.username, fp: conn.fp, vfs, hostname, where, t0, cols: m.cols, rows: m.rows,
        out: (text) => send(sessionData({ channelId, data: enc.encode(text) })),
        onExit: async (code) => { channels.delete(channelId); await send(exitMsg({ channelId, code })); setTimeout(() => send(closeMsg({ channelId })), 120); },
        isDead: () => conn.closed || !channels.has(channelId),
      });
      channels.set(channelId, { kind: 'pty', cols: m.cols || 80, input: (d) => shell.input(d), resize: (c, r) => shell.resize(c, r), signal: (sg) => shell.signal(sg), kill: () => shell.kill() });
      await send(openOk({ channelId, dataMode: 'virtual', capabilities: ['resize', 'signal'], sessionId: crypto.randomUUID(), token: randomBytes(16) }));
      log(`pty channel ${channelId} opened (${m.cols || 80}x${m.rows || 24})`);
      await shell.start();
    }

    async function openExec(m) {
      const command = String(m.command ?? '').trim();
      if (!command) return send(openFail({ reason: 'exec needs a command' }));
      const channelId = ++conn.nextChannel;
      const ch = { kind: 'exec', cols: m.cols || 80, cancel: false, stream: null, buffered: [], primed: false, boundWaiters: [], wq: Promise.resolve() };
      channels.set(channelId, ch);
      ch.bind = (s) => {
        ch.stream = s;
        s.onData = (d) => { if (!ch.primed) { ch.primed = true; d = d.subarray(1); } if (d.byteLength && dec.decode(d).includes('\x03')) ch.cancel = true; };
        s.onEnd = () => {};
        s.onReset = () => { ch.cancel = true; };
        const pending = ch.buffered.splice(0);
        ch.wq = ch.wq.then(async () => { for (const b of pending) await s.write(b).catch(() => {}); });
        ch.boundWaiters.splice(0).forEach((r) => r());
      };
      ch.signal = (sig) => { if (/INT|TERM|KILL/.test(String(sig))) ch.cancel = true; };
      ch.kill = () => { ch.cancel = true; };
      const write = (text) => {
        const bytes = enc.encode(text);
        if (!ch.stream) { ch.buffered.push(bytes); return Promise.resolve(); }
        const s = ch.stream;
        ch.wq = ch.wq.then(() => s.write(bytes).catch(() => {}));
        return ch.wq;
      };
      pendingStreamChannels.push(channelId);
      await send(openOk({ channelId, dataMode: 'stream', capabilities: ['signal'], sessionId: crypto.randomUUID(), token: randomBytes(16) }));
      log(`exec channel ${channelId}: ${command}`);
      const io = { ...baseIo(ch, false), write };
      const code = await runCommand(command, io).catch(async (e) => { await write(`error: ${e.message}\n`); return 1; });
      if (!ch.stream) await Promise.race([new Promise((r) => ch.boundWaiters.push(r)), sleep(3000)]);
      await ch.wq;
      try { await ch.stream?.close(); } catch { /* */ }
      if (!channels.has(channelId) || conn.closed) return;
      await send(exitMsg({ channelId, code }));
      await sleep(250);
      channels.delete(channelId);
      await send(closeMsg({ channelId }));
    }

    async function openFile(m) {
      const spec = String(m.command ?? '');
      const mm = spec.match(/^(upload|download):(.*)$/);
      if (!mm) return send(openFail({ reason: 'file channel expects upload:<path> or download:<path>' }));
      let name;
      try { name = safeName(mm[2]); } catch (e) { return send(openFail({ reason: e.message })); }
      const channelId = ++conn.nextChannel;
      if (mm[1] === 'download') {
        const data = await vfs.read(name);
        if (!data) return send(openFail({ reason: `${name}: no such file in sandbox` }));
        channels.set(channelId, { kind: 'file', kill() {} });
        await send(openOk({ channelId, dataMode: 'virtual', capabilities: [] }));
        let off = 0;
        do {
          const end = Math.min(off + FILE_CHUNK_BYTES, data.byteLength);
          await send(fileChunk({ channelId, offset: off, data: data.subarray(off, end), isFinal: end >= data.byteLength, totalSize: data.byteLength }));
          off = end;
        } while (off < data.byteLength);
        log(`download ${name} (${data.byteLength} B)`);
        return;
      }
      const ch = { kind: 'file', buf: null, got: 0, kill() {} };
      channels.set(channelId, ch);
      const done = async (code, why) => {
        if (why) log(`upload ${name}: ${why}`);
        await send(exitMsg({ channelId, code }));
        channels.delete(channelId);
        await send(closeMsg({ channelId }));
      };
      ch.chunk = async (c) => {
        const total = Number(c.total_size ?? 0);
        if (total > MAX_FILE_BYTES) return done(1, `refused: ${total} B exceeds ${MAX_FILE_BYTES} B`);
        if (!ch.buf) {
          const existing = await vfs.list();
          if (existing.length >= MAX_FILES && !existing.some((f) => f.name === name)) return done(1, 'refused: sandbox is full');
          ch.buf = new Uint8Array(total);
        }
        const data = c.data instanceof Uint8Array ? c.data : new Uint8Array(0);
        if (c.offset + data.byteLength > ch.buf.byteLength) return done(1, 'chunk past total_size');
        ch.buf.set(data, c.offset);
        ch.got += data.byteLength;
        if (c.is_final) {
          await vfs.write(name, ch.buf);
          return done(0, `stored ${ch.buf.byteLength} B`);
        }
      };
      await send(openOk({ channelId, dataMode: 'virtual', capabilities: [] }));
    }

    async function handleFileOp(m) {
      const channelId = m.channel_id;
      const reply = (success, metadata, errorMessage) => send(fileResult({ channelId, success, metadata, errorMessage }));
      try {
        switch (m.op) {
          case 'list': {
            const entries = (await vfs.list()).map((f) => ({ name: f.name, size: f.size, modified: Math.floor(f.mtime / 1000), type: 'file' }));
            return send(fileResult({ channelId, success: true, metadata: { path: '~/sandbox', host: where }, entries }));
          }
          case 'stat': {
            const name = safeName(m.path);
            const f = (await vfs.list()).find((e) => e.name === name);
            return f ? reply(true, f) : reply(false, {}, `${name}: no such file`);
          }
          case 'read': {
            const data = await vfs.read(m.path);
            if (!data) return reply(false, {}, 'no such file');
            const off = Math.max(0, m.offset ?? 0);
            const len = Math.min(64 * 1024, m.length ?? data.byteLength);
            return reply(true, { data: data.subarray(off, off + len), size: data.byteLength });
          }
          case 'remove': {
            const ok = await vfs.remove(m.path);
            return ok ? reply(true, { removed: safeName(m.path) }) : reply(false, {}, 'no such file');
          }
          default:
            return reply(false, {}, `"${m.op}" is not offered by this restricted host (list, stat, read, remove)`);
        }
      } catch (e) {
        return reply(false, {}, e.message);
      }
    }

    return {
      receive(bytes) { if (!conn.closed) qmux.receiveBytes(bytes); },
      close() { shutdown('transport closed'); },
      get username() { return conn.username; },
    };
  }

  return { attach, ready, get hostFingerprint() { return hostFp; } };
}

/* ------------------------------------------------------------------ */
/* Companion mount                                                     */
/* ------------------------------------------------------------------ */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { 'content-type': 'application/json' } });
}

/** Accepts base64 raw 32-byte Ed25519 public key, or an `ssh-ed25519 AAAA…` line. */
function parsePublicKey(input) {
  const s = String(input ?? '').trim();
  if (s.startsWith('ssh-ed25519')) {
    const parsed = parseSSHPublicKey(s);
    if (!parsed) throw new Error('bad ssh-ed25519 line');
    return extractRawFromSSHWire(parsed.data);
  }
  const raw = base64Decode(s);
  if (raw.byteLength !== 32) throw new Error(`expected a 32-byte Ed25519 key, got ${raw.byteLength} bytes`);
  return raw;
}

/**
 * The companion mount: the real `@johnhenry/wsh/server` host on its own port
 * (7780, like leserve's 7778 and servant's 7779), plus the small HTTP surface
 * on the companion the planet uses to drive it.
 */
/**
 * The companion mount: the real `@johnhenry/wsh/server` host on its own port
 * (7780, like leserve's 7778 and servant's 7779), plus the small HTTP surface
 * on the companion the planet uses to drive it.
 */
export async function mount(app) {
  const spec = (x) => x; // keep bundlers from following these into the browser build
  const fsp = await import(/* @vite-ignore */ spec('node:fs/promises'));
  const os = await import(/* @vite-ignore */ spec('node:os'));
  const path = await import(/* @vite-ignore */ spec('node:path'));
  const { createWshServer } = await import(/* @vite-ignore */ spec('@johnhenry/wsh/server'));

  const vfs = await nodeVfs();            // seeds the sandbox directory; `vfs.label` is its path
  const sandbox = vfs.label;
  const hostKeyFile = path.join(os.tmpdir(), 'orrery-wsh-host-key.pem');
  const hostname = process.env.ORRERY_HOST || '127.0.0.1';
  const t0 = Date.now();
  const where = `node ${process.version} ${process.platform}`;
  /** @type {Map<string, {username: string, at: number}>} */
  const allow = new Map();
  /** username -> fingerprint of the key that last authenticated as it (for `whoami`) */
  const lastFp = new Map();

  const restrictedExec = async (command, io) => runCommand(command, {
    pty: false, user: io.user, fp: lastFp.get(io.user) ?? '', vfs, hostname: 'companion', where, t0, sleep,
    cols: () => io.cols, cancelled: () => io.signal.aborted, write: (s) => io.write(s),
  });
  // A node-pty-shaped `spawn` whose "process" is the restricted line shell. The server passes
  // the client's `env`, which is how the shell learns the username (process.env is NOT used:
  // `pty.env` below is empty so the host's own USER never leaks to a client).
  const restrictedSpawn = (_file, _args, o) => {
    let onData = null; let onExit = () => {}; let started = false; let exited = false;
    const queue = [];
    const emit = (t) => { if (onData) onData(t); else queue.push(t); return Promise.resolve(); };
    const user = String(o.env?.USER || 'guest');
    const shell = createShell({
      user, fp: lastFp.get(user) ?? '', vfs, hostname: 'companion', where, t0,
      cols: o.cols, rows: o.rows, out: emit,
      onExit: (code) => { if (!exited) { exited = true; onExit({ exitCode: code }); } },
    });
    // The server registers onData/onExit synchronously after spawn() returns; start on the next tick.
    setTimeout(() => { started = true; void shell.start(); }, 0);
    return {
      onData(cb) { onData = cb; for (const q of queue.splice(0)) cb(q); },
      onExit(cb) { onExit = cb; },
      write: (d) => { if (started) shell.input(d); },
      resize: (c, r) => shell.resize(c, r),
      kill: () => { shell.kill(); if (!exited) { exited = true; onExit({ exitCode: 130 }); } },
    };
  };

  const build = () => createWshServer({
    host: hostname,
    port: PORT,
    // Ed25519 only: the planet registers its key with POST /wsh/authorize; `authorize` runs after the
    // signature verifies. No password login.
    auth: ({ username, fingerprint: fp }) => {
      if (!allow.has(fp)) return false;
      lastFp.set(username, fp);
      return true;
    },
    // A persisted host key, so trust-on-first-use is real across restarts (and rotating it is real too).
    hostKey: { file: hostKeyFile },
    exec: { run: restrictedExec },
    pty: { spawn: restrictedSpawn, env: {}, shell: 'restricted' },
    fs: { root: sandbox, maxFileBytes: MAX_FILE_BYTES },
    mcp: { tools: demoMcpTools(vfs) },
    onLog: (m) => console.log(`  [wsh] ${m}`),
  });

  let server = build();
  await server.listen();
  const hk = () => server.hostKey();
  console.log(`  [wsh] real @johnhenry/wsh/server host on ws://${hostname}:${PORT}  host key ${hk()?.fingerprint?.slice(0, 16)}…  sandbox ${sandbox}`);

  app.route('GET', '/wsh/info', async () => json({
    ws: `ws://${hostname}:${PORT}/`, port: PORT, sandbox, allowlist: allow.size,
    hostFingerprint: hk()?.fingerprint ?? null, hostKeyOpenssh: hk()?.openssh ?? null,
    commands: Object.keys(COMMANDS), tools: demoMcpTools(vfs).map((t) => t.name), maxFileBytes: MAX_FILE_BYTES,
    server: '@johnhenry/wsh/server',
    note: 'real wsh host; exec and pty run a restricted command set, never a real shell',
  }));

  // Dev convenience: the planet registers its key so the Ed25519 path is real.
  app.route('POST', '/wsh/authorize', async (req) => {
    try {
      const body = await req.json();
      const raw = parsePublicKey(body.publicKey);
      const fp = await fingerprint(raw);
      if (allow.size >= 512 && !allow.has(fp)) allow.delete(allow.keys().next().value);
      allow.set(fp, { username: String(body.username ?? ''), at: Date.now() });
      return json({ ok: true, fingerprint: fp, allowlist: allow.size });
    } catch (e) { return json({ ok: false, error: e.message }, 400); }
  });
  app.route('POST', '/wsh/revoke', async (req) => {
    try {
      const body = await req.json();
      const fp = body.fingerprint || (await fingerprint(parsePublicKey(body.publicKey)));
      const had = allow.delete(fp);
      return json({ ok: true, removed: had, allowlist: allow.size });
    } catch (e) { return json({ ok: false, error: e.message }, 400); }
  });
  // Really rotate the host key: drop the connections, delete the persisted key, start a new
  // server (new key, same port). A client that pinned the old key now gets HOST_KEY_MISMATCH.
  app.route('POST', '/wsh/rotate-host-key', async () => {
    const before = hk()?.fingerprint ?? null;
    await server.close();
    await fsp.rm(hostKeyFile, { force: true });
    server = build();
    await server.listen();
    return json({ ok: true, before, after: hk()?.fingerprint ?? null });
  });
}
