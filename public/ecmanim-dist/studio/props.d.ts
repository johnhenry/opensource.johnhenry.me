export interface PropControl {
    name: string;
    control: "text" | "number" | "checkbox" | "color" | "select";
    label: string;
    default?: any;
    min?: number;
    max?: number;
    options?: string[];
    description?: string;
}
/** Convert a schema (or its `.spec`) into an ordered list of control descriptors. */
export declare function schemaToControls(schema: any): PropControl[];
//# sourceMappingURL=props.d.ts.map