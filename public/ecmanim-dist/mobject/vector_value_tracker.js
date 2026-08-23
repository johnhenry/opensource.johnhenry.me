// VectorDecimalNumber: a live number rendered as crisp vector glyph OUTLINES
// (one VMobject per character), so it scales cleanly and exports to SVG — unlike
// the raster-backed DecimalNumber. Reuses the VText/opentype glyph pipeline and
// mirrors DecimalNumber's formatting + edge-fix-on-change behavior.
import { VMobject, VGroup } from "./VMobject.js";
import { Color } from "../core/color.js";
import { parsePathToSubpaths, subpathsToVMobject } from "./svg_path.js";
import { getDefaultFont } from "./vectorized_text.js";
const UNITS_PER_WORLD = 100; // matches VText: render glyph paths at this px, then scale to world
export class VectorDecimalNumber extends VGroup {
    value;
    numDecimalPlaces;
    unit;
    includeSign;
    groupWithCommas;
    showEllipsis;
    fontSize;
    edgeToFix;
    _font;
    _cfg;
    constructor(value = 0, config = {}) {
        super();
        this.value = value;
        this.numDecimalPlaces = config.numDecimalPlaces ?? 2;
        this.unit = config.unit ?? "";
        this.includeSign = config.includeSign ?? false;
        this.groupWithCommas = config.groupWithCommas ?? true;
        this.showEllipsis = config.showEllipsis ?? false;
        this.fontSize = config.fontSize ?? 0.7;
        this.edgeToFix = config.edgeToFix ?? [-1, 0, 0];
        this._cfg = config;
        this._font = config.font ?? getDefaultFont();
        this.fillColor = Color.parse(config.color ?? config.fillColor ?? "#FFFFFF");
        this.strokeColor = Color.parse(config.strokeColor ?? config.color ?? "#FFFFFF");
        this._layout(this._format(value));
        if (config.point)
            this.moveTo(config.point);
    }
    /** Mirror DecimalNumber._format. */
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
    // Build one glyph VMobject per character and arrange left→right (reuses the
    // VText glyph pipeline: charToGlyph → path → parsePathToSubpaths → VMobject).
    _layout(text) {
        this.submobjects = [];
        const font = this._font;
        if (!font) {
            throw new Error("VectorDecimalNumber needs a font. In Node call loadVectorFont() first; " +
                "in the browser `await setDefaultFont(url)` (or pass config.font).");
        }
        const cfg = this._cfg;
        const px = UNITS_PER_WORLD;
        const scaleToWorld = (this.fontSize / px) * 1.4;
        const scaleFactor = px / font.unitsPerEm;
        let x = 0;
        for (const ch of Array.from(text)) {
            const glyph = font.charToGlyph(ch);
            const gp = glyph.getPath(x, 0, px); // y-down, baseline at 0
            const d = gp.toPathData(3);
            const mob = new VMobject();
            if (d && d.length) {
                const subs = parsePathToSubpaths(d);
                subpathsToVMobject(mob, subs, { scale: scaleToWorld, translate: [0, 0, 0], flipY: true });
            }
            mob.fillColor = Color.parse(this.fillColor);
            mob.strokeColor = Color.parse(this.strokeColor);
            mob.fillOpacity = cfg.fillOpacity ?? 1;
            mob.strokeWidth = cfg.strokeWidth ?? 0;
            mob.strokeOpacity = cfg.strokeOpacity ?? (cfg.strokeWidth ? 1 : 0);
            if (mob.points.length)
                this.add(mob);
            x += (glyph.advanceWidth ?? font.unitsPerEm * 0.5) * scaleFactor;
        }
    }
    getValue() {
        return this.value;
    }
    incrementValue(delta = 1) {
        return this.setValue(this.value + delta);
    }
    /** Update the displayed number, keeping `edgeToFix` pinned across width changes. */
    setValue(value) {
        // Anchor the configured edge before rebuilding (empty group -> origin).
        const anchor = this.submobjects.length ? this.getBoundaryPoint(this.edgeToFix) : [0, 0, 0];
        this.value = value;
        this._layout(this._format(value));
        if (this.submobjects.length)
            this.moveTo(anchor, this.edgeToFix);
        return this;
    }
}
export function vectorDecimalNumber(value = 0, config = {}) {
    return new VectorDecimalNumber(value, config);
}
//# sourceMappingURL=vector_value_tracker.js.map