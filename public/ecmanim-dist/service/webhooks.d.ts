import type { JobStore, WebhookDelivery } from "./queue.ts";
export declare const SIGNATURE_HEADER = "x-ecmanim-signature";
/** Retry delays (ms) AFTER each failed attempt; length = max attempts. */
export declare const WEBHOOK_BACKOFF_MS: number[];
export declare const WEBHOOK_TIMEOUT_MS = 10000;
export declare function signWebhook(secret: string, rawBody: string, timestampSec: number): string;
/**
 * Verify a webhook signature header against the raw body. Rejects bad MACs
 * (constant-time compare) and timestamps outside `toleranceSec` (replay
 * window, default 5 minutes).
 */
export declare function verifyWebhook(secret: string, header: string | undefined | null, rawBody: string, opts?: {
    toleranceSec?: number;
    nowSec?: number;
}): boolean;
export type WebhookTransport = (url: string, init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
}) => Promise<{
    status: number;
}>;
export interface WebhookSchedulerOptions {
    transport?: WebhookTransport;
    backoffMs?: number[];
    timeoutMs?: number;
    /** Poll interval for due deliveries when running via start() (default 1s). */
    pollMs?: number;
    now?: () => number;
}
/**
 * Drains due webhook deliveries from the store: POST with the signature
 * header, mark delivered on 2xx, otherwise schedule the next backoff step
 * (or exhaust). `tick()` is the pure unit of work — call it directly in
 * tests; `start()`/`stop()` run it on an interval in the coordinator.
 */
export declare class WebhookScheduler {
    private store;
    private transport;
    private backoff;
    private timeoutMs;
    private pollMs;
    private now;
    private timer;
    private draining;
    constructor(store: JobStore, options?: WebhookSchedulerOptions);
    /** Queue a job-event webhook (body is stored durably before any attempt). */
    enqueue(jobId: string, url: string, secret: string | null, payload: object): WebhookDelivery;
    private attempt;
    private scheduleRetry;
    /** Attempt every due pending delivery once. Returns how many were tried. */
    tick(): Promise<number>;
    start(): void;
    stop(): void;
}
//# sourceMappingURL=webhooks.d.ts.map