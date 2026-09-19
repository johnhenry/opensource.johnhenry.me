---
title: "fileable"
description: "Declaratively describe filesystem artifacts — files, directories, deletions — using JSX, with Docker-flavored build discipline: content-hash caching, three interchangeable output shapes, and a filesystem-to-JSX reverse mode."
---

**`@johnhenry/fileable`** renders a JSX tree into real files and directories instead of a DOM. Three primitives — `Dir`, `File`, `Rm` — compose the same way any JSX does, but the output is a filesystem: static sites, scaffolded project skeletons, config bundles, build artifacts. `src` can pull in a local file, fetch a URL, `cmd` can shell out (opt-in), and content-hash caching (`.fileable-lock.json`) skips writing anything that hasn't actually changed.

> Previously published as `fileable` (2019-2022, last unscoped release
> 0.0.24 — the v1 iterator-protocol design). The v2 rewrite here was never
> released unscoped; adoption into `@johnhenry/fileable` and the version
> restart to 0.0.0 happened together — a new address and era, not a
> maturity signal.

## Install

```sh
npm install @johnhenry/fileable
```

## Quick example

```tsx
/** @jsxImportSource @johnhenry/fileable */
import { Dir, File } from "@johnhenry/fileable";
import { render } from "@johnhenry/fileable";

const template = (
  <Dir name="dist">
    <File name="hello.txt">Hello, world!</File>
  </Dir>
);

await render(template, { outDir: "." });
// -> dist/hello.txt
```

Or via the CLI, pointing at a compiled template module (`.tsx`/`.jsx` need
pre-compiling — fileable ships no JSX/TS transform of its own):

```sh
fileable build template.js
```

## The three primitives

- **`Dir`** — a directory. `from="glob"` fills it from matched files,
  preserving their subdirectory structure (two different source dirs each
  containing an `index.html` do **not** collide — confirmed the hard way
  before this was fixed). `as="archive"` materializes the subtree as a
  `.zip` instead of loose files.
- **`File`** — a file. Nesting a `Dir`/`File` inside another `File` folds
  it into the parent's content instead of giving it its own path — the
  same rule handles "compose fragments into one file" and "compose files
  into a folder." `onConflict` (`replace`/`append`/`prepend`/`skip`/`error`)
  controls what happens when Write is about to touch a path with content
  from *outside* the current build.
- **`Rm`** — deletions, matched by glob, evaluated alongside everything
  else in the same tree (e.g. cleaning up `*.draft.html` on the same run
  that writes the real posts).

The bare lowercase `<dir>`/`<file>`/`<rm>` tags are reserved and throw if
authored directly — always `import { Dir, File, Rm } from "@johnhenry/fileable"`.

## CLI

```
fileable build <template> [options]
fileable clean [dir] [options]
fileable eject <path> [options]
```

`clean` is `build`'s dual: it removes exactly what a previous `build`
wrote (from `.fileable-lock.json`), not a guess at what "looks generated."
`eject` runs the whole idea backwards — point it at a real directory and
it prints the fileable JSX source that would build it, deciding per file
whether to inline the content or reference it via `src="..."` (text
inlines, binary references, by default — forcing `inline` on binary
content throws, since there's no safe way to put raw bytes into source
text). `--dry-run` works on every command that touches disk.

## Gotchas

Things that aren't obvious from the API surface alone:

- **Binary content is byte-exact, not assumed-text.** `src`/`cmd` read raw
  bytes and decide text-vs-binary by a UTF-8 round-trip check, not by file
  extension — a real PNG through `src` comes back byte-for-byte identical,
  loose or inside a `.zip`.
- **A loose `symlink` can't target content inside an `as="archive"`
  subtree.** Archive-internal paths aren't real filesystem paths — fileable
  throws instead of silently creating a symlink to nowhere.
- **`as="archive"` can't nest, and you can't escape back to loose from
  inside one.** Both throw rather than silently doing the wrong thing.
- **The incremental cache checks the file is still actually there, not
  just that its hash matches.** Delete a build output by hand and rebuild
  with caching on — it gets rewritten, not silently skipped forever.
- **`render()` never mutates the tree you pass it.** Reusing the same
  built tree across two `render()` calls with different options (a normal
  SDK pattern) is safe — each call clones before touching anything.

## Status

169 tests, zero runtime surprises left unguarded that a scratch-directory
reproduction could catch — every fix above was verified by actually
triggering the bug first, not just by reasoning about the code. CI covers
Node 18/20/22 on both Linux and Windows (symlink-fallback behavior is
genuinely platform-specific).

## License

MIT

## Source

[github.com/johnhenry/fileable](https://github.com/johnhenry/fileable)
