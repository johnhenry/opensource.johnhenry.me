# ORRERY expansion plan

Goal: implement every proposal from the review — ten new rooms, ten cross-library enhancements, five site-wide polish items — autonomously, with incremental commits and browser verification per item.

## Phase 0 — shared infrastructure (orchestrator, done first so agents build on it)
- `src/bus.ts` — handoff bus. `send(toRoom, kind, payload)` stores a payload in sessionStorage and navigates to `#/<room>`; `receive(roomId)` returns and clears it; `handoff(label, toRoom, kind, getPayload)` renders a "send to →" button. Also the test-badge convention: `setRoomTests(roomId, {pass, fail})` / `getRoomTests(roomId)` in localStorage, read by the home page.
- `src/state.ts` — deep-linkable state. `readState<T>(defaults)` parses `#/<room>?k=v…`; `writeState(obj)` replaces the hash query without navigating; both JSON-encode non-string values.
- `src/main.ts` — Cmd/Ctrl+K command palette listing every room; Circuit light/dark toggle in the top bar; per-room "view source" drawer that shows the playground module via Vite's `?raw` import.
- `src/registry.ts` — ten new entries + stubs.

## Phase 1 — new rooms (one agent each, disjoint files)
| id | title | packages | notes |
|---|---|---|---|
| oat | Optical Transport | @johnhenry/oat-sender, oat-receiver, oat-protocol | QR fountain-coded frames; same-page loopback receiver reads the sender canvas, camera optional |
| mesh | Browsermesh Swarm | @johnhenry/browsermesh-primitives | two tabs discover each other (BroadcastChannel transport), CRDT shared counter/drawing, Ed25519 identities |
| raijin | Raijin Ledger | @johnhenry/raijin-core, -consensus, -mempool, -da, -validator, -sdk | N in-page validators, PBFT rounds + leader rotation on a timeline |
| jj | isomorphic-jj Timeline | @johnhenry/isomorphic-jj (/browser) | edit files, commit, rewrite, op-log undo, stable change IDs |
| studio | Fileable / Servable / Hostable Studio | @johnhenry/fileable, servable, hostable | JSX (via a tiny in-page h() transform) describing files → server → gateway; run the compiled dispatcher against a fake request editor |
| mcpq | Agent Query Inspector | @johnhenry/mcp-query, mcp-gate | reactive cache/query keys/policy gate dashboard against an in-page fake MCP server |
| laya | Laya Playground | @johnhenry/laya | typed questions over a state, WebGPU/CPU; embed the Snake demo if it ships |
| circuit | Circuit Gallery | @erisera-code/circuit | every token, live hue slider rotating through all rooms, the three rules |
| aimatey | Aimatey Router | @johnhenry/aimatey, aimatey-core | chat routed through middleware to mocked providers (no keys) |
| objectify | Objectify Workbench | @johnhenry/objectify (published 2026-09-26, npm) | class → CLI commands, JSON args, versioned SQLite-like state; in-page emulation by default, real store via the Phase 4 companion (see below) |

## Phase 2 — cross-library enhancements (agents own disjoint existing rooms)
- A: **Math ↔ Ecmanim** — owns math.ts, ecmanim.ts. "Export as animation" sends rotor/Julia parameters to the Ecmanim Stage which builds a Scene from them.
- B: **Signalle everywhere** — owns iteration.ts, temporals.ts. Rewrite state with signalle; "reactivity inspector" toggle; Temporal Loom "next occurrence in X" driven by the css-signals date clock.
- C: **Spintax → Hashish/Chunker + Iteration streaming + Xenova opt-in** — owns spintax.ts, hashish.ts, chunker.ts. Send generated corpora; stream docs through the index with bounded concurrency; opt-in real embedder download in Chunker.
- D: **Domable → Studio** — owns domable.ts only. "Scaffold as files" tab that sends the React-shaped tree to the Studio room (Studio agent accepts the payload).
- E: **Converter → Header Fields** — owns converter.ts, fields.ts. Structured headers detected in the converter open inline in the fields parser; fields room accepts payload.
- F: **Tester runs everything + planet badges** — owns tester.ts, home.ts. One suite per room, results stored via the bus convention, badge on each planet.
- G: **jth → Andbox** — owns jth.ts. Run compiled jth in an andbox sandbox with a timeout, fixing the sync-loop freeze.
- H: **Deep links for untouched rooms** — owns signals.ts, andbox.ts, signalle.ts. Adopt state.ts.

Every agent that touches a room also adopts `state.ts` deep links for that room.

## Phase 3 — verification
Full typecheck + build, browser sweep of all 25 rooms, README update, final commit.

# Phase 4 — the unrepresented libraries + optional Node companion

## Rule: the Node connection is optional
`server/index.mjs` is an OPTIONAL companion started with `npm run node` (port 7777). It serves
`GET /orrery.json` (CORS) listing the demos it hosts. Rooms call `probeCompanion()` from `src/companion.ts`
on mount; when it answers, the room talks to the real server; when it doesn't, the room runs a clearly
labelled in-page stand-in and shows `companionBanner()` with the one-line instruction. The deployed site
must be fully working with no companion. Every companion demo lives in `server/demos/<id>.mjs` exporting
`{ id, describe, mount(app) }` where `app` gives `route(method, path, handler)` and `ws(path, handler)`;
the companion loads them all and never crashes if one throws (it reports the error in /orrery.json).

## Rooms (agents own `src/playgrounds/<id>.ts|css` and, where noted, `server/demos/<id>.mjs`)
| id | title | packages | companion? |
|---|---|---|---|
| letterpress | Letterpress Press | @johnhenry/letterpress | optional: real leserve+letterpress server; fallback in-page router |
| packfile | Packfile Vault | @johnhenry/packfile (wbn) | no — pure browser; receives fileable trees from studio via the bus |
| toolcode | Tool by Code | @johnhenry/aimatey-middleware-andbox, aimatey-core, andbox | no — in-page mock LLM emits fenced code, runs in andbox |
| tensor | Tensor Bench | @johnhenry/math-plus-tensor-core, -autograd, -fft, -signal, -image, -unit (webgpu optional) | no |
| grapher | Grapher Cells | @johnhenry/math-grapher | no — headless reactive cells in a notebook UI |
| leserve | Leserve Wire | @johnhenry/leserve | optional: companion runs serve(); fallback in-page (Request)=>Response |
| servant | Servant Hall | @johnhenry/servant | optional: HTTP + WebSocket echo + middleware; fallback in-page fetch-event emulation |
| dialback | Dialback Tunnel | @johnhenry/dialback | optional: companion Server; the BROWSER is the Agent; fallback second-tab server via BroadcastChannel |
| wsh | Web Shell | @johnhenry/wsh (+xterm) | optional: companion wsh server with restricted commands; fallback in-page fake host speaking the same framing |
| afm | Apple On-Device | @johnhenry/apple-foundation-models | optional (macOS 26 + Apple Silicon only); fallback shows the API surface and says so |
| objectify | Objectify Bench | @johnhenry/objectify | optional: companion runs a real `Objectify` store (SQLite via better-sqlite3; no Rust CLI/`objectify init` needed — `openDb()` creates the schema itself) for create/list/inspect/destroy/get/set/log/diff/rewind/fork; class-method execution (`use <id> <method>`) always stays the in-page JS-reflection stand-in — the real `ObjectRef.call()` needs a Deno/Python subprocess and a class file that explicitly calls an injected `this.get()`/`this.set()`, which doesn't match this room's plain-field-mutation class editor — but a state-changing method call still persists into the real store via `ObjectRef.set()` when the companion is live (logged there as method "set", a real limitation of that call) |
