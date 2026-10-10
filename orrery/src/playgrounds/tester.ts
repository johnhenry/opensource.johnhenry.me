import type { Playground } from '../registry';
import { setRoomTests } from '../bus';
import { readState } from '../state';
import './tester.css';

// Type-only (erased at build time, no runtime import): lets the aimatey
// suite below annotate a plain mock BackendAdapter object literal against
// aimatey-core's real Router interface, the same package/pattern the
// "Aimatey Router" planet (src/playgrounds/aimatey.ts) already imports live.
import type { BackendAdapter, AdapterMetadata, IRChatRequest, IRChatResponse } from '@johnhenry/aimatey-types';

// 0.0.1: @johnhenry/tester now ships real declaration files for the barrel
// and every typed subpath used here (index.d.mts, TAPRunner.d.mts,
// testerror.d.mts), so these imports are fully typed with no stand-ins.
import { ok, notok, equal, notequal, deepequal, deepdeepequal, pass, fail, subtestpass, subtestfail, throws, doesnotthrow } from '@johnhenry/tester';
import { run, TAPResultPass, TAPResultFail, TAPResultCounts, TAPResultRange } from '@johnhenry/tester/TAPRunner';
import TestError from '@johnhenry/tester/testerror';

// Static raw import (same pattern circuit.ts uses for its SVG marks): the
// circuit suite below just inspects the text, no dynamic import needed.
import circuitTokensCss from '../../node_modules/@erisera-code/circuit/src/tokens.css?raw';


type Assertion = string | InstanceType<typeof TestError>;
type Plan = (n: number) => void;
type TestFn = (plan?: Plan) => AsyncGenerator<Assertion> | Generator<Assertion>;

/** Shape of the `window.__ORRERY_TESTER_DONE__` completion marker (roadmap 4.5). */
interface TesterRunResult {
  at: number;
  ms: number;
  tests: number;
  pass: number;
  fail: number;
  suites: Array<{ id: string; roomId?: string; pass: number; fail: number }>;
}

interface Suite {
  id: string;
  name: string;
  pkgName: string;
  /** Registry planet id this suite's results are reported against, via setRoomTests(). Meta suites (not tied to a shipping package) omit this. */
  roomId?: string;
  run: TestFn;
}

const describeError = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// ---------------------------------------------------------------------------
// The suite under test. One suite per planet, for every @johnhenry/@erisera-code
// package that's importable in the browser. Every library is imported
// dynamically *inside* its own generator and wrapped in try/catch, so a
// package that fails to load or throws mid-test only takes down its own
// suite — the rest keep running.
// ---------------------------------------------------------------------------

