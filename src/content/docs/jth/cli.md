---
title: "CLI"
description: "The jth command-line interface: running programs, compiling to self-contained or bare JavaScript, inline code, and the REPL."
---

The CLI is the package `@johnhenry/jth`; the binary it installs is `jth`.

```sh
npm install -g @johnhenry/jth
```

For one-off use without installing, `npx @johnhenry/jth run file.jth` works —
the package declares a single bin, so npx runs it even though the bin name
(`jth`) differs from the package name. **Never type `npx jth`**: the unscoped
`jth` package on npm belongs to another user, and npx would fetch and execute
it.

## Commands at a glance

```
jth run <file>              Compile and execute a .jth file
jth run -c '<code>'         Compile and execute inline jth code
jth compile <file> [output] Compile to a self-contained .mjs bundle
jth compile --no-bundle <file> [output]
                            Compile with bare @johnhenry/jth-* imports
jth compile -c '<code>'     Compile inline code to stdout (always unbundled)
jth repl                    Start the interactive REPL
jth --version | -v          Print version
jth --help | -h             Print help
```

Bare `jth` with no arguments prints help — it does *not* start the REPL. Use
`jth repl` for that.

## Run

`jth run` compiles, bundles into a temp module (in the OS temp dir — nothing
is written next to your sources), and executes with plain node:

```sh
jth run program.jth
jth run -c '2 3 + peek;'    # inline: prints 5
```

Errors are reported with source position (`line:column`) when the failure is
a jth lexer, parser, or runtime error.

## Compile: bundled by default

`jth compile` writes a `.mjs` module. If you omit the output path, it derives
one from the input (`math.jth` → `math.mjs`). The default output is a
**self-contained bundle**: `@johnhenry/jth-runtime` and `@johnhenry/jth-stdlib`
are inlined via esbuild, so the artifact runs anywhere node runs, with nothing
installed:

```sh
jth compile math.jth              # writes math.mjs (bundled)
node math.mjs                     # runs from any directory
```

## Choose --no-bundle for libraries, the default for programs

`--no-bundle` keeps `"@johnhenry/jth-runtime"` / `"@johnhenry/jth-stdlib"` as
bare import specifiers — smaller, readable output for projects that already
have the jth packages installed:

```sh
jth compile --no-bundle math.jth
```

The split matters in multi-file projects: compile *library* modules (things a
main program `::import`s) with `--no-bundle`, and let the main program's
bundling step inline everything once. Bundling every module would duplicate
the runtime in each file — and give each its own operator registry.

`jth compile -c '<code>'` prints the compiled JavaScript to stdout and is
always unbundled — it exists for inspecting what the compiler emits:

```sh
jth compile -c '1 2 + peek;'
```

## REPL

```sh
jth repl
```

The stack persists across inputs, and the full stack is printed after each
evaluation — so you can type `1 2 3`, then `+`, then `*` on separate lines
and watch it collapse to `[ 5 ]`.

| Dot-command | Description |
|---|---|
| `.help` | List dot-commands |
| `.peek` | Print the top stack value |
| `.count` | Print the stack depth |
| `.stack` | Print the full stack as an array |
| `.clear` | Empty the stack |
| `.exit` / `.quit` | Quit |

## In npm scripts

The repo itself runs its examples this way — a project with jth as a
dependency can put the binary straight into scripts:

```json
{
  "devDependencies": { "@johnhenry/jth": "0.0.0" },
  "scripts": { "start": "jth run src/main.jth" }
}
```

Within the jth monorepo (no install), the built CLI is invoked directly as
`node packages/jth-cli/dist/bin/jth.js run <file>` — that is what the
`npm run examples` script does.
