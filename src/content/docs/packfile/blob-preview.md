---
title: "Blob preview"
description: "Host a packfile FilesMap inside a browser tab or iframe with no server at all, by minting one blob: URL per file and rewriting cross-references to match."
---

```js
import { createBlobPreview } from '@johnhenry/packfile/blob-preview';
```

`createRouter()` needs something to call it — a real server, a Service
Worker, or (in `@johnhenry/packfile/browser`) at least a `fetch`-shaped
handler wired up to something. `createBlobPreview()` is for the case where
you don't want any of that: you have a `FilesMap` (from `fromDirectory()`/
`fromArchive()`, the same input `createRouter()` takes) and you just want to
point an `<iframe>` at it and have it render, entirely client-side.

It mints one `blob:` URL per file and rewrites HTML (`href`, `src`,
`srcset`, `poster`, `formaction`) and CSS (`url(...)`, `@import`) references
so they resolve to the right file's blob URL instead of 404ing. JS module
resolution (`import`/`import()` between `.js`/`.mjs` files) is delegated to
the sibling [andbox](/andbox/) package's `createVirtualModuleRegistry()`
rather than reimplemented here — packfile has a real npm dependency on
`@johnhenry/andbox` for exactly this.

```js
import { fromDirectory } from '@johnhenry/packfile';
import { createBlobPreview } from '@johnhenry/packfile/blob-preview';

const files = await fromDirectory('./static');
const preview = await createBlobPreview(files, { rootPath: 'index.html' });

document.querySelector('iframe').src = preview.entryUrl;

// later, once the iframe/tab is gone:
preview.dispose(); // revokes every blob: URL it minted
```

## API

```ts
function createBlobPreview(
  files: FilesMap,
  options?: {
    rootPath?: string; // default: "index.html"
    strict?: boolean;  // throw instead of warning on an unresolved reference
    onUnresolvedReference?: (info: {
      reason: "missing" | "cycle";
      targetPath: string;
      fromPath: string;
    }) => void; // called instead of the default console.warn
  }
): Promise<{
  entryUrl: string; // blob: URL for rootPath
  resolve(path: string): string | null;
  dispose(): void; // revokes every blob: URL this call minted
  registry: VirtualModuleRegistry; // the underlying andbox registry, for advanced JS-specifier resolution
}>
```

## What this does and does not solve

This is the lighter-weight of two designs considered for hosting
packfile-packaged content client-side. It is **good enough for trusted, your
own content** — not a general solution for arbitrary/untrusted content, and
it does not attempt to solve everything a real HTTP origin gives you for
free.

**Solved:**

- Relative HTML/CSS references between packaged files, including
  root-relative `/path` references — there's no real server, but the root
  is perfectly knowable at rewrite time, so this is handled.
- One blob URL per path, shared consistently across HTML/CSS/JS wiring.
- Reference **cycles** (two pages linking to each other, or a page linking
  to itself) — structurally unsolvable with immutable blob content, since
  one edge in the cycle can't know the other's final blob URL before its
  own content is frozen. Handled gracefully: left unrewritten and reported
  via `onUnresolvedReference`, never a stale or broken blob reference.

**Not solved, and not attempted** — these are fundamental limitations of
`blob:` URLs themselves, not implementation gaps:

- Absolute-path references *constructed at runtime* (e.g. `fetch('/api/data')`
  inside a script) — JS source is never rewritten by this module.
- `pushState`-based client-side routing — there is no real origin for the
  router to reason about.
- Service-Worker registration from within the served content — a `blob:`
  document has no meaningful scope to register one against.

A real Service-Worker-based hosting mode ("Approach A" in the design this
was compared against) is deferred and tracked as
[`andbox#14`](https://github.com/johnhenry/andbox/issues/14) for anyone who
needs real isolation or full HTTP-shaped semantics.

A few smaller boundaries: inline `<script>`/`<style>` block *contents* are
left untouched (only attribute references and standalone `.css`/`.js` files
are rewritten). A `<script src="...">` pointing at a `.js` file loads that
file's original, unmodified source — nested relative `import`s inside it
are not rewritten, because `blob:` URLs can't be used as a relative-
resolution base at all (`new URL("./x.js", blobUrl)` throws `Invalid URL`),
so a raw multi-file ESM graph loaded this way won't resolve its own imports
in a real browser. `registry.resolveSpecifier()` is exposed for callers who
want to do their own resolution; otherwise, pre-bundle multi-file JS into
one file before packaging with packfile.
