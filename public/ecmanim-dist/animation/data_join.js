// Keyed data join (D3-parity campaign, cluster D6): d3's
// selection.join(enter, update, exit) for mobjects. TransformMatchingAuto
// reconciles two already-built mobject TREES; this reconciles a mobject set
// against a DATA ARRAY via a key function — the primitive the bar-chart-race
// pattern needs (enter bars appear, update bars tween, exit bars leave, all
// keyed by name, re-run every keyframe).
import { FadeIn, FadeOut } from "./Animation.js";
import { AnimationGroup } from "./composition.js";
/**
 * Reconcile `oldMobs` (from a previous join, or []) against `newData`:
 *
 * ```ts
 * let join = dataJoin([], frame0, (d) => d.name, { make, update });
 * scene.add(...join.mobs);
 * for (const frame of frames) {
 *   join = dataJoin(join.mobs, frame, (d) => d.name, { make, update });
 *   await scene.play(join.animation);
 * }
 * ```
 *
 * Keys are stamped on the mobjects (`__joinKey`), so consecutive joins
 * track identity without external bookkeeping.
 */
export function dataJoin(oldMobs, newData, keyFn, config) {
    const { make, update, enterFrom, exitTo, runTime, lagRatio } = config;
    const byKey = new Map();
    for (const mob of oldMobs) {
        const k = mob.__joinKey;
        if (k != null)
            byKey.set(k, mob);
    }
    const enter = [];
    const updatePairs = [];
    const mobs = [];
    const anims = [];
    const seen = new Set();
    newData.forEach((d, i) => {
        const key = keyFn(d, i);
        seen.add(key);
        const existing = byKey.get(key);
        if (existing) {
            updatePairs.push([existing, d]);
            mobs.push(existing);
            const anim = update?.(existing, d, i);
            if (anim)
                anims.push(anim);
        }
        else {
            const mob = make(d, i);
            mob.__joinKey = key;
            enterFrom?.(mob, d, i);
            enter.push(mob);
            mobs.push(mob);
            anims.push(new FadeIn(mob));
        }
    });
    const exit = [];
    for (const [k, mob] of byKey) {
        if (seen.has(k))
            continue;
        exit.push(mob);
        const extra = exitTo?.(mob);
        if (extra)
            anims.push(extra);
        anims.push(new FadeOut(mob)); // remover: leaves the scene at finish
    }
    const groupConfig = {};
    if (runTime != null)
        groupConfig.runTime = runTime;
    if (lagRatio != null)
        groupConfig.lagRatio = lagRatio;
    const animation = new AnimationGroup(anims, groupConfig);
    if (runTime != null) {
        animation.runTime = runTime;
        for (const a of anims)
            a.runTime = runTime;
    }
    return { enter, update: updatePairs, exit, mobs, animation };
}
/**
 * Interpolate between keyed snapshots (the bar-chart-race keyframe
 * expansion): given [tA, MapA] and [tB, MapB] of key -> value, produce `k`
 * intermediate Maps (inclusive of A, exclusive of B) whose values lerp and
 * whose key set is the union (missing = 0, matching d3's `(prev || d)`).
 */
export function interpolateFrames(a, b, k) {
    const [ta, ma] = a;
    const [tb, mb] = b;
    const keys = new Set([...ma.keys(), ...mb.keys()]);
    const out = [];
    for (let i = 0; i < k; i++) {
        const t = i / k;
        const m = new Map();
        for (const key of keys) {
            const va = ma.get(key) ?? 0;
            const vb = mb.get(key) ?? 0;
            m.set(key, va * (1 - t) + vb * t);
        }
        out.push([ta * (1 - t) + tb * t, m]);
    }
    return out;
}
/** Rank a keyed frame descending by value (ties broken by key order for
 *  determinism); returns [{key, value, rank}] limited to `n` ranks — ranks
 *  beyond n are clamped to n (d3's bar-chart-race convention, so exiting
 *  bars slide to just off the bottom). */
export function rankFrame(frame, n = Infinity) {
    const entries = [...frame.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    return entries.map(([key, value], i) => ({ key, value, rank: Math.min(i, n) }));
}
//# sourceMappingURL=data_join.js.map