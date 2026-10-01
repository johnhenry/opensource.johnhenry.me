---
title: "The CLI"
description: "mport build and mport resolve: flags, the config module, output and exit codes."
sidebar:
  order: 110
---

```
mport build   [specifier...] [--config file] [--out importmap.json] [--lock mport.lock.json] [--relock]
mport resolve <specifier> [--config file] [--trace] [--lock mport.lock.json] [--relock]
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

Exit codes: 0 on success; on any error the message goes to stderr and the exit code is 1
(unknown command, missing specifier, a rejected resolution).

The default probe is `"head"`, so a build makes real requests. The CLI's `main(argv,
{ log, cwd })` is exported from `bin/mport.mjs` for tests; it is not part of the package's
`exports` and can change.
