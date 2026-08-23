export interface AtlasRegion {
    mob: any;
    u0: number;
    v0: number;
    u1: number;
    v1: number;
    worldWidth: number;
    worldHeight: number;
    worldCenter: number[];
}
export interface TextAtlasResult {
    canvas: any;
    regions: AtlasRegion[];
}
export interface TextAtlasOptions {
    fontPx?: number;
    padding?: number;
    maxWidth?: number;
    /** Injectable Document, for environments where the global isn't set
     *  (matches this project's existing test-injection conventions). */
    documentRef?: any;
}
/** Returns null when there's no synchronous canvas/document backend
 *  available (matches ThreeRenderer._textSprite()'s existing headless
 *  skip), or when given no text mobjects. */
export declare function buildTextAtlas(textMobjects: any[], opts?: TextAtlasOptions): TextAtlasResult | null;
//# sourceMappingURL=text_atlas.d.ts.map