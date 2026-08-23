export interface CompositionDescriptor {
    name: string;
    /** The Scene subclass (or a construct function). */
    scene: any;
    description?: string;
    /** Default fps/dimensions for this composition (optional). */
    fps?: number;
    width?: number;
    height?: number;
    durationInFrames?: number;
    /** A params schema (defineSchema result) if the scene is parameterized. */
    schema?: any;
    defaultParams?: Record<string, any>;
}
/** Register a renderable composition by name. Later registrations overwrite. */
export declare function registerComposition(name: string, scene: any, config?: Omit<CompositionDescriptor, "name" | "scene">): CompositionDescriptor;
/** Look up a composition by name. */
export declare function getComposition(name: string): CompositionDescriptor | undefined;
/** All registered compositions, in insertion order. */
export declare function listCompositions(): CompositionDescriptor[];
/** A JSON-serializable summary of every composition (for `--json` CLI output). */
export declare function compositionsToJSON(): Array<Record<string, any>>;
/** Remove a composition (mainly for tests). */
export declare function unregisterComposition(name: string): boolean;
/** Clear all (tests). */
export declare function _clearCompositions(): void;
//# sourceMappingURL=compositions.d.ts.map