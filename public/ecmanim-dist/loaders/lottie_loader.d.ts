/** A parsed Lottie animation document (the raw JSON plus an asset index). */
export interface LottieAnimation {
    /** Raw animation JSON. */
    data: any;
    /** Frame rate. */
    fr: number;
    /** In / out point (frames). */
    ip: number;
    op: number;
    /** Composition size in Lottie pixels. */
    w: number;
    h: number;
    /** Precomp/image assets indexed by refId. */
    assets: Map<string, any>;
}
/** One bezier path in Lottie's shape encoding: v = vertices, i/o = RELATIVE
 *  in/out tangent handles, c = closed. */
export interface LottiePath {
    v: number[][];
    i: number[][];
    o: number[][];
    c: boolean;
}
/** One parsed gradient stop, channels in 0..1. */
export interface GradientStop {
    offset: number;
    r: number;
    g: number;
    b: number;
    a: number;
}
/** 2D affine matrix [a, b, c, d, tx, ty]:
 *  x' = a·x + c·y + tx ; y' = b·x + d·y + ty. */
export type Mat2D = [number, number, number, number, number, number];
/** Parse a Lottie document from an object or JSON string. Never reads files —
 *  the caller is responsible for I/O. */
export declare function parseLottie(input: string | object): LottieAnimation;
/**
 * Easing curve through (0,0), (x1,y1), (x2,y2), (1,1): solve the bezier's
 * x(t) = u (Newton with bisection fallback), then evaluate y(t). Results are
 * memoized per parameter tuple (keyframes reuse a handful of curves).
 */
export declare function cubicBezierEase(x1: number, y1: number, x2: number, y2: number): (u: number) => number;
/**
 * Evaluate a Lottie animatable property at `frame`. Returns a scalar for
 * 1-component values, else a fresh number[]. Handles static {a:0,k:v},
 * animated keyframe lists, bare values regardless of the `a` flag, hold
 * keyframes (h:1), per-component bezier easing, and spatial ti/to beziers.
 */
export declare function evalProperty(prop: any, frame: number): number | number[];
/** evalProperty, always returning a scalar (component 0). */
export declare function evalScalar(prop: any, frame: number): number;
/** evalProperty, always returning a fresh array. */
export declare function evalVector(prop: any, frame: number): number[];
/**
 * Evaluate an animatable SHAPE property (`ks` of a `sh` item, or a mask `pt`)
 * at `frame`. Path keyframes interpolate v/i/o arrays component-wise with the
 * keyframe's easing; mismatched vertex counts fall back to the start path.
 */
export declare function evalShapePath(prop: any, frame: number): LottiePath | null;
/** Normalize a Lottie color array to [r,g,b,a] in 0..1. Legacy exporters emit
 *  0..255 channels — detected when any channel exceeds 1. */
export declare function normalizeColor(c: number[]): [number, number, number, number];
/**
 * Parse a gradient's `g` property at `frame` into sorted stops. The stop
 * array is (offset, r, g, b) × p, followed by an optional (offset, alpha) ×
 * m tail; alpha stops are resampled onto the color-stop offsets by linear
 * interpolation.
 */
export declare function parseGradientStops(g: any, frame: number): GradientStop[];
export declare const MAT_IDENTITY: Mat2D;
/** Compose: result maps p ↦ A(B(p)) — B is applied first. */
export declare function matMul(A: Mat2D, B: Mat2D): Mat2D;
export declare function matApply(m: Mat2D, x: number, y: number): [number, number];
/** Isotropic scale factor: sqrt(|det|) — used to scale stroke widths. */
export declare function matScaleFactor(m: Mat2D): number;
/** Raw (pre-evaluated) transform values accepted by buildTransformMatrix. */
export interface TransformValues {
    anchor?: number[];
    position?: number[];
    scale?: number[];
    rotation?: number;
    skew?: number;
    skewAxis?: number;
}
/**
 * Lottie/AE transform order: translate(p) · rotate(r) · skew(sk about sa) ·
 * scale(s/100) · translate(-a), all in y-down pixel space (positive degrees
 * = visually clockwise, which the standard y-down rotation matrix gives).
 */
export declare function buildTransformMatrix(tv: TransformValues): Mat2D;
/**
 * Evaluate a Lottie transform node (a layer `ks` or a shape-group `tr`) at
 * `frame` → matrix + opacity (0..1).
 */
export declare function evalTransform(tr: any, frame: number): {
    m: Mat2D;
    opacity: number;
};
/** Ellipse (el): center p, size s (width, height) → 4-segment closed path. */
export declare function ellipsePath(p: number[], s: number[]): LottiePath;
/** Rectangle (rc): center p, size s, corner radius r → closed path
 *  (clockwise in y-down space, starting at the top-right corner). */
export declare function rectPath(p: number[], s: number[], r?: number): LottiePath;
/** Polystar (sr) parameters, already evaluated at a frame. */
export interface PolystarValues {
    type: 1 | 2;
    points: number;
    position: number[];
    rotation?: number;
    outerRadius: number;
    innerRadius?: number;
    outerRoundness?: number;
    innerRoundness?: number;
}
/** Polystar (sr) → closed path, following lottie-web's vertex/tangent
 *  construction (roundness = fraction of the circumscribed arc segment). */
export declare function polystarPath(v: PolystarValues): LottiePath;
/**
 * Map trim-path s/e/o values (s,e in percent; o in degrees, 360 = one full
 * loop) to a [start, end] window in [0, 1]. The offset rotates the window;
 * a window that would WRAP across the path seam is clamped to end at 1
 * (documented approximation — a single strokeStart/strokeEnd pair cannot
 * represent a wrapped window).
 */
export declare function trimWindow(s: number, e: number, o: number): [number, number];
//# sourceMappingURL=lottie_loader.d.ts.map