import type { JobRecord, JobSpec, JobState, JobProgress } from "./protocol.ts";
export interface WebhookDelivery {
    id: string;
    jobId: string;
    url: string;
    secret: string | null;
    /** JSON payload to POST. */
    body: string;
    attempts: number;
    /** Epoch ms of the next allowed attempt. */
    nextAttemptAt: number;
    state: "pending" | "delivered" | "exhausted";
    lastError: string | null;
}
export interface JobStore {
    createJob(spec: JobSpec, opts?: {
        maxAttempts?: number;
    }): JobRecord;
    getJob(id: string): JobRecord | null;
    listJobs(filter?: {
        state?: JobState;
    }): JobRecord[];
    /** Atomically claim the highest-priority oldest queued job. */
    claimJob(workerId: string, leaseMs: number): JobRecord | null;
    /** Renew the lease (and optionally update progress); false if the claim is
     *  no longer held by this worker. Also moves claimed → running. */
    heartbeat(id: string, workerId: string, leaseMs: number, progress?: JobProgress): boolean;
    /** Mark uploading (artifact transfer started). */
    markUploading(id: string, workerId: string): boolean;
    completeJob(id: string, workerId: string, artifactKey: string): boolean;
    /** Failure: requeues while attempts < maxAttempts, else state=failed. */
    failJob(id: string, workerId: string | null, error: string): boolean;
    cancelJob(id: string): boolean;
    /** Requeue (or fail out) jobs whose lease expired. Returns requeued count. */
    sweepExpiredLeases(now?: number): number;
    createDelivery(jobId: string, url: string, secret: string | null, body: string): WebhookDelivery;
    /** Deliveries whose nextAttemptAt <= now, oldest first. */
    duePendingDeliveries(now?: number): WebhookDelivery[];
    markDelivered(id: string): void;
    /** Record a failed attempt; schedules the next per `nextAttemptAt`, or
     *  exhausts the delivery when attempts run out. */
    markDeliveryFailed(id: string, error: string, nextAttemptAt: number | null): void;
    close(): void;
}
export declare const DEFAULT_MAX_ATTEMPTS = 3;
export declare class MemoryJobStore implements JobStore {
    private jobs;
    private deliveries;
    createJob(spec: JobSpec, opts?: {
        maxAttempts?: number;
    }): JobRecord;
    getJob(id: string): JobRecord | null;
    listJobs(filter?: {
        state?: JobState;
    }): JobRecord[];
    claimJob(workerId: string, leaseMs: number): JobRecord | null;
    private held;
    heartbeat(id: string, workerId: string, leaseMs: number, progress?: JobProgress): boolean;
    markUploading(id: string, workerId: string): boolean;
    completeJob(id: string, workerId: string, artifactKey: string): boolean;
    failJob(id: string, workerId: string | null, error: string): boolean;
    cancelJob(id: string): boolean;
    sweepExpiredLeases(now?: number): number;
    createDelivery(jobId: string, url: string, secret: string | null, body: string): WebhookDelivery;
    duePendingDeliveries(now?: number): WebhookDelivery[];
    markDelivered(id: string): void;
    markDeliveryFailed(id: string, error: string, nextAttemptAt: number | null): void;
    close(): void;
}
export declare class SqliteJobStore implements JobStore {
    private db;
    constructor(path: string);
    createJob(spec: JobSpec, opts?: {
        maxAttempts?: number;
    }): JobRecord;
    getJob(id: string): JobRecord | null;
    listJobs(filter?: {
        state?: JobState;
    }): JobRecord[];
    claimJob(workerId: string, leaseMs: number): JobRecord | null;
    heartbeat(id: string, workerId: string, leaseMs: number, progress?: JobProgress): boolean;
    markUploading(id: string, workerId: string): boolean;
    completeJob(id: string, workerId: string, artifactKey: string): boolean;
    failJob(id: string, workerId: string | null, error: string): boolean;
    cancelJob(id: string): boolean;
    sweepExpiredLeases(now?: number): number;
    createDelivery(jobId: string, url: string, secret: string | null, body: string): WebhookDelivery;
    duePendingDeliveries(now?: number): WebhookDelivery[];
    markDelivered(id: string): void;
    markDeliveryFailed(id: string, error: string, nextAttemptAt: number | null): void;
    close(): void;
}
//# sourceMappingURL=queue.d.ts.map