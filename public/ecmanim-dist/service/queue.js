// The render-service job queue. JobStore is the seam: SqliteJobStore is the
// durable production control plane (node:sqlite, WAL, atomic
// UPDATE...RETURNING claims); MemoryJobStore backs fast tests and keeps the
// interface honest (the store test suite runs against BOTH). Liveness is
// lease-based: a claim grants a lease, heartbeat/progress renew it, and
// sweepExpiredLeases() requeues jobs whose worker went dark — up to
// maxAttempts, after which the job fails for good.
import { randomUUID } from "node:crypto";
export const DEFAULT_MAX_ATTEMPTS = 3;
// ---------------------------------------------------------------------------
// MemoryJobStore
// ---------------------------------------------------------------------------
export class MemoryJobStore {
    jobs = new Map();
    deliveries = new Map();
    createJob(spec, opts = {}) {
        const now = Date.now();
        const job = {
            id: randomUUID(),
            spec,
            state: "queued",
            priority: spec.priority ?? 0,
            attempts: 0,
            maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
            createdAt: now,
            updatedAt: now,
            leaseExpiresAt: null,
            workerId: null,
            error: null,
            artifactKey: null,
            progress: null,
        };
        this.jobs.set(job.id, job);
        return { ...job };
    }
    getJob(id) {
        const j = this.jobs.get(id);
        return j ? { ...j, spec: j.spec, progress: j.progress ? { ...j.progress } : null } : null;
    }
    listJobs(filter = {}) {
        return [...this.jobs.values()]
            .filter((j) => !filter.state || j.state === filter.state)
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((j) => ({ ...j }));
    }
    claimJob(workerId, leaseMs) {
        const queued = [...this.jobs.values()]
            .filter((j) => j.state === "queued")
            .sort((a, b) => (b.priority - a.priority) || (a.createdAt - b.createdAt));
        const job = queued[0];
        if (!job)
            return null;
        job.state = "claimed";
        job.workerId = workerId;
        job.attempts += 1;
        job.leaseExpiresAt = Date.now() + leaseMs;
        job.updatedAt = Date.now();
        return { ...job };
    }
    held(id, workerId) {
        const j = this.jobs.get(id);
        if (!j || j.workerId !== workerId)
            return null;
        if (!["claimed", "running", "uploading"].includes(j.state))
            return null;
        return j;
    }
    heartbeat(id, workerId, leaseMs, progress) {
        const j = this.held(id, workerId);
        if (!j)
            return false;
        if (j.state === "claimed")
            j.state = "running";
        j.leaseExpiresAt = Date.now() + leaseMs;
        if (progress)
            j.progress = { ...progress };
        j.updatedAt = Date.now();
        return true;
    }
    markUploading(id, workerId) {
        const j = this.held(id, workerId);
        if (!j)
            return false;
        j.state = "uploading";
        j.updatedAt = Date.now();
        return true;
    }
    completeJob(id, workerId, artifactKey) {
        const j = this.held(id, workerId);
        if (!j)
            return false;
        j.state = "done";
        j.artifactKey = artifactKey;
        j.leaseExpiresAt = null;
        j.updatedAt = Date.now();
        return true;
    }
    failJob(id, workerId, error) {
        const j = this.jobs.get(id);
        if (!j)
            return false;
        if (workerId != null && j.workerId !== workerId)
            return false;
        if (["done", "canceled", "failed"].includes(j.state))
            return false;
        j.error = error;
        if (j.attempts < j.maxAttempts) {
            j.state = "queued";
            j.workerId = null;
            j.leaseExpiresAt = null;
        }
        else {
            j.state = "failed";
            j.leaseExpiresAt = null;
        }
        j.updatedAt = Date.now();
        return true;
    }
    cancelJob(id) {
        const j = this.jobs.get(id);
        if (!j || ["done", "failed", "canceled"].includes(j.state))
            return false;
        j.state = "canceled";
        j.leaseExpiresAt = null;
        j.updatedAt = Date.now();
        return true;
    }
    sweepExpiredLeases(now = Date.now()) {
        let requeued = 0;
        for (const j of this.jobs.values()) {
            if (["claimed", "running", "uploading"].includes(j.state) && j.leaseExpiresAt != null && j.leaseExpiresAt <= now) {
                this.failJob(j.id, j.workerId, "lease expired (worker went dark)");
                requeued++;
            }
        }
        return requeued;
    }
    createDelivery(jobId, url, secret, body) {
        const d = {
            id: randomUUID(), jobId, url, secret, body,
            attempts: 0, nextAttemptAt: Date.now(), state: "pending", lastError: null,
        };
        this.deliveries.set(d.id, d);
        return { ...d };
    }
    duePendingDeliveries(now = Date.now()) {
        return [...this.deliveries.values()]
            .filter((d) => d.state === "pending" && d.nextAttemptAt <= now)
            .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)
            .map((d) => ({ ...d }));
    }
    markDelivered(id) {
        const d = this.deliveries.get(id);
        if (d) {
            d.state = "delivered";
        }
    }
    markDeliveryFailed(id, error, nextAttemptAt) {
        const d = this.deliveries.get(id);
        if (!d)
            return;
        d.attempts += 1;
        d.lastError = error;
        if (nextAttemptAt == null)
            d.state = "exhausted";
        else
            d.nextAttemptAt = nextAttemptAt;
    }
    close() { }
}
// ---------------------------------------------------------------------------
// SqliteJobStore
// ---------------------------------------------------------------------------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  spec TEXT NOT NULL,
  state TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_ATTEMPTS},
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  lease_expires_at INTEGER,
  worker_id TEXT,
  error TEXT,
  artifact_key TEXT,
  progress TEXT,
  -- RESERVED for parallelism.mode="segments" (cross-machine single-job
  -- fan-out): nullable from day one so v2 needs no migration.
  segment_manifest TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state, priority DESC, created_at ASC);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  body TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_deliveries_due ON webhook_deliveries(state, next_attempt_at);
