import { VMobject, VGroup } from "./VMobject.ts";
import { TransformMatchingTex } from "../animation/transform_matching.ts";
import type { ColorLike } from "../core/types.ts";
/** Configuration accepted by MathTex / Tex / texToVGroup. */
export interface MathTexConfig {
    color?: ColorLike;
    fillColor?: ColorLike;
    strokeColor?: ColorLike;
    fillOpacity?: number;
    strokeWidth?: number;
    strokeOpacity?: number;
    fontSize?: number;
    point?: number[];
    /** Environment the string is wrapped in, e.g. "align*" (math) or "center". */
    texEnvironment?: string;
    /** Substrings that MathTex should isolate as their own addressable parts. */
    substringsToIsolate?: string[];
    /** Alias accepted by manim; merged with substringsToIsolate. */
    isolate?: string[];
    /** Map of tex substring -> color, applied to matching parts on construction. */
    texToColorMap?: Record<string, ColorLike>;
    /** Separator joined between the individual tex string args. */
    argSeparator?: string;
    [key: string]: any;
}
export declare function initMathTex(): Promise<any>;
export declare function texToSVG(tex: string, config?: MathTexConfig): Promise<string>;
export declare const domAdaptor: {
    kind: (n: any) => string | undefined;
    getAttribute: (n: any, name: string) => string | null;
    childNodes: (n: any) => any[];
};
/**
 * Build glyph VMobjects directly from a real browser `<svg>` Element (as
 * produced by CDN MathJax's `tex2svg()`), via the domAdaptor shim above.
 * Exported so this is independently testable with a hand-built fake element
 * tree -- see test/mathtex-cdn-glyphs.test.ts.
 */
export declare function glyphsFromDomSvg(svgElement: any, config?: MathTexConfig): VMobject[];
export declare function texToVGroup(tex: string, config?: MathTexConfig): VGroup;
export declare class SingleStringMathTex extends VGroup {
    tex: string;
    texEnvironment: string;
    constructor(texString?: string, config?: MathTexConfig);
    setStyle(style: any): this;
}
export declare class MathTex extends VGroup {
    tex: string;
    texStrings: string[];
    texEnvironment: string;
    argSeparator: string;
    substringsToIsolate: string[];
    texToColorMap: Record<string, ColorLike>;
    /** Each entry is a VGroup of the glyphs belonging to one addressable part. */
    parts: VGroup[];
    private _partTex;
    constructor(...args: any[]);
    protected defaultArgSeparator(): string;
    protected preprocessTex(tex: string): string;
    glyphs(): VMobject[];
    getPartsByTex(tex: string): VGroup[];
    getPartByTex(tex: string, config?: {
        substringToIsolate?: string;
    }): VGroup | null;
    indexOfPart(part: VGroup): number;
    indexOfPartByTex(tex: string): number;
    setColorByTex(tex: string, color: ColorLike): this;
    setColorByTexToColorMap(map: Record<string, ColorLike>): this;
    setOpacityByTex(tex: string, opacity?: number): this;
    sortAlphabetically(): this;
    setStyle(style: any): this;
}
export declare class Tex extends MathTex {
    constructor(...args: any[]);
    protected defaultArgSeparator(): string;
    protected preprocessTex(tex: string): string;
}
/** Parse MC-style `{{group}}` markers: returns the tex with markers stripped
 *  plus the list of isolated group strings. */
export declare function parseTexGroups(tex: string): {
    tex: string;
    isolate: string[];
};
export interface MatchTexResult {
    animation: TransformMatchingTex;
    target: MathTex;
}
/**
 * Build the target MathTex for `newTexString` (with `{{...}}` groups
 * isolated, MC-style) and a TransformMatchingTex morphing `old` into it.
 * Extra isolate keys and the old mobject's isolate list are honored so
 * shared substrings pair up. Usage:
 *
 * ```ts
 * const { animation, target } = matchTex(eq, "{{a^2}} + {{b^2}} = c^2");
 * await scene.play(animation);   // `target` is now on screen
 * ```
 */
export declare function matchTex(old: MathTex, newTexString: string, config?: MathTexConfig & {
    keyMap?: Record<string, string>;
    runTime?: number;
}): MatchTexResult;
//# sourceMappingURL=mathtex.d.ts.map