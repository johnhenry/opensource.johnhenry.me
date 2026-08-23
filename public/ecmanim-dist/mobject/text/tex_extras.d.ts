import { VGroup } from "../VMobject.ts";
import type { MathTexConfig } from "../mathtex.ts";
import { Dot, Line } from "../geometry.ts";
export interface BulletedListConfig extends MathTexConfig {
    buff?: number;
    dotScaleFactor?: number;
    texEnvironment?: string;
    tex_environment?: string;
}
export declare class BulletedList extends VGroup {
    items: VGroup;
    buff: number;
    dotScaleFactor: number;
    constructor(...args: any[]);
    /** Get the bullet Dot for row `i`. */
    getBullet(i: number): Dot;
    /** Dim every item except `index` (manim's fade_all_but). */
    fadeAllBut(index: number, opacity?: number): this;
}
export interface TitleConfig extends MathTexConfig {
    includeUnderline?: boolean;
    matchUnderlineWidthToText?: boolean;
    underlineBuff?: number;
    useTex?: boolean;
}
export declare class Title extends VGroup {
    titleText: any;
    underline: Line | null;
    includeUnderline: boolean;
    matchUnderlineWidthToText: boolean;
    underlineBuff: number;
    constructor(text?: string, config?: TitleConfig);
}
//# sourceMappingURL=tex_extras.d.ts.map