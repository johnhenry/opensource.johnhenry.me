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
      "url": "https://esm.sh/react@19.2.0?target=es2022"
    }
  }
}
```

Keys are the specifier as written: a registry prefix appears only if you wrote one (`npm:react@^19`), and the entry's `registry` says which registry actually served the package. A bare `@std/path@^1` routed to JSR is keyed `@std/path@^1` with `"registry": "jsr"`.

Pass the lockfile back in with `createRouter(routes, { lock })` and the same versions come back without asking the registry again. The same entry files and builds come back too. Passing `{ relock: true }` to `resolve` ignores the lock. The lockfile `build()` returns holds every resolution *this router* has made so far (the lockfile you passed in only pins; entries you no longer build are dropped), so use a fresh router per build.

Two specifiers that map one key to different URLs (`react@18` and `react@19`) make `build()` throw a `ResolutionError` that points at `scopes`; give the second version its own scope as above, or let mport do it (next section). To put the result in a server-rendered page, see [`renderImportMap()` and `renderModulePreload()`](/mport/api/lockfiles-and-import-maps/#renderimportmap).

### Two versions of one package: `conflicts: "scope"`

An import map maps a key to one URL, so `react@18` and `react@19` in one build used to be an error. `build(specifiers, { conflicts: "scope" })` keeps the first listed version in `imports` and reads each other package's registry manifest to scope the right version to the package that depends on it. The result also carries a `conflicts` report, and each handled key is traced as a `conflict` event.

```js
const { importMap, conflicts } = await router.build(
  ["react@19.2.0", "react@18.3.1", "lib-a@1.0.0"],   // lib-a depends on react ^18
  { conflicts: "scope" },
);
// importMap.imports.react                          → react 19 (first listed)
// importMap.scopes["…/npm/lib-a@1.0.0/"].react     → react 18
```

The default stays `"error"`: which version the page's own code gets is a decision, not a default. Dependents are the packages in the build, not their transitive dependencies, and scopes only affect bare imports, so they change nothing for esm.sh or jsDelivr `+esm`. Details and limits: [API › Conflicting versions](/mport/api/router/#conflicting-versions-conflicts-scope).

### Integrity for the whole graph: `graph`

`verified()` hashes the entry file only, and on esm.sh that file is a stub that re-exports from `/react@19.2.0/es2022/react.mjs`. `build(specifiers, { graph: true })` fetches each module, follows its static imports on the same origin (with `parseImports()`), and records a hash for every file: as the import map's `integrity` (the browser verifies each one) and as the lockfile's top-level `files` map. The next build refuses a file whose bytes changed, with an `IntegrityError`.

```js
const { importMap, lock, graph } = await router.build(["react@^19"], { graph: { maxFiles: 300, maxDepth: 10 } });
// importMap.integrity: { "https://esm.sh/react@19.2.0?target=es2022": "sha384-…", "https://esm.sh/react@19.2.0/es2022/react.mjs": "sha384-…", … }
// graph.truncated: [] unless a bound cut the walk short (also a `truncated` event)
```

It is a build-time download of everything, a tokenizer-level parser and same-origin only: [API › Whole-graph integrity](/mport/api/router/#whole-graph-integrity-graph).

## Bundler plugins

Resolve bare imports through a router while bundling, with the same routes, lockfile and strategies:

```js
// vite.config.js (production builds)
import mportVite from "@johnhenry/mport/vite";
export default { plugins: [mportVite(router, { packageJson: true })] };            // imports become CDN URLs
export default { plugins: [mportVite(router, { mode: "importmap" })] };            // imports stay bare; the import map is injected into index.html

// rollup.config.js
import mportRollup from "@johnhenry/mport/rollup";
export default { input: "src/main.js", plugins: [mportRollup(router, { versions: { react: "^19" } })], output: { dir: "dist" } };
```

`mode: "external"` (default) rewrites `import "react"` to `https://esm.sh/react@19.2.0?target=es2022`; `mode: "importmap"` keeps it bare and gives you the import map (Vite injects it; Rollup emits `importmap.json`), which can carry `conflicts: "scope"` scopes and `graph` integrity through the `build` option. Neither `vite` nor `rollup` is a dependency of mport. Options and limits: [API › Bundler plugins](/mport/api/bundler-plugins/).

## CLI

```bash
npx @johnhenry/mport build react@^19 lit/   # writes importmap.json and mport.lock.json
npx @johnhenry/mport resolve react@^19 --trace
```

Once the package is installed the command is plain `mport`. By default the CLI reads `mport.config.mjs`. Its default export is a `{ routes, specifiers, scopes, options }` object, a function `({ lock, relock }) => router | object`, or a prebuilt router:

```js
// mport.config.mjs
import { esmSh, jsDelivr, unpkg, jsr } from "@johnhenry/mport";
export default {
  routes: { "*": [esmSh(), jsDelivr(), unpkg()], "@std/*": jsr() },
  specifiers: ["react@^19", "@std/path@^1"],
};
```

Flags: `--config`, `--out importmap.json`, `--lock mport.lock.json`, `--relock`, `--conflicts error|scope`, `--graph` (`--max-files`, `--max-depth`), `--trace`, `--json`. A function config receives the parsed lockfile (`undefined` with `--relock` or when there is none): `export default ({ lock }) => createRouter(routes, { lock })`. A prebuilt router can't take a lockfile, so `--lock`/`--relock` with one is an error and `build` leaves the lock file alone. Details: [API › The CLI](/mport/api/cli/).

### Keeping a lockfile current: `mport outdated` and `mport update`

```sh
npx @johnhenry/mport outdated            # package  current  wanted  latest
npx @johnhenry/mport outdated --json     # { outdated: [...], skipped: [...] }
npx @johnhenry/mport update react        # re-resolve react's entries within their ranges, rewrite the lockfile
npx @johnhenry/mport update              # all of them
npx @johnhenry/mport build               # then regenerate the import map
```

`wanted` is the newest version the specifier's own range allows, `latest` the registry's `latest` tag; `update` moves to `wanted`, never past the range. It rewrites the lockfile only: run `build` for the import map. Details: [API › `mport outdated` and `mport update`](/mport/api/cli/#mport-outdated-and-mport-update).
