export const id = 'switchboard';
export const describe = 'agent-card probe + a two-turn task endpoint (submitted -> input-required -> completed) for the Agent Protocols Switchboard room';

// The switchboard room's A2A-ish lane is a hand-rolled stand-in when this companion isn't
// running (no @johnhenry/a2a-query / @agentclientprotocol/sdk installed in this build — see
// ROADMAP.md 2.1's own risk note about two agent-query-core copies). When the companion IS
// running, "run via companion" round-trips to this real second process instead, which is the
// honest thing an A2A-style agent card + task lifecycle actually looks like: a server the
// browser doesn't control, reached over HTTP.
const CARD = {
  protocol: 'a2a-ish/0 (hand-rolled shape, not the @a2a-js/sdk wire format)',
  id: 'orrery-companion-agent',
  name: 'Orrery Companion Agent',
  version: '1.0.0',
  skills: [
    { id: 'echo', description: 'Echoes the task prompt back, upper-cased.' },
    { id: 'weather', description: 'Answers a weather question. Asks for a city if the prompt does not name one (an input-required turn).' },
  ],
  capabilities: { streaming: false, pushNotifications: false },
};

export function mount(app) {
  const tasks = new Map(); // id -> { prompt }
  let seq = 0;
  const json = (obj, status = 200) => new Response(JSON.stringify(obj, null, 2), { status, headers: { 'content-type': 'application/json' } });

  app.route('GET', '/switchboard/agent-card', () => json(CARD));

  app.route('POST', '/switchboard/task', async (req) => {
    let body = {};
    try { body = await req.json(); } catch {}
    const prompt = String(body.prompt ?? '').trim();
    const taskId = `task-${Date.now()}-${++seq}`;
    const needsCity = /weather/i.test(prompt) && !/\bin\s+\w+/i.test(prompt);
    if (needsCity) {
      tasks.set(taskId, { prompt });
      return json({ id: taskId, status: { state: 'input-required' }, prompt: 'Which city?' });
    }
    const reply = prompt ? `${prompt.toUpperCase()} — handled by the real companion process (pid ${process.pid}).` : `(empty prompt) — handled by the real companion process (pid ${process.pid}).`;
    return json({ id: taskId, status: { state: 'completed' }, artifacts: [{ text: reply }] });
  });

  app.route('POST', /^\/switchboard\/task\/(?<id>[^/]+)\/input$/, async (req, params) => {
    const t = tasks.get(params.id);
    if (!t) return json({ error: `unknown task ${params.id}` }, 404);
    let body = {};
    try { body = await req.json(); } catch {}
    const city = String(body.answer ?? '').trim() || 'somewhere';
    tasks.delete(params.id);
    return json({ id: params.id, status: { state: 'completed' }, artifacts: [{ text: `Weather in ${city}: clear and pleasant (simulated, pid ${process.pid}).` }] });
  });
}
