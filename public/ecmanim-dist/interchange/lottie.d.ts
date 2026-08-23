import { VMobject, VGroup } from "../mobject/VMobject.ts";
export interface LottieShapeKS {
    v: number[][];
    i: number[][];
    o: number[][];
    c: boolean;
}
export interface LottieShape {
    ty: "sh";
    ks: {
        a: 0;
        k: LottieShapeKS;
    };
}
/** Convert a VMobject's subpaths to Lottie shape objects (one per subpath). */
export declare function vmobjectToLottieShapes(vmob: VMobject, scale?: number): LottieShape[];
/** Convert a Lottie shape to a flat cubic-Bézier point list (for appendBezierPoints). */
export declare function lottieShapeToPoints(shape: LottieShape, scale?: number): number[][];
/** Build a VMobject from Lottie shapes (each shape → a subpath). */
export declare function lottieShapesToVMobject(shapes: LottieShape[], scale?: number): VMobject;
export interface LottieExportOptions {
    width?: number;
    height?: number;
    fps?: number;
    durationFrames?: number;
    scale?: number;
}
/** Export a VMobject (or VGroup) as a complete static Lottie animation document. */
export declare function vmobjectToLottieJSON(mob: VMobject | VGroup, opts?: LottieExportOptions): Record<string, any>;
/** Import a Lottie animation's shape layers as STATIC VMobjects (no
 *  animation — first-frame geometry only). For the real player, use
 *  `loadLottie` from src/mobject/lottie_mobject.ts, which supersedes the
 *  old `loadLottie` name this function carried before v0.7.0. */
export declare function loadLottieShapes(json: any, scale?: number): VMobject;
//# sourceMappingURL=lottie.d.ts.map