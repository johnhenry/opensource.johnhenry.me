# Room-builder brief (read fully before writing code)

You are building ONE room of ORRERY, a Vite + vanilla TypeScript site at /Users/johnhenry/Projects/orrery
that showcases the @johnhenry npm libraries by RUNNING them live in the browser.

## Contract
- Your room lives in exactly one file: `src/playgrounds/<id>.ts` (already stubbed). You may also add
  `src/playgrounds/<id>.css` and import it from your .ts file. Touch NOTHING else unless told to.
- Export `default` a `Playground` (see `src/registry.ts`). Fill id/title/pkg/hue/blurb/docs to match
  the entry for your id in `src/registry.ts`. `mount(host)` builds the UI inside `host` and returns
  a cleanup function that removes every listener, timer, worker, rAF loop you created.
- Read the library's actual code and README in `node_modules/<pkg>/` (README.md, dist/*.d.ts, package.json
  exports) BEFORE using it. Use real exports; do not invent APIs. If an export map subpath exists, use it.
- Styling: use Circuit tokens already on the page (`var(--accent)`, `--bg-panel`, `--line`, `--ink`,
  `--ink-2`, `--f-mono`, `--f-display`) and the helper classes in `src/styles/base.css`
  (`.panel`, `.grid-2`, `textarea.code`, `pre.code`, `.btn`, `.btn.primary`, `.stat`, `label.field`, `.chip`).
  Scope any custom CSS under `.pg-<id>` on your root element. Dark background; it must look sharp.
- Make it genuinely interactive and delightful: live-updating as the user types/drags, presets, a
  "what's happening" explanation, and something visual (canvas/SVG/animated DOM) where it fits.
  Ship a working default state: the room must be impressive with zero user input.
- No frameworks. No new npm deps unless absolutely necessary (if so, `npm i <pkg>` and say so).
- Handle errors gracefully inside the room (show them in a `<pre class="code">`), never throw out of mount.

## Verify
- `npx tsc --noEmit` must pass (fix your file's errors; ignore errors in other rooms' files).
- `npx vite build` must succeed.
- Actually load it: run `npx vite --port 5<3-random-digits> --strictPort` in the background, open
  `http://localhost:<port>/#/<id>` in the browser tool (or `curl` the dev server if no browser), and
  confirm no console errors and that the default state renders. Kill the server when done.

## Commit (important — incremental, frequent)
- Commit early (after the first working render) and again when finished. Only add your own files:
  `git add src/playgrounds/<id>.ts src/playgrounds/<id>.css && git commit -m "<id>: <what>"`.
  Other agents commit concurrently; if you hit `index.lock`, wait 2s and retry. Never `git add -A`,
  never rebase/reset/stash, never touch other rooms.
- Final report: 5 lines max — what the room does, which library APIs it exercises, anything broken.

## Phase 1/2 additions (read these too)
- **Handoff bus** (`src/bus.ts`): `handoffButton({from, to, kind, label, getPayload})` renders a "send to →" button;
  the receiving room calls `receive()` at the top of mount() and, if a handoff is present, applies it and shows
  `handoffBanner(h, note)`. Payloads must be JSON-serialisable.
- **Deep links** (`src/state.ts`): every room you touch should call `readState(defaults)` in mount() to initialise
  its controls and `writeState(state, defaults)` whenever they change, so the URL `#/<room>?k=v` is shareable.
  Add a small "copy link" button (use `copyLink()`).
- **Test badges**: the Tester room calls `setRoomTests(roomId, {pass, fail})`; the home page reads `getRoomTests()`.
- **Ownership**: PLAN.md lists exactly which files each agent owns. Touch only those. Multiple agents commit
  concurrently: `git add <your files> && git commit`; retry on index.lock; never `git add -A`.
- **Verification**: also check `#/<id>?...` deep links reload into the same state, and that `npx vite build` passes.

## Phase 4 additions
- **Optional Node companion** (`src/companion.ts`, `server/`): rooms that have a server side call
  `const c = await probeCompanion()` at mount and `hasDemo(c, '<id>')`. Live → use `c.base` (http) / `c.wsBase` (ws).
  Not live → run the in-page stand-in and prepend `companionBanner(c, '<id>', '<what the stand-in is>')`.
  The room MUST be fully functional and impressive without the companion. Your server demo goes in
  `server/demos/<id>.mjs` exporting `{ id, describe, mount(app) }`; `app.route(method, pathOrRegex, (request, params) => Response)`
  and `app.ws(path, (ws, req) => …)` (the `ws` package). Test it with `npm run node` and curl. Never bind other ports
  unless the library needs its own listener (then pick 77xx and report it via a route on the companion).
- Deep links via state.ts and copy-link on every new room, as before.
