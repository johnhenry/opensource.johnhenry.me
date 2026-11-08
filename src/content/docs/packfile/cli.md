---
title: "CLI"
description: "compress, decompress, and serve — the packfile command line."
---

## Compress a folder

```sh
npx @johnhenry/packfile compress <path-to-folder> <path-to-file>
```

Compresses the contents of `<path-to-folder>` and saves the compressed
archive to `<path-to-file>`.

## Decompress a file

```sh
npx @johnhenry/packfile decompress <path-to-file> <path-to-folder>
```

Decompresses the contents of `<path-to-file>` and saves the decompressed
files to `<path-to-folder>`.

## Serve a compiled file

```sh
npx @johnhenry/packfile serve <path-to-file> [port]
```

Serves the compiled file at `<path-to-file>` on `[port]` (default `3000`).

## Examples

```sh
npx @johnhenry/packfile compress ./static ./compiled.wbn
npx @johnhenry/packfile decompress ./compiled.wbn ./decompressed
npx @johnhenry/packfile serve ./compiled.wbn 8080
```
