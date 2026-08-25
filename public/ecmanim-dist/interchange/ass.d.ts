import type { ColorLike } from "../core/types.ts";
import type { WordCaptionTrack } from "../captions/caption_track.ts";
import type { VMobject } from "../mobject/VMobject.ts";
export interface AssExportConfig {
    /** [Script Info] resolution the exported Dialogue coordinates are relative to (default 1920x1080). */
    playResX?: number;
    playResY?: number;
    fontName?: string;
    /** PlayRes-pixel font size (default 64). */
    fontSize?: number;
    /** "Already sung" karaoke color (default white). */
    primaryColor?: ColorLike;
    /** "Not yet sung" karaoke color (default a warm yellow, the common fansub convention). */
    secondaryColor?: ColorLike;
    outlineColor?: ColorLike;
    /** ASS numpad alignment (default 2, bottom-center). */
    alignment?: number;
    marginV?: number;
    styleName?: string;
}
/**
 * Serialize a WordCaptionTrack's word-timed pages to a karaoke `.ass`
 * script: one `Dialogue:` line per page, one `\k<centiseconds>` syllable per
 * token, using the token's OWN text (including any inherent word-boundary
 * spacing) verbatim (sanitized).
 */
export declare function wordCaptionTrackToAss(track: WordCaptionTrack, config?: AssExportConfig): string;
export interface AssDrawingExportConfig {
    playResX?: number;
    playResY?: number;
    /** PlayRes pixels per ecmanim world unit (default 100). */
    scale?: number;
    /** Where the shape's own center lands, in PlayRes pixels (default: PlayRes center). */
    pos?: [number, number];
    /** How long the drawing's Dialogue line is shown, in ms (default 5000). */
    durationMs?: number;
    styleName?: string;
    fontName?: string;
}
/**
 * Serialize a single static VMobject to a standalone `\p1` drawing-mode
 * `.ass` file: fill from the shape's own `fillColor`, stroke from
 * `strokeColor`+`strokeWidth`, centered in drawing-space on the shape's own
 * `getCenter()` (so `\pos` places the shape's visual center, matching how
 * most real \p content is authored) and Y-flipped (ecmanim world space is
 * Y-up, ASS drawing space is Y-down like SVG).
 */
export declare function vmobjectToAssDrawing(shape: VMobject, config?: AssDrawingExportConfig): string;
//# sourceMappingURL=ass.d.ts.map