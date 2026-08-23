// GPU-tier mesh import: parses the same OBJ/STL data as loadMeshOBJ/
// loadMeshSTL (src/loaders/mesh_obj.ts, mesh_stl.ts), but returns a Mesh3D
// (src/mobject/mesh3d.ts) instead of a Polyhedron -- for scenes with more
// triangles than the CPU/Polyhedron tier comfortably handles (see the
// mesh-import plan's Phase 2 perf gate). One function + a `format` option,
// rather than two parallel loadMesh3DOBJ/loadMesh3DSTL functions, since the
// only difference between formats is which parser produces the
// {vertexCoords, facesList} data both loaders already extract identically.
import { Mesh3D } from "../mobject/mesh3d.js";
import { parseOBJToMeshData } from "./mesh_obj.js";
import { parseSTLToMeshData } from "./mesh_stl.js";
export async function loadMesh3D(textOrBytes, options) {
    const { format, ...rest } = options;
    let vertexCoords, facesList;
    if (format === "obj") {
        if (typeof textOrBytes !== "string")
            throw new Error("loadMesh3D: format 'obj' requires string text, not bytes.");
        try {
            ({ vertexCoords, facesList } = await parseOBJToMeshData(textOrBytes, rest));
        }
        catch (e) {
            throw new Error(`loadMesh3D: ${e.message}`);
        }
    }
    else if (format === "stl") {
        try {
            ({ vertexCoords, facesList } = await parseSTLToMeshData(textOrBytes, rest));
        }
        catch (e) {
            throw new Error(`loadMesh3D: ${e.message}`);
        }
    }
    else {
        throw new Error(`loadMesh3D: unknown format ${JSON.stringify(options.format)} -- expected "obj" or "stl".`);
    }
    return new Mesh3D(vertexCoords, facesList, rest);
}
//# sourceMappingURL=mesh3d_loader.js.map