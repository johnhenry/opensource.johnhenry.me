export interface CompiledExpr {
    (scope?: Record<string, number>): number;
}
/**
 * Compile an expression string into a fast evaluator.
 * @param src expression, e.g. "0.5 - 0.5*cos(t*2*pi)"
 * @param varNames variable names the expression may reference, e.g. ["t"] or ["u","v"]
 * @returns (scope) => number
 */
export declare function compileExpr(src: string, varNames?: string[]): CompiledExpr;
/** Convenience: parse + evaluate once (used mostly in tests). */
export declare function evalExpr(src: string, scope?: Record<string, number>, varNames?: string[]): number;
//# sourceMappingURL=expr.d.ts.map