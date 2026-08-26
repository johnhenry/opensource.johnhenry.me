---
title: "Repositories"
description: "Repository lifecycle, on-disk layout, storage backends, the working-copy snapshot model, workspaces, and the event system."
---

A repository is whatever directory you hand to `createJJ()`. This page is
about what lives inside it and which moving parts you've opted into.

## createJJ() options

```javascript
const jj = await createJJ({
  fs,          // required: Node fs, LightningFS, or any fs.promises-compatible impl
  dir,         // required: absolute path to the repo root
  git,         // optional: the isomorphic-git module — enables the Git backend
  http,        // optional: isomorphic-git http client — enables remotes
  corsProxy,   // optional: browser CORS proxy for remote operations
  author,      // optional: default { name, email }
  autoSnapshot,// optional: default true — walk the disk before reads/commits
  onProgress,  // optional: progress callback for long operations
});
```

The instance is stateful and scoped to `dir`; create one per repository.
Everything hangs off namespaces: `file.*`, `bookmark.*`, `tag.*`, `git.*`,
`workspace.*`, `operations.*`, `conflicts.*`, `config.*`, plus the core
methods (`describe`, `new`, `log`, …).

## Two init paths, three modes

| Call | What you get |
| --- | --- |
| `jj.init({ userName, userEmail })` | Storage-only: `.jj/` metadata, no Git objects. Fast, runs anywhere, no peers needed. |
| `jj.git.init({ userName, userEmail })` | Colocated: `.git/` + `.jj/`. Real commits on `describe()`; git CLI and jj tooling both work in the tree. |
| `jj.git.clone({ url, dir })` | A git-level clone with `.jj/` scaffolding added. See the warning below. |

Storage-only mode is not a toy — the full change graph, oplog, revsets, and
conflicts work. What it lacks is Git objects, so no interop, no push/fetch,
and no committer timestamps (which duration revsets filter on).

**Clone warning:** `git.clone()` gives you fetched Git history plus `.jj/`
scaffolding, but running `init()` inside the clone creates a brand-new root
change and repoints `refs/heads/main` at it — orphaning what you cloned.
Treat clones as git-level repos (drive them with isomorphic-git or the
`git.*` namespace); do jj-native work in repos you initialized yourself.

## On-disk layout

```
repo/
├── .git/                    # Git objects — only with the git backend
└── .jj/
    ├── graph.json           # change graph: stable IDs, parents, file snapshots
    ├── oplog.jsonl          # append-only operation log (one JSON op per line)
    ├── bookmarks.json       # bookmarks + remote-tracking state
    ├── tags.json            # tags; { tags, tracked } envelope since v0.44 pass
    ├── config.json          # persisted configuration
    ├── conflicts/           # conflict descriptors (data, not markers)
    └── working-copy.json    # current change pointer + tracked file state
```

All jj metadata is plain JSON — inspectable, diffable, and portable across
Node and browser filesystems. Deleting `.jj/` de-jj-ifies a colocated repo;
the Git history stays.

## The backend layer

Architecture is porcelain over pluggable plumbing:

```
your app → isomorphic-jj (change graph, oplog, revsets, conflicts)
              └─ backend interface
                   ├─ IsomorphicGitBackend   (default when `git` is passed)
                   └─ storage-only / mock    (tests, no-Git mode)
```

The backend owns Git objects, refs, and the network (`fetch`/`push` demand
the `http` option and throw `NETWORK_NOT_AVAILABLE` without it). The
porcelain never touches Git internals directly, which is why the same code
runs against no backend at all.

## The working-copy model

The working copy is a change (`@`), and since v1.6 the library behaves like
jj proper: before `status()`, `describe()`, `diff()`, `read()`,
`file.list()`, and `file.search()` it **snapshots the working directory** —
walking the disk (skipping `.git`, `.jj`, `node_modules`) and reconciling
tracked state. Files your editor created, modified, or deleted out-of-band
are picked up; a deleted file is gracefully untracked.

```javascript
await jj.snapshot();                 // force one explicitly
const jj2 = await createJJ({ fs, dir, autoSnapshot: false }); // opt out
```

With `autoSnapshot: false` only `jj.write()`-tracked files exist as far as
the repo is concerned — useful for high-volume programmatic use where you
control every write.

## Workspaces: several working copies, one repo

```javascript
const ws = await jj.workspace.add({ path: './review', name: 'review', changeId });
await jj.workspace.list();
await jj.workspace.rename({ workspace: ws.id, newName: 'review-2' });
await jj.workspace.root({ workspace: 'review-2' });
await jj.workspace.updateStale();    // re-point workspaces at abandoned changes
await jj.workspace.remove({ id: ws.id });
```

Repository data (`.jj/repo/`) is shared; each workspace directory gets its
own working-copy state plus `.git`/`.jj` marker files, mirroring the jj
CLI's layout.

## Events and background operations

The instance extends `EventTarget`. Lifecycle events fire around mutating
operations (`change:creating` / `change:created`, `change:updating` /
`change:updated`, `pre-commit` / `post-commit`, `merge:conflict`, …); the
`-ing` forms are cancelable via `event.preventDefault()` — a pre-commit
gate in five lines:

```javascript
jj.addEventListener('change:creating', (e) => {
  if (e.detail.description?.includes('WIP')) e.preventDefault();
});
```

Node-only, `background.*` adds a work queue, file watching, and debounced
auto-snapshots (`background.start()`, `background.watch(dir, cb)`,
`background.enableAutoSnapshot({ debounceMs })`). Streaming reads/writes
(`readStream`/`writeStream`) are also Node-only.

## Errors

Everything throws `JJError` — `{ code, message, context, suggestion }`.
Match on `code` (`NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_ARGUMENT`,
`NETWORK_NOT_AVAILABLE`, `UNSUPPORTED_OPERATION`, …); the `suggestion`
field usually tells you the fix outright.

Next: [History](/isomorphic-jj/history/) — the change graph you're now
storing, and how to query and rewrite it.
