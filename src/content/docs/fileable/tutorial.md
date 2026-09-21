---
title: "Tutorial: render a site, then serve it"
description: "Write a small JSX tree with fileable's Dir/File, render it to real files on disk, then mount that same tree straight into a servable app with Group from= — no disk round-trip required."
---

`fileable` and `servable` are siblings: one describes filesystem artifacts in JSX, the other describes HTTP routes in JSX, and they share enough machinery that a `fileable` tree can be handed directly to `servable` as a mount point. This tutorial walks through both halves of that story — first writing real files with `fileable` alone, then serving that same shape of tree with `servable`, with nothing written to disk the second time.

Takes about 10 minutes. You'll need Node with TypeScript/JSX support (`tsx` is used below).

## 1. Install

```sh
npm install @johnhenry/fileable @johnhenry/servable
```

`fileable` is an optional peer dependency of `servable` — installing both up front is what you want here since this tutorial uses both.

You also need a `tsconfig.json` in your project that enables JSX (fileable and servable each ship their own `jsxImportSource`, selected per-file with a pragma comment, but TypeScript still needs `jsx` turned on):

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@johnhenry/fileable",
    "module": "esnext",
    "moduleResolution": "bundler"
  }
}
```

## 2. Act one: render a tree to disk

Create `site.tsx`:

```tsx
/** @jsxImportSource @johnhenry/fileable */
import { Dir, File, render } from "@johnhenry/fileable";

const site = (
  <Dir name="dist">
    <File name="index.html">{"<h1>Hello, world!</h1>"}</File>
    <Dir name="about">
      <File name="index.html">{"<h1>About</h1>"}</File>
    </Dir>
  </Dir>
);

await render(site, { outDir: "." });
console.log("rendered dist/index.html and dist/about/index.html");
```

Run it:

```sh
npx tsx site.tsx
```

You should see:

```
rendered dist/index.html and dist/about/index.html
```

Check what landed on disk:

```sh
cat dist/index.html        # <h1>Hello, world!</h1>
cat dist/about/index.html  # <h1>About</h1>
```

`Dir` and `File` are plain JSX components — `render()` walks the tree you built and writes real files, preserving the nesting (`about/` became a real subdirectory). Nothing here is a build step or a template language; it's JSX describing a filesystem the same way it usually describes a DOM.

## 3. Act two: serve the same tree, no disk write

Now do the same thing again, but hand the tree to `servable` instead of `render()`. Create `serve-site.tsx` (note the pragma changes to `@johnhenry/servable` — this file mixes both vocabularies in one expression):

```tsx
/** @jsxImportSource @johnhenry/servable */
import { Dir, File } from "@johnhenry/fileable";
import { Router, Group, compile } from "@johnhenry/servable";
import { serve } from "@johnhenry/servable/adapters/node";

const site = (
  <Dir name="dist">
    <File name="index.html">{"<h1>Hello, world!</h1>"}</File>
    <Dir name="about">
      <File name="index.html">{"<h1>About</h1>"}</File>
    </Dir>
  </Dir>
);

const app = (
  <Router>
    <Group prefix="/site" from={site} />
  </Router>
);

const compiled = await compile(app);
serve(compiled, { port: 3009 });
console.log("listening on http://localhost:3009");
```

Update your `tsconfig.json`'s `jsxImportSource` to `@johnhenry/servable` (or just for this file, since the pragma comment overrides it per-file anyway — either works). Run it:

```sh
npx tsx serve-site.tsx
```

In another terminal:

```sh
curl http://localhost:3009/site/dist
# <h1>Hello, world!</h1>
curl http://localhost:3009/site/dist/about/index.html
# <h1>About</h1>
```

## What just happened

- `Group prefix="/site" from={site}` ran fileable's own `build`/`resolve`/`layout` stages against the tree — the same logic that decided what bytes would land on disk in act one — but stopped short of the `Hash`/`Write` step, so nothing touched the filesystem. The route table is built directly from the in-memory tree.
- The URL includes `dist` because a `Dir`'s `name` is always part of the mounted path — there's no special-casing of the mount root. That's why `curl`'s path is `/site/dist`, not `/site`.
- The directory's own `index.html` serves at the directory's path too (`/site/dist` resolves the same file as `/site/dist/index.html` would), matching ordinary static-file-server behavior.
- Act one and act two describe the *identical* tree. In a real project you'd typically pick one path — `render()` to disk for a static-hosting deploy, or `from=` for serving the same content straight out of your app process — but seeing both against the same tree is the fastest way to understand what `from=` is actually doing under the hood.

## Where to go next

- [fileable](/fileable/) — the full reference: the three primitives, the CLI, caching, and the gotchas worth knowing before you build something real.
- [servable's `Mounting a fileable tree`](https://github.com/johnhenry/servable#mounting-a-fileable-tree) section in the README — naming rules, mounting without a folder name via a Fragment, symlinks becoming redirects, and writing `<Dir>`/`<File>` literally inside `<Router>`/`<Group>` instead of using `from=`.
- `servable`'s own `examples/07-mount-fileable` — a slightly larger version of act two, written with literal nested JSX instead of `from=`.
