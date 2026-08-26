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
