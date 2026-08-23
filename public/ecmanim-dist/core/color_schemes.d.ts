import { Color } from "./color.ts";
export declare const schemeCategory10: string[];
export declare const schemeTableau10: string[];
export declare const schemeObservable10: string[];
export declare const schemeBlues: ReadonlyArray<readonly string[] | undefined>;
/** t in [0,1] → hex, RGB-lerping between adjacent stops. */
export declare function makeInterpolator(stops: readonly string[]): (t: number) => string;
export declare const interpolateBlues: (t: number) => string;
export declare const interpolateBuPu: (t: number) => string;
export declare const interpolatePiYG: (t: number) => string;
export declare const interpolateBrBG: (t: number) => string;
export declare const interpolateSpectral: (t: number) => string;
export declare const interpolateViridis: (t: number) => string;
export declare const interpolateTurbo: (t: number) => string;
export declare const interpolateRainbow: (t: number) => string;
export interface Hsv {
    h: number;
    s: number;
    v: number;
}
/** d3.hsv(h, s, v) equivalent value object (h in degrees). */
export declare function hsv(h: number, s: number, v: number): Hsv;
/** d3.interpolateHsvLong: hue takes the LONG way around the wheel. */
export declare function interpolateHsvLong(a: Hsv, b: Hsv): (t: number) => string;
/** The volcano notebook's terrain ramp, exactly as it defines it. */
export declare const interpolateTerrain: (t: number) => string;
/** d3.interpolateHcl(a, b): shortest-hue-path interpolation in LCh(ab). */
export declare function interpolateHcl(a: string | Color, b: string | Color): (t: number) => string;
//# sourceMappingURL=color_schemes.d.ts.map