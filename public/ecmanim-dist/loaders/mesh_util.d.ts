/** Whether a mesh import has previously loaded three successfully (mirrors
 *  wasm.ts's isWasmLoaded() -- reflects past attempts, not a predictive
 *  availability check; the authoritative signal for "will this work right
 *  now" is still a loader's own rejection). */
export declare function isMeshLoaderAvailable(): boolean;
/** Called by each loader's resolve*Loader() once a dynamic import of three's
 *  bundled loader module succeeds. */
export declare function markThreeLoaded(): void;
/** Merge coincident vertices (rounded to `precision` decimal places) from a
 *  single BufferGeometry into a deduped {vertexCoords, facesList}. Raw
 *  parser output is often one triangle per 3 unique-in-that-triangle
 *  vertices with zero sharing; Polyhedron.getEdges() (src/mobject/polyhedra.ts)
 *  relies on shared indices to dedupe edges, so skipping this makes every
 *  triangle a disconnected island. */
export declare function extractMeshDataFromGeometry(geometry: any, precision?: number): {
    vertexCoords: number[][];
    facesList: number[][];
};
//# sourceMappingURL=mesh_util.d.ts.map