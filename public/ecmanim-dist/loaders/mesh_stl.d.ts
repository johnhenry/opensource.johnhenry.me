import { Polyhedron } from "../mobject/polyhedra.ts";
import type { FacesConfig } from "../mobject/polyhedra.ts";
export interface MeshSTLImportOptions {
    /** Inject an STLLoader class (tests / bundler control) instead of a lazy
     *  dynamic import of three's bundled loader. */
    STLLoader?: new () => {
        parse(bytesOrText: ArrayBuffer | string): any;
    };
    /** Add vertex Dots to the group (default false for an imported mesh). */
    showVertices?: boolean;
    /** Add edge Lines to the group (default false for an imported mesh). */
    showEdges?: boolean;
    facesConfig?: FacesConfig;
}
export declare function resolveSTLLoader(options: MeshSTLImportOptions): Promise<new () => {
    parse(bytesOrText: ArrayBuffer | string): any;
}>;
/** Parse STL data into {vertexCoords, facesList}, shared by loadMeshSTL
 *  (-> Polyhedron, Tier A) and loadMesh3D (-> Mesh3D, Tier B). */
export declare function parseSTLToMeshData(bytesOrText: ArrayBuffer | string, options?: MeshSTLImportOptions): Promise<{
    vertexCoords: number[][];
    facesList: number[][];
}>;
export declare function loadMeshSTL(bytesOrText: ArrayBuffer | string, options?: MeshSTLImportOptions): Promise<Polyhedron>;
//# sourceMappingURL=mesh_stl.d.ts.map