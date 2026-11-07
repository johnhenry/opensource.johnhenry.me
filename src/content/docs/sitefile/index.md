---
title: "sitefile"
description: "A Docker-inspired static site builder: compose pinned local, remote and Git sources through stages, templates and sandboxed plugins, and export a directory, archive, Web Bundle or OCI image. No container runtime, no shell, no runtime dependencies."
sidebar:
  order: 0
---

**`@johnhenry/sitefile`** builds static sites the way a Dockerfile builds images. A `Sitefile` is a list of
instructions: `IMPORT` names a resource (a folder, a file, a URL, a Git repository, an archive, Markdown posts, YAML or
CSV data), `COPY` and `RENDER` place things in an immutable file tree, `TRANSFORM` runs a plugin, and `EXPORT` writes
the result as a directory, a zip, tar or tar.gz, a Web Bundle, or an OCI image. There is no container runtime and no
shell, and the npm package has no runtime dependencies.

```
# Sitefile
ARG TITLE = "Hello"
COPY ./public/ /
RENDER --escape=html ./templates/index.html TO /index.html
EXPORT / AS directory
```

```sh
sitefile build . --build-arg TITLE="My site"     # writes ./dist/
```

## Traps

Read these before the reference. Each one is a deliberate rule that a first build runs into.

- **Values are not HTML-escaped unless you ask.** `RENDER` substitutes `${NAME}` as written. Add `--escape=html` to every
  `RENDER` that writes HTML; then `${x|raw}` is the one way to insert markup (rendered Markdown, say).
- **JavaScript plugins don't run until you name them.** A `PLUGIN … FROM ./x.mjs` line stops the build with
  `E_UNSUPPORTED` and the exact flag to add: `--allow-plugin x`. A Sitefile cannot allow its own plugins, and there is
  no config file or environment variable for it. Import-free WebAssembly plugins need no flag. External programs
  (`TOOL`) need `--allow-exec`. See [Plugins](/sitefile/plugins/).
- **Writing different content to an existing path fails.** Two instructions that write different bytes to one path stop
  the build unless the second has `--overwrite`. Paths that differ only in case (`/A.html`, `/a.html`) always fail, so a
  build gives the same files on macOS, Windows and Linux.
- **The first build of a remote URL locks it.** An unpinned URL is recorded in `Sitefile.lock` (sha256 and size). If the
  content changes, later builds fail with `E_LOCK_MISMATCH` until you rerun with `--update-lock`. Commit the lockfile;
  in CI use `--frozen-lockfile --strict-pins`.
- **Remote means public HTTPS.** Plain `http:` and private or loopback addresses are refused, on the first request and
  on every redirect, unless you pass `--allow-http` / `--allow-private-network`.
- **`EXPORT` comes last, and a Web Bundle needs a base URL.** `EXPORT / AS wbn` needs `BASE https://…` (or
  `--base-url`), because every file in a bundle is stored under an absolute URL.
- **Sitefile's `.wbn` is a plain Web Bundle; the rest of the family gzips theirs.** packfile reads Sitefile's bundles
  directly (see [Family](/sitefile/family/)), but `IMPORT … AS tree` cannot yet read the gzip-wrapped bundles that
  fileable's `encode="wbn"` and packfile's `toArchive()` write (sitefile#141). Import their directory or zip output
  instead.
- **`COMPRESSION` is for OCI exports only in 0.0.0.** On any other format it is a validation error. Fixed on main, in
  the next release: `AS wbn COMPRESSION gzip` (or `-o site.wbn.gz`) writes the gzip-wrapped bundle the rest of the
  family uses (sitefile#143).
- **The npm package is the TypeScript implementation.** The Rust binary is faster and is the only one with the editor
  language server (`sitefile lsp`); it builds from the repository with `cargo install --path rust`, and prebuilt
  binaries are not published yet. Both produce byte-identical output.

## Install

```sh
npm install -g @johnhenry/sitefile
npx @johnhenry/sitefile build .        # or without installing
```

Not yet on npm: the first publish of `@johnhenry/sitefile` is pending.

Node 26 or later (`engines`). No runtime dependencies.

**Provenance:** a new package. Sitefile was never published to npm under any name, and `0.0.0` is its first version.
Under npm's caret rules `^0.0.0` matches only `0.0.0`, so pin exactly until a deliberate `0.1.0`.

## Quick start

A blog from Markdown posts with frontmatter, paginated, with tag pages, a feed, a sitemap, fingerprinted CSS and a link
check:

```
ARG SITE_URL = "https://blog.example.com"
ARG DRAFTS: boolean = false
IMPORT posts FROM ./posts AS markdown SORT BY date DESC SCHEMA ./post.schema.yaml DRAFTS ${DRAFTS}
COPY ./public/ /
RENDER --escape=html ./templates/index.html TO /page/${page.number}/index.html FOR page IN posts PAGE 10 FIRST /index.html
RENDER --escape=html ./templates/post.html TO /posts/${post.slug}/index.html FOR post IN posts
RENDER --escape=html ./templates/tag.html TO /tags/${tag.key}/index.html FOR tag IN posts BY tags
FEED posts BASE ${SITE_URL} LINK /posts/${item.slug}/index.html TITLE "Field Notes"
SITEMAP BASE ${SITE_URL}
FINGERPRINT /style.css MANIFEST /asset-manifest.json
CHECKLINKS
EXPORT / AS directory
```

```sh
sitefile build .                       # ./dist/
sitefile build . --build-arg DRAFTS=true -o preview
sitefile serve --watch .               # build in memory, serve on 127.0.0.1, live reload
```

## Where it fits

Sitefile is the build orchestrator among the family's static tools. It runs the pipeline; its siblings write file trees
in code and serve the result, and they meet at file formats rather than imports:

- **[fileable](/fileable/)** writes trees in JSX (scaffolding, codegen). Its output directory or zip is a Sitefile input.
- **[packfile](/packfile/)** reads and serves Web Bundles. It reads Sitefile's `EXPORT … AS wbn` output back into the
  exported files and serves it as a `(Request) => Response` handler.

[Family](/sitefile/family/) has the details and a decision guide.

## In this section

- [The language](/sitefile/language/): every instruction, templates, stages, data imports
- [Command line](/sitefile/cli/): build, validate, graph and why, bake, watch, images and serve, export formats
- [Plugins](/sitefile/plugins/): JavaScript and WebAssembly renderers, the sandbox, external tools
- [Security model](/sitefile/security/): what a build of someone else's Sitefile can and cannot do
- [Family](/sitefile/family/): Sitefile, fileable and packfile together
