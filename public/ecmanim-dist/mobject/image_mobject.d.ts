import { Mobject } from "./Mobject.ts";
import type { MobjectConfig } from "./Mobject.ts";
/** Configuration accepted by ImageMobject. */
export interface ImageMobjectConfig extends MobjectConfig {
    imageWidth?: number;
    imageHeight?: number;
    /** Nearest-neighbor upscaling (default: on for bitmaps under 64px). */
    pixelated?: boolean;
    height?: number;
    width?: number;
    point?: number[];
}
export declare class ImageMobject extends Mobject {
    _isImage: boolean;
    image: any;
    aspect: number;
    pixelated: boolean;
    constructor(image: any, config?: ImageMobjectConfig);
    setImage(image: any): this;
    copy(): this;
}
//# sourceMappingURL=image_mobject.d.ts.map