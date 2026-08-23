import { VMobject } from "./VMobject.ts";
export declare const UNITS_PER_WORLD = 100;
export interface GlyphRunEntry {
    mob: VMobject;
    /** Index into the source line where this cluster begins (UTF-16 code units). */
    sourceStart: number;
    /** Length of this cluster in the source line (UTF-16 code units). */
    clusterLength: number;
}
export interface GlyphRunResult {
    entries: GlyphRunEntry[];
    /** Pen x position (opentype px space, per `px`; NOT world units) after the last glyph. */
    endX: number;
}
export interface BuildGlyphRunOptions {
    font: any;
    /** opentype path px size; defaults to UNITS_PER_WORLD. */
    px?: number;
    scaleToWorld: number;
    /** Apply font kerning between clusters. Default true. */
    kerning?: boolean;
    /** Include GSUB ligature features (liga/clig/calt) when shaping with the
     *  HarfBuzz backend. Default true. No effect on the opentype.js backend
     *  (which never performs GSUB substitution at all). */
    ligatures?: boolean;
}
export type TextShapingBackend = "opentype" | "harfbuzz";
/** Which backend buildGlyphRun() will *try* to use. */
export declare function getTextShapingBackend(): TextShapingBackend;
/**
 * Which backend actually ran for the most recent buildGlyphRun() call --
 * may differ from getTextShapingBackend() if HarfBuzz was requested but
 * couldn't be used (not loaded yet, or the active font has no raw bytes),
 * in which case buildGlyphRun() transparently falls back to "opentype".
 */
export declare function isTextShapingBackendActive(): TextShapingBackend;
/**
 * Select the shaping backend. Selecting "harfbuzz" loads harfbuzzjs (if not
 * already loaded) and resolves once it's ready to use -- await this before
 * constructing Text/VText that should use it; a Text/VText built before the
 * load resolves falls back to "opentype" for that call, not an error.
 */
export declare function setTextShapingBackend(backend: TextShapingBackend): Promise<void>;
/**
 * Build one VMobject per grapheme cluster in `line`, laid out left-to-right
 * starting at pen position (0,0) in opentype px space. Callers position the
 * whole run (e.g. onto a line's y offset) and add the resulting mobjects.
 */
export declare function buildGlyphRun(line: string, opts: BuildGlyphRunOptions): GlyphRunResult;
/**
 * Advance width of `line` in world units, via the same safe per-cluster
 * `charToGlyph` + kerning walk as `buildGlyphRun` (deliberately NOT
 * `font.getAdvanceWidth()`/`font.forEachGlyph()` -- those route through
 * opentype.js's whole-string GSUB/bidi shaping pipeline, which throws on
 * some fonts for lookup types it doesn't implement; the per-character path
 * this module already uses to build glyphs avoids that entirely). Skips
 * building any glyph outlines, so this is cheap to call repeatedly (e.g.
 * once per candidate line while word-wrapping).
 */
export declare function measureGlyphRunWidth(line: string, opts: BuildGlyphRunOptions): number;
//# sourceMappingURL=text_shaping.d.ts.map