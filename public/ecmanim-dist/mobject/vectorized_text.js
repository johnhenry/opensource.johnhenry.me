// Vectorized text: real glyph OUTLINES as cubic-Bezier VMobjects (via
// opentype.js), so Write traces the letterforms and Transform morphs them into
// other shapes — unlike the raster canvas Text. Each glyph becomes a VMobject
// submobject of a VGroup.
//
// Node: a system font is auto-resolved via fontconfig. Browser: preload a font
// with `await setDefaultFont(urlOrArrayBuffer)` (or pass config.font as an
// opentype Font).
// opentype.js is imported lazily (only when parsing a font) so that importing
// this module — and thus the whole library — never requires a bare "opentype.js"
// specifier to resolve in an unbundled browser. Font *usage* (charToGlyph etc.)
// is all methods on an already-parsed Font object, needing no module reference.
import { VGroup } from "./VMobject.js";
import { Color } from "../core/color.js";
import { buildGlyphRun, UNITS_PER_WORLD } from "./text_shaping.js";
let _defaultFont = null;
let _nodeAutoLoader = null;
let _nodeAutoLoadAttempted = false;
export function registerNodeFontAutoLoader(fn) {
    _nodeAutoLoader = fn;
}
export function getDefaultFont() {
    if (_defaultFont == null && !_nodeAutoLoadAttempted && _nodeAutoLoader) {
        _nodeAutoLoadAttempted = true;
        try {
            _nodeAutoLoader(); // sets _defaultFont itself via setDefaultFontSync()
        }
        catch {
            // No system font available -- callers fall back to the raster/estimate path.
        }
    }
    return _defaultFont;
}
// Preload a font for the browser (or override the default in Node).
//   await setDefaultFont("/fonts/Inter.ttf")
export async function setDefaultFont(source) {
    if (typeof source === "string") {
        const opentype = (await import("opentype.js")).default;
        const buf = await fetch(source).then((r) => r.arrayBuffer());
        _defaultFont = opentype.parse(buf);
        // Stash the raw bytes for the optional HarfBuzz shaping backend (see
        // fonts-node.ts's loadVectorFontSync for the Node-side equivalent).
        _defaultFont._rawFontBytes = buf;
    }
    else if (source instanceof ArrayBuffer) {
        const opentype = (await import("opentype.js")).default;
        _defaultFont = opentype.parse(source);
        _defaultFont._rawFontBytes = source;
    }
    else {
        _defaultFont = source; // already a parsed opentype.Font -- no raw bytes available
    }
    return _defaultFont;
}
export function setDefaultFontSync(font) {
    _defaultFont = font;
    return font;
}
export class VText extends VGroup {
    text;
    fontSize;
    constructor(text = "", config = {}) {
        super();
        this.text = String(text);
        this.fontSize = config.fontSize ?? 0.7; // world cap-height-ish
        const font = config.font ?? _defaultFont;
        if (!font) {
            throw new Error("VText needs a font. In the browser call `await setDefaultFont(url)` first; " +
                "in Node a system font is auto-loaded via fontconfig (is one installed?).");
        }
        this.fillColor = Color.parse(config.color ?? config.fillColor ?? "#FFFFFF");
        this.strokeColor = Color.parse(config.strokeColor ?? config.color ?? "#FFFFFF");
        this._buildGlyphs(font, config);
        this.setStyle({
            fillColor: this.fillColor,
            fillOpacity: config.fillOpacity ?? 1,
            strokeColor: this.strokeColor,
            strokeWidth: config.strokeWidth ?? 0,
            strokeOpacity: config.strokeOpacity ?? (config.strokeWidth ? 1 : 0),
        });
        if (config.point)
            this.moveTo(config.point);
        else
            this.center();
    }
    _buildGlyphs(font, config) {
        const px = UNITS_PER_WORLD;
        const scaleToWorld = this.fontSize / px * 1.4; // approx cap-height mapping
        // Iterate by grapheme cluster with charToGlyph per code point (avoids GSUB
        // shaping, which opentype.js does not fully support for some fonts). One
        // VMobject per cluster (base glyph + any combining marks merged together).
        const { entries } = buildGlyphRun(this.text, { font, px, scaleToWorld });
        for (const entry of entries) {
            const mob = entry.mob;
            mob.fillColor = Color.parse(this.fillColor);
            mob.strokeColor = Color.parse(this.strokeColor);
            mob.fillOpacity = config.fillOpacity ?? 1;
            mob.strokeWidth = config.strokeWidth ?? 0;
            mob.strokeOpacity = config.strokeOpacity ?? (config.strokeWidth ? 1 : 0);
            if (mob.points.length)
                this.add(mob);
        }
    }
    setStyle(style) {
        for (const g of this.submobjects)
            g.setStyle(style);
        return this;
    }
}
export function setStyle() { }
//# sourceMappingURL=vectorized_text.js.map