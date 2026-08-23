export type GeoProjection = (lon: number, lat: number) => [number, number];
/** Plate carrée: x = λ, y = φ (radians). Cheap, heavy polar distortion. */
export declare const equirectangular: GeoProjection;
/** Web-Mercator: conformal, the familiar slippy-map look. Latitude clamped
 *  to ±85.05113° (the projection diverges at the poles). */
export declare const mercator: GeoProjection;
/** Identity / "none": pass PRE-PROJECTED planar coordinates through instead
 *  of treating them as lon/lat. For data already projected to pixel space
 *  (e.g. the US-atlas TopoJSON, Albers-projected with y increasing DOWN),
 *  y is negated so the map is upright in the loader's y-up planar space —
 *  the loader's usual fit and winding normalization then apply unchanged. */
export declare const identity: GeoProjection;
export declare const PROJECTIONS: Record<string, GeoProjection>;
//# sourceMappingURL=geo_projection.d.ts.map