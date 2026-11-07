---
title: "The language"
description: "Every Sitefile instruction: stages, imports, COPY and RENDER, templates, plugins, site files, checks and EXPORT."
sidebar:
  order: 1
---

A Sitefile is parsed into a typed program before anything runs, so a syntax or type error is reported with its line
and column and nothing is fetched or written. `sitefile validate` checks a Sitefile without building it.

The model: an `IMPORT` **names** a resource; `COPY`, `RENDER` and `TRANSFORM` **place** files in the current stage's
tree; `EXPORT` writes the last stage's tree out.

## Instructions

| Instruction | What it does |
| --- | --- |
| `FROM scratch\|<dir>\|<stage>\|image <ref> [AT <dir>] [AS name]` | Starts a stage. Several `FROM`s make a multi-stage build and the last stage is exported. `image` starts from a site image's files (a theme), locked in `Sitefile.lock` when it comes from a registry. |
| `IMPORT name FROM <dir>\|git+https://…#ref:dir AS sitefile [ARG NAME=value]…` | The stages of another Sitefile, local or from Git, usable as `name+<stage>` in `FROM` and `--from`, with its own ARGs. |
| `ARG NAME[: type] [= value]` | A build argument (`string`, `number`, `boolean`), set with `--build-arg`. |
| `LET NAME[: type] = value` | A computed value. |
| `IMPORT name FROM <path or https URL> [AS file\|text\|json\|yaml\|csv\|markdown\|wbn\|tree] [INTEGRITY sha256:…] [SORT BY key [DESC]] [SCHEMA <file>] [DRAFTS true\|false]` | A resource. `AS tree` unpacks tar, tar.gz, zip and Web Bundles; `AS markdown` reads posts with frontmatter (`SCHEMA` checks it); `AS yaml`/`csv`/`wbn` give data for templates. |
| `COPY [--overwrite] [--from=<stage>] <source> <dest>` | Places files. The source is a local path, `name:/path` from an import, an inline `<<EOF` body, or with `--from` a path in an earlier stage. |
| `RENDER [--escape=html] [--overwrite] [--from=<stage>] <template> TO <dest> [FOR item IN list [BY key] [PAGE n [FIRST <dest>]]]` | Renders a template (a file or an inline `<<EOF` body). `FOR` writes one page per element, `BY` one per tag, `PAGE` paginates. |
| `PLUGIN name FROM ./plugins/x.mjs\|x.wasm [INTEGRITY sha256:…]` | Declares a custom renderer ([Plugins](/sitefile/plugins/)). |
| `TRANSFORM [--include/--exclude=<pattern>] [<source>] WITH name TO <dest> [OPTIONS k=v …] [FOR item IN list]` | Runs a plugin. A directory source runs once per file (`TO /img/thumbs/*.png`). |
| `TOOL name` + `TRANSFORM … WITH name … ARGS …` | Runs an external program you allow with `--allow-exec name`: argv only, no shell. |
| `SITEMAP BASE <url> [TO <dest>]` | A sitemaps.org `/sitemap.xml` of the `.html` pages so far. |
| `FEED <import> BASE <url> LINK <path> [TO <dest>] [TITLE <text>]` | An Atom `/feed.xml` from Markdown posts (`title` and `date` required). |
| `REDIRECT <from> <to> [STATUS 301\|302\|303\|307\|308]`, `HEADER <pattern> <Name>: <value>` | `/_redirects` and `/_headers` for Netlify / Cloudflare Pages, also honoured by `sitefile serve`. |
| `CHECKLINKS [--warn] [--external]` | Fails (or warns) on links to files that do not exist, with file and line. |
| `FINGERPRINT [--overwrite] <pattern>… [MANIFEST <dest>]` | Renames assets to `name.<hash>.ext`, rewrites the HTML and CSS that reference them, and writes a JSON manifest. |
| `EXPORT <path> [AS directory\|zip\|tar\|tgz\|wbn\|oci] [BASE <url>] [AT <root>] [COMPRESSION gzip\|none]` | Must be last. `wbn` needs `BASE` (or `--base-url`); `oci` writes a single-layer image under `AT` (default `/srv/www`); `COMPRESSION` is for `oci` only. |

## Templates

```
RENDER --escape=html <<HTML TO /index.html
<h1>${TITLE}</h1>
<ul>${#each team as person}<li>${person.name}</li>${/each}</ul>
HTML
```

- `${NAME}` for an ARG or LET, `${name}` for a text import, `${name.key.0.key}` for a value in a data import.
- `${#each list as x}…${/each}` and `${#if value}…${/if}`.
- `--escape=html` escapes `& < > " '` in every value; `${x|raw}` inserts one value unescaped (for rendered Markdown:
  `${post.content|raw}`). Without `--escape=html` nothing is escaped.
- `$${` writes a literal `${`. An unknown name fails with the template's line and column.

## Data

```
IMPORT site FROM ./site.yaml AS yaml                 # ${site.nav.0.title}
IMPORT team FROM ./team.csv AS csv SORT BY joined    # FOR person IN team
IMPORT bundle FROM ./vendor/hello.wbn AS wbn         # ${#each bundle.entries as e}
IMPORT hello FROM ./vendor/hello.wbn AS tree         # COPY hello:/ /hello/
```

Markdown posts read frontmatter; `SCHEMA ./post.schema.yaml` checks it against a YAML or JSON schema, and `DRAFTS false`
leaves out posts marked as drafts.

## Stages and shared Sitefiles

```
FROM scratch AS assets
COPY ./theme/ /assets/
FINGERPRINT /assets/*.css

FROM scratch
COPY --from=assets /assets/ /assets/
RENDER --escape=html ./pages/index.html TO /index.html
EXPORT / AS directory
```

`IMPORT theme FROM ./theme AS sitefile ARG ACCENT=teal` makes another Sitefile's stages available as `theme+<stage>`,
with its own paths and ARGs, like Earthly targets. From Git (`git+https://…#ref:dir`) it is pinned in `Sitefile.lock`.

## Remote and Git sources

- `https:` only, to public addresses only, checked when connecting and on every redirect; size- and time-limited; never
  decompressed or executed.
- `INTEGRITY sha256:…` pins a URL. An unpinned URL is pinned by its first build in `Sitefile.lock` and must match after
  that (`E_LOCK_MISMATCH`, rerun with `--update-lock`). `--strict-pins` refuses anything unpinned before fetching.
- `IMPORT … FROM git+https://host/repo.git#ref:path` reads Git without running `git`: protocol v2 over the same HTTPS
  client, every object's SHA-1 checked, the commit recorded, submodules refused.
- Private sources: `--secret id=token,env=API_TOKEN` with `IMPORT … SECRET token AS BEARER` (or `AS HEADER
  X-Api-Key`). The secret goes only to that import's origin.
- `sitefile vendor` stores every remote input under `vendor/sitefile/` by digest, for offline builds.
