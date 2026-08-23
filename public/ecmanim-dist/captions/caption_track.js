// A caption overlay mobject: shows the active caption for the current scene time,
// with optional karaoke-style left-to-right reveal. Reuses RasterText's existing
// `revealFraction` (the same field drawText uses for typewriter clipping). The
// updater accumulates dt, so it stays in sync through play()/wait().
//
// WordCaptionTrack below is the per-token sibling: one RasterText per word so
// the active token can be individually colored/scaled (TikTok/Submagic style),
// which single-fillStyle CaptionTrack can't do.
import { Group } from "../mobject/Mobject.js";
import { RasterText, estimateTextSize } from "../mobject/text/Text.js";
import { Color } from "../core/color.js";
import { captionAt } from "./captions.js";
export class CaptionTrack extends RasterText {
    captions;
    karaoke;
    _elapsedMs;
    constructor(captions, config = {}) {
        super("", {
            fontSize: config.fontSize ?? 0.45,
            color: config.color ?? "#FFFFFF",
            align: config.align ?? "center",
            point: config.point ?? [0, -3, 0],
        });
        this.captions = captions;
        this.karaoke = config.karaoke ?? false;
        this._elapsedMs = config.offsetMs ?? 0;
        this.addUpdater((_m, dt) => this._tick(dt));
        this._render(); // initial frame
    }
    _tick(dt) {
        this._elapsedMs += dt * 1000;
        this._render();
    }
    _render() {
        const c = captionAt(this.captions, this._elapsedMs);
        const newText = c ? c.text : "";
        if (newText !== this.text) {
            // Rebuild the box for the new cue — the karaoke reveal clips to the
            // box width, so a stale box (e.g. from the initial "") would clip the
            // whole caption away. _buildBox() re-centers on the origin, so restore
            // the track's anchor afterwards.
            const center = this.getCenter();
            this.text = newText;
            this._buildBox();
            this.moveTo(center);
        }
        if (this.karaoke && c) {
            const span = Math.max(1, c.endMs - c.startMs);
            this.revealFraction = Math.max(0, Math.min(1, (this._elapsedMs - c.startMs) / span));
        }
        else {
            this.revealFraction = 1;
        }
    }
    /** Jump the caption clock to `ms` (e.g. when seeking). */
    seekMs(ms) {
        this._elapsedMs = ms;
        this._render();
        return this;
    }
}
/**
 * Word-level karaoke captions: consumes `CaptionPage[]` (from
 * `createTikTokStyleCaptions`) and renders one RasterText per token, so the
 * active word can pop and change color independently (TikTok/Submagic style).
 * Layout is computed once per page; per-frame work only mutates each token's
 * color/opacity/box (all pure functions of the elapsed clock — scrubbing and
 * `seekMs` in either direction land on identical frames).
 */
