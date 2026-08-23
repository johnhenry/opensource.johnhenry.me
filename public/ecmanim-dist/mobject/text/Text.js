// Text: a proper vector mobject, mirroring ManimCommunity's
// manim/mobject/text/text_mobject.py (Text / MarkupText). Each glyph becomes a
// VMobject outline (via the VText glyph pipeline) and lives as a submobject, so
// Write traces the letterforms and Transform morphs them. Per-glyph `.chars`
// gives manim-style indexing and substring selection (getPartByText), and
// t2c/t2w/t2s/t2g/gradient recolour / restyle substrings.
//
// FALLBACK: when no vector font is available (e.g. the browser before
// setDefaultFont, or Node without any installed font), Text degrades to the
// legacy raster canvas behaviour (`_isText` + a bounding box the renderer's
// drawText special-cases). This keeps the browser demos and font-less Node
// working. The raster class is still exported as RasterText and is what
// DecimalNumber builds on.
import { Mobject } from "../Mobject.js";
import { VGroup } from "../VMobject.js";
import { Color } from "../../core/color.js";
import * as V from "../../core/math/vector.js";
import { getDefaultFont } from "../vectorized_text.js";
import { buildGlyphRun, measureGlyphRunWidth, UNITS_PER_WORLD } from "../text_shaping.js";
// Rough per-character width factor for layout estimation without a context.
export const CHAR_ASPECT = 0.55;
// Greedy word-wrap: split `text` on explicit "\n" first (hard paragraph
// breaks, preserved), then wrap each paragraph independently so no measured
// line exceeds `width`, using the caller-supplied `measure` function (real
// glyph-advance measurement when a vector font is available, or a
// CHAR_ASPECT-based estimate otherwise -- see call sites). A single word
// wider than `width` on its own still gets an unbroken line (no
// hyphenation). Runs of spaces within a paragraph are normalized to a single
// space; this is a simple greedy wrap, not full UAX#14 line-breaking.
function wrapPlainText(text, width, measure) {
    const paragraphs = text.split("\n");
    const wrappedParagraphs = paragraphs.map((para) => {
        const words = para.split(/ +/);
        const outLines = [];
        let current = "";
        for (const word of words) {
            if (word === "" && current === "")
                continue; // collapse leading/duplicate spaces
            const candidate = current ? `${current} ${word}` : word;
            if (current && measure(candidate) > width) {
                outLines.push(current);
                current = word;
            }
            else {
                current = candidate;
            }
        }
        if (current || outLines.length === 0)
            outLines.push(current);
        return outLines.join("\n");
    });
    return wrappedParagraphs.join("\n");
}
/**
 * manim parity helper: convert a manim `font_size` (points; manim's default
 * Text size is 48) to ecmanim world units (default Text fontSize 0.7). So
 * `fontSizePt(48) === 0.7`, and a port of `Text("hi", font_size=96)` is
 * `new Text("hi", { fontSize: fontSizePt(96) })`.
 */
export function fontSizePt(points) {
    return points * (0.7 / 48);
}
/**
 * Estimate a text block's rendered width/height without constructing a
 * mobject — the same formula `RasterText`/`Text` use internally to size
 * themselves before real glyph layout is available. A fast approximation,
 * not a guarantee: for anything close to a layout boundary, prefer measuring
 * a real, constructed mobject's `.getWidth()`/`.getHeight()` instead.
 *
 * Node caveat: `Text`/`getWidth()` only use this raster estimate until a
 * vector font has been loaded in the process (which `render()` does
 * automatically before running your scene's `construct()`). If you measure
 * a `Text` mobject constructed *outside* of `construct()` — e.g. in a
 * layout-planning step that runs before `render()` — call `loadVectorFont()`
 * (from `ecmanim/node`) once first, or the measurement can disagree with
 * what the same string renders as by ~10% (see issue #14).
 */
