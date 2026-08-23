import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import type { Mobject } from "../mobject/Mobject.ts";
import type { Vec3 } from "../core/types.ts";
/** Config accepted by the passing-flash animations. */
export interface PassingFlashConfig extends AnimationConfig {
    timeWidth?: number;
    nSegments?: number;
}
/**
 * ShowPassingFlash: a bright segment of the outline slides from the start of the
 * mobject to the end. Implemented by sliding a [strokeStart, strokeEnd] window
 * of width `timeWidth` from just before 0 to just past 1. Remover: the temporary
 * highlight is removed and the mobject fully restored when done.
 */
export declare class ShowPassingFlash extends Animation {
    timeWidth: number;
    startStroke: Array<{
        start: number;
        end: number;
    }>;
    constructor(vmobject: Mobject, config?: PassingFlashConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
/**
 * ShowPassingFlashWithThinningStrokeWidth: like ShowPassingFlash, but the flash
 * segment's stroke width tapers toward its trailing edge. `nSegments` controls
 * the resolution of the taper (here approximated by scaling the whole stroke
 * width by a triangular envelope over the sweep).
 */
export declare class ShowPassingFlashWithThinningStrokeWidth extends ShowPassingFlash {
    nSegments: number;
    startWidths: number[];
    constructor(vmobject: Mobject, config?: PassingFlashConfig);
    setup(): void;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
/** Config for ApplyWave. */
export interface ApplyWaveConfig extends AnimationConfig {
    direction?: Vec3 | number[];
    amplitude?: number;
    wavelength?: number;
    timeWidth?: number;
}
/**
 * ApplyWave: a transverse wave passes through the mobject. Each point is
 * displaced along `direction` by a sine whose phase depends on the point's
 * position along the perpendicular axis and the (there-and-back) alpha, so the
 * mobject returns to its original shape at alpha=1.
 */
export declare class ApplyWave extends Animation {
    direction: number[];
    amplitude: number;
    wavelength: number;
    timeWidth: number;
    startPoints: number[][][];
    axisMin: number;
    axisSpan: number;
    constructor(mobject: Mobject, config?: ApplyWaveConfig);
    setup(): void;
    private _propagationAxis;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
/** Config for Blink. */
export interface BlinkConfig extends AnimationConfig {
    timeOn?: number;
    timeOff?: number;
    blinks?: number;
    hideAtEnd?: boolean;
}
/**
 * Blink: toggle the mobject's opacity on and off `blinks` times. Each cycle
 * lasts timeOn + timeOff; the mobject is visible during the first timeOn slice.
 */
export declare class Blink extends Animation {
    timeOn: number;
    timeOff: number;
    blinks: number;
    hideAtEnd: boolean;
    startOpacities: Array<{
        fill: number;
        stroke: number;
        op: number;
    }>;
    constructor(mobject: Mobject, config?: BlinkConfig);
    setup(): void;
    private _visibleAt;
    interpolateMobject(alpha: number): void;
    finish(): this;
}
//# sourceMappingURL=indication_extra.d.ts.map