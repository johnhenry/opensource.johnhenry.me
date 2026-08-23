// d3-scale equivalents (D3-parity campaign, cluster D1). Pure, isomorphic.
//
// API STYLE: chainable getter/setter (`scaleLinear().domain([0,1]).range(
// [0,720])`), deliberately breaking ecmanim's config-object convention —
// these exist so D3 gallery ports read line-for-line, and D3 code is
// wall-to-wall chained scale calls. Every scale is also just a callable
// function, like d3's.
import { ticks, tickIncrement, niceExtent, tickStep } from "./array_utils.js";
import { formatSpecifierAuto, format } from "./format.js";
import { Color } from "./color.js";
const num = (v) => +v;
function makeContinuous(transform, untransform) {
    let domain = [0, 1];
    let range = [0, 1];
    let clamped = false;
    // Piecewise linear over transformed domain (supports polylinear like d3).
    const scale = ((value) => {
        let v = transform(num(value));
        const n = Math.min(domain.length, range.length) - 1;
        const td = domain.map(transform);
        if (clamped) {
            const lo = Math.min(td[0], td[n]), hi = Math.max(td[0], td[n]);
            v = Math.max(lo, Math.min(hi, v));
        }
        // Find segment.
        let i = 0;
        const asc = td[n] >= td[0];
        while (i < n - 1 && (asc ? v > td[i + 1] : v < td[i + 1]))
            i++;
        const t0 = td[i], t1 = td[i + 1];
        const r0 = range[i], r1 = range[i + 1];
        const t = t1 === t0 ? 0.5 : (v - t0) / (t1 - t0);
        return r0 + (r1 - r0) * t;
    });
    scale.invert = (pixel) => {
        const n = Math.min(domain.length, range.length) - 1;
        const td = domain.map(transform);
        let i = 0;
        const asc = range[n] >= range[0];
        while (i < n - 1 && (asc ? pixel > range[i + 1] : pixel < range[i + 1]))
            i++;
        const r0 = range[i], r1 = range[i + 1];
        const t = r1 === r0 ? 0.5 : (pixel - r0) / (r1 - r0);
        return untransform(td[i] + (td[i + 1] - td[i]) * t);
    };
    scale.domain = ((d) => {
        if (d === undefined)
            return [...domain];
        domain = d.map(num);
        return scale;
    });
    scale.range = ((r) => {
        if (r === undefined)
            return [...range];
        range = [...r];
        return scale;
    });
    scale.clamp = ((c) => {
        if (c === undefined)
            return clamped;
        clamped = c;
        return scale;
    });
    scale.ticks = (count = 10) => {
        // Log scales get their own ticks override; the base is linear-space.
        return ticks(domain[0], domain[domain.length - 1], count);
    };
    scale.tickFormat = (count = 10, specifier) => {
        const [a, b] = [domain[0], domain[domain.length - 1]];
        return format(specifier ?? formatSpecifierAuto(a, b, count));
    };
    scale.nice = (count = 10) => {
        const n = domain.length - 1;
        const [lo, hi] = niceExtent(domain[0], domain[n], count);
        domain[0] = lo;
        domain[n] = hi;
        return scale;
    };
    scale.copy = () => makeContinuous(transform, untransform).domain(domain).range(range).clamp(clamped);
    return scale;
}
export function scaleLinear(domain, range) {
    const s = makeContinuous((v) => v, (v) => v);
    if (domain)
        s.domain(domain);
    if (range)
        s.range(range);
    return s;
}
export function scaleLog(domain, range) {
    const s = makeContinuous(Math.log, Math.exp);
    if (domain)
        s.domain(domain);
    else
        s.domain([1, 10]);
    if (range)
        s.range(range);
    // Log ticks: powers of the (assumed 10) base with 1..9 mantissas like d3.
    s.ticks = (count = 10) => {
        const d = s.domain();
        let lo = d[0], hi = d[d.length - 1];
        const reverse = hi < lo;
        if (reverse)
            [lo, hi] = [hi, lo];
        let i = Math.floor(Math.log10(lo));
        const j = Math.ceil(Math.log10(hi));
        const out = [];
        if (j - i < count) {
            for (; i <= j; i++) {
                for (let k = 1; k < 10; k++) {
                    const t = k * Math.pow(10, i);
                    if (t >= lo && t <= hi)
                        out.push(t);
                }
            }
            if (out.length * 2 < count)
                return ticks(lo, hi, count);
        }
        else {
            const step = Math.ceil((j - i) / Math.max(1, count));
            for (; i <= j; i += step) {
                const t = Math.pow(10, i);
                if (t >= lo && t <= hi)
                    out.push(t);
            }
        }
        return reverse ? out.reverse() : out;
    };
    return s;
}
export function scalePow(exponent = 1, domain, range) {
    const t = (v) => (v < 0 ? -Math.pow(-v, exponent) : Math.pow(v, exponent));
    const u = (v) => (v < 0 ? -Math.pow(-v, 1 / exponent) : Math.pow(v, 1 / exponent));
    const s = makeContinuous(t, u);
    if (domain)
        s.domain(domain);
    if (range)
        s.range(range);
    return s;
}
export function scaleSqrt(domain, range) {
    return scalePow(0.5, domain, range);
}
/** d3.scaleRadial: linear in AREA (radius ∝ sqrt) — bar length on a radial
 *  chart reads truthfully. */
