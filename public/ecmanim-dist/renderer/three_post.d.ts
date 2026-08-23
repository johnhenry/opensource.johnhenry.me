export interface PostProcessingConfig {
    /** UnrealBloomPass. Threshold applies to the raw 0..1 channel values you
     *  set on mobjects (color management is disabled for CPU parity). */
    bloom?: {
        strength?: number;
        radius?: number;
        threshold?: number;
    };
    /** FilmPass (animated grain; grayscale optionally). */
    film?: {
        intensity?: number;
        grayscale?: boolean;
    };
    /** GlitchPass. `goWild` = continuous heavy glitch. */
    glitch?: boolean | {
        goWild?: boolean;
    };
    /** LUTPass color grading. `url` loads a .cube/.3dl file (works through
     *  node-gl's JSON-serialized options); `texture` is a pre-built 3D LUT
     *  texture for direct browser use only. */
    lut?: {
        url?: string;
        texture?: any;
        intensity?: number;
    };
    /** SMAAPass antialiasing (post-resolve). */
    smaa?: boolean;
    /** OutputPass (sRGB + tone mapping). OPT-IN: changes colors relative to
     *  the CPU renderer -- see the color-space note above. */
    output?: boolean;
    /** Custom fullscreen fragment-shader passes, applied in array order after
     *  bloom. The shader samples `tDiffuse` (the composed frame so far);
     *  `uTime` (seconds) and `uResolution` (vec2) are auto-provided when the
     *  GLSL source references them. Uniforms use the {value} convention. */
    custom?: Array<{
        fragmentShader: string;
        vertexShader?: string;
        uniforms?: Record<string, {
            value: any;
        }>;
    }>;
}
export interface PostModules {
    EffectComposer: any;
    RenderPass: any;
    ShaderPass?: any;
    UnrealBloomPass?: any;
    FilmPass?: any;
    GlitchPass?: any;
    LUTPass?: any;
    SMAAPass?: any;
    OutputPass?: any;
    /** Pre-loaded LUT texture when config.lut.url was given. */
    lutTexture?: any;
}
export interface BuiltComposer {
    composer: any;
    setSize(w: number, h: number): void;
    /** Advance time-driven passes (film grain, glitch, uTime uniforms). */
    update(dt: number): void;
    dispose(): void;
}
/** Dynamically import exactly the postprocessing modules `config` needs.
 *  Throws a clear error if three isn't installed (it's an optionalDependency). */
export declare function loadPostModules(config: PostProcessingConfig): Promise<PostModules>;
/** Wire an EffectComposer from already-loaded (or fake) modules. Pure and
 *  synchronous -- everything async (module/LUT loading) happened in
 *  loadPostModules. Pass order: RenderPass, bloom, custom shader passes,
 *  film, glitch, LUT, SMAA, then OutputPass (only when opted in). */
export declare function buildComposer(THREE: any, modules: PostModules, glRenderer: any, scene: any, camera: any, config: PostProcessingConfig, size: {
    width: number;
    height: number;
}): BuiltComposer;
//# sourceMappingURL=three_post.d.ts.map