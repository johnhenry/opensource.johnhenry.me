import os from 'node:os';

export const id = 'afm';
export const describe =
  "Apple's on-device FoundationModels LLM (@johnhenry/apple-foundation-models) — needs macOS 26 Tahoe, Apple Silicon, Apple Intelligence enabled, and the package installed here";

const PKG = '@johnhenry/apple-foundation-models';

// Lazy + cached: never import at module top level, so the companion still
// boots (and every OTHER demo still mounts) on machines/Node versions where
// this package can't even be resolved.
let libPromise = null;
function loadLib() {
  if (!libPromise) {
    libPromise = import(PKG).then(
      (mod) => ({ mod, error: null }),
      (error) => ({ mod: null, error }),
    );
  }
  return libPromise;
}

function osInfo() {
  return { platform: process.platform, arch: process.arch, release: os.release(), node: process.version };
}

function reasonFor(error) {
  const msg = String(error?.message || error || '');
  if (process.platform !== 'darwin') return 'wrong-os';
  if (process.arch !== 'arm64') return 'wrong-arch';
  if (/Cannot find (package|module)/i.test(msg)) return 'not-installed';
  return 'import-error';
}

async function statusPayload() {
  const osi = osInfo();
  if (process.platform !== 'darwin') return { available: false, reason: 'wrong-os', os: osi, error: null, availability: null };
  if (process.arch !== 'arm64') return { available: false, reason: 'wrong-arch', os: osi, error: null, availability: null };
  const { mod, error } = await loadLib();
  if (!mod) return { available: false, reason: reasonFor(error), os: osi, error: String(error?.message || error), availability: null };
  try {
    const model = mod.SystemLanguageModel.default;
    const availability = model.availability;
    return { available: model.isAvailable, reason: model.isAvailable ? null : String(availability), os: osi, error: null, availability };
  } catch (e) {
    return { available: false, reason: 'runtime-error', os: osi, error: String(e?.message || e), availability: null };
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function samplingFor(mod, name) {
  if (!name) return undefined;
  return name === 'random' ? mod.SamplingMode.Random : mod.SamplingMode.Greedy;
}

export function mount(app) {
  app.route('GET', '/afm/status', async () => json(await statusPayload()));

  app.route('POST', '/afm/chat', async (request) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body */ }
    const { messages = [], options = {} } = body || {};

    const { mod, error } = await loadLib();
    if (!mod) return json({ error: 'framework unavailable', reason: reasonFor(error), detail: String(error?.message || error) }, 503);

    const { SystemLanguageModel, LanguageModelSession, Instructions } = mod;
    const model = SystemLanguageModel.default;
    if (!model.isAvailable) return json({ error: 'model unavailable', availability: model.availability }, 503);

    const sys = messages.find((m) => m?.role === 'system')?.content ?? options.instructions;
    const session = new LanguageModelSession(model, undefined, [], sys ? new Instructions(sys) : undefined);
    const genOptions = {};
    if (options.temperature != null) genOptions.temperature = Number(options.temperature);
    if (options.maximumResponseTokens != null) genOptions.maximumResponseTokens = Number(options.maximumResponseTokens);
    const sampling = samplingFor(mod, options.sampling);
    if (sampling != null) genOptions.sampling = sampling;
    const hasOptions = Object.keys(genOptions).length > 0;

    try {
      const userTurns = messages.filter((m) => m?.role === 'user');
      if (userTurns.length === 0) throw new Error('messages[] must include at least one {role:"user"}');
      let response;
      for (const turn of userTurns) {
        response = hasOptions ? await session.respond(turn.content, genOptions) : await session.respond(turn.content);
      }
      return json({ content: response.content, transcriptEntries: response.transcriptEntries });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    } finally {
      await session.close();
    }
  });

  app.ws('/afm/stream', (ws) => {
    ws.on('message', async (raw) => {
      let body = {};
      try { body = JSON.parse(String(raw)); } catch { ws.send(JSON.stringify({ type: 'error', error: 'bad JSON frame' })); return; }
      const { messages = [], options = {} } = body || {};

      const { mod, error } = await loadLib();
      if (!mod) { ws.send(JSON.stringify({ type: 'error', error: 'framework unavailable', reason: reasonFor(error), detail: String(error?.message || error) })); return; }

      const { SystemLanguageModel, LanguageModelSession, Instructions } = mod;
      const model = SystemLanguageModel.default;
      if (!model.isAvailable) { ws.send(JSON.stringify({ type: 'error', error: 'model unavailable', availability: model.availability })); return; }

      const sys = messages.find((m) => m?.role === 'system')?.content ?? options.instructions;
      const session = new LanguageModelSession(model, undefined, [], sys ? new Instructions(sys) : undefined);
      const userTurns = messages.filter((m) => m?.role === 'user');
      if (userTurns.length === 0) { ws.send(JSON.stringify({ type: 'error', error: 'messages[] must include at least one {role:"user"}' })); return; }
      const last = userTurns[userTurns.length - 1];

      try {
        // Replay earlier turns (non-streamed) so the session's transcript/context
        // actually contains them, then stream only the final turn.
        for (const turn of userTurns.slice(0, -1)) await session.respond(turn.content);
        ws.send(JSON.stringify({ type: 'start' }));
        for await (const chunk of session.streamResponse(last.content)) {
          ws.send(JSON.stringify({ type: 'chunk', text: chunk }));
        }
        ws.send(JSON.stringify({ type: 'done' }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', error: String(e?.message || e) }));
      } finally {
        await session.close();
      }
    });
  });
}
