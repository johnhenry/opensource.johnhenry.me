// Rate functions map animation progress t in [0,1] to eased progress in [0,1].
// Names mirror manim.utils.rate_functions.
import { registry } from "../plugins/registry.js";
export const linear = (t) => t;
export function smooth(t, inflection = 10) {
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    const error = sigmoid(-inflection / 2);
    return Math.min(Math.max((sigmoid(inflection * (t - 0.5)) - error) / (1 - 2 * error), 0), 1);
}
function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}
export const rushInto = (t) => 2 * smooth(t / 2);
export const rushFrom = (t) => 2 * smooth(t / 2 + 0.5) - 1;
export const slowInto = (t) => Math.sqrt(1 - (1 - t) * (1 - t));
export const doubleSmooth = (t) => (t < 0.5 ? 0.5 * smooth(2 * t) : 0.5 * (1 + smooth(2 * t - 1)));
export const thereAndBack = (t, inflection = 10) => {
    const s = t < 0.5 ? 2 * t : 2 * (1 - t);
    return smooth(s, inflection);
};
export const thereAndBackWithPause = (t, pauseRatio = 1 / 3) => {
    const a = 1 / pauseRatio;
    if (t < 0.5 - pauseRatio / 2)
        return smooth(a * t);
    if (t < 0.5 + pauseRatio / 2)
        return 1;
    return smooth(a - a * t);
};
export const easeInSine = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const easeOutSine = (t) => Math.sin((t * Math.PI) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const thereAndBackClamp = thereAndBack;
// ---------------------------------------------------------------------------
// Clamp helpers (manim's @unit_interval / @zero decorators). unitInterval wraps
// a rate func so its output is clamped to [0, 1]; zero clamps to >= 0.
// ---------------------------------------------------------------------------
/** Wrap a rate func so its output is clamped to the unit interval [0, 1]. */
export const unitInterval = (func) => (t) => Math.min(Math.max(func(t), 0), 1);
/** Wrap a rate func so its output is clamped to be non-negative (>= 0). */
export const zero = (func) => (t) => Math.max(func(t), 0);
// ---------------------------------------------------------------------------
// Smoothstep family (Perlin). Each is 0 at t<=0 and 1 at t>=1.
// ---------------------------------------------------------------------------
/** Classic Hermite smoothstep: 3t^2 - 2t^3, clamped to [0, 1]. */
export function smoothstep(t) {
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    return t * t * (3 - 2 * t);
}
/** Ken Perlin's smootherstep: 6t^5 - 15t^4 + 10t^3, clamped to [0, 1]. */
export function smootherstep(t) {
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    return t * t * t * (t * (6 * t - 15) + 10);
}
/** Higher-order smoothstep (7th order): -20t^7 + 70t^6 - 84t^5 + 35t^4. */
export function smoothererstep(t) {
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    return 35 * t ** 4 - 84 * t ** 5 + 70 * t ** 6 - 20 * t ** 7;
}
// ---------------------------------------------------------------------------
// Assorted manim rate functions.
// ---------------------------------------------------------------------------
/** Overshoots forward before settling. pullFactor < 0 dips below zero first. */
export function runningStart(t, pullFactor = -0.5) {
    // Bezier through [0, 0, pullFactor, pullFactor, 1] evaluated at t.
    const points = [0, 0, pullFactor, pullFactor, 1];
    const n = points.length - 1;
    let result = 0;
    for (let i = 0; i <= n; i++) {
        result += points[i] * binomial(n, i) * (1 - t) ** (n - i) * t ** i;
    }
    return result;
}
function binomial(n, k) {
    let result = 1;
    for (let i = 0; i < k; i++)
        result = (result * (n - i)) / (i + 1);
    return result;
}
/** Applies `func` but never quite reaches 1 (scaled to `proportion` of the way). */
export function notQuiteThere(func = smooth, proportion = 0.7) {
    return (t) => func(t) * proportion;
}
/** Oscillates `wiggles` times, returning to 0 at t=0 and t=1. */
export function wiggle(t, wiggles = 2) {
    return thereAndBack(t) * Math.sin(wiggles * Math.PI * t);
}
/** Rushes to 1 and lingers there (never fully reaching 1 until the end). */
export function lingering(t) {
    return squishRateFunc((x) => x, 0, 0.8)(t);
}
/** Exponential decay from 1 towards 0, normalized so f(0)=0, growing to ~1. */
export function exponentialDecay(t, halfLife = 0.1) {
    // The half-life should be rather small to minimize the cut-off error at t=1.
    return 1 - Math.exp(-t / halfLife);
}
// ---------------------------------------------------------------------------
// Higher-order combinator: squish a rate func into the sub-interval [a, b].
// ---------------------------------------------------------------------------
/**
 * Returns a rate func that runs `func` compressed into [a, b]: it holds
 * func(0) before a, func(1) after b, and maps [a, b] onto func's [0, 1].
 */
export function squishRateFunc(func, a = 0.4, b = 0.6) {
    return (t) => {
        if (a === b)
            return a;
        if (t < a)
            return func(0);
        if (t > b)
            return func(1);
        return func((t - a) / (b - a));
    };
}
// ---------------------------------------------------------------------------
// Robert Penner easing families: Quart, Quint, Expo, Circ, Back, Elastic,
// Bounce (in / out / inOut for each), matching manim's rate_functions.
// ---------------------------------------------------------------------------
export const easeInQuart = (t) => t * t * t * t;
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeInOutQuart = (t) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
export const easeInQuint = (t) => t * t * t * t * t;
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInOutQuint = (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
export const easeInExpo = (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));
export const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutExpo = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return t < 0.5
        ? Math.pow(2, 20 * t - 10) / 2
        : (2 - Math.pow(2, -20 * t + 10)) / 2;
};
export const easeInCirc = (t) => 1 - Math.sqrt(1 - Math.pow(t, 2));
export const easeOutCirc = (t) => Math.sqrt(1 - Math.pow(t - 1, 2));
export const easeInOutCirc = (t) => t < 0.5
    ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
    : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
