interface VertexBuffer {
    positions: number[];
    colors: number[];
}
interface TransparentBuffer extends VertexBuffer {
    alpha: number;
}
interface CollectedBuffers {
    opaque: VertexBuffer;
    transparent: TransparentBuffer[];
    lines: VertexBuffer;
    texts: any[];
    images: any[];
    meshes: any[];
}
export declare function flattenMobject(mob: any): number[][][];
export declare function collectBuffers(mobjects: any[]): CollectedBuffers;
export {};
//# sourceMappingURL=geometry_util.d.ts.map