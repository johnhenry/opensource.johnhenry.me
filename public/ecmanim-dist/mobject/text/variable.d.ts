import { VGroup } from "../VMobject.ts";
import { DecimalNumber, ValueTracker } from "../value_tracker.ts";
import type { DecimalNumberConfig } from "../value_tracker.ts";
export interface VariableConfig extends DecimalNumberConfig {
    varType?: any;
    numDecimalPlaces?: number;
}
export declare class Variable extends VGroup {
    tracker: ValueTracker;
    label: any;
    value: DecimalNumber;
    private _equals;
    constructor(value?: number, label?: any, config?: VariableConfig);
    getValue(): number;
}
//# sourceMappingURL=variable.d.ts.map