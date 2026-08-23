// Additional creation / text animations, mirroring ManimCommunity
// manim/animation/creation.py. These are additive: they extend the base
// Animation (and the existing Create/Write) without touching Animation.ts,
// index.ts, or builtins.ts.
//
// Conventions reused from Animation.ts / extra.ts:
//   - record initial/final state in setup() (runs after begin() snapshots
//     this.startState), then rebuild each frame in interpolate*().
//   - introducer=true for animations that add a mobject to the scene, and
//     remover=true for ones that remove it.
//   - `any` is used freely for heterogeneous mobjects (glyphs, VGroups, ...).
import { Animation, Create } from "./Animation.js";
import { smooth, doubleSmooth, linear } from "./rate_functions.js";
import * as V from "../core/math/vector.js";
import { Rectangle } from "../mobject/geometry.js";
// Family snapshot helpers (mirrors extra.ts).
function familyPoints(mobject) {
    return mobject.getFamily().map((m) => m.points.map((p) => [...p]));
}
// ---------------------------------------------------------------------------
// DrawBorderThenFill — draw the outline (stroke) first with fill at 0, then
// fill it in. Two-phase: first half strokeEnd 0->1 with fillOpacity 0; second
// half fillOpacity 0->target. Mirrors manim's DrawBorderThenFill.
// ---------------------------------------------------------------------------
export class DrawBorderThenFill extends Animation {
    origFill;
    strokeWidth;
    strokeColor;
    constructor(vmobject, config = {}) {
        super(vmobject, {
            runTime: config.runTime ?? 2,
            rateFunc: config.rateFunc ?? doubleSmooth,
            ...config,
            introducer: true,
        });
        this.strokeWidth = config.strokeWidth;
        this.strokeColor = config.strokeColor;
    }
    setup() {
        this.origFill = this.mobject.getFamily().map((m) => m.fillOpacity ?? 0);
        // Optionally restyle the border used during the draw phase.
        if (this.strokeColor != null || this.strokeWidth != null) {
            for (const m of this.mobject.getFamily()) {
                if (this.strokeColor != null && m.setStroke) {
                    m.setStroke(this.strokeColor, this.strokeWidth ?? m.strokeWidth, 1);
                }
                else {
                    if (this.strokeColor != null)
                        m.strokeColor = this.strokeColor;
                    if (this.strokeWidth != null)
                        m.strokeWidth = this.strokeWidth;
                    m.strokeOpacity = 1;
                }
            }
        }
    }
    drawMember(m, index, a) {
        if (m._isText) {
            m.revealFraction = a;
            return;
        }
        if (a <= 0.5) {
            // Phase 1: trace the outline, fill held at zero.
            m.strokeEnd = a * 2;
            if (m.fillOpacity != null)
                m.fillOpacity = 0;
        }
        else {
            // Phase 2: outline complete, fade the fill in to its target.
            m.strokeEnd = 1;
            if (m.fillOpacity != null)
                m.fillOpacity = this.origFill[index] * (a - 0.5) * 2;
        }
    }
    interpolateMobject(alpha) {
        const fam = this.mobject.getFamily();
        fam.forEach((m, i) => this.drawMember(m, i, alpha));
    }
    finish() {
        const fam = this.mobject.getFamily();
        fam.forEach((m, i) => {
            if (m._isText) {
                m.revealFraction = 1;
                return;
            }
            m.strokeEnd = 1;
            if (m.fillOpacity != null)
                m.fillOpacity = this.origFill[i];
        });
        this.finished = true;
        return this;
    }
}
// ---------------------------------------------------------------------------
// Unwrite — the reverse of Write. Uses reverseRateFunc so the 0->1 draw plays
// as a 1->0 erase, and is a remover. Mirrors manim's Unwrite.
// ---------------------------------------------------------------------------
export class Unwrite extends Create {
    constructor(mobject, config = {}) {
        super(mobject, {
            runTime: config.runTime ?? 1,
            rateFunc: config.rateFunc ?? linear,
            lagRatio: config.lagRatio ?? 0.1,
            reverseRateFunc: config.reverseRateFunc ?? true,
            ...config,
            introducer: false,
        });
        this.remover = true;
        this.introducer = false;
    }
    finish() {
        this.mobject.getFamily().forEach((m) => {
            if (m._isText) {
                m.revealFraction = 0;
                return;
            }
            m.strokeEnd = 0;
        });
        this.finished = true;
        return this;
    }
}
// ---------------------------------------------------------------------------
// ShowIncreasingSubsets — reveal submobjects 0..k as alpha grows. Submobjects
// beyond the current count are hidden (opacity 0). introducer.
// Mirrors manim's ShowIncreasingSubsets.
// ---------------------------------------------------------------------------
export class ShowIncreasingSubsets extends Animation {
    group;
    allSubmobs;
    intFunc;
    startOpacities;
    constructor(group, config = {}) {
        super(group, { ...config, introducer: true });
        this.group = group;
        this.allSubmobs = [...group.submobjects];
        this.intFunc = config.intFunc ?? Math.floor;
    }
    setup() {
        // Remember each submobject's intended (visible) opacity so we can restore it.
        this.startOpacities = this.allSubmobs.map((m) => m.opacity ?? 1);
    }
    // Show submobjects [0, index); hide the rest by zeroing opacity.
    updateSubmobjectList(index) {
        for (let i = 0; i < this.allSubmobs.length; i++) {
            const m = this.allSubmobs[i];
            if (i < index) {
                if (m.setOpacity)
                    m.setOpacity(this.startOpacities[i]);
                else
                    m.opacity = this.startOpacities[i];
            }
            else {
                if (m.setOpacity)
                    m.setOpacity(0);
                else
                    m.opacity = 0;
            }
        }
    }
    interpolateMobject(alpha) {
        const n = this.allSubmobs.length;
        const index = Math.max(0, Math.min(n, this.intFunc(alpha * n)));
        this.updateSubmobjectList(index);
    }
    finish() {
        this.updateSubmobjectList(this.allSubmobs.length);
        this.finished = true;
        return this;
    }
}
// ---------------------------------------------------------------------------
// ShowSubmobjectsOneByOne — like ShowIncreasingSubsets but only ONE submobject
// is visible at a time. Mirrors manim's ShowSubmobjectsOneByOne.
// ---------------------------------------------------------------------------
export class ShowSubmobjectsOneByOne extends ShowIncreasingSubsets {
    constructor(group, config = {}) {
        super(group, { intFunc: config.intFunc ?? Math.ceil, ...config });
    }
    // `index` here is the count; show only submobject (index-1).
    updateSubmobjectList(index) {
        const visible = index - 1; // the single one to show (‑1 => none)
        for (let i = 0; i < this.allSubmobs.length; i++) {
            const m = this.allSubmobs[i];
            if (i === visible) {
                if (m.setOpacity)
                    m.setOpacity(this.startOpacities[i]);
                else
                    m.opacity = this.startOpacities[i];
            }
            else {
                if (m.setOpacity)
                    m.setOpacity(0);
                else
                    m.opacity = 0;
            }
        }
    }
}
// ---------------------------------------------------------------------------
// Text-reveal helpers.
// ---------------------------------------------------------------------------
// Return the glyph submobjects of a vector Text (its .chars / .submobjects),
// or null when the mobject is a raster Text (no per-glyph mobjects).
function textGlyphs(text) {
    if (text._isText)
        return null; // raster fallback
    if (text.chars && text.chars.submobjects && text.chars.submobjects.length) {
        return [...text.chars.submobjects];
    }
    if (text.submobjects && text.submobjects.length)
        return [...text.submobjects];
    return null;
}
// ---------------------------------------------------------------------------
// AddTextLetterByLetter — reveal the glyph submobjects of a vector Text one at
// a time (a ShowIncreasingSubsets over its glyphs). For raster Text, ramp
// revealFraction instead. introducer. Mirrors manim's AddTextLetterByLetter.
// ---------------------------------------------------------------------------
export class AddTextLetterByLetter extends ShowIncreasingSubsets {
    text;
    isRaster;
    constructor(text, config = {}) {
        const glyphs = textGlyphs(text);
        const nChars = glyphs ? glyphs.length : text._plainText?.length ?? 1;
        const timePerChar = config.timePerChar ?? 0.1;
        // runTime defaults to timePerChar per character (manim uses run_time
        // derived from time_per_char); an explicit runTime overrides.
        const runTime = config.runTime ?? Math.max(timePerChar, timePerChar * nChars);
        super(text, { runTime, ...config, introducer: true });
        this.text = text;
        this.isRaster = !glyphs;
        // For raster text there are no glyph submobjects; drive revealFraction.
        if (this.isRaster)
            this.allSubmobs = [];
    }
    interpolateMobject(alpha) {
        if (this.isRaster) {
            this.text.revealFraction = Math.max(0, Math.min(1, this.rateFuncAlpha(alpha)));
            return;
        }
        super.interpolateMobject(alpha);
    }
    // The eased alpha is already applied by Animation.interpolate; this passes
    // it through for the raster branch (kept explicit for clarity).
    rateFuncAlpha(alpha) {
        return alpha;
    }
    finish() {
        if (this.isRaster) {
            this.text.revealFraction = 1;
            this.finished = true;
            return this;
        }
        return super.finish();
    }
}
// ---------------------------------------------------------------------------
// RemoveTextLetterByLetter — reverse of AddTextLetterByLetter (remover). Hides
// glyphs from last to first. Mirrors manim's RemoveTextLetterByLetter.
// ---------------------------------------------------------------------------
export class RemoveTextLetterByLetter extends AddTextLetterByLetter {
    constructor(text, config = {}) {
        super(text, { reverseRateFunc: config.reverseRateFunc ?? true, ...config });
        this.remover = true;
        this.introducer = false;
    }
    finish() {
        if (this.isRaster) {
            this.text.revealFraction = 0;
            this.finished = true;
            return this;
        }
        this.updateSubmobjectList(0);
        this.finished = true;
        return this;
    }
}
// ---------------------------------------------------------------------------
// AddTextWordByWord — reveal word-groups. Builds a list of word "chunks" of
// glyphs (split on spaces) and reveals whole words at a time. introducer.
// Mirrors manim's AddTextWordByWord.
// ---------------------------------------------------------------------------
export class AddTextWordByWord extends Animation {
    text;
    words; // each entry is a list of glyph submobjects
    isRaster;
    startOpacities;
    constructor(text, config = {}) {
        const glyphs = textGlyphs(text);
        const plain = text._plainText ?? text.text ?? "";
        const timePerChar = config.timePerChar ?? 0.1;
        const runTime = config.runTime ?? Math.max(timePerChar, timePerChar * plain.length);
        super(text, { runTime, ...config, introducer: true });
        this.text = text;
        this.isRaster = !glyphs;
        // Group glyph submobjects by word using the plain text's spaces.
        this.words = [];
        if (glyphs) {
            let current = [];
            const n = Math.min(glyphs.length, plain.length || glyphs.length);
            for (let i = 0; i < glyphs.length; i++) {
                const ch = plain[i];
                if (ch === " ") {
                    if (current.length) {
                        this.words.push(current);
                        current = [];
                    }
                    // whitespace glyph goes with the preceding word visually; skip.
                    continue;
                }
                current.push(glyphs[i]);
            }
            if (current.length)
                this.words.push(current);
            void n;
        }
    }
    setup() {
        this.startOpacities = this.words.map((w) => w.map((m) => m.opacity ?? 1));
    }
    show(count) {
        for (let w = 0; w < this.words.length; w++) {
            const visible = w < count;
            for (let g = 0; g < this.words[w].length; g++) {
                const m = this.words[w][g];
                const target = visible ? this.startOpacities[w][g] : 0;
                if (m.setOpacity)
                    m.setOpacity(target);
                else
                    m.opacity = target;
            }
        }
    }
    interpolateMobject(alpha) {
        if (this.isRaster) {
            this.text.revealFraction = alpha;
            return;
        }
        const n = this.words.length;
        const count = Math.max(0, Math.min(n, Math.floor(alpha * n + 1e-9)));
        this.show(count);
    }
    finish() {
        if (this.isRaster) {
            this.text.revealFraction = 1;
            this.finished = true;
            return this;
        }
        this.show(this.words.length);
        this.finished = true;
        return this;
    }
}
// ---------------------------------------------------------------------------
// TypeWithCursor — AddTextLetterByLetter plus a blinking cursor mobject that
// follows the last revealed glyph. Mirrors manim's TypeWithCursor.
// ---------------------------------------------------------------------------
export class TypeWithCursor extends AddTextLetterByLetter {
    cursor;
    _cursorIntroduced;
    constructor(text, cursor, config = {}) {
        super(text, config);
        // Default cursor: a thin tall rectangle sized to the text height.
        if (cursor) {
            this.cursor = cursor;
        }
        else {
            const h = text.getHeight ? Math.max(text.getHeight(), 0.1) : 0.5;
            const c = new Rectangle({ width: 0.05, height: h });
            c.fillOpacity = 1;
            c.strokeWidth = 0;
            this.cursor = c;
        }
        this._cursorIntroduced = true;
    }
    // Position the cursor to the right of the last revealed glyph.
    placeCursor(index) {
        if (this.isRaster || !this.allSubmobs.length)
            return;
        const i = Math.max(0, Math.min(this.allSubmobs.length - 1, index - 1));
        const anchor = this.allSubmobs[i];
        if (anchor && anchor.getRight) {
            this.cursor.nextTo(anchor, V.RIGHT, 0.05);
        }
    }
    interpolateMobject(alpha) {
        super.interpolateMobject(alpha);
        if (this.isRaster)
            return;
        const n = this.allSubmobs.length;
        const index = Math.max(0, Math.min(n, this.intFunc(alpha * n)));
        this.placeCursor(index);
        // Simple blink: modulate cursor opacity over time.
        this.cursor.setOpacity ? this.cursor.setOpacity(alpha < 1 ? (Math.sin(alpha * Math.PI * 8) > 0 ? 1 : 0.2) : 1) : (this.cursor.opacity = 1);
    }
    finish() {
        super.finish();
        this.placeCursor(this.allSubmobs.length);
        if (this.cursor.setOpacity)
            this.cursor.setOpacity(1);
        return this;
    }
    // Introduce both the text and the cursor.
    getMobjectsToIntroduce() {
        return [this.mobject, this.cursor];
    }
}
// ---------------------------------------------------------------------------
// Untype / UntypeWithCursor — reverse of typing (remover).
// ---------------------------------------------------------------------------
export class Untype extends RemoveTextLetterByLetter {
    constructor(text, config = {}) {
        super(text, config);
    }
}
export class UntypeWithCursor extends TypeWithCursor {
    constructor(text, cursor, config = {}) {
        super(text, cursor, { reverseRateFunc: config.reverseRateFunc ?? true, ...config });
        this.remover = true;
        this.introducer = false;
    }
    finish() {
        // Erase everything; reverse-rate leaves index at 0.
        if (this.isRaster) {
            this.text.revealFraction = 0;
        }
        else
            this.updateSubmobjectList(0);
        if (this.cursor.setOpacity)
            this.cursor.setOpacity(1);
        this.finished = true;
        return this;
    }
    getMobjectsToRemove() {
        return [this.mobject, this.cursor];
    }
}
// ---------------------------------------------------------------------------
// SpiralIn — submobjects spiral in from scaled/rotated positions while fading
// in, staggered by submobject. Mirrors manim's SpiralIn.
// ---------------------------------------------------------------------------
export class SpiralIn extends Animation {
    spiralScale;
    fadeInFraction;
    finalPoints;
    targetOpacities;
    center;
    constructor(group, config = {}) {
        super(group, {
            runTime: config.runTime ?? 2,
            rateFunc: config.rateFunc ?? smooth,
            ...config,
            introducer: true,
        });
        this.spiralScale = config.scaleFactor ?? 0.1;
        this.fadeInFraction = config.fadeInFraction ?? 0.3;
    }
    setup() {
        this.finalPoints = familyPoints(this.mobject);
        this.center = this.mobject.getCenter();
        this.targetOpacities = this.mobject.getFamily().map((m) => ({
            fill: m.fillOpacity ?? m.opacity ?? 1,
            stroke: m.strokeOpacity ?? m.opacity ?? 1,
            op: m.opacity ?? 1,
        }));
    }
    // Per-family-member spiral: each starts scaled toward the center and rotated,
    // unwinding to its final position while fading in. Staggered across submobs.
    spiralMember(m, i, count, alpha) {
        // Stagger: each member's local progress lags by its index.
        const spread = Math.max(1, count);
        const local = Math.max(0, Math.min(1, alpha * spread - i * ((spread - 1) / spread)));
        const s = this.spiralScale + (1 - this.spiralScale) * local; // scaleFactor -> 1
        const angle = (1 - local) * V.TAU; // one full turn, unwinding to 0
        const final = this.finalPoints[i];
        for (let j = 0; j < m.points.length; j++) {
            const rel = V.sub(final[j], this.center);
            const scaled = V.scale(rel, s);
            const rotated = V.rotateVector(scaled, angle, V.OUT);
            m.points[j] = V.add(this.center, rotated);
        }
        const t = this.targetOpacities[i];
        const fadeA = Math.max(0, Math.min(1, local / Math.max(1e-6, this.fadeInFraction)));
        m.fillOpacity = t.fill * fadeA;
        m.strokeOpacity = t.stroke * fadeA;
    }
    interpolateMobject(alpha) {
        const fam = this.mobject.getFamily();
        const count = fam.length;
        fam.forEach((m, i) => this.spiralMember(m, i, count, alpha));
    }
    finish() {
        // Force final positions and full opacity regardless of stagger windows.
        const fam = this.mobject.getFamily();
        fam.forEach((m, i) => {
            m.points = this.finalPoints[i].map((p) => [...p]);
            const t = this.targetOpacities[i];
            m.fillOpacity = t.fill;
            m.strokeOpacity = t.stroke;
            m.opacity = t.op;
        });
        this.finished = true;
        return this;
    }
}
//# sourceMappingURL=creation_extra.js.map