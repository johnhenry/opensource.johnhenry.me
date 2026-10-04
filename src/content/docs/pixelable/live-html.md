---
title: "Live HTML (experimental)"
description: "pixel-canvas html: live HTML through pixel effects, still interactive, with the proposed HTML-in-canvas API."
sidebar:
  order: 1
---

`<pixel-canvas html>` draws its own HTML content (a form, text, anything)
live through the effects, and it stays HTML: laid out where the result is
drawn, so clicks, typing, focus, and screen readers work as usual, and every
change (a typed letter, a hover style) redraws.

```html
<pixel-canvas html effects="mosaic(3) palette(gameboy, ordered)">
  <form>
    <label>Name <input name="name"></label>
    <button>Sign</button>
  </form>
</pixel-canvas>
```

It uses [HTML-in-canvas](https://github.com/WICG/html-in-canvas)
(`<canvas layoutsubtree>`, `drawElementImage()`, the `paint` event), a WICG
proposal: in Chromium it's behind `chrome://flags/#canvas-draw-element` or
an origin trial. **Where the API is missing, the content shows as it is,**
without effects, and works the same.

## How it works

Your markup isn't moved. The content is slotted into a `<canvas
layoutsubtree>` in the element's shadow root (the `html-canvas` part), which
is as wide as the `<pixel-canvas>` and as tall as its content. On each
`paint` event the canvas draws the content, the effects run on that, and the
result is drawn back onto the same canvas. The content is laid out (and
hit-tested) exactly where it's drawn.

With `gpu`, the content goes straight into a WebGL texture
(`texElementImage2D`) and through the effects as shaders, with nothing read
back. In Chromium 153 the call is `texElementImage2D(target, internalformat,
element)`, not the explainer's argument order.

## Traps

- **Feature-detect, never version-sniff.** The API may change before it
  ships; `"drawElementImage" in CanvasRenderingContext2D.prototype` is the
  test. So may this attribute.
- **One working pixel is one CSS pixel** unless `width` or `height` says
  otherwise, so `mosaic(4)` makes 4-pixel blocks at any screen density.
- **Empty elements aren't drawn** (Chromium 153): a `<div>` with only a
  background stays transparent until it has some content. Bare text is fine:
  the content is laid out in one block, and that block is what's drawn.
- **Effects that move pixels move the picture, not the hit areas.** With
  `wave` or `glitch`, clicks still go where the content really is.
- **It's never an image.** With `html` the element's role is its content's
  (no `role="img"`), with or without the API.
- **Pixels read back are privacy-filtered.** The proposal paints a
  privacy-preserving version for readback (no visited-link colors, no
  cross-origin content), and the CPU effects read pixels back, so that's
  what they see.
