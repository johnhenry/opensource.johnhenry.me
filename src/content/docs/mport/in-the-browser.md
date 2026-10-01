---
title: "In the browser"
description: "Two runtime modes: resolve once at startup into an injected import map, or import through the router so a failing CDN is retried elsewhere."
sidebar:
  order: 7
---

```js
import { createRouter, startup, createImporter, esmSh, jsDelivr } from "@johnhenry/mport";
const router = createRouter({ "*": [esmSh(), jsDelivr()] });

// A: resolve at startup, then use plain imports
await startup(router, ["react@^19", "react-dom@^19/"]);
const React = await import("react");

// B: import through the router every time; if an import fails, that CDN is excluded
//    and the next one is tried (restricted to one build only when a lockfile or
//    the build option pins it)
const load = createImporter(router);
const { default: dayjs } = await load("dayjs@1");
```

With `startup()`, the import map has to be in the page before the first module that uses it resolves. Put the startup code in its own `<script type="module">` before the rest of your modules, or generate the map at build time with the CLI.

**Firefox ignores an import map added after any module has loaded** ("Import maps are not allowed after a module load or preload has started"), and mport is itself a module, so `startup()` and `injectImportMap()` work in Chromium and Safari/WebKit but not in Firefox. There `startup()` rejects with a clear error (carrying the build result as `error.result`) instead of leaving bare imports to fail later. Firefox needs the map in the HTML before any module script, which a build step or server does with `renderImportMap()`, or use `createImporter()` (mode B), which needs no map. See [Limitations](/mport/limitations/#in-the-browser-and-the-v1-api).

**Order in the HTML matters in Firefox.** Put the import map before any `<link rel="modulepreload">`: Firefox ignores an import map that comes after a modulepreload (it has "started a module load or preload"), so every bare import then fails there, while Chromium and WebKit accept either order. Render `renderImportMap(importMap)` first and `renderModulePreload(importMap)` second. A static site that cannot use a CSP nonce allows the inline map by hash: [Content-Security-Policy for the inline import map](/mport/import-maps-and-cli/#content-security-policy-for-the-inline-import-map).
