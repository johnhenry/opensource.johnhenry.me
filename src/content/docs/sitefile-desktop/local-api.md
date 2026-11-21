---
title: "Local service API"
description: "The HTTP and server-sent-events service behind the web UI."
sidebar:
  order: 9
---

`sfd-service` (binary `sitefile-desktop-service`) exposes the `sfd_core::Backend`
contract over HTTP on `127.0.0.1`, for the web UI. It serves any
`Arc<dyn Backend>`; the binary gives it `sfd-local`'s. It is stateless: starting
or stopping it never calls the backend, so it never touches servers or the
store. Types are the `sfd-core` ones, serialized with serde as written there.

## Starting it

```sh
scripts/web-build.sh                       # the web UI, into dist/web/
sitefile-desktop-service --open            # prints and opens http://127.0.0.1:<port>/#token=…
sitefile-desktop-service --demo --open     # made-up data, no SITEFILE_HOME
```

| Flag | Meaning |
|---|---|
| `--port N` | Port on `127.0.0.1`. Default 0: any free port. The address is always loopback. |
| `--idle-timeout S` | Exit after S seconds with no requests and no open event streams. Default 0: never. Podman's `podman system service --time`. |
| `--web-dir DIR` | The web build. Default: `$SFD_WEB_DIR`, else the first `dist/web` beside the executable or in an ancestor of it, else `./dist/web`. Without one, `/` says how to build it. |
| `--open` | Open the URL in the default browser. |
| `--demo` | Serve `sfd_service::demo::DemoBackend` (in memory) instead of the real backend. |
| `--sitefile-only` | Serve sitefile's operations only (see the split below). |

Its first line on stdout is the URL, token included, for whatever launched it.
The binary also handles `__serve-worker <id>` first thing, like every binary that
can start a server (docs/dev/PLAN.md §1).

As a library: `sfd_service::run(backend, ServiceOptions, on_ready)` blocks;
`Service::bind(backend, options).await` then `.url()`, `.token()`,
`.shutdown_handle()` and `.serve().await` for async callers.

## Endpoints

All `/api/` responses are JSON, carry `Cache-Control: no-store`, and never carry
CORS headers.

### `POST /api/v1/call`

Body: one `Request`, e.g. `{"op":"list_servers","all":true}`.

Reply `200`: a `CallResult`, serde's encoding of `Result<Response, ApiError>`:

```json
{"Ok":{"kind":"servers","data":[{"id":"s1","name":"docs","status":"running", "…": "…"}]}}
{"Err":{"code":"E_NOT_FOUND","message":"no server s9"}}
```

A backend error is still a `200` with `Err`. Transport problems are not:

| Status | Body `code` | When |
|---|---|---|
| 400 | `E_BAD_REQUEST` | The body isn't a `Request`. |
| 401 | `E_UNAUTHORIZED` | No valid token. |
| 403 | `E_FORBIDDEN_HOST` | `Host` isn't this service (DNS rebinding). |
| 403 | `E_FORBIDDEN_ORIGIN` | Another origin sent it. |

Errors with a status other than 200 have an `ApiError` body (`{"code","message"}`).
Inside `Err`, `E_BACKEND` means the backend failed or dropped the request, and
`E_UNSUPPORTED` means this service doesn't serve that operation (`--sitefile-only`,
or the demo backend).

### `GET /api/v1/events`

Server-sent events. Each message is unnamed (so `EventSource.onmessage` gets it)
and its `data` is one `Event` as JSON:

```
data: {"event":"servers_changed"}

data: {"event":"build_log","id":"b1","line":"step 1/4"}
```

Comment lines keep the connection alive. `*_changed` events carry no data: the
client refetches what it shows. There is no replay; a client that reconnects
should treat everything as changed (the web backend emits every `*_changed`
event locally after a reconnect). Each open stream holds one backend
subscription, dropped when the client goes away.

Authenticate with the bearer header, or with `?ticket=` (below).

### `POST /api/v1/events/ticket`

Reply: `{"ticket":"<64 hex>"}`. A ticket opens one event stream: it works once,
and only within 60 seconds. See "Security".

### `GET /api/v1/version`

Reply: `{"api_version":1,"desktop":true,"mcp":true}`. `desktop` is false under
`--sitefile-only`; `mcp` says whether `/mcp` is served.

### `/mcp`

