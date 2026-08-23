// Schema → editor controls: turn a defineSchema() spec (see core/schema.ts) into
// UI control descriptors a props panel can render. This is the data half of the
// Studio's schema-driven props editor (framework-agnostic; render however you like).
const CONTROL_FOR = {
    string: "text", number: "number", boolean: "checkbox", color: "color", enum: "select",
};
/** Convert a schema (or its `.spec`) into an ordered list of control descriptors. */
export function schemaToControls(schema) {
    const spec = schema?.spec ?? schema ?? {};
    return Object.keys(spec).map((name) => {
        const f = spec[name] ?? {};
        return {
            name,
            control: CONTROL_FOR[f.type] ?? "text",
            label: name,
            default: f.default,
            min: f.min,
            max: f.max,
            options: f.values,
            description: f.description,
        };
    });
}
//# sourceMappingURL=props.js.map