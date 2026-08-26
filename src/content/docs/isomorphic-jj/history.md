---
title: "History"
description: "Changes vs commits, log and revsets (including divergences from real jj), diff, history editing, the operation log, and first-class conflicts."
---

History here is a graph of *changes*, not commits. A change's ID is stable
for its whole life; the Git commit behind it is disposable and regenerated
on every rewrite. Everything on this page operates on that graph.

## Changes vs commits

| | Change ID | Commit ID |
| --- | --- | --- |
| Assigned | at creation, once | per Git materialization |
| Survives amend/squash/rebase | yes | no |
| What you reference in code | always | almost never |

`log()`, `show()`, `status()` return both. Reference changes by `changeId`
(or a unique prefix via the `change_id(prefix)` revset).

## log() and show()

```javascript
await jj.log();                          // default revset: all()
await jj.log({ revset: 'mine()', limit: 10 });
await jj.show({ changeId: 'abc123', diff: true });
```

Each entry: `{ changeId, commitId, parents, description, author, … }`.

## Revsets

Every `revset` parameter takes the query language. Since 1.7.0 it's a real
tokenizer/parser/AST — arbitrary nesting (`roots(ancestors(x))`),
parentheses, quote-aware arguments, `&`/`|`/`~` with actual precedence.

| Category | Functions |
| --- | --- |
| Selectors | `@`, change-ID prefix, `all()`, `none()`, `root()`, `visible_heads()`, `builtin_log()` (v0.44) |
| Filters | `author(x)`, `author_name/email(x)`, `committer*(x)`, `description(x)`, `subject(x)`, `mine()`, `empty()`, `file(pattern)`, `conflicted()`, `signed()`, `divergent()`, `tracked()`, `untracked()` |
| Navigation | `@-`, `@--`, `@+`, `@++`, `parents(x)`, `children(x)`, `first_parent(x)`, `first_ancestors(x)` |
| Graph | `ancestors(x[, depth])`, `descendants(x[, depth])`, `roots(x)`, `heads(x)`, `latest(x, n)`, `reachable(x)`, `connected(a, b)`, `common_ancestor(a, b)`, `fork_point(x)`, `merge_point(x)`, `diverge_point(a, b)`, `range(a..b)` |
| Merges/forks | `merge()`, `merges()`, `forks()` |
| Time | `last(n)`, `last(7d)`, `last(24h)`, `since(date)`, `between(a, b)` |
| Names | `bookmark(name)`, `bookmarks([pat])`, `tags([pat])`, `remote_tags([pat])`, `remote_branches([pat])` |
| Resolution | `change_id(prefix)`, `commit_id(prefix)`, `exactly(x, n)`, `present(x)`, `coalesce(a, b, …)` |
| Sets | `x & y`, `x \| y`, `x ~ y`, `(grouping)` |

### Where this diverges from real jj — read before relying on revsets

- **`file(pattern)` matches snapshots, not modifications.** Every change
  whose file snapshot *contains* a matching path is returned — i.e. every
  change carrying the file, not just the ones that touched it. Real jj's
  `files()` matches modifications. Intersect with other filters when you
  need precision.
- **Duration and date forms need committer timestamps** (`last(7d)`,
  `since(...)`, `between(...)`). Those exist only when a Git backend makes
  real commits; in storage-only mode they match nothing. Count-based
  `last(n)` always works.
- **`empty()` is tree-based** and effectively meaningless in storage-only
  mode (every change matches the placeholder tree).
- **`git_refs()` / `git_head()` still evaluate here but are deprecated** —
  real jj removed them in v0.43. Use `bookmarks()`/`tags()`/`@`.
- Anything not in the table above (real jj's `::`/`..` operators as infix
  syntax, templates) isn't supported; ranges are spelled `range(a..b)`.

## diff()

```javascript
await jj.diff();                                   // @- vs @
await jj.diff({ from: idA, to: idB });
await jj.diff({ paths: ['src/auth.js'] });
// → { files: [{ path, status, diff, additions, deletions }] }
```

## Editing history

```javascript
await jj.edit({ changeId });        // make any change the working copy
await jj.amend({ message });        // rewrite it; descendants auto-rebase
await jj.squash({ into: id });      // default: @ into its parent
await jj.split({ changeId, description1, description2, paths1: ['docs/*'] });
await jj.rebase({ changeId, newParent });
await jj.abandon();                 // defaults to @; hides, doesn't delete
await jj.unabandon({ changeId });
await jj.duplicate({ changeId });   // same content, fresh change ID
await jj.parallelize({ changes: [a, b, c] });  // stack → siblings
await jj.absorb();                  // route @'s edits into the ancestors that own those lines
```

The auto-rebase is **graph-level**: descendants keep their change IDs and
parent links, and Git commits are regenerated — but each change's own file
snapshot is its own. Editing a parent's file doesn't rewrite the copy a
descendant's snapshot carries; read a file *at* the change you care about
(`read({ path, changeId })`) rather than assuming content flowed downstream.

## The operation log: undo anything

Every mutating call — describe, merge, bookmark move, all of it — appends
to `.jj/oplog.jsonl`. That gives you repo-wide undo, not per-ref reflog
archaeology:

```javascript
await jj.undo();                                  // roll back the last operation
await jj.redo();                                  // progressively re-apply (jj v0.33)
await jj.operations.list({ limit: 20 });
await jj.operations.show({ operation: opId });
await jj.operations.diff({ from: opA, to: opB }); // repo-state diff between ops
await jj.operations.restore({ operation: opId }); // jump the repo back wholesale
await jj.operations.revert({ operation: opId });  // apply the INVERSE of one op
const past = await jj.operations.at({ operation: opId });
await past.log({ revset: 'all()' });              // read-only time travel
```

Division of labor: `undo()` restores the working copy, files, and conflict
state of the previous operation. For surgically reversing one non-commit
operation (say, a bookmark move) without disturbing later work, use
`operations.revert()`. Change-level evolution — how one change was rewritten
over time — is `obslog({ changeId })`.

## Conflicts are data

`merge({ source })` three-way-merges the source change's files into the
working copy. On collision it does **not** throw and does not block — it
records structured conflicts and keeps going:

```javascript
const preview = await jj.merge({ source, dryRun: true });  // what would conflict?
const result  = await jj.merge({ source });                // { conflicts: [...] }

await jj.new({ message: 'other work' });   // carry on regardless

const conflicts = await jj.conflicts.list();      // { conflictId, path, type, sides }
await jj.conflicts.markers({ conflictId });       // git-style <<<< ==== >>>> text
await jj.conflicts.resolve({ conflictId, strategy: 'theirs' });  // or 'ours' | 'union'
await jj.conflicts.resolve({ conflictId, resolution: 'merged content' });
await jj.conflicts.resolveAll({ strategy: 'ours', filter: { path: '*.json' } });
```

Note `merge({ source })` is a *content* merge — it doesn't create a
two-parent change. For a true merge node in the graph, do what jj does
(`jj new A B`): `await jj.new({ parents: [a, b], message: 'Merge' })`. The
`merge()` revset finds only the latter.

Structured files can dodge conflicts entirely via merge drivers — built-ins
for `package.json`, JSON, YAML, Markdown, or your own `{ canMerge, merge }`
object — registered per glob with `jj.mergeDrivers.register({ '*.json':
jsonDriver })` or passed per-merge as `merge({ source, drivers })`.

Next: [Bookmarks & remotes](/isomorphic-jj/bookmarks-and-remotes/) to give
changes names the outside world can see.
