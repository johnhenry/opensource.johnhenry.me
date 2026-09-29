---
title: "Import maps, lockfiles and the CLI"
description: "Compile resolutions into a standard import map and a lockfile, pin them, and do it from the command line."
sidebar:
  order: 6
---

```js
const { importMap, lock } = await router.build(
  ["react@^19", "lit/", "npm:lodash-es@4"],
  { scopes: { "https://legacy.example.com/": { react: "react@18" } } },
);
```

`importMap` contains `imports`, `scopes` and, when `verified()` ran, an `integrity` map. A specifier the router can't route rejects the build with a `ResolutionError` instead of being dropped. `lock` looks like this:

```json
{
  "lockfileVersion": 1,
  "packages": {
    "react@^19": {
      "specifier": "react@^19", "registry": "npm", "name": "react", "range": "^19",
      "version": "19.2.0", "build": "esm.sh", "provider": "esm.sh",
      "url": "https://esm.sh/react@19.2.0"
    }
  }
}
```

Keys are the specifier as written: a registry prefix appears only if you wrote one (`npm:react@^19`), and the entry's `registry` says which registry actually served the package. A bare `@std/path@^1` routed to JSR is keyed `@std/path@^1` with `"registry": "jsr"`.

Pass the lockfile back in with `createRouter(routes, { lock })` and the same versions come back without asking the registry again. The same entry files and builds come back too. Passing `{ relock: true }` to `resolve` ignores the lock. The lockfile `build()` returns holds every resolution the router has made so far, so use a fresh router per build.

## CLI

```bash
npx @johnhenry/mport build react@^19 lit/   # writes importmap.json and mport.lock.json
npx @johnhenry/mport resolve react@^19 --trace
```

Once the package is installed the command is plain `mport`. By default the CLI reads `mport.config.mjs`. Its default export is either a router or `{ routes, specifiers, scopes, options }`:

```js
// mport.config.mjs
import { esmSh, jsDelivr, unpkg, jsr } from "@johnhenry/mport";
export default {
  routes: { "*": [esmSh(), jsDelivr(), unpkg()], "@std/*": jsr() },
  specifiers: ["react@^19", "@std/path@^1"],
};
```

Flags: `--config`, `--out importmap.json`, `--lock mport.lock.json`, `--relock`, `--trace`. When the config exports a router, `--lock` is not applied to it; pass `lock` to your own `createRouter`. Details: [API › The CLI](/mport/api/cli/).
