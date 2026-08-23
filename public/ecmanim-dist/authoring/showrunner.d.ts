import type { Provider, Format } from "./formats.ts";
/** A render provider backed by ecmanim's Node renderer. */
export declare const manimRenderProvider: Provider;
export interface TitleCardPlan {
    title: string;
    bullets: string[];
    style?: string;
}
/**
 * A tiny end-to-end Format: turn a topic (+ optional bullets) into a title-card
 * scene and render it. `plan` uses the llm provider if present to expand bullets,
 * else falls back to the given ones. Demonstrates plan → compose → revise.
 */
export declare const titleCardFormat: Format;
//# sourceMappingURL=showrunner.d.ts.map