import { type Registry } from "./registry.ts";
export interface SurfaceSpec {
    x: string;
    y: string;
    z: string;
    uRange: [number, number];
    vRange: [number, number];
    resolution?: [number, number];
    fillColor?: string;
}
export interface PluginManifest {
    name: string;
    version: string;
    description?: string;
    colors?: Record<string, string>;
    rateFunctions?: Record<string, string>;
    surfaces?: Record<string, SurfaceSpec>;
    shapes?: Record<string, string>;
}
export interface ManifestSummary {
    name: string;
    version: string;
    colors: number;
    rateFunctions: number;
    surfaces: number;
    shapes: number;
}
/**
 * Load a manifest (object or JSON string) into a registry (defaults to the
 * shared singleton), registering colors, rate functions, surfaces, and shapes.
 * Returns a summary of how many of each were registered.
 */
export declare function loadManifest(input: PluginManifest | string, registry?: Registry): ManifestSummary;
/**
 * Node-only: read a manifest file from disk and load it. Uses dynamic imports
 * so this module stays browser-safe (the browser build simply never calls it).
 */
export declare function loadManifestFromFile(path: string, registry?: Registry): Promise<ManifestSummary>;
//# sourceMappingURL=manifest.d.ts.map