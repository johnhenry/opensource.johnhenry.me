// The plugin registry. A plugin is anything with an `install(api)` method (or a
// bare function); `use()` runs it against the shared registry so it can add
// mobjects, animations, rate functions, colors, renderers, or scene types. This
// works identically in Node and the unbundled browser (no filesystem discovery).
export class Registry {
    mobjects = new Map();
    animations = new Map();
    rateFunctions = new Map();
    /** Parameterized rate-function factories, e.g. registerRateFunctionFactory("backOut", overshoot => ...)
     *  resolved via running("backOut:2")-style colon-suffixed names (see rate_functions.ts). */
    rateFunctionFactories = new Map();
    colors = new Map();
    renderers = new Map();
    scenes = new Map();
    /** Named style/theme presets, extending core/presets.ts's built-in STYLE_PRESETS. */
    stylePresets = new Map();
    plugins = [];
    /** Base classes exposed to plugin authors so they can extend without deep imports. */
    bases = {};
    mapFor(kind) {
        switch (kind) {
            case "mobject": return this.mobjects;
            case "animation": return this.animations;
            case "rateFunction": return this.rateFunctions;
            case "color": return this.colors;
            case "renderer": return this.renderers;
            case "scene": return this.scenes;
        }
    }
    register(kind, name, value) {
        this.mapFor(kind).set(name, value);
        return this;
    }
    registerMobject(name, cls) { this.mobjects.set(name, cls); return this; }
    registerAnimation(name, cls) { this.animations.set(name, cls); return this; }
    registerRateFunction(name, fn) { this.rateFunctions.set(name, fn); return this; }
    registerRateFunctionFactory(name, factory) {
        this.rateFunctionFactories.set(name, factory);
        return this;
    }
    registerColor(name, value) { this.colors.set(name, value); return this; }
    registerRenderer(name, factory) { this.renderers.set(name, factory); return this; }
    registerScene(name, cls) { this.scenes.set(name, cls); return this; }
    registerStylePreset(name, preset) { this.stylePresets.set(name, preset); return this; }
    get(kind, name) { return this.mapFor(kind).get(name); }
    has(kind, name) { return this.mapFor(kind).has(name); }
    list(kind) { return [...this.mapFor(kind).keys()]; }
    /** Install a plugin (or bare install function). Chainable. */
    use(plugin) {
        const p = typeof plugin === "function" ? { install: plugin } : plugin;
        p.install(this);
        this.plugins.push(p);
        return this;
    }
}
/** The shared singleton registry. */
export const registry = new Registry();
/** Install a plugin against the shared registry. */
export function use(plugin) {
    return registry.use(plugin);
}
//# sourceMappingURL=registry.js.map