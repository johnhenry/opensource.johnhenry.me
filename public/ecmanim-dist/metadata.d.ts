/** Version stamped into provenance. Kept in step with package.json on release. */
export declare const MANIM_JS_VERSION = "1.6.0";
export interface MetaSection {
    name: string;
    startFrame: number;
    endFrame: number;
    type?: string;
    id?: number;
}
/** A chapter/segment on the timeline (seconds). */
export interface Chapter {
    label: string;
    start: number;
    end: number;
}
/** Provenance inputs (all optional). */
export interface ProvenanceInput {
    generator?: string;
    version?: string;
    /**
     * IPTC "digital source type" controlled-vocabulary IRI. Programmatic renders
     * are algorithmic media; defaults to the algorithmicMedia term. Set to null to
     * omit, or to the trainedAlgorithmicMedia term for ML-generated content.
     */
    digitalSourceType?: string | null;
    sceneName?: string;
}
/** Everything the adapters can use. Supply what you have; unknowns are omitted. */
export interface VideoMetaInput {
    durationSeconds?: number;
    frames?: number;
    fps?: number;
    width?: number;
    height?: number;
    id?: string;
    contentUrl?: string;
    embedUrl?: string;
    name?: string;
    description?: string;
    language?: string;
    thumbnailUrl?: string | string[];
    uploadDate?: string;
    encodingFormat?: string;
    sections?: MetaSection[];
    chapters?: Chapter[];
    provenance?: ProvenanceInput | boolean;
}
export declare const IPTC_ALGORITHMIC_MEDIA = "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia";
/** Duration in seconds, from an explicit value or frames/fps. */
export declare function metaDuration(input: VideoMetaInput): number;
/** Format seconds as an ISO-8601 duration, e.g. 90 -> "PT1M30S". */
export declare function toISODuration(seconds: number): string;
/** Chapters (seconds) from an input's explicit `chapters` or its `sections`. */
export declare function chaptersFrom(input: VideoMetaInput): Chapter[];
export declare function toVideoObject(input: VideoMetaInput): Record<string, any>;
/** Convenience: the JSON-LD as a `<script type="application/ld+json">` string. */
export declare function toVideoObjectScript(input: VideoMetaInput): string;
export declare function toIIIFManifest(input: VideoMetaInput): Record<string, any>;
export interface ResolvedIIIFVideo {
    url: string;
    format?: string;
    width?: number;
    height?: number;
    duration?: number;
    chapters: Chapter[];
}
export declare function resolveIIIFVideo(manifest: any): ResolvedIIIFVideo;
/** True if `x` looks like a IIIF manifest object (for loadVideo auto-detect). */
export declare function isIIIFManifest(x: any): boolean;
//# sourceMappingURL=metadata.d.ts.map