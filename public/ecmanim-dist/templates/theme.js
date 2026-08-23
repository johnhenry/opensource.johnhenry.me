// Theme: a small resolved layer over StylePreset for the scene templates —
// preset look + accent choice + font scaling + safe margin. resolveTheme is
// registerStylePreset-aware (plugin presets resolve by name like built-ins).
import { resolveStyle, STYLE_PRESETS } from "../core/presets.js";
import { Color } from "../core/color.js";
function luminance(hex) {
    const c = Color.parse(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
/**
 * Resolve a theme from a preset name, an inline StylePreset, or a partial
 * ThemeInput. Defaults to the "3b1b-dark" preset. Unknown preset names throw
 * (listing what resolveStyle knows about is the caller's job — names come
 * from code, not user input).
 */
export function resolveTheme(input) {
    const themeInput = typeof input === "string" ? { preset: input } : (input ?? {});
    let preset;
    if (typeof themeInput.preset === "object")
        preset = themeInput.preset;
    else {
        const name = themeInput.preset ?? "3b1b-dark";
        const resolved = resolveStyle(name);
        if (!resolved) {
            throw new Error(`resolveTheme: unknown style preset "${name}". Built-ins: ${Object.keys(STYLE_PRESETS).join(", ")}`);
        }
        preset = resolved;
    }
    const foreground = themeInput.foreground ?? (luminance(preset.background) > 0.5 ? "#16181D" : "#F5F6F8");
    return {
        preset,
        accent: themeInput.accent ?? preset.palette[0],
        fontScale: themeInput.fontScale ?? 1,
        margin: themeInput.margin ?? 0.6,
        foreground,
    };
}
//# sourceMappingURL=theme.js.map