---
title: 'Math Plus: signal & media'
description: The fft, signal, and image packages — SciPy's useful slice in pure JS, with the convention deviations you need to know before porting NumPy/SciPy code.
---

Three packages, all pure JS (no WASM, no GPU — "reference now, native later"), all `Tensor`-in/`Tensor`-out on [`tensor-core`](/math/math-plus-tensor/), all differential-tested against real NumPy/SciPy oracles.

| Package | What it is |
|---|---|
| `@johnhenry/math-plus-fft` | `ComplexTensor` + `fft`/`ifft`/`fftPadded`/`fft2`/`fftn`/`fftshift`/`rfft`/`irfft` |
| `@johnhenry/math-plus-signal` | `convolve`/`correlate`, `stft`/`istft`/`welch`, `findPeaks`, `butter`+`sosFilter`+`freqz`, `resamplePoly` |
| `@johnhenry/math-plus-image` | `resize` (nearest/bilinear) + `normalize` for ML/media pipelines |

```bash
npm install @johnhenry/math-plus-fft @johnhenry/math-plus-signal @johnhenry/math-plus-image
```

## If you're porting NumPy/SciPy code, read this table first

These are the deliberate v1 deviations — each is documented and tested, none will silently corrupt your data, but every one will surprise a SciPy user:

| You expect (NumPy/SciPy) | You get here |
|---|---|
| `rfft(x)` returns N/2+1 bins | **The full N-point Hermitian spectrum** — `rfft(x).size === x.size` |
| FFT of any length | **Power-of-two only** for `fft`/`ifft`; `fftPadded` zero-pads 1-D inputs, and there is *no* padded escape hatch for `fft2`/`fftn` |
| `stft` returns onesided bins | Full `nperseg` bins per frame |
| `welch` one-sided, doubled PSD | **Two-sided** (`return_onesided=False`), `fs` fixed at 1.0, Nyquist labeled `-0.5` per `fftfreq` |
| `butter` SOS coefficients match scipy's bytes | End-to-end filter *behavior* matches to 1e-6; section-by-section coefficients don't (scipy's own pole/zero grouping isn't stable either) |
| `resample_poly` bit-compatibility | Hamming-windowed sinc (not Kaiser β=5.0), direct upsample-then-convolve (not true polyphase) — a perf gap, not a correctness one |
| Output dtype follows input | **fft/signal always emit f64** regardless of input dtype |

## The dtype trap that will actually bite you

`Tensor.from([...])` defaults to **f32**. The fft/signal kernels emit f64
regardless — and there's a corner where an f32 input to `resamplePoly` with
`up === down === 1` returns a *mislabeled* tensor (an `f64`-tagged
`Float32Array`, via the identity early-return). Just always pass
`{ dtype: "f64" }` when building inputs for this cluster.

## stft/istft: the defaults can throw

`nperseg` must be a power of two, and the default is
`min(256, signal.length)` — so a 100-sample signal's *default* configuration
throws. There's no boundary padding: samples past the last full frame are
dropped, and `istft` reconstruction is least accurate in the first/last
half-window (WOLA edge effects, not a bug). Default window is periodic Hann
at 50% overlap, which is COLA-compliant — round-trips near-exactly away from
the edges.

## Argument-order gotchas

- `sosFilter(sos, signal)` — filter first, scipy's order.
- `butter(order, wn, { btype })` — `wn` normalized to **Nyquist = 1**,
  strictly `0 < wn < 1`; bandpass/bandstop take a `[low, high]` tuple.
- `resamplePoly(signal, up, down)` — positional positive integers,
  GCD-reduced internally.
- `resize(img, { height, width })` — named fields, height first, and the
  layout is **channel-last** (`[H, W, C]` / `[N, H, W, C]`) with no layout
  option: an NCHW tensor of the right rank is silently misinterpreted.

## image: deliberately not an image library

Float dtypes only (uint8 pixels are explicitly out of scope in v1 — no
rounding/clamping semantics designed yet). No alpha or color-space
awareness: channels are opaque independent scalars, so RGBA alpha
interpolates like any other channel. Bilinear uses half-pixel centers with
edge clamping (TF/PyTorch `align_corners=false`); no antialiasing on
downscale, no bicubic/lanczos.

## findPeaks semantics worth knowing

Endpoints are never peaks; plateaus report their floor-midpoint index;
filters apply `height` → `prominence` → `distance` in that order, with
distance ties resolved greedily tallest-first (scipy's algorithm). The
distance filter carries a perf regression test from issue #101 — it was
accidentally O(n²) (4.6 s at 40k candidate peaks) and is now near-linear.

## Where the deeper docs are

Each package's README in the [math-plus repo](https://github.com/johnhenry/math-plus)
carries full API tables, and `examples/04-fft-and-signal.mjs` /
`examples/05-image-ops.mjs` there are runnable. SciPy differential tests
skip (never fail) without a Python oracle — set
`MATH_PLUS_SCIPY_ORACLE_PYTHON` to run them locally.
