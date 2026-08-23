/** A builder returns either a single mobject or an array of top-level mobjects. */
export type ChartGraphBuilder = () => any | any[];
/**
 * The exported custom element class.
 *
 * In a browser this is the real DOM-backed element. In Node (no HTMLElement)
 * it is a harmless placeholder so `typeof ManimChartElement === "function"`
 * always holds and importing this module never throws.
 */
export declare const ManimChartElement: any;
/**
 * Register the <manim-chart> custom element.
 *
 * @param tag Custom element tag name (defaults to "manim-chart").
 * @returns true if registered, false if no DOM is available (Node).
 */
export declare function defineManimChart(tag?: string): boolean;
//# sourceMappingURL=chart_element.d.ts.map