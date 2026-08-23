// A framework-agnostic <manim-chart> custom element: renders a static graph
// (e.g. built from Axes/NumberPlane) once, then layers pointer-driven pan/
// zoom/pick on top via attachInteractiveCamera(). Unlike <manim-player>
// (web-component.ts), a chart is not a timed animation, so it never touches
// Player or frame-recording — it renders directly through CanvasRenderer,
// the same "one static frame" path renderStill() uses in node.ts.
//
// IMPORTANT — Node import safety: follows the exact pattern documented at the
// top of web-component.ts. Never reference HTMLElement at module top-level;
// build the real class lazily, guarded by `typeof HTMLElement !== "undefined"`.
import { Camera, CanvasRenderer } from "../renderer/CanvasRenderer.js";
import { attachInteractiveCamera } from "./interactive.js";
const G = globalThis;
/** True when we're in an environment with the DOM APIs we need to register. */
function hasDom() {
    return (typeof G.HTMLElement !== "undefined" &&
        typeof G.customElements !== "undefined" &&
        typeof G.customElements.define === "function");
}
let _builtClass = null;
function buildElementClass() {
    if (_builtClass)
        return _builtClass;
    if (typeof G.HTMLElement === "undefined") {
        throw new Error("buildElementClass() called without HTMLElement in scope");
    }
    const HTMLElementRef = G.HTMLElement;
    class ManimChartElementImpl extends HTMLElementRef {
        static get observedAttributes() {
            return ["width", "height", "background"];
        }
        // Internal state ---------------------------------------------------------
        _canvas = null;
        _ctx = null;
        _camera = null;
        _renderer = null;
        _mobjects = [];
        _graphFn = null;
        _interactive = null;
        _hoverTarget = null;
        // --- Lifecycle ------------------------------------------------------------
        connectedCallback() {
            if (this._canvas)
                return; // already set up
            this._setup();
        }
        disconnectedCallback() {
            this._teardown();
        }
        attributeChangedCallback(_name, oldValue, newValue) {
            if (oldValue === newValue)
                return;
            if (!this._canvas)
                return; // not connected yet; connectedCallback handles it
            this._teardown();
            this._setup();
        }
        // --- Public imperative API -------------------------------------------------
        /** Set the graph builder. Renders immediately if already connected. */
        set graph(fn) {
            this._graphFn = fn;
            if (this._canvas)
                this._build();
        }
        get graph() {
            return this._graphFn;
        }
        /** Re-run the builder and re-render (e.g. after external data changes). */
        refresh() {
            this._build();
        }
        get camera() {
            return this._camera;
        }
        // --- Internal helpers -------------------------------------------------------
        _readOptions() {
            const opts = {};
            const w = this.getAttribute("width");
            if (w && !Number.isNaN(Number(w)))
                opts.pixelWidth = Number(w);
            const h = this.getAttribute("height");
            if (h && !Number.isNaN(Number(h)))
                opts.pixelHeight = Number(h);
            const bg = this.getAttribute("background");
            if (bg)
                opts.background = bg;
            return opts;
        }
        _setup() {
            const doc = G.document;
            if (!doc)
                return;
            this._canvas = doc.createElement("canvas");
            this._canvas.style.display = "block";
            this._canvas.style.maxWidth = "100%";
            const opts = this._readOptions();
            this._canvas.width = opts.pixelWidth ?? 800;
            this._canvas.height = opts.pixelHeight ?? 450;
            this.appendChild(this._canvas);
            this._ctx = this._canvas.getContext("2d");
            this._camera = new Camera(opts);
            this._renderer = new CanvasRenderer(this._ctx, this._camera);
            this._interactive = attachInteractiveCamera(this._canvas, this._camera, {
                render: () => this._render(),
                mobjects: this._mobjects,
                onClick: (hit, ev) => this._dispatch("manim-chart-pick", { hit, event: ev }),
                onHover: (hit, ev) => {
                    if (hit?.mobject === this._hoverTarget)
                        return;
                    this._hoverTarget = hit?.mobject ?? null;
                    this._dispatch("manim-chart-hover", { hit, event: ev });
                },
            });
            if (this._graphFn != null)
                this._build();
        }
        _teardown() {
            this._interactive?.detach();
            this._interactive = null;
            if (this._canvas && this._canvas.parentNode === this) {
                this.removeChild(this._canvas);
            }
            this._canvas = null;
            this._ctx = null;
            this._camera = null;
            this._renderer = null;
            this._mobjects = [];
            this._hoverTarget = null;
        }
        _build() {
            if (!this._graphFn)
                return;
            const result = this._graphFn();
            const next = Array.isArray(result) ? result : [result];
            // attachInteractiveCamera() captured `opts.mobjects` by reference at
            // attach time, so refresh() must mutate that same array in place
            // rather than reassigning `this._mobjects` (which would leave picking
            // reading a stale, now-detached array).
            this._mobjects.length = 0;
            this._mobjects.push(...next);
            this._render();
        }
        _render() {
            this._renderer?.renderScene(this._mobjects);
        }
        _dispatch(type, detail) {
            try {
                if (typeof G.CustomEvent === "function") {
                    this.dispatchEvent(new G.CustomEvent(type, { detail, bubbles: true }));
                }
                else if (typeof this.dispatchEvent === "function") {
                    this.dispatchEvent({ type, detail });
                }
            }
            catch { /* dispatch not supported in this host — ignore */ }
        }
    }
    _builtClass = ManimChartElementImpl;
    return _builtClass;
}
/**
 * The exported custom element class.
 *
 * In a browser this is the real DOM-backed element. In Node (no HTMLElement)
 * it is a harmless placeholder so `typeof ManimChartElement === "function"`
 * always holds and importing this module never throws.
 */
export const ManimChartElement = (() => {
    if (typeof G.HTMLElement !== "undefined") {
        try {
            return buildElementClass();
        }
        catch {
            // Fall through to placeholder if building fails for any reason.
        }
    }
    return class ManimChartElement {
        _graphFn = null;
        static get observedAttributes() {
            return ["width", "height", "background"];
        }
        set graph(fn) {
            this._graphFn = fn;
        }
        get graph() {
            return this._graphFn;
        }
    };
})();
/**
 * Register the <manim-chart> custom element.
 *
 * @param tag Custom element tag name (defaults to "manim-chart").
 * @returns true if registered, false if no DOM is available (Node).
 */
export function defineManimChart(tag = "manim-chart") {
    if (!hasDom())
        return false;
    try {
        if (typeof G.customElements.get === "function" && G.customElements.get(tag)) {
            return true;
        }
        const cls = buildElementClass();
        G.customElements.define(tag, cls);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=chart_element.js.map