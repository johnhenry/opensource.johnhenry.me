import type { VMobjectConfig } from "./VMobject.ts";
import { Line, Arrow } from "./geometry.ts";
import type { LineConfig, ArrowConfig } from "./geometry.ts";
import { Text } from "./text/Text.ts";
import { BackgroundRectangle } from "./shape_matchers.ts";
export interface LabeledLineConfig extends LineConfig {
    label?: string;
    labelPosition?: number;
    fontSize?: number;
    frameFill?: string;
    frameFillOpacity?: number;
    labelBuff?: number;
}
/** A Line with a framed text label placed at a proportion along its length. */
export declare class LabeledLine extends Line {
    label: Text;
    frame: BackgroundRectangle;
    labelPosition: number;
    constructor(start?: number[], end?: number[], config?: LabeledLineConfig);
    protected _placeLabel(): this;
}
export interface LabeledArrowConfig extends ArrowConfig, LabeledLineConfig {
}
/** An Arrow with a framed text label placed at a proportion along its length. */
export declare class LabeledArrow extends Arrow {
    label: Text;
    frame: BackgroundRectangle;
    labelPosition: number;
    constructor(start?: number[], end?: number[], config?: LabeledArrowConfig);
}
export type { VMobjectConfig };
//# sourceMappingURL=labeled.d.ts.map