const C1 = 1.70158;
// Parameterized "back" ease factories (GSAP's back.in/out/inOut(overshoot)
// ergonomic) -- these are the exact same formula the plain exports below
// already used, just with the overshoot constant exposed as an argument
// instead of hardcoded, so the default-argument call collapses to byte-
// identical output.
export function easeInBackFactory(overshoot = C1) {
    const c3 = overshoot + 1;
    return (t) => c3 * t * t * t - overshoot * t * t;
}
export function easeOutBackFactory(overshoot = C1) {
    const c3 = overshoot + 1;
    return (t) => 1 + c3 * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
}
export function easeInOutBackFactory(overshoot = C1) {
    const c2 = overshoot * 1.525;
    return (t) => t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
}
export const easeInBack = easeInBackFactory();
export const easeOutBack = easeOutBackFactory();
export const easeInOutBack = easeInOutBackFactory();
const C4 = (2 * Math.PI) / 3;
const C5 = (2 * Math.PI) / 4.5;
const DEFAULT_AMPLITUDE = 1;
const DEFAULT_PERIOD = 0.3;
// Parameterized "elastic" ease factories (GSAP's elastic.in/out/inOut
// (amplitude, period) ergonomic). Safe fast path: at the exact defaults,
// return the existing hardcoded function unchanged (same constants, zero
// floating-point-drift risk) -- the general GSAP-style amplitude/period
// formula below is only exercised for genuinely custom arguments, so there's
// no "should algebraically collapse" assumption to get subtly wrong.
export function easeInElasticFactory(amplitude = DEFAULT_AMPLITUDE, period = DEFAULT_PERIOD) {
    if (amplitude === DEFAULT_AMPLITUDE && period === DEFAULT_PERIOD)
        return easeInElastic;
    const a = Math.max(1, amplitude);
    const s = amplitude < 1 ? period / 4 : (period / (2 * Math.PI)) * Math.asin(1 / a);
    return (t) => {
        if (t === 0)
            return 0;
        if (t === 1)
            return 1;
        return -(a * Math.pow(2, 10 * (t - 1)) * Math.sin(((t - 1 - s) * 2 * Math.PI) / period));
    };
}
export function easeOutElasticFactory(amplitude = DEFAULT_AMPLITUDE, period = DEFAULT_PERIOD) {
    if (amplitude === DEFAULT_AMPLITUDE && period === DEFAULT_PERIOD)
        return easeOutElastic;
    const a = Math.max(1, amplitude);
    const s = amplitude < 1 ? period / 4 : (period / (2 * Math.PI)) * Math.asin(1 / a);
    return (t) => {
        if (t === 0)
            return 0;
        if (t === 1)
            return 1;
        return a * Math.pow(2, -10 * t) * Math.sin(((t - s) * 2 * Math.PI) / period) + 1;
    };
}
export function easeInOutElasticFactory(amplitude = DEFAULT_AMPLITUDE, period = DEFAULT_PERIOD) {
    if (amplitude === DEFAULT_AMPLITUDE && period === DEFAULT_PERIOD)
        return easeInOutElastic;
    const a = Math.max(1, amplitude);
    const s = amplitude < 1 ? period / 4 : (period / (2 * Math.PI)) * Math.asin(1 / a);
    const p = period * 1.5;
    return (t) => {
        if (t === 0)
            return 0;
        if (t === 1)
            return 1;
        const tt = t * 2;
        if (tt < 1)
            return -0.5 * (a * Math.pow(2, 10 * (tt - 1)) * Math.sin(((tt - 1 - s) * 2 * Math.PI) / p));
        return a * Math.pow(2, -10 * (tt - 1)) * Math.sin(((tt - 1 - s) * 2 * Math.PI) / p) * 0.5 + 1;
    };
}
export const easeInElastic = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * C4);
};
export const easeOutElastic = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * C4) + 1;
};
export const easeInOutElastic = (t) => {
    if (t === 0)
        return 0;
    if (t === 1)
        return 1;
    return t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * C5)) / 2
        : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * C5)) / 2 + 1;
};
export const easeOutBounce = (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1)
        return n1 * t * t;
    if (t < 2 / d1) {
        t -= 1.5 / d1;
        return n1 * t * t + 0.75;
    }
    if (t < 2.5 / d1) {
        t -= 2.25 / d1;
        return n1 * t * t + 0.9375;
    }
    t -= 2.625 / d1;
    return n1 * t * t + 0.984375;
};
export const easeInBounce = (t) => 1 - easeOutBounce(1 - t);
export const easeInOutBounce = (t) => t < 0.5
    ? (1 - easeOutBounce(1 - 2 * t)) / 2
    : (1 + easeOutBounce(2 * t - 1)) / 2;
