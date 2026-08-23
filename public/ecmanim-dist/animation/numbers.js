// Animations that drive a DecimalNumber's displayed value. Mirrors
// manim.animation.numbers (ChangingDecimal / ChangeDecimalToValue). Each frame
// the eased alpha is turned into a number via a user function and pushed onto
// the decimal via setValue.
import { Animation } from "./Animation.js";
export class ChangingDecimal extends Animation {
    decimalMob;
    numberUpdateFunc;
    constructor(decimalMob, numberUpdateFunc, config = {}) {
        // manim suspends the decimal's own updaters while animating its value.
        super(decimalMob, { suspendMobjectUpdating: false, ...config });
        this.decimalMob = decimalMob;
        this.numberUpdateFunc = numberUpdateFunc;
    }
    interpolateMobject(alpha) {
        this.decimalMob.setValue(this.numberUpdateFunc(alpha));
    }
}
export class ChangeDecimalToValue extends ChangingDecimal {
    startValue;
    targetValue;
    constructor(decimalMob, targetValue, config = {}) {
        // Capture the start value at construction (matching manim, which reads
        // number_start_at at __init__ time).
        const startValue = decimalMob.getValue();
        super(decimalMob, (a) => startValue + (targetValue - startValue) * a, config);
        this.startValue = startValue;
        this.targetValue = targetValue;
    }
}
//# sourceMappingURL=numbers.js.map