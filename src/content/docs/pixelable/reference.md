---
title: "Reference"
description: "Every pixelable element's attributes, properties, methods, events, and CSS parts, generated from the code."
sidebar:
  order: 3
---

<!-- Generated: copied from pixelable's docs/reference.md, which is generated from custom-elements.json. Re-copy it when pixelable changes. -->

Every stable element's attributes, properties, methods, events, and CSS custom properties, generated from the code. Each element's guide (linked) explains how to use it.

## `<pixel-adjust>`

A pixel effect: brightness, contrast, saturation, and hue. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-adjust/readme.md) · module `@johnhenry/pixelable/pixel-adjust`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `brightness` |  | `number` | Multiplier: 1 is unchanged, 0 is black. Default 1. |
| `contrast` |  | `number` | Multiplier around mid-gray: 1 is unchanged, 0 is flat gray. Default 1. |
| `saturation` |  | `number` | Multiplier: 1 is unchanged, 0 is grayscale. Default 1. |
| `hue` |  | `number` | Rotation in degrees. Default 0. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-canvas>`

Pixel effects on any image, video, canvas, or pixel sprite. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-canvas/readme.md) · module `@johnhenry/pixelable/pixel-canvas`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `width` | `width` | `number` | Working width in pixels: the source is scaled to it (keeping its aspect ratio) before the effects run. Smaller is faster and chunkier. Default: the source's own width. |
| `height` | `height` | `number` | Working height, if `width` isn't given. |
| `effects` | `effects` | `string` | Effects to apply, in order, like CSS `filter`: `mosaic(4) palette(gameboy, ordered) adjust(contrast 1.3)`. They run after any effect elements inside. |
| `swatches` | `swatches` | `number` | Publish the result's N most common colors as `--pixel-swatch-1` … `--pixel-swatch-N` custom properties (and the `palette` property). Default: none. |
| `swatches-target` | `swatchesTarget` | `string` | A selector for more elements to set those custom properties on (for example `html`, to theme the page). They're always set on the `<pixel-canvas>` itself. |
| `fps` |  | `number` | Redraw at this rate, so effects that change over time (`glitch`, `wave`, your own) animate even on a still image. Without it, it redraws only when something changes (or every frame of a playing video). |
| `paused` | `paused` | `boolean` | Stops the clock effects animate by, and the `fps` redraws. Reflects; write it in markup to start paused. |
| `html` | `html` | `boolean` | Experimental: draw its own HTML content (live, and still interactive) through the effects, where the browser supports HTML-in-canvas; elsewhere the content shows as it is. Without `width`/`height`, one working pixel is one CSS pixel. |
| `gpu` | `gpu` | `boolean` | Run the effects on the GPU (WebGL2) when every effect in the chain can: the source is uploaded once and nothing is read back (unless `swatches` needs it). Otherwise, or without WebGL2, they run on the CPU as usual. `renderer` says which ran. |
| `transition` | `transition` | `string` | Animate changes to `effects` over this long (`400ms`, `0.5s`): numbers in the same effects are interpolated; a different list of effects cross-fades. Not for visitors who prefer reduced motion. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `time` (read-only) | `number` | Seconds on the clock that effects animate by. It runs while the element is connected and not paused (and, for visitors who prefer reduced motion, only once `play()` is called). |
| `paused` (read-only) | `boolean` | Whether the clock is paused. |
| `source` (read-only) | `Element \| null` | What's being drawn: the first element inside that's an `<img>`, `<video>`, or `<canvas>`, or that exposes a `canvas` property (like `<pixel-sprite>`). |
| `effectElements` (read-only) | `Element[]` | The effect elements wrapped around the source, in the order they run (innermost first). Disabled ones are included. |
| `effects` | `string` | Mirrors the `effects` attribute. |
| `swatches` | `number` | How many swatches to publish. Mirrors the `swatches` attribute. |
| `swatchesTarget` | `string` | Mirrors the `swatches-target` attribute. |
| `palette` (read-only) | `string[]` | With `swatches`: the result's most common colors, as `#rrggbb`, most common first. Empty otherwise. |
| `canvas` (read-only) | `HTMLCanvasElement` | The canvas showing the result (in the shadow root). |
| `gpu` | `boolean` | Mirrors the `gpu` attribute. |
| `html` | `boolean` | Mirrors the `html` attribute. |
| `transition` | `string` | Mirrors the `transition` attribute. |
| `renderer` (read-only) | `string` | Where the last redraw ran: `"gpu"`, `"cpu"`, or `""` before the first. |
| `width` | `number` | Mirrors the `width` attribute. |
| `height` | `number` | Mirrors the `height` attribute. |

**Methods**

