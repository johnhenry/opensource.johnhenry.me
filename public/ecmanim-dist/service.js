// ecmanim/service — the render service: a coordinator (HTTP control plane
// over a SQLite job queue) plus pull-model workers, signed webhooks, and
// pluggable artifact storage. See website/src/content/docs/guides/
// render-service.md for the security model and deployment guide.
export { startCoordinator } from "./service/coordinator.js";
export { ServiceWorker } from "./service/worker.js";
export { validateJobSpec, sanitizeRenderOptions, isUnsafeScenePath, artifactExtension, JOB_STATES, RENDER_OPTION_ALLOWLIST } from "./service/protocol.js";
export { SqliteJobStore, MemoryJobStore, DEFAULT_MAX_ATTEMPTS } from "./service/queue.js";
export { FsStorage } from "./service/storage.js";
export { createS3Storage } from "./service/storage-s3.js";
export { signWebhook, verifyWebhook, WebhookScheduler, SIGNATURE_HEADER, WEBHOOK_BACKOFF_MS } from "./service/webhooks.js";
//# sourceMappingURL=service.js.map