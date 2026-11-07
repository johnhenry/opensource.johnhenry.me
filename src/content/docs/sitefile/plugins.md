---
title: "Plugins"
description: "Custom renderers for TRANSFORM: JavaScript plugins in a Node permission sandbox, import-free WebAssembly plugins, the first-party image plugin, and external tools."
sidebar:
  order: 3
---

A plugin turns an input (a file, a value, or one element of a list) into one or more output files. Use one when
templates aren't enough: a motion graphic from text, OpenGraph cards, minifying, syntax highlighting, image variants.

## A JavaScript plugin

One ES module ending in `.mjs`, **in its own folder**:

```js
// plugins/upper/upper.mjs
export const apiVersion = 1;
export async function transform(request) {
  return { bytes: (request.input?.text ?? '').toUpperCase() };
}
```

```
PLUGIN upper FROM ./plugins/upper/upper.mjs
TRANSFORM ./title.txt WITH upper TO /title.txt
TRANSFORM WITH upper TO /cards/${post.slug}.txt OPTIONS text=${post.title} FOR post IN posts
```

```sh
sitefile build --allow-plugin upper     # or --allow-plugins for every PLUGIN
```

The request carries `dest`, `options` (always strings), `input` (`path`, `name`, `bytes`, and `text` when the bytes are
UTF-8) for a file source, `data` for a value import, and `item` under `FOR`. Return a string, a `Uint8Array` or
`{ bytes }` for one file, or `{ files: { "a.svg": …, "sub/b.png": … } }` for several under a `dest` ending in `/`.
Throwing fails the build with `E_PLUGIN` and your message; `console.log` becomes a build warning.

## The sandbox, and why there is still a flag

Each JavaScript plugin runs in its own Node process under Node's permission model, readable access limited to its own
folder:

| A plugin can | A plugin cannot |
| --- | --- |
| read files in its own folder | read other files, including your project |
| import `node:` built-ins and files in its folder | write files, spawn processes, use workers or native addons |
| use CPU and memory | open network connections, or see environment variables |

Each call has a time limit (`--plugin-timeout`, default 60 s) and results are capped at 64 MiB.

Node calls its permission model a seat belt for trusted code, not a defence against malicious code. A plugin is code
from the repository you are building, so it runs only when you allow it by name. Without the flag, the build stops at
the `PLUGIN` line before any import is fetched or any plugin starts. `validate` and the language server never run
plugins.

## WebAssembly plugins

A `.wasm` plugin that **imports nothing** (checked before the build starts) can only compute: no files, network,
clock, randomness or processes, under a time and memory limit (wasmtime in Rust, V8 in TypeScript). That is a real
sandbox, so it needs no flag. A `.wasm` path that is a symlink to a JavaScript file runs as JavaScript and needs the
flag.

## The image plugin

The first-party image plugin is WebAssembly: it decodes PNG, JPEG, GIF and WebP, resizes with a fixed Lanczos-3 filter,
writes PNG, JPEG or lossless WebP, and writes a metadata file listing each variant's path, width, height and a ready
`srcset`.

```
PLUGIN image FROM ./plugins/image.wasm INTEGRITY sha256:…
TRANSFORM ./photos/sky.jpg WITH image TO /img/ OPTIONS widths=400,800,1200 quality=80
```

## External tools: `TOOL` and `--allow-exec`

```
TOOL ffmpeg
TRANSFORM WITH ffmpeg TO /intro.mp4 ARGS -f lavfi -i "color=c=black:s=1280x720:d=3" -fflags +bitexact -map_metadata -1 {output}
```

```sh
sitefile build --allow-exec ffmpeg
```

argv only (no shell), temporary files for input and output, and a scrubbed environment. The program itself is trusted
code: `--allow-exec` runs whatever is on your `PATH` under that name with the arguments the Sitefile chose.

Plugins load from local files only; plugins from URLs or npm packages are not supported yet.