async function* suiteCssSignals(): AsyncGenerator<Assertion> {
  try {
    const { createSignals } = await import('@johnhenry/css-signals');
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      const signals = createSignals({ target: el, prefix: 'testersig' });
      signals.set('probe', 42);
      signals.flush();
      const value = getComputedStyle(el).getPropertyValue(signals.name('probe')).trim();
      yield equal(value, '42', "createSignals().set('probe', 42) + flush() publishes --testersig-probe on the target element");
      signals.dispose();
    } finally {
      el.remove();
    }
  } catch (err) {
    yield fail(`css-signals suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteSpintax(): AsyncGenerator<Assertion> {
  try {
    const { count, parse } = await import('@johnhenry/spintax');
    const template = 'Color: {red|green|blue}';
    yield equal(count(template), 3, 'count() reports 3 possible combinations');
    const values = [...parse(template)] as string[];
    yield equal(
      values.length,
      count(template),
      'parse() yields exactly as many strings as count() predicts',
    );
    yield ok(
      values.every((v) => /^Color: (red|green|blue)$/.test(v)),
      'every parsed string matches the template shape',
    );
    yield ok(new Set(values).size === values.length, 'every combination is distinct');
  } catch (err) {
    yield fail(`spintax suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteTemporals(): AsyncGenerator<Assertion> {
  try {
    const { Temporal } = await import('temporal-polyfill');
    const { recurBuilder } = await import('@johnhenry/temporals');
    const start = Temporal.PlainDate.from('2026-01-05');
    const points = recurBuilder(start).weekly().count(6).toArray();
    yield equal(points.length, 6, 'a weekly recurrence with count(6) produces exactly 6 occurrences');
    const [day0, day1] = points;
    const gap = day0.until(day1, { largestUnit: 'days' }).days;
    yield equal(gap, 7, 'consecutive weekly occurrences are exactly 7 days apart');
  } catch (err) {
    yield fail(`temporals suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteHashish(): AsyncGenerator<Assertion> {
  try {
    const { createHashish } = await import('@johnhenry/hashish');
    const index = createHashish({ seed: 42, shingleSize: 3 });
    await index.addDocument('a', 'the quick brown fox jumps over the lazy dog');
    await index.addDocument('b', 'the quick brown fox jumps over the lazy cat');
    await index.addDocument('c', 'completely unrelated text about deep space rockets');
    const results = await index.query({
      text: 'the quick brown fox jumps over the lazy dog',
      rerank: true,
      minSimilarity: 0.2,
    });
    const ids = results.map((r: { id: string | number }) => r.id);
    yield ok(ids.includes('a'), "querying with a document's own text finds it");
    yield ok(ids.includes('b'), 'a near-duplicate document is found as similar');
    yield notok(ids.includes('c'), 'an unrelated document is correctly excluded');
  } catch (err) {
    yield fail(`hashish suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteMath(): AsyncGenerator<Assertion> {
  try {
    const { ComplexNumber, Rotor4, Bivector4, Vec4, Symbolic } = await import('@johnhenry/math');

    const a = new ComplexNumber(1, 2);
    const b = new ComplexNumber(3, -1);
    const sum = a.add(b);
    yield ok(sum.re === 4 && sum.im === 1, 'ComplexNumber(1,2).add(3,-1) = 4+1i');
    const product = a.multiply(b);
    yield ok(product.re === 5 && product.im === 5, 'ComplexNumber(1,2).multiply(3,-1) = 5+5i');

    // A unit rotor in the xy-plane (scalar^2 + bivector^2 = cos^2 + sin^2 = 1):
    // apply() is a sandwich product, which is length-preserving for any unit rotor.
    const theta = Math.PI / 3;
    const rotor = new Rotor4(Math.cos(theta / 2), new Bivector4(Math.sin(theta / 2), 0, 0, 0, 0, 0), 0);
    const v = new Vec4(1, 0, 0, 0);
    const rotated = rotor.apply(v);
    yield ok(
      Math.abs(rotated.magnitude - v.magnitude) < 1e-9,
      'Rotor4.apply() preserves vector length (a unit rotor is an isometry)',
    );

    const derivative = Symbolic.differentiate('x^2', 'x');
    yield equal(
      Symbolic.evaluate(derivative, { x: 3 }),
      6,
      'Symbolic.differentiate("x^2","x") evaluates to 6 at x=3 (d/dx x^2 = 2x)',
    );
  } catch (err) {
    yield fail(`math suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteEcmanim(): AsyncGenerator<Assertion> {
  try {
    // Import-only smoke test: instantiating a real Scene needs a canvas and a
    // render loop, which is exactly what the planet itself demonstrates live.
    // Here we just confirm the browser entry point resolves and shapes up.
    const mod = await import('@johnhenry/ecmanim/browser');
    yield ok(typeof mod.Scene === 'function', '@johnhenry/ecmanim/browser resolves and exports the Scene class');
    yield ok(typeof mod.play === 'function', 'the browser entry point also exports play()');
  } catch (err) {
    yield fail(`ecmanim suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteJth(): AsyncGenerator<Assertion> {
  try {
    const { run: runJth } = await import('@johnhenry/jth-compiler');
    // Side-effecting import: registers +, dup, peek, etc. into the shared
    // jth-runtime registry that compiled programs resolve against.
    await import('@johnhenry/jth-stdlib');
    const result = await runJth('1 2 +', { captureLog: true, timeoutMs: 3000 });
    yield equal(result.value, 3, 'compile + run "1 2 +" leaves 3 on top of the stack');
  } catch (err) {
    yield fail(`jth-compiler suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteIteration(): AsyncGenerator<Assertion> {
  try {
    const { transduceSync, transducers } = await import('@johnhenry/iteration');
    const { map, take } = transducers;
    const pipeline = transduceSync(map((x: number) => x * 2), take(3));
    const result = [...pipeline([1, 2, 3, 4, 5])];
    yield deepequal(result, [2, 4, 6], 'map(x*2) piped through take(3) yields [2, 4, 6]');
    const empty = [...pipeline([])];
    yield deepequal(empty, [], 'the same pipeline over an empty source yields nothing');
  } catch (err) {
    yield fail(`iteration suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteChunker(): AsyncGenerator<Assertion> {
  try {
    const { sentence } = await import('@johnhenry/semantic-chunker');
    // The trivial embedder required by the brief: not remotely a real
    // embedding, just enough of a stand-in for the chunker to run.
    const trivialEmbed = (text: string) => [text.length];
    const chunker = sentence({ embed: trivialEmbed });
    const text = 'The sun rose over the hills. Birds began to sing. It was a peaceful morning.';
    const chunks: Array<[string, number[]]> = [];
    for await (const chunk of chunker(text) as AsyncGenerator<[string, number[]]>) chunks.push(chunk);
    yield equal(chunks.length, 3, 'sentence() segments the text into its 3 sentences');
    yield ok(
      chunks.every(([sentenceText]) => typeof sentenceText === 'string' && sentenceText.length > 0),
      'every chunk carries non-empty sentence text',
    );
  } catch (err) {
    yield fail(`semantic-chunker suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteHttpFields(): AsyncGenerator<Assertion> {
  try {
    const { parse, serialize } = await import('@johnhenry/http-fields');
    const original = 'max-age=100, must-revalidate';
    const dict = parse(original, 'dictionary');
    yield equal(dict['max-age'].value, 100, 'max-age parses to the integer 100');
    yield equal(dict['must-revalidate'].value, true, "must-revalidate parses to boolean true");
    const serialized = serialize(dict, 'dictionary');
    const reparsed = parse(serialized, 'dictionary');
    yield deepequal(
      reparsed,
      dict,
      'round-trip parse -> serialize -> parse reproduces the same structure',
    );
  } catch (err) {
    yield fail(`http-fields suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteAndbox(): AsyncGenerator<Assertion> {
  try {
    if (typeof Worker === 'undefined') {
      yield pass('andbox needs a Worker; skipped in this environment # SKIP no Worker support');
      return;
    }
    const { createSandbox } = await import('@johnhenry/andbox');
    const sb = await createSandbox({ defaultTimeoutMs: 4000 });
    try {
      const value = await sb.evaluate('return 1 + 1;');
      yield equal(value, 2, 'evaluate("return 1 + 1;") returns 2 from inside the Worker sandbox');
    } finally {
      await sb.dispose();
    }
  } catch (err) {
    yield fail(`andbox suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteSignalle(): AsyncGenerator<Assertion> {
  try {
    const core = await import('@johnhenry/signalle');
    const count = core.signal(1);
    yield equal(count.value, 1, 'signal(1) starts with .value === 1');
    let seen: number | undefined;
    const unsubscribe = count.subscribe((v) => { seen = v; });
    count.value = 5;
    yield equal(count.value, 5, 'assigning .value updates the signal');
    yield equal(seen, 5, 'subscribe() is notified of the new value');
    unsubscribe();
  } catch (err) {
    yield fail(`signalle suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteDomable(): AsyncGenerator<Assertion> {
  try {
    const { default: textToDom } = await import('@johnhenry/domable/text-to-dom');
    const { default: domToText } = await import('@johnhenry/domable/dom-to-text');
    const html = '<p>Hello <b>world</b></p>';
    const fragment = textToDom(html) as DocumentFragment;
    const text = domToText(fragment);
    yield ok(text.includes('<b>world</b>'), 'textToDom -> domToText round-trips the <b> element');
    yield ok(text.includes('Hello'), 'the round-tripped text preserves the "Hello" text node');
  } catch (err) {
    yield fail(`domable suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteHttpConverter(): AsyncGenerator<Assertion> {
  try {
    const { toRequest } = await import('@johnhenry/http-converter/curl');
    const req = toRequest(
      `curl -X POST 'https://api.example.com/items' -H 'Content-Type: application/json' -d '{"a":1}'`,
    );
    yield equal(req.method, 'POST', 'curl -X POST is parsed into method "POST"');
    yield equal(req.url, 'https://api.example.com/items', 'the URL is extracted from the cURL command');
    yield equal(req.headers['content-type'], 'application/json', 'the -H header is captured (lowercased key)');
    yield equal(req.body, '{"a":1}', 'the -d body is captured verbatim');
  } catch (err) {
    yield fail(`http-converter suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteOat(): AsyncGenerator<Assertion> {
  try {
    const { encodeCanonical, decodeCanonical } = await import('@johnhenry/oat-protocol');
    const payload = { kind: 'ping', n: 42, tags: ['a', 'b'] };
    const bytes = encodeCanonical(payload);
    yield ok(bytes instanceof Uint8Array && bytes.length > 0, 'encodeCanonical() produces a non-empty Uint8Array');
    const decoded = decodeCanonical(bytes);
    yield deepequal(decoded, payload, 'decodeCanonical(encodeCanonical(payload)) round-trips the payload exactly');
  } catch (err) {
    yield fail(`oat-protocol suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteMesh(): AsyncGenerator<Assertion> {
  try {
    // probeEd25519Support is exported at runtime (identity.mjs) but missing from the
    // shipped index.d.ts -- same real gap src/playgrounds/mesh.ts works around.
    const prim = await import('@johnhenry/browsermesh-primitives');
    const { PodIdentity } = prim;
    const probeEd25519Support = (prim as unknown as { probeEd25519Support(): Promise<boolean> }).probeEd25519Support;
    const supported = await probeEd25519Support();
    if (!supported) {
      yield pass('WebCrypto Ed25519 is unavailable in this browser; identity generation skipped # SKIP no Ed25519 support');
      return;
    }
    const identity = await PodIdentity.generate();
    yield ok(typeof identity.podId === 'string' && identity.podId.length > 0, 'PodIdentity.generate() derives a non-empty podId');
    const signature = await identity.sign(new TextEncoder().encode('hello mesh'));
    yield ok(signature instanceof Uint8Array && signature.length > 0, 'the generated identity can sign data with its private key');
  } catch (err) {
    yield fail(`browsermesh-primitives suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteRaijin(): AsyncGenerator<Assertion> {
  try {
    const { InMemoryStateStore, StateMachine } = await import('@johnhenry/raijin-core');
    const store = new InMemoryStateStore();
    const verifier = { verify: async () => true };
    const machine = new StateMachine(store, verifier);
    const from = new Uint8Array(32).fill(1);
    const to = new Uint8Array(32).fill(2);
    const tx = {
      from,
      nonce: 0n,
      to,
      value: 100n,
      data: new Uint8Array(0),
      signature: new Uint8Array(64),
      chainId: 1n,
    };
    // One state-machine step: a Transfer from a fresh (zero-balance) account
    // must revert on insufficient balance without mutating state.
    const receipt = await machine.applyTransaction(tx, 0);
    yield equal(receipt.status, 'revert', 'applyTransaction() on a zero-balance Transfer reverts (insufficient balance)');
    const account = await machine.getAccount(from);
    yield equal(account.balance, 0n, "a reverted transaction leaves the sender's balance unchanged");
  } catch (err) {
    yield fail(`raijin-core suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteJj(): AsyncGenerator<Assertion> {
  try {
    const mod = await import('@johnhenry/isomorphic-jj/browser');
    yield ok(typeof mod.detectCapabilities === 'function', '@johnhenry/isomorphic-jj/browser resolves and exports detectCapabilities()');
    const caps = mod.detectCapabilities();
    yield ok(typeof caps.indexedDB === 'boolean', 'detectCapabilities() reports an indexedDB boolean flag');
    yield ok(typeof caps.webWorker === 'boolean', 'detectCapabilities() reports a webWorker boolean flag');
  } catch (err) {
    yield fail(`isomorphic-jj suite crashed before assertions ran: ${describeError(err)}`);
  }
}

// servable 0.0.1's `#resolve`/`#serve-file` internal import-map entries now
// declare a `browser` condition (resolve.browser.js / serve-file.browser.js)
// that never reaches fileable/hostable's Node-only "glob" dependency, so the
// plain `.` entry point (Router/Route/compile) is import-safe and buildable
// here -- same real package code the studio planet now imports directly too
// (see studio.ts), just exercised here as a standalone one-route smoke test.
async function* suiteStudio(): AsyncGenerator<Assertion> {
  try {
    const { Router, Route, compile } = await import('@johnhenry/servable');
    const tree = Router({
      children: Route({
        path: '/hello',
        method: 'GET',
        handler: () => new globalThis.Response('hi from servable', { status: 200 }),
      }),
    });
    const { fetch: dispatch, warnings } = await compile(tree);
    yield deepequal(warnings, [], 'compiling a one-route tree produces no warnings');
    const res = await dispatch(new Request('https://tester.invalid/hello'));
    yield equal(res.status, 200, 'GET /hello matches the compiled Route and responds 200');
    const body = await res.text();
    yield equal(body, 'hi from servable', "the Route's handler body is returned verbatim");
    const miss = await dispatch(new Request('https://tester.invalid/nope'));
    yield equal(miss.status, 404, 'an unmatched path falls through to the default 404');
  } catch (err) {
    yield fail(`servable suite crashed before assertions ran: ${describeError(err)}`);
  }
}

// mcp-gate 0.2.2 ships a `browser` export condition (dist/index.browser.js)
// that re-exports only the pure, Node-free declarative-policy compiler
// (compilePolicy/policyListFilter) -- never ./upstream.ts, which is what
// pulled in @modelcontextprotocol/client/stdio (cross-spawn, node:stream)
// and broke `vite build` before. Vite/esbuild resolve the `browser`
// condition by default, so a plain `import('@johnhenry/mcp-gate')` here
// picks up that safe subset.
async function* suiteMcpGate(): AsyncGenerator<Assertion> {
  try {
    const { compilePolicy } = await import('@johnhenry/mcp-gate');
    const authorize = compilePolicy({ allow: ['fs.*'], deny: ['fs.delete'] });
    const allowed = await authorize({ kind: 'call', server: 'fs', target: 'read', destructive: false, readOnly: true });
    yield equal(allowed, 'allow', "compilePolicy({allow:['fs.*']}) allows fs.read, which matches the allow glob");
    const denied = await authorize({ kind: 'call', server: 'fs', target: 'delete', destructive: true, readOnly: false });
    yield equal(denied, 'deny', "the same policy denies fs.delete, which matches the deny glob (deny takes precedence)");
    const notAllowed = await authorize({ kind: 'call', server: 'net', target: 'fetch', destructive: false, readOnly: true });
    yield equal(notAllowed, 'deny', 'a server.tool id that matches neither glob is denied by the implicit allow-list default');
  } catch (err) {
    yield fail(`mcp-gate suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteLaya(): AsyncGenerator<Assertion> {
  try {
    const mod = await import('@johnhenry/laya');
    yield ok(typeof mod.load === 'function', '@johnhenry/laya resolves and exports load()');
    yield ok(typeof mod.createAgent === 'function', '@johnhenry/laya resolves and exports createAgent()');
  } catch (err) {
    yield fail(`laya suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteCircuit(): AsyncGenerator<Assertion> {
  try {
    yield ok(circuitTokensCss.includes('--hue'), "tokens.css defines the --hue custom property every planet's accent derives from");
    yield ok(/--hue:\s*\d+/.test(circuitTokensCss), 'tokens.css sets a numeric default for --hue');
  } catch (err) {
    yield fail(`circuit suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteLetterpress(): AsyncGenerator<Assertion> {
  try {
    // 0.0.2: "." now carries a real "types" condition, so this barrel import
    // resolves fully typed.
    const { createRouter } = await import('@johnhenry/letterpress');
    const router = createRouter();
    // 0.0.3: RouterExtension.endpoint now returns RouterEndpointResponder,
    // which models both curried second-call forms (tagged-template
    // body-literal, or a plain handler function) -- see CHANGELOG's #11
    // fix. No more @ts-expect-error needed here.
    router.endpoint`GET /protected [Authorization: Bearer *]``
HTTP/1.1 200 OK
Content-Type: text/plain

This is a protected resource
`;
    const authed = await router(
      new Request('https://tester.invalid/protected', { headers: { Authorization: 'Bearer abc123' } }),
    );
    yield equal(authed.status, 200, 'a request with a Bearer token matches the [Authorization: Bearer *] header pattern');
    const body = await authed.text();
    yield ok(body.includes('protected resource'), 'the matched route returns its templated response body');
    const unauthed = await router(new Request('https://tester.invalid/protected'));
    yield ok(unauthed.status !== 200, 'the same route rejects a request with no Authorization header');
  } catch (err) {
    yield fail(`letterpress suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suitePackfile(): AsyncGenerator<Assertion> {
  try {
    // 0.0.1: "./browser" now carries a real "types" condition (browser.d.ts),
    // so this resolves fully typed -- FileEntry requires size/hash alongside
    // data, hence the digest below.
    const { toArchive, fromArchive } = await import('@johnhenry/packfile/browser');
    const original = new TextEncoder().encode('hello from the tester planet');
    const digest = await crypto.subtle.digest('SHA-256', original.slice().buffer);
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const files = new Map([['hello.txt', { data: original, size: original.byteLength, hash }]]);
    const archive = await toArchive(files);
    yield ok(archive instanceof ArrayBuffer && archive.byteLength > 0, 'toArchive() produces a non-empty gzipped Web Bundle (as an ArrayBuffer)');
    const restored = await fromArchive(archive);
    const entry = restored.get('hello.txt');
    yield ok(entry !== undefined, 'fromArchive() recovers the same path the archive was built from');
    yield deepequal(
      entry && Array.from(new Uint8Array(entry.data)),
      Array.from(original),
      "the round-tripped file's bytes match the original exactly",
    );
  } catch (err) {
    yield fail(`packfile suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteObfo(): AsyncGenerator<Assertion> {
  try {
    const { default: obfo, fill, formFromObject } = await import('@johnhenry/obfo');
    const form = document.createElement('form');
    form.setAttribute('data-obfo-container', '{}');
    form.innerHTML = '<input name="age" type="number" value="20"><input name="ok" type="checkbox" checked><div data-obfo-container="[]" data-obfo-name="tags"><input value="a"><input value="b"></div>';
    yield deepequal(obfo(form, { cast: 'auto' }), { age: 20, ok: true, tags: ['a', 'b'] }, 'obfo(form, { cast: "auto" }) reads a nested object with typed values');
    fill(form, { age: 36, tags: ['x'] }, { cast: 'auto' });
    yield deepequal(obfo(form, { cast: 'auto' }), { age: 36, ok: true, tags: ['x', 'b'] }, 'fill() writes what is present and leaves the rest');
    const value = { title: 'Notes', count: 3, done: false, tags: ['a'], owner: null };
    yield deepequal(obfo(formFromObject(value)), value, 'formFromObject() builds a form that reads back as the same JSON');
  } catch (err) {
    yield fail(`obfo suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteDomkit(): AsyncGenerator<Assertion> {
  try {
    await import('@johnhenry/domkit/code-editor/global.mjs');
    const form = document.createElement('form');
    form.innerHTML = '<code-editor name="snippet" language="js" required></code-editor>';
    document.body.append(form);
    try {
      const editor = form.querySelector('code-editor') as HTMLElement & { value: string; resolvedLanguage: string | null };
      yield ok(customElements.get('code-editor') !== undefined, '<code-editor> is registered by its global.mjs');
      yield ok(!form.checkValidity(), 'a required, empty <code-editor> makes its form invalid');
      editor.value = 'let x = 1;';
      yield equal(new FormData(form).get('snippet'), 'let x = 1;', 'its value is submitted with the form (ElementInternals)');
      yield equal(editor.resolvedLanguage, 'js', 'resolvedLanguage reflects the language attribute');
    } finally { form.remove(); }
  } catch (err) {
    yield fail(`domkit suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteDataPlot(): AsyncGenerator<Assertion> {
  try {
    const { linear, band, readTable } = await import('@johnhenry/data-plot');
    yield equal(linear([0, 10])(5), 0.5, 'linear([0, 10]) maps 5 to the middle');
    const b = band(['a', 'b'], 0);
    yield equal(b('b'), 0.75, 'band(["a", "b"]) maps "b" to its band center');
    const t = document.createElement('table');
    t.innerHTML = '<thead><tr><th>city</th><th>rain</th></tr></thead><tbody><tr><td>Oslo</td><td>760</td></tr></tbody>';
    yield deepequal(readTable(t), [{ city: 'Oslo', rain: 760 }], 'readTable() turns a table into rows, numeric text into numbers');
  } catch (err) {
    yield fail(`data-plot suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteTensor(): AsyncGenerator<Assertion> {
  try {
    const { Tensor } = await import('@johnhenry/math-plus-tensor-core');
    const a = Tensor.from([1, 2, 3]);
    const b = Tensor.from([10, 20, 30]);
    const sum = a.add(b);
    yield deepequal(sum.toArray(), [11, 22, 33], 'Tensor.from([1,2,3]).add([10,20,30]) elementwise-sums to [11,22,33]');
    yield deepequal(sum.shape, a.shape, 'the result keeps the same shape as its operands');
  } catch (err) {
    yield fail(`math-plus-tensor-core suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteGrapher(): AsyncGenerator<Assertion> {
  try {
    const mod = await import('@johnhenry/math-grapher');
    yield ok(typeof mod.buildServer === 'function', '@johnhenry/math-grapher resolves and exports buildServer()');
    yield ok(typeof mod.CellGraph === 'function', 'it also re-exports @johnhenry/math\'s CellGraph');
    yield ok(mod.OP_CATALOG !== undefined && typeof mod.OP_CATALOG === 'object', 'OP_CATALOG (the op catalog driving reactive cells) is populated');
  } catch (err) {
    yield fail(`math-grapher suite crashed before assertions ran: ${describeError(err)}`);
  }
}

async function* suiteToolcode(): AsyncGenerator<Assertion> {
  try {
    const { adaptPythonisms } = await import('@johnhenry/aimatey-middleware-andbox');
    const adapted = adaptPythonisms('name = f"Hello {name}, you are {age} years old"');
    yield ok(adapted.includes('`'), 'adaptPythonisms() turns an f-string into a real template literal');
    yield ok(adapted.includes('${name}') && adapted.includes('${age}'), 'each {placeholder} becomes a ${...} interpolation');
    yield ok(!/\bf["']/.test(adapted), "the leading f-string marker (f\"...\") is stripped from the adapted code");
  } catch (err) {
    yield fail(`aimatey-middleware-andbox suite crashed before assertions ran: ${describeError(err)}`);
  }
}

// @johnhenry/objectify@0.0.0 (P0.6) is a real, published npm package now,
// but its only export chain (index.js -> objectify.js/object-ref.js -> db.js
// -> id.js) is a TypeScript adapter over better-sqlite3's native binding.
// Its package.json exports map has exactly one entry ("." -> ./dist/index.js)
// and no "browser" condition anywhere -- verified two ways: `npm view
// @johnhenry/objectify exports` returns only that one path, and actually
// bundling it here (before writing this honest version of the suite) made
// Rollup fail outright on id.js's `node:crypto` import ("randomBytes is not
// exported by __vite-browser-external"), which would break `vite build` for
// every OTHER suite too, not just this one's runtime. There is nothing left
// to try/catch around: the failure is at bundle time, not call time. So
// this reports that real finding instead of faking an import.
async function* suiteObjectify(): AsyncGenerator<Assertion> {
  yield pass(
    'objectify ships no browser-safe entry point: its sole "." export ' +
    'unconditionally pulls in better-sqlite3 (a native binding); importing ' +
    'it breaks the bundle, not just the call # SKIP Node-only, no browser export condition',
  );
}

// @johnhenry/servant's package.json exports map ("."/"./controls" ->
// controls.mjs, "./event" -> event.mjs) has no "browser" condition either,
// and controls.mjs unconditionally imports node:http, node:https, node:stream
// and the `ws` package at module scope. Verified the same way as objectify
// above: bundling it here fails Rollup on controls.mjs's `pipeline` import
// ("pipeline is not exported by __vite-browser-external"). Nothing here is
// reachable from a browser, at any subpath.
async function* suiteServant(): AsyncGenerator<Assertion> {
  yield pass(
    'servant ships no browser-safe entry point: its sole "." export ' +
    'unconditionally imports node:http/https/stream and ws; importing it ' +
    'breaks the bundle, not just the call # SKIP Node-only, no browser export condition',
  );
}

// @johnhenry/apple-foundation-models' dist/index.mjs imports child_process,
// fs, net, path, url, crypto and readline at module scope to spawn and talk
// to a native Swift binary (AppleFoundationModelsWrapper) -- macOS-only by
// design, not just Node-only. Verified the same way: bundling it here fails
// Rollup on the externalized child_process import. No subpath avoids it.
async function* suiteAfm(): AsyncGenerator<Assertion> {
  yield pass(
    'apple-foundation-models ships no browser-safe entry point: its sole ' +
    '"." export spawns a native Swift binary via child_process/fs/net; ' +
    'importing it breaks the bundle, not just the call # SKIP Node-only, macOS-only, no browser export condition',
  );
}

// The literal "@johnhenry/aimatey" umbrella package (the registry's `pkg`
// for this planet) only exports a VERSION string by design -- its own
// readme says so, and the live "Aimatey Router" planet (aimatey.ts) already
// imports the real functionality from aimatey-core/-frontend/-middleware/
// -types instead. So this suite tests the actual package that planet runs:
// aimatey-core's Router, registering one BackendAdapter (the same interface
// aimatey.ts's three mock backends implement) and dispatching a real IR
// chat request through it end to end.
async function* suiteAimatey(): AsyncGenerator<Assertion> {
  try {
    const { createRouter } = await import('@johnhenry/aimatey-core');
    const metadata: AdapterMetadata = {
      name: 'tester-mock',
      version: '0.1.0',
      provider: 'tester',
      capabilities: {
        streaming: false,
        multiModal: false,
        tools: false,
        systemMessageStrategy: 'in-messages',
        supportsMultipleSystemMessages: true,
        supportsTemperature: true,
      },
    };
    const backend: BackendAdapter<IRChatRequest, IRChatResponse> = {
      metadata,
      fromIR: (request) => request,
      toIR: (response) => response,
      async execute(request) {
        return {
          message: { role: 'assistant', content: 'pong' },
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          metadata: { requestId: request.metadata.requestId, timestamp: Date.now(), provenance: { backend: 'tester-mock' } },
        };
      },
      async *executeStream(request) {
        yield {
          type: 'done', sequence: 0, finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          message: { role: 'assistant', content: 'pong' },
        };
      },
    };
    const router = createRouter();
    router.register('tester-mock', backend);
    const request: IRChatRequest = {
      messages: [{ role: 'user', content: 'ping' }],
      metadata: { requestId: 'tester-req-1', timestamp: Date.now() },
    };
    const response = await router.execute(request);
    yield equal(response.message.content, 'pong', "Router.execute() dispatches to the sole registered backend and returns its IRChatResponse");
    const stats = router.getBackendStats('tester-mock');
    yield equal(stats?.totalRequests, 1, "the router's per-backend stats count the dispatched request");
    router.unregister('tester-mock');
    yield notok(router.has('tester-mock'), 'unregister() removes the backend from the router');
  } catch (err) {
    yield fail(`aimatey-core suite crashed before assertions ran: ${describeError(err)}`);
  }
}

// leserve ships zero .d.ts files anywhere in the published package (its
// types are JSDoc-only) -- every subpath below is real, working ESM, just
// untyped, so each dynamic import needs its own suppression. Exercises the
// three dependency-free, browser-safe entry points the roadmap calls out
// (/compose, /auth, /body) composed into one real handler, then dispatched
// through /test-harness's testHandler() without starting a server.
async function* suiteLeserve(): AsyncGenerator<Assertion> {
  try {
    // @ts-expect-error leserve ships no declaration file for "./compose"
    const { compose } = await import('@johnhenry/leserve/compose');
    // @ts-expect-error leserve ships no declaration file for "./auth"
    const { bearerAuth } = await import('@johnhenry/leserve/auth');
    // @ts-expect-error leserve ships no declaration file for "./body"
    const { respond } = await import('@johnhenry/leserve/body');
    // @ts-expect-error leserve ships no declaration file for "./test-harness"
    const { testHandler } = await import('@johnhenry/leserve/test-harness');
    const requireAuth = bearerAuth(async (token: string) => token === 'tester-secret');
    const handler = compose(requireAuth, async () => respond({ ok: true }));
    const app = testHandler(handler);
    const denied = await app.get('/ping');
    yield equal(denied.status, 401, 'bearerAuth() middleware rejects a request with no Authorization header');
    const allowed = await app.get('/ping', { Authorization: 'Bearer tester-secret' });
    yield equal(allowed.status, 200, 'the same route, composed with a valid Bearer token, reaches the handler');
    const body = await allowed.json();
    yield deepequal(body, { ok: true }, "body's respond() serializes the handler's data as the JSON response");
  } catch (err) {
    yield fail(`leserve suite crashed before assertions ran: ${describeError(err)}`);
  }
}

// A minimal in-memory duplex byte-stream pair shaped like a
// `@johnhenry/browsermesh-netway` `StreamSocket` (`write(bytes)`/`read()`/
// `close()`) -- just enough for dialback's real, exported
// `createBrowsermeshTransport`/`acceptBrowsermeshConnections` to run their
// real identity handshake end to end below without installing
// browsermesh-netway itself (an optional peer dependency this project
// doesn't otherwise need).
interface FakeStreamSocket {
  write(bytes: Uint8Array): Promise<void>;
  read(): Promise<Uint8Array | null>;
  close(): Promise<void>;
}
class InMemoryByteQueue {
  private buf: Uint8Array[] = [];
  private waiter: ((v: Uint8Array | null) => void) | null = null;
  private closed = false;
  push(chunk: Uint8Array): void {
    if (this.closed) return;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(chunk);
    } else {
      this.buf.push(chunk);
    }
  }
  close(): void {
    this.closed = true;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(null);
    }
  }
  read(): Promise<Uint8Array | null> {
    if (this.buf.length) return Promise.resolve(this.buf.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => { this.waiter = resolve; });
  }
}
function makeInMemorySocketPair(): [FakeStreamSocket, FakeStreamSocket] {
  const aToB = new InMemoryByteQueue();
  const bToA = new InMemoryByteQueue();
  const socketA: FakeStreamSocket = {
    write: async (bytes) => aToB.push(bytes),
    read: () => bToA.read(),
    close: async () => aToB.close(),
  };
  const socketB: FakeStreamSocket = {
    write: async (bytes) => bToA.push(bytes),
    read: () => aToB.read(),
    close: async () => bToA.close(),
  };
  return [socketA, socketB];
}

// dialback's "./browsermesh" subpath (transports/browsermesh.mjs) carries
// no "types" entry in its exports map (verified) -- only "." is typed.
// `createBrowsermeshTransport`/`acceptBrowsermeshConnections` are its real,
// publicly exported functions (the identity-handshake internals in
// handshake.mjs are not exported and not reachable through the package's
// own exports map). Both are duck-typed against a netway `VirtualNetwork`/
// `Listener` shape, so the in-memory socket pair above stands in for
// browsermesh-netway without needing it installed, while the Ed25519
// challenge/response handshake itself runs for real.
async function* suiteDialback(): AsyncGenerator<Assertion> {
  try {
    const prim = await import('@johnhenry/browsermesh-primitives');
    const { PodIdentity } = prim;
    const probeEd25519Support = (prim as unknown as { probeEd25519Support(): Promise<boolean> }).probeEd25519Support;
    if (!(await probeEd25519Support())) {
      yield pass('WebCrypto Ed25519 is unavailable in this browser; the identity handshake is skipped # SKIP no Ed25519 support');
      return;
    }
    // @ts-expect-error dialback's "./browsermesh" export condition carries no "types" entry
    const { createBrowsermeshTransport, acceptBrowsermeshConnections } = await import('@johnhenry/dialback/browsermesh');

    const [listenerSocket, agentSocket] = makeInMemorySocketPair();
    const listenerIdentity = await PodIdentity.generate();
    const agentIdentity = await PodIdentity.generate();

    let acceptCalls = 0;
    const fakeListener = { accept: async () => (acceptCalls++ === 0 ? listenerSocket : null) };
    const fakeServer = { addConnection: async () => {} };
    let onAccepted!: (v: { podId: string }) => void;
    const accepted = new Promise<{ podId: string }>((resolve) => { onAccepted = resolve; });
    const acceptLoop = acceptBrowsermeshConnections(fakeListener, fakeServer, listenerIdentity, {
      timeoutMs: 2000,
      onConnection: (_connection: unknown, podId: string) => onAccepted({ podId }),
    });

    const transport = createBrowsermeshTransport({ connect: async () => agentSocket }, agentIdentity, { timeoutMs: 2000 });
    const [connection, verifiedPeer] = await Promise.all([transport('mem://tester-agent'), accepted]);

    yield equal(
      verifiedPeer.podId,
      agentIdentity.podId,
      "acceptBrowsermeshConnections() runs the real Ed25519 challenge/response handshake and reports the connecting agent's true podId",
    );
    yield ok(
      !!connection && typeof connection.send === 'function',
      'createBrowsermeshTransport() resolves with a Connection once the agent has proven its identity to the listener',
    );

    connection.close();
    await acceptLoop;
  } catch (err) {
    yield fail(`dialback suite crashed before assertions ran: ${describeError(err)}`);
  }
}

// wsh's main entry ("Browser-native remote command execution over
// WebTransport/WebSocket with Ed25519 authentication") is fully typed and
// fully browser-safe end to end -- unlike servant/afm above, nothing here
// needs a Node-only fallback. Exercises the pure protocol-message
// constructors (hello/msgName/isValidMessage) and, when WebCrypto Ed25519 is
// available, the real challenge/response auth transcript (auth.mjs), the
// same primitives wsh's own client/server handshake is built from.
async function* suiteWsh(): AsyncGenerator<Assertion> {
  try {
    const {
      hello, msgName, isValidMessage, MSG,
      isEd25519Supported, generateKeyPair, signChallenge, verifyChallenge, generateNonce, fingerprint,
    } = await import('@johnhenry/wsh');
    const helloMsg = hello({ username: 'ada', authMethod: 'pubkey' });
    yield equal(helloMsg.type, MSG.HELLO, 'hello() builds a message tagged with MSG.HELLO');
    yield ok(isValidMessage(helloMsg), 'isValidMessage() recognizes a real constructed message');
    yield equal(msgName(MSG.HELLO), 'HELLO', 'msgName() reverse-maps the type number back to its constant name');
    if (!(await isEd25519Supported())) {
      yield pass('WebCrypto Ed25519 is unavailable in this browser; the auth-transcript round trip is skipped # SKIP no Ed25519 support');
      return;
    }
    const keyPair = await generateKeyPair();
    const sessionId = 'tester-session';
    const nonce = generateNonce();
    const { signature, publicKeyRaw } = await signChallenge(keyPair.privateKey, keyPair.publicKey, sessionId, nonce, { username: 'ada' });
    const verified = await verifyChallenge(keyPair.publicKey, signature, sessionId, nonce, { username: 'ada' });
    yield ok(verified, 'verifyChallenge() accepts the signature signChallenge() produced over the same transcript');
    const rejected = await verifyChallenge(keyPair.publicKey, signature, sessionId, generateNonce(), { username: 'ada' });
    yield notok(rejected, 'the same signature is rejected once the challenge transcript changes (a different nonce)');
    const fp = await fingerprint(publicKeyRaw);
    yield ok(typeof fp === 'string' && fp.length === 64, 'fingerprint() derives a 64-char hex SHA-256 digest of the raw public key');
  } catch (err) {
    yield fail(`wsh suite crashed before assertions ran: ${describeError(err)}`);
  }
}

// hostable's package entry, as published (no node: imports left -- see
// studio.ts's own module doc comment for the same finding). compile() lowers
// <Gateway>/<Host>/<Upstream> into a real servable dispatcher; <Host> is a
// real servable primitive matching on the *request's URL hostname* (a page
// can't set a Host header, so this is how hostname scoping works from
// fetch() -- also documented in studio.ts). No JSX/roomId: hostable isn't
// its own orrery planet, it's one of the three pipelines the "studio" planet
// runs (alongside fileable and servable).
async function* suiteHostable(): AsyncGenerator<Assertion> {
  try {
    const { compile, Gateway, Host, Route } = await import('@johnhenry/hostable');
    const tree = Gateway({
      children: Host({
        pattern: 'api.tester.invalid',
        children: Route({ path: '/ping', method: 'GET', handler: () => new globalThis.Response('pong') }),
      }),
    });
    const { fetch: dispatch, warnings } = await compile(tree);
    yield deepequal(warnings, [], 'compiling a one-Host, one-Route gateway produces no warnings');
    const matched = await dispatch(new Request('https://api.tester.invalid/ping'));
    yield equal(matched.status, 200, "a request whose URL hostname matches the <Host> pattern reaches its nested Route");
    const body = await matched.text();
    yield equal(body, 'pong', "the matched Route's handler body is returned verbatim");
    const missed = await dispatch(new Request('https://other.invalid/ping'));
    yield equal(missed.status, 404, 'the same path against a non-matching hostname falls through to the default 404 (the Host never claims it)');
  } catch (err) {
    yield fail(`hostable suite crashed before assertions ran: ${describeError(err)}`);
  }
}

// fileable's own "/browser" entry (issue #6): a verified browser-safe subset
// covering Build -> Resolve -> Layout -> Hash, stopping before the Node-only
// Write stage -- exactly the fallback shape the room brief points at
// (ecmanim/isomorphic-jj's "/browser"), except this one has a real,
// documented, non-JSX API (`File(props)`/`Dir(props)` build descriptors
// directly, no JSX runtime needed -- see components.js's own doc comment).
// No roomId: fileable isn't its own orrery planet either, see suiteHostable.
async function* suiteFileable(): AsyncGenerator<Assertion> {
  try {
    const { plan, File, Dir, toLockFileShape } = await import('@johnhenry/fileable/browser');
    const tree = Dir({
      name: 'site',
      children: [
        File({ name: 'index.html', children: '<h1>hi</h1>' }),
        File({ name: 'about.html', children: '<p>about</p>' }),
      ],
    });
    const first = await plan(tree);
    // plan()'s artifacts include the <Dir> itself (kind "dir") alongside its
    // two <File> children (kind "file") -- 3 artifacts total, confirmed by
    // inspecting a real plan() call's output before asserting on it.
    yield equal(first.artifacts.length, 3, 'plan() resolves the tree to 3 artifacts: the <Dir> itself plus its 2 <File> children (Build -> Resolve -> Layout -> Hash, no disk write)');
    yield equal(first.artifacts.filter((a) => a.kind === 'file').length, 2, 'exactly 2 of those artifacts are real files');
    yield ok(first.artifacts.every((a) => a.status === 'new'), 'with no previousLock, every artifact is classified "new"');
    const lock = toLockFileShape(first.artifacts);
    const second = await plan(tree, undefined, lock);
    yield ok(second.artifacts.every((a) => a.status === 'cached'), 're-planning the same tree against its own lock reclassifies every artifact as "cached" (unchanged content hash)');
  } catch (err) {
    yield fail(`fileable suite crashed before assertions ran: ${describeError(err)}`);
  }
}

// Demo suite for TAP's SKIP/TODO directives (encoded here as a "# TODO ..."
// / "# SKIP ..." suffix on the assertion message — the same trick
// TAPResultPass/Fail use to print "ok N - message # DIRECTIVE"). All-green by
// design: the default run must show 0 failures, so this only demonstrates
// the two passing directive forms, not an intentional `not ok`.
function* suiteDiagnostics(): Generator<Assertion> {
  yield pass('the TAP formatter round-trips ok/not-ok lines correctly');
  yield pass('rounding mode assumed to match Intl defaults # TODO pin Intl.NumberFormat rounding explicitly');
  yield pass('WebGPU timing precision check # SKIP no WebGPU context in this environment');
}

// One suite per planet, mapped to the registry id whose test badge it feeds.
const SUITES: Suite[] = [
  { id: 'signals', name: 'css-signals · createSignals() publishes a property', pkgName: '@johnhenry/css-signals', roomId: 'signals', run: suiteCssSignals },
  { id: 'spintax', name: 'spintax · count() & parse()', pkgName: '@johnhenry/spintax', roomId: 'spintax', run: suiteSpintax },
  { id: 'temporals', name: 'temporals · weekly recurrence length', pkgName: '@johnhenry/temporals', roomId: 'temporals', run: suiteTemporals },
  { id: 'hashish', name: 'hashish · near-duplicate search', pkgName: '@johnhenry/hashish', roomId: 'hashish', run: suiteHashish },
  { id: 'math', name: 'math · ComplexNumber, Rotor4, Symbolic', pkgName: '@johnhenry/math', roomId: 'math', run: suiteMath },
  { id: 'ecmanim', name: 'ecmanim · browser entry resolves', pkgName: '@johnhenry/ecmanim', roomId: 'ecmanim', run: suiteEcmanim },
  { id: 'jth', name: 'jth-compiler · compile + run "1 2 +"', pkgName: '@johnhenry/jth-compiler', roomId: 'jth', run: suiteJth },
  { id: 'iteration', name: 'iteration · map + take transducers', pkgName: '@johnhenry/iteration', roomId: 'iteration', run: suiteIteration },
  { id: 'chunker', name: 'semantic-chunker · sentence segmentation', pkgName: '@johnhenry/semantic-chunker', roomId: 'chunker', run: suiteChunker },
  { id: 'fields', name: 'http-fields · parse/serialize round-trip', pkgName: '@johnhenry/http-fields', roomId: 'fields', run: suiteHttpFields },
  { id: 'andbox', name: 'andbox · evaluate() in a Worker sandbox', pkgName: '@johnhenry/andbox', roomId: 'andbox', run: suiteAndbox },
  { id: 'signalle', name: 'signalle · signal() get/set/subscribe', pkgName: '@johnhenry/signalle', roomId: 'signalle', run: suiteSignalle },
  { id: 'domable', name: 'domable · textToDom / domToText round trip', pkgName: '@johnhenry/domable', roomId: 'domable', run: suiteDomable },
  { id: 'converter', name: 'http-converter · curl -> request', pkgName: '@johnhenry/http-converter', roomId: 'converter', run: suiteHttpConverter },
  { id: 'oat', name: 'oat-protocol · encode/decode a payload', pkgName: '@johnhenry/oat-protocol', roomId: 'oat', run: suiteOat },
  { id: 'mesh', name: 'browsermesh-primitives · identity generation', pkgName: '@johnhenry/browsermesh-primitives', roomId: 'mesh', run: suiteMesh },
  { id: 'raijin', name: 'raijin-core · a state-machine step', pkgName: '@johnhenry/raijin-core', roomId: 'raijin', run: suiteRaijin },
  { id: 'jj', name: 'isomorphic-jj · /browser module loads', pkgName: '@johnhenry/isomorphic-jj', roomId: 'jj', run: suiteJj },
  { id: 'studio', name: 'servable · one-route dispatcher responds', pkgName: '@johnhenry/servable', roomId: 'studio', run: suiteStudio },
  { id: 'mcpq', name: 'mcp-gate · policy allows/denies', pkgName: '@johnhenry/mcp-gate', roomId: 'mcpq', run: suiteMcpGate },
  { id: 'laya', name: 'laya · module loads', pkgName: '@johnhenry/laya', roomId: 'laya', run: suiteLaya },
  { id: 'circuit', name: 'circuit · tokens.css defines --hue', pkgName: '@erisera-code/circuit', roomId: 'circuit', run: suiteCircuit },
  { id: 'letterpress', name: 'letterpress · header-matched route request', pkgName: '@johnhenry/letterpress', roomId: 'letterpress', run: suiteLetterpress },
  { id: 'packfile', name: 'packfile · toArchive/fromArchive round trip', pkgName: '@johnhenry/packfile', roomId: 'packfile', run: suitePackfile },
  { id: 'obfo', name: 'obfo · read, fill and generate a form', pkgName: '@johnhenry/obfo', roomId: 'obfo', run: suiteObfo },
  { id: 'domkit', name: 'domkit · <code-editor> is form-associated', pkgName: '@johnhenry/domkit', roomId: 'domkit', run: suiteDomkit },
  { id: 'data-plot', name: 'data-plot · scales and readTable()', pkgName: '@johnhenry/data-plot', roomId: 'data-plot', run: suiteDataPlot },
  { id: 'tensor', name: 'math-plus-tensor-core · elementwise add', pkgName: '@johnhenry/math-plus-tensor-core', roomId: 'tensor', run: suiteTensor },
  { id: 'grapher', name: 'math-grapher · module loads', pkgName: '@johnhenry/math-grapher', roomId: 'grapher', run: suiteGrapher },
  { id: 'toolcode', name: 'aimatey-middleware-andbox · adaptPythonisms() on an f-string', pkgName: '@johnhenry/aimatey-middleware-andbox', roomId: 'toolcode', run: suiteToolcode },
  { id: 'objectify', name: 'objectify · no browser-safe entry (native better-sqlite3 dependency)', pkgName: '@johnhenry/objectify', roomId: 'objectify', run: suiteObjectify },
  { id: 'aimatey', name: 'aimatey-core · Router registers a backend and dispatches a request', pkgName: '@johnhenry/aimatey-core', roomId: 'aimatey', run: suiteAimatey },
  { id: 'leserve', name: 'leserve · compose + bearerAuth + respond (dependency-free middleware)', pkgName: '@johnhenry/leserve', roomId: 'leserve', run: suiteLeserve },
  { id: 'servant', name: 'servant · no browser-safe entry (Node http/ws only)', pkgName: '@johnhenry/servant', roomId: 'servant', run: suiteServant },
  { id: 'dialback', name: 'dialback/browsermesh · real Ed25519 identity handshake', pkgName: '@johnhenry/dialback', roomId: 'dialback', run: suiteDialback },
  { id: 'wsh', name: 'wsh · protocol messages + Ed25519 challenge/response', pkgName: '@johnhenry/wsh', roomId: 'wsh', run: suiteWsh },
  { id: 'afm', name: 'apple-foundation-models · no browser-safe entry (native Swift binary)', pkgName: '@johnhenry/apple-foundation-models', roomId: 'afm', run: suiteAfm },
  { id: 'hostable', name: 'hostable · Gateway/Host/Upstream lowers to a real dispatcher', pkgName: '@johnhenry/hostable', run: suiteHostable },
  { id: 'fileable', name: 'fileable/browser · plan() dry run (Build -> Resolve -> Layout -> Hash)', pkgName: '@johnhenry/fileable', run: suiteFileable },
  { id: 'diagnostics', name: 'diagnostics demo · SKIP/TODO directives', pkgName: '(meta)', run: suiteDiagnostics },
];

// Rendered verbatim in the collapsible <pre class="code"> "show source" panel.
const SUITE_SOURCE = SUITES.map((s) => s.run.toString()).join('\n\n');

// ---------------------------------------------------------------------------
// Terminal rendering: stream TAP lines with a typewriter effect, colorized.
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function classifyLine(line: string): string {
  if (/\S/.test(line) === false) return 'tap-diag';
  if (/#\s*(TODO|SKIP)\b/i.test(line) && /^(ok|not ok)\b/.test(line)) return 'tap-directive';
  if (/^not ok\b/.test(line)) return 'tap-notok';
  if (/^ok\b/.test(line)) return 'tap-ok';
  if (/^#/.test(line)) return 'tap-comment';
  if (/^\d+\.\.\d+/.test(line)) return 'tap-range';
  return 'tap-diag';
}

interface RunState {
  cancelled: boolean;
}

async function typeLine(term: HTMLElement, raw: string, state: RunState): Promise<void> {
  const cls = classifyLine(raw);
  const lineEl = document.createElement('span');
  lineEl.className = `tap-line ${cls}`;
  term.appendChild(lineEl);
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  term.appendChild(cursor);

  const text = raw.length ? raw : ' ';
  const ticks = Math.min(40, text.length) || 1;
  const step = Math.max(1, Math.ceil(text.length / ticks));
  for (let i = step; i < text.length; i += step) {
    if (state.cancelled) break;
    lineEl.textContent = text.slice(0, i);
    term.scrollTop = term.scrollHeight;
    await sleep(4);
  }
  lineEl.textContent = text;
  cursor.remove();
  // NOTE: no trailing <br> here -- .tap-line is already display:block, so each line
  // is its own box. Appending a <br> too used to double every line's vertical gap.
  term.scrollTop = term.scrollHeight;
}

function addTimingRow(el: HTMLElement, name: string, ms: number, passed: boolean): void {
  const row = document.createElement('div');
  row.className = `timing-row${passed ? '' : ' fail'}`;
  const nameEl = document.createElement('span');
  nameEl.className = 'name';
  nameEl.textContent = name;
  const msEl = document.createElement('span');
  msEl.className = 'ms';
  msEl.textContent = `${ms.toFixed(1)}ms`;
  row.append(nameEl, msEl);
  el.appendChild(row);
}

function renderSummary(el: HTMLElement, tests: number, passed: number, failed: number, ms: number): void {
  el.innerHTML = '';
  const chips: Array<[string, string]> = [
    ['pass', `${passed} pass`],
    ['fail', `${failed} fail`],
    ['skip', `${tests} total · ${ms.toFixed(0)}ms`],
  ];
  for (const [cls, text] of chips) {
    const chip = document.createElement('span');
    chip.className = `chip ${cls}`;
    chip.textContent = text;
    el.appendChild(chip);
  }
}

async function streamTapDocument(
  term: HTMLElement,
  timingsEl: HTMLElement,
  testFn: TestFn,
  title: string,
  state: RunState,
): Promise<{ pass: number; fail: number; ms: number }> {
  const t0 = performance.now();
  let suitePass = 0;
  let suiteFail = 0;
  try {
    for await (const output of run(testFn, title, TAPResultPass, TAPResultFail, TAPResultCounts, TAPResultRange)) {
      if (state.cancelled) break;
      const text = typeof output === 'string' ? output : String(output);
      for (const sub of text.split('\n')) {
        if (/^ok\b/.test(sub)) suitePass++;
        else if (/^not ok\b/.test(sub)) suiteFail++;
        await typeLine(term, sub, state);
      }
    }
  } catch (err) {
    suiteFail++;
    await typeLine(term, `not ok - ${title} crashed: ${describeError(err)}`, state);
  }
  const ms = performance.now() - t0;
  addTimingRow(timingsEl, title, ms, suiteFail === 0);
  return { pass: suitePass, fail: suiteFail, ms };
}

// ---------------------------------------------------------------------------
// Custom test compiler: the textarea body becomes the body of an async
// generator function, compiled via `new AsyncFunction`.
// ---------------------------------------------------------------------------

const ASSERTION_NAMES = [
  'ok', 'notok', 'equal', 'notequal', 'deepequal', 'deepdeepequal',
  'pass', 'fail', 'subtestpass', 'subtestfail', 'throws', 'doesnotthrow',
];
const ASSERTION_FNS = [
  ok, notok, equal, notequal, deepequal, deepdeepequal,
  pass, fail, subtestpass, subtestfail, throws, doesnotthrow,
];

const AsyncFunctionCtor = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...fnArgs: unknown[]) => Promise<unknown>;

async function compileCustomTest(code: string): Promise<TestFn> {
  // `new AsyncFunction` compiles a wrapper whose body *constructs* an async
  // generator function (ordinary `function*` syntax, `async` prefixed) out of
  // the user's code and returns it — the returned function is what actually
  // runs the user's `yield ok(...)` statements.
  const factory = new AsyncFunctionCtor(
    ...ASSERTION_NAMES,
    `return (async function* (plan) {\n${code}\n});`,
  );
  const genFn = (await factory(...ASSERTION_FNS)) as TestFn;
  return genFn;
}

const DEFAULT_CUSTOM_TEST = `plan(2);
yield equal(1 + 1, 2, "1 + 1 is 2");
yield ok("tester".length === 6, "'tester' has 6 characters");`;

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------

const playground: Playground = {
  id: 'tester',
  title: 'Tester Console',
  pkg: '@johnhenry/tester',
  hue: 120,
  blurb: 'Generator-function tests emitting TAP, executed in the browser against this very site.',
  docs: 'https://opensource.johnhenry.me/tester/',
  mount(host) {
    const filterOptions = SUITES.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    host.innerHTML = `
      <div class="pg-tester">
        <div class="tester-grid">
          <div class="panel">
            <div class="terminal-head">
              <h2>Built-in suite</h2>
              <select class="btn" id="tester-filter" aria-label="Filter to one planet's suite">
                <option value="">All planets (run all)</option>
                ${filterOptions}
              </select>
              <button class="btn primary" type="button" data-action="run-suite">Run</button>
              <button class="btn" type="button" data-action="clear-suite">Clear</button>
            </div>
            <div class="term" id="tester-term" role="log" aria-live="polite"></div>
            <div class="summary-bar" id="tester-summary"></div>
            <div class="timings" id="tester-timings"></div>
          </div>

          <div class="panel">
            <div class="terminal-head">
              <h2>Write your own test</h2>
              <button class="btn primary" type="button" data-action="run-custom">Run</button>
            </div>
            <p class="custom-hint">
              Generator-body syntax: this becomes the inside of an async generator
              function. <code>yield</code> an assertion result; the same
              <code>plan(n)</code> and assertion helpers (ok, notok, equal, notequal,
              deepequal, deepdeepequal, pass, fail, subtestpass, subtestfail, throws,
              doesnotthrow) are in scope.
            </p>
            <textarea class="code" id="tester-custom-input" spellcheck="false">${DEFAULT_CUSTOM_TEST}</textarea>
            <div class="custom-actions">
              <span class="stat" id="tester-custom-status"></span>
            </div>
            <div class="term" id="tester-custom-term" role="log" aria-live="polite" style="max-height: 220px; margin-top: 10px;"><span class="tap-line tap-diag">press Run to execute this test &rarr;</span></div>
          </div>
        </div>

        <div class="panel">
          <details class="source">
            <summary>Show source of the built-in suite</summary>
            <pre class="code">${escapeHtml(SUITE_SOURCE)}</pre>
          </details>
        </div>
      </div>
    `;

    const term = host.querySelector<HTMLElement>('#tester-term')!;
    const timingsEl = host.querySelector<HTMLElement>('#tester-timings')!;
    const summaryEl = host.querySelector<HTMLElement>('#tester-summary')!;
    const customTerm = host.querySelector<HTMLElement>('#tester-custom-term')!;
    const customInput = host.querySelector<HTMLTextAreaElement>('#tester-custom-input')!;
    const customStatus = host.querySelector<HTMLElement>('#tester-custom-status')!;
    const filterSelect = host.querySelector<HTMLSelectElement>('#tester-filter')!;
    const runSuiteBtn = host.querySelector<HTMLButtonElement>('[data-action="run-suite"]')!;
    const clearSuiteBtn = host.querySelector<HTMLButtonElement>('[data-action="clear-suite"]')!;
    const runCustomBtn = host.querySelector<HTMLButtonElement>('[data-action="run-custom"]')!;

    let suiteState: RunState = { cancelled: false };
    let customState: RunState = { cancelled: false };
    let suiteRunning = false;
    let customRunning = false;

    async function runSuites(filterId: string): Promise<void> {
      if (suiteRunning) return;
      suiteState.cancelled = true; // cancel any previous in-flight run
      suiteState = { cancelled: false };
      const state = suiteState;
      suiteRunning = true;
      runSuiteBtn.disabled = true;
      term.innerHTML = '';
      timingsEl.innerHTML = '';
      summaryEl.innerHTML = '';
      const toRun = filterId ? SUITES.filter((s) => s.id === filterId) : SUITES;
      const t0 = performance.now();
      await typeLine(term, 'TAP version 13', state);
      let totalPass = 0;
      let totalFail = 0;
      let totalTests = 0;
      // roadmap 4.5 (CI badge): per-suite tallies, folded into the completion
      // marker below so a headless script driving ?autorun=1 can read the
      // whole run's results back in one page.evaluate() call, no DOM/TAP
      // scraping needed.
      const suiteResults: Array<{ id: string; roomId?: string; pass: number; fail: number }> = [];
      for (const suite of toRun) {
        if (state.cancelled) break;
        const { pass: p, fail: f } = await streamTapDocument(
          term,
          timingsEl,
          suite.run,
          `${suite.name} (${suite.pkgName})`,
          state,
        );
        totalPass += p;
        totalFail += f;
        totalTests += p + f;
        suiteResults.push({ id: suite.id, roomId: suite.roomId, pass: p, fail: f });
        if (suite.roomId) setRoomTests(suite.roomId, { pass: p, fail: f });
        if (!state.cancelled) await typeLine(term, '', state);
      }
      if (!state.cancelled) {
        const ms = performance.now() - t0;
        renderSummary(summaryEl, totalTests, totalPass, totalFail, ms);
        // Minimal completion marker for build-time headless runs (roadmap
        // 4.5): scripts/run-tests-headless.mjs polls for this global via
        // page.waitForFunction() instead of guessing a timeout.
        (window as unknown as { __ORRERY_TESTER_DONE__?: TesterRunResult }).__ORRERY_TESTER_DONE__ = {
          at: Date.now(),
          ms,
          tests: totalTests,
          pass: totalPass,
          fail: totalFail,
          suites: suiteResults,
        };
      }
      suiteRunning = false;
      runSuiteBtn.disabled = false;
    }

    async function runCustomTest(): Promise<void> {
      if (customRunning) return;
      customState.cancelled = true;
      customState = { cancelled: false };
      const state = customState;
      customRunning = true;
      runCustomBtn.disabled = true;
      customTerm.innerHTML = '';
      customStatus.textContent = 'compiling…';
      try {
        const testFn = await compileCustomTest(customInput.value);
        customStatus.textContent = 'running…';
        await typeLine(customTerm, 'TAP version 13', state);
        const { pass: p, fail: f, ms } = await streamTapDocument(
          customTerm,
          timingsEl,
          testFn,
          'custom test',
          state,
        );
        customStatus.textContent = `${p} pass · ${f} fail · ${ms.toFixed(1)}ms`;
      } catch (err) {
        customStatus.textContent = 'compile error';
        const pre = document.createElement('pre');
        pre.className = 'code';
        pre.style.color = '#ff5f70';
        pre.textContent = describeError(err);
        customTerm.appendChild(pre);
      }
      customRunning = false;
      runCustomBtn.disabled = false;
    }

    const onRunSuite = () => { void runSuites(filterSelect.value); };
    const onClearSuite = () => {
      suiteState.cancelled = true;
      term.innerHTML = '';
      timingsEl.innerHTML = '';
      summaryEl.innerHTML = '';
    };
    const onRunCustom = () => { void runCustomTest(); };

    runSuiteBtn.addEventListener('click', onRunSuite);
    clearSuiteBtn.addEventListener('click', onClearSuite);
    runCustomBtn.addEventListener('click', onRunCustom);

    // ?autorun deep link (P0.5 / roadmap 4.5): a future CI badge drives
    // headless Chrome to `#/tester?autorun=1` (optionally `&filterId=<suite
    // id>` to narrow to one planet's suite) at build time and needs the run
    // to start with no click. Reuses the exact same runSuites() the Run
    // button's own handler calls above -- no duplicated run logic -- so
    // results land in the same places a headless script can read them back
    // from afterward: the TAP lines typed into #tester-term, the summary
    // chips in #tester-summary, and setRoomTests()'s per-planet badges in
    // localStorage.
    const linkState = readState({ autorun: false, filterId: '' });
    const linkFilter = linkState.filterId && SUITES.some((s) => s.id === linkState.filterId) ? linkState.filterId : '';
    if (linkFilter) filterSelect.value = linkFilter;

    // Ship a working default state with zero input: run every suite once,
    // against every planet, so home-page badges are populated immediately.
    // ?autorun=1 confirms this same call and additionally narrows it to
    // &filterId, per the deep link above.
    void runSuites(linkState.autorun ? linkFilter : '');

    return () => {
      suiteState.cancelled = true;
      customState.cancelled = true;
      runSuiteBtn.removeEventListener('click', onRunSuite);
      clearSuiteBtn.removeEventListener('click', onClearSuite);
      runCustomBtn.removeEventListener('click', onRunCustom);
    };
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default playground;
