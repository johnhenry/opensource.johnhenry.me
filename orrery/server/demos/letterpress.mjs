import { createRouter } from '@johnhenry/letterpress';

export const id = 'letterpress';
export const describe = 'the same REST-ish notes preset the planet ships, served for real over HTTP under /letterpress/*';

/**
 * @johnhenry/letterpress does not export a `serve` function, and
 * @johnhenry/leserve's `serve()` binds its own http(s) server — it can't
 * share the companion's single listener on port 7777. So per the planet's
 * README instructions, the router is mounted directly on the companion's
 * own dispatcher via a wildcard route, with the `/letterpress` prefix
 * stripped before the request reaches the router (whose patterns — GET
 * /notes, GET /notes/:id, … — are the exact same literals the in-page
 * "REST-ish notes API" preset compiles from `new Function`).
 */
export function mount(app) {
  const notes = [
    { id: '1', title: 'Fix the press', body: 'Realign the platen before the next run.' },
    { id: '2', title: 'Order more ink', body: 'A fresh drum of black is due Friday.' },
  ];
  let nextId = 3;
  const json = (data, init) => new Response(JSON.stringify(data, null, 2), { ...init, headers: { 'Content-Type': 'application/json', ...(init && init.headers) } });

  const router = createRouter({
    errorHandler: (error) => json({ error: String((error && error.message) || error) }, { status: 500 }),
  });

  router.endpoint`GET /notes`(() => json(notes));

  router.endpoint`POST /notes`(async (request) => {
    const body = await request.json().catch(() => ({}));
    const note = { id: String(nextId++), title: body.title || 'Untitled', body: body.body || '' };
    notes.push(note);
    return json(note, { status: 201 });
  });

  router.endpoint`GET /notes/:id`((request, { params }) => {
    const note = notes.find((n) => n.id === params.id);
    return note ? json(note) : json({ error: 'not found' }, { status: 404 });
  });

  router.endpoint`PUT /notes/:id`(async (request, { params }) => {
    const note = notes.find((n) => n.id === params.id);
    if (!note) return json({ error: 'not found' }, { status: 404 });
    Object.assign(note, await request.json().catch(() => ({})));
    return json(note);
  });

  router.endpoint`DELETE /notes/:id`((request, { params }) => {
    const i = notes.findIndex((n) => n.id === params.id);
    if (i === -1) return json({ error: 'not found' }, { status: 404 });
    notes.splice(i, 1);
    return new Response(null, { status: 204 });
  });

  app.route('*', /^\/letterpress\/.*/, async (request) => {
    const url = new URL(request.url);
    const innerPath = url.pathname.replace(/^\/letterpress/, '') || '/';
    const innerUrl = new URL(innerPath + (url.search || ''), url.origin);
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
    const innerRequest = new Request(innerUrl, { method: request.method, headers: request.headers, body });
    return router(innerRequest);
  });
}
