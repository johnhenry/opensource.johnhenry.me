// Variable: a labeled, live-updating number bound to a ValueTracker. Mirrors
// manim.mobject.text.numbers.Variable. Layout is  <label> = <number> arranged
// horizontally; the number is a DecimalNumber (or Integer) whose value follows
// `this.tracker` via an updater.
import { VGroup } from "../VMobject.js";
import { Text } from "./Text.js";
import { DecimalNumber, ValueTracker } from "../value_tracker.js";
import * as V from "../../core/math/vector.js";
export class Variable extends VGroup {
    tracker;
    label;
    value;
    _equals;
    constructor(value = 0, label = "x", config = {}) {
        super();
        this.tracker = new ValueTracker(value);
        const VarType = config.varType ?? DecimalNumber;
        const numDecimalPlaces = config.numDecimalPlaces ?? 2;
        // The label may be passed as a string or a prebuilt mobject.
        this.label = typeof label === "string" || typeof label === "number"
            ? new Text(String(label))
            : label;
        this._equals = new Text("=");
        const numConfig = { ...config, numDecimalPlaces };
        delete numConfig.varType;
        this.value = new VarType(value, numConfig);
        this.add(this.label, this._equals, this.value);
        this.arrange(V.RIGHT, 0.25);
        // Keep the displayed number in sync with the tracker every frame.
        this.value.addUpdater(() => {
            this.value.setValue(this.tracker.getValue());
        });
    }
    getValue() {
        return this.tracker.getValue();
    }
}
//# sourceMappingURL=variable.js.map