import type { AnimationConfig } from "./Animation.ts";
import { Animation } from "./Animation.ts";
import { AnimationGroup } from "./composition.ts";
import type { Mobject } from "../mobject/Mobject.ts";
import type { DiagramMobject } from "../loaders/mermaid_loader.ts";
export interface DiagramDiffConfig extends AnimationConfig {
    /** Total run time (children run simultaneously within it). */
    runTime?: number;
    /** Force-match a source friendly id to a differently-named target id
     *  (e.g. a renamed node: { OldName: "NewName" }). */
    keyMap?: Record<string, string>;
}
/** The composed diff animation, with the id partition exposed for
 *  introspection/tests. */
export declare class DiagramDiff extends AnimationGroup {
    /** newDiagram — Scene.play adds it to the scene at finish. */
    readonly introduced: DiagramMobject;
    /** Friendly ids present in both diagrams (Transform-morphed in place). */
    readonly matchedIds: string[];
    /** Friendly ids only in newDiagram (FadeIn). */
    readonly addedIds: string[];
    /** Friendly ids only in oldDiagram (FadeOut). */
    readonly removedIds: string[];
    private readonly _oldDiagram;
    constructor(oldDiagram: DiagramMobject, newDiagram: DiagramMobject, animations: Animation[], partition: {
        matched: string[];
        added: string[];
        removed: string[];
    }, config?: AnimationConfig);
    /** matchTex's cleanup contract: the old diagram, the loose FadeIn wrappers
     *  introduced during the play, and everything the children flagged for
     *  removal all leave the scene at finish; `this.introduced` (newDiagram)
     *  replaces them. */
    getMobjectsToRemove(): Mobject[];
}
/** Morph `oldDiagram` into `newDiagram`, matching parts by friendly id.
 *  Typical use: `scene.add(oldDiagram); await scene.play(diffDiagrams(
 *  oldDiagram, newDiagram));` — afterwards the scene shows newDiagram. */
export declare function diffDiagrams(oldDiagram: DiagramMobject, newDiagram: DiagramMobject, config?: DiagramDiffConfig): DiagramDiff;
export default diffDiagrams;
//# sourceMappingURL=diagram_diff.d.ts.map