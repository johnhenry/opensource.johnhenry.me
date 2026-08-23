import { VMobject, VGroup } from "./VMobject.ts";
import type { VMobjectConfig } from "./VMobject.ts";
import { Line } from "./geometry.ts";
import type { ColorLike } from "../core/types.ts";
export interface FacesConfig extends VMobjectConfig {
    fillColor?: ColorLike;
    fillOpacity?: number;
    strokeColor?: ColorLike;
    strokeWidth?: number;
    lightDirection?: number[];
    shade?: boolean;
}
export interface GraphConfig extends VMobjectConfig {
    vertexRadius?: number;
    vertexColor?: ColorLike;
    edgeColor?: ColorLike;
    edgeWidth?: number;
}
export interface PolyhedronConfig {
    facesConfig?: FacesConfig;
    graphConfig?: GraphConfig;
    /** Add the vertex Dots to the group (default true, preserving the existing
     *  Platonic-solid look). An imported mesh generally wants false — dots at
     *  every vertex read as a wireframe overlay, not a solid model. Vertices
     *  are still built (this.vertices is populated) either way. */
    showVertices?: boolean;
    /** Same as showVertices, for the edge Lines (default true). */
    showEdges?: boolean;
}
export declare class Polyhedron extends VGroup {
    vertexCoords: number[][];
    facesList: number[][];
    faces: VGroup;
    graph: VGroup;
    vertices: VGroup;
    edges: Map<string, Line>;
    _faceCfg: FacesConfig;
    _graphCfg: GraphConfig;
    _lightDirection: number[];
    _shade: boolean;
    constructor(vertexCoords: number[][], facesList: number[][], config?: PolyhedronConfig);
    getEdges(facesList: number[][]): number[][];
    getFaceCoords(): number[][][];
    extractFaceCoords(): number[][][];
    _brightness(coords: number[][]): number;
    createFaces(): VGroup;
    updateFaces(): this;
    getVertexMobjects(): VMobject[];
    getFaceMobjects(): VMobject[];
}
export interface PlatonicConfig extends PolyhedronConfig {
    edgeLength?: number;
}
export declare class Tetrahedron extends Polyhedron {
    constructor(config?: PlatonicConfig);
}
export declare class Octahedron extends Polyhedron {
    constructor(config?: PlatonicConfig);
}
export declare class Icosahedron extends Polyhedron {
    constructor(config?: PlatonicConfig);
}
export declare class Dodecahedron extends Polyhedron {
    constructor(config?: PlatonicConfig);
}
export interface ConvexHull3DConfig extends PolyhedronConfig {
    tolerance?: number;
}
export declare class ConvexHull3D extends Polyhedron {
    constructor(...args: any[]);
}
//# sourceMappingURL=polyhedra.d.ts.map