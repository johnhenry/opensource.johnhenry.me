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