| Method | Description |
|---|---|
| `play()` | Start or resume the clock (and the `fps` redraws). |
| `pause()` | Pause the clock where it is. |
| `captureStream(fps)` | A video stream of the result, like `HTMLCanvasElement.captureStream()`. |
| `record(options)` | Record the result as a video (WebM where supported, else MP4), for `duration` seconds. Effects that change over time need `fps` (or a playing video) to animate while it records. |
| `toGIF(options)` | The result as an animated GIF, at the working size: `frames` frames (or `duration` seconds' worth) sampled `fps` times a second. Effects that change over time need `fps` (or a playing video) to animate while it captures. `loop`: 0 repeats forever, -1 plays once. |
| `toText(options)` | The result as text: with a `glyphs()` effect (or `<pixel-glyphs>`) in the chain, the characters it chose, one line per row; otherwise the result converted with `options` (the same as `glyphs()`'s parameters: `cell`, `chars`, `font`, `mode`, `background`). It waits for a redraw, which runs on the CPU, where the characters are known. Resolves to "" if there's nothing to draw. |
| `render()` | Draw now, instead of on the next frame. Returns whether it drew. |
| `toBlob(type, quality)` | The result as an image file, like `HTMLCanvasElement.toBlob()`. |
| `toDataURL(type, quality)` | The result as a data: URL, like `HTMLCanvasElement.toDataURL()`. |

**Events**

| Event | Description |
|---|---|
| `play` | The clock started or resumed. |
| `pause` | The clock paused. |
| `load` | The first frame of a source was drawn. |
| `framechange` | After each redraw, so a `<pixel-canvas>` can be another one's source. |
| `palettechange` | With `swatches`: the published colors changed. |
| `error` | The source can't be read (for example, a cross-origin image without CORS) or an effect threw: an `ErrorEvent`, and the original content is shown instead. Also fired, once per name, for an unknown effect in `effects`, which is skipped. |

## `<pixel-chroma-key>`

A pixel effect: make a color transparent (green screen). [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-chroma-key/readme.md) · module `@johnhenry/pixelable/pixel-chroma-key`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `color` |  | `string` | The color to remove, any CSS color. Default `lime`. |
| `tolerance` |  | `number` | How different a color can be and still be removed, 0–1. Default 0.3. |
| `softness` |  | `number` | A fade beyond the tolerance, 0–1, for smooth edges. Default 0.1. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-crt>`

A pixel effect: an old CRT screen. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-crt/readme.md) · module `@johnhenry/pixelable/pixel-crt`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `scanlines` |  | `number` | How much alternate rows are darkened, 0–1. Default 0.35. |
| `mask` |  | `number` | Strength of the color stripe mask, 0–1. Default 0.25. |
| `glow` |  | `number` | Overall brightness boost. Default 1.15. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-glitch>`

A pixel effect: animated digital glitches. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-glitch/readme.md) · module `@johnhenry/pixelable/pixel-glitch`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `amount` |  | `number` | How broken, 0 (none) to 1. Default 0.3. |
| `rate` |  | `number` | New glitches per second of the canvas clock. Default 8. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-glyphs>`

A pixel effect: the image as text characters (ASCII art). [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-glyphs/readme.md) · module `@johnhenry/pixelable/pixel-glyphs`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `cell` |  | `string` | Cell size in working pixels, `8x12` (the default) or `10` for square. 2–32 a side. |
| `chars` |  | `string` | The characters to use: a set (`ramp`, the default for brightness; `ascii`, the default for shape; `blocks`; `binary`) or your own, quoted when it has spaces or commas (`' .:#'`). |
| `font` |  | `string` | A CSS font family. Default `monospace`. |
| `mode` |  | `"brightness" \| "shape"` | Choose by how much ink a character has (`brightness`, the default) or where its ink is (`shape`: lines and edges get matching characters). |
| `color` |  | `string` | The ink: `source` (each cell's own color, the default) or a CSS color. |
| `background` |  | `string` | Behind the characters: `none` (transparent, the default) or a CSS color. On a light background, darkness is inked. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-grid>`

A pixel effect: grid lines between cells. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-grid/readme.md) · module `@johnhenry/pixelable/pixel-grid`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `size` |  | `number` | Cell size, in the working image's pixels. Default 8. |
| `color` |  | `string` | Line color, any CSS color (transparency blends). `transparent` cuts gaps instead of drawing lines. Default `rgb(0 0 0 / 0.35)`. |
| `line` |  | `number` | Line thickness in pixels. Default 1. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-halftone>`

A pixel effect: halftone dots, like print. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-halftone/readme.md) · module `@johnhenry/pixelable/pixel-halftone`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `size` |  | `number` | Cell size in pixels. Default 6. |
| `angle` |  | `number` | Grid angle in degrees. Default 45. |
| `ink` |  | `string` | Dot color, any CSS color, or `auto` for each cell's own color. Default black. |
| `paper` |  | `string` | Background color. Default white. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-lens>`