export function running(name) {
    if (typeof name === "function")
        return name;
    // Registry first, then built-ins, else smooth. Flipping the old built-ins-
    // first precedence is safe: registerBuiltins() already copies every
    // RATE_FUNCTIONS entry into the registry, so for any built-in name both
    // resolve to the SAME function object -- this only changes behavior when a
    // plugin deliberately registers an override for a built-in name (new
    // capability, not a regression).
    const direct = registry.rateFunctions.get(name) ?? RATE_FUNCTIONS[name];
    if (direct)
        return direct;
    // Parameterized factory: "name:1,2" -> registry.rateFunctionFactories
    // .get("name")(1, 2). Lets a plugin-registered (or built-in, e.g. "spring"/
    // "bezier") factory be referenced anywhere a plain rate-function string is
    // accepted, without a bespoke per-factory config shape.
    const sep = name.indexOf(":");
    if (sep > 0) {
        const factory = registry.rateFunctionFactories.get(name.slice(0, sep));
        if (factory) {
            const args = name.slice(sep + 1).split(",").map(Number);
            return factory(...args);
        }
    }
    return smooth;
}
export const RATE_FUNCTIONS = {
    linear, smooth, rushInto, rushFrom, slowInto, doubleSmooth,
    thereAndBack, thereAndBackWithPause,
    smoothstep, smootherstep, smoothererstep,
    runningStart, wiggle, lingering, exponentialDecay,
    easeInSine, easeOutSine, easeInOutSine,
    easeInQuad, easeOutQuad, easeInOutQuad,
    easeInCubic, easeOutCubic, easeInOutCubic,
    easeInQuart, easeOutQuart, easeInOutQuart,
    easeInQuint, easeOutQuint, easeInOutQuint,
    easeInExpo, easeOutExpo, easeInOutExpo,
    easeInCirc, easeOutCirc, easeInOutCirc,
    easeInBack, easeOutBack, easeInOutBack,
    easeInElastic, easeOutElastic, easeInOutElastic,
    easeInBounce, easeOutBounce, easeInOutBounce,
};
//# sourceMappingURL=rate_functions.js.map