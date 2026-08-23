import { VMobject } from "./VMobject.ts";
import { Arrow, Line } from "./geometry.ts";
import type { ArrowConfig } from "./geometry.ts";
import { Text } from "./text/Text.ts";
export interface VectorConfig extends ArrowConfig {
    buff?: number;
}
/** An Arrow from the origin to `direction`. */
export declare class Vector extends Arrow {
    direction: number[];
    constructor(direction?: number[], config?: VectorConfig);
    /**
     * A label showing the vector's components. Returns a Text (a full Matrix is
     * out of scope here); positioned to the right of the arrow's tip.
     */
    coordinateLabel(config?: {
        fontSize?: number;
    }): Text;
}
export interface DoubleArrowConfig extends ArrowConfig {
    tipLength?: number;
}
/** A line with an arrowhead at BOTH ends. */
export declare class DoubleArrow extends Line {
    tipLength: number;
    tipStart: VMobject;
    tipEnd: VMobject;
    constructor(start?: number[], end?: number[], config?: DoubleArrowConfig);
    private _buildTipAt;
}
//# sourceMappingURL=vectors.d.ts.map