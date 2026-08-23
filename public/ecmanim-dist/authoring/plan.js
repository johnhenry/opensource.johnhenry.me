// Plan IR + dry-run: harvest a scene's structure (segments, sections, duration)
// WITHOUT rendering, into an inspectable JSON "plan" — the separation of planning
// from rendering that scrollmark/showrunner and OpenMontage use. Also runs the
// quality gates over the plan. Node-oriented (constructs the scene).
import { runQualityGates } from "./quality.js";
/** Build a plan IR by dry-running the scene's construct() (no frames emitted). */
export async function toPlanIR(sceneOrConstruct, options = {}) {
    const fps = options.fps ?? 30;
    const width = options.width ?? 1920;
    const height = options.height ?? 1080;
    const { Scene } = await import("../scene/Scene.js");
    const scene = sceneOrConstruct?.prototype instanceof Scene ? new sceneOrConstruct({ fps }) : new Scene({ fps });
    scene.fps = fps;
    scene.frameHandler = async () => { }; // no rendering
    scene.onSegment = () => ({ skip: true }); // don't emit frames, but advance time
    if (sceneOrConstruct?.prototype instanceof Scene) {
        await scene.render();
    }
    else if (typeof sceneOrConstruct === "function") {
        await sceneOrConstruct(scene);
        scene.finalizeSections();
    }
    else {
        await scene.render();
    }
    const segments = (scene.playRecords ?? []).map((r) => ({
        index: r.index, kind: r.kind, startFrame: r.startFrame, endFrame: r.endFrame, hash: r.hash,
    }));
    const estimatedFrames = scene.frameCount ?? (segments.length ? segments[segments.length - 1].endFrame : 0);
    const durationSeconds = estimatedFrames / fps;
    const chapters = (scene.sections ?? []).map((s) => ({
        name: s.name, startFrame: s.startFrame, endFrame: s.endFrame,
    }));
    const quality = runQualityGates({
        fps, width, height, durationSeconds,
        segments: segments.map((s) => ({ kind: s.kind, startFrame: s.startFrame, endFrame: s.endFrame })),
        promise: options.promise,
    });
    return {
        version: "1",
        scene: { name: options.name ?? sceneOrConstruct?.name },
        config: { fps, width, height, quality: options.quality, format: options.format, background: options.background, style: options.style, aspectRatio: options.aspectRatio },
        segments,
        chapters,
        estimatedFrames,
        durationSeconds,
        quality,
    };
}
/** The plan IR as a pretty JSON string. */
export async function toPlanString(sceneOrConstruct, options) {
    return JSON.stringify(await toPlanIR(sceneOrConstruct, options), null, 2);
}
//# sourceMappingURL=plan.js.map