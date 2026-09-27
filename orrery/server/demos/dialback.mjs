/**
 * dialback — the REAL @johnhenry/dialback Server, living inside the companion.
 *
 *   agents dial OUT to   ws://localhost:7777/dialback/agent      (the browser tab is the Agent)
 *   public traffic hits  http://localhost:7777/dialback/<agentId>/<path>
 *                         → server.fetch(request) → down that agent's socket → its (Request)=>Response
 *   GET /dialback/agents lists who is dialled in right now.
 *
 * One Server per agent connection, so a URL can address one specific tab by the id it
 * announced in its handshake (a single shared Server would pick by `strategy` instead).
 * Agents authenticate with the shared secret below (Server's `secret` option).
 */
import { Server } from '@johnhenry/dialback';

export const id = 'dialback';
export const describe = 'dialback Server: agents dial ws /dialback/agent, public traffic at /dialback/<agentId>/… is tunnelled back to them';

export const SECRET = 'orrery-dialback';
const TIMEOUT_MS = 15000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'content-type': 'application/json' } });

export function mount(app) {
  /** @type {Map<string, { server: Server, ws: any, connectedAt: number, served: number, origin: string }>} */
  const agents = new Map();

  app.ws('/dialback/agent', (ws, req) => {
    const server = new Server(
      () => new Response('agent has not finished its handshake', { status: 503 }),
      { secret: SECRET },
    );
    server.addConnection(ws);
    let agentId = null;
    // The Server records the agent id from the handshake itself (getConnectionById);
    // we peek the same first message so we can index this Server by that id.
    const onFirst = (raw) => {
      try {
        const m = JSON.parse(String(raw));
        if (m.kind !== 'agent') return;
        ws.off('message', onFirst);
        // Let the Server process (and possibly reject) the handshake first.
        setTimeout(() => {
          if (!server.getConnectionById(m.agent)) return; // bad secret → Server closed it
          agentId = m.agent;
          agents.set(agentId, { server, ws, connectedAt: Date.now(), served: 0, origin: req.headers.origin || '' });
          ws.send(JSON.stringify({ kind: 'orrery:welcome', agent: agentId }));
        }, 0);
      } catch {}
    };
    ws.on('message', onFirst);
    ws.on('close', () => {
      server.removeConnection(ws);
      if (agentId && agents.get(agentId)?.ws === ws) agents.delete(agentId);
    });
  });

  app.route('GET', '/dialback/agents', () =>
    json({
      secret: 'shared-secret handshake (Server `secret` option)',
      agents: [...agents].map(([id, a]) => ({ id, connectedAt: new Date(a.connectedAt).toISOString(), served: a.served, origin: a.origin })),
    }));

  app.route('*', /^\/dialback\/(?<agent>[^/]+)(?<rest>\/.*)?$/, async (request, params) => {
    const a = agents.get(params.agent);
    if (!a) return json({ error: `no agent '${params.agent}' is dialled in`, agents: [...agents.keys()] }, 404);
    const inUrl = new URL(request.url);
    const target = new URL((params.rest || '/') + inUrl.search, inUrl.origin);
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-prefix', `/dialback/${params.agent}`);
    headers.set('x-dialback-via', 'orrery-companion');
    const init = { method: request.method, headers };
    if (!['GET', 'HEAD'].includes(request.method)) { init.body = request.body; init.duplex = 'half'; }
    const tunnelled = new Request(target, init);
    a.served++;
    let timer;
    const timeout = new Promise((res) => {
      timer = setTimeout(() => res(new Response(`agent ${params.agent} did not answer within ${TIMEOUT_MS} ms`, { status: 504 })), TIMEOUT_MS);
    });
    try {
      const res = await Promise.race([a.server.fetch(tunnelled), timeout]);
      const out = new Headers(res.headers);
      out.set('x-dialback-agent', params.agent);
      out.delete('content-length');
      out.delete('content-encoding');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
    } catch (e) {
      return new Response(`tunnel error: ${e?.message || e}`, { status: 502 });
    } finally {
      clearTimeout(timer);
    }
  });
}
