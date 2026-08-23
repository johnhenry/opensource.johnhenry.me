// Analytic waves: a time-parameterized sine curve (VMobject polyline) that
// advances via an updater. Formula-based, deterministic. LinearWave (traveling)
// and StandingWave mirror manim-physics' analytic wave mobjects.
import { VMobject } from "../mobject/VMobject.js";
import { Color } from "../core/color.js";
export class WaveCurve extends VMobject {
    amplitude;
    wavelength;
    frequency;
    phase;
    xMin;
    xMax;
    xStep;
    time = 0;
    _baseline;
    constructor(config = {}) {
        super();
        const [xMin, xMax, xStep] = config.xRange ?? [-5, 5, 0.1];
        this.xMin = xMin;
        this.xMax = xMax;
        this.xStep = xStep;
        this.amplitude = config.amplitude ?? 1;
        this.wavelength = config.wavelength ?? 2;
        this.frequency = config.frequency ?? 1;
        this.phase = config.phase ?? 0;
        this._baseline = config.point ?? [0, 0, 0];
        this.strokeColor = Color.parse(config.color ?? "#58C4DD");
        this.strokeWidth = config.strokeWidth ?? 4;
        this.fillOpacity = 0;
        this._build();
        this.addUpdater((_m, dt) => { this.time += dt; this._build(); });
    }
    _build() {
        const pts = [];
        for (let x = this.xMin; x <= this.xMax + 1e-9; x += this.xStep) {
            pts.push([this._baseline[0] + x, this._baseline[1] + this.yAt(x, this.time), this._baseline[2]]);
        }
        if (pts.length >= 2)
            this.setPointsAsCorners(pts);
        this.strokeColor = Color.parse(this.strokeColor);
    }
    setTime(t) { this.time = t; this._build(); return this; }
    get k() { return (2 * Math.PI) / this.wavelength; }
    omega() { return 2 * Math.PI * this.frequency; }
    waveNumber() { return this.k; }
}
/** A traveling wave: y = A·sin(kx − ωt + φ). */
export class LinearWave extends WaveCurve {
    yAt(x, t) {
        return this.amplitude * Math.sin(this.waveNumber() * x - this.omega() * t + this.phase);
    }
}
/** A standing wave: y = A·sin(kx)·cos(ωt). */
export class StandingWave extends WaveCurve {
    yAt(x, t) {
        return this.amplitude * Math.sin(this.waveNumber() * x + this.phase) * Math.cos(this.omega() * t);
    }
}
//# sourceMappingURL=waves.js.map