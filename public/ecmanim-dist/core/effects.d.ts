import type { ColorLike } from "./types.ts";
export type Effect = {
    type: "blur";
    radius: number;
} | {
    type: "glow";
    radius: number;
    color?: ColorLike;
    strength?: number;
} | {
    type: "shadow";
    blur: number;
    color?: ColorLike;
    offsetX?: number;
    offsetY?: number;
} | {
    type: "colorAdjust";
    brightness?: number;
    contrast?: number;
    saturate?: number;
    hueRotate?: number;
    grayscale?: number;
} | {
    type: "noise";
    amount: number;
    monochrome?: boolean;
    seed?: number;
};
/** Camera-level full-frame effects: everything a mobject can have, plus
 *  vignette (meaningless per-mobject, classic as a frame grade). */
export type FrameEffect = Effect | {
    type: "vignette";
    strength: number;
    color?: ColorLike;
};
/** Effects expressible as a single CSS canvas-filter string (ctx.filter):
 *  blur + the colorAdjust family. Radii are declared at 1080p-reference
 *  pixels and scaled by `scale` (camera.strokeScale()), matching how stroke
 *  widths already scale. Returns "" when nothing applies. */
export declare function effectsToCanvasFilter(effects: readonly Effect[], scale: number): string;
/** Extra bounding-box padding (device px) an offscreen render needs so the
 *  effect's spill (blur halo, shadow offset, glow) isn't clipped. */
export declare function effectPad(effects: readonly Effect[], scale: number): number;
/** Stable fingerprint for cache keys (static-subtree render cache). */
export declare function effectsFingerprint(effects: readonly Effect[] | undefined): string;
/** Split an effect list into the passes the canvas compositor plans around.
 *  Order within each category is preserved; at most one shadow/glow/noise
 *  is applied per mobject (last one wins -- documented limitation). */
export declare function splitEffects(effects: readonly Effect[]): {
    filter: Effect[];
    shadow?: Extract<Effect, {
        type: "shadow";
    }>;
    glow?: Extract<Effect, {
        type: "glow";
    }>;
    noise?: Extract<Effect, {
        type: "noise";
    }>;
};
/** Deterministic RGBA noise tile bytes (size x size). Monochrome = same
 *  value across RGB; color = independent channels. Alpha is always 255 --
 *  the renderer clips the tile to the source's alpha via compositing.
 *  Byte-identical for identical (size, seed, mono) -- render-cache safe. */
export declare function makeNoiseBytes(size: number, seed: number, mono: boolean): Uint8ClampedArray;
/** 20-element feColorMatrix "matrix" values for saturate(s). */
export declare function saturateMatrix(s: number): number[];
/** 20-element feColorMatrix "matrix" values for hue-rotate(deg). */
export declare function hueRotateMatrix(deg: number): number[];
/** Lerp two effect lists for Transform interpolation. Only same-shape lists
 *  (equal length, matching type sequence) blend numerically; mixed shapes
 *  snap: start's effects below alpha 1, target's at alpha >= 1. Morphing
 *  between structurally different effect stacks is out of scope. */
export declare function lerpEffects(start: readonly Effect[] | undefined, target: readonly Effect[] | undefined, alpha: number): Effect[] | undefined;
//# sourceMappingURL=effects.d.ts.map