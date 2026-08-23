/** Standard mulberry32 seeded PRNG → a function returning numbers in [0, 1). */
export declare function mulberry32(seed: number): () => number;
/**
 * Deterministic lattice value in [-1, 1] for integer index `i` under `seed`.
 * BIT-COMPATIBILITY CONTRACT: this exact mix is what wiggle() has always
 * sampled; regression vectors in test/noise.test.ts pin it down.
 */
export declare function latticeValue1D(seed: number, i: number): number;
/**
 * Smooth 1D value noise in [-1, 1]: lattice values at integers, smootherstep
 * blend between. Continuous in x; pure of sampling order (lattice cached).
 * Note: wiggle() uses the SAME lattice but a sigmoid blend — the two agree at
 * integer x and differ slightly between (wiggle's shape is frozen for compat).
 */
export declare function valueNoise1D(seed: number): (x: number) => number;
/** Seeded 2D simplex noise in roughly [-1, 1]. */
export declare function simplex2D(seed: number): (x: number, y: number) => number;
/** Seeded 3D simplex noise in roughly [-1, 1]. */
export declare function simplex3D(seed: number): (x: number, y: number, z: number) => number;
export interface FbmOptions {
    /** Number of noise layers summed (default 4). */
    octaves?: number;
    /** Frequency multiplier per octave (default 2). */
    lacunarity?: number;
    /** Amplitude multiplier per octave (default 0.5). */
    gain?: number;
}
/**
 * Fractal Brownian motion over a 2D noise field: octaves of the base noise at
 * increasing frequency and decreasing amplitude, normalized so the result
 * stays in roughly the base noise's range.
 */
export declare function fbm(noise: (x: number, y: number) => number, options?: FbmOptions): (x: number, y: number) => number;
/** 3D counterpart of {@link fbm}. */
export declare function fbm3(noise: (x: number, y: number, z: number) => number, options?: FbmOptions): (x: number, y: number, z: number) => number;
//# sourceMappingURL=noise.d.ts.map