export interface RenderParallelOptions {
    fps?: number;
    quality?: string;
    format?: string;
    outPath?: string;
    output?: string;
    background?: string;
    pixelWidth?: number;
    pixelHeight?: number;
    resolution?: [number, number];
    workers?: number;
    verbose?: boolean;
    disableCaching?: boolean;
    camera?: any;
    /** Scene params, validated by the scene's static `schema` (same contract
     *  as node.ts render()). Salted into the partial cache key — personalized
     *  renders never collide on cached partials. */
    params?: Record<string, any>;
    /** Progress at worker-completion granularity (segmentsTotal known upfront
     *  from the discovery manifest). */
    onProgress?: (p: {
        segmentsDone: number;
        segmentsTotal: number;
    }) => void;
    [k: string]: any;
}
export declare function renderSegmentRange(sceneModulePath: string, sceneExportName: string, assignedIndices: number[], options: RenderParallelOptions): Promise<{
    encoded: number;
    reused: number;
}>;
export declare function renderParallel(sceneModulePath: string, sceneExportName: string, options?: RenderParallelOptions): Promise<{
    outPath: string;
    segments: number;
    workers: number;
    reused: number;
}>;
//# sourceMappingURL=node-parallel.d.ts.map