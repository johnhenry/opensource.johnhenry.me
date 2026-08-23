import { VMobject } from "../mobject/VMobject.ts";
import { Group, Mobject } from "../mobject/Mobject.ts";
import { Text } from "../mobject/text/Text.ts";
import { ValueTracker, DecimalNumber } from "../mobject/value_tracker.ts";
import { Animation } from "../animation/Animation.ts";
import type { Theme, ThemeInput } from "./theme.ts";
export interface TemplatePiece {
    group: Group;
    animateIn(): Animation;
    animateOut(): Animation;
}
type ThemeArg = Theme | ThemeInput | string | undefined;
export interface TitleCardOptions {
    subtitle?: string;
    theme?: ThemeArg;
    point?: number[];
}
/** A centered title with an accent rule and optional subtitle. */
export declare function titleCard(title: string, options?: TitleCardOptions): TemplatePiece & {
    title: Text;
    subtitle: Text | null;
    rule: VMobject;
};
export interface LowerThirdOptions {
    role?: string;
    theme?: ThemeArg;
    /** Frame size the piece anchors into (default 14.22 x 8). */
    frameWidth?: number;
    frameHeight?: number;
}
/** A name/role tag anchored to the bottom-left with an accent bar. */
export declare function lowerThird(name: string, options?: LowerThirdOptions): TemplatePiece & {
    name: Text;
    role: Text | null;
    bar: VMobject;
};
export interface StatCounterOptions {
    from?: number;
    decimals?: number;
    unit?: string;
    theme?: ThemeArg;
    point?: number[];
}
/**
 * A big animated number with a label. `playThrough(runTime)` returns the
 * animation that counts from `from` to `to` (the DecimalNumber follows a
 * ValueTracker via an updater, so any tween/rate function works).
 */
export declare function statCounter(label: string, to: number, options?: StatCounterOptions): TemplatePiece & {
    tracker: ValueTracker;
    number: DecimalNumber;
    label: Text;
    playThrough(runTime?: number): Animation;
};
export interface SocialShortOptions {
    header?: Mobject;
    content?: Mobject;
    caption?: Mobject;
    theme?: ThemeArg;
    /** 9:16 world frame (default 4.5 x 8 — frameHeight 8 at 9:16). */
    frameWidth?: number;
    frameHeight?: number;
}
/**
 * A 9:16 vertical-video scaffold: header / content / caption slots with safe
 * margins. Provided mobjects are moved into their slots (and scaled down to
 * fit the safe width if needed); each slot is also returned so demos can add
 * to them later.
 */
export declare function socialShort(options?: SocialShortOptions): TemplatePiece & {
    slots: {
        header: Group;
        content: Group;
        caption: Group;
    };
};
export interface ChartRevealOptions {
    theme?: ThemeArg;
    lagRatio?: number;
}
/**
 * Staggered entrance for a chart: reveals a BarChart's `bars`, a PieChart's
 * `slices`, or any group's submobjects one by one.
 */
export declare function chartReveal(chart: any, options?: ChartRevealOptions): TemplatePiece;
export interface OutroCardOptions {
    handle?: string;
    url?: string;
    theme?: ThemeArg;
}
/** A closing card: call-to-action title, handle/url, accent frame. */
export declare function outroCard(title: string, options?: OutroCardOptions): TemplatePiece & {
    title: Text;
    handle: Text | null;
    frame: VMobject;
};
export {};
//# sourceMappingURL=templates.d.ts.map