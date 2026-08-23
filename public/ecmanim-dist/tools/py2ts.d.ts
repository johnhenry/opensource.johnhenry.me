export interface Py2TsOptions {
    /** Import specifier for the ecmanim package (default "ecmanim"). */
    importFrom?: string;
    /** If true, emit a single `import * as mn from ...` wildcard instead of a
     *  named import of detected identifiers. Default false. */
    wildcardImport?: boolean;
    /** Indent unit for emitted TS (default two spaces). */
    indent?: string;
}
export declare function convert(pythonSource: string, opts?: Py2TsOptions): string;
//# sourceMappingURL=py2ts.d.ts.map