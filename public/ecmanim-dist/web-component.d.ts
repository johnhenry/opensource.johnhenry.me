/**
 * The exported custom element class.
 *
 * In a browser this is the real DOM-backed element. In Node (no HTMLElement)
 * it is a harmless placeholder so that `typeof ManimPlayerElement === "function"`
 * always holds and importing this module never throws.
 */
export declare const ManimPlayerElement: any;
/**
 * Register the <manim-player> custom element.
 *
 * @param tag Custom element tag name (defaults to "manim-player").
 * @returns true if registered, false if no DOM is available (Node).
 */
export declare function defineManimPlayer(tag?: string): boolean;
//# sourceMappingURL=web-component.d.ts.map