import { Color } from "../core/color.ts";
export interface ASSScriptInfo {
    playResX: number;
    playResY: number;
    wrapStyle: 0 | 1 | 2 | 3;
    scaledBorderAndShadow: boolean;
    format: "ass" | "ssa";
}
export interface ASSStyle {
    name: string;
    fontName: string;
    fontSize: number;
    primaryColor: Color;
    secondaryColor: Color;
    outlineColor: Color;
    backColor: Color;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikeOut: boolean;
    scaleX: number;
    scaleY: number;
    spacing: number;
    angle: number;
    borderStyle: number;
    outline: number;
    shadow: number;
    alignment: number;
    marginL: number;
    marginR: number;
    marginV: number;
}
export interface ASSEvent {
    layer: number;
    startMs: number;
    endMs: number;
    style: string;
    name: string;
    marginL: number;
    marginR: number;
    marginV: number;
    effect: string;
    text: string;
    isComment: boolean;
}
export interface ASSScript {
    info: ASSScriptInfo;
    styles: Map<string, ASSStyle>;
    events: ASSEvent[];
}
/** "&HAABBGGRR&" / "&HBBGGRR" / "BBGGRR" -> Color (alpha nibble inverted: 00=opaque). */
export declare function parseAssColor(s: string): Color;
/** "H:MM:SS.CC" -> milliseconds. */
export declare function parseAssTime(s: string): number;
/** Parse a full .ass/.ssa script. Throws only when no usable [Events] section exists. */
export declare function parseASS(text: string): ASSScript;
export type ASSToken = {
    type: "text";
    text: string;
} | {
    type: "tag";
    name: string;
    args: string;
    raw: string;
};
/** Tokenize one Dialogue event's raw text into text runs + override tags. */
export declare function tokenizeOverrideText(rawText: string): ASSToken[];
/** \fad(t1,t2): fade in over t1 ms, fade out over the last t2 ms. Returns an opacity multiplier. */
export declare function evalFad(t1: number, t2: number, tMs: number, lineDurMs: number): number;
/** \fade(a1,a2,a3,t1,t2,t3,t4): piecewise-linear opacity through 3 alpha levels. Alphas are 0-255 (ASS convention); returns opacity 0..1. */
export declare function evalFade(a1: number, a2: number, a3: number, t1: number, t2: number, t3: number, t4: number, tMs: number): number;
/** \move(x1,y1,x2,y2[,t1,t2]): LINEAR interpolation (no easing, per spec) between two points. */
export declare function evalMove(x1: number, y1: number, x2: number, y2: number, t1: number, t2: number, tMs: number, lineDurMs: number): [number, number];
export interface KaraokeSyllable {
    durCs: number;
    text: string;
    kind: "k" | "kf" | "ko";
}
/** Which syllable is active at tMs (relative to the line's own start), and how far through it (0..1, for sweep tags). */
export declare function evalKaraoke(syllables: KaraokeSyllable[], tMs: number, lineStartMs: number): {
    index: number;
    fraction: number;
};
/** \an numpad alignment (1-9) -> the [0,1] anchor fraction within a run's own bbox (0,0 = bottom-left of bbox, matching how the offset is subtracted from the tag position). */
export declare function alignmentAnchorFraction(alignment: number): [number, number];
export interface ResolvedRunStyle {
    fontName: string;
    fontSize: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikeOut: boolean;
    primary: Color;
    secondary: Color;
    outline: Color;
    back: Color;
    scaleX: number;
    scaleY: number;
    angle: number;
    borderWidth: number;
    shadowDepth: number;
    posOverride: [number, number] | null;
    orgOverride: [number, number] | null;
    shearX: number;
    shearY: number;
    blurRadius: number;
    alignment: number;
    drawScale: number;
}
export interface ResolvedRun {
    text: string;
    style: ResolvedRunStyle;
}
export declare function resolveLineRuns(tokens: ASSToken[], baseStyle: ASSStyle, styles: Map<string, ASSStyle>, tMs: number, lineStartMs: number, lineDurMs: number): ResolvedRun[];
/** Fade opacity considering both \fad and \fade tags anywhere in the token stream (last one wins, matching \r-reset-style "last stated value wins" semantics). */
export declare function evalLineOpacity(tokens: ASSToken[], tMs: number, lineStartMs: number, lineDurMs: number): number;
export interface ClipRect {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    invert: boolean;
}
/**
 * Extract a RECTANGULAR \clip(x1,y1,x2,y2) / \iclip(x1,y1,x2,y2) anywhere in
 * the token stream (last one wins). Vector-drawing clip
 * (\clip([scale,]drawing-commands)) is detected but returns null with
 * `vectorForm: true` in the second element, since it needs the v2 drawing
 * parser (parseDrawingCommands) that doesn't exist yet at this stage --
 * ass_mobject.ts's warning pass surfaces that case distinctly from "no clip
 * at all" so a future v2 pass can find every site that needs upgrading.
 */
export declare function evalClipRect(tokens: ASSToken[]): {
    rect: ClipRect | null;
    vectorFormPresent: boolean;
};
export declare function extractKaraokeSyllables(tokens: ASSToken[]): KaraokeSyllable[];
export declare function hasKaraokeTags(tokens: ASSToken[]): boolean;
/**
 * Convert a uniform cubic B-spline (n >= 3 control points, the shape ASS's
 * \s drawing command builds) to a piecewise-cubic-Bezier flat point list
 * (`[anchor, c1,c2,end, c1,c2,end, ...]`, ready to append into a subpath's
 * point list directly).
 *
 * Derivation (standard CAGD result, NOT a libass-specific detail -- derived
 * here from the canonical uniform cubic B-spline blending function so it
 * doesn't depend on a "remembered spec detail," per the plan's explicit
 * caution about this conversion): for 4 consecutive spline control points
 * P0,P1,P2,P3, matching the spline's value AND derivative at t=0 and t=1
 * against the Bezier form gives
 *   B0 = (P0 + 4*P1 + P2) / 6        B1 = (2*P1 + P2) / 3
 *   B3 = (P1 + 4*P2 + P3) / 6        B2 = (P1 + 2*P2) / 3
 * Consecutive 4-point windows overlap by 3 points, and segment i's B3
 * algebraically equals segment (i+1)'s B0, so the result is a single
 * continuous chain -- exactly the flat-list convention this function
 * returns. n control points (n >= 4) produce n-3 segments.
 *
 * n == 3 (the spec's stated minimum) has no 4-point window at all; there's
 * no confirmed reference for libass's exact behavior in this edge case, so
 * it's approximated here as a plain quadratic curve through the 3 points
 * (elevated to cubic via the same quadToCubic used for SVG's Q command) --
 * smooth and endpoint-exact, but a documented approximation, not a verified
 * libass match.
 */
export declare function uniformBSplineToBezier(controlPoints: number[][]): number[][];
/**
 * Parse an ASS \p<n> drawing-command string (m/l/b/s/p/c) into
 * parsePathToSubpaths-shaped subpaths. `scaleExponent` is the \p<n> tag's
 * own n (1 = no scaling; n>=2 divides every coordinate by 2^(n-1), per the
 * ASS spec's "higher internal precision" convention for drawing scale).
 */
export declare function parseDrawingCommands(raw: string, scaleExponent: number): number[][][];
//# sourceMappingURL=ass_loader.d.ts.map