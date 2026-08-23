export declare function isWasmLoaded(): boolean;
export declare function loadWasm(source?: string | URL): Promise<boolean>;
/** WASM cubic-bezier eval; p0/c1/c2/p3 are [x,y,z]. Returns the point. */
export declare function bezierEvalWasm(p0: number[], c1: number[], c2: number[], p3: number[], t: number): number[];
/** WASM ear-clipping of a simple 2D polygon. Returns flat index triples. */
export declare function earclipWasm(points: number[][]): number[];
/** WASM 3x3 (row-major) matrix times a 3-vector. */
export declare function mat3VecWasm(m: number[], v: number[]): number[];
//# sourceMappingURL=wasm.d.ts.map