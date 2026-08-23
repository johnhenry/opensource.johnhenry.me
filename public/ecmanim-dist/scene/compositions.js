// A registry of named "compositions" — renderable Scenes with metadata (like
// Remotion's <Composition> list / getCompositions()). Lets tooling enumerate what
// can be rendered, with each entry's params schema and defaults, and underpins
// renderStill and the CLI `scenes` listing. Isomorphic (pure data).
const registry = new Map();
/** Register a renderable composition by name. Later registrations overwrite. */
export function registerComposition(name, scene, config = {}) {
    const desc = {
        name,
        scene,
        // Pick up a static `schema` on the Scene class if present.
        schema: config.schema ?? scene?.schema ?? scene?.constructor?.schema,
        ...config,
    };
    registry.set(name, desc);
    return desc;
}
/** Look up a composition by name. */
export function getComposition(name) {
    return registry.get(name);
}
/** All registered compositions, in insertion order. */
export function listCompositions() {
    return Array.from(registry.values());
}
/** A JSON-serializable summary of every composition (for `--json` CLI output). */
export function compositionsToJSON() {
    return listCompositions().map((c) => ({
        name: c.name,
        description: c.description,
        fps: c.fps,
        width: c.width,
        height: c.height,
        durationInFrames: c.durationInFrames,
        schema: c.schema?.spec,
        defaultParams: c.defaultParams,
    }));
}
/** Remove a composition (mainly for tests). */
export function unregisterComposition(name) {
    return registry.delete(name);
}
/** Clear all (tests). */
export function _clearCompositions() {
    registry.clear();
}
//# sourceMappingURL=compositions.js.map