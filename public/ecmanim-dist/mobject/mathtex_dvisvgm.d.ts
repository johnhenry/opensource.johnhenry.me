import { VGroup } from "./VMobject.ts";
import { SVGMobject } from "./svg_mobject.ts";
import { MathTex } from "./mathtex.ts";
import type { MathTexConfig } from "./mathtex.ts";
/** Which TeX->SVG binaries are available. Both must be present to render. */
export interface DvisvgmToolchain {
    latex: string | null;
    pdflatex: string | null;
    dvisvgm: string | null;
    available: boolean;
}
/** Detect the on-PATH TeX toolchain. */
export declare function detectDvisvgmToolchain(): Promise<DvisvgmToolchain>;
/**
 * Render `tex` to an SVG string via a real TeX toolchain (latex/pdflatex +
 * dvisvgm --no-fonts), with an on-disk cache keyed by the tex source.
 *
 * @throws a clear "TeX toolchain not found; falls back to MathJax" error when
 *         `latex`/`pdflatex`/`dvisvgm` are not installed, so the caller can
 *         degrade to MathTex.
 */
export declare function texToSVGViaDvisvgm(tex: string, config?: MathTexConfig): Promise<string>;
/**
 * Animatable LaTeX math rendered through a real TeX toolchain. Because the
 * toolchain is optional and slow, construct it with the async factory
 * `mathTexDvisvgm(tex, config)` (below). The class extends VGroup and holds the
 * glyph VMobjects parsed from the dvisvgm SVG.
 */
export declare class MathTexDvisvgm extends VGroup {
    tex: string;
    constructor(tex: string, svgMobject?: SVGMobject);
}
/**
 * Async factory: render `tex` with the TeX toolchain and build VMobjects from
 * the resulting SVG (reusing SVGMobject's path parser). Sizes by
 * `config.fontSize` (default 0.7, matching MathTex).
 *
 * @throws the toolchain-not-found error from texToSVGViaDvisvgm when latex/
 *         dvisvgm are unavailable. Use `mathTexDvisvgmOrFallback` to degrade to
 *         MathTex automatically.
 */
export declare function mathTexDvisvgm(tex: string, config?: MathTexConfig): Promise<MathTexDvisvgm>;
/**
 * Try the dvisvgm (real TeX) backend; if the toolchain isn't installed (or any
 * render error occurs), gracefully fall back to a normal MathTex (MathJax).
 * Always resolves to an animatable VGroup-derived mobject.
 */
export declare function mathTexDvisvgmOrFallback(tex: string, config?: MathTexConfig): Promise<MathTexDvisvgm | MathTex>;
//# sourceMappingURL=mathtex_dvisvgm.d.ts.map