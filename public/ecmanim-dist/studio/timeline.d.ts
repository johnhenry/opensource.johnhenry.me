export interface FrameAxisOptions {
    totalFrames: number;
    pixelWidth: number;
}
export declare function frameToPixel(frame: number, opts: FrameAxisOptions): number;
export declare function pixelToFrame(px: number, opts: FrameAxisOptions): number;
export interface TimeAxisOptions {
    duration: number;
    pixelWidth: number;
}
export declare function timeToPixel(t: number, opts: TimeAxisOptions): number;
export declare function pixelToTime(px: number, opts: TimeAxisOptions): number;
export interface SectionThumbnailLayout {
    section: any;
    x: number;
    width: number;
}
/**
 * Pure layout: one thumbnail slot per section, sized proportionally to the
 * section's own share of the timeline, clamped to `minWidth` so short
 * sections stay clickable/visible. An open section (endFrame < 0, i.e. the
 * live/last one before finalizeSections() runs) extends to totalFrames.
 */
export declare function computeSectionThumbnails(sections: any[], opts: FrameAxisOptions & {
    minWidth?: number;
}): SectionThumbnailLayout[];
/**
 * Draws one thumbnail per section along a strip, each showing that
 * section's first frame (via Player.drawFrameTo(), already "nearly free"
 * since frames are rasterized bitmaps) at its computed layout position.
 */
export declare function renderSectionOverview(ctx: any, player: {
    sections(): any[];
    frameCount: number;
    drawFrameTo: (ctx: any, frameIndex: number, opts?: any) => void;
}, opts: {
    pixelWidth: number;
    height: number;
    minWidth?: number;
}): SectionThumbnailLayout[];
export interface StepMarkerLayout {
    step: any;
    x: number;
}
/** Pure layout: one tick mark per playRecord (step), at its start frame. */
export declare function computeStepMarkers(steps: any[], opts: FrameAxisOptions): StepMarkerLayout[];
export interface WaveformBar {
    x: number;
    height: number;
}
/** Pure layout: one bar per sample, evenly spaced, height proportional to
 *  the sample's peak amplitude (expected in [-1, 1], e.g. from
 *  getWaveformPortion()). */
export declare function computeWaveformBars(samples: number[], opts: {
    pixelWidth: number;
    maxHeight: number;
}): WaveformBar[];
/** Draws vertically-centered bars for one sound's waveform onto `ctx`,
 *  positioned at `opts.x`/`opts.y` (e.g. timeToPixel(sound.time, ...) for a
 *  sound scheduled partway through the scene). */
export declare function renderWaveform(ctx: any, samples: number[], opts: {
    pixelWidth: number;
    height: number;
    x?: number;
    y?: number;
    color?: string;
}): WaveformBar[];
export interface KeyframeMarkerLayout {
    track: {
        keyframes: Array<{
            t: number;
        }>;
    };
    keyframe: {
        t: number;
    };
    index: number;
    x: number;
}
/** Pure layout: one marker per keyframe across all tracks, positioned by time. */
export declare function computeKeyframeMarkers(tracks: Array<{
    keyframes: Array<{
        t: number;
    }>;
}>, opts: TimeAxisOptions): KeyframeMarkerLayout[];
/** Draws one row per track, one dot per keyframe. */
export declare function renderKeyframeTimeline(ctx: any, tracks: Array<{
    keyframes: Array<{
        t: number;
    }>;
}>, opts: TimeAxisOptions & {
    rowHeight?: number;
    radius?: number;
    color?: string;
}): KeyframeMarkerLayout[];
export interface KeyframeTimelineEditorOptions extends TimeAxisOptions {
    rowHeight?: number;
    /** Pixel radius within which a pointerdown grabs a keyframe marker. */
    hitRadius?: number;
    /** Called after every drag-move (cheap visual update only). */
    onChange?: () => void;
    /**
     * Called once, debounced, after a drag-release. CRITICAL wiring detail:
     * Player.frames[] are frozen bitmaps, so dragging a keyframe has no
     * effect on already-recorded frames until a re-record happens -- wire
     * this to the SAME parameter-only re-render primitive item 7 uses
     * (`player.rerender(...)` / `Player.record(scene, { props })`) to rebake.
     */
    onCommit?: () => void;
    /** Debounce delay before onCommit() fires (default 150ms). */
    commitDelayMs?: number;
}
/**
 * Attaches pointer drag handlers to `canvas` for dragging a keyframe's `t`
 * along the shared time axis (mutating `track.keyframes` directly -- the
 * same "sorted, mutable" contract KeyframeTrack.addKeyframe()/
 * removeKeyframe() already expose for Studio editability).
 */
export declare function attachKeyframeTimelineEditor(canvas: any, tracks: Array<{
    keyframes: Array<{
        t: number;
    }>;
}>, opts: KeyframeTimelineEditorOptions): {
    detach(): void;
};
//# sourceMappingURL=timeline.d.ts.map