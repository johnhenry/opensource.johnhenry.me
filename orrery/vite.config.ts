import { defineConfig, type Plugin } from 'vite';

/**
 * @johnhenry/dialback's Agent/Server are Fetch-shaped and run fine in a browser, but
 * agent.mjs/server.mjs import a few Node modules at module scope (node:events for
 * Agent's base class; ws/http/node:crypto only used by Server#listen and the
 * shared-secret check). Shim them ONLY for importers inside that package.
 */
function dialbackNodeShims(): Plugin {
  const V = '\0dialback-shim:';
  const inPkg = (importer?: string) => !!importer && importer.includes('/@johnhenry/dialback/');
  const src: Record<string, string> = {
    events: `export default class EventEmitter {
  constructor(){ this._l = new Map(); }
  on(e, f){ (this._l.get(e) || this._l.set(e, []).get(e)).push(f); return this; }
  addListener(e, f){ return this.on(e, f); }
  once(e, f){ const w = (...a) => { this.off(e, w); f(...a); }; return this.on(e, w); }
  off(e, f){ const l = this._l.get(e); if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } return this; }
  removeListener(e, f){ return this.off(e, f); }
  removeAllListeners(e){ e === undefined ? this._l.clear() : this._l.delete(e); return this; }
  emit(e, ...a){ const l = this._l.get(e); if (!l || !l.length) { if (e === 'error') console.warn('[dialback]', a[0]); return false; } for (const f of [...l]) f(...a); return true; }
}
export { EventEmitter };`,
    ws: `const WebSocket = globalThis.WebSocket;
export class WebSocketServer { constructor(){ throw new Error('WebSocketServer is Node-only'); } }
export default WebSocket;`,
    http: `export function createServer(){ throw new Error('http.createServer is Node-only (Server#listen); use server.fetch() instead'); }
export default { createServer };`,
    crypto: `export function timingSafeEqual(a, b){ if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }
export default { timingSafeEqual };`,
  };
  return {
    name: 'dialback-node-shims',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!inPkg(importer)) return null;
      const bare = id.replace(/^node:/, '');
      return bare in src ? V + bare : null;
    },
    load(id) {
      if (id.startsWith(V)) return src[id.slice(V.length)];
      return null;
    },
  };
}

/**
 * @johnhenry/math-grapher (the grapher room) imports only `randomUUID` from
 * node:crypto (session ids). Shim it ONLY for importers inside that package;
 * the package is excluded from pre-bundling so this runs in dev as well as build.
 */
function grapherNodeShims(): Plugin {
  const ID = '\0grapher-shim:crypto';
  return {
    name: 'grapher-node-shims',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer || !importer.includes('/@johnhenry/math-grapher/')) return null;
      return id === 'node:crypto' || id === 'crypto' ? ID : null;
    },
    load(id) {
      if (id !== ID) return null;
      return `export function randomUUID(){ return globalThis.crypto.randomUUID(); }
export default { randomUUID };`;
    },
  };
}

export default defineConfig({
  // Served at the domain root by default; the docs site builds it with --base=/orrery/ (hash routing, no rewrites needed).
  base: process.env.ORRERY_BASE || '/',
  plugins: [dialbackNodeShims(), grapherNodeShims()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    // ecmanim's Node-only fallbacks do `await import("@napi-rs/canvas")` (a native
    // .node addon). Never reached in the browser; keep rollup from bundling it.
    rollupOptions: { external: [/^@napi-rs\/canvas/] },
  },
  optimizeDeps: {
    exclude: ['@johnhenry/ecmanim', '@johnhenry/dialback', '@johnhenry/math-grapher'],
    include: ['isomorphic-git', 'buffer', '@johnhenry/laya', '@johnhenry/math-grapher > @modelcontextprotocol/sdk/server/mcp.js', '@johnhenry/math-grapher > zod', '@johnhenry/math-grapher > @johnhenry/math'],
  },
});
