import { VMobject } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
import { Mobject } from "./Mobject.ts";
import { Rectangle, Line } from "./geometry.ts";
export interface SurroundingRectangleConfig extends VMobjectConfig {
    buff?: number;
    cornerRadius?: number;
}
/** A Rectangle sized to enclose `mobject`'s bounds, expanded by `buff`. */
export declare class SurroundingRectangle extends Rectangle {
    buff: number;
    constructor(mobject: Mobject, config?: SurroundingRectangleConfig);
}
export interface BackgroundRectangleConfig extends VMobjectConfig {
    buff?: number;
}
/** A filled rectangle placed behind `mobject` (default translucent black). */
export declare class BackgroundRectangle extends SurroundingRectangle {
    originalFillOpacity: number;
    constructor(mobject: Mobject, config?: BackgroundRectangleConfig);
    setStyleForFadeIn(): this;
    getFillOpacity(): number;
}
export interface CrossConfig extends VMobjectConfig {
    stroke_width?: number;
    strokeWidth?: number;
    scaleFactor?: number;
}
/** An "X" (two crossing lines) sized to `mobject` (or unit size if none). */
export declare class Cross extends VMobject {
    constructor(mobject?: Mobject | null, config?: CrossConfig);
}
export interface UnderlineConfig extends VMobjectConfig {
    buff?: number;
}
/** A horizontal Line placed just under `mobject`, spanning its width. */
export declare class Underline extends Line {
    constructor(mobject: Mobject, config?: UnderlineConfig);
}
//# sourceMappingURL=shape_matchers.d.ts.map