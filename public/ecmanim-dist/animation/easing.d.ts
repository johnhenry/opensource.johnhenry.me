import type { RateFunc } from "../core/types.ts";
/** An easing function maps t in [0,1] to eased progress. Structurally identical to RateFunc. */
export type EaseFn = RateFunc;
export declare const Easing: {
    in: (fn: EaseFn) => EaseFn;
    out: (fn: EaseFn) => EaseFn;
    inOut: (fn: EaseFn) => EaseFn;
    bezier: (x1: number, y1: number, x2: number, y2: number) => EaseFn;
    linear: EaseFn;
    quad: EaseFn;
    cubic: EaseFn;
    poly: (n: number) => EaseFn;
    sin: EaseFn;
    circle: EaseFn;
    exp: EaseFn;
};
//# sourceMappingURL=easing.d.ts.map