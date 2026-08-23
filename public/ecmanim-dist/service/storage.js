// Artifact storage behind a driver interface. FsStorage is v1 (coordinator
// local disk); S3Storage arrives via lazy @aws-sdk import in storage-s3.ts
// (optionalDependencies pattern) without touching this interface.
import { createReadStream, createWriteStream, mkdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
/** Keys are `<jobId>/<filename>`; both segments are sanitized (separators
 *  AND dot-runs neutralized, so a key can never spell a traversal). */
function safeKeySegment(s) {
    return s.replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
}
export class FsStorage {
    root;
    constructor(root) {
        this.root = resolve(root);
        mkdirSync(this.root, { recursive: true });
    }
    keyPath(key) {
        const p = resolve(this.root, key);
        if (p !== this.root && !p.startsWith(this.root + sep)) {
            throw new Error(`FsStorage: key escapes storage root: ${JSON.stringify(key)}`);
        }
        return p;
    }
    async put(jobId, filename, data) {
        const key = `${safeKeySegment(jobId)}/${safeKeySegment(filename)}`;
        const path = this.keyPath(key);
        mkdirSync(join(this.root, safeKeySegment(jobId)), { recursive: true });
        await pipeline(data, createWriteStream(path));
        return key;
    }
    getStream(key) {
        return createReadStream(this.keyPath(key));
    }
    size(key) {
        return statSync(this.keyPath(key)).size;
    }
    exists(key) {
        return existsSync(this.keyPath(key));
    }
    localPath(key) {
        return this.keyPath(key);
    }
}
//# sourceMappingURL=storage.js.map