// Shared glyph-run builder for both the raster-fallback vector path (Text.ts)
// and VText (vectorized_text.ts) -- previously two independent, near-identical
// "iterate characters, charToGlyph, getPath, advance x" loops. Kerning,
// grapheme-cluster iteration, and (eventually) real HarfBuzz shaping all touch
// this exact loop, so it lives in one place.
//
// Default backend ("opentype", see setTextShapingBackend() below) iterates
// by Unicode grapheme cluster (not UTF-16 code unit or code point), so
// combining-mark sequences and multi-codepoint emoji count as one glyph
// slot -- every code point in a cluster gets its own opentype.js glyph
// outline, merged into a single VMobject per cluster so the whole cluster
// moves/selects as one unit. It does NOT perform GSUB/GPOS shaping (no
// ligatures, no mark-attachment positioning -- combining marks are drawn at
// the same pen position as their base glyph). The optional "harfbuzz"
// backend (text_shaping_hb.ts) does full real shaping instead.
import { VMobject } from "./VMobject.js";
import { parsePathToSubpaths, subpathsToVMobject } from "./svg_path.js";
export const UNITS_PER_WORLD = 100; // opentype path uses px; scaled to world after.
let _backend = "opentype";
let _lastBackendUsed = "opentype";
let _hbBridge = null;
/** Which backend buildGlyphRun() will *try* to use. */
export function getTextShapingBackend() {
    return _backend;
}
/**
 * Which backend actually ran for the most recent buildGlyphRun() call --
 * may differ from getTextShapingBackend() if HarfBuzz was requested but
 * couldn't be used (not loaded yet, or the active font has no raw bytes),
 * in which case buildGlyphRun() transparently falls back to "opentype".
 */
export function isTextShapingBackendActive() {
    return _lastBackendUsed;
}
/**
 * Select the shaping backend. Selecting "harfbuzz" loads harfbuzzjs (if not
 * already loaded) and resolves once it's ready to use -- await this before
 * constructing Text/VText that should use it; a Text/VText built before the
 * load resolves falls back to "opentype" for that call, not an error.
 */
export async function setTextShapingBackend(backend) {
    _backend = backend;
    if (backend === "harfbuzz" && !_hbBridge) {
        _hbBridge = await import("./text_shaping_hb.js");
        await _hbBridge.loadHarfBuzz();
    }
}
const graphemeSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
function graphemeClusters(line) {
    if (graphemeSegmenter) {
        const out = [];
        for (const seg of graphemeSegmenter.segment(line))
            out.push(seg.segment);
        return out;
    }
    // Environments without Intl.Segmenter: fall back to code-point iteration
    // (still better than a raw UTF-16 code-unit split, just not cluster-aware).
    return Array.from(line);
}
/**
 * Build one VMobject per grapheme cluster in `line`, laid out left-to-right
 * starting at pen position (0,0) in opentype px space. Callers position the
 * whole run (e.g. onto a line's y offset) and add the resulting mobjects.
 */
export function buildGlyphRun(line, opts) {
    const { font, scaleToWorld } = opts;
    if (_backend === "harfbuzz" && _hbBridge?.canShapeWithHarfBuzz(font)) {
        const hbResult = _hbBridge.shapeWithHarfBuzz(font, line, { scaleToWorld, ligatures: opts.ligatures });
        if (hbResult) {
            _lastBackendUsed = "harfbuzz";
            return hbResult;
        }
    }
    _lastBackendUsed = "opentype";
    const px = opts.px ?? UNITS_PER_WORLD;
    const kerning = opts.kerning ?? true;
    const scaleFactor = px / font.unitsPerEm;
    const clusters = graphemeClusters(line);
    const entries = [];
    let x = 0;
    let sourceStart = 0;
    let prevGlyph = null;
    for (const cluster of clusters) {
        const codePoints = Array.from(cluster);
        const glyphs = codePoints.map((cp) => font.charToGlyph(cp));
        const firstGlyph = glyphs[0] ?? null;
        if (kerning && prevGlyph && firstGlyph) {
            const kern = font.getKerningValue(prevGlyph, firstGlyph) ?? 0;
            if (kern)
                x += kern * scaleFactor;
        }
        const mob = new VMobject();
        const allSubs = [];
        for (const glyph of glyphs) {
            const gp = glyph.getPath(x, 0, px);
            const d = gp.toPathData(3);
            if (d && d.length)
                allSubs.push(...parsePathToSubpaths(d));
        }
        if (allSubs.length) {
            subpathsToVMobject(mob, allSubs, { scale: scaleToWorld, translate: [0, 0, 0], flipY: true });
        }
        entries.push({ mob, sourceStart, clusterLength: cluster.length });
        prevGlyph = firstGlyph;
        sourceStart += cluster.length;
        x += (firstGlyph?.advanceWidth ?? font.unitsPerEm * 0.5) * scaleFactor;
    }
    return { entries, endX: x };
}
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
export function measureGlyphRunWidth(line, opts) {
    const { font, scaleToWorld } = opts;
    const px = opts.px ?? UNITS_PER_WORLD;
    const kerning = opts.kerning ?? true;
    const scaleFactor = px / font.unitsPerEm;
    const clusters = graphemeClusters(line);
    let x = 0;
    let prevGlyph = null;
    for (const cluster of clusters) {
        const codePoints = Array.from(cluster);
        const firstGlyph = font.charToGlyph(codePoints[0]);
        if (kerning && prevGlyph && firstGlyph) {
            const kern = font.getKerningValue(prevGlyph, firstGlyph) ?? 0;
            if (kern)
                x += kern * scaleFactor;
        }
        prevGlyph = firstGlyph;
        x += (firstGlyph?.advanceWidth ?? font.unitsPerEm * 0.5) * scaleFactor;
    }
    return x * scaleToWorld;
}
//# sourceMappingURL=text_shaping.js.map