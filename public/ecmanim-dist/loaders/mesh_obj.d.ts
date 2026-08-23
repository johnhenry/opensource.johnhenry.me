import { Polyhedron } from "../mobject/polyhedra.ts";
import type { FacesConfig } from "../mobject/polyhedra.ts";
export { isMeshLoaderAvailable, extractMeshDataFromGeometry } from "./mesh_util.ts";
export interface MeshOBJImportOptions {
    /** Inject an OBJLoader class (tests / bundler control) instead of a lazy
     *  dynamic import of three's bundled loader. */
    OBJLoader?: new () => {
        parse(text: string): any;
    };
    /** Add vertex Dots to the group (default false for an imported mesh -- see
     *  Polyhedron's showVertices, which defaults true for the Platonic solids). */
    showVertices?: boolean;
    /** Add edge Lines to the group (default false for an imported mesh). */
    showEdges?: boolean;
    facesConfig?: FacesConfig;
}
export declare function resolveOBJLoader(options: MeshOBJImportOptions): Promise<new () => {
    parse(text: string): any;
}>;
/** Walk an Object3D/Group (OBJLoader's result shape), merging every Mesh's
 *  geometry into one combined {vertexCoords, facesList} (face indices offset
 *  per mesh -- dedup itself stays per-mesh, not merged across meshes). */
export declare function extractMeshData(obj3D: any, precision?: number): {
    vertexCoords: number[][];
    facesList: number[][];
};
/** Parse .obj text into {vertexCoords, facesList}, shared by loadMeshOBJ
 *  (-> Polyhedron, Tier A) and loadMesh3D (-> Mesh3D, Tier B). */
export declare function parseOBJToMeshData(text: string, options?: MeshOBJImportOptions): Promise<{
    vertexCoords: number[][];
    facesList: number[][];
}>;
export declare function loadMeshOBJ(text: string, options?: MeshOBJImportOptions): Promise<Polyhedron>;
//# sourceMappingURL=mesh_obj.d.ts.map