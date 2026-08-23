import { Mesh3D } from "../mobject/mesh3d.ts";
import type { MobjectConfig } from "../mobject/Mobject.ts";
import type { MeshOBJImportOptions } from "./mesh_obj.ts";
import type { MeshSTLImportOptions } from "./mesh_stl.ts";
export type Mesh3DImportOptions = MobjectConfig & (({
    format: "obj";
} & Pick<MeshOBJImportOptions, "OBJLoader">) | ({
    format: "stl";
} & Pick<MeshSTLImportOptions, "STLLoader">));
export declare function loadMesh3D(textOrBytes: string | ArrayBuffer, options: Mesh3DImportOptions): Promise<Mesh3D>;
//# sourceMappingURL=mesh3d_loader.d.ts.map