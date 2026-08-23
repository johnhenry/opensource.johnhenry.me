import { Scene } from "../scene/Scene.ts";
import type { ColorLike } from "../core/types.ts";
export interface DeckCodeBlock {
    language: string;
    source: string;
    /** Parsed Slidev-style `{2,4-6}` step annotation: one entry per reveal
     *  step, each a list of 0-based [start,end] inclusive line ranges to
     *  highlight that step. Empty array = no step annotation (show all lines
     *  highlighted, single step). */
    highlightSteps: Array<Array<[number, number]>>;
}
export interface DeckSlide {
    /** The slide's first `#`/`##`/... heading text, if any. */
    heading?: string;
    /** Non-list, non-code, non-math paragraph lines, joined with "\n". */
    body: string;
    /** Parsed `-`/`*`/`1.` list items (incremental-fragment candidates). */
    bullets: string[];
    /** The slide's first fenced code block, if any. */
    code?: DeckCodeBlock;
    /** The slide's first `$$...$$` block (LaTeX, without the delimiters). */
    math?: string;
    /** Speaker notes: a trailing `<!-- ... -->` block or `<aside
     *  class="notes">...</aside>`, matching Slidev's and reveal.js's own
     *  conventions respectively. */
    notes?: string;
}
/** Parse a deck's markdown source into slides. Pure, no rendering. Splits
 *  on lines that are exactly `---` (a bare horizontal rule / Slidev-style
 *  slide separator); a leading `---`-delimited YAML frontmatter block (if
 *  the document starts with `---`) is skipped entirely, not parsed. */
export declare function parseDeckMarkdown(md: string): DeckSlide[];
export interface DeckConfig {
    /** Hold time (seconds) after each slide's content finishes revealing,
     *  before advancing. Default 0.5. */
    holdTime?: number;
    /** Per-fragment reveal duration (seconds). Default 0.4. */
    fragmentRunTime?: number;
    headingColor?: ColorLike;
    bodyColor?: ColorLike;
    /** Use Scene.autoAnimateToNextSection() (Reveal.js Auto-Animate-style
     *  snapshot+match transition) between slides instead of a hard cut.
     *  Default false (matches nextSection()'s own "strictly opt-in" stance —
     *  auto-animate is a deliberate authorial choice, not automatic, since
     *  matching unrelated same-shape elements by default is surprising). */
    autoAnimate?: boolean;
}
/** Build an ecmanim deck from markdown source: headings -> section titles,
 *  `---` -> slide/section boundaries (via `scene.nextSection(heading, ...,
 *  notes)` -- presenter-mode speaker notes come along for free), bullet
 *  lists -> one `play()` per item (a natural step boundary via
 *  `scene.playRecords`, so `Player.nextStep()`/`prevStep()` navigate
 *  fragments with NO extra API), fenced code -> a `Code` mobject stepped
 *  through its `{2,4-6}`-annotated highlight ranges via
 *  `code.selection(lines(...))` (again, one `play()` per step), `$$...$$`
 *  -> `MathTex` (the caller must have already run `await initMathTex()`,
 *  matching every other MathTex-using demo in this codebase).
 *
 *  Returns a plain `(scene) => Promise<void>` construct function, the same
 *  shape `render()`/`demoRender()` already accept alongside a Scene
 *  subclass (see src/scene/orchestrate.ts's `isSceneLike` dispatch). */
export declare function deckFromMarkdown(md: string, config?: DeckConfig): (scene: Scene) => Promise<void>;
//# sourceMappingURL=deck_markdown.d.ts.map