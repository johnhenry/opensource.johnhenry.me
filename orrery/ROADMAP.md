# ORRERY roadmap — one last deep dive

*Written 2026-09-27 after a full read of every library on opensource.johnhenry.me, its docs sub-pages, and the installed packages' READMEs and export maps. Three research passes (agents/networking/ML, web/servers/DOM/design, math/language/text/animation) verified every API named below against a published package before it was proposed. Where something is still unverified it says so.*

The site today: 35 planets, one per library, each running the real npm package in the browser; a handoff bus between planets; deep links; a ⌘K palette; a source drawer; a Tester Console with suites for 27 planets; an optional Node companion for the six server-side libraries. This document is what would make it more than a catalogue: planets that use each other, capabilities the libraries ship that nothing on the site touches yet, and a few site-wide mechanisms that turn the orrery into one system.

---

## 0. Ground rules that shaped every proposal

1. **Only real APIs.** Every function named here exists in a published package. Proposals that needed an unpublished or private API are marked, not hidden.
2. **Browser first, companion second.** A planet must be impressive with nothing running but the page. The companion (`npm run node`) upgrades a planet; it never gates it.
3. **Honest stand-ins.** Anything mocked (a model, a backend, a network) says so on the page.
4. **One agent per planet, disjoint files.** The sequencing in §6 keeps that property so waves can run in parallel as before.

---

## 1. P0 — fixes and debts surfaced by the dive

| # | Item | Status |
|---|---|---|
| P0.1 | **Companion was reachable from any website and the LAN** (`*` CORS + all-interface bind + `new Function` on posted handler source). | **Done.** Binds `127.0.0.1`; CORS only for allow-listed origins (localhost:*, opensource.johnhenry.me, `ORRERY_ALLOWED_ORIGINS`); 403 otherwise, including WebSocket upgrades; `ORRERY_HOST` opt-in. leserve demo binds loopback. servant can't (no host option; filed [servant#6](https://github.com/johnhenry/servant/issues/6)). |
| P0.2 | **`bus.receive()` consumed any handoff regardless of target**, so a detour through an unrelated planet could swallow a payload. | **Done.** Handoffs carry `to`; `receive()` only consumes one addressed to the current planet. |
| P0.3 | **Studio → Packfile handoff drops binary content and symlinks** (non-string content sent as `''`). | Todo, S. Send `{path, content, encoding:'base64'}` for bytes; carry `linkTo` targets. |
| P0.4 | **Planet hues contradict Circuit's own hue registry** (objectify 105 vs 70, andbox 330 vs 95, mcpq 205 vs 250, ecmanim 45 vs 285; several planets sit in the registry's blocked 122–219° arc). | Todo, S. Read `themes.css` at build time and derive `hue` from the registry where a planet's library has one; pick free arcs for the rest. |
| P0.5 | **Tester has no suites for** objectify, aimatey, leserve, servant, dialback, wsh, afm, hostable, fileable; no `?autorun` deep link. | Todo, S–M. leserve ships `/test-harness` (`testHandler(handler).post(...)`) — use it. |
| P0.6 | **Objectify planet says "not on npm"** — `@johnhenry/objectify@0.0.0` was published 2026-09-26 as a TypeScript adapter over better-sqlite3 (`Objectify.create/use/list`, `ObjectRef.call/log/diff/rewind/fork`), not the CLI. | Todo, M. Companion demo backs the bench with a real store when one exists (needs Node ≥ 26 and the Rust CLI to initialise a store); label stays "emulation" otherwise. |
| P0.7 | **`server/README.md` says apple-foundation-models is deliberately not a dependency**; it is an optionalDependency. | Todo, S. Fix the sentence. |
| P0.8 | **Docs site pages link to `/orrery/`, not the matching planet.** | Todo, S. Add `#/<planet>` deep links per library page (a `planet:` frontmatter field → a LinkCard). |

---

## 2. Tier 1 — the seven things with the most wow per effort

