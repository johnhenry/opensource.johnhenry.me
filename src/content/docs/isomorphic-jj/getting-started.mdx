---
title: "Getting started"
description: "From empty directory to a working jj repository in Node.js and the browser — init, describe, new, and the mental model shift from git."
---

Two setups, one API. Pick your environment, then read the mental-model
section — it's where every git-trained instinct goes wrong.

## Node.js

```sh
npm install @johnhenry/isomorphic-jj isomorphic-git
```

```javascript
import { createJJ } from '@johnhenry/isomorphic-jj';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'node:fs';

const jj = await createJJ({ fs, dir: '/abs/path/to/repo', git, http });
await jj.git.init({ userName: 'Alice', userEmail: 'alice@example.com' });
```

`git.init()` creates a colocated repo: a real `.git/` (via isomorphic-git)
plus `.jj/` metadata. Git tooling sees normal commits; you get jj
semantics. `dir` should be absolute.

If you don't need Git objects or remotes, drop `git`/`http` and call
`jj.init()` instead — storage-only mode, same API minus the `git.*`
namespace's actual effects.

## First commits

```javascript
// 1. Write files. They're tracked automatically — no `add`.
await jj.write({ path: 'README.md', data: '# My project' });
await jj.write({ path: 'src/index.js', data: 'export const hi = () => "hi";' });

// 2. Name the current change. With a git backend this creates a real commit.
await jj.describe({ message: 'Project skeleton' });

// 3. Start the next change on top.
await jj.new({ message: 'Add feature' });
await jj.write({ path: 'src/feature.js', data: 'export const f = 1;' });
await jj.describe({ message: 'Add feature' });

// Or steps 2+3 in one call:
await jj.new();
await jj.write({ path: 'src/feature.js', data: 'export const f = 2;' });
await jj.commit({ message: 'Bump feature', nextMessage: 'Next up' });
```

Read it back:

```javascript
const log = await jj.log({ limit: 10 });        // Change[] — changeId, description, parents…
const status = await jj.status();               // working copy = status.workingCopy
const content = await jj.read({ path: 'README.md' });
```

## describe() vs new() — the one thing people get wrong

The working copy is a change, not a diff-in-waiting. `describe()` names
**that same change**, every time you call it. Only `new()` moves you onto a
fresh change. So:

| You did | What happened |
| --- | --- |
| `write` → `describe('A')` | change 1 is named A |
| `write` → `describe('B')` | change 1 is now named B (same change!) |
| `new()` → `write` → `describe('C')` | change 2 is named C |

If your "commits" keep collapsing into one, you forgot `new()`. If a
`commit()` seems to have renamed an old change, same cause — `commit()` is
`describe()` + `new()`, and the describe half applies to whatever change
you're still sitting on.

Out-of-band edits are fine: since v1.6 the library snapshots the working
directory before `status()`/`describe()`/`diff()`/`read()`, so files
created by your editor or shell (not just `jj.write()`) are picked up,
matching jj's "snapshot before every command".

## Browser

```sh
npm install @johnhenry/isomorphic-jj isomorphic-git @isomorphic-git/lightning-fs
```

```javascript
import { createJJ } from '@johnhenry/isomorphic-jj';
import { createBrowserFS, detectCapabilities, requestPersistentStorage,
         getStorageQuota } from '@johnhenry/isomorphic-jj/browser';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';   // /web, not /node

const caps = detectCapabilities();
if (!caps.indexedDB) throw new Error('no IndexedDB, no repo storage');

// Without this, the repo lives in best-effort storage the browser may clear.
await requestPersistentStorage();

const fs = createBrowserFS({ name: 'my-app-repos' });  // LightningFS / IndexedDB
const jj = await createJJ({
  fs,
  dir: '/repo',
  git,
  http,
  corsProxy: 'https://cors.isomorphic-git.org', // most Git hosts need one
});
await jj.git.init({ userName: 'Alice', userEmail: 'alice@example.com' });
// ...identical API from here.
```

Browser-specific truths:

- **Eviction is real.** IndexedDB is best-effort until
  `requestPersistentStorage()` succeeds. Check headroom with
  `getStorageQuota()` → `{ usage, quota, percentage }`.
- **CORS.** GitHub/GitLab don't send CORS headers on smart-HTTP endpoints;
  clone/fetch/push from a page go through a `corsProxy`.
- **Node-only surface**: `background.*` (file watching, auto-snapshot
  timers), and `file.chmod()` — no POSIX modes in IndexedDB.
- Supported: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+.

## The CLI

The package installs `isojj`, a thin argument-passthrough over the same
API — every method is reachable as `isojj <command> --flag value`. It walks
up parent directories to find the repo like git/jj does, and dynamically
loads isomorphic-git when present (without it, `isojj init` builds a
storage-only repo).

```sh
npx isojj init --userName Alice --userEmail alice@example.com
npx isojj log --limit 5
npx isojj describe "First change"
```

Next: [Repositories](/isomorphic-jj/repositories/) for what actually landed
on disk, or [History](/isomorphic-jj/history/) to start querying it.
