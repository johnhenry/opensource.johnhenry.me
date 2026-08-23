export interface TopoTransform {
    scale: [number, number];
    translate: [number, number];
}
/** A TopoJSON geometry object (arc-indexed, possibly quantized). */
export interface TopoGeometry {
    type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon" | "GeometryCollection" | null;
    id?: string | number;
    properties?: Record<string, unknown>;
    /** Point/MultiPoint positions (quantized when the topology has a transform). */
    coordinates?: number[] | number[][];
    /** Arc index lists; negative index ~i means arc i reversed. */
    arcs?: number[] | number[][] | number[][][];
    geometries?: TopoGeometry[];
}
export interface Topology {
    type: "Topology";
    transform?: TopoTransform;
    objects: Record<string, TopoGeometry>;
    arcs: number[][][];
    bbox?: number[];
}
export type GeoPosition = [number, number];
export interface GeoJSONGeometry {
    type: string;
    coordinates?: unknown;
    geometries?: Array<GeoJSONGeometry | null>;
}
export interface GeoJSONFeature {
    type: "Feature";
    id?: string | number;
    properties: Record<string, unknown>;
    geometry: GeoJSONGeometry | null;
}
export interface GeoJSONFeatureCollection {
    type: "FeatureCollection";
    features: GeoJSONFeature[];
}
export interface GeoJSONMultiLineString {
    type: "MultiLineString";
    coordinates: GeoPosition[][];
}
/**
 * Decode arc `index` (non-negative) of `topology` to absolute [x, y] points,
 * applying delta-decoding and the quantization transform when present.
 * Results are cached per topology; do not mutate the returned array.
 */
export declare function decodeArc(topology: Topology, index: number): GeoPosition[];
/**
 * Convert a TopoJSON object (by name or reference) to GeoJSON — the
 * equivalent of topojson-client's `feature()`. A GeometryCollection becomes
 * a FeatureCollection (one Feature per geometry, `id` and `properties`
 * copied); any other geometry becomes a single Feature.
 */
export declare function feature(topology: Topology, o: string | TopoGeometry): GeoJSONFeature | GeoJSONFeatureCollection;
/**
 * The mesh of arcs in `object`, optionally filtered — d3's `topojson.mesh`
 * semantics. `filter(a, b)` receives the first and last geometry adjacent to
 * each arc (a === b when only one geometry uses it), so
 * `(a, b) => a !== b` yields internal borders only and
 * `(a, b) => a === b` the exterior outline. Omitting `object` meshes every
 * arc in the topology. Each surviving arc becomes one line of the
 * MultiLineString (contiguous arcs are not fused — see module header).
 */
export declare function mesh(topology: Topology, o?: string | TopoGeometry, filter?: (a: TopoGeometry, b: TopoGeometry) => boolean): GeoJSONMultiLineString;
//# sourceMappingURL=topojson.d.ts.map