A pixel effect: a magnifying glass at the pointer. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-lens/readme.md) · module `@johnhenry/pixelable/pixel-lens`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `radius` |  | `number` | The lens's radius, in working pixels. Default 24. |
| `zoom` |  | `number` | How much it enlarges. Default 2. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-mosaic>`

A pixel effect: pixelate into blocks of one color. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-mosaic/readme.md) · module `@johnhenry/pixelable/pixel-mosaic`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `size` |  | `number` | Block size, in the working image's pixels. Default 8. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-outline>`

A pixel effect: line art from edges. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-outline/readme.md) · module `@johnhenry/pixelable/pixel-outline`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `threshold` |  | `number` | Edge strength needed for a line, 0–1. Lower draws more lines. Default 0.2. |
| `ink` |  | `string` | Line color. Default black. |
| `paper` |  | `string` | Background color, or `none` to draw the lines over the image. Default white. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-palette>`

A pixel effect: limit colors to a palette, with dithering. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-palette/readme.md) · module `@johnhenry/pixelable/pixel-palette`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `colors` |  | `string` | A named palette (`1bit`, `gameboy`, `grayscale`, `cga`, `sepia`, `pico-8`), space-separated CSS colors, or `auto` (the image's own dominant colors). Default `1bit`. |
| `dither` |  | `string` | `none` (default), `floyd-steinberg` (error diffusion), or `ordered` (a 4×4 Bayer pattern). |
| `count` |  | `number` | With `colors="auto"`: how many colors to pick. Default 8. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `palette` (read-only) | `number[][]` | The resolved palette, as `[r, g, b]` triples. Empty for `auto`, which depends on the image (see `<pixel-canvas>`'s `palette`). |

## `<pixel-shader>`

A pixel effect written as a GLSL fragment shader, run on the GPU. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-shader/readme.md) · module `@johnhenry/pixelable/pixel-shader`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `disabled` |  | `boolean` | Pass the image through unchanged. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `source` (read-only) | `string` | The shader's code: the text of its `<script type="x-shader/x-fragment">` child. |

**Methods**

| Method | Description |
|---|---|
| `apply(image, context)` |  |
| `gpuPass()` | The shader as a GPU pass, for <pixel-canvas gpu>. |

## `<pixel-spotlight>`

A pixel effect: a spotlight that follows the pointer. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-spotlight/readme.md) · module `@johnhenry/pixelable/pixel-spotlight`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `radius` |  | `number` | The lit circle's radius, in working pixels. Default 32. |
| `softness` |  | `number` | How far the light fades out beyond the radius. Default 16. |
| `dim` |  | `number` | How dark the rest gets, 0–1. Default 0.7. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |

## `<pixel-sprite>`

Pixel art written as text, with animation frames. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-sprite/readme.md) · module `@johnhenry/pixelable/pixel-sprite`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `colors` |  | `string` | What each character means: `char color` pairs separated by `;` (`. transparent; # black; o gold`), or a named palette whose colors are numbered `0`–`9` then `a`–`z` (`pico-8`, the default; `gameboy`; `1bit`; …). `.` is transparent unless you say otherwise. |
| `fps` |  | `number` | Play the frames at this rate. Without it (or with one frame), it's still. |
| `paused` | `paused` | `boolean` | Whether the animation is paused. Reflects; write it in markup to start paused. |
| `alt` |  | `string` | A text alternative, as on `<img>`. An empty `alt` marks it decorative. |

**Properties**

| Property | Type | Description |
|---|---|---|
| `canvas` (read-only) | `HTMLCanvasElement` | The canvas it's drawn on (in the shadow root), at one pixel per character. |
| `frames` (read-only) | `number` | How many frames there are. |
| `frame` | `number` | The frame showing, from 0. Setting it shows that frame (wrapping). |
| `paused` (read-only) | `boolean` | Whether the animation is paused. |
| `width` | `number` |  |
| `height` | `number` |  |

**Methods**

| Method | Description |
|---|---|
| `play()` | Play the frames (at `fps`). |
| `pause()` | Pause on the current frame. |

**Events**

| Event | Description |
|---|---|
| `play` | The animation started or resumed. |
| `pause` | The animation paused. |
| `framechange` | It was redrawn: the frame advanced, or its pixels or colors changed. |

**CSS custom properties**

| Property | Description |
|---|---|
| `--pixel-sprite-scale` | How many screen pixels each sprite pixel takes. Default 8. |

## `<pixel-wave>`

A pixel effect: an animated wave. [Guide](https://github.com/johnhenry/pixelable/blob/main/src/pixel-wave/readme.md) · module `@johnhenry/pixelable/pixel-wave`

**Attributes**

| Attribute | Property | Type | Description |
|---|---|---|---|
| `amplitude` |  | `number` | How far rows move, in pixels. Default 4. |
| `wavelength` |  | `number` | Rows per wave. Default 32. |
| `speed` |  | `number` | Waves per second on the canvas clock (negative reverses). Default 0.5. |
| `disabled` |  | `boolean` | Pass the image through unchanged. |
