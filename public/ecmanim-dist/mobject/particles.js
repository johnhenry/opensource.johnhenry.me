// A deterministic particle system. THE design constraint: every particle is a
// CLOSED-FORM function of (seed, index, time) — continuous-emission particle i
// is born at i/rate, its randomness comes from a per-particle mulberry32
// stream, and its position under gravity + linear drag has an analytic
// solution. No mutable simulation state exists, so scrubbing, backward seeks,
// alwaysRedraw, and the content-hash render cache all work for free.
//
// Rendering: raster-drawn directly to the canvas by CanvasRenderer's
// drawParticles (ImageMobject tier — thousands of VMobjects would crawl).
// SVG/WebGL backends skip particles (documented in docs/renderers.md).
import { Mobject } from "./Mobject.js";
import { mulberry32 } from "../core/noise.js";
import { Color } from "../core/color.js";
const asRange = (r, fallback) => r == null ? fallback : typeof r === "number" ? [r, r] : r;
export class ParticleSystem extends Mobject {
    _isParticles = true;
    /** The explicit clock (seconds since the system started emitting). */
    time = 0;
    shape;
    _cfg;
    _seed;
    _rate;
    _lifetime;
    _speed;
    _size;
    _opacity;
    _gravity;
    _drag;
    _ramp;
    _max;
    _bursts = [];
    constructor(config = {}) {
        super(config);
        this._cfg = config;
        this._seed = config.seed ?? 0;
        this._rate = config.rate ?? 20;
        this._lifetime = asRange(config.lifetime, [1, 2]);
        this._speed = asRange(config.speed, [1, 2]);
        this._size = asRange(config.size, [0.08, 0.08]);
        this._opacity = asRange(config.particleOpacity, [1, 0]);
        this._gravity = typeof config.gravity === "number" ? [0, config.gravity] : (config.gravity ?? [0, 0]);
        this._drag = config.drag ?? 0;
        this._ramp = (config.colorRamp?.length ? config.colorRamp : ["#FFFFFF"]).map((c) => Color.parse(c));
        this._max = config.maxParticles ?? 2000;
        this.shape = config.shape ?? "circle";
        this._buildBox();
        if (config.autoAdvance ?? true) {
            this.addUpdater((_m, dt) => { this.time += dt; });
        }
    }
    /** Jump the particle clock (either direction — everything is closed-form). */
    setTime(t) {
        this.time = t;
        return this;
    }
    /**
     * Register a deterministic burst cohort: `count` extra particles all born
     * at `atT`, with optional emission overrides. Bursts are part of the
     * system's definition, not events — registering the same bursts always
     * yields the same animation, whenever the registration happens.
     */
    burst(atT, count, opts = {}) {
        this._bursts.push({ atT, count, ...opts });
        this._buildBox();
        return this;
    }
    // Conservative world bbox: emitter extent + max ballistic travel. Effects
    // padding and the render cache both key off this box.
    _buildBox() {
        const [ex, ey] = this._cfg.emitterPoint ?? [0, 0, 0];
        let reach = this._cfg.emitterRadius ?? 0;
        if (this._cfg.emitterLine) {
            const [a, b] = this._cfg.emitterLine;
            reach += Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
        }
        const maxLife = this._lifetime[1];
        const maxSpeed = Math.max(this._speed[1], ...this._bursts.map((bu) => asRange(bu.speed, this._speed)[1]));
        const [gx, gy] = this._gravity;
        const g = Math.hypot(gx, gy);
        // With drag k, travel is bounded by (v0 + g*T)/k; without, v0*T + g*T^2/2.
        const travel = this._drag > 0
            ? (maxSpeed + g * maxLife) / this._drag
            : maxSpeed * maxLife + (g * maxLife * maxLife) / 2;
        const r = reach + travel + this._size[0] / 2 + this._size[1] / 2;
        this.points = [
            [ex - r, ey + r, 0],
            [ex + r, ey + r, 0],
            [ex + r, ey - r, 0],
            [ex - r, ey - r, 0],
        ];
    }
    // Independent random stream per (cohort, index). Cohort 0 is the continuous
    // stream; bursts are cohorts 1..N in registration order.
    _rng(cohort, i) {
        return mulberry32(((this._seed * 0x9e3779b1) ^ (cohort * 0xc2b2ae35) ^ (i * 0x85ebca77)) >>> 0);
    }
    _emit(out, t, cohort, i, birth, speedRange, direction, spread) {
        const age = t - birth;
        if (age < 0)
            return;
        const rng = this._rng(cohort, i);
        // FIXED draw order — inserting a draw would re-randomize every scene.
        const lifetime = this._lifetime[0] + rng() * (this._lifetime[1] - this._lifetime[0]);
        const speed = speedRange[0] + rng() * (speedRange[1] - speedRange[0]);
        const angle = direction + (rng() - 0.5) * spread;
        const spawnA = rng();
        const spawnB = rng();
        if (age >= lifetime)
            return;
        // Spawn position.
        const [ex, ey] = this._cfg.emitterPoint ?? [0, 0, 0];
        let x0 = ex, y0 = ey;
        if (this._cfg.emitterLine) {
            const [a, b] = this._cfg.emitterLine;
            x0 = a[0] + spawnA * (b[0] - a[0]);
            y0 = a[1] + spawnA * (b[1] - a[1]);
        }
        else if (this._cfg.emitterRadius) {
            const rr = this._cfg.emitterRadius * Math.sqrt(spawnA);
            const aa = spawnB * Math.PI * 2;
            x0 += rr * Math.cos(aa);
            y0 += rr * Math.sin(aa);
        }
        // Analytic ballistic position under gravity g and linear drag k:
        //   k > 0: p(t) = p0 + (v0 - g/k)(1 - e^{-kt})/k + (g/k) t
        //   k = 0: p(t) = p0 + v0 t + g t^2 / 2
        const vx = speed * Math.cos(angle);
        const vy = speed * Math.sin(angle);
        const [gx, gy] = this._gravity;
        const k = this._drag;
        let x, y;
        if (k > 0) {
            const decay = (1 - Math.exp(-k * age)) / k;
            x = x0 + (vx - gx / k) * decay + (gx / k) * age;
            y = y0 + (vy - gy / k) * decay + (gy / k) * age;
        }
        else {
            x = x0 + vx * age + (gx * age * age) / 2;
            y = y0 + vy * age + (gy * age * age) / 2;
        }
        const life = age / lifetime;
        const size = this._size[0] + (this._size[1] - this._size[0]) * life;
        const opacity = this._opacity[0] + (this._opacity[1] - this._opacity[0]) * life;
        // Color ramp across life fraction.
        const ramp = this._ramp;
        let color;
        if (ramp.length === 1)
            color = ramp[0];
        else {
            const pos = life * (ramp.length - 1);
            const lo = Math.min(ramp.length - 2, Math.floor(pos));
            color = Color.lerp(ramp[lo], ramp[lo + 1], pos - lo);
        }
        out.push({ x, y, size, opacity: Math.max(0, opacity), color, life });
    }
    /**
     * All particles alive at time `t` (defaults to the system clock), computed
     * closed-form — calling this for any t in any order gives identical
     * results. This is exactly what the renderer draws.
     */
    sampleParticles(t = this.time) {
        const out = [];
        if (this._rate > 0) {
            const born = Math.min(this._max, Math.floor(t * this._rate) + 1);
            for (let i = 0; i < born; i++) {
                this._emit(out, t, 0, i, i / this._rate, this._speed, this._cfg.direction ?? Math.PI / 2, this._cfg.spread ?? Math.PI / 4);
            }
        }
        this._bursts.forEach((b, bi) => {
            const speedRange = asRange(b.speed, this._speed);
            const direction = b.direction ?? this._cfg.direction ?? Math.PI / 2;
            const spread = b.spread ?? this._cfg.spread ?? Math.PI * 2;
            for (let i = 0; i < b.count; i++) {
                this._emit(out, t, bi + 1, i, b.atT, speedRange, direction, spread);
            }
        });
        return out;
    }
    copy() {
        const c = super.copy();
        // Object.assign aliases the bursts array -- give the copy its own.
        c._bursts = this._bursts.map((b) => ({ ...b }));
        return c;
    }
}
//# sourceMappingURL=particles.js.map