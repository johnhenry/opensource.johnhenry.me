// Movement animations mirroring ManimCommunity manim/animation/movement.py.
// These animations move every point of the target mobject as a function of the
// animation's alpha, working from the ORIGINAL points captured at begin().
import { Animation } from "./Animation.js";
import * as V from "../core/math/vector.js";
import { linear } from "./rate_functions.js";
/**
 * Homotopy: continuously deform a mobject by applying `homotopyFn` at time=alpha
 * to every point. The original points are snapshotted at begin() so the mapping
 * is always evaluated against the un-deformed geometry.
 */
export class Homotopy extends Animation {
    homotopyFn;
    startPoints;
    constructor(homotopyFn, mobject, config = {}) {
        super(mobject, { runTime: config.runTime ?? 3, ...config });
        this.homotopyFn = homotopyFn;
        this.startPoints = [];
    }
    setup() {
        this.startPoints = this.mobject.getFamily().map((m) => m.points.map((p) => [...p]));
    }
    // Per-family-member hook so subclasses (e.g. SmoothedVectorizedHomotopy) can
    // post-process after the points are set.
    applyToMember(_m, _index) { }
    interpolateMobject(alpha) {
        const fam = this.mobject.getFamily();
        fam.forEach((m, i) => {
            const start = this.startPoints[i];
            for (let j = 0; j < m.points.length; j++) {
                const p = start[j];
                const out = this.homotopyFn(p[0], p[1], p[2] ?? 0, alpha);
                m.points[j] = [out[0], out[1] ?? 0, out[2] ?? 0];
            }
            this.applyToMember(m, i);
        });
    }
    finish() {
        this.interpolateMobject(1);
        this.finished = true;
        return this;
    }
}
/**
 * SmoothedVectorizedHomotopy: a Homotopy that re-smooths each curve after the
 * points have been moved, so the deformed outline stays smooth.
 */
export class SmoothedVectorizedHomotopy extends Homotopy {
    applyToMember(m) {
        if (typeof m.makeSmooth === "function")
            m.makeSmooth();
    }
}
/**
 * ComplexHomotopy: wraps a complex-plane homotopy into a real Homotopy via
 * complexToR3 / R3ToComplex. The z-coordinate is preserved.
 */
export class ComplexHomotopy extends Homotopy {
    constructor(complexHomotopyFn, mobject, config = {}) {
        const homotopy = (x, y, z, t) => {
            const w = complexHomotopyFn(V.R3ToComplex([x, y, z]), t);
            const r3 = V.complexToR3(w);
            return [r3[0], r3[1], z];
        };
        super(homotopy, mobject, config);
    }
}
/**
 * PhaseFlow: integrate each point of the mobject along a vector field
 * `velocityFn` over `virtualTime`. Points advance by velocity * dt each frame,
 * where dt is derived from the change in alpha between successive frames.
 */
export class PhaseFlow extends Animation {
    velocityFn;
    virtualTime;
    lastAlpha;
    constructor(velocityFn, mobject, config = {}) {
        super(mobject, {
            runTime: config.runTime ?? 3,
            rateFunc: config.rateFunc ?? linear,
            ...config,
        });
        this.velocityFn = velocityFn;
        this.virtualTime = config.virtualTime ?? 1;
        this.lastAlpha = null;
    }
    interpolateMobject(alpha) {
        if (this.lastAlpha != null) {
            const dt = this.virtualTime * (alpha - this.lastAlpha);
            if (dt !== 0) {
                this.mobject.applyToPoints((p) => {
                    const v = this.velocityFn(p);
                    return V.add(p, V.scale([v[0], v[1] ?? 0, v[2] ?? 0], dt));
                });
            }
        }
        this.lastAlpha = alpha;
    }
}
//# sourceMappingURL=movement.js.map