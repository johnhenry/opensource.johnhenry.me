/** Quality presets mirroring manim's -ql / -qm / -qh / -qk / -qp flags. */
export declare const QUALITY_PRESETS: Record<string, {
    pixelWidth: number;
    pixelHeight: number;
    fps: number;
}>;
/** Shape of a resolved config snapshot. */
export interface ManimConfig {
    quality: string;
    pixelWidth: number;
    pixelHeight: number;
    fps: number;
    background: string;
    format: string;
    output_dir: string;
    disable_caching: boolean;
    transparent: boolean;
    save_last_frame: boolean;
    from_animation_number: number | null;
    upto_animation_number: number | null;
    save_sections: boolean;
    renderer: string;
    [key: string]: any;
}
/**
 * The mutable, process-wide defaults object (layer 2). Mutating this changes the
 * defaults for subsequent resolveConfig() calls — this is what loadConfigFile()
 * and the CLI mutate. Mirrors `manim.config`.
 */
export declare const config: ManimConfig;
/** Reset `config` back to the hard-coded defaults. */
export declare function resetConfig(): ManimConfig;
/**
 * Produce a resolved config snapshot: DEFAULTS < config < overrides.
 * `overrides` may use either snake_case or camelCase field names.
 */
export declare function resolveConfig(overrides?: Record<string, any>): ManimConfig;
/**
 * Load a `manim.config.{js,json}` (or a caller-supplied path) and merge it INTO
 * the mutable `config` object (layer 2). Returns the mutated `config`. If no
 * file is found, returns `config` unchanged. Field names may be snake_case or
 * camelCase; a quality preset expands to dimensions/fps.
 */
export declare function loadConfigFile(path?: string): Promise<ManimConfig>;
/** Serialize the current default config to a JSON string (for `cfg` CLI). */
export declare function configToJSON(cfg?: ManimConfig): string;
//# sourceMappingURL=_config.d.ts.map