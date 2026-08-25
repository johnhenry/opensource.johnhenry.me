import { Group } from "./Mobject.ts";
import type { Mobject } from "./Mobject.ts";
import type { ASSScript, ASSStyle } from "../loaders/ass_loader.ts";
export interface ASSConfig {
    /** World-unit fit (like LottieConfig) -- default ~10 units wide. */
    width?: number;
    height?: number;
    /** attachTo clock multiplier (default 1). No `loop` option -- subtitles have a natural non-looping end (durationMs). */
    speed?: number;
    /** Resolve an ASS style's FontName to a font ecmanim can actually load; falsy/undefined falls back to the default font (warned once per distinct missing name). */
    fontResolver?: (styleFontName: string) => string | undefined;
}
export declare function loadASS(assText: string, config?: ASSConfig): ASSMobject;
export declare class ASSMobject extends Group {
    readonly warnings: string[];
    readonly resX: number;
    readonly resY: number;
    /** Duration in ms: the last event's end time. */
    readonly durationMs: number;
    speed: number;
    private _script;
    private _cues;
    private _k;
    private _clock;
    private readonly _fontResolver?;
    private readonly _warnedFonts;
    constructor(script: ASSScript, config?: ASSConfig);
    /** Pose every cue at `tMs` -- a pure function of the script. Same tMs in, same world geometry out, in any call order. */
    setTime(tMs: number): this;
    /** Pose at frame `f` (`setTime((f / fps) * 1000)`). */
    setFrame(f: number, fps?: number): this;
    attachTo(scene: {
        add(...mobs: Mobject[]): unknown;
    }): this;
    cues(): string[];
    cue(index: number): Mobject | undefined;
    styles(): string[];
    style(name: string): ASSStyle | undefined;
    private _warn;
    private _buildCues;
    private _warnUnsupportedTags;
    private _renderCue;
    private _worldFontSize;
    private _refPx;
    private _worldX;
    private _worldY;
    private _marginAnchor;
    private _clipMask;
    private _lineLeftX;
    private _renderRuns;
    private _renderDrawing;
    private _applyOrgTransform;
    private _buildRunText;
    private _resolveFont;
    private _renderKaraoke;
}
//# sourceMappingURL=ass_mobject.d.ts.map