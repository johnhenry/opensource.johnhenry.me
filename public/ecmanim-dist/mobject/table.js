// Table mobjects: a grid of entry mobjects with horizontal and vertical grid
// lines between cells, plus optional row/column labels. Ported from
// ManimCommunity's manim/mobject/table.py.
import { VMobject, VGroup } from "./VMobject.js";
import { Mobject, Group } from "./Mobject.js";
import { Text } from "./text/Text.js";
import { MathTex } from "./mathtex.js";
import { DecimalNumber, Integer } from "./value_tracker.js";
import { Line, Polygon } from "./geometry.js";
const DEFAULT_V_BUFF = 0.8;
const DEFAULT_H_BUFF = 1.3;
function defaultElementToMobject(element, config = {}) {
    if (element instanceof Mobject)
        return element;
    return new Text(String(element), config);
}
export class Table extends VGroup {
    mob_table;
    elements;
    row_labels;
    col_labels;
    top_left_entry;
    v_buff;
    h_buff;
    include_outer_lines;
    line_config;
    horizontal_lines;
    vertical_lines;
    _entriesGroup;
    _nRows;
    _nCols;
    constructor(table, config = {}) {
        super();
        this.v_buff = config.v_buff ?? DEFAULT_V_BUFF;
        this.h_buff = config.h_buff ?? DEFAULT_H_BUFF;
        this.include_outer_lines = config.include_outer_lines ?? false;
        this.line_config = config.line_config ?? {};
        const toMob = config.element_to_mobject ?? this.elementToMobject.bind(this);
        const elemConfig = config.element_to_mobject_config ?? {};
        // Assemble the full grid of raw values, prepending labels where given.
        const rawRows = table.map((r) => [...r]);
        // Row labels prepend a leading column; col labels prepend a leading row.
        this.row_labels = config.row_labels
            ? config.row_labels.map((l) => (l instanceof Mobject ? l : toMob(l, elemConfig)))
            : null;
        this.col_labels = config.col_labels
            ? config.col_labels.map((l) => (l instanceof Mobject ? l : toMob(l, elemConfig)))
            : null;
        this.top_left_entry = null;
        // Build the mobject grid.
        const mobRows = rawRows.map((row) => row.map((cell) => toMob(cell, elemConfig)));
        // Prepend a column of row labels.
        if (this.row_labels) {
            for (let i = 0; i < mobRows.length; i++) {
                const label = this.row_labels[i] ?? new Text("");
                mobRows[i] = [label, ...mobRows[i]];
            }
        }
        // Prepend a row of column labels (with an optional top-left corner entry).
        if (this.col_labels) {
            const headerRow = [...this.col_labels];
            if (this.row_labels) {
                const tl = config.top_left_entry !== undefined
                    ? (config.top_left_entry instanceof Mobject
                        ? config.top_left_entry
                        : toMob(config.top_left_entry, elemConfig))
                    : new Text("");
                this.top_left_entry = config.top_left_entry !== undefined ? tl : null;
                headerRow.unshift(tl);
            }
            mobRows.unshift(headerRow);
        }
        this.mob_table = mobRows;
        this._nRows = mobRows.length;
        this._nCols = mobRows.length > 0 ? mobRows[0].length : 0;
        // Flatten and arrange into a grid.
        this.elements = [];
        for (const row of mobRows)
            for (const m of row)
                this.elements.push(m);
        const entriesGroup = new VGroup(...this.elements);
        if (this.elements.length > 0) {
            entriesGroup.arrangeInGrid({
                rows: this._nRows,
                cols: this._nCols,
                buff: [this.h_buff, this.v_buff],
            });
        }
        this._entriesGroup = entriesGroup;
        this.add(entriesGroup);
        // Build the grid lines.
        this.horizontal_lines = new VGroup();
        this.vertical_lines = new VGroup();
        this.addGridLines();
        this.center();
    }
    // Subclasses override this to choose the entry mobject type.
    elementToMobject(element, config = {}) {
        return defaultElementToMobject(element, config);
    }
    // Build horizontal and vertical Line mobjects separating the cells.
    addGridLines() {
        const bbox = this._entriesGroup.getBoundingBox();
        const [minX, minY] = bbox.min;
        const [maxX, maxY] = bbox.max;
        const padX = this.h_buff / 2;
        const padY = this.v_buff / 2;
        const left = minX - padX;
        const right = maxX + padX;
        const top = maxY + padY;
        const bottom = minY - padY;
        // Compute the y-coordinate boundaries between rows and x between columns
        // using the cell centers of the first column / first row.
        const rowCenters = [];
        for (let i = 0; i < this._nRows; i++) {
            rowCenters.push(this.mob_table[i][0].getCenter()[1]);
        }
        const colCenters = [];
        for (let j = 0; j < this._nCols; j++) {
            colCenters.push(this.mob_table[0][j].getCenter()[0]);
        }
        const startI = this.include_outer_lines ? 0 : 1;
        const endI = this.include_outer_lines ? this._nRows : this._nRows - 1;
        // Horizontal lines between adjacent rows (and optionally the outer edges).
        for (let i = startI; i <= endI; i++) {
            let y;
            if (i === 0)
                y = top;
            else if (i === this._nRows)
                y = bottom;
            else
                y = (rowCenters[i - 1] + rowCenters[i]) / 2;
            this.horizontal_lines.add(new Line([left, y, 0], [right, y, 0], this.line_config));
        }
        // Vertical lines between adjacent columns (and optionally the outer edges).
        for (let j = startI; j <= endI && j <= this._nCols; j++) {
            if (j > this._nCols)
                break;
            let x;
            if (j === 0)
                x = left;
            else if (j === this._nCols)
                x = right;
            else
                x = (colCenters[j - 1] + colCenters[j]) / 2;
            this.vertical_lines.add(new Line([x, top, 0], [x, bottom, 0], this.line_config));
        }
        this.add(this.horizontal_lines, this.vertical_lines);
        return this;
    }
    // --- accessors ----------------------------------------------------------
    getRows() {
        const rows = new VGroup();
        for (const row of this.mob_table)
            rows.add(new VGroup(...row));
        return rows;
    }
    getColumns() {
        const cols = new VGroup();
        for (let j = 0; j < this._nCols; j++) {
            const colMobs = [];
            for (let i = 0; i < this._nRows; i++)
                colMobs.push(this.mob_table[i][j]);
            cols.add(new VGroup(...colMobs));
        }
        return cols;
    }
    // Flat VGroup of all entries (excludes labels only if you slice; here all).
    getEntries() {
        return new VGroup(...this.elements);
    }
    getHorizontalLines() {
        return this.horizontal_lines;
    }
    getVerticalLines() {
        return this.vertical_lines;
    }
    // 1-indexed cell access matching manim's get_cell / get_entries semantics.
    getCellByIndices(pos) {
        const [i, j] = pos;
        return this.mob_table[i - 1][j - 1];
    }
    getRowLabels() {
        return new VGroup(...(this.row_labels ?? []));
    }
    getColLabels() {
        return new VGroup(...(this.col_labels ?? []));
    }
    // A Polygon outlining a cell (1-indexed), used for highlighting.
    getCell(pos, buff = 0) {
        const [i, j] = pos;
        const mob = this.mob_table[i - 1][j - 1];
        const bbox = mob.getBoundingBox();
        const hb = this.h_buff / 2 - buff;
        const vb = this.v_buff / 2 - buff;
        const corners = [
            [bbox.min[0] - hb, bbox.max[1] + vb, 0],
            [bbox.max[0] + hb, bbox.max[1] + vb, 0],
            [bbox.max[0] + hb, bbox.min[1] - vb, 0],
            [bbox.min[0] - hb, bbox.min[1] - vb, 0],
        ];
        return new Polygon(corners);
    }
    // Add a filled highlight polygon behind a given cell.
    addHighlightedCell(pos, color = "#FFFF00", opacity = 0.5) {
        const cell = this.getCell(pos);
        cell.setFill(color, opacity);
        cell.setStroke(color, 0, 0);
        this.addToBack(cell);
        return cell;
    }
}
// Entries rendered as MathTex.
export class MathTable extends Table {
    elementToMobject(element, config = {}) {
        if (element instanceof Mobject)
            return element;
        return new MathTex(String(element), config);
    }
}
// Entries rendered as Integer.
export class IntegerTable extends Table {
    elementToMobject(element, config = {}) {
        if (element instanceof Mobject)
            return element;
        return new Integer(Number(element), config);
    }
}
// Entries rendered as DecimalNumber.
export class DecimalTable extends Table {
    elementToMobject(element, config = {}) {
        if (element instanceof Mobject)
            return element;
        return new DecimalNumber(Number(element), config);
    }
}
// Entries assumed to already be mobjects.
export class MobjectTable extends Table {
    elementToMobject(element) {
        if (element instanceof Mobject)
            return element;
        throw new Error("MobjectTable expects each entry to already be a Mobject.");
    }
}
void Group;
void VMobject;
//# sourceMappingURL=table.js.map