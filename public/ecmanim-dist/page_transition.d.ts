export interface PlaybackPosition {
    time: number;
}
export interface SavePositionOptions {
    /** sessionStorage key. Default "ecmanim:playback-position". */
    key?: string;
    /** Injectable storage, for testing. Defaults to window.sessionStorage. */
    storage?: Storage | null;
}
/** Save a player's current playback position. No-op if no storage backend
 *  is available (e.g. sessionStorage disabled/unavailable). */
export declare function savePlaybackPosition(player: {
    currentTime: number;
}, opts?: SavePositionOptions): void;
/**
 * Restore (and consume -- one-shot, so a plain reload doesn't keep re-seeking)
 * a previously-saved playback position onto `player` via `seekTime()`.
 * Returns the restored position, or null if none was saved / it was corrupt.
 */
export declare function restorePlaybackPosition(player: {
    seekTime(seconds: number): void;
}, opts?: SavePositionOptions): PlaybackPosition | null;
export interface PageTransitionOptions extends SavePositionOptions {
    /**
     * Opt-in: also perform a View-Transitions-API snapshot handoff around the
     * navigation. Canvases don't participate in the browser's DOM-snapshot
     * mechanism directly, so this captures the outgoing frame into a plain
     * `<img>` positioned over the live canvas (tagged with a
     * `view-transition-name`) right before the page unloads, and tags the
     * incoming page's canvas with the same name so the browser can cross-fade/
     * morph between them. Default false (the plain sessionStorage + seekTime()
     * resume above covers position; this only adds visual continuity).
     */
    viewTransition?: boolean;
    /** The view-transition-name shared between the outgoing snapshot and the
     *  incoming canvas. Default "ecmanim-player-snapshot". */
    viewTransitionName?: string;
    /** Injectable window (for the pagehide listener) and document (for the
     *  snapshot <img>), for testing. Default the real globals. */
    windowRef?: any;
    documentRef?: any;
}
export interface PageTransitionHandle {
    detach(): void;
}
/**
 * Auto-wires a `<manim-player>` element's playback position to survive a
 * full page navigation: saves on `pagehide`, restores on the player's own
 * "ready" event (dispatched after every `record()`, i.e. once the new
 * page's fresh recording is ready to be seeked).
 */
export declare function enablePageTransitionResume(playerEl: any, opts?: PageTransitionOptions): PageTransitionHandle;
//# sourceMappingURL=page_transition.d.ts.map