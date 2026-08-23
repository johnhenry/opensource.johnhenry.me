export declare function ascending(a: any, b: any): number;
export declare function descending(a: any, b: any): number;
export declare function extent<T>(values: Iterable<T>, accessor?: (d: T, i: number) => number | null | undefined): [number, number];
export declare function max<T>(values: Iterable<T>, accessor?: (d: T, i: number) => number | null | undefined): number;
export declare function min<T>(values: Iterable<T>, accessor?: (d: T, i: number) => number | null | undefined): number;
export declare function sum<T>(values: Iterable<T>, accessor?: (d: T, i: number) => number | null | undefined): number;
export declare function mean<T>(values: Iterable<T>, accessor?: (d: T, i: number) => number | null | undefined): number;
/** d3.range: arithmetic progression [start, stop) by step. */
export declare function rangeOf(start: number, stop?: number, step?: number): number[];
/** R-7 quantile on an UNSORTED copy (matches d3.quantile). */
export declare function quantile(values: Iterable<number>, p: number, accessor?: (d: any, i: number) => number): number;
/** Simple moving average over a fixed window (ECharts MA5/MA10-style). Output
 *  has the same length as `values`; entries before the window fills (i <
 *  window-1) are NaN, matching a chart's "no MA yet" convention. */
export declare function movingAverage(values: number[], window: number): number[];
export declare function group<T, K>(values: Iterable<T>, key: (d: T) => K): Map<K, T[]>;
export declare function groups<T, K>(values: Iterable<T>, key: (d: T) => K): Array<[K, T[]]>;
export declare function rollup<T, K, V>(values: Iterable<T>, reduce: (group: T[]) => V, key: (d: T) => K): Map<K, V>;
export declare function rollups<T, K, V>(values: Iterable<T>, reduce: (group: T[]) => V, key: (d: T) => K): Array<[K, V]>;
/** d3.groupSort: keys of group(values, key) sorted by comparing reduced groups. */
export declare function groupSort<T, K>(values: Iterable<T>, reduceOrCompare: ((group: T[]) => any) | ((a: T[], b: T[]) => number), key: (d: T) => K): K[];
/** d3.pairs: consecutive pairs [[a,b],[b,c],...]. */
export declare function pairs<T, R = [T, T]>(values: Iterable<T>, reducer?: (a: T, b: T) => R): R[];
/** The step d3 would pick for ~count ticks across [start, stop].
 *  Negative return = inverse step (1/-step), exactly like d3.tickIncrement. */
export declare function tickIncrement(start: number, stop: number, count: number): number;
export declare function tickStep(start: number, stop: number, count: number): number;
/** d3.ticks: nice round values covering [start, stop] with ~count entries. */
export declare function ticks(start: number, stop: number, count: number): number[];
/** Expand [start, stop] outward to tick-aligned bounds (d3.nice). */
export declare function niceExtent(start: number, stop: number, count: number): [number, number];
//# sourceMappingURL=array_utils.d.ts.map