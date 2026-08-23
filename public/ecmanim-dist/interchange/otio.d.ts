export interface RationalTime {
    value: number;
    rate: number;
}
export declare function rationalTime(value: number, rate: number): RationalTime;
export declare function rtSeconds(rt: RationalTime): number;
export interface TimeRange {
    startTime: RationalTime;
    duration: RationalTime;
}
export declare function timeRange(startTime: RationalTime, duration: RationalTime): TimeRange;
export interface OtioClip {
    name: string;
    sourceRange: TimeRange;
    metadata?: Record<string, any>;
    mediaReference?: {
        targetUrl?: string;
    };
}
export interface OtioTrack {
    name?: string;
    kind: "Video" | "Audio";
    children: OtioClip[];
}
export interface OtioTimeline {
    name: string;
    globalStartRate: number;
    tracks: OtioTrack[];
}
/** Serialize a timeline to the OTIO JSON schema (a `.otio` file's contents). */
export declare function toOtioJSON(tl: OtioTimeline): Record<string, any>;
/** Parse OTIO JSON back into the light model (clips with names + time ranges). */
export declare function fromOtioJSON(json: any): OtioTimeline;
/**
 * Build an OTIO timeline from a rendered scene: one Video clip per play()/wait()
 * segment (from `scene.playRecords`), frame-exact via the scene fps. Falls back to
 * `scene.sections` if no play records are present.
 */
export declare function sceneToOtio(scene: any, opts?: {
    name?: string;
    mediaUrl?: string;
}): OtioTimeline;
/** Convenience: a scene's `.otio` JSON string. */
export declare function sceneToOtioString(scene: any, opts?: {
    name?: string;
    mediaUrl?: string;
}): string;
//# sourceMappingURL=otio.d.ts.map