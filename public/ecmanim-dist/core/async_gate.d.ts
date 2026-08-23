/**
 * Remotion-style async-asset gate.
 *
 * A standalone registry of pending render blockers. A renderer can call
 * `waitForRender()` to block until every registered blocker has been released
 * (or a timeout elapses). Self-contained and safe in both Node and the browser
 * (no node-only imports).
 */
export interface DelayHandle {
    id: number;
    label: string;
    createdAt: number;
}
/** Register a pending render blocker. Returns a handle to release later. */
export declare function delayRender(label?: string): DelayHandle;
/** Release a previously-registered blocker. */
export declare function continueRender(handle: DelayHandle): void;
/**
 * Register an existing promise as a blocker. Delays render until the promise
 * settles (success OR failure), then releases the blocker. Returns the same
 * promise so callers can chain.
 */
export declare function delayRenderUntil<T>(promise: Promise<T>, label?: string): Promise<T>;
/**
 * Resolve when all pending blockers are cleared. Rejects if `timeoutMs` elapses
 * while blockers remain, with an error naming the still-pending labels.
 * Resolves immediately if nothing is pending.
 */
export declare function waitForRender(timeoutMs?: number): Promise<void>;
/** Introspection: list currently pending handles. */
export declare function getPendingRenders(): DelayHandle[];
/** Test helper: clear all pending blockers and waiters. */
export declare function _resetRenderGate(): void;
//# sourceMappingURL=async_gate.d.ts.map