The MCP (Model Context Protocol) Streamable HTTP transport for AI agents:
`POST` JSON-RPC messages, `GET` the server's event stream, `DELETE` to end a
session (`Mcp-Session-Id`). It sits behind the same checks as `/api/`: the
`Host`, the `Origin`, and `Authorization: Bearer <token>`. Under
`--sitefile-only`, the desktop operations' tools answer `E_UNSUPPORTED`. Tools
and the trust rule: [docs/MCP.md](/sitefile-desktop/mcp/). Built with the `mcp` feature (on by
default).

### Everything else

`GET` serves the web build's files. `/` is `index.html`. Paths with `..`, `%`,
`\` or a segment starting with `.` are 404; so is any unknown `/api/` path.
`.wasm` is `application/wasm`. HTML pages carry a strict CSP (scripts from the
service only, plus `'wasm-unsafe-eval'`; `frame-ancestors 'none'`) and
`X-Frame-Options: DENY`.

## Security

The service can start servers and run builds, and builds can run plugins and
external tools, so no web page other than its own may reach it, and nothing off
this machine may either.

1. **Loopback only.** It binds `127.0.0.1`, never a public interface. Port 0
   picks a free port.
2. **`Host` check (DNS rebinding).** Every request, static files included, must
   have `Host: 127.0.0.1:<port>` or `Host: localhost:<port>`, with the bound port.
   Otherwise `403 E_FORBIDDEN_HOST`. A rebinding attacker's page sends its own
   domain as `Host`.
3. **Token.** A random 256-bit token is made at every start and never written
   to disk. Every `/api/` request needs `Authorization: Bearer <token>` (compared
   in constant time), except the event stream's ticket form. Otherwise
   `401 E_UNAUTHORIZED`.
4. **Origin check.** On `/api/`, an `Origin` header, when sent, must be
   `http://127.0.0.1:<port>` or `http://localhost:<port>`, and `Sec-Fetch-Site`,
   when sent, must be `same-origin` or `none`. Otherwise `403 E_FORBIDDEN_ORIGIN`.
   No CORS headers are ever sent, so a cross-origin page also fails the
   preflight its `Authorization` header needs. Clients that send neither header
   (curl, other programs) are judged by the token alone.

**How the page gets the token.** The service prints
`http://127.0.0.1:<port>/#token=<token>` and `--open` opens it. A fragment is
never sent to the server or in a `Referer`. The page reads it, removes it from
the address bar (`history.replaceState`), and keeps it in `sessionStorage`, which
is per tab and per origin, so a reload keeps working and a restarted service
(new port, new token) needs the new URL.

**Why tickets for the event stream.** `EventSource` can't set headers. The
choice was between a cookie and a query parameter. Cookies on `127.0.0.1` are
not port-scoped: the browser would send ours to every other local server the
user visits. A long-lived token in a query string ends up in history and logs.
So the page proves the token (`POST /api/v1/events/ticket` with the bearer
header) and opens `/api/v1/events?ticket=…` with a ticket that works once and
expires in 60 seconds. When the stream drops for good, the browser's own retry
reuses the spent ticket and is refused, and the web backend fetches a fresh
ticket itself, with backoff.

