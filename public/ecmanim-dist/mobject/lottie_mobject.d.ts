import { Group } from "./Mobject.ts";
import type { Mobject } from "./Mobject.ts";
import type { LottieAnimation } from "../loaders/lottie_loader.ts";
export interface LottieConfig {
    /** Target world width for the composition (default: fit 10 units wide). */
    width?: number;
    /** Target world height (with `width`, the tighter fit wins). */
    height?: number;
    /** Playback speed multiplier for attachTo (default 1). */
    speed?: number;
    /** Loop playback in attachTo (default true). */
    loop?: boolean;
}
/** Load a Lottie animation (object or JSON string) into a LottieMobject.
 *  Pure of I/O — read the file yourself and pass the contents. */
export declare function loadLottie(json: string | object, config?: LottieConfig): LottieMobject;
export declare class LottieMobject extends Group {
    /** Composition frame rate. */
    readonly fps: number;
    /** Composition in/out points (frames). */
    readonly inPoint: number;
    readonly outPoint: number;
    /** Frames between in and out point. */
    readonly totalFrames: number;
    /** Duration in seconds. */
    readonly duration: number;
    /** Composition size in Lottie pixels. */
    readonly compWidth: number;
    readonly compHeight: number;
    /** Deduplicated unsupported-feature warnings collected while building
     *  and playing. Never throws for unknown layer/shape types. */
    readonly warnings: string[];
    /** attachTo playback speed multiplier. */
    speed: number;
    /** attachTo looping. */
    loop: boolean;
    private _anim;
    private _root;
    /** Pixel→world map (scale + y-flip + centering), fixed at construction. */
    private _worldMat;
    private _clock;
    private _currentFrame;
    constructor(anim: LottieAnimation, config?: LottieConfig);
    /** Pose the whole animation at frame `f` — a pure function of the JSON.
     *  Same frame in, same world geometry out, in any call order. */
    setFrame(f: number): this;
    /** Pose at `t` seconds from the in point (setFrame(ip + t·fps)). */
    setTime(t: number): this;
    /** The frame most recently posed via setFrame/setTime. */
    get currentFrame(): number;
    /** Names of the root composition's layers (from `nm`, JSON order). */
    layers(): string[];
    /** The stable container mobject for the first root layer named `name`
     *  (persists across setFrame calls; its CONTENT is rebuilt per frame). */
    layer(name: string): Mobject | undefined;
    /**
     * Add to `scene` with a clock updater: the internal clock advances by
     * dt·speed and the animation re-poses via setTime (looping over the
     * duration by default). Scrubbing manually still works — the clock only
     * moves inside the updater.
     */
    attachTo(scene: {
        add(...mobs: Mobject[]): unknown;
    }): this;
    private _warn;
    private _buildComp;
    private _updateComp;
    private _clearInst;
    /** Build one items list (a layer's `shapes` or a group's `it`) at `frame`.
     *  Returned leaves are in the LOCAL space of this list (the group's own
     *  `tr` is already applied). */
    private _buildShapeItems;
    private _applyStyle;
    private _applyTrim;
    private _applyRepeater;
    /** Best-effort text: uses t.d.k[0].s → { t: string, s: font size (px),
     *  fc: fill color, j: justification (0 L / 1 R / 2 C) }. Metrics differ
     *  from After Effects; per-character animators are ignored. */
    private _buildText;
}
//# sourceMappingURL=lottie_mobject.d.ts.map