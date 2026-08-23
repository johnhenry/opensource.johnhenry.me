import type { Mobject } from "../mobject/Mobject.ts";
export interface SceneRenderer {
    renderFrame(mobjects: Mobject[]): void | string;
}
//# sourceMappingURL=scene_renderer.d.ts.map