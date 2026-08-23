import type { Readable } from "node:stream";
export interface StorageDriver {
    /** Persist an artifact stream under a job-scoped key; returns the key. */
    put(jobId: string, filename: string, data: Readable): Promise<string>;
    /** Open the stored artifact for reading. */
    getStream(key: string): Readable;
    /** Byte size of a stored artifact. */
    size(key: string): number;
    exists(key: string): boolean | Promise<boolean>;
    /** Local filesystem path when the driver has one (FsStorage); S3-style
     *  drivers return null and the coordinator redirects instead. */
    localPath(key: string): string | null;
}
export declare class FsStorage implements StorageDriver {
    readonly root: string;
    constructor(root: string);
    private keyPath;
    put(jobId: string, filename: string, data: Readable): Promise<string>;
    getStream(key: string): Readable;
    size(key: string): number;
    exists(key: string): boolean;
    localPath(key: string): string | null;
}
//# sourceMappingURL=storage.d.ts.map