export class WordCaptionTrack extends Group {
    pages;
    /** The current page's token mobjects, in token order (empty between pages). */
    tokenTexts = [];
    _cfg;
    _hl;
    _elapsedMs;
    _pageIndex = -1;
    _slots = [];
    _baseColor;
    _activeColor;
    _inactiveColor;
    constructor(pages, config = {}) {
        super();
        this.pages = pages;
        this._cfg = { fontSize: 0.45, color: "#FFFFFF", lineSpacing: 1.25, ...config };
        const hl = config.highlight ?? {};
        this._hl = {
            color: hl.color ?? "#FFE066",
            inactiveColor: hl.inactiveColor ?? this._cfg.color,
            scale: hl.scale ?? 1.15,
            popMs: hl.popMs ?? 120,
            futureOpacity: hl.futureOpacity ?? 0.4,
        };
        this._baseColor = Color.parse(this._cfg.color);
        this._activeColor = Color.parse(this._hl.color);
        this._inactiveColor = Color.parse(this._hl.inactiveColor);
        this._elapsedMs = config.offsetMs ?? 0;
        this.addUpdater((_m, dt) => {
            this._elapsedMs += dt * 1000;
            this._render();
        });
        this._render();
    }
    /** The index of the page currently displayed, or -1 between pages. */
    get currentPageIndex() {
        return this._pageIndex;
    }
    /** Jump the caption clock to `ms` (either direction — layout is stateless). */
    seekMs(ms) {
        this._elapsedMs = ms;
        this._render();
        return this;
    }
    _pageAt(ms) {
        for (let i = 0; i < this.pages.length; i++) {
            const p = this.pages[i];
            if (ms >= p.startMs && ms < p.startMs + Math.max(1, p.durationMs))
                return i;
        }
        return -1;
    }
    _render() {
        const idx = this._pageAt(this._elapsedMs);
        if (idx !== this._pageIndex) {
            this._pageIndex = idx;
            this._layoutPage(idx === -1 ? null : this.pages[idx]);
        }
        this._styleTokens();
    }
    /** Build one RasterText per token and lay them out (with maxWidth wrap). */
    _layoutPage(page) {
        this.submobjects.length = 0;
        this.tokenTexts = [];
        this._slots = [];
        if (!page)
            return;
        const { fontSize, maxWidth, lineSpacing } = this._cfg;
        const lineHeight = fontSize * 1.2 * lineSpacing;
        const spaceW = estimateTextSize(" ", fontSize).width;
        const measured = page.tokens
            .map((token) => {
            const label = token.text.trim();
            return { token, label, w: estimateTextSize(label, fontSize).width };
        })
            .filter((m) => m.label.length > 0);
        const lines = [];
        let line = [];
        let lineW = 0;
        for (const m of measured) {
            const extra = (line.length ? spaceW : 0) + m.w;
            if (line.length && maxWidth != null && lineW + extra > maxWidth) {
                lines.push(line);
                line = [m];
                lineW = m.w;
            }
            else {
                line.push(m);
                lineW += extra;
            }
        }
        if (line.length)
            lines.push(line);
        // Second pass: place tokens, centering each line and the whole block.
        const [cx, cy] = this._cfg.point ?? [0, -3, 0];
        const blockH = lines.length * lineHeight;
        lines.forEach((ln, li) => {
            const totalW = ln.reduce((s, m) => s + m.w, 0) + spaceW * (ln.length - 1);
            let x = cx - totalW / 2;
            const y = cy + blockH / 2 - lineHeight * (li + 0.5);
            for (const m of ln) {
                const text = new RasterText(m.label, {
                    fontSize,
                    color: this._cfg.color,
                    ...(this._cfg.font ? { font: this._cfg.font } : {}),
                    ...(this._cfg.weight ? { weight: this._cfg.weight } : {}),
                });
                const halfW = m.w / 2;
                const halfH = (fontSize * 1.2) / 2;
                const center = [x + halfW, y];
                this._slots.push({ text, fromMs: m.token.fromMs, toMs: m.token.toMs, center, halfW, halfH });
                this.tokenTexts.push(text);
                x += m.w + spaceW;
            }
        });
        this.add(...this.tokenTexts);
    }
    /** Pure function of the clock: color/opacity/scale per token, no state. */
    _styleTokens() {
        const t = this._elapsedMs;
        for (const slot of this._slots) {
            const { text, fromMs, toMs, center, halfW, halfH } = slot;
            let scale = 1;
            if (t < fromMs) {
                text.fillColor = this._inactiveColor;
                text.fillOpacity = this._hl.futureOpacity;
                text.opacity = this._hl.futureOpacity;
            }
            else if (t < toMs) {
                text.fillColor = this._activeColor;
                text.fillOpacity = 1;
                text.opacity = 1;
                // Pop-in: smoothstep 1 -> hl.scale over popMs, then hold while active.
                const p = Math.min(1, (t - fromMs) / Math.max(1, this._hl.popMs));
                const s = p * p * (3 - 2 * p);
                scale = 1 + (this._hl.scale - 1) * s;
            }
            else {
                text.fillColor = this._baseColor;
                text.fillOpacity = 1;
                text.opacity = 1;
            }
            const w = halfW * scale;
            const h = halfH * scale;
            text.points = [
                [center[0] - w, center[1] + h, 0],
                [center[0] + w, center[1] + h, 0],
                [center[0] + w, center[1] - h, 0],
                [center[0] - w, center[1] - h, 0],
            ];
        }
    }
}
//# sourceMappingURL=caption_track.js.map