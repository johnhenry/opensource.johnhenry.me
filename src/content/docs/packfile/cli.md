---
title: "CLI"
description: "compress, decompress, and serve — the packfile command line."
---

## Compress a folder

```sh
npx packfile compress <path-to-folder> <path-to-file>
```

Compresses the contents of `<path-to-folder>` and saves the compressed
archive to `<path-to-file>`.

## Decompress a file

```sh
npx packfile decompress <path-to-file> <path-to-folder>
```

Decompresses the contents of `<path-to-file>` and saves the decompressed
files to `<path-to-folder>`.

## Serve a compiled file

```sh
npx packfile serve <path-to-file> [port]
```

Serves the compiled file at `<path-to-file>` on `[port]` (default `3000`).

## Examples

```sh
npx packfile compress ./static ./compiled.wbn
npx packfile decompress ./compiled.wbn ./decompressed
npx packfile serve ./compiled.wbn 8080
```
