import { VGroup } from "../VMobject.ts";
import type { TextConfig } from "./Text.ts";
export interface ParagraphConfig extends TextConfig {
    lineSpacing?: number;
    alignment?: "left" | "center" | "right";
}
export declare class Paragraph extends VGroup {
    lines: VGroup;
    chars: VGroup;
    alignment: string;
    lineSpacing: number;
    constructor(...args: any[]);
    private _applyAlignment;
}
//# sourceMappingURL=paragraph.d.ts.map