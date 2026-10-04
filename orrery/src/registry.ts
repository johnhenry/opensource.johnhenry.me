/**
 * Every playground is a self-contained module that mounts into a host element.
 * Keep all state inside mount(); return a cleanup function to tear down timers,
 * listeners, workers, or animation frames when the user navigates away.
 */
export interface Playground {
  /** URL slug, e.g. "spintax" → #/spintax */
  id: string;
  /** Display title, e.g. "Spintax Forge" */
  title: string;
  /** npm package name shown in the header, e.g. "@johnhenry/spintax" */
  pkg: string;
  /** Accent hue (0-360) for this planet, applied as Circuit's --hue */
  hue: number;
  /** One-sentence hook shown on the home orrery */
  blurb: string;
  /** Docs URL on opensource.johnhenry.me */
  docs: string;
  /** Build the UI into `host`. Return a cleanup fn if you allocate anything. */
  mount(host: HTMLElement): void | (() => void) | Promise<void | (() => void)>;
}

export interface PlaygroundEntry {
  id: string;
  title: string;
  pkg: string;
  hue: number;
  blurb: string;
  /** True when the planet can talk to the optional Node companion (`npm run node`). */
  companion?: boolean;
  /**
   * Other @johnhenry/* (or @erisera-code/circuit) packages this room's actual
   * functionality meaningfully exercises, beyond `pkg`. Shown as additional
   * header chips, primary first then these in array order. Omit when the
   * room only genuinely demonstrates its one primary package.
   */
  secondaryPkgs?: string[];
  load: () => Promise<{ default: Playground }>;
}

