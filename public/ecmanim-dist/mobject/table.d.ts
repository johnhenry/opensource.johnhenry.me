import { VGroup } from "./VMobject.ts";
import { Mobject } from "./Mobject.ts";
import { Polygon } from "./geometry.ts";
/** Configuration for the Table family of mobjects. */
export interface TableConfig {
    row_labels?: any[];
    col_labels?: any[];
    top_left_entry?: any;
    v_buff?: number;
    h_buff?: number;
    include_outer_lines?: boolean;
    add_background_rectangles_to_entries?: boolean;
    include_background_rectangle?: boolean;
    line_config?: Record<string, any>;
    element_to_mobject?: (element: any) => Mobject;
    element_to_mobject_config?: Record<string, any>;
    arrange_in_grid_config?: Record<string, any>;
    [key: string]: any;
}
export declare class Table extends VGroup {
    mob_table: Mobject[][];
    elements: Mobject[];
    row_labels: Mobject[] | null;
    col_labels: Mobject[] | null;
    top_left_entry: Mobject | null;
    v_buff: number;
    h_buff: number;
    include_outer_lines: boolean;
    line_config: Record<string, any>;
    horizontal_lines: VGroup;
    vertical_lines: VGroup;
    private _entriesGroup;
    private _nRows;
    private _nCols;
    constructor(table: any[][], config?: TableConfig);
    protected elementToMobject(element: any, config?: Record<string, any>): Mobject;
    addGridLines(): this;
    getRows(): VGroup;
    getColumns(): VGroup;
    getEntries(): VGroup;
    getHorizontalLines(): VGroup;
    getVerticalLines(): VGroup;
    getCellByIndices(pos: [number, number]): Mobject;
    getRowLabels(): VGroup;
    getColLabels(): VGroup;
    getCell(pos: [number, number], buff?: number): Polygon;
    addHighlightedCell(pos: [number, number], color?: any, opacity?: number): Polygon;
}
export declare class MathTable extends Table {
    protected elementToMobject(element: any, config?: Record<string, any>): Mobject;
}
export declare class IntegerTable extends Table {
    protected elementToMobject(element: any, config?: Record<string, any>): Mobject;
}
export declare class DecimalTable extends Table {
    protected elementToMobject(element: any, config?: Record<string, any>): Mobject;
}
export declare class MobjectTable extends Table {
    protected elementToMobject(element: any): Mobject;
}
//# sourceMappingURL=table.d.ts.map