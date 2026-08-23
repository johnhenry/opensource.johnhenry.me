/** A named visual theme. `palette` is an ordered list of accent colors. */
export interface StylePreset {
    name: string;
    description?: string;
    background: string;
    palette: string[];
    /** Default font family for Text (when the backend supports it). */
    font?: string;
    /** Default stroke width for new VMobjects (roughly px at 1080p). */
    strokeWidth?: number;
    /** Playback pacing multiplier applied to default runTimes (1 = normal, <1 faster). */
    pacing?: number;
}
/** Seven presets in the spirit of scrollmark/showrunner's style system. */
export declare const STYLE_PRESETS: Record<string, StylePreset>;
export interface AspectRatioPreset {
    label: string;
    pixelWidth: number;
    pixelHeight: number;
}
/** Common social/broadcast aspect ratios at sensible default resolutions. */
export declare const ASPECT_RATIO_PRESETS: Record<string, AspectRatioPreset>;
/**
 * Resolve a style preset by name (case-insensitive) -- registry-registered
 * presets (see registerStylePreset()/registry.stylePresets) first, so a
 * plugin can override a built-in name, then the built-in STYLE_PRESETS map.
 * Returns undefined if unknown.
 */
export declare function resolveStyle(name?: string): StylePreset | undefined;
/**
 * Register a custom style preset (or override a built-in one) so it can be
 * resolved by name via resolveStyle() alongside the built-in STYLE_PRESETS,
 * matching the plugin-registry pattern already used for colors/rate-
 * functions/mobjects.
 */
export declare function registerStylePreset(name: string, preset: StylePreset): void;
/**
 * Resolve pixel dimensions for an aspect ratio. With no `height` the preset's
 * default resolution is used; with `height` the width is derived from the ratio
 * (even/rounded) so aspect can combine with a quality tier.
 */
export declare function resolveAspectRatio(ratio?: string, height?: number): {
    pixelWidth: number;
    pixelHeight: number;
} | undefined;
//# sourceMappingURL=presets.d.ts.map