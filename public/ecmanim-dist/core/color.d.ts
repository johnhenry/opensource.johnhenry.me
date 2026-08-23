import type { ColorLike } from "./types.ts";
export * from "./colors_data.ts";
export declare class Color {
    r: number;
    g: number;
    b: number;
    a: number;
    constructor(r?: number, g?: number, b?: number, a?: number);
    static parse(input: ColorLike | Color | null | undefined): Color;
    static fromHex(hex: string): Color;
    withAlpha(a: number): Color;
    /** Alias for withAlpha (manim's `set_opacity`). */
    opacity(a: number): Color;
    /** Interpolate toward another color in RGB space. */
    interpolate(other: ColorLike | Color, alpha: number): Color;
    /** Blend toward white by `amount` (0..1). */
    lighter(amount?: number): Color;
    /** Blend toward black by `amount` (0..1). */
    darker(amount?: number): Color;
    /** Convert to HSV, each channel in [0, 1]. */
    toHsv(): [number, number, number];
    /** Build a Color from HSV, each channel in [0, 1]. */
    static fromHsv(h: number, s: number, v: number, a?: number): Color;
    static lerp(c1: ColorLike | Color, c2: ColorLike | Color, t: number): Color;
    toRGBAString(alphaOverride?: number | null): string;
    toHex(): string;
}
/** Interpolate between two colors in RGB space. Alias for Color.lerp. */
export declare function interpolateColor(c1: ColorLike | Color, c2: ColorLike | Color, alpha: number): Color;
/** Produce `length` colors evenly interpolated across the given color stops. */
export declare function colorGradient(colors: (ColorLike | Color)[], length: number): Color[];
/** Invert a color's RGB channels (alpha preserved). */
export declare function invertColor(c: ColorLike | Color): Color;
/** Component-wise average of one or more colors. */
export declare function averageColor(...colors: (ColorLike | Color)[]): Color;
/** A random color (uniform in RGB). */
export declare function randomColor(): Color;
/** A random, saturated & bright color. */
export declare function randomBrightColor(): Color;
/** manim's 3D shading helper: darken/lighten an rgb by surface orientation. */
export declare function getShadedRgb(rgb: [number, number, number], point: [number, number, number], unitNormal: [number, number, number], lightSource: [number, number, number]): [number, number, number];
/** Build a Color from an [r, g, b] triple with channels in [0, 1]. */
export declare function rgbToColor([r, g, b]: [number, number, number]): Color;
/** Build a Color from an [r, g, b, a] tuple with channels in [0, 1]. */
export declare function rgbaToColor([r, g, b, a]: [number, number, number, number]): Color;
/** Extract [r, g, b] (channels in [0, 1]) from a color. */
export declare function colorToRgb(c: ColorLike | Color): [number, number, number];
/** Extract [r, g, b, a] (channels in [0, 1]) from a color. */
export declare function colorToRgba(c: ColorLike | Color): [number, number, number, number];
/** Extract [r, g, b] as 0..255 integers from a color. */
export declare function colorToIntRgb(c: ColorLike | Color): [number, number, number];
/** Parse a hex string into an [r, g, b] triple (channels in [0, 1]). */
export declare function hexToRgb(hex: string): [number, number, number];
/** Convert an [r, g, b] triple (channels in [0, 1]) to a hex string. */
export declare function rgbToHex([r, g, b]: [number, number, number]): string;
export declare const WHITE = "#FFFFFF";
export declare const BLACK = "#000000";
export declare const GRAY = "#888888";
export declare const GREY = "#888888";
export declare const RED = "#FC6255";
export declare const GREEN = "#83C167";
export declare const BLUE = "#58C4DD";
export declare const YELLOW = "#FFFF00";
export declare const GOLD = "#F0AC5F";
export declare const ORANGE = "#FF862F";
export declare const PURPLE = "#9A72AC";
export declare const PINK = "#D147BD";
export declare const MAROON = "#C55F73";
export declare const TEAL = "#5CD0B3";
export declare const LIGHT_GRAY = "#BBBBBB";
export declare const DARK_GRAY = "#444444";
export declare const DARK_BLUE = "#236B8E";
export declare const LIGHT_PINK = "#DC75CD";
export declare const BLUE_A = "#C7E9F1";
export declare const BLUE_B = "#9CDCEB";
export declare const BLUE_C = "#58C4DD";
export declare const BLUE_D = "#29ABCA";
export declare const BLUE_E = "#1C758A";
export declare const GREEN_A = "#C9E2AE";
export declare const GREEN_C = "#83C167";
export declare const GREEN_E = "#699C52";
export declare const RED_C = "#FC6255";
export declare const RED_E = "#CF5044";
export declare const YELLOW_C = "#FFFF00";
//# sourceMappingURL=color.d.ts.map