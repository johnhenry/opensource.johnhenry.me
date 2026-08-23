import type { Format } from "./formats.ts";
export interface ExplainerSection {
    heading: string;
    bullets?: string[];
    /** Inline diagram DSL (see docs/animation-presentation.md) shown beside/below the bullets. */
    diagram?: string;
    /** Narration text; spoken via the voiceover TTS provider named by params.tts. */
    narration?: string;
    /** Seconds to hold the section when there is no narration (default 2.5). */
    holdSeconds?: number;
}
export interface ExplainerPlan {
    title: string;
    subtitle?: string;
    sections: ExplainerSection[];
    outro?: string;
    style: string;
    tts: string;
}
export declare const explainerFormat: Format;
export interface ChartDatum {
    label: string;
    value: number;
}
export interface ChartRevealPlan {
    title: string;
    data: ChartDatum[];
    unit?: string;
    color: string;
    style: string;
    holdSeconds: number;
}
export declare const chartRevealFormat: Format;
export interface QuoteCardPlan {
    quote: string;
    attribution?: string;
    aspectRatio: string;
    style: string;
    holdSeconds: number;
}
export declare const quoteCardFormat: Format;
//# sourceMappingURL=formats_builtin.d.ts.map