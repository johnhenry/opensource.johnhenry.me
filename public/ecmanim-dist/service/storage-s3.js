// S3-backed artifact storage. @aws-sdk/client-s3 and
// @aws-sdk/s3-request-presigner are lazy-imported (same optional-dependency
// pattern as the physics/rapier loaders) — installing them is only needed
// when S3Storage is actually constructed via createS3Storage().
//
// Downloads don't proxy through the coordinator: S3Storage implements
// presignGetUrl(), and the coordinator's artifact route 302-redirects to the
// presigned URL instead of streaming bytes itself.
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
function safeKeySegment(s) {
    return s.replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
}
export async function createS3Storage(options) {
    const prefix = options.prefix ?? "ecmanim-artifacts/";
    const ttl = options.presignTtlSec ?? 3600;
    let client = options.client;
    let commands = options.commands;
    let presigner = options.presigner;
    if (!client || !commands || !presigner) {
        // Non-literal specifiers keep TS from demanding the (optional, not
        // installed by default) AWS SDK's types at compile time.
        const importOptional = (name) => import(__rewriteRelativeImportExtension(/* @vite-ignore */ name));
        let s3mod, presignMod;
        try {
            s3mod = await importOptional("@aws-sdk/client-s3");
            presignMod = await importOptional("@aws-sdk/s3-request-presigner");
        }
        catch (e) {
            throw new Error("S3 storage requires the AWS SDK. Install it with:\n" +
                "  npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner\n" +
                "Original error: " + e.message);
        }
        client = client ?? new s3mod.S3Client(options.region ? { region: options.region } : {});
        commands = commands ?? {
            PutObjectCommand: s3mod.PutObjectCommand,
            GetObjectCommand: s3mod.GetObjectCommand,
            HeadObjectCommand: s3mod.HeadObjectCommand,
        };
        presigner = presigner ?? ((c, cmd, opts) => presignMod.getSignedUrl(c, cmd, opts));
    }
    const fullKey = (key) => `${prefix}${key}`;
    return {
        async put(jobId, filename, data) {
            const key = `${safeKeySegment(jobId)}/${safeKeySegment(filename)}`;
            // Buffer the stream: S3 PutObject wants a known length (multipart is
            // overkill at typical artifact sizes; revisit if artifacts grow).
            const chunks = [];
            for await (const c of data)
                chunks.push(c);
            await client.send(new commands.PutObjectCommand({
                Bucket: options.bucket, Key: fullKey(key), Body: Buffer.concat(chunks),
            }));
            return key;
        },
        getStream() {
            throw new Error("S3Storage: use presignGetUrl() — the coordinator redirects instead of streaming");
        },
        size() {
            throw new Error("S3Storage: size is not tracked locally");
        },
        exists(key) {
            return client.send(new commands.HeadObjectCommand({ Bucket: options.bucket, Key: fullKey(key) }))
                .then(() => true, () => false);
        },
        localPath() {
            return null;
        },
        presignGetUrl(key) {
            return presigner(client, new commands.GetObjectCommand({ Bucket: options.bucket, Key: fullKey(key) }), { expiresIn: ttl });
        },
    };
}
//# sourceMappingURL=storage-s3.js.map