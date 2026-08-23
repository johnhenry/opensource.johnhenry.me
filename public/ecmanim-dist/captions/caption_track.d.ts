import { Group } from "../mobject/Mobject.ts";
import { RasterText } from "../mobject/text/Text.ts";
import type { Caption, CaptionPage } from "./captions.ts";
export interface CaptionTrackConfig {
    fontSize?: number;
    color?: string;
    point?: number[];
    align?: "left" | "center" | "right";
    /** Reveal the active caption progressively (default false = show whole). */
    karaoke?: boolean;
    /** Start time offset in ms (default 0). */
    offsetMs?: number;
}
export declare class CaptionTrack extends RasterText {
    captions: Caption[];
    karaoke: boolean;
    private _elapsedMs;
    constructor(captions: Caption[], config?: CaptionTrackConfig);
    private _tick;
    private _render;
    /** Jump the caption clock to `ms` (e.g. when seeking). */
    seekMs(ms: number): this;
}
export interface WordHighlightConfig {
    /** Active-token color (default "#FFE066"). */
    color?: string;
    /** Not-yet-spoken token color (defaults to the base color). */
    inactiveColor?: string;
    /** Active-token scale after the pop settles (default 1.15). */
    scale?: number;
    /** Pop-in duration in ms (default 120). */
    popMs?: number;
    /** Opacity of not-yet-spoken tokens (default 0.4). */
    futureOpacity?: number;
}
export interface WordCaptionTrackConfig {
    fontSize?: number;
    font?: string;
    weight?: string;
    /** Base (already-spoken) token color (default "#FFFFFF"). */
    color?: string;
    /** Center of the caption block (default [0, -3, 0]). */
    point?: number[];
    /** Wrap tokens onto new lines past this world-unit width. */
    maxWidth?: number;
    /** Line height multiplier (default 1.25). */
    lineSpacing?: number;
    /** Start time offset in ms (default 0). */
    offsetMs?: number;
    highlight?: WordHighlightConfig;
}
/**
 * Word-level karaoke captions: consumes `CaptionPage[]` (from
 * `createTikTokStyleCaptions`) and renders one RasterText per token, so the
 * active word can pop and change color independently (TikTok/Submagic style).
 * Layout is computed once per page; per-frame work only mutates each token's
 * color/opacity/box (all pure functions of the elapsed clock — scrubbing and
 * `seekMs` in either direction land on identical frames).
 */
export declare class WordCaptionTrack extends Group {
    pages: CaptionPage[];
    /** The current page's token mobjects, in token order (empty between pages). */
    tokenTexts: RasterText[];
    private _cfg;
    private _hl;
    private _elapsedMs;
    private _pageIndex;
    private _slots;
    private _baseColor;
    private _activeColor;
    private _inactiveColor;
    constructor(pages: CaptionPage[], config?: WordCaptionTrackConfig);
    /** The index of the page currently displayed, or -1 between pages. */
    get currentPageIndex(): number;
    /** Jump the caption clock to `ms` (either direction — layout is stateless). */
    seekMs(ms: number): this;
    private _pageAt;
    private _render;
    /** Build one RasterText per token and lay them out (with maxWidth wrap). */
    private _layoutPage;
    /** Pure function of the clock: color/opacity/scale per token, no state. */
    private _styleTokens;
}
//# sourceMappingURL=caption_track.d.ts.map