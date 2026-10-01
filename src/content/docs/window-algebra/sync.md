---
title: "Cross-tab sync"
description: "attachSync keeps the window managers of several tabs of one origin in step with versioned state snapshots over a BroadcastChannel."
sidebar:
  order: 6.5
---

`attachSync` keeps the window managers of several tabs of one origin in step over a `BroadcastChannel`. It is opt-in: nothing syncs unless you call it. `attachStage` (and so `<wa-stage>`) accepts a `sync` option as shorthand.

```js
import { attachSync } from "@johnhenry/window-algebra/browser";

const sync = attachSync({ wm, channel: "my-app" });
```

## How it works

- **State snapshots, not commands.** A tab sends its whole logical state after every local change. A tab that opened late or missed a message heals from the next snapshot, and snapshots are versioned and migratable like `wm.load`.
- **Last writer wins, by Lamport clock.** Every message carries `(clock, from)`; a tab raises its clock to the highest it has seen before sending, so a change made after observing another wins. Two concurrent changes have the same clock and the larger tab id wins, in every tab. The loser's change is dropped whole.
- **No echo loops.** A snapshot applied from a peer is never re-broadcast.
- **Undo and redo** are ordinary changes and sync like any other. A snapshot received from a peer is recorded as a history step, so undo in the receiving tab steps back over it.
- **Pop-outs stay per tab.** A popped-out window is a real browser window owned by the tab that opened it; on the wire it is `minimized`.
- **Late joiners** announce themselves and a tab that has changed anything answers with its snapshot. Every tab also answers with a presence reply (a `hello` with `reply: true`, not answered in turn), so the newcomer's `peers()` lists every tab already open even when none has anything to share. Two tabs that never changed anything share no state, so seed them identically.
- **A closed tab leaves the group.** With the `lifecycle` option (on by default in a window), a tab announces `bye` on `pagehide` and `hello` again on a back/forward-cache `pageshow`, so peers stop counting it without anyone calling `detach()`. Pass `lifecycle: false` to do this yourself.

## What it does not do

It is same-origin, same-browser only, not collaboration between users, and it has no persistence. It does not merge concurrent edits, and it does not sync surfaces, DOM, scroll positions or per-tab effects, so give each tab a `surfaceFor` that builds a window's content from its id. A state from a newer `STATE_VERSION` is refused by `wm.load` and ignored.

Options (`channel`, `id`, `schedule`, `onSync`, `onError`, `lifecycle`), the return value (`peers()`, `flush()`, `detach()`) and the pure `toSnapshot`/`fromSnapshot` are in [Cross-tab sync](/window-algebra/api/sync/). Try it in two tabs with `demo/sync.html`.
