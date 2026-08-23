import type { Camera } from "./CanvasRenderer.ts";
import type { Mobject } from "../mobject/Mobject.ts";
export interface SVGRenderOptions {
    /** Decimal places for coordinates, default 2. */
    precision?: number;
    /** Fill a background <rect>; default null = transparent. */
    background?: string | null;
}
export declare class SVGRenderer {
    camera: Camera;
    precision: number;
    background: string | null;
    private _gradientDefs;
    private _gradientCounter;
    private _filterDefs;
    private _filterCounter;
    constructor(camera: Camera, opts?: SVGRenderOptions);
    private gradientFillRef;
    private n;
    renderToString(mobjects: any[]): string;
    private filterRef;
    /** SceneRenderer-shaped alias for renderToString(), satisfying the shared
     *  interface in scene_renderer.ts. Purely delegating -- renderToString()
     *  remains the primary, unchanged public method. */
    renderFrame(mobjects: Mobject[]): string;
    private tracePathData;
    drawVMobject(mob: any): string | null;
    drawText(mob: any): string | null;
    drawImage(mob: any): string | null;
    private imageHref;
}
export declare function mobjectsToSVG(mobjects: any[], opts?: SVGRenderOptions & {
    pixelWidth?: number;
    pixelHeight?: number;
    frameHeight?: number;
    frameWidth?: number;
    frameCenter?: number[];
    camera?: any;
}): string;
//# sourceMappingURL=SVGRenderer.d.ts.map