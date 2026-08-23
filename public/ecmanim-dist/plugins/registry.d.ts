import type { RateFunc } from "../core/types.ts";
import type { StylePreset } from "../core/presets.ts";
export type RegistryKind = "mobject" | "animation" | "rateFunction" | "color" | "renderer" | "scene";
export interface Plugin {
    name?: string;
    version?: string;
    install(api: Registry): void;
}
export type PluginLike = Plugin | ((api: Registry) => void);
export declare class Registry {
    mobjects: Map<string, any>;
    animations: Map<string, any>;
    rateFunctions: Map<string, RateFunc>;
    /** Parameterized rate-function factories, e.g. registerRateFunctionFactory("backOut", overshoot => ...)
     *  resolved via running("backOut:2")-style colon-suffixed names (see rate_functions.ts). */
    rateFunctionFactories: Map<string, (...args: number[]) => RateFunc>;
    colors: Map<string, string>;
    renderers: Map<string, any>;
    scenes: Map<string, any>;
    /** Named style/theme presets, extending core/presets.ts's built-in STYLE_PRESETS. */
    stylePresets: Map<string, StylePreset>;
    plugins: Plugin[];
    /** Base classes exposed to plugin authors so they can extend without deep imports. */
    bases: Record<string, any>;
    private mapFor;
    register(kind: RegistryKind, name: string, value: any): this;
    registerMobject(name: string, cls: any): this;
    registerAnimation(name: string, cls: any): this;
    registerRateFunction(name: string, fn: RateFunc): this;
    registerRateFunctionFactory(name: string, factory: (...args: number[]) => RateFunc): this;
    registerColor(name: string, value: string): this;
    registerRenderer(name: string, factory: any): this;
    registerScene(name: string, cls: any): this;
    registerStylePreset(name: string, preset: StylePreset): this;
    get(kind: RegistryKind, name: string): any;
    has(kind: RegistryKind, name: string): boolean;
    list(kind: RegistryKind): string[];
    /** Install a plugin (or bare install function). Chainable. */
    use(plugin: PluginLike): this;
}
/** The shared singleton registry. */
export declare const registry: Registry;
/** Install a plugin against the shared registry. */
export declare function use(plugin: PluginLike): Registry;
//# sourceMappingURL=registry.d.ts.map