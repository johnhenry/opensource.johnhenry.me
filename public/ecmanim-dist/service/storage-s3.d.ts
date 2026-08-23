import type { StorageDriver } from "./storage.ts";
export interface S3StorageOptions {
    bucket: string;
    /** Key prefix inside the bucket (default "ecmanim-artifacts/"). */
    prefix?: string;
    region?: string;
    /** Presigned-GET validity in seconds (default 3600). */
    presignTtlSec?: number;
    /** Injectable clients for tests. */
    client?: any;
    presigner?: (client: any, command: any, opts: {
        expiresIn: number;
    }) => Promise<string>;
    commands?: {
        PutObjectCommand: any;
        GetObjectCommand: any;
        HeadObjectCommand: any;
    };
}
export interface S3StorageDriver extends StorageDriver {
    presignGetUrl(key: string): Promise<string>;
}
export declare function createS3Storage(options: S3StorageOptions): Promise<S3StorageDriver>;
//# sourceMappingURL=storage-s3.d.ts.map