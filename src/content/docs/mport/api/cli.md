---
title: "The CLI"
description: "mport build, resolve, outdated and update: flags, the config module, output and exit codes."
sidebar:
  order: 111
---

```
mport build   [specifier...] [--config file] [--out importmap.json] [--lock mport.lock.json] [--relock] [--conflicts error|scope]
              [--graph [--max-files N] [--max-depth N]]
mport resolve <specifier> [--config file] [--trace] [--lock mport.lock.json] [--relock]
mport outdated [name...] [--config file] [--lock mport.lock.json] [--json]
mport update   [name...] [--config file] [--lock mport.lock.json] [--json]
mport --help
```

Run it with `npx @johnhenry/mport …` or, once installed, `npx mport …`. It needs a
global `fetch` (Node 18+; the package declares Node >= 26).

| Flag | Short | Default | Meaning |
|---|---|---|---|
| `--config` | `-c` | `mport.config.mjs` in the working directory, if it exists | the config module |
| `--out` | `-o` | `importmap.json` | where `build` writes the import map |
| `--lock` | `-l` | `mport.lock.json` | the lockfile both commands read (if it exists) and `build` writes. Not for prebuilt-router configs (error) |
| `--relock` | | `false` | don't read the lockfile (not for prebuilt-router configs: error) |
| `--conflicts` | | config's `conflicts`, else `error` | `build`: `scope` generates import-map scopes for conflicting versions (see [Conflicting versions](/mport/api/router/#conflicting-versions-conflicts-scope)) |
| `--graph` | | `false` (or config's `graph`) | `build`: hash the whole import graph (see [Whole-graph integrity](/mport/api/router/#whole-graph-integrity-graph)); the lockfile gets `files`, the import map `integrity` for every file; prints a warning per truncated walk |
| `--max-files`, `--max-depth` | | 500, 20 | the graph bounds; imply `--graph` |
| `--json` | | `false` | `outdated` and `update` print JSON |
| `--trace` | | `false` | `resolve` prints the trace too |
| `--help` | `-h` | | print usage |

**The config module's default export** is a config object
`{ routes?, specifiers?, scopes?, options? }`, a function, or a router (anything with a
`resolve` function):

| Field | Default | Meaning |
|---|---|---|
| `routes` | `{ "*": [esmSh(), jsDelivr(), unpkg()] }` | passed to `createRouter` |
| `options` | `{}` | passed to `createRouter`, with `lock` set from `--lock` |
| `specifiers` | `[]` | what `build` resolves when none are given on the command line |
| `scopes` | none | passed to `build` |
| `graph` | off | `true` or `GraphOptions`, passed to `build` |
| `conflicts` | `"error"` | passed to `build` (the `--conflicts` flag overrides it) |

With no config at all, the default routes are used.

**A function** is called as `config({ lock, relock, lockPath })` and returns a router or a
config object. `lock` is the parsed lockfile (`undefined` with `--relock`, or when the file
doesn't exist), so `export default ({ lock }) => createRouter(routes, { lock })` honours
`--lock` and `--relock`. It may be `async`.

**A prebuilt router** was constructed before the CLI knew about the lockfile, so it can't
be given one. Passing `--lock` or `--relock` with it is an error (`--lock has no effect
because … exports a prebuilt router`), and `build` writes the import map but does **not**
write the lock file (it says so), rather than overwriting a committed lockfile with one the
flags never influenced.

**`build`** resolves the specifiers, writes the import map and the lockfile (both as
two-space JSON with a trailing newline), and prints
`mport: wrote importmap.json (N imports) and mport.lock.json`. It fails if there are no
specifiers. **`resolve`** prints the Resolution as JSON without `module` and, unless
`--trace`, without `trace`; an unroutable specifier prints `{}`.

### `mport outdated` and `mport update`

```
mport outdated [name...] [--config file] [--lock mport.lock.json] [--json]
mport update   [name...] [--config file] [--lock mport.lock.json] [--json]
```

Both need the lockfile (an error if it doesn't exist) and use the config's router, so its
registries and `fetch` apply. `name` selects entries by lock key (`react@^19`), specifier
or package name (`react`, which matches every entry for that package); none selects all.

**`outdated`** prints a table (`package current wanted latest`) of the entries where the
locked version is behind what the range allows or behind `latest`, then a
`mport: skipped <key>: <reason>` line for each it could not judge (see
[`outdated()`](/mport/api/registry-and-semver/#outdated)), or `mport: everything in the lockfile is up to date`. `--json`
prints `{ "outdated": OutdatedRow[], "skipped": [...] }`. It always exits 0: read the JSON
to gate on it. It only reads, so a prebuilt-router config works.

**`update`** re-resolves the selected entries (their pins are dropped, so they go back to
the registry; the router's strategy, build and mirrors choose the URL as in `build`) and
re-resolves every other entry against its pin, then rewrites the lockfile if it changed
and prints `mport: <specifier>: <from> -> <to>` per moved entry. Notes:

- It moves a package **within its range** (`^19` to the newest 19.x), never past it; to cross
  a major, change the specifier and `build`.
- It does **not** touch the import map: run `mport build` afterwards.
- It re-resolves every locked specifier (to rebuild a complete lockfile), so all CDN
  probes of a build run; entries that conflict on one import-map key are handled as with
  `--conflicts scope`.
- A lockfile with `files` (graph hashes) gets its graph re-walked and **all** its file
  hashes re-recorded, not only the selected packages': the files of one entry cannot be told
  from another's.
- `--relock` is an error (it is what `update` without names does); a prebuilt-router
  config is an error, as for `build`.
- `--json` prints `{ "updated": [{ key, specifier, name, from, to }], "checked": N, "lockfile", "written": bool }`.

Exit codes: 0 on success; on any error the message goes to stderr and the exit code is 1
(unknown command, missing specifier, a rejected resolution).

The default probe is `"head"`, so a build makes real requests. The CLI's `main(argv,
{ log, cwd })` is exported from `bin/mport.mjs` for tests; it is not part of the package's
`exports` and can change.
