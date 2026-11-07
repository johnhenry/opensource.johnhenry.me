---
title: "Command line"
description: "sitefile build, validate, inspect, graph and why, vendor and outdated, bake, watch mode, profiling, images and serve, and the export formats."
sidebar:
  order: 2
---

```
sitefile build [context] [-o dist] [--format directory|zip|tar|tgz|wbn] [--base-url URL]
               [--build-arg K=V] [--build-arg-file vars.json|.yaml|.env] [--force]
               [--frozen-lockfile | --update-lock] [--strict-pins] [--allow-http] [--allow-private-network]
               [--allow-hardlinks] [--allow-exec name] [--allow-plugin name] [--allow-plugins]
               [--no-cache] [--cache-from ref] [--cache-to ref] [--watch] [--target stage] [--profile trace.json]
sitefile validate [context] [--json]
sitefile inspect  [context] [--json]
sitefile graph    [context] [--json | --dot]
sitefile why <path> [context] [--json]
sitefile vendor   [context]
sitefile outdated [context] [--json]
sitefile bake [targets...] [-f sitefile.bake.yaml] [--print [--json]] [-j n]
```

`context` defaults to `.`; it can also be a Git URL (`sitefile build https://host/repo.git#ref:dir`).

## Understanding a build

- `validate` parses and type-checks without building (and never runs plugins).
- `inspect` builds in memory and prints the plan and outputs.
- `graph` prints the dependency graph of imports, stages and operations (`--dot` for Graphviz).
- `why <path>` names the instructions that wrote an exported file, and what overwrote it.
- `outdated` compares remote imports and `BASE` images with their pins, read-only.
- `--target <stage>` stops after a named stage and exports its whole tree, without the `EXPORT` path or
  `_redirects`/`_headers`.
- `--profile trace.json` writes a Chrome trace (open it in ui.perfetto.dev): parsing, each import, stage, operation and
  plugin call, with cache hits and misses.

## Variants: `sitefile bake`

Several variants of a site (locales, staging and production) from one `sitefile.bake.yaml`:

```yaml
groups:
  default: [site]
targets:
  site:
    matrix:
      locale: [en, fr]
      env: [staging, production]
    arg-files: ["env/${env}.env"]
    args: {LOCALE: "${locale}"}
    output: dist/${env}/${locale}
```

`sitefile bake` builds the four combinations, up to four at a time, sharing the plugin cache. Every target runs even
when one fails; overlapping outputs are refused before anything is built.

## Watch mode

```sh
sitefile build --watch .     # rebuild dist/ when the context, Sitefile or a --build-arg-file changes
sitefile serve --watch .     # build in memory, serve on 127.0.0.1, reload open pages after each rebuild
```

Rebuilds are debounced (100 ms) and incremental, and a failed rebuild keeps the last good output. The live-reload
script is added only to responses under `serve --watch`, never to exports.

## Images and servers

Builds can be kept in a local image store, a standard OCI image layout in `$SITEFILE_HOME` (default `~/.sitefile`). The
image ID is the manifest digest, so identical output gives the same ID.

```sh
sitefile build . -t site:1                     # stored only, nothing written to the context
sitefile images
sitefile save site:1 -o site.oci.tar           # or .zip / .tar.gz / .wbn / a directory
sitefile serve -d --name site -p 8080 site:1   # serve it in the background
sitefile servers; sitefile server logs site; sitefile server stop site
```

`serve` answers GET and HEAD on `127.0.0.1` (another address only if `-p` names one), with ETags and MIME types and no
directory listings; it serves `/404.html` for missing paths, `/about` from `/about.html`, and the site's `_redirects`
and `_headers`. `EXPORT / AS oci BASE nginx:alpine AT /usr/share/nginx/html` builds a runnable image on a pulled base,
and `sitefile push` / `pull` move images to any OCI registry. `--provenance` and `--sbom` attach a SLSA provenance
statement and a CycloneDX file list as OCI referrers.

## Export formats

```sh
sitefile build . --format zip                                 # ./dist.zip
sitefile build . -o site.tar.gz                               # format from the extension
sitefile build . --format wbn --base-url https://example.com/ # an unsigned Web Bundle
```

Archives are reproducible: sorted entries, fixed timestamps (or `SOURCE_DATE_EPOCH`), uid/gid 0, modes 0644/0755. Both
implementations share one deflate encoder, so zip and tar.gz output is byte-identical between them.

Exports are atomic: a directory is staged next to its destination and swapped in, an archive is written to a temporary
file and renamed, and a non-empty destination outside the context is replaced only with `--force`.

## Caching

`TRANSFORM` results are cached in `$SITEFILE_HOME/cache/transform` (`--no-cache` to skip; `sitefile cache info|prune|du`;
`SITEFILE_CACHE_MAX`, default 1G). CI runs and teammates can share them through an OCI registry with `--cache-to
<registry/name:tag>` and `--cache-from <ref>`.
