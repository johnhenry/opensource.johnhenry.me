import type { GlyphRunResult } from "./text_shaping.ts";
/** True once harfbuzzjs has successfully loaded (call loadHarfBuzz() first). */
export declare function isHarfBuzzLoaded(): boolean;
/** Attempt to load harfbuzzjs. Idempotent, memoized, never throws. */
export declare function loadHarfBuzz(): Promise<boolean>;
/**
 * True if `otFont` can actually be shaped via HarfBuzz right now (module
 * loaded AND the font carries its raw bytes). Callers should check this
 * (or just call shapeWithHarfBuzz and handle a null result) before
 * committing to the HarfBuzz code path.
 */
export declare function canShapeWithHarfBuzz(otFont: any): boolean;
export interface ShapeWithHarfBuzzOptions {
    scaleToWorld: number;
    /** Include liga/clig/calt GSUB features. Default true. */
    ligatures?: boolean;
}
/**
 * Shape `text` with HarfBuzz (full GSUB/GPOS) and return the same
 * {entries, endX} shape buildGlyphRun() does -- one VMobject per shaped
 * glyph (NOT necessarily one per source character: a ligature merges
 * several source characters into one glyph; a decomposed combining-mark
 * sequence is composed back into one glyph by the `ccmp` feature). Returns
 * null if HarfBuzz/the font's raw bytes aren't available; callers should
 * fall back to buildGlyphRun() in that case.
 *
 * clusterLength per entry is derived from the gap to the next glyph's
 * (distinct) cluster value, defaulting to "rest of the string" for the
 * last glyph -- correct for the common case (one glyph per one-or-more
 * source characters); multiple glyphs sharing one cluster (rare complex-
 * script one-to-many expansions) get overlapping ranges, a known,
 * documented simplification rather than a fully general many-to-many model.
 */
export declare function shapeWithHarfBuzz(otFont: any, text: string, opts: ShapeWithHarfBuzzOptions): GlyphRunResult | null;
//# sourceMappingURL=text_shaping_hb.d.ts.map