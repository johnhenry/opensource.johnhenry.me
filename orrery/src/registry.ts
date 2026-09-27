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
  load: () => Promise<{ default: Playground }>;
}

/** Order here is the orbit order on the home page (inner → outer). */
export const playgrounds: PlaygroundEntry[] = [
  { id: 'signals',   title: 'Signal Sky',        pkg: '@johnhenry/css-signals',      hue: 325, blurb: 'Pointer, scroll, time and keys become typed CSS variables. No JS in the styling loop.', load: () => import('./playgrounds/signals') },
  { id: 'spintax',   title: 'Spintax Forge',     pkg: '@johnhenry/spintax',          hue: 354, blurb: 'Expand {red|green|blue} templates into millions of variants, lazily.', load: () => import('./playgrounds/spintax') },
  { id: 'temporals', title: 'Temporal Loom',     pkg: '@johnhenry/temporals',        hue: 49,  blurb: '"Every second Tuesday" as a lazy, re-iterable sequence of Temporal objects.', load: () => import('./playgrounds/temporals') },
  { id: 'hashish',   title: 'Hashish Lab',       pkg: '@johnhenry/hashish',          hue: 53,  blurb: 'MinHash + LSH banding finds near-duplicate text without comparing every pair.', load: () => import('./playgrounds/hashish') },
  { id: 'math',      title: 'Math Observatory',  pkg: '@johnhenry/math',             hue: 345, blurb: 'Complex numbers, rotors and linear algebra rendered as living fractals and fields.', load: () => import('./playgrounds/math') },
  { id: 'ecmanim',   title: 'Ecmanim Stage',     pkg: '@johnhenry/ecmanim',          hue: 285, blurb: 'A TypeScript manim. Same Scene code renders in Node and, right here, in canvas.', load: () => import('./playgrounds/ecmanim') },
  { id: 'jth',       title: 'jth Stack Machine', pkg: '@johnhenry/jth-compiler',     hue: 0,   blurb: 'A stack language that compiles to JavaScript. Write it, compile it, run it, live.', load: () => import('./playgrounds/jth') },
  { id: 'iteration', title: 'Iteration Pipes',   pkg: '@johnhenry/iteration',        hue: 56,  blurb: 'Transducers and iterator algebra, visualised as data flowing through pipes.', load: () => import('./playgrounds/iteration') },
  { id: 'chunker',   title: 'Chunker Scope',     pkg: '@johnhenry/semantic-chunker', hue: 339, blurb: 'Split text at topic boundaries with a bring-your-own embedder. Eleven cut strategies.', load: () => import('./playgrounds/chunker') },
  { id: 'fields',    title: 'Header Fields',     pkg: '@johnhenry/http-fields',      hue: 64,  blurb: 'RFC 8941 Structured Field Values: parse, inspect, and serialize modern HTTP headers.', load: () => import('./playgrounds/fields') },
  { id: 'andbox',    title: 'Andbox Cell',       pkg: '@johnhenry/andbox',           hue: 95,  blurb: 'Run code in a Worker with host capabilities over RPC, rate limits and a kill switch.', load: () => import('./playgrounds/andbox') },
  { id: 'tester',    title: 'Tester Console',    pkg: '@johnhenry/tester',           hue: 5,   blurb: 'Generator-function tests emitting TAP, executed in the browser against this very site.', load: () => import('./playgrounds/tester') },
  { id: 'signalle',  title: 'Signalle Loom',     pkg: '@johnhenry/signalle',         hue: 346, blurb: 'Fine-grained signals with optional DOM bindings. Only what changed re-runs, and you can watch it.', load: () => import('./playgrounds/signalle') },
  { id: 'domable',   title: 'Domable Prism',     pkg: '@johnhenry/domable',          hue: 71,  blurb: 'HTML text, live DOM nodes and React-shaped objects, converted every direction, plus hyperscript and custom elements.', load: () => import('./playgrounds/domable') },
  { id: 'converter', title: 'HTTP Converter',    pkg: '@johnhenry/http-converter',   hue: 309, blurb: 'Raw HTTP, HAR, cURL and fetch() calls translated into each other, with auto-detection.', load: () => import('./playgrounds/converter') },
  { id: 'oat',       title: 'Optical Transport', pkg: '@johnhenry/oat-sender',       hue: 60,  blurb: 'Fountain-coded QR frames carry a signed artifact from one screen to a camera. Air-gapped, zero setup.', load: () => import('./playgrounds/oat') },
  { id: 'mesh',      title: 'Browsermesh Swarm', pkg: '@johnhenry/browsermesh-primitives', hue: 65,  blurb: 'Open this planet in two tabs: they find each other, share a CRDT, and sign with Ed25519 identities.', load: () => import('./playgrounds/mesh') },
  { id: 'raijin',    title: 'Raijin Ledger',     pkg: '@johnhenry/raijin-core',      hue: 316, blurb: 'A browser-native rollup: in-page validators run PBFT rounds with leader rotation over a fee-ordered mempool.', load: () => import('./playgrounds/raijin') },
  { id: 'jj',        title: 'Jujutsu Timeline',  pkg: '@johnhenry/isomorphic-jj',    hue: 230, blurb: 'Version control in the browser: stable change IDs survive rewrites and the op log makes anything undoable.', load: () => import('./playgrounds/jj') },
  { id: 'studio',    title: 'JSX Studio',        pkg: '@johnhenry/servable',         hue: 68,  blurb: 'Fileable, servable and hostable: JSX that compiles to files, to a dispatcher, and to a gateway. Run it here.', load: () => import('./playgrounds/studio') },
  { id: 'mcpq',      title: 'Agent Query',       pkg: '@johnhenry/mcp-query',        hue: 250, blurb: 'A reactive, cached MCP client with a policy gate, inspected live against an in-page server.', load: () => import('./playgrounds/mcpq') },
  { id: 'laya',      title: 'Laya Playground',   pkg: '@johnhenry/laya',             hue: 320, blurb: 'Typed questions over a state, answered by an on-device model on WebGPU or CPU.', load: () => import('./playgrounds/laya') },
  { id: 'circuit',   title: 'Circuit Gallery',   pkg: '@erisera-code/circuit',       hue: 25,  blurb: 'The design system under every planet: one hue changes, everything else holds. Spin the dial.', load: () => import('./playgrounds/circuit') },
  { id: 'aimatey',   title: 'Aimatey Router',    pkg: '@johnhenry/aimatey',          hue: 350, blurb: 'One chat, many providers: middleware and routing across mocked backends, no API keys needed.', load: () => import('./playgrounds/aimatey') },
  { id: 'objectify', title: 'Objectify Bench',   pkg: 'objectify (emulated)',        hue: 105, blurb: 'Write a class, get a versioned, stateful CLI. An in-browser emulation of the objectify model.', load: () => import('./playgrounds/objectify') },
  { id: 'letterpress', title: 'Letterpress Press', pkg: '@johnhenry/letterpress',      hue: 324, blurb: 'Routes as tagged template literals: method, path and body in one string. Fire requests and watch them match.', companion: true, load: () => import('./playgrounds/letterpress') },
  { id: 'packfile',    title: 'Packfile Vault',    pkg: '@johnhenry/packfile',         hue: 75,  blurb: 'A directory becomes one gzipped web bundle, then serves itself as (Request) => Response.', load: () => import('./playgrounds/packfile') },
  { id: 'toolcode',    title: 'Tool by Code',      pkg: '@johnhenry/aimatey-middleware-andbox', hue: 335, blurb: 'An LLM with no tool calling writes code instead; the middleware extracts, adapts and runs it in a sandbox.', load: () => import('./playgrounds/toolcode') },
  { id: 'tensor',      title: 'Tensor Bench',      pkg: '@johnhenry/math-plus-*',      hue: 329, blurb: 'Autograd, FFT, signals, image kernels and units from the twenty-one math-plus packages.', load: () => import('./playgrounds/tensor') },
  { id: 'grapher',     title: 'Grapher Cells',     pkg: '@johnhenry/math-grapher',     hue: 4,   blurb: 'A headless reactive-cell runtime, driven from a notebook UI and an agent-style command line.', load: () => import('./playgrounds/grapher') },
  { id: 'leserve',     title: 'Leserve Wire',      pkg: '@johnhenry/leserve',          hue: 223, blurb: 'One API: serve(). A plain (Request) => Response handler, Deno-shaped, on real Node when the companion runs.', companion: true, load: () => import('./playgrounds/leserve') },
  { id: 'servant',     title: 'Servant Hall',      pkg: '@johnhenry/servant',          hue: 313, blurb: 'A batteries-included Node server with a service-worker fetch API, middleware and WebSockets.', companion: true, load: () => import('./playgrounds/servant') },
  { id: 'dialback',    title: 'Dialback Tunnel',   pkg: '@johnhenry/dialback',         hue: 226, blurb: 'The browser is the agent behind the firewall: it dials out, and the server dials back down the same socket.', companion: true, load: () => import('./playgrounds/dialback') },
  { id: 'wsh',         title: 'Web Shell',         pkg: '@johnhenry/wsh',              hue: 341, blurb: 'A browser-native remote shell: Ed25519 auth, CBOR over QMux, file transfer and asciicast recording.', companion: true, load: () => import('./playgrounds/wsh') },
  { id: 'afm',         title: 'Apple On-Device',   pkg: '@johnhenry/apple-foundation-models', hue: 331, blurb: "Apple's on-device language model from JavaScript, when the companion runs on macOS 26 Apple Silicon.", companion: true, load: () => import('./playgrounds/afm') },
];
