import { VMobject } from "../mobject/VMobject.ts";
export interface WaveConfig {
    xRange?: [number, number, number];
    amplitude?: number;
    wavelength?: number;
    frequency?: number;
    phase?: number;
    color?: string;
    strokeWidth?: number;
    point?: number[];
}
export declare abstract class WaveCurve extends VMobject {
    amplitude: number;
    wavelength: number;
    frequency: number;
    phase: number;
    xMin: number;
    xMax: number;
    xStep: number;
    time: number;
    private _baseline;
    constructor(config?: WaveConfig);
    /** Displacement y at position x and current time. */
    protected abstract yAt(x: number, t: number): number;
    private _build;
    setTime(t: number): this;
    private get k();
    protected omega(): number;
    protected waveNumber(): number;
}
/** A traveling wave: y = A·sin(kx − ωt + φ). */
export declare class LinearWave extends WaveCurve {
    protected yAt(x: number, t: number): number;
}
/** A standing wave: y = A·sin(kx)·cos(ωt). */
export declare class StandingWave extends WaveCurve {
    protected yAt(x: number, t: number): number;
}
//# sourceMappingURL=waves.d.ts.map