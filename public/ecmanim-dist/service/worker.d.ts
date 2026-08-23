import type { JobRecord, JobProgress } from "./protocol.ts";
export interface RenderContext {
    /** Absolute, verified scene module path. */
    scenePath: string;
    /** Where the artifact must be written. */
    outputPath: string;
    onProgress(progress: JobProgress): void;
}
export type RenderImpl = (job: JobRecord, ctx: RenderContext) => Promise<void | {
    reusedPartials?: number;
}>;
export interface WorkerOptions {
    coordinatorUrl: string;
    projectDir: string;
    workerToken?: string;
    workerId?: string;
    /** Long-poll wait seconds per claim request (default 25). */
    pollWaitSec?: number;
    /** Heartbeat interval ms (default 15s — well under the 60s lease). */
    heartbeatMs?: number;
    /** Process one job (or one empty poll) then return — for tests/cron. */
    once?: boolean;
    /** Stable per-worker render cache root (default: <tmpdir>/ecmanim-worker-
     *  cache). Jobs for the same scene share it, so an identical resubmit
     *  reuses content-addressed partial movies instead of re-encoding. */
    cacheDir?: string;
    renderImpl?: RenderImpl;
    verbose?: boolean;
}
export declare class ServiceWorker {
    readonly workerId: string;
    private opts;
    private projectDir;
    private stopped;
    constructor(options: WorkerOptions);
    private api;
    /** Verify the job's scene path inside OUR copy of the project. */
    private scenePath;
    private processJob;
    /** Run the claim loop until stop() (or one cycle with `once`). */
    run(): Promise<void>;
    stop(): void;
}
//# sourceMappingURL=worker.d.ts.map