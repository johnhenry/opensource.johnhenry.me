// A scene whose camera viewport is driven by an animatable "frame" mobject.
// Mirrors ManimCommunity's manim/scene/moving_camera_scene.py (paired with the
// MovingCamera in manim/camera/moving_camera.py). Because the renderer's Camera
// exposes `frame` + preRender(), animating this frame (scale/moveTo) pans and
// zooms the view: `scene.play(scene.camera.frame.animate.scale(0.5).moveTo(p))`.
import { Scene } from "./Scene.js";
import { Rectangle } from "../mobject/geometry.js";
import * as V from "../core/math/vector.js";
import { ApplyMethod, Animation } from "../animation/Animation.js";
/**
 * A Rectangle sized to (a fraction of) the camera frame, invisible by default.
 * Handy for masking / marking a region of the screen. The `frame` is optional;
 * when omitted, it falls back to the default manim frame dimensions.
 */
export class ScreenRectangle extends Rectangle {
    constructor(config = {}) {
        const aspectRatio = config.aspectRatio ?? 16 / 9;
        const height = config.height ?? 4;
        const width = config.width ?? height * aspectRatio;
        super({ ...config, width, height });
        // Invisible by default (a region marker), like manim's ScreenRectangle.
        this.strokeWidth = config.strokeWidth ?? 0;
        this.fillOpacity = config.fillOpacity ?? 0;
    }
}
/** A ScreenRectangle sized to the full default manim frame (14.222 x 8). */
export class FullScreenRectangle extends ScreenRectangle {
    constructor(config = {}) {
        super({ height: 8, width: 14.222222222222221, ...config });
    }
}
// Read the current viewport params off the frame rect's corners (the same
// derivation the renderer's preRender() uses).
function readFrameParams(frame) {
    const sp = frame.getSubpaths()[0] ?? [];
    const center = frame.getCenter();
    if (sp.length < 13) {
        return { center, width: frame.getWidth(), height: frame.getHeight(), roll: 0 };
    }
    const c0 = sp[0], c1 = sp[3], c2 = sp[6];
    let roll = Math.atan2(c1[1] - c0[1], c1[0] - c0[0]) - Math.PI;
    roll = ((roll % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (roll > Math.PI)
        roll -= 2 * Math.PI;
    return {
        center,
        width: Math.hypot(c1[0] - c0[0], c1[1] - c0[1]),
        height: Math.hypot(c2[0] - c1[0], c2[1] - c1[1]),
        roll,
    };
}
/**
 * Tween the camera frame PARAMETRICALLY (center/width/height/roll) instead
 * of point-lerping it: a straight lerp between two rotations collapses the
 * rect through its center midway (a 180-degree roll momentarily has
 * frameWidth 0 and the view degenerates). Each tick rebuilds the rect from
 * the interpolated params, so the viewport stays a proper rectangle all
 * the way through.
 */
export class CameraFrameTween extends Animation {
    target;
    from;
    /** "linear" (default) lerps params; "zoom" follows the van Wijk-Nuij
     *  optimal pan-and-zoom path (d3.interpolateZoom): the camera zooms OUT
     *  over long pans so perceived velocity stays constant — the difference
     *  is dramatic on deep dives like zoomable circle packing. */
    path;
    _zoom;
    constructor(frame, target, config = {}) {
        const { path, ...animConfig } = config;
        super(frame, animConfig);
        this.target = target;
        this.path = path ?? "linear";
    }
    begin() {
        this.from = readFrameParams(this.mobject);
        if (this.path === "zoom") {
            const f = this.from;
            const t = { ...f, ...this.target };
            this._zoom = vanWijkZoom([f.center[0], f.center[1], f.width], [t.center[0], t.center[1], t.width]);
        }
        return super.begin();
    }
    interpolateMobject(alpha) {
        const f = this.from;
        const t = { ...f, ...this.target };
        const lerp = (a, b) => a + (b - a) * alpha;
        let w, cx, cy, h;
        if (this._zoom) {
            const z = this._zoom(alpha);
            w = z.w;
            cx = z.cx;
            cy = z.cy;
            // Preserve the aspect ratio through the zoom path.
            h = w * (lerp(f.height, t.height) / lerp(f.width, t.width));
        }
        else {
            w = lerp(f.width, t.width);
            h = lerp(f.height, t.height);
            cx = lerp(f.center[0], t.center[0]);
            cy = lerp(f.center[1], t.center[1]);
        }
        const roll = lerp(f.roll, t.roll);
        const rect = new Rectangle({ width: w, height: h, strokeWidth: 0, fillOpacity: 0 });
        if (roll !== 0)
            rect.rotate(roll);
        rect.moveTo([cx, cy, f.center[2] ?? 0]);
        this.mobject.points = rect.points;
    }
}
// van Wijk & Nuij "Smooth and efficient zooming and panning" (the exact
// math behind d3.interpolateZoom), rho = sqrt(2). Input/output views are
// [centerX, centerY, width].
function vanWijkZoom(a, b) {
    const rho = Math.SQRT2;
    const rho2 = 2, rho4 = 4;
    const [ux0, uy0, w0] = a;
    const [ux1, uy1, w1] = b;
    const dx = ux1 - ux0, dy = uy1 - uy0;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-12) {
        // Pure zoom: exponential width.
        const S = Math.abs(Math.log(w1 / w0)) / rho;
        return (t) => ({
            cx: ux0, cy: uy0,
            w: w0 * Math.exp(rho * (S === 0 ? 0 : t * S) * Math.sign(Math.log(w1 / w0))),
        });
    }
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    const S = (r1 - r0) / rho;
    return (t) => {
        const s = t * S;
        const coshr0 = Math.cosh(r0), sinhr0 = Math.sinh(r0), tanhr0 = Math.tanh(r0);
        const u = (w0 / (rho2 * d1)) * (coshr0 * Math.tanh(rho * s + r0) - sinhr0);
        return {
            cx: ux0 + u * dx,
            cy: uy0 + u * dy,
            w: (w0 * coshr0) / Math.cosh(rho * s + r0),
        };
        void tanhr0;
    };
}
/**
 * A scene whose camera has an animatable `frame` mobject. The frame is a
 * Rectangle matching the current viewport (frameWidth x frameHeight centered at
 * frameCenter). play()ing an animation on it moves its points; the renderer's
 * preRender() then syncs the viewport to those points each frame.
 */
export class MovingCameraScene extends Scene {
    constructor(config = {}) {
        super(config);
        this.setupFrame();
    }
    // Create `this.camera.frame` (idempotent). Reads the current camera geometry
    // so it matches whatever resolution/frame the backend configured.
    setupFrame() {
        const cam = this.camera;
        if (!cam)
            return;
        if (cam.frame)
            return;
        const frame = new Rectangle({
            width: cam.frameWidth,
            height: cam.frameHeight,
            strokeWidth: 0,
            fillOpacity: 0,
        });
        frame.moveTo(V.clone(cam.frameCenter));
        // Marks the frame as a rotatable camera rect: the renderer's preRender()
        // derives frameWidth/frameHeight/rotation from its corner anchors (so
        // `frame.animate.rotate(a)` rolls the camera) instead of the rotation-
        // blind axis-aligned bounding box.
        frame.__isCameraFrameRect = true;
        cam.frame = frame;
        this._initialFrameState = {
            center: V.clone(cam.frameCenter),
            width: cam.frameWidth,
            height: cam.frameHeight,
        };
    }
    _initialFrameState;
    /**
     * Animate the camera to center on a mobject or point (Motion Canvas's
     * `camera().centerOn(node, dur)`). Pure frame movement -- zoom/rotation
     * are untouched.
     */
    async centerOn(target, config = {}) {
        const point = Array.isArray(target) ? [...target] : target.getCenter();
        const frame = this.getFrame();
        const anim = new ApplyMethod(frame, function () {
            this.moveTo(point);
        });
        if (config.runTime != null)
            anim.runTime = config.runTime;
        if (config.rateFunc != null)
            anim.rateFunc = config.rateFunc;
        await this.play(anim);
        return this;
    }
    /**
     * Animate the camera roll by `angle` radians (Motion Canvas's
     * `camera().rotation(deg, dur)`, additive). Sugar over rotating the frame
     * mobject; preRender() picks the roll up from its corners.
     */
    async rotateCamera(angle, config = {}) {
        const frame = this.getFrame();
        const roll = readFrameParams(frame).roll + angle;
        const anim = new CameraFrameTween(frame, { roll });
        if (config.runTime != null)
            anim.runTime = config.runTime;
        if (config.rateFunc != null)
            anim.rateFunc = config.rateFunc;
        await this.play(anim);
        return this;
    }
    /**
     * Animate the camera back to its initial viewport (Motion Canvas's
     * `camera().reset(dur)`): center, size, and zero roll as they were when
     * the frame was created.
     */
    async resetCamera(config = {}) {
        const init = this._initialFrameState;
        const frame = this.getFrame();
        if (!init)
            return this;
        const anim = new CameraFrameTween(frame, {
            center: [...init.center], width: init.width, height: init.height, roll: 0,
        });
        if (config.runTime != null)
            anim.runTime = config.runTime;
        if (config.rateFunc != null)
            anim.rateFunc = config.rateFunc;
        await this.play(anim);
        return this;
    }
    /** The camera's frame mobject (creating it if the camera was set late). */
    getFrame() {
        this.setupFrame();
        return this.camera.frame;
    }
    _cameraStops = new Map();
    /** Name a camera viewpoint, recallable later via `goToCameraStop(name)`. */
    defineCameraStop(name, stop) {
        this._cameraStops.set(name, stop);
        return this;
    }
    /**
     * Animate the camera frame to a previously-defined stop. Pure sugar over
     * `camera.frame.animate.moveTo()/setWidth()/setHeight()` -- applied as a
     * SINGLE ApplyMethod (not one animation per field) so multiple fields
     * changing at once compose correctly instead of racing to overwrite the
     * same frame mobject's points each tick.
     */
    async goToCameraStop(name, config = {}) {
        const stop = this._cameraStops.get(name);
        if (!stop)
            throw new Error(`goToCameraStop: no camera stop named "${name}"`);
        const frame = this.getFrame();
        // Config fields are set directly on the built Animation rather than
        // passed into ApplyMethod's constructor -- its trailing-args config
        // detection only fires for objects marked `_animConfig` (never actually
        // set anywhere in this codebase), so a plain config object passed as a
        // constructor arg would silently be treated as an extra method argument
        // instead of runTime/rateFunc, same pattern transitions.ts's
        // buildTransition() already uses for exactly this reason.
        const anim = new ApplyMethod(frame, function () {
            if (stop.center)
                this.moveTo(stop.center);
            // stretch=true: setWidth/setHeight default to aspect-preserving uniform
            // rescale, which would let a subsequent setHeight() undo the width just
            // set. A camera stop specifies width/height independently, so scale
            // each axis on its own.
            if (stop.width != null)
                this.setWidth(stop.width, true);
            if (stop.height != null)
                this.setHeight(stop.height, true);
            if (stop.zoom != null)
                this.scale(1 / stop.zoom);
        });
        if (config.runTime != null)
            anim.runTime = config.runTime;
        if (config.rateFunc != null)
            anim.rateFunc = config.rateFunc;
        await this.play(anim);
        return this;
    }
}
//# sourceMappingURL=moving_camera_scene.js.map