### 2.1 Agent Protocols Switchboard (new planet) — M
One page, three agent protocols, one shared approval inbox. A2A via `@johnhenry/a2a-query` with `MockA2AAgent` + `askThenEchoExecutor` from its `/testing` entry (card cache hits, a `TaskHandle` pausing at INPUT_REQUIRED, streaming through `droppingStreamFetchImpl`, `tapFetch` wire log). ACP via `@johnhenry/acp-query` with `mockAcpAgent` (tool_call lifecycle, `session/request_permission`, `cancel()` resolving pending permissions). MCP via the existing Agent Query in-page server. All three feed one `InteractionBroker` from `@johnhenry/mcp-query` — which also replaces Agent Query's hand-rolled approval step (elicitation form/url modes already advertised by the client).
*Packages:* `a2a-query@0.0.0` + `@a2a-js/sdk@1.0.1`, `acp-query@0.0.2` + `@agentclientprotocol/sdk@1.3.0`.
*Risks:* a2a-query/mcp-query pin `agent-query-core@0.1.0-rc.4`, acp-query pins `0.1.0` → two core copies may break the single-broker promise (verify first). `@a2a-js/sdk/server` in a browser is unverified.

### 2.2 The model calls MCP: Aimatey × Agent Query bridge — S/M
`runMcpTools(bridge.runTools, { client })` from `@johnhenry/aimatey-mcp`, with Agent Query's `MCPClient` as the client (it already satisfies `McpClientLike`: `listTools` is synchronous and `callTool` matches). mcp-gate's policy and the approval inbox then govern tool calls the LLM makes. Handoff: "send this server to Aimatey." Add a native-tool-calling lane next to Tool by Code's code-execution lane using `Bridge.runTools()` (exists in core 0.4, unused).
*Blocker:* every newer aimatey sub-package requires `aimatey-types ^0.6` / `core ^0.5`; the orrery pins `core ^0.4.0` / `frontend ^0.2.1`. Bump the whole aimatey set together in one wave.

### 2.3 Ecmanim Studio with physics and WebGL (new planet, or a big Stage upgrade) — L
The docs say "a browser live-demo is a follow-up"; the orrery can be it. Authoring formats (`explainer`, `chart-reveal`, `quote-card`, `title-card`) from `@johnhenry/ecmanim/authoring` with `schemaToControls` for their params, rendered through a browser render provider `{kind:'render', name:'browser', invoke({scene}) => play(scene,{canvas})}` (the shipped `manimRenderProvider` imports `../node.js`). Show `toPlanIR()` and `runQualityGates()` / `slideshowRisk` beside the canvas. Add `/studio`'s `attachInteractiveCamera` and `renderKeyframeTimeline` (DOM-only). Physics presets via `/physics/rapier2d|3d` (`@dimforge/rapier*-compat` is already an optional dep) plus the built-in `Pendulum`, `ElectricField`, `StandingWave`. A WebGL toggle via `/browser-three` (`three@0.185` installed; `ThreeDScene`, `Surface`, `Torus`). Make the Stage's source editable; add `recordGif` / `downloadMp4`.
*Risks:* WASM init is async (await before `addBody`); bundle weight (lazy-import three); TTS must stay `silent` (voiceover is `/node`-only); the formats' dynamic `import('../index.js')` needs checking under Vite.

### 2.4 Mesh Relay: the bus across tabs — S
Extend `src/bus.ts` with `sendToTab()` over `browsermesh-pod`'s `BroadcastChannelTransport`, handoffs signed with `PodIdentity` and gated with `CapabilityToken`. Open two tabs, send a Spintax corpus into the *other* tab's Hashish. Becomes the transport for 2.1's inbox and for Raijin-across-tabs (2.7). Same-origin only, which is fine.
*Alternative considered:* `signalle/broadcast`. Rejected as the transport because late-joining tabs diverge (see §5, signalle C1) — but it stays a good Signalle Loom demo of exactly that problem.

### 2.5 A real math server behind Agent Query — M
`@johnhenry/math-plus-mcp`'s `buildServer()` is browser-safe (MCP SDK, zod, math, tensor-core, adapter-math). Agent Query's transport factory creates `InMemoryTransport.createLinkedPair()` + `buildServer()` per connect and swaps the fake server for nine real tools (six `symbolic_*`, `linalg_solve`, a `tensor_pipeline`, `stats_summary`) under mcp-gate policies. Offer Grapher's server as a second server, and later Ecmanim's. Lazy-load: adapter-math pulls in frame-arrow/apache-arrow.

