// After-Effects-style expression / driver helpers: pure, composable, DETERMINISTIC
// functions of a scalar (usually time in seconds). Drive any mobject property from
// an updater — e.g. `mob.addUpdater(() => mob.rotate(wiggle(0.1, 3)(scene.time)))`.
//
// Everything here is a pure function of its input (same input → same output, in any
// order), so it composes with scrubbing and the deterministic render cache. No
// Date.now / Math.random — the only randomness is the seeded mulberry32 PRNG.
import { smooth } from "./rate_functions.js";
import { latticeValue1D, mulberry32 } from "../core/noise.js";
// mulberry32 has always been exported from here; keep that surface.
export { mulberry32 };
// Deterministic per-index value in [-1, 1] for a given seed. Pure of `i` (cached),
// so wiggle can be sampled at any t in any order. The lattice formula lives in
// core/noise.ts (latticeValue1D) — a bit-compatibility contract for wiggle.
function seededNoise(seed) {
    const cache = new Map();
    return (i) => {
        let v = cache.get(i);
        if (v === undefined) {
            v = latticeValue1D(seed, i);
            cache.set(i, v);
        }
        return v;
    };
}
/**
 * Value-noise wiggle (smooth wander), like AE's `wiggle(freq, amp)`. Deterministic
 * for a given `seed` and PURE of `t` (order-independent — safe under scrubbing).
 * Returns values centered on 0 within roughly [-amplitude, amplitude].
 */
export function wiggle(amplitude = 1, frequency = 2, seed = 0) {
    const noise = seededNoise(seed);
    return (t) => {
        const x = t * frequency;
        const i = Math.floor(x);
        const frac = x - i;
        const a = noise(i);
        const b = noise(i + 1);
        // Smoothstep interpolation between adjacent control points.
        const s = smooth(frac);
        return (a + (b - a) * s) * amplitude;
    };
}
/**
 * Remap a value from [inMin, inMax] to [outMin, outMax], clamping to the output
 * range, with optional easing applied to the normalized position.
 */
export function remap(inMin, inMax, outMin, outMax, ease) {
    const span = inMax - inMin || 1e-12;
    return (value) => {
        let t = (value - inMin) / span;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (ease)
            t = ease(t);
        return outMin + (outMax - outMin) * t;
    };
}
/** A linear driver from `a` to `b` over t in [0, 1] (clamped), with optional easing. */
export function ramp(a, b, ease) {
    return (t) => {
        let x = t < 0 ? 0 : t > 1 ? 1 : t;
        if (ease)
            x = ease(x);
        return a + (b - a) * x;
    };
}
/** Sample a driver at a specific time. */
export function valueAtTime(driver, t) {
    return driver(t);
}
/** Compose unary functions left→right: compose(f, g)(x) === g(f(x)). */
export function compose(...fns) {
    return (x) => {
        let v = x;
        for (const fn of fns)
            v = fn(v);
        return v;
    };
}
//# sourceMappingURL=expressions.js.map