/** Order here is the orbit order on the home page (inner → outer). */
export const playgrounds: PlaygroundEntry[] = [
  { id: 'signals',   title: 'Signal Sky',        pkg: '@johnhenry/css-signals',      hue: 325, blurb: 'Pointer, scroll, time and keys become typed CSS variables. No JS in the styling loop.', load: () => import('./playgrounds/signals') },
  { id: 'spintax',   title: 'Spintax Forge',     pkg: '@johnhenry/spintax',          hue: 354, blurb: 'Expand {red|green|blue} templates into millions of variants, lazily.', load: () => import('./playgrounds/spintax') },
  { id: 'temporals', title: 'Temporal Loom',     pkg: '@johnhenry/temporals',        hue: 49,  blurb: '"Every second Tuesday" as a lazy, re-iterable sequence of Temporal objects.', secondaryPkgs: ['@johnhenry/signalle', '@johnhenry/css-signals'], load: () => import('./playgrounds/temporals') },
  { id: 'hashish',   title: 'Hashish Lab',       pkg: '@johnhenry/hashish',          hue: 47,  blurb: 'MinHash + LSH banding finds near-duplicate text without comparing every pair.', secondaryPkgs: ['@johnhenry/iteration'], load: () => import('./playgrounds/hashish') },
  { id: 'math',      title: 'Math Observatory',  pkg: '@johnhenry/math',             hue: 345, blurb: 'Complex numbers, rotors and linear algebra rendered as living fractals and fields.', load: () => import('./playgrounds/math') },
  { id: 'ecmanim',   title: 'Ecmanim Stage',     pkg: '@johnhenry/ecmanim',          hue: 285, blurb: 'A TypeScript manim. Same Scene code renders in Node and, right here, in canvas.', secondaryPkgs: ['@johnhenry/math'], load: () => import('./playgrounds/ecmanim') },
  { id: 'jth',       title: 'jth Stack Machine', pkg: '@johnhenry/jth-compiler',     hue: 0,   blurb: 'A stack language that compiles to JavaScript. Write it, compile it, run it, live.', secondaryPkgs: ['@johnhenry/jth-runtime', '@johnhenry/jth-eval', '@johnhenry/andbox'], load: () => import('./playgrounds/jth') },
  { id: 'iteration', title: 'Iteration Pipes',   pkg: '@johnhenry/iteration',        hue: 46,  blurb: 'Transducers and iterator algebra, visualised as data flowing through pipes.', secondaryPkgs: ['@johnhenry/signalle'], load: () => import('./playgrounds/iteration') },
  { id: 'chunker',   title: 'Chunker Scope',     pkg: '@johnhenry/semantic-chunker', hue: 339, blurb: 'Split text at topic boundaries with a bring-your-own embedder. Eleven cut strategies.', secondaryPkgs: ['@johnhenry/iteration'], load: () => import('./playgrounds/chunker') },
  { id: 'fields',    title: 'Header Fields',     pkg: '@johnhenry/http-fields',      hue: 224,  blurb: 'RFC 8941 Structured Field Values: parse, inspect, and serialize modern HTTP headers.', load: () => import('./playgrounds/fields') },
  { id: 'andbox',    title: 'Andbox Cell',       pkg: '@johnhenry/andbox',           hue: 95,  blurb: 'Run code in a Worker with host capabilities over RPC, rate limits and a kill switch.', load: () => import('./playgrounds/andbox') },
  { id: 'tester',    title: 'Tester Console',    pkg: '@johnhenry/tester',           hue: 5,   blurb: 'Generator-function tests emitting TAP, executed in the browser against this very site.', load: () => import('./playgrounds/tester') },
  { id: 'signalle',  title: 'Signalle Loom',     pkg: '@johnhenry/signalle',         hue: 346, blurb: 'Fine-grained signals with optional DOM bindings. Only what changed re-runs, and you can watch it.', load: () => import('./playgrounds/signalle') },
  { id: 'domable',   title: 'Domable Prism',     pkg: '@johnhenry/domable',          hue: 311,  blurb: 'HTML text, live DOM nodes and React-shaped objects, converted every direction, plus hyperscript and custom elements.', load: () => import('./playgrounds/domable') },
  { id: 'converter', title: 'HTTP Converter',    pkg: '@johnhenry/http-converter',   hue: 309, blurb: 'Raw HTTP, HAR, cURL and fetch() calls translated into each other, with auto-detection.', load: () => import('./playgrounds/converter') },
  { id: 'oat',       title: 'Optical Transport', pkg: '@johnhenry/oat-sender',       hue: 222,  blurb: 'Fountain-coded QR frames carry a signed artifact from one screen to a camera. Air-gapped, zero setup.', secondaryPkgs: ['@johnhenry/oat-receiver', '@johnhenry/oat-protocol', '@johnhenry/oat-qr-fountain'], load: () => import('./playgrounds/oat') },
  { id: 'mesh',      title: 'Browsermesh Swarm', pkg: '@johnhenry/browsermesh-primitives', hue: 228,  blurb: 'Open this planet in two tabs: they find each other, share a CRDT, and sign with Ed25519 identities.', secondaryPkgs: ['@johnhenry/browsermesh-pod'], load: () => import('./playgrounds/mesh') },
  { id: 'raijin',    title: 'Raijin Ledger',     pkg: '@johnhenry/raijin-core',      hue: 316, blurb: 'A browser-native rollup: in-page validators run PBFT rounds with leader rotation over a fee-ordered mempool.', secondaryPkgs: ['@johnhenry/raijin-consensus', '@johnhenry/raijin-mempool', '@johnhenry/raijin-da', '@johnhenry/raijin-validator', '@johnhenry/raijin-sdk'], load: () => import('./playgrounds/raijin') },
  { id: 'jj',        title: 'Jujutsu Timeline',  pkg: '@johnhenry/isomorphic-jj',    hue: 230, blurb: 'Version control in the browser: stable change IDs survive rewrites and the op log makes anything undoable.', load: () => import('./playgrounds/jj') },
  { id: 'studio',    title: 'JSX Studio',        pkg: '@johnhenry/servable',         hue: 306,  blurb: 'Fileable, servable and hostable: JSX that compiles to files, to a dispatcher, and to a gateway. Run it here.', secondaryPkgs: ['@johnhenry/fileable', '@johnhenry/hostable', '@johnhenry/packfile', '@johnhenry/dialback'], load: () => import('./playgrounds/studio') },
  { id: 'workbench',  title: 'Untrusted Desk',    pkg: '@johnhenry/window-algebra',   hue: 165, blurb: 'A tiling desk of notes you should not trust. window-algebra runs the windows (undo/redo, keyboard-movable floating windows, pop-out, saved layouts, two-tab sync); safe-fragment renders every note under a switchable profile, and a strict-CSP, Trusted Types frame proves it. Components are html-modules.', secondaryPkgs: ['@johnhenry/safe-fragment', '@johnhenry/html-modules'], load: () => import('./playgrounds/workbench') },
  { id: 'mcpq',      title: 'Agent Query',       pkg: '@johnhenry/mcp-query',        hue: 250, blurb: 'A reactive, cached MCP client with a policy gate, inspected live against an in-page server.', secondaryPkgs: ['@johnhenry/mcp-gate', '@johnhenry/aimatey-core', '@johnhenry/aimatey-frontend', '@johnhenry/aimatey-mcp'], load: () => import('./playgrounds/mcpq') },
  { id: 'laya',      title: 'Laya Playground',   pkg: '@johnhenry/laya',             hue: 320, blurb: 'Typed questions over a state, answered by an on-device model on WebGPU or CPU.', secondaryPkgs: ['@johnhenry/laya-presets', '@johnhenry/laya-router'], load: () => import('./playgrounds/laya') },
  { id: 'circuit',   title: 'Circuit Gallery',   pkg: '@erisera-code/circuit',       hue: 25,  blurb: 'The design system under every planet: one hue changes, everything else holds. Spin the dial.', load: () => import('./playgrounds/circuit') },
  { id: 'aimatey',   title: 'Aimatey Router',    pkg: '@johnhenry/aimatey',          hue: 350, blurb: 'One chat, many providers: middleware and routing across mocked backends, no API keys needed.', secondaryPkgs: ['@johnhenry/aimatey-core', '@johnhenry/aimatey-frontend', '@johnhenry/aimatey-middleware'], load: () => import('./playgrounds/aimatey') },
  { id: 'objectify', title: 'Objectify Bench',   pkg: '@johnhenry/objectify',        hue: 70,  blurb: 'Write a class, get a versioned, stateful CLI. Real @johnhenry/objectify (SQLite) when the companion runs; an in-browser emulation otherwise.', companion: true, load: () => import('./playgrounds/objectify') },
  { id: 'letterpress', title: 'Letterpress Press', pkg: '@johnhenry/letterpress',      hue: 324, blurb: 'Routes as tagged template literals: method, path and body in one string. Fire requests and watch them match.', companion: true, load: () => import('./playgrounds/letterpress') },
  { id: 'packfile',    title: 'Packfile Vault',    pkg: '@johnhenry/packfile',         hue: 318,  blurb: 'A directory becomes one gzipped web bundle, then serves itself as (Request) => Response.', load: () => import('./playgrounds/packfile') },
  { id: 'toolcode',    title: 'Tool by Code',      pkg: '@johnhenry/aimatey-middleware-andbox', hue: 335, blurb: 'An LLM with no tool calling writes code instead; the middleware extracts, adapts and runs it in a sandbox.', secondaryPkgs: ['@johnhenry/aimatey-core', '@johnhenry/aimatey-frontend', '@johnhenry/andbox'], load: () => import('./playgrounds/toolcode') },
  { id: 'tensor',      title: 'Tensor Bench',      pkg: '@johnhenry/math-plus-*',      hue: 329, blurb: 'Autograd, FFT, signals, image kernels and units from the twenty-one math-plus packages.', secondaryPkgs: ['@johnhenry/math-plus-tensor-core', '@johnhenry/math-plus-tensor-autograd', '@johnhenry/math-plus-fft', '@johnhenry/math-plus-signal', '@johnhenry/math-plus-image', '@johnhenry/math-plus-unit', '@johnhenry/math-plus-telemetry'], load: () => import('./playgrounds/tensor') },
  { id: 'grapher',     title: 'Grapher Cells',     pkg: '@johnhenry/math-grapher',     hue: 4,   blurb: 'A headless reactive-cell runtime, driven from a notebook UI and an agent-style command line.', secondaryPkgs: ['@johnhenry/math'], load: () => import('./playgrounds/grapher') },
  { id: 'leserve',     title: 'Leserve Wire',      pkg: '@johnhenry/leserve',          hue: 223, blurb: 'One API: serve(). A plain (Request) => Response handler, Deno-shaped, on real Node when the companion runs.', companion: true, secondaryPkgs: ['@johnhenry/http-converter'], load: () => import('./playgrounds/leserve') },
  { id: 'servant',     title: 'Servant Hall',      pkg: '@johnhenry/servant',          hue: 313, blurb: 'A batteries-included Node server with a service-worker fetch API, middleware and WebSockets.', companion: true, secondaryPkgs: ['@johnhenry/http-converter'], load: () => import('./playgrounds/servant') },
  { id: 'dialback',    title: 'Dialback Tunnel',   pkg: '@johnhenry/dialback',         hue: 226, blurb: 'The browser is the agent behind the firewall: it dials out, and the server dials back down the same socket.', companion: true, load: () => import('./playgrounds/dialback') },
  { id: 'wsh',         title: 'Web Shell',         pkg: '@johnhenry/wsh',              hue: 341, blurb: 'A browser-native remote shell: Ed25519 auth, CBOR over QMux, file transfer and asciicast recording.', companion: true, load: () => import('./playgrounds/wsh') },
  { id: 'switchboard', title: 'Agent Protocols Switchboard', pkg: '@johnhenry/mcp-query', hue: 118, blurb: 'MCP, an A2A-style task lifecycle, and a companion probe all feed one shared human-approval inbox.', companion: true, load: () => import('./playgrounds/switchboard') },
  { id: 'afm',         title: 'Apple On-Device',   pkg: '@johnhenry/apple-foundation-models', hue: 331, blurb: "Apple's on-device language model from JavaScript, when the companion runs on macOS 26 Apple Silicon.", companion: true, load: () => import('./playgrounds/afm') },
];