**What it doesn't defend against.** Another process running as the same user
can read the printed URL (or the process's memory) and is not in scope; nor is a
browser extension with access to the page.

## Sitefile and desktop operations

The service will move into sitefile as `sitefile system service`
(docs/dev/PLAN.md §7). Only operations on sitefile's own state move. The split is
code, not convention: `sfd_service::scope::scope(&Request)` and
`event_scope(&Event)` classify every variant with exhaustive matches (a new
variant doesn't compile until it is classified), and `--sitefile-only`
(`ServiceOptions::desktop = false`) serves exactly the sitefile half: desktop
requests get `E_UNSUPPORTED`, desktop events are dropped.

| Sitefile-owned (moves upstream) | Desktop-only (stays in Sitefile Desktop) |
|---|---|
| `status` | `get_settings`, `set_settings` |
| `list_images`, `inspect_image`, `tag_image`, `remove_image`, `save_image`, `image_from_folder` (a folder's files as an image, #199), `prune_images`, `diff_images` (`sitefile diff --json`), `read_image_file` (one file as text, up to 256 KB) | `list_projects`, `add_project`, `remove_project`, `relocate_project` |
| `list_servers`, `serve`, `stop_server`, `restart_server`, `update_server`, `restore_servers`, `remove_server`, `relocate_server`, `server_logs`, `free_port`, `move_server`, `replay_request` (GET or HEAD again, loopback only), `export_servers`, `read_servers_file`, `set_server_sync`, `connected_pages` (synced browsing, loopback only) | `list_builds`, `build_log`, `remove_builds`, `clear_builds` (build history under `$SITEFILE_HOME/desktop/builds/`) |
| `build`, `cancel_build` | `list_activity`, `undo_activity` (who did what, `desktop/activity.json`: #182, below), `set_trust` (`$SITEFILE_HOME/desktop/trust.json`), `remembered_port` (`desktop/ports.json`), `write_diagnostics`, `reset_desktop`, `router_status`, `start_router` (the name router, `desktop/router.json`), `prepare_example` (#234: writes the bundled example site to `desktop/example/`, leaving files that are there, and answers `example` with its `path`), `list_parked`, `park_folder`, `unpark_folder` (`desktop/parked.json`), `list_folder_projects`, `add_folder_project` (`path`, `tag`), `remove_folder_project`, `watch_folder_project` (`path`, `watch`: #208, Save on change; answers `folder_projects`), `save_folder_project` (#203, `desktop/folders.json`: plain folders remembered as projects; a save is `image_from_folder` under the project's tag and its next build-number tag together, answers `image`; the list answers `folder_projects`), `share_server`, `server_credentials`, `new_server_password` (the password lives in the Keychain), `local_ca_status`, `create_local_ca`, `remove_local_ca`, `set_server_https` (`desktop/tls/`), `list_tunnels`, `start_tunnel`, `stop_tunnel` (public links, children of the serving process), `thumbnail` (site thumbnails, `desktop/thumbnails/`), `pin_server` (`id`, `pinned`: #185, keep a server on the image it serves while new builds land, in `desktop/pins.json`; unpinning moves it to its tag's newest image; answers `server`) |
| `list_plugins` (plugins as Sitefiles declare them), `clear_plugin_cache` | The JSX engine (#137, `desktop/jsx/`): `list_jsx_projects`, `add_jsx_project` (a folder, or a module file: #157), `detect_add` (#201: what a folder or file can be added as, for the one **Add…** sheet: `kinds`, the detected one first, from `sitefile` (a folder with a Sitefile), `jsx` (with the `detect_jsx` preview in `jsx`), `serve` and `folder` (#203: any folder, remembered as a project; `remembered` says it already is); `archive` for an archive, `problem` when there is nothing to add; answers `add_detection`, adds nothing), `detect_jsx` (the add preview: each capability, how its entry was found, what's missing and the command that fixes it; answers `jsx_detection`), `choose_jsx_entry` (between several conventional entries, kept in the app's record), `remove_jsx_project`, `set_jsx_grants` (user only), `jsx_runtime`, `serve_jsx`, `build_jsx` (`tag`, `serve`: #155, each good build's output becomes an image; the `JsxBuild` carries `image_id`, `tags` and `server`), `stop_jsx`, `list_jsx_builds`, `jsx_build_log`, `check_jsx_backends` (`id`, `remote`: #158, probe a gateway's backends now; answers `server`) |
| Events: `status_changed`, `images_changed`, `servers_changed`, `plugins_changed`, `server_log`, `build_started`, `build_log`, `build_finished` | Events: `projects_changed`, `builds_changed`, `activity_changed`, `folder_projects_changed`, `jsx_projects_changed`, `jsx_build_started`, `jsx_build_log`, `jsx_build_finished`, `jsx_problem` |

JSX servers (`kind: "jsx"`, IDs `jsx-…`) appear in `list_servers` beside sitefile's, and
`stop_server`, `restart_server`, `remove_server` and `server_logs` work on them; a
sitefile-only service lists only sitefile's (it has no JSX engine). A JSX server's `jsx.mounts`
(a mounted fileable tree's project) and `jsx.backends` (a gateway's backends: what each is, its
health, its 502/504 count) say what it is made of (#158).

## Activity: who did what

Every state-changing request is recorded with who sent it (#182), in
`$SITEFILE_HOME/desktop/activity.json` (the newest 500); reads are not. Requests to
`/api/v1/call` are recorded as the web UI's (`{"kind":"web"}`), requests through `/mcp` as an
agent's with the name its client gave in `initialize` (`{"kind":"mcp","client":"claude-code"}`).
A request body can't say who it is from: the origin comes from the surface it arrived on.

- `{"op":"list_activity","origin":"mcp","limit":50}` (both optional) answers
  `{"kind":"activity","data":[…]}`, newest first. Each entry:
  `{"id":"42","time":"2026-11-12T10:00:00Z","origin":{"kind":"mcp","client":"claude-code"},"op":"stop_server","title":"Stop server","target":"docs","undo":"Start again"}`,
  with `detail` (`tag hello:2`) when the request says more, `error` (`{"code","message"}`) when
  it failed, and `undone: true` once undone.
- `{"op":"undo_activity","id":"42"}` runs the opposite of an entry that has `undo` (stop → restart,
  serve → stop, add project → remove, park → unpark, start a public link → stop it, HTTPS
  on/off, a plugin or host allowed/revoked, a server pinned: #185), records it as the caller's own entry, marks the
  first undone, and answers what the opposite answers. `E_USAGE` when it has no undo or was
  undone already. Agents can't send it (MCP has no tool for it).
- `activity_changed` says to refetch, whichever process wrote the entry.
- `write_diagnostics` includes the newest 100 entries.

## Pinned servers (#185)

`{"op":"pin_server","id":"docs","pinned":true}` keeps a server of an image on the image it
serves: `update_server` answers it unchanged, and the moves after a build (a JSX build's
`build_jsx`, "Update servers" after a build, following tags) leave it, so `outdated` can name a
newer image while `pinned` is true; clients show that as Pinned, not Outdated
(`ServerSummary::update_available`). `"pinned":false` unpins it and moves it to the image its tag
names now (as `update_server`: same ID, name and port; a stopped server starts on it next time).
A folder, archive or JSX server can't be pinned (`E_USAGE`). The pin is the app's own state
(`desktop/pins.json`), never sitefile's server record; `remove_server` forgets it.

## Readable names and the name router

A running server's `name_url` is its readable address, `http://<name>.localhost:<port>/`
(the name as one DNS label: lowercase letters, digits and `-`), or
`http://<name>.localhost:<router port>/` (no port on 80) while the name router runs.
`url` stays the loopback address. `name_url` is empty when Settings has
`numeric_urls`, when the server isn't running or listens on one LAN address only,
or when its name has no letters or digits; frontends show, copy and open
`ServerSummary::link()` (`name_url`, else `url`).

The name router (`Settings.router_port`, 0 = off) is a detached process
(`__name-router <port>`, recorded in `desktop/router.json`) on loopback that sends each
`<name>.localhost` request to that server, unchanged. `set_settings` starts, moves or
stops it; `start_router` starts it again if it should run and doesn't (the Mac app at
launch); `router_status` answers `{"kind":"router","data":{"port":80,"running":true}}`,
with `error` (`port 80 is already in use`) when it can't run.

## Sharing on the network

`{"op":"share_server","id":"docs","share":true}` restarts the server on the same port
bound to `0.0.0.0` with a generated user (`sitefile`) and password; `"no_password":true`
shares it without one; `"share":false` puts it back on `127.0.0.1` and forgets the
password. The password is kept only in the app's secret store (the macOS Keychain);
sitefile's record holds a verifier. `server_credentials` answers
`{"kind":"credentials","data":{"user":"sitefile","password":"…"}}`, and
`new_server_password` replaces it (the server restarts). `ServerSummary.network_urls`
lists the addresses other devices use while it is shared, and `auth_user` says it asks
for a password. `serve` takes `"share":true` to do the same at start.

## HTTPS with a local certificate authority

`create_local_ca` makes the CA and a server certificate under `desktop/tls/` and answers
`{"kind":"local_ca","data":{"exists":true,"trusted":false,"cert":"…/ca.pem","trust_command":"security add-trusted-cert …"}}`;
it never trusts the CA (`trusted` reports `security verify-cert`). `set_server_https`
(`{"op":"set_server_https","id":"docs","on":true}`) and `serve`'s `"https":true` use the
server certificate (`E_BACKEND` when there is no CA); `remove_local_ca` puts such servers
back on http and deletes the folder.

## Public links

`list_tunnels` answers `{"kind":"tunnels","data":{"available":["cloudflare"],"active":[…]}}`.
`{"op":"start_tunnel","id":"docs","kind":"cloudflare"}` (or `tailscale_funnel`,
`tailscale_serve`) runs the installed tool as a child of the process that answers the API
and answers the tunnel (`state` `starting` until the tool prints its link, then `up`).
Cloudflare and Funnel need the server to have a password (`new_server_password` gives one
to a server that has none). `ServerSummary.public_url` carries the link. `stop_tunnel`
ends it; so do stopping the server and quitting.

## Parked folders

`{"op":"park_folder","path":"~/Sites"}` serves each subfolder of `~/Sites` as a folder
server named after it and answers `{"kind":"parked","data":[{"path":"/Users/you/Sites","servers":["blog","docs"]}]}`.
`list_parked` first serves subfolders that have no server and removes the servers of
subfolders that are gone (the watcher does the same while an event stream is open);
`unpark_folder` stops and removes the folder's servers. A parked folder that is gone is
`"missing": true`. With `"dry_run":true` it answers the servers it would remove and changes
nothing (see [Dry runs](#dry-runs-of-bulk-deletes)).

## Build history

sitefile keeps no build history, so the app does (`$SITEFILE_HOME/desktop/builds/<id>.json`
and `.log`). Removing history never removes an image; the image belongs to the store.

- `{"op":"remove_builds","ids":["0c55e8f1d2a7"]}` deletes those records and logs.
  Running builds and unknown IDs are skipped.
- `{"op":"clear_builds","statuses":["failed","cancelled"],"before":"2026-11-01T00:00:00Z","project":"/path"}`
  deletes every finished build matching all the filters given (each optional; none means every
  finished build). Running builds are never removed. A `before` that isn't RFC 3339 is `E_USAGE`.
- `clear_builds` takes `dry_run` and `expect` too ([Dry runs](#dry-runs-of-bulk-deletes)): the
  builds it would remove, with the bytes their records and logs take.
- Both answer `{"kind":"removed","data":{"count":N}}` and, when N > 0, emit `builds_changed`
  (refetch `list_builds`) and `projects_changed` (a project's last build may have changed).
- Retention: `Settings.build_history` is `{"keep":"count","count":100}` (the default),
  `{"keep":"days","days":30}` or `{"keep":"forever"}`. It is applied after each build finishes,
  the first time the history is listed (launch), and when the setting changes. Each project's
  most recent finished build is always kept, and running builds are never removed.
- `status.history_bytes` is the history's size on disk (0 from a sitefile-only service).

There is no CLI equivalent (the history is the app's), and the MCP server offers no tool to
remove history: agents can list builds but not clear them.

## Dry runs of bulk deletes

`prune_images`, `clear_builds` and `unpark_folder` take two optional fields (#183; additive,
so a request without them does what it always did):

- `"dry_run": true`: answer exactly what the call would remove, and remove nothing:
  `{"kind":"would_remove","data":{"images":[…],"builds":[…],"servers":[…],"bytes":N}}`.
  `images` are `ImageSummary`s (ID, tags, size, `in_use`), `builds` `BuildRecord`s and
  `servers` `ServerSummary`s; empty lists are left out. `bytes` is the space freed in total:
  for prune, every file in the store no remaining image uses (images share files, so it can
  differ from their sizes added up); for builds, their records and logs.
- `"expect": ["<id>", …]`: the IDs the dry run listed (images', builds' or servers'). The call
  removes them only when that is still exactly what it would remove; otherwise it removes
  nothing and fails with `E_CHANGED`, whose message says what changed ("it would now also
  remove …", "1 item listed is already gone or now kept"). List again and ask again.

Prune's list is sitefile's own: the untagged images `Store::gc_view` reports, the ones
`sitefile image prune` drops, including one a running server still serves (`in_use`).

```
{"op":"prune_images","dry_run":true}
{"op":"prune_images","expect":["sha256:1a2b…"]}
{"op":"unpark_folder","path":"/Users/you/Sites","dry_run":true}
{"op":"clear_builds","project":"/Users/you/Projects/docs","expect":["0c55e8f1d2a7"]}
```

Both apps ask with this list (each item and a total) before Prune, Unpark and removing a
project with its builds, and send it back as `expect`.

Two seams to settle before the move: `list_plugins` today scans the app's
registered projects (desktop state) to find Sitefiles, so upstream it needs the
contexts passed in; and `build` applies saved trust from `trust.json`, which
upstream becomes the caller passing `allow_plugins` / `allow_exec` explicitly
(the fields `BuildOptions` already has).
