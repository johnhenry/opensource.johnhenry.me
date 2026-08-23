// Zero-dependency Chrome DevTools Protocol (CDP) client for Node.
//
// This talks to a already-running headless Chrome over its DevTools HTTP +
// WebSocket endpoints using ONLY Node's global `fetch` and `WebSocket` (Node 22+
// / Node 26 have both as globals). No puppeteer / chrome-remote-interface / ws
// dependency is added.
//
// It is used by the opt-in GPU render path (see ../node-gl.ts) to drive a real
// WebGL2 context inside Chrome (Mesa llvmpipe => no physical GPU needed) and pull
// the rendered video back into Node.
//
//   const cdp = await connectCDP("http://localhost:9222");
//   await cdp.navigate("http://127.0.0.1:1234/page.html");
//   await cdp.waitForLoad();
//   const r = await cdp.evaluate("1 + 1", { returnByValue: true });
//   await cdp.close();
//
// Node-only: relies on global fetch/WebSocket.
/// <reference types="node" />
/// <reference lib="dom" />
// A single connected DevTools session bound to one page target.
export class CDPSession {
    cdpUrl;
    targetId;
    ws; // WebSocket (global)
    nextId = 0;
    pending = new Map();
    loadFired = false;
    loadWaiters = [];
    closed = false;
    constructor(cdpUrl, targetId, ws) {
        this.cdpUrl = cdpUrl.replace(/\/+$/, "");
        this.targetId = targetId;
        this.ws = ws;
        ws.onmessage = (m) => {
            let msg;
            try {
                msg = JSON.parse(typeof m.data === "string" ? m.data : String(m.data));
            }
            catch {
                return;
            }
            if (msg.id != null && this.pending.has(msg.id)) {
                const { res, rej } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error)
                    rej(new Error("CDP error: " + JSON.stringify(msg.error)));
                else
                    res(msg.result);
                return;
            }
            // Events: track page load so waitForLoad() can resolve.
            if (msg.method === "Page.loadEventFired" || msg.method === "Page.frameStoppedLoading") {
                this.loadFired = true;
                const waiters = this.loadWaiters;
                this.loadWaiters = [];
                for (const w of waiters)
                    w();
            }
        };
        ws.onclose = () => {
            this.closed = true;
            const err = new Error("CDP websocket closed");
            for (const { rej } of this.pending.values())
                rej(err);
            this.pending.clear();
        };
    }
    // Send a raw CDP command and resolve with its `result`.
    send(method, params = {}) {
        if (this.closed)
            return Promise.reject(new Error("CDP session is closed"));
        return new Promise((res, rej) => {
            const id = ++this.nextId;
            this.pending.set(id, { res, rej });
            try {
                this.ws.send(JSON.stringify({ id, method, params }));
            }
            catch (e) {
                this.pending.delete(id);
                rej(e);
            }
        });
    }
    // Evaluate a JS expression in the page. Returns the raw Runtime.evaluate
    // result; with returnByValue the value is in `.result.value`.
    async evaluate(expression, opts = {}) {
        const result = await this.send("Runtime.evaluate", {
            expression,
            awaitPromise: opts.awaitPromise ?? false,
            returnByValue: opts.returnByValue ?? false,
            // Allow reading `window.__glResult` etc. without user-gesture gating.
            userGesture: true,
        });
        if (result?.exceptionDetails) {
            const d = result.exceptionDetails;
            const msg = d.exception?.description ?? d.text ?? JSON.stringify(d);
            throw new Error("Page evaluation threw: " + msg);
        }
        return result;
    }
    // Navigate the page. Resets the internal load flag so a following
    // waitForLoad() waits for THIS navigation.
    async navigate(url) {
        this.loadFired = false;
        await this.send("Page.navigate", { url });
    }
    // Resolve once the current page has fired its load event (or immediately if it
    // already has). Rejects after `timeoutMs`.
    waitForLoad(timeoutMs = 30000) {
        if (this.loadFired)
            return Promise.resolve();
        return new Promise((res, rej) => {
            let done = false;
            const timer = setTimeout(() => {
                if (done)
                    return;
                done = true;
                rej(new Error(`Timed out after ${timeoutMs}ms waiting for page load`));
            }, timeoutMs);
            this.loadWaiters.push(() => {
                if (done)
                    return;
                done = true;
                clearTimeout(timer);
                res();
            });
        });
    }
    // Close the page target and the websocket.
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        try {
            await fetch(`${this.cdpUrl}/json/close/${this.targetId}`).catch(() => { });
        }
        finally {
            try {
                this.ws.close();
            }
            catch { /* ignore */ }
        }
    }
}
// Create a fresh about:blank page target and open a websocket session to it.
// Uses the PUT form of /json/new (required by newer Chrome) with a GET fallback.
export async function connectCDP(cdpUrl) {
    const base = cdpUrl.replace(/\/+$/, "");
    const target = await createTarget(base);
    if (!target?.webSocketDebuggerUrl) {
        throw new Error("CDP: created target has no webSocketDebuggerUrl (got " + JSON.stringify(target) + ")");
    }
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
        ws.onopen = () => res();
        ws.onerror = (e) => rej(new Error("CDP websocket failed to open: " + (e?.message ?? String(e))));
    });
    const session = new CDPSession(base, target.id, ws);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    return session;
}
// Ask Chrome to open a new about:blank target. PUT first, GET fallback.
async function createTarget(base) {
    try {
        const r = await fetch(`${base}/json/new?about:blank`, { method: "PUT" });
        if (r.ok)
            return await r.json();
    }
    catch { /* fall through to GET */ }
    const r2 = await fetch(`${base}/json/new?about:blank`);
    return await r2.json();
}
// True if the CDP HTTP endpoint is reachable (i.e. a Chrome exposing DevTools
// is running at cdpUrl). Never throws.
export async function probeCDP(cdpUrl, timeoutMs = 3000) {
    const base = cdpUrl.replace(/\/+$/, "");
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const r = await fetch(`${base}/json/version`, { signal: ctrl.signal });
            if (!r.ok)
                return false;
            const v = await r.json();
            return typeof v?.webSocketDebuggerUrl === "string";
        }
        finally {
            clearTimeout(timer);
        }
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=cdp.js.map