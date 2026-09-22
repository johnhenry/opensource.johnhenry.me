---
title: "CLI"
description: "Serve a JavaScript module's export straight from the command line, with port, export-name, and echo-mode flags."
---

`leserve` also ships as a CLI for serving a module's export directly,
without writing a `serve()` call yourself.

## Install

```sh
npm install -g @johnhenry/leserve
```

## Usage

```sh
leserve <path-to-file> [options]
```

Or without a global install:

```sh
npx @johnhenry/leserve <path-to-file> [options]
```

### Options

- `-p, --port <port>` — port number (default: `8000`)
- `-e, --export <name>` — export name to use (default: `'default'`)
- `--echo` — enable echo mode

## Default behavior

By default, `leserve` serves the default export from the specified file at
`localhost:8000`.

```javascript
// myHandler.mjs
export default (request) => {
  return new Response("Default Handler", {
    headers: { "content-type": "text/plain" },
  });
};
```

```sh
leserve myHandler.mjs
```

This serves the default export from `myHandler.mjs` at `localhost:8000`.

## Port flag

```sh
leserve myHandler.mjs -p 8001
```

Serves the default export from `myHandler.mjs` at `localhost:8001`.

## Export flag

```javascript
// myHandlers.mjs
export const handler = (request) => {
  return new Response("Named Handler", {
    headers: { "content-type": "text/plain" },
  });
};
```

```sh
leserve myHandlers.mjs -p 8080 -e handler
```

Serves the export named `handler` from `myHandlers.mjs` at `localhost:8080`.

## Echo mode

```sh
leserve --echo
```

Responds as an echo server: echoes back each request as a response in JSON
format, on port 8000 by default.
