/** A single caption token/segment. `text` is whitespace-sensitive. */
export interface Caption {
    text: string;
    startMs: number;
    endMs: number;
    /** When the word is "said" (for karaoke), or null. */
    timestampMs: number | null;
    /** ASR confidence in [0,1], or null. */
    confidence: number | null;
}
/** Parse an SRT string into captions (one per cue; text keeps its line breaks). */
export declare function parseSrt(srt: string): Caption[];
/** Serialize captions back to an SRT string. */
export declare function serializeSrt(captions: Caption[]): string;
export interface CaptionToken {
    text: string;
    fromMs: number;
    toMs: number;
}
export interface CaptionPage {
    text: string;
    startMs: number;
    durationMs: number;
    tokens: CaptionToken[];
}
/**
 * Group caption tokens into "pages" for word-by-word/karaoke rendering: tokens
 * are combined into one page while the gap between consecutive tokens is within
 * `combineTokensWithinMilliseconds`. Mirrors Remotion's createTikTokStyleCaptions.
 */
export declare function createTikTokStyleCaptions(opts: {
    captions: Caption[];
    combineTokensWithinMilliseconds: number;
}): {
    pages: CaptionPage[];
};
/** The active caption at a given time (ms), or null. */
export declare function captionAt(captions: Caption[], timeMs: number): Caption | null;
//# sourceMappingURL=captions.d.ts.map