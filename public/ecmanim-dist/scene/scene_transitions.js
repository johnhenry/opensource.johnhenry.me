// Scene-to-scene transitions (Motion Canvas parity campaign, cluster MC4).
//
// Motion Canvas transitions hand off between two SCENES; ecmanim renders one
// scene per video, so these helpers model the same visual with a single
// scene: everything currently on screen is the OUTGOING "scene", and the
// content you provide (or add in the callback) is the INCOMING one. After the
// transition plays, the outgoing mobjects are removed — the scene has
// "become" the next one. Timing/easing rides the existing transition
// machinery in src/animation/transitions.ts (crossFade/slide + overlap
// windows), so scene transitions and in-scene transitions stay consistent.
import { Group } from "../mobject/Mobject.js";
import { Transform, FadeOut } from "../animation/Animation.js";
import { crossFade, slide } from "../animation/transitions.js";
import { AnimationGroup } from "../animation/composition.js";
/** Which edge the incoming content enters FROM (MC's `Direction`). A const
 *  object rather than a TS enum — Node's strip-only type erasure can't run
 *  enums (same convention as the rest of this codebase). */
export const Direction = {
    Left: "left",
    Right: "right",
    Top: "top",
    Bottom: "bottom",
};
async function resolveIncoming(scene, incoming) {
    if (typeof incoming === "function") {
        const before = new Set(scene.mobjects);
        const returned = await incoming();
        const added = scene.mobjects.filter((m) => !before.has(m));
        const extra = returned == null ? [] : Array.isArray(returned) ? returned : [returned];
        for (const m of extra)
            if (!scene.mobjects.includes(m))
                scene.add(m);
        // Callback-added first (stable order), then any returned-but-unadded.
        return [...added, ...extra.filter((m) => !added.includes(m))];
    }
    const mobs = Array.isArray(incoming) ? incoming : [incoming];
    for (const m of mobs)
        if (!scene.mobjects.includes(m))
            scene.add(m);
    return mobs;
}
function frameDims(scene) {
    const cam = scene.camera;
    return { w: cam?.frameWidth ?? 14.222222222222221, h: cam?.frameHeight ?? 8 };
}
function directionVector(scene, direction) {
    if (Array.isArray(direction))
        return direction;
    const { w, h } = frameDims(scene);
    // The vector everything MOVES by: incoming starts offset by its negation,
    // so entering FROM the left means moving rightward (+x), etc.
    switch (direction) {
        case Direction.Left: return [w, 0, 0];
        case Direction.Right: return [-w, 0, 0];
        case Direction.Top: return [0, -h, 0];
        case Direction.Bottom: return [0, h, 0];
    }
}
// Shared drive: build outgoing/incoming groups, play the composed
// transition, then drop the outgoing mobjects from the scene.
async function runTransition(scene, incoming, build) {
    const outgoingMobs = [...scene.mobjects];
    const inMobs = await resolveIncoming(scene, incoming);
    const outGroup = new Group(...outgoingMobs.filter((m) => !inMobs.includes(m)));
    const inGroup = new Group(...inMobs);
    await scene.play(build(outGroup, inGroup));
    for (const m of outGroup.submobjects)
        scene.remove(m);
}
/**
 * Slide the current content out while the incoming content slides in from
 * `direction` (MC's `slideTransition`). Incoming mobjects should be placed
 * at their FINAL positions — the helper offsets them to the entry edge and
 * slides them home.
 *
 * ```ts
 * await slideTransition(scene, Direction.Left, () => scene.add(nextTitle));
 * ```
 */
export async function slideTransition(scene, direction = Direction.Top, incoming, config = {}) {
    const dir = directionVector(scene, direction);
    await runTransition(scene, incoming, (a, b) => slide(a, b, { direction: dir, ...config }));
}
/** Cross-fade the current content into the incoming content (MC's
 *  `fadeTransition`). */
export async function fadeTransition(scene, incoming, config = {}) {
    await runTransition(scene, incoming, (a, b) => crossFade(a, b, config));
}
/**
 * The incoming content starts collapsed into `area` (a world-space rect —
 * e.g. a thumbnail, a window, a highlighted region) and grows to its full
 * layout while the current content fades away (MC's `zoomInTransition`).
 */
export async function zoomInTransition(scene, area, incoming, config = {}) {
    await runTransition(scene, incoming, (a, b) => {
        // Target = the incoming layout as authored; start = squeezed into area.
        const target = b.copy();
        const w = Math.max(b.getWidth(), 1e-6);
        const h = Math.max(b.getHeight(), 1e-6);
        const s = Math.min(area.width / w, area.height / h);
        b.scale(s);
        b.moveTo(area.center);
        const grow = new Transform(b, target);
        const out = new FadeOut(a);
        const runTime = config.runTime ?? 1;
        grow.runTime = runTime;
        out.runTime = runTime;
        if (config.rateFunc) {
            grow.rateFunc = config.rateFunc;
            out.rateFunc = config.rateFunc;
        }
        return new AnimationGroup([out, grow], { runTime });
    });
}
/**
 * No-op marker for port fidelity: MC scenes call `finishScene()` to let the
 * next scene's transition overlap the current one's tail. In ecmanim's
 * single-scene model the transition helpers already own that overlap
 * (via TransitionConfig.overlap), so there is nothing to do — but ports can
 * keep the call so they read line-for-line like the original.
 */
export function finishScene(_scene) { }
//# sourceMappingURL=scene_transitions.js.map