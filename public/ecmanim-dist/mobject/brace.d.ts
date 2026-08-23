import { VMobject } from "./VMobject.ts";
import { Mobject, Group } from "./Mobject.ts";
import { Text } from "./text/Text.ts";
import { MathTex } from "./mathtex.ts";
/** Configuration for a Brace. */
export interface BraceConfig {
    direction?: number[];
    buff?: number;
    sharpness?: number;
    strokeColor?: any;
    fillColor?: any;
    color?: any;
    [key: string]: any;
}
export declare class Brace extends VMobject {
    direction: number[];
    buff: number;
    private _tip;
    private _span;
    constructor(mobject: Mobject | number[][], config?: BraceConfig);
    getTip(): number[];
    getBraceDirection(): number[];
    putAtTip(mob: Mobject, buff?: number): this;
    getTex(...tex: string[]): MathTex;
    getText(...text: string[]): Text;
}
export interface BraceLabelConfig {
    braceDirection?: number[];
    buff?: number;
    labelBuff?: number;
    labelConstructor?: (text: string) => Mobject;
    [key: string]: any;
}
export declare class BraceLabel extends Group {
    brace: Brace;
    label: Mobject;
    constructor(mobject: Mobject, text: string, config?: BraceLabelConfig);
    getBrace(): Brace;
    getLabel(): Mobject;
}
export declare class BraceText extends BraceLabel {
    constructor(mobject: Mobject, text: string, config?: BraceLabelConfig);
}
export interface BraceBetweenPointsConfig extends BraceConfig {
    direction?: number[];
}
export declare class BraceBetweenPoints extends Brace {
    constructor(p1: number[], p2: number[], config?: BraceBetweenPointsConfig);
}
//# sourceMappingURL=brace.d.ts.map