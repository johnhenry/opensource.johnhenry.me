import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import { LaggedStart } from "./composition.ts";
import type { Mobject } from "../mobject/Mobject.ts";
import type { DiagramMobject } from "../loaders/mermaid_loader.ts";
/** How node ids are ordered by revealDiagram for graph-shaped diagrams. */
export type RevealOrder = "topological" | "source" | "spatial";
export interface DiagramRevealConfig extends AnimationConfig {
    /** Node ordering for flowchart/state/class/er/git. Default "topological". */
    order?: RevealOrder;
    /** Total run time of the composed reveal (children compress into it). */
    runTime?: number;
    /** Stagger between consecutive parts (AnimationGroup lagRatio). Default 0.3. */
    lagRatio?: number;
    /** Factory for node-part animations (default: FadeIn; gantt: GrowFromEdge
     *  LEFT; pie/mindmap: GrowFromCenter). */
    nodeAnimation?: (part: Mobject, id: string) => Animation;
    /** Factory for edge-part animations (default: Create — draws the connector). */
    edgeAnimation?: (part: Mobject, id: string) => Animation;
}
/** Parse the source/target node ids out of a friendly edge id, given the
 *  diagram's node ids. Handles flowchart `L_A_B_0`, class `id_Animal_Dog_1`,
 *  the bare `A_B` aliases, and er's raw `id_entity-USER-0_entity-ORDER-1_0`.
 *  Returns null when the id encodes no endpoints (state's `edgeN`). Ambiguity
 *  (node names containing underscores) resolves to the longest matching pair. */
export declare function parseEdgeEndpoints(edgeId: string, nodeIds: readonly string[]): {
    source: string;
    target: string;
} | null;
/** A staged diagram reveal. A flat LaggedStart whose children are tagged with
 *  the part ids they animate; `startOf(id)` exposes each part's composed start
 *  time (seconds on the unscaled child timeline) for ordering assertions. */
export declare class DiagramReveal extends LaggedStart {
    /** The diagram this reveal introduces (Scene.play adds it at finish). */
    readonly introduced: DiagramMobject;
    /** Part ids in reveal (start-time) order. Synthetic ids name the un-id'd
     *  remainder: "__rest__" (scaffolding/leftovers), "msgN" (sequence
     *  messages), "partN" (fallback spatial units). */
    readonly revealOrder: string[];
    constructor(diagram: DiagramMobject, animations: Animation[], config?: AnimationConfig);
    /** Composed start time (seconds, unscaled child timeline) of a part's
     *  animation. Comparable across parts: with a group runTime the whole
     *  timeline rescales uniformly, so ordering is preserved. */
    startOf(id: string): number;
    /** matchTex's cleanup contract: every loose wrapper the child animations
     *  introduced while playing leaves the scene at finish; the DiagramMobject
     *  itself (`this.introduced`) is added instead, so the scene ends holding
     *  exactly the diagram. */
    getMobjectsToRemove(): Mobject[];
}
/** Reveal a mermaid diagram with a per-diagram-type staging strategy. Play it
 *  through Scene.play; afterwards the scene contains `diagram` itself. */
export declare function revealDiagram(diagram: DiagramMobject, config?: DiagramRevealConfig): DiagramReveal;
export default revealDiagram;
//# sourceMappingURL=diagram_reveal.d.ts.map