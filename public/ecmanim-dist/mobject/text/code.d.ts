import { VGroup } from "../VMobject.ts";
import type { TextConfig } from "./Text.ts";
import { Animation } from "../../animation/Animation.ts";
import type { AnimationConfig } from "../../animation/Animation.ts";
import { AnimationGroup } from "../../animation/composition.ts";
import type { AutoMatchingConfig } from "../../animation/auto_matching.ts";
export interface CodeConfig extends TextConfig {
    language?: string;
    tabWidth?: number;
    lineNumbers?: boolean;
    lineSpacing?: number;
    style?: Record<string, string>;
    background?: "rectangle" | "window";
    backgroundColor?: string;
    cornerRadius?: number;
}
/** A half-open-ish source range in EXPANDED (tab -> spaces) coordinates:
 *  lines are 0-based, cols count characters; end is inclusive of the line,
 *  exclusive of endCol. */
export interface CodeRange {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
}
/** Whole-line range: `lines(2)` = line 2, `lines(1, 3)` = lines 1-3
 *  (0-based, inclusive) — MC's `lines()` selection helper. */
export declare function lines(from: number, to?: number): CodeRange;
/** Single-word range at (line, col) spanning `length` chars (MC's `word()`). */
export declare function word(line: number, col: number, length?: number): CodeRange;
type CodeEditMarker = {
    __codeEdit: "insert";
    text: string;
} | {
    __codeEdit: "remove";
    text: string;
} | {
    __codeEdit: "edit";
    from: string;
    to: string;
};
/** Marks text ADDED by a `code.edit` template (absent before, present after). */
export declare function insert(text: string): CodeEditMarker;
/** Marks text REMOVED by a `code.edit` template (present before, absent after). */
export declare function remove(text: string): CodeEditMarker;
/** Marks text REPLACED by a `code.edit` template (`from` before, `to` after). */
export declare function edit(from: string, to: string): CodeEditMarker;
/** Result of `code.edit(...)`: play `animation`, then keep using `target`
 *  (same contract as `matchTex`). */
export interface CodeEditResult {
    animation: AnimationGroup;
    target: Code;
}
export declare class Code extends VGroup {
    codeString: string;
    language: string;
    tabWidth: number;
    showLineNumbers: boolean;
    style: Record<string, string>;
    codeLines: VGroup;
    lineNumbers: VGroup;
    codeTokens: VGroup;
    background: any;
    private _tokenLoc;
    private _config;
    constructor(codeOrConfig?: string | CodeConfig, config?: CodeConfig);
    private _seedMatchIds;
    /**
     * Morph this Code's tokens into `other`'s via TransformMatchingAuto (the
     * Reveal.js Auto-Animate / Framer Motion layoutId idea), reusing the
     * matching machinery as-is -- every token is already a `Text` mobject
     * keyed by its own literal string, so no new engine code is needed, just
     * disambiguating repeated tokens via `matchId` before matching.
     *
     * Known, deliberate limitation: because the key includes literal
     * `line:col`, inserting or removing a line shifts every later token's
     * key, so content below the change fades out/in rather than morphing --
     * the same trade-off real manim's own `TransformMatchingTex` has. This is
     * not a bug to fix here; a true diff/patience-alignment algorithm would be
     * a separate, larger feature.
     *
     * Cleanup gotcha (confirmed via a real end-to-end scene render, not just
     * this file's own unit tests): tokens present ONLY in `other` (e.g. a
     * newly-inserted argument) are real children of `other`, individually
     * `FadeIn`-ed by the underlying `TransformMatchingAuto` -- `Scene.play()`
     * auto-adds any animation's introduced mobjects directly to the scene,
     * even though `other` itself was never explicitly added. Fading out only
     * `this` afterward leaves those new-token mobjects behind as permanent,
     * untracked scene members. Fade out `other` too (in addition to `this`)
     * to fully clear the diff's result -- same pattern real manim's
     * `TransformMatchingTex` callers already have to follow.
     */
    diffTo(other: Code, config?: AutoMatchingConfig): AnimationGroup;
    /** The source with tabs expanded — the coordinate space CodeRange,
     *  findFirstRange() and replace() all use. */
    expandedCode(): string;
    /**
     * Motion Canvas's `code().edit(duration)\`...\`` as a tagged template:
     * plain template text is unchanged, `${insert(x)}` appears only after,
     * `${remove(y)}` only before, `${edit(a, b)}` swaps a -> b. Returns the
     * diffTo-based animation plus the resulting Code (anchored at this
     * Code's top-left):
     *
     * ```ts
     * const { animation, target } = code.edit(0.8)\`const x = \${edit("1", "2")};\`;
     * await scene.play(animation);
     * ```
     */
    edit(duration?: number): (strings: TemplateStringsArray, ...subs: Array<CodeEditMarker | string>) => CodeEditResult;
    private _tokenInRange;
    /**
     * Highlight a range (or ranges) by dimming everything else — MC's
     * `code.selection(lines(5, 8), 0.3)`. Pass `null` to clear (everything
     * back to full opacity). Returns an Animation to play():
     *
     * ```ts
     * await scene.play(code.selection(lines(1, 2)));
     * await scene.play(code.selection(code.findFirstRange("return")!));
     * await scene.play(code.selection(null)); // reset
     * ```
     */
    selection(sel: CodeRange | CodeRange[] | null, duration?: number, config?: AnimationConfig & {
        dimOpacity?: number;
    }): Animation;
    /** First occurrence of `pattern` (string or RegExp) in the expanded
     *  source, as a CodeRange — MC's `findFirstRange()`. Null if absent. */
    findFirstRange(pattern: string | RegExp): CodeRange | null;
    /**
     * Rebuild this Code IN PLACE around new source (identity-preserving, like
     * PieChart.setValues): same styling config, background top-left stays
     * anchored. The instant counterpart of edit() — use inside updaters or
     * between animations.
     */
    setCode(code: string): this;
    /** Replace `range` (expanded coordinates) with `text`, instantly.
     *  Also still accepts a Mobject (manim's replace-in-space) — the two
     *  signatures share a name by dispatch, MC's vs manim's `replace`. */
    replace(range: CodeRange, text: string): this;
    replace(other: any, config?: {
        dimToMatch?: number;
        stretch?: boolean;
    }): this;
    /** Prepend text to the source, instantly (MC's `code.prepend()`). */
    prepend(text: string): this;
    /** Append text to the source, instantly (MC's `code.append()`). */
    append(text: string): this;
}
export {};
//# sourceMappingURL=code.d.ts.map