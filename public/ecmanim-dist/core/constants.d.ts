import type { Vec3 } from "./types.ts";
export { PI, TAU, DEGREES } from "./math/vector.ts";
export declare const X_AXIS: Vec3;
export declare const Y_AXIS: Vec3;
export declare const Z_AXIS: Vec3;
export declare const FRAME_HEIGHT = 8;
export declare const FRAME_WIDTH = 14.222222222222221;
export declare const FRAME_Y_RADIUS: number;
export declare const FRAME_X_RADIUS: number;
export declare const DEFAULT_FRAME_RATE = 60;
export declare const TOP: Vec3;
export declare const BOTTOM: Vec3;
export declare const LEFT_SIDE: Vec3;
export declare const RIGHT_SIDE: Vec3;
export declare const SMALL_BUFF = 0.1;
export declare const MED_SMALL_BUFF = 0.25;
export declare const MED_LARGE_BUFF = 0.5;
export declare const LARGE_BUFF = 1;
export declare const DEFAULT_MOBJECT_TO_EDGE_BUFFER = 0.5;
export declare const DEFAULT_MOBJECT_TO_MOBJECT_BUFFER = 0.25;
export declare const EPSILON = 1e-8;
export declare const DEFAULT_STROKE_WIDTH = 4;
export declare const DEFAULT_FONT_SIZE = 48;
export declare const DEFAULT_DOT_RADIUS = 0.08;
export declare const DEFAULT_ARROW_TIP_LENGTH = 0.35;
/** Which renderer backend to use (this port targets Canvas / WebGL). */
export declare const RendererType: {
    readonly CANVAS: "canvas";
    readonly WEBGL: "webgl";
};
export type RendererType = (typeof RendererType)[keyof typeof RendererType];
/** How consecutive line segments are joined at their meeting points. */
export declare const LineJointType: {
    readonly AUTO: "auto";
    readonly ROUND: "round";
    readonly BEVEL: "bevel";
    readonly MITER: "miter";
};
export type LineJointType = (typeof LineJointType)[keyof typeof LineJointType];
/** How the ends of open strokes are capped. */
export declare const CapStyleType: {
    readonly AUTO: "auto";
    readonly ROUND: "round";
    readonly BUTT: "butt";
    readonly SQUARE: "square";
};
export type CapStyleType = (typeof CapStyleType)[keyof typeof CapStyleType];
/** A single render-quality preset. */
export interface Quality {
    pixelWidth: number;
    pixelHeight: number;
    fps: number;
}
export declare const QUALITIES: Record<string, Quality>;
//# sourceMappingURL=constants.d.ts.map