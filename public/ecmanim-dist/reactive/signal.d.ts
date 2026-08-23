import { Mobject } from "../mobject/Mobject.ts";
import { ValueTracker } from "../mobject/value_tracker.ts";
/**
 * A readable/writable reactive value.
 * `s()` reads (and tracks), `s(v)` / `s.set(v)` writes, `s.set(fn)` updates
 * functionally, `s.peek()` reads without tracking.
 */
export interface Signal<T> {
    (): T;
    (next: T): T;
    set(next: T | ((prev: T) => T)): T;
    peek(): T;
}
/** A read-only reactive value derived from other signals. */
export interface ReadonlySignal<T> {
    (): T;
    peek(): T;
}
/** Coalesce all writes inside `fn` into a single flush of dependents. */
export declare function batch<T>(fn: () => T): T;
/** Run `fn` without registering any signal reads as dependencies. */
export declare function untrack<T>(fn: () => T): T;
/**
 * Create a writable reactive signal.
 *
 * ```ts
 * const s = createSignal(0);
 * s();          // read (tracks the current computation)
 * s(5);         // write
 * s.set(5);     // write
 * s.set(v => v + 1); // functional update
 * s.peek();     // read without tracking
 * ```
 */
export declare function createSignal<T>(initial: T): Signal<T>;
/**
 * Create a memoized derived signal. It lazily recomputes only when read after
 * one of its dependencies changed; reading it inside another computation tracks
 * the dependency transitively.
 */
export declare function computed<T>(fn: () => T): ReadonlySignal<T>;
/**
 * Run `fn` immediately, then re-run it whenever any signal it read changes.
 * Returns a disposer that stops future runs and releases dependencies.
 */
export declare function effect(fn: () => void): () => void;
/**
 * Like manim's `always_redraw`, but driven by signals. Builds the mobject once,
 * then rebuilds/rebinds it whenever any signal read inside `fn` changes.
 *
 * An internal effect marks the mobject dirty only when a dependency actually
 * changes (not every frame). The applied rebuild happens on `update(dt)` so it
 * also works during rendering, where signals may be driven by animations.
 */
export declare function reactive(fn: () => Mobject): Mobject;
/**
 * Attach an updater that assigns `mobject[prop] = signal()` on every
 * `update(dt)`, a simple one-way property binding from a signal (or computed).
 */
export declare function bind<M extends Mobject, K extends keyof M>(mobject: M, prop: K, signalOrComputed: ReadonlySignal<M[K]>): M;
/**
 * Adapt a numeric signal so it behaves like a `ValueTracker`
 * (`getValue`/`setValue` delegate to the signal). This lets signals drive the
 * existing animation machinery. The returned object is a real `ValueTracker`
 * whose value stays mirrored to the signal in both directions.
 *
 * Note: a `ValueTracker` can equally *drive* a signal — create an effect that
 * reads the tracker's value and writes the signal.
 */
export declare function signalTracker(signal: Signal<number>): ValueTracker;
//# sourceMappingURL=signal.d.ts.map