import type { Camera } from "../renderer/CanvasRenderer.ts";
import type { SpringConfig } from "../animation/spring.ts";
export interface InteractiveCameraOptions {
    /** Called after every camera mutation (pan/orbit/zoom) so the caller can redraw. */
    render: () => void;
    /** Mobjects tested for picking on click/hover. Defaults to none (picking disabled). */
    mobjects?: any[];
    onClick?: (hit: PickResult | null, ev: any) => void;
    onHover?: (hit: PickResult | null, ev: any) => void;
    /** World units of pan per pixel dragged is derived from the camera; this only
     * scales orbit (degrees per pixel) and wheel zoom (multiplier per notch). */
    orbitSensitivity?: number;
    zoomSensitivity?: number;
    /** Minimum/maximum camera.zoom, applied after every wheel step. Default [0.05, 20]. */
    minZoom?: number;
    maxZoom?: number;
    /** Enable "fling and decelerate" momentum after a drag release: the
     *  released pointer velocity feeds a spring's `velocity0`, sprung back
     *  toward the value it was already at (not toward any fixed target).
     *  Default false. */
    momentum?: boolean;
    /** Spring config used for the momentum decay. Defaults to a gentle,
     *  slightly underdamped feel. */
    momentumConfig?: SpringConfig;
    /** Injectable clock (ms), for deterministic testing. Defaults to Date.now. */
    now?: () => number;
    /** Injectable per-frame scheduler, for deterministic testing. Defaults to
     *  requestAnimationFrame (falls back to a 16ms timer with no DOM). The
     *  returned handle is passed back to `cancelFrame`. */
    scheduleFrame?: (cb: () => void) => any;
    /** Injectable canceller matching `scheduleFrame`'s handle. Defaults to
     *  cancelAnimationFrame (or clearTimeout with no DOM). */
    cancelFrame?: (handle: any) => void;
}
export interface PickResult {
    mobject: any;
    index: number;
}
export interface InteractiveCameraHandle {
    detach(): void;
}
/**
 * Forward-project each mobject's world-space bounding box through
 * `camera.toPixel()` and return the topmost (last-drawn) mobject whose
 * screen-space AABB contains (px, py), or null.
 */
export declare function pickAt(px: number, py: number, mobjects: any[], camera: Camera): PickResult | null;
/**
 * Attach pointer (drag pan/orbit) and wheel (zoom) handlers to `canvas`,
 * mutating `camera` in place and invoking `opts.render()` after each change.
 * Returns a handle whose `detach()` removes every listener — call it from
 * `disconnectedCallback` or equivalent teardown.
 */
export declare function attachInteractiveCamera(canvas: any, camera: Camera, opts: InteractiveCameraOptions): InteractiveCameraHandle;
//# sourceMappingURL=interactive.d.ts.map