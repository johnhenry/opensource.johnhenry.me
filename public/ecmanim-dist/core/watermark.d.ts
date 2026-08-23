export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
export interface WatermarkConfig {
    /** Watermark text (drawtext). */
    text?: string;
    /** Watermark image path (overlay). Takes precedence over text if both set. */
    image?: string;
    position?: WatermarkPosition;
    opacity?: number;
    fontSize?: number;
    color?: string;
    margin?: number;
}
export declare function ffmpegHasDrawtext(): Promise<boolean>;
/** Apply a watermark to `videoPath` in place (via a temp file + rename). */
export declare function applyWatermark(videoPath: string, config: WatermarkConfig): Promise<void>;
//# sourceMappingURL=watermark.d.ts.map