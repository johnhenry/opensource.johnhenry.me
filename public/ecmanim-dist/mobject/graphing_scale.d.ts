/**
 * Interface every scale base implements.
 *
 * `functionOf` is applied to a data value before it is placed on the line;
 * `inverseFunctionOf` recovers the data value from a placed position. For a
 * linear axis both are the identity. For a log axis `functionOf` is log_base
 * and its inverse is base**x.
 */
export interface _ScaleBase {
    /** Map a raw data value to its position on the line. */
    functionOf(value: number): number;
    /** Inverse of `functionOf`: position -> data value. */
    inverseFunctionOf(value: number): number;
    /**
     * Optional custom tick values / labels for the axis. Returning `null` means
     * "use the default numeric ticks". Log scales override this to produce
     * powers of the base.
     */
    getCustomLabels?(valueRange: number[], opts?: {
        unitDecimalPlaces?: number;
        [key: string]: any;
    }): {
        value: number;
        label: string;
    }[] | null;
}
/** Identity scale — the default for every axis. */
export declare class LinearBase implements _ScaleBase {
    scaleFactor: number;
    constructor(scaleFactor?: number);
    functionOf(value: number): number;
    inverseFunctionOf(value: number): number;
    getCustomLabels(): null;
}
/** Logarithmic scale. `functionOf(x) = log_base(x)`, inverse `base**x`. */
export declare class LogBase implements _ScaleBase {
    base: number;
    customLabels: boolean;
    constructor(base?: number, customLabels?: boolean);
    functionOf(value: number): number;
    inverseFunctionOf(value: number): number;
    /**
     * Produce labels of the form `base^exponent` at each integer position across
     * the (already log-space) value range. `valueRange` here is expressed in data
     * units (e.g. [1, 1000, ...]); we walk the exponents between them.
     */
    getCustomLabels(valueRange: number[], opts?: {
        unitDecimalPlaces?: number;
        [key: string]: any;
    }): {
        value: number;
        label: string;
    }[];
}
//# sourceMappingURL=graphing_scale.d.ts.map