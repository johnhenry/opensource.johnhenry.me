// Companion demo for the "Objectify Bench" planet — a REAL
// @johnhenry/objectify store (TypeScript adapter over better-sqlite3),
// mounted on routes under /objectify/* on the companion itself (:7777).
//
// Scope, and why: @johnhenry/objectify's ObjectRef.call(method, input) is
// real too, but it executes class methods by writing a temp Deno/Python
// runner and spawning a subprocess against a .ts/.py file on disk that
// injects `this.get()`/`this.set()` (see its README's "Class methods"
// section and dist/runner.js) — a get/set *protocol* the class body must
// call explicitly. The planet's browser-side class editor teaches plain
// field mutation (`this.tasks = [...]`), which is the whole pedagogical
// point of that panel; a class written that way never calls the injected
// `set()`, so nothing would ever persist through a real `.call()`. Bridging
// the two would mean either rewriting the teaching examples around an
// async get/set idiom (defeats the panel) or building a state-mutation
// -> set() compatibility shim (real project, not a half-day fix). So
// class *method execution* stays the in-page JS-reflection emulation it
// already was, unconditionally, on every load.
//
// What IS real here: object creation, versioning, get/set of raw JSON
// state, log, diff, rewind and fork — the actual value proposition of the
// npm package — all running against a real SQLite file via better-sqlite3,
// no Deno/Rust CLI/store-init step required (Objectify() with an explicit
// `dir` just opens-or-creates the SQLite file and schema, see dist/db.js
// openDb()). When the companion is live, the planet's terminal calls these
// routes for every command except a method call; when a method call does
// change state, the planet PUTs the resulting state back through
// PUT /objectify/objects/:id/state so the version history — log/diff/
// rewind/fork — is genuinely backed by the real package, not localStorage.
// One faithful limitation: ObjectRef.set() always logs its event as method
// "set" (see dist/db.js writeEvent call inside object-ref.js), so a real
// log entry produced this way shows "set", not the original method name —
// the planet's banner says so.
import { Objectify } from '@johnhenry/objectify';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const id = 'objectify';
export const describe = 'real @johnhenry/objectify SQLite store — create/list/inspect/destroy/get/set/log/diff/rewind/fork; class-method execution stays in-page (see comment)';

let store;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
function fail(err, status = 400) {
  return json({ error: err instanceof Error ? err.message : String(err) }, status);
}

export function mount(app) {
  const dir = mkdtempSync(join(tmpdir(), 'orrery-objectify-'));
  store = new Objectify({ dir }); // no .objectify/ or `objectify init` needed: openDb() creates the schema itself

  app.route('GET', '/objectify/status', () => json({ ok: true, dir }));

  app.route('POST', '/objectify/objects', async (request) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body is fine, all fields optional */ }
    try {
      const id = store.create({ description: body?.description, class: body?.class });
      return json({ id });
    } catch (err) { return fail(err); }
  });

  app.route('GET', '/objectify/objects', () => {
    try { return json(store.list()); } catch (err) { return fail(err); }
  });

  app.route('GET', /^\/objectify\/objects\/(?<id>[^/]+)$/, (_request, params) => {
    try { return json(store.inspect(params.id)); } catch (err) { return fail(err, 404); }
  });

  app.route('DELETE', /^\/objectify\/objects\/(?<id>[^/]+)$/, (_request, params) => {
    try { store.destroy(params.id); return json({ destroyed: params.id }); } catch (err) { return fail(err, 404); }
  });

  app.route('GET', /^\/objectify\/objects\/(?<id>[^/]+)\/state$/, (request, params) => {
    try {
      const url = new URL(request.url);
      const v = url.searchParams.get('version');
      const ref = store.use(params.id);
      return json(ref.get(v ? Number(v) : undefined));
    } catch (err) { return fail(err, 404); }
  });

  app.route('PUT', /^\/objectify\/objects\/(?<id>[^/]+)\/state$/, async (request, params) => {
    let state;
    try { state = await request.json(); } catch { return fail('body must be JSON (the new state value)'); }
    try {
      const ref = store.use(params.id);
      ref.set(state);
      return json(ref.get());
    } catch (err) { return fail(err); }
  });

  app.route('GET', /^\/objectify\/objects\/(?<id>[^/]+)\/log$/, (_request, params) => {
    try { return json(store.use(params.id).log()); } catch (err) { return fail(err, 404); }
  });

  app.route('GET', /^\/objectify\/objects\/(?<id>[^/]+)\/diff$/, (request, params) => {
    try {
      const url = new URL(request.url);
      const v1 = Number(url.searchParams.get('v1'));
      const v2 = Number(url.searchParams.get('v2'));
      if (!Number.isFinite(v1) || !Number.isFinite(v2)) return fail('query params v1 and v2 (version numbers) are required');
      return json(store.use(params.id).diff(v1, v2));
    } catch (err) {
      // A version-1 "create" event has null state; fast-json-patch's compare()
      // throws a raw TypeError comparing null against an object rather than a
      // clean Error — translate it into an honest message instead of a 500.
      const msg = err instanceof TypeError
        ? 'no diff available: version 1 ("create") has no state yet — diff from version 2 onward'
        : err;
      return fail(msg);
    }
  });

  app.route('POST', /^\/objectify\/objects\/(?<id>[^/]+)\/rewind$/, async (request, params) => {
    let body;
    try { body = await request.json(); } catch { return fail('body must be JSON: {"version": <number>}'); }
    try { return json(store.use(params.id).rewind(Number(body?.version))); } catch (err) { return fail(err); }
  });

  app.route('POST', /^\/objectify\/objects\/(?<id>[^/]+)\/fork$/, async (request, params) => {
    let body = {};
    try { body = await request.json(); } catch { /* {} -> fork at the latest version */ }
    try {
      const at = body?.at === undefined || body?.at === null ? undefined : Number(body.at);
      return json({ id: store.use(params.id).fork(at === undefined ? undefined : { at }) });
    } catch (err) { return fail(err); }
  });
}
