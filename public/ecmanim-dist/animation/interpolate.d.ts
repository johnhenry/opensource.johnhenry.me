import type { RateFunc } from "../core/types.ts";
/** How to map values that fall outside `inputRange`. */
export type Extrapolation = "extend" | "clamp" | "identity" | "wrap";
export interface InterpolateOptions {
    /** Easing applied to each segment's local parameter. Default: linear. */
    easing?: RateFunc;
    /** Behaviour for inputs below inputRange[0]. Default: "extend". */
    extrapolateLeft?: Extrapolation;
    /** Behaviour for inputs above inputRange[last]. Default: "extend". */
    extrapolateRight?: Extrapolation;
}
/**
 * Map `input` from `inputRange` to `outputRange`.
 *
 * `inputRange` and `outputRange` must be the same length (>= 2), and
 * `inputRange` must be strictly monotonically increasing.
 */
export declare function interpolate(input: number, inputRange: number[], outputRange: number[], options?: InterpolateOptions): number;
//# sourceMappingURL=interpolate.d.ts.map