### 2.6 Studio "Deploy" tab and Pipeline — M
`servable/adapters/cloudflare` `toWorker(compiled)` returns a pure `{fetch}`; generate Deno/Bun/Cloudflare/Node entry sources and run the same `{fetch}` in a Service Worker (see 4.1). Chain fileable `plan()` (`<Dir encode="wbn">`) → packfile `fromArchive`/`createRouter` → servable `<Group from>` → hostable `<Gateway><Host><Upstream app={dialbackServer}>` (`Upstream app` works in-page because dialback's `Server` has a `fetch` getter) → optional public URL through the companion's dialback. Timing and hashes per stage; each stage links to its planet. Build as Studio tab 04 rather than a new planet to avoid duplication.

### 2.7 Raijin across real tabs — M
Implement Raijin's injected transport over `browsermesh-pod` so validators live in different tabs (via 2.4). Add a DA panel showing `CelestiaDA` vs `LocalDA` and the deliberate `EthBlobDA` errors; label that `verify()` checks content hashes only.

---

## 3. Tier 2 — level-ups per existing planet (all verified APIs)

| Planet | Level-up | Effort |
|---|---|---|
| **Agent Query** | `InteractionBroker` + elicitation; `/webmcp` bridge (`bridgeToWebMCP`, `webMcpToolServer`; fake `modelContext` if absent); `chromeBuiltinAISampling` toggle; `persistCache`; `policyListFilter`, `validateGateConfig`. | S each |
| **Aimatey Router** | Real on-device backends from `aimatey-backend-browser` (`ChromeAIBackendAdapter`, `LiteRtLmBackendAdapter` on WebGPU); replace mocks with `/mock`'s `MockBackendAdapter`; `aimatey-patterns` (`createComplexityRouter`, `createCostOptimizer`, `createParallelAggregator`); `AppleBackend` from `aimatey-native-apple` via the companion. Needs the aimatey version bump (2.2). | M |
| **Tool by Code** | Honest "jailbreak" preset (`host.call('constructor', …)`, in-worker `fetch` — the docs say both get through); `sandboxOptions`/`codeLanguages`; `formatResults`/`resultsToToolCalls`. | S |
| **Andbox Cell** | `createNetworkFetch(allowlist)` capability with the documented redirect gap; `worker`/`inline`/`data-uri` mode switch; `importMap` loading a real CDN module; `maxArgBytes`; `createStdio()`. | S |
| **Laya Playground** | `laya-presets` question sets (`triageQuestions`, `guardQuestions`, `moderationQuestions`, `emailQuestions`); `laya-router` `Router.route()`; `predictShortlist`. Nothing sends to Laya today — add senders (Chunker chunks, an Aimatey reply to "moderate this"). | S–M |
| **Apple On-Device** | Tool calling (`LanguageModelSession(…, [tool])` + `ToolOutput`), serving Agent Query's tools through `aimatey-mcp`. Companion. | M |
| **Browsermesh Swarm** | `RGA` shared text box, `ORSet`, `VectorClock`, trust graph (`computeTransitiveTrust`, `createTrustEdge`); **cross-device join via `oat-bootstrap`** (`createOfferArtifact`/`createAnswerArtifact`: a real `RTCPeerConnection` whose offer/answer travel as QR codes — breaks the same-origin limit). | S / M |
| **Dialback Tunnel** | Per-agent Ed25519 auth over `dialback/browsermesh` (`createBrowsermeshTransport`, `acceptBrowsermeshConnections`) on a netway `VirtualNetwork` (`mem://`), needs `browsermesh-netway`; load-balancing view across several agent tabs with `setStrategy(...)`. | M / S |
| **Web Shell** | `session.enableE2E(secret,{role})` (AES-GCM + X25519/ML-KEM hybrid); `WshKnownHosts` TOFU with a "rotate host key" mismatch demo (the in-page host already sends `fingerprints`); `WshMcpBridge.discover()/call()` with host support. | S/M |
| **Optical Transport** | `oat-sim` deterministic loss/dup/reorder/corruption with charts; `oat-ui` safe-view rendering; oat-bootstrap handshake shared with Swarm. | S / M |
| **Signalle Loom** | Two tabs, one counter via `/broadcast` (bridged into a local signal; show the late-joiner divergence honestly); scope isolation lab with `createScope()`; a signal as an SSE feed via `/stream` `toReadableStream` (needs `pipeThrough(new TextEncoderStream())`, see §5). | S |
| **Signal Sky / home** | `gamepad({limit:1})` tilting the orrery (`rotateX(calc(var(--sky-gamepad-0-axis-1,0)*20deg))`); a custom css-signals source bridging signalle into CSS; `framed()` and `functionsCss(prefix)` for the `@function` demo. | S |
| **Header Fields** | Typed presets via `/headers` (`parsePriority`, `parseCacheStatus`, `parseAcceptCH`, `parseSecCHUA` from `navigator.userAgentData.brands`, `parseNoVarySearch`); inspect real responses from Studio/Leserve/Letterpress. | S |
| **HTTP Converter** | Response side (`string.parseResponse`, `har.fromResponse`, `fetch.fromResponse`, `createMockResponse`); `random.randomRequest()`; `body.parseBody`. | S |
| **Leserve Wire** | In-page middleware from `/compose`, `/auth`, `/body` (dependency-free); a Tester suite via `/test-harness`. | S |
| **Servant Hall** | SSE route (`createServerSentEvent` + `emit()`); each dispatch as a HAR entry. | S |
| **Letterpress Press** | Matched request as cURL/HAR; structured response headers via http-fields. (Skip `createFSRouter`: it evaluates `index.html` as code.) | S |
| **Packfile Vault** | Open a `.wbn`/`.wbn.gz` from a file input. `withCache`/`toWebBundle` are Node-only (they import `node:crypto`) — companion or upstream fix (§5). | S |
| **Domable Prism** | Tabs for the `/html` and `/svg` tag functions, `register()`, `constructSuperclass()`; `createMathMLElement` rendering Math Observatory derivatives as MathML (handoff). | S |
| **Circuit Gallery** | Show the real `c-header`, `c-side`, `c-codebox`, `c-callout`, `c-termbox`, `c-paramlist`, `c-tabbar` components; flag hue-registry violations (P0.4). | S |
| **Math Observatory** | Forward-mode AD (`DualNumber.derivative/gradient`) beside the symbolic derivative; `VectorCalculus.gradient/divergence/curl3D` sent to Ecmanim's `ArrowVectorField`/`StreamLines`; parameters as `CellGraph` cells with a "send to Grapher Cells" handoff; an ODE tab (`Numerical.rk4`/`euler` vs Ecmanim's `Pendulum`). | S–M |
| **jth Stack Machine** | Operator explorer over `registry.names()` (146 ops; descriptions from the docs since `getMeta()` returns `{}`); an HTML DSL tab via `@johnhenry/jth-html`; a `jth-eval` restricted-sandbox toggle (`sandbox:'restricted' | string[]`, `OP_NOT_ALLOWED`), keeping andbox for hard timeouts. | S–M |
| **Temporal Loom** | Cron ↔ RRULE (`/cron` `ruleToCron`, `cronToRule`, `describeCron`); `.ics` download (`/ics` `toICS`); meeting finder (`/business` `meetingSlots`, `usFederalHolidays`, `WorkingHours`); `/humanize` `fromNow`; pasted RRULEs via `ruleFromString` (RRULE only, not NLP). | S / M |
| **Hashish Lab** | Shared index across tabs via an 8-method `StorageAdapter` over IndexedDB or a browsermesh CRDT (fixed `seed` required); `exportIndex()`/`importIndex` into Packfile or Jujutsu; a Chunker → Hashish dedupe pipeline. | M / S |
| **Chunker Scope** | A `full({split})` fixed-size baseline next to `semantic`; `/embed/ollama` when the companion can reach Ollama. | S |
| **Iteration Pipes** | `AsyncChannel` backpressure, `abortable`/`throwIfAborted` kill switch, `teeAsync`, `prefetchAsync` — a slow-consumer demo. | S |
| **Spintax Forge** | Fuzz handoffs: variants as Tester inputs or Letterpress request paths. | S |
| **Jujutsu Timeline** | Multi-tab collaboration via `converge()` — *caveat:* nothing in the library creates a divergent copy yet, so the peer's rewrite must be injected through the undocumented `jj.graph.addDivergentCopy(change)`; use separate LightningFS names per tab. | M, private API |
| **Tensor Bench** | Live telemetry via `math-plus-telemetry` `setSink()` (`optim/gradNorm` metrics, `backward` spans; `setSink(null)` on cleanup); fused vs unfused timings via `math-plus-tensor-compile`; a GELU explainer from `math-plus-special`. | S |
| **Grapher Cells** | `session_snapshot` JSON in the deep link (mind the 256 KB cap); "open in Agent Query". | S |
| **Raijin Ledger** | See 2.7. | M |

