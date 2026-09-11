---
title: "Examples"
description: "The repo's twelve runnable, self-asserting examples, annotated — what each demonstrates and which behavioral quirks it documents."
---

The repository ships twelve numbered examples in
[`examples/`](https://github.com/johnhenry/isomorphic-jj/tree/main/examples).
They aren't snippets: each runs in a temp directory, cleans up after
itself, and **asserts** what it demonstrates, so the whole set doubles as a
smoke test (`npm run examples` — CI runs the same loop). Several exist
precisely to pin down behavior that differs from what you'd guess; those
quirks are flagged below.

Run any of them from a clone — no build step:

```sh
git clone https://github.com/johnhenry/isomorphic-jj && cd isomorphic-jj && npm install
npm run example:01      # or: node examples/01-init-commit-log.mjs
npm run examples        # all twelve
```

## The core model

- [`01-init-commit-log.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/01-init-commit-log.mjs)
  — init → `write` → `describe` → `new` → `log`, plus `commit()` as
  describe+new. Deliberately shows that you must `new()` before `commit()`
  or the describe half renames the change you're still on.
- [`02-stacked-changes.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/02-stacked-changes.mjs)
  — a three-layer stack; `edit()`+`amend()` the bottom layer; asserts all
  three change IDs and the parent links survive. *Quirk it documents:*
  auto-rebase is graph-level — read content at a specific change
  (`read({ path, changeId })`) rather than assuming a parent's edit flowed
  into descendant snapshots.
- [`03-history-editing.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/03-history-editing.mjs)
  — `split({ paths1 })`, `squash({ into })`, `abandon()`/`unabandon()`
  round-trip with content intact, `duplicate()`.

## Merging and conflicts

- [`04-branching-and-merging.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/04-branching-and-merging.mjs)
  — diverging without branches (edit the base, `new()`), then the two
  merges: `merge({ source })` as an in-place *content* merge vs
  `new({ parents: [a, b] })` for a true two-parent change — only the
  latter shows up in the `merge()` revset.
- [`05-conflicts.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/05-conflicts.mjs)
  — `dryRun` preview, a conflicting merge that completes anyway, working
  on something else while the conflict sits unresolved, then
  `conflicts.list()` → `markers()` → `resolve({ strategy: 'theirs' })`.

## Queries and names

- [`06-revsets.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/06-revsets.mjs)
  — ~20 revsets across selectors, filters, navigation, set operators, and
  nesting. *Quirks it documents:* `file()` matches snapshots (every change
  carrying the file), and duration forms like `last(7d)` need committer
  timestamps, so they're empty in storage-only mode.
- [`07-bookmarks-and-tags.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/07-bookmarks-and-tags.mjs)
  — bookmark `create`/`set`/`move`/`rename`/`delete`, `advance()` refusing
  a non-descendant (`BOOKMARK_NOT_ADVANCEABLE`), exact-vs-pattern revset
  lookup, and jj-v0.44 `tag.track()`/`untrack()` with the `tracking` field
  in `tag.list()`.

## The outside world

- [`08-git-interop.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/08-git-interop.mjs)
  — the deep one: real `git.clone()`, `git.push()`, `git.fetch()` with
  **zero network**. It builds a bare fixture with the git CLI, serves it on
  127.0.0.1 through `git http-backend` (a ~40-line CGI adapter — note it
  buffers request bodies because CGI needs `CONTENT_LENGTH` and
  isomorphic-git streams chunked), pushes a bookmark exported via
  `git.export()`, and verifies with the git CLI against the bare repo.
  Skips cleanly if git isn't installed. Steal the server for your own
  tests.
- [`09-config.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/09-config.mjs)
  — persisted `config.set()`, the override-vs-workspace layer precedence,
  deep-merge keeping sibling keys, and bare `load()` as the reset.

## Time travel and files

- [`10-undo-and-oplog.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/10-undo-and-oplog.mjs)
  — `undo()`/`redo()`, `operations.revert()` inverting a bookmark move
  without touching later work, `operations.at()` for a read-only view of
  the repo at a past operation, and `obslog()` for one change's evolution.
- [`11-file-operations.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/11-file-operations.mjs)
  — the `file.*` namespace: historical `show({ changeId })`, `annotate()`
  (line attribution goes to the latest change whose snapshot carries the
  line), `search()` including v0.44's `nameOnly`, `move`/`remove`.
- [`12-browser.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/12-browser.mjs)
  — the browser recipe (capability detection, persistent storage,
  LightningFS, CORS proxy, what's Node-only) as a commented reference;
  under Node it verifies the `/browser` entry's exports so CI catches
  drift.

If an example's assertion ever disagrees with these pages, trust the
example — it runs in CI; prose doesn't.

## All twelve, at a glance

| # | Script | What it shows |
| --- | --- | --- |
| 01 | [`01-init-commit-log.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/01-init-commit-log.mjs) | The core loop: init → write → `describe()` → `new()` → `log()`; `commit()` as describe+new; no staging area |
| 02 | [`02-stacked-changes.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/02-stacked-changes.mjs) | Stable change IDs; a 3-layer stack; `edit()`+`amend()` a bottom layer while IDs and parentage hold |
| 03 | [`03-history-editing.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/03-history-editing.mjs) | `split()`, `squash({ into })`, `abandon()`/`unabandon()`, `duplicate()` |
| 04 | [`04-branching-and-merging.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/04-branching-and-merging.mjs) | Diverging without branches; `merge({ source })` content merge vs `new({ parents })` true merge change |
| 05 | [`05-conflicts.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/05-conflicts.mjs) | First-class conflicts: `dryRun` preview, non-blocking merge, `conflicts.list()`/`markers()`/`resolve({ strategy })` |
| 06 | [`06-revsets.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/06-revsets.mjs) | The revset language: selectors, filters, navigation, set operators, nesting — plus where semantics diverge from real jj |
| 07 | [`07-bookmarks-and-tags.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/07-bookmarks-and-tags.mjs) | Bookmarks (`set`/`move`/`advance`/`rename`/`track`), tags, and `tag.track()` from the jj v0.44 parity pass |
| 08 | [`08-git-interop.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/08-git-interop.mjs) | Real `git.clone()`/`git.push()`/`git.fetch()` against a local fixture served by `git http-backend` — zero network. Needs the `git` CLI (skips cleanly without it) |
| 09 | [`09-config.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/09-config.mjs) | Config layers: persisted `config.set()`, programmatic `load({ override, workspace })`, deep-merge, reset |
| 10 | [`10-undo-and-oplog.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/10-undo-and-oplog.mjs) | The operation log: `undo()`/`redo()`, `operations.revert()` for non-commit ops, `operations.at()` time travel, `obslog()` |
| 11 | [`11-file-operations.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/11-file-operations.mjs) | The `file.*` namespace: historical `show()`, `annotate()` (blame), `search()` incl. v0.44 `nameOnly`, `move`/`remove` |
| 12 | [`12-browser.mjs`](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/12-browser.mjs) | Browser usage (IndexedDB fs, persistence, CORS proxy) as a commented reference; verifies the `/browser` entry under Node |

Run the whole suite with `npm run examples` (the same loop CI runs), or one
script at a time with `npm run example:01` through `npm run example:12`.

## Example apps

Three full applications under
[`example/`](https://github.com/johnhenry/isomorphic-jj/tree/main/example)
(singular, distinct from the `examples/` scripts above) exercise the
library at application scale rather than API-call scale — each was built
specifically to find bugs that only show up under realistic, multi-feature
use:

- **[`jj-wiki`](https://github.com/johnhenry/isomorphic-jj/tree/main/example/jj-wiki)**
  — a collaborative wiki with conflict resolution: concurrent page edits,
  private draft workspaces, and automatic merge strategies for text
  conflicts.
- **[`jj-review-tool`](https://github.com/johnhenry/isomorphic-jj/tree/main/example/jj-review-tool)**
  — a code review collaboration CLI: stacked-change review workflows,
  submit/update/assign/comment/approve, and review analytics.
- **[`jj-storage-server`](https://github.com/johnhenry/isomorphic-jj/tree/main/example/jj-storage-server)**
  — a REST API server for versioned document storage, using isomorphic-jj
  as the backend for automatic history, undo/redo, and time travel over
  HTTP.

Each app has its own `PLAN.md`; the repo's `example/COMPARISON.md` and
`example/SUMMARY.md` cover what building all three found and fixed.
