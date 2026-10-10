# ORRERY

An interactive, browser-native tour of the [@johnhenry open-source ecosystem](https://opensource.johnhenry.me/).
Forty-one planets, and nothing is a screenshot: every planet imports the real npm package and runs it live in your browser.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

## The planets

| Planet | Package | What you can do |
|---|---|---|
| Signal Sky | `@johnhenry/css-signals` | Pointer, keys, clock, scroll, random, gamepad and mic become typed CSS variables. The styling loop has no JavaScript in it. |
| Spintax Forge | `@johnhenry/spintax` | Expand `{a\|b}` templates lazily, count millions of variants, roll random ones, stream them. |
| Temporal Loom | `@johnhenry/temporals` | Build "every second Tuesday" rules and see them on a calendar, list, and interval timeline. |
| Hashish Lab | `@johnhenry/hashish` | Watch MinHash signatures band into LSH buckets and find near-duplicate text as you type. |
| Math Observatory | `@johnhenry/math` | Mandelbrot and Julia sets from `ComplexNumber`, 4D rotors spinning a tesseract, a symbolic plotter with derivatives, Taylor series and integrals. |
| Ecmanim Stage | `@johnhenry/ecmanim` | Manim-style Scenes rendered to canvas with the source shown beside them. Download a WebM. |
| jth Stack Machine | `@johnhenry/jth-compiler` | Write a stack language, watch it compile to JavaScript, step through the stack animation. |
| Iteration Pipes | `@johnhenry/iteration` | Assemble transducer pipelines and watch tokens flow through them, including bounded async concurrency. |
| Chunker Scope | `@johnhenry/semantic-chunker` | Split text at topic boundaries with eleven cut strategies and a similarity seismograph. |
| Header Fields | `@johnhenry/http-fields` | Parse and re-serialize RFC 8941 / 9651 structured headers with a typed tree and a normalisation diff. |
| Andbox Cell | `@johnhenry/andbox` | Run code in a Worker sandbox with gated host capabilities, rate limits and a kill switch. |
| Tester Console | `@johnhenry/tester` | A real TAP suite runs in-browser against the sibling packages. Write your own generator tests. |
| Signalle Loom | `@johnhenry/signalle` | Fine-grained signals shown as a live dependency graph. Watch exactly which nodes re-run. |
| Domable Prism | `@johnhenry/domable` | HTML text, DOM nodes and React-shaped objects converted every direction, plus hyperscript and custom elements. |
| HTTP Converter | `@johnhenry/http-converter` | Raw HTTP, HAR, cURL and fetch() translated into each other with auto-detection. |
| Optical Transport | `@johnhenry/oat-sender`, `oat-receiver` | Fountain-coded QR frames carry a signed artifact; loopback receiver decodes at 70% frame loss. |
| Browsermesh Swarm | `@johnhenry/browsermesh-primitives`, `-pod` | Open two tabs: they discover each other, merge CRDTs, verify signed chat, enforce paint grants. |
| Raijin Ledger | `@johnhenry/raijin-*` | 4–7 in-page PBFT validators, fee-ordered mempool, leader crashes, partitions and recovery. |
| Jujutsu Timeline | `@johnhenry/isomorphic-jj` | Change IDs survive rewrites on an animated DAG; op-log time travel; conflicts as data. |
| Form Lab | `@johnhenry/obfo` | An editable form read as a nested object as you type (`observe`, `cast: "auto"`), `fill()` from JSON with a round-trip check, `formFromObject()` generating a form, and the cast rules computed live. Plots an array of rows in Data Plot Studio. |
| Domkit Workshop | `@johnhenry/domkit` | Live `<code-editor>` (form-associated), `<infinite-combo-box>` with a paged, abortable search function, `<stylable-select>`, an `<attribute-cycler>` tone switcher, `<hot-key>`, `<drill-menu>` and `<swipe-input>`, each with its attributes editable. |
| Data Plot Studio | `@johnhenry/data-plot` | Edit the `<table>` a `<data-plot>` reads and the chart follows: dots, bars, lines, legends and Chernoff faces, switchable channels and layers, and a width slider that reflows with no redraw. Takes Tensor Bench's loss curve. |
| JSX Studio | `@johnhenry/fileable`, `servable`, `hostable` | JSX → file tree with hashes, → request dispatcher, → multi-host gateway. Run requests in-page. |
| Untrusted Desk | `@johnhenry/window-algebra`, `safe-fragment`, `html-modules` | A tiling desk of untrusted notes: window-algebra windows (undo/redo, keyboard-movable floating windows, pop-out, persistence, two-tab sync), safe-fragment under a switchable profile with an XSS preset, and a strict-CSP, Trusted Types frame; the components are html-modules. The import-map and no-bundler story lives on the Import Router planet. |
| Import Router | `@johnhenry/mport` | Routing scenarios (outage, race, circuit breaker, lockfile pinning, prefer, tampered mirror, `router.import()` failover) with timelines, health and the compiled import map + lockfile, on a simulated or the real network; a no-bundler Preact + htm app in a strict-CSP frame that allows its import map only by mport's hash, with tamper controls and a CDN up/down/broken switch; mport's examples run in-page as proofs. |
| Agent Query | `@johnhenry/mcp-query`, `mcp-gate` | In-page MCP server, reactive cache inspector, policy gate with approvals, wire timeline. |
| Laya Playground | `@johnhenry/laya` | Typed questions answered by an on-device model on WebGPU. Laya plays Snake. Demo mode if no model. |
| Circuit Gallery | `@erisera-code/circuit` | Spin the hue dial: accent moves, neutrals/semantic/syntax hold. Every token, both themes, contrast. |
| Aimatey Router | `@johnhenry/aimatey-*` | One chat, three mock backends, real middleware chain, streaming, animated fallback and retry. |
| Objectify Bench | (emulated) | Write a class, get a versioned CLI with JSON args, diffs, rewind and fork. Labelled emulation. |
| Letterpress Press | `@johnhenry/letterpress` | Routes as tagged template literals; a composer fires requests and highlights the literal that matched. |
| Packfile Vault | `@johnhenry/packfile` | Pack a file tree into a gzipped web bundle, inspect its sections, unpack and serve it in an iframe. |
| Tool by Code | `@johnhenry/aimatey-middleware-andbox` | A mock LLM with no tool calling writes code; the middleware extracts, adapts and runs it in a sandbox, fully traced. |
| Tensor Bench | `@johnhenry/math-plus-*` | Live-trained autograd MLP with its computation graph, FFT and filters, image kernels (CPU/WebGPU), units. |
| Grapher Cells | `@johnhenry/math-grapher` | A notebook over the real reactive-cell MCP server, with a dependency graph and an agent console. |
| Leserve Wire | `@johnhenry/leserve` | Edit a `(request) => Response` handler, fire requests, see the raw HTTP wire. Real Node via the companion. |
| Servant Hall | `@johnhenry/servant` | Fetch-event server script with a middleware chain, HTTP and WebSocket panels, and a dispatch trace. |
| Dialback Tunnel | `@johnhenry/dialback` | The browser is the agent behind the NAT; public requests are tunnelled back down its own socket. |
| Web Shell | `@johnhenry/wsh` | Ed25519 handshake viewer, xterm PTY, QMux stream inspector, files (list/write/rename/transfer), MCP tools, trust-on-first-use host keys and session recording. Against the companion it talks to the real `@johnhenry/wsh/server` host. |
| Apple On-Device | `@johnhenry/apple-foundation-models` | Status, chat and the full API surface; live only on macOS 26 Apple Silicon with the package installed. |

The home page is an animated orrery driven by `@johnhenry/css-signals`. The whole site is themed with
[Circuit](https://opensource.johnhenry.me/circuit/) design tokens (`@erisera-code/circuit`).

## Hosting under a sub-path

The site is hash-routed and every asset is emitted relative to Vite's `base`, so it works at any path with no
server rewrites. The docs site at opensource.johnhenry.me builds it with `npm run build:subpath` (base `/orrery/`,
output `../public/orrery`). Deep links look like `/orrery/#/hashish?q=…`.

## Optional Node companion

Five planets have a server side (Leserve, Servant, Dialback, Web Shell, Apple On-Device, plus Letterpress's notes API).
They work everywhere with a clearly labelled in-page stand-in. To use the real servers on your machine:

```bash
npm run node      # http://localhost:7777, plus 7778 (leserve), 7779 (servant) and 7780 (wsh)
```

Planets probe `GET /orrery.json` on mount and switch to live mode when it answers. Demos live in `server/demos/*.mjs`;
a demo that fails to mount is reported in the manifest and never takes the companion down. See `server/README.md`.

## Cross-room handoffs

Planets talk to each other through a small bus (`src/bus.ts`): Math → Ecmanim (export a rotor, Julia set or graph as a Scene),
Spintax → Hashish and Chunker (generated corpora), Domable → JSX Studio (scaffold as files), HTTP Converter → Header Fields
(structured headers), Tensor Bench and Form Lab → Data Plot Studio (a loss curve, an array of rows). Every planet is deep-linkable (`#/<planet>?k=v`) with a copy-link button, ⌘K jumps between planets,
a source drawer shows each planet's module, and the Tester Console's results appear as badges on the planets.

## What's next

[ROADMAP.md](./ROADMAP.md) is the plan from the last deep dive over every library: P0 fixes, seven tier-1 synergies (an agent-protocols switchboard, the model calling MCP tools, an Ecmanim studio with physics, the handoff bus across tabs, a real math server behind Agent Query, a deploy/pipeline tab, Raijin across tabs), a level-up per planet, site-wide mechanisms, and the upstream findings.

## Architecture

Vite + vanilla TypeScript, no framework. `src/registry.ts` lists the planets; each planet is one module in
`src/playgrounds/` exporting a `Playground` with a `mount(host)` that returns a cleanup function.
`src/main.ts` is a hash router that sets Circuit's `--hue` per planet and lazy-loads the module.