---

## 4. Tier 3 — site-wide mechanisms

1. **Service Worker "edge"** (M/L): one SW under `/orrery/` forwards `/__edge/<planet>/*` to the owning page over `MessageChannel`, which runs the compiled servable/hostable `fetch`, packfile's `createRouter`, or a Letterpress/leserve handler. Handlers get real URLs (module imports and `<iframe src>` work, DevTools shows real traffic). Risks: SW scope under the sub-path, dev/prod split, page as single point of failure.
2. **Tensor Telemetry dock** (M): one global `math-plus-telemetry` sink feeding gradient-norm sparklines, backward-span flame bars and `tensorSummary`, with a pause toggle that demonstrates `hasSink()` cost. One global slot, no unsubscribe — the dock must own it; `metric.time` is `Date.now()` while spans use `performance.now()`.
3. **Site-wide HAR recorder** (S): every in-page fetch-shaped dispatch appends `har.fromRequest`/`har.fromResponse`; a drawer offers ".har download", "open in Converter", "headers in Fields".
4. **Export any planet as a bundle** (S/M): `toArchive(new Map([['state.json',…],['source.ts',?raw],['index.html',…]]))` from `packfile/browser`; Packfile loads it back. (IndexedDB + structured clone is the simpler transport for large handoffs; use packfile where the bundle *is* the point.)
5. **CI badge from the Tester** (M): `#/tester?autorun=1` driven by headless Chrome at build time → `dist/tests.json`; home shows build-time results when localStorage has none. WebGPU/camera/companion suites must report skipped, not failed.
6. **Chrome on Circuit + domable + signalle** (M/L, incremental): replace the hand-rolled ⌘K palette with Circuit's `createCommandPalette` (actions for theme, copy link, companion, run tests); top bar and source drawer as `domable` `register()` elements styled with `c-*` classes, reactive via `signalle/dom`. Domable doesn't turn function props into listeners; `light()` defers children to `connectedCallback`.
7. **Orrery Almanac** (S–M): each planet's orbit period becomes a `recur` rule; conjunctions via `IntervalSet`/`conflicts`/`windows`; `toICS` exports "alignment" events; `cronToRule` schedules a Tester run while the tab is open.
8. **jth Conductor** (M): a `jth-eval` REPL with `JthContext` persistence and `defineOp` words like `spin` (spintax), `recur` (temporals), `dedupe` (hashish), `goto` (bus) — `"{a|b} {x|y}" spin 20 take dedupe "chunker" goto`. Inline JS and `::name` are rejected in every sandbox mode; run in a Worker for hard timeouts.
9. **One key, many identities** (S/M): one Ed25519 key shown as its wsh fingerprint, its browsermesh podId (`MeshWshBridge` in `browsermesh-transport`), its dialback identity and an OAT signer; revoke once, watch every system react.
10. **Laya as a judge everywhere** (M): `guardQuestions()` scores MCP tool arguments before approval and the results of `aimatey-patterns` `strategy:'all'`; runs as a pre-pass because the judge callbacks are synchronous.
11. **Signal Bus** (M): `createBroadcastSignal` per planet mirroring `writeState`, "live in N tabs" on the home page — after the signalle late-joiner fix lands, or with a hello/resync side channel.

