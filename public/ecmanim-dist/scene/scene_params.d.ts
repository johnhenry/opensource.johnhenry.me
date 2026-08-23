export interface SceneMetadata {
    durationInFrames?: number;
    fps?: number;
    width?: number;
    height?: number;
    [key: string]: any;
}
export type CalculateMetadata<P = Record<string, any>> = (args: {
    params: P;
    defaults: SceneMetadata;
}) => SceneMetadata | Promise<SceneMetadata>;
/**
 * Resolve final metadata for a scene given raw params.
 *
 * @param scene  a scene class, instance, or plain object; may carry `schema`
 *               and/or `calculateMetadata` (static or instance).
 * @param params raw, unvalidated params.
 * @param defaults baseline metadata that the hook result is merged over.
 * @returns the merged metadata plus the (possibly schema-validated) params.
 */
export declare function resolveSceneMetadata(scene: any, params?: Record<string, any>, defaults?: SceneMetadata): Promise<{
    metadata: SceneMetadata;
    params: Record<string, any>;
}>;
//# sourceMappingURL=scene_params.d.ts.map