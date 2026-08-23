import { VGroup } from "./VMobject.ts";
import type { ColorLike } from "../core/types.ts";
/** Configuration accepted by VText. */
export interface VTextConfig {
    fontSize?: number;
    font?: any;
    color?: ColorLike;
    fillColor?: ColorLike;
    strokeColor?: ColorLike;
    fillOpacity?: number;
    strokeWidth?: number;
    strokeOpacity?: number;
    point?: number[];
    [key: string]: any;
}
type NodeFontAutoLoader = () => any;
export declare function registerNodeFontAutoLoader(fn: NodeFontAutoLoader): void;
export declare function getDefaultFont(): any;
export declare function setDefaultFont(source: any): Promise<any>;
export declare function setDefaultFontSync(font: any): any;
export declare class VText extends VGroup {
    text: string;
    fontSize: number;
    constructor(text?: string, config?: VTextConfig);
    _buildGlyphs(font: any, config: VTextConfig): void;
    setStyle(style: any): this;
}
export declare function setStyle(): void;
export {};
//# sourceMappingURL=vectorized_text.d.ts.map