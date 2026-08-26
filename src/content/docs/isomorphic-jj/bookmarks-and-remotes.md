---
title: "Bookmarks & remotes"
description: "Bookmarks and tags (including jj v0.44 remote tracking), the Git interop boundary, clone/fetch/push, and authentication."
---

Bookmarks are jj's named pointers — what git calls branches, minus the
requirement to have one. You work on anonymous changes and attach a
bookmark only when something *outside* the repo needs a stable name: a
remote, a release, a reviewer.

## Bookmarks

```javascript
await jj.bookmark.create({ name: 'main', changeId });   // create-only (ALREADY_EXISTS otherwise)
await jj.bookmark.set({ name: 'main', changeId });      // create-or-move
await jj.bookmark.move({ name: 'main', to: id });       // repoint anywhere
await jj.bookmark.advance({ name: 'main', to: id });    // forward ONLY — throws
                                                        // BOOKMARK_NOT_ADVANCEABLE on non-descendants
await jj.bookmark.rename({ oldName, newName });
await jj.bookmark.delete({ name });
await jj.bookmark.list();                               // [{ name, changeId, … }]
```

In revsets: `bookmark(main)` is exact lookup, `bookmarks(feat*)` matches
patterns.

### Remote tracking

```javascript
await jj.bookmark.track({ name: 'main', remote: 'origin' });
await jj.bookmark.untrack({ name: 'main' });
await jj.bookmark.forget({ name: 'main' });   // drop local + tracking state
```

Honest caveat: `track()` records intent in `bookmarks.json`, but
`git.fetch()` does not yet auto-populate remote-tracking state from fetched
refs — that wiring (jj v0.44's headline fetch behavior) is consciously
deferred; the repo CHANGELOG explains the architectural why. Track/untrack
lets you record and query the relationship by hand meanwhile.

## Tags

```javascript
await jj.tag.set({ name: 'v1.0.0', changeId });     // create-or-move (jj v0.35)
await jj.tag.list();                                 // supports { pattern: 'v1*' }
await jj.tag.track({ name: 'v1.0.0', remote: 'origin' });  // jj v0.44
await jj.tag.untrack({ name: 'v1.0.0' });
```

The v0.44 parity pass made tags remote-trackable exactly like bookmarks:
`tag.list()` grows a `tracking: { remote, ref }` field once tracked, and
`.jj/tags.json` uses a `{ tags, tracked }` envelope (the old flat format is
still read). Revsets: `tags([pattern])`, `remote_tags([pattern])`.

## The Git interop boundary

All remote work flows through isomorphic-git, which speaks Git's smart-HTTP
protocol. That means:

- `createJJ()` needs both `git` and `http` (`isomorphic-git/http/node` or
  `/web`) — without `http` you get `NETWORK_NOT_AVAILABLE`.
- Transport is HTTP(S) only. No `ssh://`, no `file://` — a local "remote"
  must be served over HTTP (the repo's
  [example 08](https://github.com/johnhenry/isomorphic-jj/blob/main/examples/08-git-interop.mjs)
  does exactly that with `git http-backend` on loopback).
- Browsers additionally need a `corsProxy` for most hosts.

## Remote management, fetch, push

```javascript
await jj.git.remote.add({ name: 'origin', url: 'https://…' });
await jj.git.remote.list();      // also: remove, rename, setUrl
await jj.git.fetch({ remote: 'origin', refs: ['main'] });
   // → { fetchedRefs: [{ name: 'refs/remotes/origin/main', oid }], updatedRefs }
await jj.git.push({ remote: 'origin', refs: ['main'], force: false });
   // → { pushedRefs, rejectedRefs }
```

Shallow options on fetch/clone: `depth`, `singleBranch`, `noTags`,
`relative`. `jj.remote.*` aliases `jj.git.*` if you prefer that spelling.

**Push what exists as a Git ref.** Local bookmarks become `refs/heads/*`
via `git.export()`; run it before pushing a bookmark you just created.
`git.import()` goes the other way, importing Git refs as bookmarks — that's
the sync story between the two worlds.

**Read `rejectedRefs`.** Per-ref push failures (non-fast-forward included)
land there rather than throwing. An "OK" push with an empty `pushedRefs`
array wasn't OK.

Also note real jj refuses to push conflicted commits without
`--allow-conflicts`; this library currently has no such guard — it will
push what you tell it to.

## clone()

```javascript
const { directory } = await jj.git.clone({ url, dir: 'checkout' });
```

Clones (via isomorphic-git) into `dir` relative to the repo root and adds
`.jj/` scaffolding. **Do not run `init()` inside the result** — it creates
a fresh root change and repoints `refs/heads/main` at it, orphaning the
fetched history. Drive clones at the git level (`git.*` /
isomorphic-git); do jj-native work in repos you initialized yourself.

## Authentication

isomorphic-git's callback auth passes straight through:

```javascript
await jj.git.push({
  remote: 'origin',
  refs: ['main'],
  onAuth: () => ({ username: 'token', password: process.env.GH_TOKEN }),
});
```

`onAuth` works on `clone`/`fetch`/`push`. Auth failures surface as
`JJError` code `AUTH_FAILED`; transport failures as `NETWORK_ERROR`. For
GitHub, a fine-grained PAT as the password (any username) is the usual
recipe. Never bake tokens into browser bundles — proxy through your own
backend instead.

Next: [Configuration](/isomorphic-jj/configuration/).
