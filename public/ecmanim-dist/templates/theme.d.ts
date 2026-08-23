import type { StylePreset } from "../core/presets.ts";
export interface Theme {
    preset: StylePreset;
    /** Accent color (default: first palette entry). */
    accent: string;
    /** Multiplier on every template font size (default 1). */
    fontScale: number;
    /** Safe margin from frame edges, world units (default 0.6). */
    margin: number;
    /** Foreground text color, derived from the background's luminance. */
    foreground: string;
}
export interface ThemeInput {
    /** Preset name (built-in or registerStylePreset'd) or an inline preset. */
    preset?: string | StylePreset;
    accent?: string;
    fontScale?: number;
    margin?: number;
    /** Override the derived foreground text color. */
    foreground?: string;
}
/**
 * Resolve a theme from a preset name, an inline StylePreset, or a partial
 * ThemeInput. Defaults to the "3b1b-dark" preset. Unknown preset names throw
 * (listing what resolveStyle knows about is the caller's job — names come
 * from code, not user input).
 */
export declare function resolveTheme(input?: ThemeInput | string): Theme;
//# sourceMappingURL=theme.d.ts.map