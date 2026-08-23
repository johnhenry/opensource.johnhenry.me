import type { JobStore } from "./queue.ts";
import type { StorageDriver } from "./storage.ts";
import type { WebhookTransport } from "./webhooks.ts";
export interface CoordinatorOptions {
    /** Root directory of the deployed project; jobs may only reference scene
     *  files under it. REQUIRED. */
    projectDir: string;
    /** Queue db + artifacts live here (default <projectDir>/.ecmanim-service). */
    dataDir?: string;
    host?: string;
    port?: number;
    /** Client bearer token (default: env ECMANIM_API_TOKEN). */
    apiToken?: string;
    /** Worker bearer token (default: env ECMANIM_WORKER_TOKEN). */
    workerToken?: string;
    /** Claim lease duration (default 60s; heartbeats renew). */
    leaseMs?: number;
    sweepIntervalMs?: number;
    maxAttempts?: number;
    /** Injectables for tests. */
    store?: JobStore;
    storage?: StorageDriver;
    webhookTransport?: WebhookTransport;
    verbose?: boolean;
}
export interface Coordinator {
    url: string;
    port: number;
    store: JobStore;
    storage: StorageDriver;
    close(): Promise<void>;
}
export declare function startCoordinator(options: CoordinatorOptions): Promise<Coordinator>;
//# sourceMappingURL=coordinator.d.ts.map