/**
 * npm package name → docs section slug on opensource.johnhenry.me, ground-truthed
 * against the sidebar in `astro.config.mjs` (one level up from `orrery/`): every
 * `{ label, directory }` sidebar entry there is a real, live docs section at
 * `https://opensource.johnhenry.me/<directory>/`. Family-prefixed packages (e.g.
 * every `@johnhenry/math-plus-*`, `@johnhenry/jth-*`, `@johnhenry/raijin-*`,
 * `@johnhenry/aimatey-*` other than aimatey-middleware-andbox, `@johnhenry/oat-*`,
 * `@johnhenry/browsermesh-*`, `@johnhenry/laya*`) fold under one section — each
 * fold below was confirmed by finding the package actually named in that
 * section's `src/content/docs/<slug>/` content, not guessed from the prefix
 * alone. `@johnhenry/math-plus-*` (the literal placeholder `pkg` used by the
 * Tensor Bench room, not an installable package) is included so that room's
 * primary chip links out like its secondary math-plus-* chips do.
 *
 * Used to render every room-head chip (primary + secondary) as a link. This is
 * intentionally a *different* map from `DOCS`/`docsUrl` in `main.ts`, which is
 * keyed by room id (not package name) for the top-bar "docs ↗" link — the two
 * key spaces don't overlap cleanly (e.g. one room id can front several
 * packages, and several rooms' packages can share one docs section), so this
 * stays the single source of truth for package → slug and `main.ts` reads it
 * rather than re-deriving it.
 */
