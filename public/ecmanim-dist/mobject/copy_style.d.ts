/**
 * Copy every enumerable own property from `src` to `dest` except identity/
 * structural fields (see BASE_EXCLUDE) and any caller-supplied `extraExclude`.
 * Used by Mobject.become(), alwaysRedraw(), and reactive()'s rebuild step so
 * all three redraw a mobject's custom style fields identically.
 */
export declare function copyMemberwiseStyle(dest: any, src: any, extraExclude?: string[]): void;
//# sourceMappingURL=copy_style.d.ts.map