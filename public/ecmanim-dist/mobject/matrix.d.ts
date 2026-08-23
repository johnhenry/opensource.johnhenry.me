import { VMobject, VGroup } from "./VMobject.ts";
import { Mobject, Group } from "./Mobject.ts";
/** Configuration for the Matrix family of mobjects. */
export interface MatrixConfig {
    v_buff?: number;
    h_buff?: number;
    bracket_h_buff?: number;
    bracket_v_buff?: number;
    left_bracket?: string;
    right_bracket?: string;
    add_background_rectangles_to_entries?: boolean;
    include_background_rectangle?: boolean;
    element_alignment_corner?: number[];
    element_to_mobject?: (element: any) => Mobject;
    element_to_mobject_config?: Record<string, any>;
    bracket_config?: Record<string, any>;
    [key: string]: any;
}
export declare class Matrix extends VGroup {
    mob_matrix: Mobject[][];
    elements: Mobject[];
    brackets: VGroup;
    v_buff: number;
    h_buff: number;
    bracket_h_buff: number;
    bracket_v_buff: number;
    left_bracket: VMobject;
    right_bracket: VMobject;
    element_alignment_corner: number[];
    constructor(rows: any[][], config?: MatrixConfig);
    private _entriesGroup;
    protected elementToMobject(element: any, config?: Record<string, any>): Mobject;
    addBrackets(leftStr?: string, rightStr?: string): this;
    getRows(): VGroup;
    getColumns(): VGroup;
    getEntries(): VGroup;
    getBrackets(): VGroup;
    getMobMatrix(): Mobject[][];
    setColumnColors(...colors: any[]): this;
}
export declare class DecimalMatrix extends Matrix {
    protected elementToMobject(element: any, config?: Record<string, any>): Mobject;
}
export declare class IntegerMatrix extends Matrix {
    protected elementToMobject(element: any, config?: Record<string, any>): Mobject;
}
export declare class MobjectMatrix extends Matrix {
    protected elementToMobject(element: any): Mobject;
}
export declare function get_det_text(matrix: Matrix, determinant?: string | number, backgroundRectangle?: boolean, initialScaleFactor?: number): Group;
export declare function matrix_to_mobject(matrix: any[][], config?: MatrixConfig): Matrix;
//# sourceMappingURL=matrix.d.ts.map