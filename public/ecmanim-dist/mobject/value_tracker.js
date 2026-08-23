// ValueTracker holds an animatable scalar (stored as a point so the standard
// interpolate machinery tweens it). DecimalNumber/Integer render a live number.
import { Mobject } from "./Mobject.js";
import { RasterText } from "./text/Text.js";
import { copyMemberwiseStyle } from "./copy_style.js";
export class ValueTracker extends Mobject {
    constructor(value = 0) {
        super();
        this.points = [[value, 0, 0]];
    }
    getValue() {
        return this.points[0][0];
    }
    setValue(v) {
        this.points[0][0] = v;
        return this;
    }
    increment(dv) {
        this.points[0][0] += dv;
        return this;
    }
    /** manim parity alias (increment_value). */
    incrementValue(dv) {
        return this.increment(dv);
    }
    interpolate(start, target, alpha) {
        const a = start.points[0][0];
        const b = target.points[0][0];
        this.points[0][0] = a + (b - a) * alpha;
        return this;
    }
}
export class DecimalNumber extends RasterText {
    numDecimalPlaces;
    unit;
    includeSign;
    groupWithCommas;
    showEllipsis;
    edgeToFix;
    value;
    constructor(value = 0, config = {}) {
        const numDecimalPlaces = config.numDecimalPlaces ?? 2;
        const cfg = { ...config };
        // Temporarily construct with a placeholder; _format needs the fields below.
        super("0", cfg);
        this.numDecimalPlaces = numDecimalPlaces;
        this.unit = config.unit ?? "";
        this.includeSign = config.includeSign ?? false;
        this.groupWithCommas = config.groupWithCommas ?? true; // manim default
        this.showEllipsis = config.showEllipsis ?? false;
        // Which edge stays pinned as the value's width changes (manim default LEFT).
        this.edgeToFix = config.edgeToFix ?? [-1, 0, 0];
        this.value = value;
        this.text = this._format(value);
        this._buildBox();
        const at = config.point ?? config.at;
        if (at)
            this.moveTo(at);
    }
    _format(value) {
        const neg = value < 0;
        let s = Math.abs(value).toFixed(this.numDecimalPlaces);
        if (this.groupWithCommas) {
            const parts = s.split(".");
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            s = parts.join(".");
        }
        const sign = neg ? "-" : this.includeSign ? "+" : "";
        return sign + s + (this.showEllipsis ? "…" : "") + this.unit;
    }
    getValue() {
        return this.value;
    }
    incrementValue(delta = 1) {
        return this.setValue(this.value + delta);
    }
    setValue(value) {
        this.value = value;
        // Pin the configured edge so a changing width doesn't shift the number.
        const anchor = this.getBoundaryPoint(this.edgeToFix);
        this.text = this._format(value);
        this._buildBox();
        this.moveTo(anchor, this.edgeToFix);
        return this;
    }
}
export class Integer extends DecimalNumber {
    constructor(value = 0, config = {}) {
        super(Math.round(value), { ...config, numDecimalPlaces: 0 });
    }
    setValue(value) {
        return super.setValue(Math.round(value));
    }
}
// A mobject whose geometry is rebuilt every frame by `fn` (manim's
// always_redraw). Returns a wrapper mobject carrying an updater.
export function alwaysRedraw(fn) {
    const current = fn();
    current.addUpdater((mob) => {
        const fresh = fn();
        mob.points = fresh.points;
        mob.submobjects = fresh.submobjects;
        // Copy every style field (not a hardcoded allowlist) so custom fields on
        // a user's Mobject subclass redraw correctly too.
        copyMemberwiseStyle(mob, fresh);
    });
    return current;
}
//# sourceMappingURL=value_tracker.js.map