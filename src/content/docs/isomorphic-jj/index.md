---
title: "isomorphic-jj"
description: "Jujutsu (jj) version control semantics in pure JavaScript — stable change IDs, fearless undo, first-class conflicts — in Node.js and browsers."
---

**`@johnhenry/isomorphic-jj`** is a pure-JavaScript reimplementation of
[Jujutsu (jj)](https://jj-vcs.github.io/jj/)'s version-control *model*:
stable change IDs that survive rewrites, an operation log that makes
anything undoable, no staging area, and conflicts as data instead of
blockers. It never shells out — Git compatibility comes from
[isomorphic-git](https://isomorphic-git.org/) underneath — so the same API
runs in Node.js, browsers, and workers. Ships a CLI (`isojj`), a `/browser`
entry, and full TypeScript definitions.

> Previously published as `isomorphic-jj`. That package's final release is
> **1.8.0**, a bridge release pointing at this package; it is now
> deprecated. Renamed to `@johnhenry/isomorphic-jj` on import into the
> @johnhenry family and restarted at 0.0.0 — but you'll find it at **0.2.0**,
> because a jj-v0.44 parity pass (`tag.track()`/`untrack()`, the
> `builtin_log()` revset, `file.search({ nameOnly })`) landed together with
> the adoption. Same library, same API lineage; the version restart is a new
> address, not a maturity signal.

:::tip Used in production by JJHub
[JJHub](https://jjhub.erisera.com) — a Jujutsu-native overlay on GitHub with
stable change IDs, stacked PRs, platform-wide undo, and an MCP server for
coding agents — is built on this library. If you want to see the change
graph, oplog, and revset model at work in a real product before committing
to it yourself, that's the place to look.
:::

## Install

```sh
npm install @johnhenry/isomorphic-jj isomorphic-git
```

`isomorphic-git` is an optional peer dependency — skip it and you get a
storage-only repo with jj semantics but no `.git` directory and no remotes.
For browsers, add `@isomorphic-git/lightning-fs`. Node 20+.

## Quick start

```javascript
import { createJJ } from '@johnhenry/isomorphic-jj';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'node:fs';

const jj = await createJJ({ fs, dir: '/path/to/repo', git, http });
await jj.git.init({ userName: 'You', userEmail: 'you@example.com' });

await jj.write({ path: 'README.md', data: '# hello' });
await jj.describe({ message: 'First change' });   // no add, no staging
await jj.new({ message: 'Next change' });          // start the next change

const log = await jj.log({ revset: 'all()' });
await jj.undo();                                   // any operation, not just commits
```

## The working copy IS a change — internalize this before anything else

There is no staging area and no "dirty" state. The working copy is itself a
change with a stable `changeId` (spelled `@` in revsets). `describe()` names
the *current* change; `new()` seals it and starts the next one. If you never
call `new()`, every subsequent write and `describe()` keeps mutating the
same change — including via `commit()`, which will happily *rename* an
already-described change if you haven't moved on. `commit({ message,
nextMessage })` is exactly `describe()` + `new()`.

## This is jj's model, not the jj CLI

It reimplements the semantics — change graph, oplog, revsets, conflicts —
in JS. It is not a binding to the `jj` binary and doesn't replicate the
terminal UX, templating engine, or anything that requires spawning
processes (`jj run` is deliberately absent: there's no isomorphic way to
"run a subprocess per revision" in a browser). Repos are stored as `.jj/`
JSON metadata beside a normal `.git/`, so Git tools see ordinary commits.

## The Git boundary is explicit

Everything Git-shaped — real commits, clone/fetch/push — is delegated to
isomorphic-git and requires the `git` (and, for remotes, `http`) options at
`createJJ()` time. Without them you're in storage-only mode: fully
functional jj semantics, no Git objects. Two consequences worth knowing on
day one: duration revsets (`last(7d)`, `since(...)`) filter on committer
timestamps that only exist once a Git backend makes real commits, and
`git.clone()` produces a git-level clone — running `init()` inside it
re-roots `refs/heads/main` onto a fresh change, orphaning the fetched
history. Details in [Bookmarks & remotes](/isomorphic-jj/bookmarks-and-remotes/).

## Browser storage is real but evictable

The `/browser` entry gives you an IndexedDB-backed filesystem
(`createBrowserFS()`), capability detection, and quota introspection. Until
you call `requestPersistentStorage()` (and the browser grants it), your
repos live in best-effort storage the browser may silently clear. Remote
operations from a page also need a CORS proxy for most Git hosts. See
[Getting started](/isomorphic-jj/getting-started/#browser).

## The pages here

- [Getting started](/isomorphic-jj/getting-started/) — first repo to first
  commits, Node and browser
- [Repositories](/isomorphic-jj/repositories/) — repo lifecycle, storage
  layout, backends, the working-copy model
- [History](/isomorphic-jj/history/) — changes, log, revsets (and where
  they diverge from real jj), diff, evolution, undo, conflicts
- [Bookmarks & remotes](/isomorphic-jj/bookmarks-and-remotes/) — bookmarks,
  tags and v0.44 tracking, Git fetch/push interop, auth
- [Configuration](/isomorphic-jj/configuration/) — config files, layers,
  programmatic overrides
- [Migration from isomorphic-git](/isomorphic-jj/migration-from-isomorphic-git/)
  — side-by-side API comparison and an honest architecture comparison
- [Examples](/isomorphic-jj/examples/) — the repo's 12 runnable,
  self-asserting examples, annotated

## Status

Tracks Jujutsu through **v0.44** (as of 0.2.0): the v0.31–v0.43 revset and
command batch landed in the 1.5 lineage, and the v0.44 pass added tag
tracking, `builtin_log()`, and `file.search({ nameOnly })` while documenting
`git_refs()`/`git_head()` as deprecated (real jj removed them in v0.43;
here they still work). 1730 tests passing, ~97% statement / 91% branch
coverage. Ready for experimentation and prototyping; some edges (fetch-time
remote-tracking import, push conflict guards) are consciously deferred —
the repo's CHANGELOG says which and why.

Source: [github.com/johnhenry/isomorphic-jj](https://github.com/johnhenry/isomorphic-jj)
· API reference in the repo's `API.md`; every example in
[`examples/`](https://github.com/johnhenry/isomorphic-jj/tree/main/examples)
runs in CI.
