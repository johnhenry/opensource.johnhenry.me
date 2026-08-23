import type { TTSSynthesizeOptions } from "./providers.ts";
export interface Bookmark {
    name: string;
    charIndex: number;
}
/** Strip <bookmark mark="name"/> tags, returning clean text + tag char positions. */
export declare function parseBookmarks(text: string): {
    clean: string;
    bookmarks: Bookmark[];
};
export declare class VoiceoverTracker {
    readonly duration: number;
    /**
     * How bookmark times were derived. "word-boundaries" means the TTS provider
     * returned per-word timings and bookmarks are exact; "proportional" means the
     * bookmark time is estimated from its character offset (speech pace varies,
     * so expect drift of up to a few hundred ms on real narration).
     */
    readonly timingSource: "word-boundaries" | "proportional";
    private scene;
    private startTime;
    private bookmarkTimes;
    constructor(scene: any, duration: number, startTime: number, bookmarkTimes: Map<string, number>, timingSource?: "word-boundaries" | "proportional");
    /** Absolute scene time (seconds) of a bookmark. */
    timeAtBookmark(name: string): number;
    /** Seconds from now until a bookmark (>= 0). */
    timeUntilBookmark(name: string): number;
    /** Advance the scene (a wait) until the given bookmark. */
    waitUntilBookmark(name: string): Promise<void>;
}
export interface VoiceoverOptions extends TTSSynthesizeOptions {
    /** Preferred provider name (else the first available; falls back to "silent"). */
    provider?: string;
    gain?: number;
}
/**
 * Run `callback` under a synthesized voiceover. Synthesizes the narration, adds
 * it to the scene at the current time, invokes `callback(tracker)`, then waits
 * for any remaining audio so the scene time reaches the end of the clip.
 */
export declare function voiceover(scene: any, text: string, callback: (tracker: VoiceoverTracker) => Promise<void> | void, options?: VoiceoverOptions): Promise<VoiceoverTracker>;
//# sourceMappingURL=voiceover.d.ts.map