---
title: "Migration from isomorphic-git"
description: "Side-by-side API comparison, what actually changes in your mental model, an honest architecture comparison, and a phased migration path."
---

If you use isomorphic-git you already know the friction: staging
choreography on every commit, conflicts that throw and stop the world,
history editing that risks losing work, and `fs, dir` threaded through
every call. isomorphic-jj is built *on* isomorphic-git, so this is not a
rip-and-replace — the two coexist in the same repository while you migrate.

## The honest framing first

isomorphic-git reimplements **Git** in pure JS; its value is portability of
the standard. isomorphic-jj reimplements **jj's model** in pure JS and
delegates Git mechanics to isomorphic-git; its value is the semantics.
Consequences you should know up front:

- isomorphic-git stays in your dependency tree (as isomorphic-jj's peer)
  as long as you want Git objects or remotes. "Full migration" means your
  *code* stops calling it directly — not that it's uninstalled.
- Colocated repos are ordinary Git repos plus `.jj/` JSON. Teammates on
  git/isomorphic-git see normal commits and never notice. Reverting is
  `rm -rf .jj/`.
- Everything isomorphic-git supports transport-wise (smart HTTP, CORS
  proxies, `onAuth`) applies unchanged — same engine underneath.

## API side-by-side

| Task | isomorphic-git | isomorphic-jj |
| --- | --- | --- |
| Setup | `git.init({ fs, dir })` + two `setConfig` calls | `createJJ({ fs, dir, git, http })` then `jj.git.init({ userName, userEmail })` |
| Commit | write file → `git.add(...)` → `git.commit({ ..., author })` | `jj.write(...)` → `jj.describe({ message })` |
| Branch + switch | `git.branch(...)` + `git.checkout(...)` | `jj.new()` — name it later (or never) with `jj.bookmark.set()` |
| Merge | `git.merge(...)` inside try/catch; conflicts block | `jj.merge({ source })` — conflicts recorded as data, nothing blocks |
| Undo | `git.reset({ hard: true })` + reflog spelunking | `jj.undo()` |
| History query | `git.log({ depth })` | `jj.log({ revset: 'author(alice) & last(10)' })` |
| Fetch/push | `git.fetch/push({ fs, http, dir, ... })` | `jj.git.fetch/push({ remote, refs })` — `fs`/`dir`/`http` remembered |

The instance-based API is half the ergonomic win: `fs`, `dir`, `http`, and
author identity are given once at `createJJ()` and never again.

## The three real mental-model shifts

**1. No staging area.** `describe()` names the working-copy change; every
file write is already "in". The whole `add` vocabulary disappears — and so
does the class of bugs where you committed with a stale index.

**2. Conflicts don't block.** Where `git.merge()` forces an immediate
try/catch-and-fix detour, here the merge completes, conflicts land in
`jj.conflicts.list()` as `{ conflictId, path, type, sides }`, and you
resolve when you choose — per conflict, in bulk by strategy
(`resolveAll({ strategy: 'ours' })`), or with markers for a human.

**3. History is editable material.** A two-part change where part 1 has a
bug is not a rebase incident: `jj.edit({ changeId: part1 })`, fix,
`jj.amend()` — descendants re-parent automatically and every change keeps
its ID. And any misstep is one `jj.undo()` away, which removes most of the
fear that makes people avoid history editing in git.

## Migration path

**Phase 1 — coexist.** Add `@johnhenry/isomorphic-jj` next to
isomorphic-git and point both at the same directory. Existing repos work:
`jj.git.init()` on a repo that already has `.git/` just adds the `.jj/`
metadata. Keep committing however you do today; use `jj.log()`'s revsets
for the read paths first.

**Phase 2 — replace write paths.** Swap `add`+`commit` pairs for
`write`+`describe`, merges for `jj.merge()`, resets for `jj.undo()`. This
is call-site-local; nothing about the repository format changes.

**Phase 3 — retire direct calls.** Route remaining fetch/push through
`jj.git.*`. isomorphic-git remains installed as the peer dependency; your
code just no longer imports it (except to pass the module into
`createJJ()`).

## FAQ, condensed

- **Same repos?** Yes — colocated `.git` + `.jj`; all Git tools work.
- **Team impact?** None visible. From Git's side it's normal commits.
- **Escape hatch?** Delete `.jj/`; all commits live in `.git/`.
- **Performance?** Git ops are isomorphic-git speed by construction; jj
  metadata is JSON — fast in Node, fine in browsers, paginate big
  histories (`limit`/`offset`).
- **Learning curve?** One page of concepts: working copy is a change,
  `describe` then `new`, bookmarks are for pushing, undo is total. The
  [Getting started](/isomorphic-jj/getting-started/) page covers all four.

The repo's
[`MIGRATION_FROM_ISOMORPHIC_GIT.md`](https://github.com/johnhenry/isomorphic-jj/blob/main/MIGRATION_FROM_ISOMORPHIC_GIT.md)
is the long-form version, with fuller before/after code for feature
development, conflict handling, and browser usage.
