// Load a portable plugin MANIFEST (a plain JSON object, see
// packages/plugin-spec/manifest.schema.json) into the ecmanim registry.
//
// The manifest is the language-neutral, shareable subset of a plugin — color
// palettes, rate functions (as expressions in `t`), parametric surfaces (as
// expressions in `u`,`v`), and SVG shape libraries. The SAME manifest is loaded
// into Python manim by packages/manim-portable-plugins via an equivalent
// adapter, so plugins written once run on both engines.
//
// Nothing here executes arbitrary code: expressions are compiled with the safe
// recursive-descent evaluator in packages/plugin-spec/expr.ts (no eval).
import { registry as sharedRegistry } from "./registry.js";
import { compileExpr } from "./expr.js";
import { Surface } from "../mobject/surface.js";
import { SVGMobject } from "../mobject/svg_mobject.js";
// ---------------------------------------------------------------------------
// Surface factory: compile x/y/z expressions once and build a Surface class
// whose instances evaluate them per (u, v).
// ---------------------------------------------------------------------------
function makeSurfaceClass(spec) {
    const fx = compileExpr(spec.x, ["u", "v"]);
    const fy = compileExpr(spec.y, ["u", "v"]);
    const fz = compileExpr(spec.z, ["u", "v"]);
    const func = (u, v) => {
        const scope = { u, v };
        return [fx(scope), fy(scope), fz(scope)];
    };
    const cfg = {
        uRange: spec.uRange,
        vRange: spec.vRange,
        resolution: spec.resolution,
        fillColor: spec.fillColor,
    };
    // A concrete Surface subclass so it can be registered as a mobject and
    // constructed with `new`. Extra per-call config is merged over the manifest's.
    return class ManifestSurface extends Surface {
        constructor(overrides = {}) {
            super(func, { ...cfg, ...overrides });
        }
    };
}
// ---------------------------------------------------------------------------
// Shape factory: an SVGMobject subclass carrying the manifest's SVG string.
// ---------------------------------------------------------------------------
function makeShapeClass(svg) {
    return class ManifestSVGMobject extends SVGMobject {
        constructor(config = {}) {
            super(svg, config);
        }
    };
}
// ---------------------------------------------------------------------------
// Parse a manifest from an object or a JSON string.
// ---------------------------------------------------------------------------
function parseManifest(input) {
    const m = typeof input === "string" ? JSON.parse(input) : input;
    if (!m || typeof m !== "object")
        throw new Error("manifest: expected an object or JSON string");
    if (typeof m.name !== "string" || typeof m.version !== "string") {
        throw new Error("manifest: missing required `name` / `version`");
    }
    return m;
}
/**
 * Load a manifest (object or JSON string) into a registry (defaults to the
 * shared singleton), registering colors, rate functions, surfaces, and shapes.
 * Returns a summary of how many of each were registered.
 */
export function loadManifest(input, registry = sharedRegistry) {
    const m = parseManifest(input);
    let nColors = 0;
    if (m.colors) {
        for (const [name, hex] of Object.entries(m.colors)) {
            registry.registerColor(name, hex);
            nColors++;
        }
    }
    let nRate = 0;
    if (m.rateFunctions) {
        for (const [name, exprSrc] of Object.entries(m.rateFunctions)) {
            const compiled = compileExpr(exprSrc, ["t"]);
            const fn = (t) => compiled({ t });
            registry.registerRateFunction(name, fn);
            nRate++;
        }
    }
    let nSurfaces = 0;
    if (m.surfaces) {
        for (const [name, spec] of Object.entries(m.surfaces)) {
            registry.registerMobject(name, makeSurfaceClass(spec));
            nSurfaces++;
        }
    }
    let nShapes = 0;
    if (m.shapes) {
        for (const [name, svg] of Object.entries(m.shapes)) {
            registry.registerMobject(name, makeShapeClass(svg));
            nShapes++;
        }
    }
    return {
        name: m.name,
        version: m.version,
        colors: nColors,
        rateFunctions: nRate,
        surfaces: nSurfaces,
        shapes: nShapes,
    };
}
/**
 * Node-only: read a manifest file from disk and load it. Uses dynamic imports
 * so this module stays browser-safe (the browser build simply never calls it).
 */
export async function loadManifestFromFile(path, registry = sharedRegistry) {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(path, "utf8");
    return loadManifest(text, registry);
}
//# sourceMappingURL=manifest.js.map