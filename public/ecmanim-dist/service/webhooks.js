// Signed webhooks (Stripe scheme): X-Ecmanim-Signature: t=<unix>,v1=<hmac>
// where the HMAC-SHA256 is computed over `${t}.${rawBody}`. Deliveries are
// durable rows in the JobStore; the scheduler retries on the classic
// 0s / 10s / 60s / 5m / 30m backoff with a 10s per-attempt timeout. The HTTP
// transport is injected so tests exercise every path without sockets.
import { createHmac, timingSafeEqual } from "node:crypto";
export const SIGNATURE_HEADER = "x-ecmanim-signature";
/** Retry delays (ms) AFTER each failed attempt; length = max attempts. */
export const WEBHOOK_BACKOFF_MS = [0, 10_000, 60_000, 300_000, 1_800_000];
export const WEBHOOK_TIMEOUT_MS = 10_000;
export function signWebhook(secret, rawBody, timestampSec) {
    const mac = createHmac("sha256", secret).update(`${timestampSec}.${rawBody}`).digest("hex");
    return `t=${timestampSec},v1=${mac}`;
}
/**
 * Verify a webhook signature header against the raw body. Rejects bad MACs
 * (constant-time compare) and timestamps outside `toleranceSec` (replay
 * window, default 5 minutes).
 */
export function verifyWebhook(secret, header, rawBody, opts = {}) {
    if (!header)
        return false;
    const parts = Object.fromEntries(header.split(",").map((kv) => {
        const i = kv.indexOf("=");
        return i === -1 ? [kv, ""] : [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }));
    const t = Number(parts.t);
    const v1 = parts.v1;
    if (!Number.isFinite(t) || !v1)
        return false;
    const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
    const tolerance = opts.toleranceSec ?? 300;
    if (Math.abs(now - t) > tolerance)
        return false;
    const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(v1, "hex");
    return a.length === b.length && b.length > 0 && timingSafeEqual(a, b);
}
const fetchTransport = async (url, init) => {
    const res = await fetch(url, init);
    return { status: res.status };
};
/**
 * Drains due webhook deliveries from the store: POST with the signature
 * header, mark delivered on 2xx, otherwise schedule the next backoff step
 * (or exhaust). `tick()` is the pure unit of work — call it directly in
 * tests; `start()`/`stop()` run it on an interval in the coordinator.
 */
export class WebhookScheduler {
    store;
    transport;
    backoff;
    timeoutMs;
    pollMs;
    now;
    timer = null;
    draining = false;
    constructor(store, options = {}) {
        this.store = store;
        this.transport = options.transport ?? fetchTransport;
        this.backoff = options.backoffMs ?? WEBHOOK_BACKOFF_MS;
        this.timeoutMs = options.timeoutMs ?? WEBHOOK_TIMEOUT_MS;
        this.pollMs = options.pollMs ?? 1000;
        this.now = options.now ?? Date.now;
    }
    /** Queue a job-event webhook (body is stored durably before any attempt). */
    enqueue(jobId, url, secret, payload) {
        return this.store.createDelivery(jobId, url, secret, JSON.stringify(payload));
    }
    async attempt(d) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const tsSec = Math.floor(this.now() / 1000);
            const headers = { "content-type": "application/json" };
            if (d.secret)
                headers[SIGNATURE_HEADER] = signWebhook(d.secret, d.body, tsSec);
            const res = await this.transport(d.url, { method: "POST", headers, body: d.body, signal: controller.signal });
            if (res.status >= 200 && res.status < 300) {
                this.store.markDelivered(d.id);
            }
            else {
                this.scheduleRetry(d, `HTTP ${res.status}`);
            }
        }
        catch (e) {
            this.scheduleRetry(d, e?.message ?? String(e));
        }
        finally {
            clearTimeout(timer);
        }
    }
    scheduleRetry(d, error) {
        const nextIndex = d.attempts + 1; // attempts BEFORE this failure was recorded
        const delay = this.backoff[nextIndex];
        this.store.markDeliveryFailed(d.id, error, delay == null ? null : this.now() + delay);
    }
    /** Attempt every due pending delivery once. Returns how many were tried. */
    async tick() {
        const due = this.store.duePendingDeliveries(this.now());
        for (const d of due)
            await this.attempt(d);
        return due.length;
    }
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            if (this.draining)
                return;
            this.draining = true;
            this.tick().finally(() => { this.draining = false; });
        }, this.pollMs);
        this.timer.unref?.();
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
//# sourceMappingURL=webhooks.js.map