import { Mobject } from "../Mobject.ts";
import type { MobjectConfig } from "../Mobject.ts";
import { VGroup } from "../VMobject.ts";
import { Color } from "../../core/color.ts";
import type { ColorLike } from "../../core/types.ts";
/** Configuration accepted by the raster Text mobject. */
export interface TextConfig extends MobjectConfig {
    fontSize?: number;
    font?: any;
    weight?: string;
    slant?: string;
    align?: string;
    fillColor?: ColorLike;
    fillOpacity?: number;
    strokeColor?: ColorLike;
    strokeWidth?: number;
    strokeOpacity?: number;
    lineSpacing?: number;
    /**
     * Wrap width in world units. When set, long lines are greedily word-wrapped
     * to fit (a single word wider than `width` still gets its own unbroken
     * line -- no hyphenation). Explicit `\n`s in `text` are preserved as hard
     * paragraph breaks and each paragraph is wrapped independently. Wrapping
     * normalizes runs of spaces within a paragraph to single spaces; this is a
     * simple greedy wrap (matching common practice elsewhere, e.g. Satori),
     * not full Unicode line-breaking (UAX#14) -- CJK/no-space scripts and
     * hyphenation are out of scope.
     */
    width?: number;
    /**
     * Suppress GSUB ligature substitution (liga/clig/calt). Only has an effect
     * when the optional HarfBuzz shaping backend is active
     * (`setTextShapingBackend("harfbuzz")`, see text_shaping.ts) -- the
     * default "opentype" backend never performs GSUB substitution at all, so
     * this flag is a no-op there (there's nothing to disable).
     */
    disableLigatures?: boolean;
    t2c?: Record<string, ColorLike>;
    t2w?: Record<string, string>;
    t2s?: Record<string, string>;
    t2g?: Record<string, ColorLike[]>;
    gradient?: ColorLike[];
    point?: number[];
    at?: number[];
}
export declare const CHAR_ASPECT = 0.55;
/**
 * manim parity helper: convert a manim `font_size` (points; manim's default
 * Text size is 48) to ecmanim world units (default Text fontSize 0.7). So
 * `fontSizePt(48) === 0.7`, and a port of `Text("hi", font_size=96)` is
 * `new Text("hi", { fontSize: fontSizePt(96) })`.
 */
export declare function fontSizePt(points: number): number;
/**
 * Estimate a text block's rendered width/height without constructing a
 * mobject — the same formula `RasterText`/`Text` use internally to size
 * themselves before real glyph layout is available. A fast approximation,
 * not a guarantee: for anything close to a layout boundary, prefer measuring
 * a real, constructed mobject's `.getWidth()`/`.getHeight()` instead.
 *
 * Node caveat: `Text`/`getWidth()` only use this raster estimate until a
 * vector font has been loaded in the process (which `render()` does
 * automatically before running your scene's `construct()`). If you measure
 * a `Text` mobject constructed *outside* of `construct()` — e.g. in a
 * layout-planning step that runs before `render()` — call `loadVectorFont()`
 * (from `ecmanim/node`) once first, or the measurement can disagree with
 * what the same string renders as by ~10% (see issue #14).
 */
export declare function estimateTextSize(text: string, fontSize: number, opts?: {
    lineHeight?: number;
    width?: number;
}): {
    width: number;
    height: number;
};
export declare class RasterText extends Mobject {
    _isText: boolean;
    text: string;
    fontSize: number;
    font: string;
    weight: string;
    slant: string;
    align: string;
    fillColor: Color;
    fillOpacity: number;
    strokeOpacity: number;
    revealFraction: number;
    numLines: number;
    constructor(text?: string, config?: TextConfig);
    _buildBox(): void;
    setColor(color: ColorLike): this;
    setOpacity(o: number): this;
    currentFontHeight(): number;
    interpolate(start: any, target: any, alpha: number): this;
    copy(): this;
}
export declare class Text extends VGroup {
    text: string;
    fontSize: number;
    fontFamily: string;
    weight: string;
    slant: string;
    align: string;
    lineSpacing: number;
    /** See {@link TextConfig.disableLigatures}. */
    disableLigatures: boolean;
    /** Vector mode only: first-line baseline Y relative to the mobject center
     *  AT CONSTRUCTION (world units; not maintained through later scaling).
     *  Lets token-row layouts align mixed-height tokens on a real baseline. */
    baselineOffset?: number;
    chars: VGroup;
    _charSource: number[];
    _plainText: string;
    _isText?: boolean;
    fillColor: Color;
    fillOpacity: number;
    strokeOpacity: number;
    revealFraction?: number;
    numLines?: number;
    private _rasterFontSize?;
    private _rasterFont?;
    constructor(text?: string, config?: TextConfig);
    private _buildAsRaster;
    private _buildRasterBox;
    get font(): string;
    set font(v: string);
    currentFontHeight(): number;
    private _buildGlyphs;
    private _matchRanges;
    private _glyphsForRange;
    getPartsByText(substr: string): VGroup[];
    getPartByText(substr: string): VGroup;
    private _originalToPlainIndex;
    /**
     * Group `this.chars` into per-word VGroups, splitting on runs of
     * whitespace (including "\n") in the original source text -- a "word" is
     * a maximal run of non-whitespace characters. Whitespace itself produces
     * no word group (runs collapse; multiple spaces between words still
     * yield exactly one boundary). Returned VGroups are NEW wrapper objects
     * whose submobjects are the SAME `chars`/glyph mobject instances (shared
     * identity), so animating a word doesn't disturb `this.chars`' own
     * structure but stays visually consistent with it.
     */
    words(): VGroup[];
    /**
     * Group `this.chars` into per-line VGroups, splitting on "\n" in the
     * original source text. Unlike `words()`, whitespace WITHIN a line
     * (including its invisible space glyphs) is kept. A single line with no
     * newlines returns one VGroup containing everything. Same
     * identity-sharing behavior as `words()`.
     */
    lines(): VGroup[];
    setColorByT2c(t2c?: Record<string, ColorLike>): this;
    setColorByT2g(t2g?: Record<string, ColorLike[]>): this;
    private _applyT2w;
    private _applyT2s;
    setColorByGradientText(colors: ColorLike[]): this;
    private _gradientAcross;
    setColor(color: ColorLike): this;
    copy(): this;
}
export declare class MarkupText extends Text {
    constructor(markup?: string, config?: TextConfig);
    static _parse(markup: string): {
        plain: string;
        t2c: Record<string, string>;
        t2w: Record<string, string>;
        t2s: Record<string, string>;
        t2g: Record<string, string[]>;
    };
}
//# sourceMappingURL=Text.d.ts.map