---

## 5. Upstream findings from this dive (to file or already filed)

Filed today: [servant#6](https://github.com/johnhenry/servant/issues/6) (no host option). To file, in order of impact:

- **signalle/broadcast**: late-joining tabs diverge (per-instance version counters, no initial sync). **signalle/stream**: `toSSEResponse` enqueues strings, so `res.text()` throws "non-Uint8Array chunk" (servant's README SSE example has the same shape).
- **browsermesh-apps 0.7.0** breaks in browsers (seven modules call `createRequire(import.meta.url)` at load; root re-exports them; no `browser` condition). Docs list `>=0.0.0` peer ranges and `node>=24`; real ranges are `>=x <1.0.0` and `>=26`; `browsermesh-core` peer-depends on `-apps` (a cycle). `MeshWshBridge` source leaks private product notes. `dialback/browsermesh` ships no types.
- **agent-query**: `mcp-query-tanstack@0.0.0` peers on exactly `mcp-query@0.0.0` (latest 0.1.0); docs cite the v1 MCP SDK and mcp-gate 0.2.1; mcp-gate's types resolve to the Node `index.d.ts` under the browser condition (`createGate` type-checks in browser code, then fails to bundle).
- **aimatey**: `-middleware-andbox` peers on unscoped `andbox`; `aimatey-mcp` README points at deprecated `@johnhenry/mcpq`; `aimatey-native-apple@0.1.5` doesn't declare `apple-foundation-models`.
- **math**: `math-grapher` and `math-prototype-patch` declare `@johnhenry/math ^0.0.0` (only 0.0.0), so a second copy installs; `math-plus-tensor-wasm` top-level-imports `node:fs/promises`; `math-plus-mcp` docs say "stdio only" though in-process embedding works.
- **temporals**: `ruleFromString` error message truncates the last character on a part without `=`; `UNTIL` without `dtstart` throws a TypeError.
- **isomorphic-jj**: `converge()` JSDoc still says pairwise; `Conflict` type doesn't model `{base, versions}`; README roadmap/Node-26 note out of date; `jj.graph` public but untyped.
- **jth**: `getMeta()` returns `{}` for every stdlib op. **objectify**: docs describe a CLI shim the npm package no longer has (`engines >=26` vs README's 22+). **ecmanim**: separate `@johnhenry/ecmanim-*` packages don't exist (they're subpath exports); no browser TTS provider. **packfile**: `./cache` and `./web-bundle` are Node-only via `node:crypto` (Web Crypto would do). **leserve**: README uses unscoped paths; `basicAuth` decodes with `atob` (Latin-1). **hostable**: no exported Gateway→servable lowering (Studio keeps a copy). **raijin docs** describe a FIFO unverified mempool; 0.0.5 verifies and orders by fee. **css-signals** has no JS read API (say so; point to `getComputedStyle`).

---

## 6. Sequencing

Each wave is one parallel dispatch with disjoint file ownership, verified in the browser, committed incrementally, exactly as before.

**Wave A — debts and foundations (1 day):** P0.3–P0.8; aimatey version bump; `browsermesh-netway` install; bus `sendToTab()` (2.4); Tester suites for the missing planets; upstream issues from §5.

**Wave B — synergy (2 days):** Agent Protocols Switchboard (2.1); Aimatey × Agent Query bridge (2.2); real math server (2.5); Studio Deploy + Pipeline tab (2.6); Raijin across tabs (2.7); Laya senders + presets; Math ↔ Ecmanim vector fields; Temporal Loom cron/ics/business.

**Wave C — the big one (2–3 days):** Ecmanim Studio with physics and WebGL (2.3); Service Worker edge (4.1); Tensor Telemetry dock (4.2); HAR recorder (4.3); CI badge (4.5).

**Wave D — polish and delight (1–2 days):** remaining Tier 2 rows; Almanac, Conductor, One-key-many-identities, Laya-as-judge; Circuit chrome (incremental).

Effort keys: S ≤ half a day for one agent, M ≈ a day, L ≈ two days.
