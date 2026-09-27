export const id = 'hello';
export const describe = 'sanity route so planets can verify the companion answers';
export function mount(app) {
  app.route('GET', '/hello', () => new Response(JSON.stringify({ ok: true, at: Date.now() }), { headers: { 'content-type': 'application/json' } }));
  app.ws('/hello', (ws) => { ws.on('message', (m) => ws.send(`echo:${m}`)); ws.send('hello from the companion'); });
}
