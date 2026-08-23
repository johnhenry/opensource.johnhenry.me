export type FieldType = "string" | "number" | "boolean" | "color" | "enum";
export interface FieldSpec {
    type: FieldType;
    default?: any;
    optional?: boolean;
    min?: number;
    max?: number;
    values?: string[];
    description?: string;
}
export type SchemaSpec = Record<string, FieldSpec>;
export interface Schema<T = Record<string, any>> {
    spec: SchemaSpec;
    /** Validate + fill defaults. Throws an Error on the first problem found. */
    parse(input: Record<string, any>): T;
    /** Non-throwing variant of `parse`. */
    safeParse(input: Record<string, any>): {
        ok: true;
        value: T;
    } | {
        ok: false;
        error: string;
    };
}
/**
 * Define a runtime schema from a spec.
 *
 * @example
 *   const S = defineSchema({
 *     title: { type: "string", default: "Hello" },
 *     count: { type: "number", min: 0, max: 100, default: 1 },
 *     mode:  { type: "enum", values: ["fast", "slow"], default: "fast" },
 *   });
 *   S.parse({ count: 3 }); // => { title: "Hello", count: 3, mode: "fast" }
 */
export declare function defineSchema<T = Record<string, any>>(spec: SchemaSpec): Schema<T>;
//# sourceMappingURL=schema.d.ts.map