`;
function rowToJob(row) {
    return {
        id: row.id,
        spec: JSON.parse(row.spec),
        state: row.state,
        priority: Number(row.priority),
        attempts: Number(row.attempts),
        maxAttempts: Number(row.max_attempts),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        leaseExpiresAt: row.lease_expires_at == null ? null : Number(row.lease_expires_at),
        workerId: row.worker_id ?? null,
        error: row.error ?? null,
        artifactKey: row.artifact_key ?? null,
        progress: row.progress ? JSON.parse(row.progress) : null,
    };
}
function rowToDelivery(row) {
    return {
        id: row.id,
        jobId: row.job_id,
        url: row.url,
        secret: row.secret ?? null,
        body: row.body,
        attempts: Number(row.attempts),
        nextAttemptAt: Number(row.next_attempt_at),
        state: row.state,
        lastError: row.last_error ?? null,
    };
}
export class SqliteJobStore {
    db;
    constructor(path) {
        // Dynamic require keeps node:sqlite out of the import graph for tooling
        // that walks imports without running (the module IS node-only anyway).
        const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
        this.db = new DatabaseSync(path);
        this.db.exec("PRAGMA journal_mode = WAL;");
        this.db.exec(SCHEMA);
    }
    createJob(spec, opts = {}) {
        const now = Date.now();
        const id = randomUUID();
        this.db.prepare(`INSERT INTO jobs (id, spec, state, priority, attempts, max_attempts, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, 0, ?, ?, ?)`).run(id, JSON.stringify(spec), spec.priority ?? 0, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, now, now);
        return this.getJob(id);
    }
    getJob(id) {
        const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
        return row ? rowToJob(row) : null;
    }
    listJobs(filter = {}) {
        const rows = filter.state
            ? this.db.prepare("SELECT * FROM jobs WHERE state = ? ORDER BY created_at DESC").all(filter.state)
            : this.db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all();
        return rows.map(rowToJob);
    }
    claimJob(workerId, leaseMs) {
        const now = Date.now();
        // Atomic claim: one statement, so two workers can't take the same job.
        const row = this.db.prepare(`UPDATE jobs SET state='claimed', worker_id=?, attempts=attempts+1,
                      lease_expires_at=?, updated_at=?
       WHERE id = (SELECT id FROM jobs WHERE state='queued'
                   ORDER BY priority DESC, created_at ASC LIMIT 1)
       RETURNING *`).get(workerId, now + leaseMs, now);
        return row ? rowToJob(row) : null;
    }
    heartbeat(id, workerId, leaseMs, progress) {
        const now = Date.now();
        const res = this.db.prepare(`UPDATE jobs SET state = CASE WHEN state='claimed' THEN 'running' ELSE state END,
                      lease_expires_at=?, updated_at=?,
                      progress = COALESCE(?, progress)
       WHERE id=? AND worker_id=? AND state IN ('claimed','running','uploading')`).run(now + leaseMs, now, progress ? JSON.stringify(progress) : null, id, workerId);
        return res.changes > 0;
    }
    markUploading(id, workerId) {
        const res = this.db.prepare(`UPDATE jobs SET state='uploading', updated_at=?
       WHERE id=? AND worker_id=? AND state IN ('claimed','running','uploading')`).run(Date.now(), id, workerId);
        return res.changes > 0;
    }
    completeJob(id, workerId, artifactKey) {
        const res = this.db.prepare(`UPDATE jobs SET state='done', artifact_key=?, lease_expires_at=NULL, updated_at=?
       WHERE id=? AND worker_id=? AND state IN ('claimed','running','uploading')`).run(artifactKey, Date.now(), id, workerId);
        return res.changes > 0;
    }
    failJob(id, workerId, error) {
        const now = Date.now();
        const res = workerId != null
            ? this.db.prepare(`UPDATE jobs SET
             state = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
             worker_id = CASE WHEN attempts < max_attempts THEN NULL ELSE worker_id END,
             lease_expires_at = NULL, error=?, updated_at=?
           WHERE id=? AND worker_id=? AND state IN ('claimed','running','uploading')`).run(error, now, id, workerId)
            : this.db.prepare(`UPDATE jobs SET
             state = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
             worker_id = CASE WHEN attempts < max_attempts THEN NULL ELSE worker_id END,
             lease_expires_at = NULL, error=?, updated_at=?
           WHERE id=? AND state IN ('queued','claimed','running','uploading')`).run(error, now, id);
        return res.changes > 0;
    }
    cancelJob(id) {
        const res = this.db.prepare(`UPDATE jobs SET state='canceled', lease_expires_at=NULL, updated_at=?
       WHERE id=? AND state NOT IN ('done','failed','canceled')`).run(Date.now(), id);
        return res.changes > 0;
    }
    sweepExpiredLeases(now = Date.now()) {
        const res = this.db.prepare(`UPDATE jobs SET
         state = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
         worker_id = CASE WHEN attempts < max_attempts THEN NULL ELSE worker_id END,
         error = 'lease expired (worker went dark)',
         lease_expires_at = NULL, updated_at=?
       WHERE state IN ('claimed','running','uploading') AND lease_expires_at <= ?`).run(now, now);
        return res.changes;
    }
    createDelivery(jobId, url, secret, body) {
        const id = randomUUID();
        this.db.prepare(`INSERT INTO webhook_deliveries (id, job_id, url, secret, body, attempts, next_attempt_at, state)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'pending')`).run(id, jobId, url, secret, body, Date.now());
        return rowToDelivery(this.db.prepare("SELECT * FROM webhook_deliveries WHERE id=?").get(id));
    }
    duePendingDeliveries(now = Date.now()) {
        return this.db.prepare("SELECT * FROM webhook_deliveries WHERE state='pending' AND next_attempt_at <= ? ORDER BY next_attempt_at ASC").all(now).map(rowToDelivery);
    }
    markDelivered(id) {
        this.db.prepare("UPDATE webhook_deliveries SET state='delivered' WHERE id=?").run(id);
    }
    markDeliveryFailed(id, error, nextAttemptAt) {
        if (nextAttemptAt == null) {
            this.db.prepare("UPDATE webhook_deliveries SET attempts=attempts+1, last_error=?, state='exhausted' WHERE id=?").run(error, id);
        }
        else {
            this.db.prepare("UPDATE webhook_deliveries SET attempts=attempts+1, last_error=?, next_attempt_at=? WHERE id=?").run(error, nextAttemptAt, id);
        }
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=queue.js.map