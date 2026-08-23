/**
 * d3.format(specifier) subset. Recognized: optional sign ("+"), optional
 * comma grouping (","), optional precision (".N"), optional trim ("~"),
 * type in d, f, %, s, e, g (default = f-ish general).
 */
export declare function format(specifier?: string): (v: number) => string;
/** Pick a sensible default axis specifier for [a, b] with ~count ticks —
 *  the role d3's precisionFixed plays in scale.tickFormat. */
export declare function formatSpecifierAuto(a: number, b: number, count: number): string;
/** d3.utcFormat(specifier) subset (UTC only). `%-d`/`%-m` = unpadded. */
export declare function utcFormat(specifier: string): (date: Date | number) => string;
export interface UtcInterval {
    floor(date: Date | number): Date;
    offset(date: Date | number, step?: number): Date;
    range(start: Date | number, stop: Date | number, step?: number): Date[];
    count(start: Date | number, end: Date | number): number;
    ceil(date: Date | number): Date;
}
export declare const utcDay: UtcInterval;
export declare const utcSunday: UtcInterval;
export declare const utcMonday: UtcInterval;
export declare const utcMonth: UtcInterval;
export declare const utcYear: UtcInterval;
//# sourceMappingURL=format.d.ts.map