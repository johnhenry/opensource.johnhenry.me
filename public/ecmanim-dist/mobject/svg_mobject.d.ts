import { VMobject, VGroup } from "./VMobject.ts";
import type { ColorLike } from "../core/types.ts";
/** A parsed XML element node. */
export interface XmlNode {
    tag: string;
    attrs: Record<string, string>;
    children: XmlNode[];
    /** Concatenated direct character data (entity-decoded), for <text>/<tspan>
     *  extraction. Element children's text is NOT included. */
    text?: string;
}
/** Configuration accepted by SVGMobject. */
export interface SVGMobjectConfig {
    height?: number;
    width?: number;
    point?: number[];
    fillColor?: ColorLike;
    strokeColor?: ColorLike;
    color?: ColorLike;
    [key: string]: any;
}
/** A row-major 2x3 affine [a,b,c,d,e,f]. */
type Affine = [number, number, number, number, number, number];
export declare function parseXML(str: string): XmlNode;
export declare function compose(parent: Affine, child: Affine): Affine;
export declare function parseTransform(str: string): Affine;
export declare class SVGMobject extends VGroup {
    config: SVGMobjectConfig;
    /** Drawable mobjects keyed by their SVG element id (or nearest ancestor
     *  <g id>). One id can map to several mobjects (a <g id> containing many
     *  drawables). Ids inside <defs>/<clipPath>/... never appear here -- those
     *  are consumed for url(#id) resolution, not rendered content. */
    readonly ids: Map<string, VMobject[]>;
    /** Bounds of the parsed geometry in the SVG's OWN (y-down) coordinate
     *  space, before the y-flip / world fit. Lets loaders (mermaid text
     *  extraction) map additional SVG coordinates through the same transform
     *  the geometry received. Null when the SVG had no drawable geometry. */
    readonly sourceBounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    } | null;
    constructor(svgString?: string, config?: SVGMobjectConfig);
    hasId(id: string): boolean;
    /** The mobjects for an SVG element id (or nearest <g id>), wrapped in a
     *  VGroup so `svg.byId("sun").setColor(...)` / `.animate` compose
     *  naturally. The children are the SAME instances already in this
     *  SVGMobject's tree -- style/transform mutations show up in place. */
    byId(id: string): VGroup;
}
export default SVGMobject;
//# sourceMappingURL=svg_mobject.d.ts.map