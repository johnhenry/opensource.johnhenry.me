import type { QualityReport } from "./quality.ts";
export interface PlanSegment {
    index: number;
    kind: string;
    startFrame: number;
    endFrame: number;
    hash?: string;
}
export interface PlanChapter {
    name: string;
    startFrame: number;
    endFrame: number;
}
export interface PlanConfig {
    fps: number;
    width: number;
    height: number;
    quality?: string;
    format?: string;
    background?: string;
    style?: string;
    aspectRatio?: string;
}
export interface PlanIR {
    version: "1";
    scene: {
        name?: string;
    };
    config: PlanConfig;
    segments: PlanSegment[];
    chapters: PlanChapter[];
    estimatedFrames: number;
    durationSeconds: number;
    quality: QualityReport;
}
export interface PlanOptions {
    fps?: number;
    width?: number;
    height?: number;
    quality?: string;
    format?: string;
    background?: string;
    style?: string;
    aspectRatio?: string;
    /** Declared intent for the delivery-promise gate (e.g. "motion-led"). */
    promise?: string;
    name?: string;
}
/** Build a plan IR by dry-running the scene's construct() (no frames emitted). */
export declare function toPlanIR(sceneOrConstruct: any, options?: PlanOptions): Promise<PlanIR>;
/** The plan IR as a pretty JSON string. */
export declare function toPlanString(sceneOrConstruct: any, options?: PlanOptions): Promise<string>;
//# sourceMappingURL=plan.d.ts.map