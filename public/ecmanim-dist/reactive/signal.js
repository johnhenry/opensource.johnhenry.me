// A small signals-based reactivity core (inspired by SolidJS / Motion Canvas),
// offered as a cleaner alternative to manim's updater / always_redraw
// bookkeeping. It implements a classic push-pull dependency-tracking scheme:
//
//   - reading a signal registers the currently-running computation as a
//     dependent,
//   - writing a signal marks its dependents dirty and re-runs effects /
//     invalidates computeds.
//
// Integration helpers (`reactive`, `bind`, `signalTracker`) bridge signals to
// the existing Mobject / ValueTracker machinery so signals compose with the
// rest of the library and keep working during rendering via `update(dt)`.
import { ValueTracker } from "../mobject/value_tracker.js";
import { copyMemberwiseStyle } from "../mobject/copy_style.js";
// --- tracking state --------------------------------------------------------
// Stack of currently-running computations; the top is the "current" one that
// reads should register themselves against.
const computationStack = [];
function currentComputation() {
    return computationStack[computationStack.length - 1];
}
// Batching: while batching, notifications are collected and flushed once.
let batchDepth = 0;
const pendingComputations = new Set();
function scheduleComputation(c) {
    if (batchDepth > 0) {
        pendingComputations.add(c);
    }
    else {
        c.run();
    }
}
function flushPending() {
    const toRun = [...pendingComputations];
    pendingComputations.clear();
    for (const c of toRun)
        c.run();
}
/** Coalesce all writes inside `fn` into a single flush of dependents. */
export function batch(fn) {
    batchDepth++;
    try {
        return fn();
    }
    finally {
        batchDepth--;
        if (batchDepth === 0)
            flushPending();
    }
}
/** Run `fn` without registering any signal reads as dependencies. */
export function untrack(fn) {
    computationStack.push(undefined);
    try {
        return fn();
    }
    finally {
        computationStack.pop();
    }
}
// Wire the current computation up to a signal's dependent set (bidirectional so
// dependencies can be cleaned up before a recompute).
function subscribe(subscribers) {
    const c = currentComputation();
    if (!c)
        return;
    subscribers.add(c);
    c.deps.add(subscribers);
}
function cleanup(c) {
    for (const dep of c.deps)
        dep.delete(c);
    c.deps.clear();
}
// --- createSignal ----------------------------------------------------------
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
export function createSignal(initial) {
    let value = initial;
    const subscribers = new Set();
    function write(next) {
        if (Object.is(next, value))
            return value;
        value = next;
        // Notify a snapshot: computations may re-subscribe as they run.
        for (const c of [...subscribers])
            scheduleComputation(c);
        return value;
    }
    const signal = function (...args) {
        if (args.length === 0) {
            subscribe(subscribers);
            return value;
        }
        return write(args[0]);
    };
    signal.set = (next) => write(typeof next === "function" ? next(value) : next);
    signal.peek = () => value;
    return signal;
}
// --- computed --------------------------------------------------------------
/**
 * Create a memoized derived signal. It lazily recomputes only when read after
 * one of its dependencies changed; reading it inside another computation tracks
 * the dependency transitively.
 */
export function computed(fn) {
    let value;
    let dirty = true;
    const subscribers = new Set();
    const computation = {
        deps: new Set(),
        run() {
            // A dependency changed: mark dirty (recompute lazily on next read) and
            // propagate to our own subscribers.
            if (!dirty) {
                dirty = true;
                for (const c of [...subscribers])
                    scheduleComputation(c);
            }
        },
    };
    function recompute() {
        cleanup(computation);
        computationStack.push(computation);
        try {
            value = fn();
        }
        finally {
            computationStack.pop();
        }
        dirty = false;
    }
    const read = function () {
        subscribe(subscribers);
        if (dirty)
            recompute();
        return value;
    };
    read.peek = () => {
        if (dirty)
            recompute();
        return value;
    };
    return read;
}
// --- effect ----------------------------------------------------------------
/**
 * Run `fn` immediately, then re-run it whenever any signal it read changes.
 * Returns a disposer that stops future runs and releases dependencies.
 */
export function effect(fn) {
    let disposed = false;
    const computation = {
        deps: new Set(),
        run() {
            if (disposed)
                return;
            cleanup(computation);
            computationStack.push(computation);
            try {
                fn();
            }
            finally {
                computationStack.pop();
            }
        },
    };
    computation.run();
    return () => {
        disposed = true;
        cleanup(computation);
    };
}
// --- integration: reactive (always_redraw for signals) ---------------------
/**
 * Like manim's `always_redraw`, but driven by signals. Builds the mobject once,
 * then rebuilds/rebinds it whenever any signal read inside `fn` changes.
 *
 * An internal effect marks the mobject dirty only when a dependency actually
 * changes (not every frame). The applied rebuild happens on `update(dt)` so it
 * also works during rendering, where signals may be driven by animations.
 */
export function reactive(fn) {
    // Build once, tracking dependencies via the effect below.
    let fresh = null;
    let dirty = false;
    let current;
    let first = true;
    // The effect tracks whatever signals `fn` reads; on any change it flags the
    // wrapper as dirty (and captures the freshly-built mobject to copy from).
    effect(() => {
        fresh = fn();
        if (first) {
            first = false;
        }
        else {
            dirty = true;
        }
    });
    current = fresh;
    function apply() {
        if (!fresh)
            return;
        current.points = fresh.points;
        current.submobjects = fresh.submobjects;
        // Copy every style field (not a hardcoded allowlist) so custom fields on
        // a user's Mobject subclass rebuild correctly too.
        copyMemberwiseStyle(current, fresh);
    }
    current.addUpdater((_mob) => {
        if (dirty) {
            apply();
            dirty = false;
        }
    });
    return current;
}
// --- integration: bind -----------------------------------------------------
/**
 * Attach an updater that assigns `mobject[prop] = signal()` on every
 * `update(dt)`, a simple one-way property binding from a signal (or computed).
 */
export function bind(mobject, prop, signalOrComputed) {
    mobject.addUpdater((mob) => {
        mob[prop] = signalOrComputed.peek();
    });
    return mobject;
}
// --- integration: signalTracker --------------------------------------------
/**
 * Adapt a numeric signal so it behaves like a `ValueTracker`
 * (`getValue`/`setValue` delegate to the signal). This lets signals drive the
 * existing animation machinery. The returned object is a real `ValueTracker`
 * whose value stays mirrored to the signal in both directions.
 *
 * Note: a `ValueTracker` can equally *drive* a signal — create an effect that
 * reads the tracker's value and writes the signal.
 */
export function signalTracker(signal) {
    const tracker = new ValueTracker(signal.peek());
    // Keep the tracker's stored point mirrored to the signal.
    effect(() => {
        tracker.setValue(signal());
    });
    // Override so writes flow back into the signal (keeping animations working).
    tracker.setValue = function (v) {
        this.points[0][0] = v;
        if (!Object.is(signal.peek(), v))
            signal.set(v);
        return this;
    };
    return tracker;
}
//# sourceMappingURL=signal.js.map