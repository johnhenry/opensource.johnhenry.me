/** In-place radix-2 FFT. `re`/`im` length must be a power of two. */
export declare function fftInPlace(re: Float64Array, im: Float64Array): void;
/** Round up to the next power of two. */
export declare function nextPow2(n: number): number;
/**
 * Magnitude spectrum of a real window (a Hann window is applied). Returns
 * `size/2` bins in [0, ∞); index 0 = DC/bass … up to Nyquist. `size` must be a
 * power of two; the window is zero-padded/truncated to `size`.
 */
export declare function magnitudeSpectrum(window: ArrayLike<number>, size: number): Float64Array;
//# sourceMappingURL=fft.d.ts.map