export const PKG_DOCS: Record<string, string> = {
  '@johnhenry/css-signals': 'css-signals',
  '@johnhenry/spintax': 'spintax',
  '@johnhenry/temporals': 'temporals',
  '@johnhenry/hashish': 'hashish',
  '@johnhenry/math': 'math',
  '@johnhenry/iteration': 'math', // documented as a page under /math/, no top-level section of its own
  '@johnhenry/math-grapher': 'math',
  '@johnhenry/math-plus-*': 'math', // Tensor Bench's placeholder primary pkg
  '@johnhenry/math-plus-tensor-core': 'math',
  '@johnhenry/math-plus-tensor-autograd': 'math',
  '@johnhenry/math-plus-fft': 'math',
  '@johnhenry/math-plus-signal': 'math',
  '@johnhenry/math-plus-image': 'math',
  '@johnhenry/math-plus-unit': 'math',
  '@johnhenry/math-plus-telemetry': 'math',
  '@johnhenry/ecmanim': 'ecmanim',
  '@johnhenry/jth-compiler': 'jth',
  '@johnhenry/jth-runtime': 'jth',
  '@johnhenry/jth-eval': 'jth',
  '@johnhenry/semantic-chunker': 'semantic-chunker',
  '@johnhenry/http-fields': 'http-fields',
  '@johnhenry/andbox': 'andbox',
  '@johnhenry/tester': 'tester',
  '@johnhenry/signalle': 'signalle',
  '@johnhenry/domable': 'domable',
  '@johnhenry/http-converter': 'http-converter',
  '@johnhenry/oat-sender': 'oat',
  '@johnhenry/oat-receiver': 'oat',
  '@johnhenry/oat-protocol': 'oat',
  '@johnhenry/oat-qr-fountain': 'oat',
  '@johnhenry/browsermesh-primitives': 'browsermesh',
  '@johnhenry/browsermesh-pod': 'browsermesh',
  '@johnhenry/raijin-core': 'raijin',
  '@johnhenry/raijin-consensus': 'raijin',
  '@johnhenry/raijin-mempool': 'raijin',
  '@johnhenry/raijin-da': 'raijin',
  '@johnhenry/raijin-validator': 'raijin',
  '@johnhenry/raijin-sdk': 'raijin',
  '@johnhenry/isomorphic-jj': 'isomorphic-jj',
  '@johnhenry/servable': 'servable',
  '@johnhenry/fileable': 'fileable',
  '@johnhenry/hostable': 'hostable',
  '@johnhenry/window-algebra': 'window-algebra',
  '@johnhenry/html-modules': 'html-modules',
  '@johnhenry/safe-fragment': 'safe-fragment',
  '@johnhenry/mport': 'mport',
  '@johnhenry/mcp-query': 'agent-query',
  '@johnhenry/mcp-gate': 'agent-query',
  '@johnhenry/laya': 'laya-js',
  '@johnhenry/laya-presets': 'laya-js',
  '@johnhenry/laya-router': 'laya-js',
  '@erisera-code/circuit': 'circuit',
  '@johnhenry/aimatey': 'aimatey',
  '@johnhenry/aimatey-core': 'aimatey',
  '@johnhenry/aimatey-frontend': 'aimatey',
  '@johnhenry/aimatey-middleware': 'aimatey',
  '@johnhenry/aimatey-mcp': 'aimatey',
  '@johnhenry/objectify': 'objectify',
  '@johnhenry/letterpress': 'letterpress',
  '@johnhenry/packfile': 'packfile',
  '@johnhenry/aimatey-middleware-andbox': 'aimatey-middleware-andbox',
  '@johnhenry/leserve': 'leserve',
  '@johnhenry/servant': 'servant',
  '@johnhenry/dialback': 'dialback',
  '@johnhenry/wsh': 'wsh',
  '@johnhenry/apple-foundation-models': 'apple-foundation-models',
};

/** Docs URL for a package chip, or undefined if it has no known real docs section
 *  (render those as an unlinked chip rather than guessing/linking to a 404). */
export function pkgDocsUrl(pkg: string): string | undefined {
  const slug = PKG_DOCS[pkg];
  return slug ? `https://opensource.johnhenry.me/${slug}/` : undefined;
}