export function estimateTextSize(text, fontSize, opts = {}) {
    const lineHeight = opts.lineHeight ?? 1.2;
    const source = opts.width != null
        ? wrapPlainText(text, opts.width, (line) => line.length * fontSize * CHAR_ASPECT)
        : text;
    const lines = source.split("\n");
    const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
    return {
        width: longest * fontSize * CHAR_ASPECT,
        height: lines.length * fontSize * lineHeight,
    };
}
// ---------------------------------------------------------------------------
// RasterText — the original canvas-2D text (kept verbatim in behaviour).
// ---------------------------------------------------------------------------
export class RasterText extends Mobject {
    _isText;
    text;
    fontSize;
    font;
    weight;
    slant;
    align;
    fillColor;
    fillOpacity;
    strokeOpacity;
    revealFraction;
    numLines; // set by _layout() in the constructor
    constructor(text = "", config = {}) {
        super(config);
        this._isText = true;
        this.text = String(text);
        // World-space cap height of one line.
        this.fontSize = config.fontSize ?? 0.7;
        this.font = (typeof config.font === "string" ? config.font : undefined) ?? "sans-serif";
        this.weight = config.weight ?? "normal";
        this.slant = config.slant ?? "normal"; // normal | italic
        this.align = config.align ?? "center"; // left | center | right
        this.fillColor = Color.parse(config.color ?? config.fillColor ?? "#FFFFFF");
        this.fillOpacity = config.fillOpacity ?? 1;
        this.strokeOpacity = 0;
        this.opacity = config.opacity ?? 1;
        this.revealFraction = 1; // typewriter reveal for Write/Create
        this._buildBox();
        const at = config.point ?? config.at;
        if (at)
            this.moveTo(at);
    }
    _buildBox() {
        const { width: w, height: h } = estimateTextSize(this.text, this.fontSize);
        // Four corners (TL, TR, BR, BL) centered on origin — transforms act on these.
        this.points = [
            [-w / 2, h / 2, 0],
            [w / 2, h / 2, 0],
            [w / 2, -h / 2, 0],
            [-w / 2, -h / 2, 0],
        ];
        this.numLines = this.text.split("\n").length;
    }
    setColor(color) {
        this.fillColor = Color.parse(color);
        this._color = Color.parse(color);
        return this;
    }
    setOpacity(o) {
        this.fillOpacity = o;
        this.opacity = o;
        return this;
    }
    // The world-space font height after any scaling applied to the box.
    currentFontHeight() {
        return (this.getHeight() / Math.max(1, this.numLines)) / 1.2;
    }
    interpolate(start, target, alpha) {
        const n = Math.min(this.points.length, start.points.length, target.points.length);
        for (let i = 0; i < n; i++)
            this.points[i] = V.lerp(start.points[i], target.points[i], alpha);
        this.fillColor = Color.lerp(start.fillColor, target.fillColor, alpha);
        this.fillOpacity = start.fillOpacity + (target.fillOpacity - start.fillOpacity) * alpha;
        this.opacity = start.opacity + (target.opacity - start.opacity) * alpha;
        return this;
    }
    copy() {
        const c = super.copy();
        c.fillColor = Color.parse(this.fillColor);
        return c;
    }
}
// ---------------------------------------------------------------------------
// Text — the vector class. Extends VGroup; each glyph is a VMobject submobject.
// Falls back to raster behaviour when no font is loaded.
// ---------------------------------------------------------------------------
export class Text extends VGroup {
    // Common (both modes)
    text;
    fontSize;
    fontFamily;
    weight;
    slant;
    align;
    lineSpacing;
    /** See {@link TextConfig.disableLigatures}. */
    disableLigatures;
    /** Vector mode only: first-line baseline Y relative to the mobject center
     *  AT CONSTRUCTION (world units; not maintained through later scaling).
     *  Lets token-row layouts align mixed-height tokens on a real baseline. */
    baselineOffset;
    // Vector-mode data. `chars` is a VGroup of the per-glyph VMobjects (manim's
    // .chars). `_charSource` maps each glyph mob index -> source string index in
    // the original (newline-stripped) text, for substring selection.
    chars;
    _charSource;
    _plainText; // text with newlines removed (glyph stream order)
    // Raster-mode fields (only meaningful when _isText is true).
    _isText;
    revealFraction;
    numLines;
    _rasterFontSize;
    _rasterFont;
    constructor(text = "", config = {}) {
        super();
        this.text = String(text);
        this.fontSize = config.fontSize ?? 0.7;
        this.fontFamily = typeof config.font === "string" ? config.font : "sans-serif";
        this.weight = config.weight ?? "normal";
        this.slant = config.slant ?? "normal";
        this.align = config.align ?? "center";
        this.lineSpacing = config.lineSpacing ?? 1.2;
        this.disableLigatures = config.disableLigatures ?? false;
        this.fillColor = Color.parse(config.color ?? config.fillColor ?? "#FFFFFF");
        this.strokeColor = Color.parse(config.strokeColor ?? config.color ?? config.fillColor ?? "#FFFFFF");
        this.fillOpacity = config.fillOpacity ?? 1;
        this.strokeOpacity = config.strokeOpacity ?? (config.strokeWidth ? 1 : 0);
        this.strokeWidth = config.strokeWidth ?? 0;
        this.opacity = config.opacity ?? 1;
        const font = config.font && typeof config.font !== "string" ? config.font : getDefaultFont();
        if (config.width != null) {
            // Real glyph-advance measurement when a vector font is available (so
            // wrap decisions match what will actually render), else the same
            // CHAR_ASPECT estimate the raster fallback itself uses. Deliberately
            // uses the safe per-cluster measureGlyphRunWidth(), not
            // font.getAdvanceWidth() -- the latter routes through opentype.js's
            // whole-string shaping pipeline, which throws on lookup types some
            // fonts (incl. this project's default dev/CI font) use.
            const px = UNITS_PER_WORLD;
            const scaleToWorld = (this.fontSize / px) * 1.4;
            const measure = font
                ? (line) => measureGlyphRunWidth(line, { font, px, scaleToWorld })
                : (line) => estimateTextSize(line, this.fontSize).width;
            this.text = wrapPlainText(this.text, config.width, measure);
        }
        if (!font) {
            // FALLBACK: build as raster text (renderer draws it via drawText).
            this._buildAsRaster(config);
            const at = config.point ?? config.at;
            if (at)
                this.moveTo(at);
            return;
        }
        // Vector mode.
        this._buildGlyphs(font);
        this.setStyle({
            fillColor: this.fillColor,
            fillOpacity: this.fillOpacity,
            strokeColor: this.strokeColor,
            strokeWidth: this.strokeWidth,
            strokeOpacity: this.strokeOpacity,
        });
        // Apply per-substring styling.
        if (config.t2s)
            this._applyT2s(config.t2s);
        if (config.t2w)
            this._applyT2w(config.t2w);
        if (config.t2c)
            this.setColorByT2c(config.t2c);
        if (config.t2g)
            this.setColorByT2g(config.t2g);
        if (config.gradient)
            this.setColorByGradientText(config.gradient);
        const at = config.point ?? config.at;
        if (at)
            this.moveTo(at);
        else
            this.center();
    }
    // --- raster fallback ----------------------------------------------------
    _buildAsRaster(config) {
        this._isText = true;
        this.revealFraction = 1;
        this._rasterFontSize = this.fontSize;
        this._rasterFont = this.fontFamily;
        this.chars = new VGroup();
        this._charSource = [];
        this._plainText = this.text.replace(/\n/g, "");
        void config;
        this._buildRasterBox();
    }
    _buildRasterBox() {
        const { width: w, height: h } = estimateTextSize(this.text, this.fontSize, { lineHeight: this.lineSpacing });
        this.points = [
            [-w / 2, h / 2, 0],
            [w / 2, h / 2, 0],
            [w / 2, -h / 2, 0],
            [-w / 2, -h / 2, 0],
        ];
        this.numLines = this.text.split("\n").length;
    }
    // Renderer's drawText reads .font/.numLines/.currentFontHeight().
    get font() {
        return this._rasterFont ?? this.fontFamily;
    }
    set font(v) {
        this._rasterFont = v;
    }
    currentFontHeight() {
        return (this.getHeight() / Math.max(1, this.numLines ?? 1)) / this.lineSpacing;
    }
    // --- vector construction ------------------------------------------------
    _buildGlyphs(font) {
        const px = UNITS_PER_WORLD;
        const scaleToWorld = (this.fontSize / px) * 1.4;
        this.chars = new VGroup();
        this._charSource = [];
        const lines = this.text.split("\n");
        this._plainText = lines.join("");
        // Vertical advance per line (world units).
        const lineHeight = this.fontSize * this.lineSpacing;
        let sourceIndex = 0; // index into _plainText
        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const y = -li * lineHeight; // first line at top, subsequent below
            // One entry per grapheme cluster (not per code point/char) -- a base
            // glyph plus any combining marks share a single VMobject and a single
            // _charSource slot, so `chars`/index-based selection operate on
            // clusters, matching how a user perceives "one character."
            const { entries } = buildGlyphRun(line, { font, px, scaleToWorld, ligatures: !this.disableLigatures });
            for (const entry of entries) {
                const mob = entry.mob;
                mob.fillColor = Color.parse(this.fillColor);
                mob.strokeColor = Color.parse(this.strokeColor);
                mob.fillOpacity = this.fillOpacity;
                mob.strokeWidth = this.strokeWidth;
                mob.strokeOpacity = this.strokeOpacity;
                // Shift onto its line.
                if (y !== 0)
                    mob.shift([0, y, 0]);
                // Always add (even whitespace/empty) so char indices line up with text.
                this.chars.add(mob);
                this.add(mob);
                this._charSource.push(sourceIndex);
                sourceIndex += entry.clusterLength;
            }
        }
        // Whitespace-only text produces no glyph outlines, so its bounding box
        // would degenerate to a point at the origin — silently collapsing any
        // nextTo/layout chain that includes a space token (Code's token rows,
        // for example). Give it an invisible box of the TRUE advance width so
        // it occupies its space like every other Text.
        const hasGeometry = this.chars.submobjects.some((m) => m.points?.length);
        if (this.text.length && !hasGeometry) {
            const w = Math.max(...lines.map((line) => measureGlyphRunWidth(line, { font, px, scaleToWorld })), 1e-6);
            const h = Math.max(lines.length, 1) * lineHeight;
            // Two SINGLE-POINT subpaths at opposite corners: the bounding box spans
            // the full advance box, but a one-point path rasterizes to nothing —
            // even if an animation force-sets opacity (ShowIncreasingSubsets/
            // setOpacity), there is no drawable geometry to light up.
            this.points = [
                [0, h / 2, 0],
                [w, -h / 2, 0],
            ];
            this.subpathStarts = [0, 1];
            this.fillOpacity = 0;
            this.strokeOpacity = 0;
            this.strokeWidth = 0;
        }
        // Centre the whole block (manim positions text about its own centre).
        if (this.submobjects.length || this.points.length) {
            const c = this.getCenter();
            this.shift(V.neg(c));
            // Glyphs were laid out with the first line's BASELINE at y=0, so after
            // centering the baseline sits at -c.y relative to the mobject center.
            // Recorded so token-row layouts (Code) can align mixed-height tokens
            // on a true shared baseline instead of by bounding-box centers.
            this.baselineOffset = -c[1];
        }
    }
    // --- substring selection ------------------------------------------------
    // Indices in _plainText where `substr` occurs (all non-overlapping matches).
    _matchRanges(substr) {
        const ranges = [];
        if (!substr)
            return ranges;
        const hay = this._plainText;
        let from = 0;
        while (true) {
            const idx = hay.indexOf(substr, from);
            if (idx < 0)
                break;
            ranges.push([idx, idx + substr.length]);
            from = idx + substr.length;
        }
        return ranges;
    }
    // Glyph submobjects whose source-character index falls inside any match.
    _glyphsForRange(start, end) {
        const out = [];
        for (let i = 0; i < this.chars.submobjects.length; i++) {
            const src = this._charSource[i];
            if (src >= start && src < end)
                out.push(this.chars.submobjects[i]);
        }
        return out;
    }
    // All matches as an array of VGroups (one per occurrence of `substr`).
    getPartsByText(substr) {
        return this._matchRanges(substr).map(([s, e]) => {
            const g = new VGroup();
            for (const m of this._glyphsForRange(s, e))
                g.add(m);
            return g;
        });
    }
    // First match as a VGroup (empty VGroup if not found).
    getPartByText(substr) {
        const parts = this.getPartsByText(substr);
        return parts[0] ?? new VGroup();
    }
    // --- word/line splitting -------------------------------------------------
    // `_charSource` indexes into `_plainText` (this.text with "\n" stripped --
    // see _buildGlyphs, which builds it via `lines.join("")` and never assigns
    // a source index to a newline). Word/line ranges are computed in
    // `this.text` index space (which DOES contain "\n") and then translated
    // through `_originalToPlainIndex()` before reusing `_glyphsForRange`, the
    // same lookup `getPartsByText` uses. Note whitespace characters (including
    // plain spaces) DO get their own `chars` entry -- just an invisible one,
    // per the two-single-point-subpath handling below -- so ordinary
    // char-index arithmetic (no special-casing) is enough; only "\n" is absent
    // from the glyph stream.
    // Maps each index of `this.text` to the corresponding index in
    // `_plainText`; positions holding "\n" map to -1 and are never looked up
    // (word ranges never span a newline, since \S+ stops at it; line ranges
    // are computed directly in _plainText offset space instead, see lines()).
    _originalToPlainIndex() {
        const map = new Array(this.text.length);
        let plain = 0;
        for (let i = 0; i < this.text.length; i++) {
            if (this.text[i] === "\n") {
                map[i] = -1;
            }
            else {
                map[i] = plain++;
            }
        }
        return map;
    }
    /**
     * Group `this.chars` into per-word VGroups, splitting on runs of
     * whitespace (including "\n") in the original source text -- a "word" is
     * a maximal run of non-whitespace characters. Whitespace itself produces
     * no word group (runs collapse; multiple spaces between words still
     * yield exactly one boundary). Returned VGroups are NEW wrapper objects
     * whose submobjects are the SAME `chars`/glyph mobject instances (shared
     * identity), so animating a word doesn't disturb `this.chars`' own
     * structure but stays visually consistent with it.
     */
    words() {
        if (!this.text.length)
            return [];
        const toPlain = this._originalToPlainIndex();
        const out = [];
        for (const match of this.text.matchAll(/\S+/g)) {
            const origStart = match.index;
            const len = match[0].length;
            const plainStart = toPlain[origStart];
            const g = new VGroup();
            for (const m of this._glyphsForRange(plainStart, plainStart + len))
                g.add(m);
            out.push(g);
        }
        return out;
    }
    /**
     * Group `this.chars` into per-line VGroups, splitting on "\n" in the
     * original source text. Unlike `words()`, whitespace WITHIN a line
     * (including its invisible space glyphs) is kept. A single line with no
     * newlines returns one VGroup containing everything. Same
     * identity-sharing behavior as `words()`.
     */
    lines() {
        if (!this.text.length)
            return [];
        const out = [];
        let offset = 0; // running index into _plainText, mirrors _buildGlyphs' sourceIndex
        for (const line of this.text.split("\n")) {
            const g = new VGroup();
            for (const m of this._glyphsForRange(offset, offset + line.length))
                g.add(m);
            out.push(g);
            offset += line.length;
        }
        return out;
    }
    // --- per-substring styling ----------------------------------------------
    setColorByT2c(t2c) {
        if (!t2c)
            return this;
        for (const [substr, color] of Object.entries(t2c)) {
            for (const part of this.getPartsByText(substr)) {
                for (const g of part.submobjects) {
                    g.fillColor = Color.parse(color);
                    g.strokeColor = Color.parse(color);
                    g.color = Color.parse(color);
                }
            }
        }
        return this;
    }
    // Per-substring gradient: {substr: [c0, c1, ...]} laid across that substring.
    setColorByT2g(t2g) {
        if (!t2g)
            return this;
        for (const [substr, colors] of Object.entries(t2g)) {
            for (const part of this.getPartsByText(substr)) {
                this._gradientAcross(part.submobjects, colors);
            }
        }
        return this;
    }
    // Weight per substring. With a single loaded font we cannot re-shape to a bold
    // face, so we emulate weight by adding a proportional stroke on the fill.
    _applyT2w(t2w) {
        for (const [substr, weight] of Object.entries(t2w)) {
            const bold = /bold|[6-9]00/i.test(weight);
            for (const part of this.getPartsByText(substr)) {
                for (const g of part.submobjects) {
                    const m = g;
                    if (bold) {
                        m.strokeColor = Color.parse(m.fillColor);
                        m.strokeWidth = Math.max(m.strokeWidth, this.fontSize * 2.2);
                        m.strokeOpacity = m.fillOpacity;
                    }
                }
            }
        }
        return this;
    }
    // Slant per substring. Emulated by a horizontal shear about the baseline.
    _applyT2s(t2s) {
        for (const [substr, slant] of Object.entries(t2s)) {
            if (!/italic|oblique/i.test(slant))
                continue;
            for (const part of this.getPartsByText(substr)) {
                for (const g of part.submobjects) {
                    const m = g;
                    for (const p of m.points)
                        p[0] += p[1] * 0.2; // shear x by 0.2*y
                }
            }
        }
        return this;
    }
    // Gradient across the entire text (manim's `gradient=`), spread glyph-wise.
    setColorByGradientText(colors) {
        this._gradientAcross(this.chars.submobjects, colors);
        return this;
    }
    // Distribute a colour ramp across a list of glyphs (left-to-right).
    _gradientAcross(glyphs, colors) {
        const stops = colors.map((c) => Color.parse(c));
        const n = glyphs.length;
        if (n === 0 || stops.length === 0)
            return;
        if (stops.length === 1) {
            for (const g of glyphs) {
                g.fillColor = Color.parse(stops[0]);
                g.strokeColor = Color.parse(stops[0]);
                g.color = Color.parse(stops[0]);
            }
            return;
        }
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : i / (n - 1);
            const seg = t * (stops.length - 1);
            const lo = Math.min(stops.length - 1, Math.floor(seg));
            const hi = Math.min(stops.length - 1, lo + 1);
            const local = seg - lo;
            const c = Color.lerp(stops[lo], stops[hi], local);
            g_set(glyphs[i], c);
        }
    }
    // --- overrides ----------------------------------------------------------
    setColor(color) {
        const c = Color.parse(color);
        this.fillColor = c;
        this.strokeColor = Color.parse(color);
        this._color = Color.parse(color);
        for (const m of this.submobjects)
            m.setColor(color);
        return this;
    }
    copy() {
        const c = super.copy();
        // Rebuild the chars VGroup to reference the copied submobjects (order-preserved).
        const nc = new VGroup();
        for (const s of c.submobjects)
            nc.add(s);
        c.chars = nc;
        c._charSource = [...this._charSource];
        c._plainText = this._plainText;
        if (this._isText) {
            c.fillColor = Color.parse(this.fillColor);
        }
        return c;
    }
}
// Helper: set all colour channels on a glyph.
function g_set(m, c) {
    m.fillColor = Color.parse(c);
    m.strokeColor = Color.parse(c);
    m.color = Color.parse(c);
}
export class MarkupText extends Text {
    constructor(markup = "", config = {}) {
        const { plain, t2c, t2w, t2s, t2g } = MarkupText._parse(String(markup));
        // Merge parsed maps under any explicitly-provided config maps (config wins).
        const merged = {
            ...config,
            t2c: { ...t2c, ...(config.t2c ?? {}) },
            t2w: { ...t2w, ...(config.t2w ?? {}) },
            t2s: { ...t2s, ...(config.t2s ?? {}) },
            t2g: { ...t2g, ...(config.t2g ?? {}) },
        };
        super(plain, merged);
    }
    // Very small tag-stack parser. Returns the tag-stripped text plus text-to-*
    // maps keyed by the exact substring each run covers.
    static _parse(markup) {
        const t2c = {};
        const t2w = {};
        const t2s = {};
        const t2g = {};
        let plain = "";
        const stack = [];
        const top = () => stack[stack.length - 1] ?? { bold: false, italic: false };
        const open = [];
        const tagRe = /<(\/?)([a-zA-Z]+)((?:\s+[^>]*)?)>/g;
        let last = 0;
        let m;
        const pushText = (txt) => {
            plain += txt;
        };
        while ((m = tagRe.exec(markup)) !== null) {
            pushText(markup.slice(last, m.index));
            last = tagRe.lastIndex;
            const closing = m[1] === "/";
            const name = m[2].toLowerCase();
            const attrs = m[3] ?? "";
            if (!closing) {
                const parent = top();
                const run = { bold: parent.bold, italic: parent.italic, color: parent.color };
                if (name === "b")
                    run.bold = true;
                else if (name === "i")
                    run.italic = true;
                else if (name === "span") {
                    const fg = /(?:foreground|color)\s*=\s*"([^"]*)"/i.exec(attrs);
                    if (fg)
                        run.color = fg[1];
                    if (/font_weight\s*=\s*"(?:bold|[6-9]00)"/i.test(attrs))
                        run.bold = true;
                    if (/font_style\s*=\s*"(?:italic|oblique)"/i.test(attrs))
                        run.italic = true;
                }
                else if (name === "gradient") {
                    const from = /from\s*=\s*"?([#\w]+)"?/i.exec(attrs);
                    const to = /to\s*=\s*"?([#\w]+)"?/i.exec(attrs);
                    run.gradientFrom = from ? from[1] : undefined;
                    run.gradientTo = to ? to[1] : undefined;
                }
                stack.push(run);
                open.push({ run, start: plain.length });
            }
            else {
                const o = open.pop();
                stack.pop();
                if (o) {
                    const substr = plain.slice(o.start);
                    const run = o.run;
                    if (substr) {
                        if (run.bold)
                            t2w[substr] = "bold";
                        if (run.italic)
                            t2s[substr] = "italic";
                        if (run.color)
                            t2c[substr] = run.color;
                        if (run.gradientFrom && run.gradientTo)
                            t2g[substr] = [run.gradientFrom, run.gradientTo];
                    }
                }
            }
        }
        pushText(markup.slice(last));
        return { plain, t2c, t2w, t2s, t2g };
    }
}
//# sourceMappingURL=Text.js.map