export function scaleRadial(domain, range) {
    const square = (v) => Math.sign(v) * v * v;
    const unsquare = (v) => Math.sign(v) * Math.sqrt(Math.abs(v));
    let inner = makeContinuous((v) => v, (v) => v);
    const s = ((value) => unsquare(inner(num(value))));
    s.invert = (pixel) => inner.invert(square(pixel));
    s.domain = ((d) => (d === undefined ? inner.domain() : (inner.domain(d), s)));
    s.range = ((r) => (r === undefined ? inner.range().map(unsquare) : (inner.range(r.map(square)), s)));
    s.clamp = ((c) => (c === undefined ? inner.clamp() : (inner.clamp(c), s)));
    s.ticks = (count = 10) => inner.ticks(count);
    s.tickFormat = (count = 10, spec) => inner.tickFormat(count, spec);
    s.nice = (count = 10) => (inner.nice(count), s);
    s.copy = () => {
        const c = scaleRadial(inner.domain(), inner.range().map(unsquare));
        return c;
    };
    if (domain)
        s.domain(domain);
    if (range)
        s.range(range);
    return s;
}
const durationSecond = 1000, durationMinute = 60_000, durationHour = 3_600_000, durationDay = 86_400_000, durationWeek = 604_800_000, durationMonth = 2_592_000_000, durationYear = 31_536_000_000;
// [duration-per-step, floor fn, step count] ladder (UTC).
const TIME_INTERVALS = [
    [durationSecond, (d) => new Date(Math.floor(+d / 1000) * 1000), (d, n) => d.setTime(+d + n * 1000)],
    [durationMinute, (d) => new Date(Math.floor(+d / 60000) * 60000), (d, n) => d.setTime(+d + n * 60000)],
    [durationHour, (d) => new Date(Math.floor(+d / 3600000) * 3600000), (d, n) => d.setTime(+d + n * 3600000)],
    [durationDay, (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), (d, n) => d.setUTCDate(d.getUTCDate() + n)],
    [durationWeek, (d) => { const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); f.setUTCDate(f.getUTCDate() - f.getUTCDay()); return f; }, (d, n) => d.setUTCDate(d.getUTCDate() + 7 * n)],
    [durationMonth, (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), (d, n) => d.setUTCMonth(d.getUTCMonth() + n)],
    [durationYear, (d) => new Date(Date.UTC(d.getUTCFullYear(), 0, 1)), (d, n) => d.setUTCFullYear(d.getUTCFullYear() + n)],
];
const TIME_STEPS = [
    // [interval index, multiple]
    [0, 1], [0, 5], [0, 15], [0, 30],
    [1, 1], [1, 5], [1, 15], [1, 30],
    [2, 1], [2, 3], [2, 6], [2, 12],
    [3, 1], [3, 2],
    [4, 1],
    [5, 1], [5, 3],
    [6, 1],
];
export function scaleUtc(domain, range) {
    const inner = scaleLinear();
    const s = ((value) => inner(+value));
    s.invert = (pixel) => new Date(inner.invert(pixel));
    s.domain = ((d) => {
        if (d === undefined)
            return inner.domain().map((v) => new Date(v));
        inner.domain(d.map((v) => +v));
        return s;
    });
    s.range = ((r) => (r === undefined ? inner.range() : (inner.range(r), s)));
    s.clamp = ((c) => (c === undefined ? inner.clamp() : (inner.clamp(c), s)));
    s.ticks = (count = 10) => {
        const d = inner.domain();
        const lo = d[0], hi = d[d.length - 1];
        const span = Math.abs(hi - lo);
        const target = span / count;
        // Pick the smallest step whose duration >= target.
        let pick = null;
        for (const [idx, mult] of TIME_STEPS) {
            if (TIME_INTERVALS[idx][0] * mult >= target) {
                pick = [idx, mult];
                break;
            }
        }
        if (!pick) {
            // Years, multi-step nice.
            const yearStep = Math.max(1, Math.round(tickStep(lo / durationYear, hi / durationYear, count)));
            const out = [];
            const first = new Date(Date.UTC(new Date(lo).getUTCFullYear(), 0, 1));
            for (const t = first; +t <= hi; t.setUTCFullYear(t.getUTCFullYear() + yearStep)) {
                if (+t >= lo)
                    out.push(new Date(+t));
            }
            return out;
        }
        const [idx, mult] = pick;
        const [, floor, offset] = TIME_INTERVALS[idx];
        const out = [];
        const t = floor(new Date(lo));
        while (+t < lo)
            offset(t, mult);
        while (+t <= hi) {
            out.push(new Date(+t));
            offset(t, mult);
        }
        return out;
    };
    s.tickFormat = () => {
        // Multi-scale label like d3: pick by boundary significance.
        return ((v) => {
            const d = v instanceof Date ? v : new Date(v);
            if (d.getUTCMonth() === 0 && d.getUTCDate() === 1 && d.getUTCHours() === 0)
                return String(d.getUTCFullYear());
            if (d.getUTCDate() === 1 && d.getUTCHours() === 0)
                return MONTHS_ABBR[d.getUTCMonth()];
            if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0)
                return `${MONTHS_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
            return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        });
    };
    s.nice = (count = 10) => {
        const t = s.ticks(count);
        if (t.length > 1) {
            const d = inner.domain();
            const span = +t[1] - +t[0];
            inner.domain([Math.floor(d[0] / span) * span, Math.ceil(d[d.length - 1] / span) * span]);
        }
        return s;
    };
    s.copy = () => scaleUtc(s.domain(), inner.range());
    if (domain)
        s.domain(domain);
    if (range)
        s.range(range);
    return s;
}
export const scaleTime = scaleUtc; // UTC semantics for deterministic renders.
const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function scaleBand(domain, range) {
    let dom = [];
    let r0 = 0, r1 = 1;
    let padInner = 0, padOuter = 0, align = 0.5, round = false;
    const index = new Map();
    let bandwidth = 0, step = 0, start = 0;
    const rescale = () => {
        const n = dom.length;
        const reverse = r1 < r0;
        let lo = reverse ? r1 : r0;
        const hi = reverse ? r0 : r1;
        step = (hi - lo) / Math.max(1, n - padInner + padOuter * 2);
        if (round)
            step = Math.floor(step);
        lo += (hi - lo - step * (n - padInner)) * align;
        bandwidth = step * (1 - padInner);
        if (round) {
            lo = Math.round(lo);
            bandwidth = Math.round(bandwidth);
        }
        start = reverse ? lo + step * (n - 1) : lo;
        if (reverse)
            step = -step;
    };
    const scale = ((value) => {
        const i = index.get(value);
        return i === undefined ? NaN : start + step * i;
    });
    scale.domain = ((d) => {
        if (d === undefined)
            return [...dom];
        dom = [];
        index.clear();
        for (const v of d) {
            if (!index.has(v)) {
                index.set(v, dom.length);
                dom.push(v);
            }
        }
        rescale();
        return scale;
    });
    scale.range = ((r) => {
        if (r === undefined)
            return [r0, r1];
        [r0, r1] = r;
        rescale();
        return scale;
    });
    scale.bandwidth = () => Math.abs(bandwidth);
    scale.step = () => Math.abs(step);
    // d3 getter/setter pairs: the no-arg GETTER form must not corrupt state
    // (padding() once set padInner = min(1, undefined) = NaN and every
    // subsequent scale(v) returned NaN — found by the bar-chart-race port).
    scale.padding = ((p) => {
        if (p === undefined)
            return padInner;
        padInner = Math.min(1, p);
        padOuter = p;
        rescale();
        return scale;
    });
    scale.paddingInner = ((p) => {
        if (p === undefined)
            return padInner;
        padInner = Math.min(1, p);
        rescale();
        return scale;
    });
    scale.paddingOuter = ((p) => {
        if (p === undefined)
            return padOuter;
        padOuter = p;
        rescale();
        return scale;
    });
    scale.align = ((a) => {
        if (a === undefined)
            return align;
        align = Math.max(0, Math.min(1, a));
        rescale();
        return scale;
    });
    scale.round = ((r) => {
        if (r === undefined)
            return round;
        round = r;
        rescale();
        return scale;
    });
    scale.copy = () => {
        const c = scaleBand(dom, [r0, r1]).paddingInner(padInner).paddingOuter(padOuter).align(align).round(round);
        return c;
    };
    if (domain)
        scale.domain(domain);
    if (range)
        scale.range(range);
    rescale();
    return scale;
}
/** scalePoint = scaleBand with zero bandwidth (points at band centers). */
export function scalePoint(domain, range) {
    const s = scaleBand(domain, range);
    s.paddingInner(1);
    s.padding = ((p) => {
        if (p === undefined)
            return s.paddingOuter();
        s.paddingOuter(p);
        return s;
    });
    return s;
}
export function scaleOrdinal(domain, range) {
    let dom = [];
    let rng = [];
    const index = new Map();
    const scale = ((value) => {
        let i = index.get(value);
        if (i === undefined) {
            // Implicit domain growth, like d3.
            i = dom.length;
            index.set(value, i);
            dom.push(value);
        }
        return rng[i % rng.length];
    });
    scale.domain = ((d) => {
        if (d === undefined)
            return [...dom];
        dom = [];
        index.clear();
        for (const v of d)
            if (!index.has(v)) {
                index.set(v, dom.length);
                dom.push(v);
            }
        return scale;
    });
    scale.range = ((r) => {
        if (r === undefined)
            return [...rng];
        rng = [...r];
        return scale;
    });
    if (domain)
        scale.domain(domain);
    if (range)
        scale.range(range);
    return scale;
}
export function scaleSequential(domainOrInterp, maybeInterp) {
    let dom = [0, 1];
    let interp = ((t) => t);
    if (typeof domainOrInterp === "function")
        interp = domainOrInterp;
    else if (domainOrInterp) {
        dom = domainOrInterp;
        if (maybeInterp)
            interp = maybeInterp;
    }
    const scale = ((value) => {
        const t = dom[1] === dom[0] ? 0.5 : (value - dom[0]) / (dom[1] - dom[0]);
        return interp(Math.max(0, Math.min(1, t)));
    });
    scale.domain = ((d) => (d === undefined ? [...dom] : ((dom = d), scale)));
    scale.interpolator = ((fn) => (fn === undefined ? interp : ((interp = fn), scale)));
    scale.ticks = (count = 10) => ticks(dom[0], dom[1], count);
    return scale;
}
/** scaleDiverging: piecewise around a center pivot. */
export function scaleDiverging(domain, interpolator) {
    const [a, b, c] = domain;
    const s = scaleSequential([0, 1], interpolator);
    const scale = ((value) => {
        const t = value < b
            ? 0.5 * (b === a ? 0 : (value - a) / (b - a))
            : 0.5 + 0.5 * (c === b ? 1 : (value - b) / (c - b));
        return interpolator(Math.max(0, Math.min(1, t)));
    });
    scale.domain = s.domain;
    scale.interpolator = s.interpolator;
    scale.ticks = (count = 10) => ticks(a, c, count);
    return scale;
}
export function scaleQuantize(domain, range) {
    let dom = [0, 1];
    let rng = [0, 1];
    const scale = ((value) => {
        if (value == null || Number.isNaN(+value))
            return undefined;
        const n = rng.length;
        const t = (value - dom[0]) / (dom[1] - dom[0]);
        const i = Math.max(0, Math.min(n - 1, Math.floor(t * n)));
        return rng[i];
    });
    scale.domain = ((d) => (d === undefined ? [...dom] : ((dom = d), scale)));
    scale.range = ((r) => (r === undefined ? [...rng] : ((rng = [...r]), scale)));
    scale.invertExtent = (v) => {
        const i = rng.indexOf(v);
        const n = rng.length;
        return i < 0
            ? [NaN, NaN]
            : [dom[0] + (i / n) * (dom[1] - dom[0]), dom[0] + ((i + 1) / n) * (dom[1] - dom[0])];
    };
    scale.ticks = (count = 10) => ticks(dom[0], dom[1], count);
    if (domain)
        scale.domain(domain);
    if (range)
        scale.range(range);
    return scale;
}
/** d3.scaleThreshold: arbitrary (non-equal-width) cut points. `domain` is n-1
 *  ascending cutpoints; `range` is n values. value < domain[0] -> range[0],
 *  domain[i-1] <= value < domain[i] -> range[i], value >= domain[n-2] -> range[n-1]. */
export function scaleThreshold(domain, range) {
    let dom = [];
    let rng = [0, 1];
    const scale = ((value) => {
        let i = 0;
        while (i < dom.length && value >= dom[i])
            i++;
        return rng[Math.min(i, rng.length - 1)];
    });
    scale.domain = ((d) => (d === undefined ? [...dom] : ((dom = [...d]), scale)));
    scale.range = ((r) => (r === undefined ? [...rng] : ((rng = [...r]), scale)));
    scale.invertExtent = (v) => {
        const i = rng.indexOf(v);
        return i < 0 ? [undefined, undefined] : [dom[i - 1], dom[i]];
    };
    if (domain)
        scale.domain(domain);
    if (range)
        scale.range(range);
    return scale;
}
/** Bundles a value's domain + size/color output ranges into one mapper,
 *  mirroring ECharts' `visualMap: {type: 'continuous', ...}`. The returned
 *  `size`/`color` functions are pure and honor `outOfRange`. */
export function visualMapContinuous(config) {
    const { domain, inRange = {}, outOfRange, clamp = true } = config;
    const [lo, hi] = domain;
    const t = (value) => {
        const raw = hi === lo ? 0.5 : (value - lo) / (hi - lo);
        return clamp ? Math.max(0, Math.min(1, raw)) : raw;
    };
    const inBounds = (value) => value >= lo && value <= hi;
    const sizeScale = inRange.symbolSize ? scaleLinear(domain, inRange.symbolSize).clamp(clamp) : undefined;
    let interpolator = () => "#000000";
    if (typeof inRange.color === "function") {
        interpolator = inRange.color;
    }
    else if (Array.isArray(inRange.color)) {
        const [c0, c1] = inRange.color;
        interpolator = (tt) => Color.lerp(c0, c1, tt);
    }
    else if (inRange.colorLightness) {
        const { base, range } = inRange.colorLightness;
        const [l0, l1] = range;
        const [h, s] = Color.parse(base).toHsv();
        interpolator = (tt) => Color.fromHsv(h, s, l0 + (l1 - l0) * tt);
    }
    return {
        domain,
        interpolator,
        size(value) {
            if (!inBounds(value) && outOfRange?.symbolSize !== undefined)
                return outOfRange.symbolSize;
            return sizeScale?.(value);
        },
        color(value) {
            if (!inBounds(value) && outOfRange?.color !== undefined)
                return outOfRange.color;
            return interpolator(t(value));
        },
    };
}
export { ticks, tickStep, tickIncrement, niceExtent };
//# sourceMappingURL=scales.js.map