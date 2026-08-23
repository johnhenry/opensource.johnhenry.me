export interface NormalizedPixels {
    width: number;
    height: number;
    /** RGBA, row-major, width*height*4 bytes. */
    data: Uint8ClampedArray;
}
/**
 * Accepts:
 *  - 2D array of numbers  -> grayscale (`[[0, 64, 255], ...]`)
 *  - 3D array [h][w][3|4] -> RGB / RGBA
 *  - typed arrays inside are fine (anything indexable with .length)
 */
export declare function normalizePixelArray(array: any): NormalizedPixels;
//# sourceMappingURL=pixel_array.d.ts.map