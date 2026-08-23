import { VGroup } from "../mobject/VMobject.ts";
import type { VMobjectConfig } from "../mobject/VMobject.ts";
import type { Vec3 } from "../core/types.ts";
import type { GeoProjection } from "./geo_projection.ts";
export interface GeoJSONOptions extends VMobjectConfig {
    /** Projection name or custom function (default "mercator"). Use
     *  "none" (alias "identity") for PRE-PROJECTED planar data — e.g. TopoJSON
     *  atlases already in y-down pixel space — where coordinates pass through
     *  as-is except for a y-flip into the loader's y-up space (fit, winding
     *  normalization, and project() behave as usual). */
    projection?: "mercator" | "equirectangular" | "none" | "identity" | GeoProjection;
    /** Feature property used as the region key (default "name"). */
    nameProperty?: string;
    /** Target width in world units. If only one of width/height is given the
     *  other follows the projected aspect ratio; default width 8. */
    width?: number;
    height?: number;
    /** World-space center of the fitted map (default origin). */
    point?: number[];
    /** Douglas-Peucker simplification tolerance in WORLD units (post-fit). */
    simplifyTolerance?: number;
}
/** A projected, fitted GeoJSON map. Regions keep their feature names. */
export declare class GeoMap extends VGroup {
    /** Feature mobjects grouped by `properties[nameProperty]`. Features
     *  without that property are rendered but not addressable. */
    readonly regions: Map<string, VGroup>;
    /** lon/lat (degrees) → world point, through the map's own projection and
     *  fit transform. Use for placing markers/arcs on the map. */
    readonly project: (lonLat: [number, number]) => Vec3;
    constructor(project: (lonLat: [number, number]) => Vec3);
    hasRegion(name: string): boolean;
    byName(name: string): VGroup;
}
/**
 * Parse GeoJSON (text or object) into a {@link GeoMap}. Supports
 * Feature/FeatureCollection with Polygon / MultiPolygon (filled, holes as
 * extra subpaths) and LineString / MultiLineString (stroke-only). The whole
 * collection is projected, then fit to `width`/`height` centered on `point`.
 */
export declare function loadGeoJSON(textOrObject: string | object, options?: GeoJSONOptions): GeoMap;
//# sourceMappingURL=geojson_loader.d.ts.map