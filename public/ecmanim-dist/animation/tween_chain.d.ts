import { Animation } from "./Animation.ts";
import type { AnimationConfig } from "./Animation.ts";
import type { SpringConfig } from "./spring.ts";
export type Ease = (t: number) => number;
/** Linear interpolation — Motion Canvas's `map(from, to, t)`. */
export declare function map(from: number, to: number, t: number): number;
type State = Record<string, any>;
interface TweenAdapter {
    /** Read the current state of every prop the chain touches. */
    read(props: string[]): State;
    /** Apply an interpolated state. */
    apply(state: State): void;
}
export declare class TweenChain extends Animation {
    private adapter;
    private segments;
    private props;
    private resolved;
    constructor(mobjectForScene: any, adapter: TweenAdapter, config?: AnimationConfig);
    /** Append a tween segment toward `target` over `duration` seconds. A raw
     *  (non-object) target is sugar for `{ value }` — the signal-adapter prop
     *  — so `tweenSignal(sig, 1, 2).to(0, 2)` works like MC's signal chains. */
    to(target: State | number | string, duration: number, ease?: Ease): this;
    /** Hold the current state for `duration` seconds. */
    wait(duration: number): this;
    /** Tween back to the state captured at the START of the chain. */
    back(duration: number, ease?: Ease): this;
    private totalDuration;
    /** Content fingerprint for Scene.hashAnimations: two chains over the same
     *  mobject with the same runTime but different props/targets must hash
     *  differently (an `end` tween is not a `fillOpacity` tween). */
    _hashExtra(): string;
    setup(): void;
    interpolateMobject(alpha: number): void;
}
/**
 * Chainable property tween on a mobject (MC's `node().x(300, 1).to(...)`):
 *   tweenTo(circle, { x: 300 }, 1).to({ x: -300 }, 1).wait(0.5).back(1)
 */
export declare function tweenTo(mob: any, target: State, duration: number, ease?: Ease): TweenChain;
/**
 * Tween a signal's value (MC's `signal(2, 0.3)`): returns a chainable
 * animation; the signal updates each frame, so bound/computed consumers
 * follow automatically.
 */
export declare function tweenSignal(signal: any, value: any, duration: number, ease?: Ease): TweenChain;
/**
 * Imperative time tween (MC's `tween(duration, cb)`): calls `cb(easedT)`
 * every frame for `duration` seconds.
 */
export declare function tween(duration: number, cb: (t: number) => void, ease?: Ease): Animation;
export declare const PlopSpring: SpringConfig;
export declare const SmoothSpring: SpringConfig;
export declare const BounceSpring: SpringConfig;
export declare const SwingSpring: SpringConfig;
export declare const JumpSpring: SpringConfig;
export declare const StrikeSpring: SpringConfig;
/**
 * Spring-driven value tween: `springTween(PlopSpring, -400, 400, v =>
 * dot.setX(v))`. `settleTolerance` mirrors MC's optional 4th argument
 * (accepted for signature parity; the spring rate runs to settle).
 */
export declare function springTween(preset: SpringConfig | undefined, from: number, to: number, settleToleranceOrCb: number | ((v: number) => void), maybeCb?: (v: number) => void, config?: AnimationConfig): Animation;
export interface SeededRandom {
    nextFloat(from?: number, to?: number): number;
    nextInt(from: number, to: number): number;
    floatArray(count: number, from?: number, to?: number): number[];
    intArray(count: number, from: number, to: number): number[];
    gauss(mean?: number, stdev?: number): number;
}
/** Deterministic RNG with MC's method surface (`nextInt` upper-exclusive). */
export declare function useRandom(seed?: number): SeededRandom;
export {};
//# sourceMappingURL=tween_chain.d.ts.map