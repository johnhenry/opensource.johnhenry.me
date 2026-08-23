import { ImageMobject } from "./image_mobject.ts";
import type { ImageMobjectConfig } from "./image_mobject.ts";
import type { MathTexConfig } from "./mathtex.ts";
export interface MathTexImageConfig extends MathTexConfig, ImageMobjectConfig {
    /** Height of the placed image in scene units. Defaults from fontSize. */
    height?: number;
    width?: number;
}
/**
 * A rasterized LaTeX equation, drawable as an ImageMobject. NOT morphable — it
 * is a bitmap, chosen for cheap placement of dense/static equations.
 *
 * Construct it via the async factory `mathTexImage(tex, config)` (below), which
 * performs the async SVG render + bitmap load, mirroring node.ts's
 * `imageMobject`. The class itself is exported for typing/instanceof and to
 * allow post-hoc bitmap assignment.
 */
export declare class MathTexImage extends ImageMobject {
    /** The tex source this image was rendered from. */
    tex: string;
    /** True — this is a raster equation and cannot be animated per glyph. */
    readonly isRaster = true;
    constructor(image: any, tex: string, config?: MathTexImageConfig);
}
/**
 * Async factory: render `tex` to a MathJax SVG, rasterize it to a bitmap, and
 * wrap it in a MathTexImage sized by `config.fontSize` / `height` / `width`.
 *
 * Mirrors node.ts's `imageMobject()` async pattern. Requires that
 * `await initMathTex()` has run (texToSVG calls it internally, so this works
 * standalone, but doing it once up front warms the MathJax font cache).
 */
export declare function mathTexImage(tex: string, config?: MathTexImageConfig): Promise<MathTexImage>;
//# sourceMappingURL=mathtex_image.d.ts.map