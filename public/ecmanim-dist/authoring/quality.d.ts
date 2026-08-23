export interface QualityContext {
    fps: number;
    width: number;
    height: number;
    durationSeconds: number;
    segments: Array<{
        kind: string;
        startFrame: number;
        endFrame: number;
    }>;
    /** Fraction of frames that changed vs. the previous frame, if known [0,1]. */
    motionFraction?: number;
    /** A declared intent, e.g. "motion-led" | "explainer" | "static". */
    promise?: string;
}
export interface QualityGate {
    name: string;
    check: (ctx: QualityContext) => {
        ok: boolean;
        message: string;
        severity?: "error" | "warn";
    };
}
/**
 * Slideshow-risk score in [0,1]: high = the output is likely mostly static
 * ("a slideshow"). Combines the ratio of wait vs play time and (if known) the
 * measured motion fraction.
 */
export declare function slideshowRisk(ctx: QualityContext): number;
/** Does the output honor its declared promise? (delivery-promise contract). */
export declare function checkDeliveryPromise(ctx: QualityContext): {
    ok: boolean;
    message: string;
};
/** Built-in gates. */
export declare const DEFAULT_QUALITY_GATES: QualityGate[];
export interface QualityReport {
    ok: boolean;
    slideshowRisk: number;
    results: Array<{
        gate: string;
        ok: boolean;
        message: string;
        severity: string;
    }>;
}
/** Run the gates (default + extra) over a context. `ok` = no error-severity failures. */
export declare function runQualityGates(ctx: QualityContext, extra?: QualityGate[]): QualityReport;
//# sourceMappingURL=quality.d.ts.map