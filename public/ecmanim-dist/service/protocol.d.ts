export declare const JOB_STATES: readonly ["queued", "claimed", "running", "uploading", "done", "failed", "canceled"];
export type JobState = (typeof JOB_STATES)[number];
/** Render options a job may set — an ALLOWLIST, never a spread of raw user
 *  JSON into RenderOptions (which accepts arbitrary keys, incl. `output`). */
export declare const RENDER_OPTION_ALLOWLIST: Record<string, "string" | "number" | "boolean" | "resolution" | "params">;
/** Formats the v1 service can produce. `renderer: "webgl"` (renderGL) is
 *  rejected at validation — the service image ships no Chrome (documented). */
export declare const ALLOWED_FORMATS: Set<string>;
export interface WebhookSpec {
    url: string;
    /** HMAC secret for X-Ecmanim-Signature (optional but recommended). */
    secret?: string;
}
export interface ParallelismSpec {
    /** "none" (sequential render) | "workers" (renderParallel inside one
     *  worker). "segments" (cross-machine fan-out of ONE job) is RESERVED in
     *  the protocol and rejected in v1. */
    mode?: "none" | "workers" | "segments";
    workers?: number;
}
export interface JobSpec {
    /** Scene module path RELATIVE to the deployed project root. */
    scene: string;
    /** Export name within the module (default "default"). */
    exportName?: string;
    /** Scene params (validated by the scene's own static `schema` at render). */
    params?: Record<string, any>;
    /** Allowlisted render options. */
    render?: Record<string, any>;
    webhook?: WebhookSpec;
    priority?: number;
    parallelism?: ParallelismSpec;
}
export interface JobProgress {
    segmentsDone?: number;
    /** -1 when unknown (sequential renders discover segments as they go). */
    segmentsTotal?: number;
    /** Partial-movie segments reused from the content-addressed cache. */
    reusedPartials?: number;
}
export interface JobRecord {
    id: string;
    spec: JobSpec;
    state: JobState;
    priority: number;
    attempts: number;
    maxAttempts: number;
    createdAt: number;
    updatedAt: number;
    /** Epoch ms the current claim's lease expires (claimed/running only). */
    leaseExpiresAt: number | null;
    workerId: string | null;
    error: string | null;
    /** Storage key of the uploaded artifact (done only). */
    artifactKey: string | null;
    progress: JobProgress | null;
}
/** True when the path has a traversal/absolute/scheme shape. This is the
 *  node-free FIRST line; the coordinator re-checks with realpath. */
export declare function isUnsafeScenePath(p: string): boolean;
/**
 * Sanitize a job's `render` object down to the allowlist with per-key type
 * checks. Unknown keys and wrong-typed values are ERRORS (silently dropping
 * them would render something the submitter didn't ask for).
 */
export declare function sanitizeRenderOptions(raw: any, errors: string[]): Record<string, any>;
/**
 * Validate a raw submitted job body into a JobSpec. Returns the normalized
 * spec, or a list of errors (never both).
 */
export declare function validateJobSpec(raw: any): {
    spec?: JobSpec;
    errors: string[];
};
/** File extension the job's artifact will have. */
export declare function artifactExtension(spec: JobSpec): string;
//# sourceMappingURL=protocol.d.ts.map