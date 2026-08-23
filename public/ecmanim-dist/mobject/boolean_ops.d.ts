import { VMobject } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
type Ring2D = number[][];
type Polygon2D = Ring2D[];
type MultiPolygon2D = Polygon2D[];
export declare class _BooleanOps extends VMobject {
    constructor(config?: VMobjectConfig);
    protected _convertVmobjectToPolygon(vmobject: VMobject): Polygon2D;
    protected _applyResult(multipolygon: MultiPolygon2D): void;
}
export declare class Union extends _BooleanOps {
    constructor(...args: any[]);
}
export declare class Intersection extends _BooleanOps {
    constructor(...args: any[]);
}
export declare class Difference extends _BooleanOps {
    constructor(subject: VMobject, ...args: any[]);
}
export declare class Exclusion extends _BooleanOps {
    constructor(...args: any[]);
}
export {};
//# sourceMappingURL=boolean_ops.d.ts.map