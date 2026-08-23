// Register the built-in library into the shared registry, so built-ins and
// third-party plugins are looked up the same way (by name) and plugins can
// extend or override them. Also publishes the base classes on registry.bases.
import { registry } from "./registry.js";
import { Mobject } from "../mobject/Mobject.js";
import { VMobject, VGroup } from "../mobject/VMobject.js";
import { Animation } from "../animation/Animation.js";
import { Scene } from "../scene/Scene.js";
import { Color } from "../core/color.js";
import * as geometry from "../mobject/geometry.js";
import * as tips from "../mobject/tips.js";
import * as arcs from "../mobject/arcs.js";
import * as polygram from "../mobject/polygram.js";
import * as shapeMatchers from "../mobject/shape_matchers.js";
import * as vectors from "../mobject/vectors.js";
import * as labeled from "../mobject/labeled.js";
import * as booleanOps from "../mobject/boolean_ops.js";
import * as matrix from "../mobject/matrix.js";
import * as table from "../mobject/table.js";
import * as brace from "../mobject/brace.js";
import * as graph from "../mobject/graph.js";
import * as functionsMod from "../mobject/functions.js";
import * as probabilityMod from "../mobject/probability.js";
import * as vectorFieldMod from "../mobject/vector_field.js";
import * as surface from "../mobject/surface.js";
import * as polyhedra from "../mobject/polyhedra.js";
import * as coords from "../mobject/coordinate_systems.js";
import * as valueTracker from "../mobject/value_tracker.js";
import * as textMod from "../mobject/text/Text.js";
import * as paragraphMod from "../mobject/text/paragraph.js";
import * as texExtrasMod from "../mobject/text/tex_extras.js";
import * as codeMod from "../mobject/text/code.js";
import * as variableMod from "../mobject/text/variable.js";
import * as numbersAnim from "../animation/numbers.js";
import * as vtextMod from "../mobject/vectorized_text.js";
import * as mathtexMod from "../mobject/mathtex.js";
import * as mathtexImageMod from "../mobject/mathtex_image.js";
import * as svgMod from "../mobject/svg_mobject.js";
import * as imageMod from "../mobject/image_mobject.js";
import * as threeDMod from "../scene/three_d.js";
import * as movingCamScene from "../scene/moving_camera_scene.js";
import * as zoomedScene from "../scene/zoomed_scene.js";
import * as vectorScene from "../scene/vector_space_scene.js";
import * as animationMod from "../animation/Animation.js";
import * as extra from "../animation/extra.js";
import * as composition from "../animation/composition.js";
import * as creationExtra from "../animation/creation_extra.js";
import * as transformExtra from "../animation/transform_extra.js";
import * as transformMatching from "../animation/transform_matching.js";
import * as movementAnim from "../animation/movement.js";
import * as indicationExtra from "../animation/indication_extra.js";
import * as changingAnim from "../animation/changing.js";
import * as specializedAnim from "../animation/specialized.js";
import * as complexVT from "../mobject/complex_value_tracker.js";
import { RATE_FUNCTIONS, easeInBackFactory, easeOutBackFactory, easeInOutBackFactory, easeInElasticFactory, easeOutElasticFactory, easeInOutElasticFactory, } from "../animation/rate_functions.js";
import { springRate } from "../animation/spring.js";
import { Easing } from "../animation/easing.js";
import * as colorMod from "../core/color.js";
const isSubclassOf = (v, base) => typeof v === "function" && (v === base || v.prototype instanceof base);
let done = false;
export function registerBuiltins() {
    if (done)
        return registry;
    done = true;
    const mobjectModules = [geometry, tips, arcs, polygram, shapeMatchers, vectors,
        labeled, booleanOps, matrix, table, brace, graph, surface, polyhedra, coords, functionsMod, probabilityMod, vectorFieldMod,
        complexVT, valueTracker, textMod, paragraphMod, texExtrasMod, codeMod, variableMod, vtextMod, mathtexMod, svgMod, imageMod, mathtexImageMod, threeDMod, movingCamScene, zoomedScene, vectorScene];
    for (const mod of mobjectModules) {
        for (const [name, value] of Object.entries(mod)) {
            if (isSubclassOf(value, Mobject))
                registry.registerMobject(name, value);
            if (isSubclassOf(value, Scene) && value !== Scene)
                registry.registerScene(name, value);
        }
    }
    const animationModules = [animationMod, extra, composition, numbersAnim, creationExtra,
        transformExtra, transformMatching, movementAnim, indicationExtra, changingAnim, specializedAnim];
    for (const mod of animationModules) {
        for (const [name, value] of Object.entries(mod)) {
            if (isSubclassOf(value, Animation))
                registry.registerAnimation(name, value);
        }
    }
    for (const [name, fn] of Object.entries(RATE_FUNCTIONS)) {
        registry.registerRateFunction(name, fn);
    }
    // "spring": a real, working spring easing (src/animation/spring.ts) that
    // was previously exported standalone but never registered, so it couldn't
    // be referenced by name anywhere a rate-function string is accepted. This
    // is an fps=60 convenience default -- callers needing frame-accurate
    // springs (matching a specific scene's durationInFrames) should still
    // pass springRate(config, scene.fps) as a function directly.
    registry.registerRateFunction("spring", springRate({}, 60));
    // "bezier:x1,y1,x2,y2": any custom cubic-bezier curve (src/animation/
    // easing.ts, previously its own disconnected system with no name-based
    // lookup) referenceable anywhere a rate-function string is accepted, with
    // no per-curve registration step.
    registry.registerRateFunctionFactory("bezier", (x1, y1, x2, y2) => Easing.bezier(x1, y1, x2, y2));
    // Parameterized back/elastic (GSAP's back.out(2)/elastic.out(1, 0.3)
    // ergonomic) -- "backOut:2", "elasticOut:1,0.3", etc.
    registry.registerRateFunctionFactory("backIn", (overshoot) => easeInBackFactory(overshoot));
    registry.registerRateFunctionFactory("backOut", (overshoot) => easeOutBackFactory(overshoot));
    registry.registerRateFunctionFactory("backInOut", (overshoot) => easeInOutBackFactory(overshoot));
    registry.registerRateFunctionFactory("elasticIn", (amplitude, period) => easeInElasticFactory(amplitude, period));
    registry.registerRateFunctionFactory("elasticOut", (amplitude, period) => easeOutElasticFactory(amplitude, period));
    registry.registerRateFunctionFactory("elasticInOut", (amplitude, period) => easeInOutElasticFactory(amplitude, period));
    for (const [name, value] of Object.entries(colorMod)) {
        if (typeof value === "string" && value.startsWith("#"))
            registry.registerColor(name, value);
    }
    registry.registerScene("Scene", Scene);
    registry.bases = { Mobject, VMobject, VGroup, Animation, Scene, Color };
    return registry;
}
//# sourceMappingURL=builtins.js.map