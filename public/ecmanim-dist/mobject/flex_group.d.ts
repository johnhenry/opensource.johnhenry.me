import { Group } from "./Mobject.ts";
import type { Mobject } from "./Mobject.ts";
export type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type JustifyContent = "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
export type AlignItems = "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
export interface FlexGroupConfig {
    direction?: FlexDirection;
    justifyContent?: JustifyContent;
    alignItems?: AlignItems;
    gap?: number;
    /** Container size. Defaults to the group's own current bounding box
     *  (its children's pre-layout extent) when omitted. */
    width?: number;
    height?: number;
    /** Inner padding on all edges (Motion Canvas Layout `padding`). */
    padding?: number;
}
export interface FlexChildConfig {
    flexGrow?: number;
    flexShrink?: number;
    /** Overrides the child's own current getWidth() as its flex-basis. */
    flexBasis?: number;
    margin?: number;
}
/** True once Yoga's WASM has been loaded (via a prior layout() call). */
export declare function isYogaLoaded(): boolean;
export declare class FlexGroup extends Group {
    flexConfig: FlexGroupConfig;
    private _childConfig;
    constructor(config?: FlexGroupConfig);
    /** Per-child flex config (flexGrow/flexShrink/flexBasis/margin). A child
     *  with no config here just uses its own current size as a fixed basis. */
    setChildFlex(child: Mobject, config: FlexChildConfig): this;
    /**
     * Compute the flex layout and reposition every direct child accordingly.
     * Necessarily async -- Yoga's WASM must be loaded first. Safe to call
     * repeatedly (e.g. after adding/removing children or resizing the
     * container); each call builds a fresh Yoga node tree.
     */
    layout(): Promise<this>;
}
//# sourceMappingURL=flex_group.d.ts.map