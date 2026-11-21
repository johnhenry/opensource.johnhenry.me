---
title: "MCP server"
description: "Tools for AI agents: build, serve, read logs. Agents cannot grant trust."
sidebar:
  order: 7
---

AI agents (Claude Code and other MCP clients) can use Sitefile Desktop through
an MCP (Model Context Protocol) server: list and inspect images, build
projects, serve and stop servers, read server and build logs, and explain
failed builds. It's another frontend over the same `sfd_core::Backend` as the
apps. It sits next to the apps' own connections and doesn't replace them.

The crate is `crates/sfd-mcp`, built on the official Rust SDK
([`rmcp`](https://crates.io/crates/rmcp)). Its library serves any
`Arc<dyn Backend>` and doesn't depend on `sfd-local`, so it can move into
sitefile as `sitefile mcp` (docs/dev/PLAN.md §7). It accepts every protocol
revision rmcp 3.9 knows, `2024-11-05` through `2026-07-28`. Clients that use
the `initialize` handshake get the version they ask for, up to `2025-11-25`.

## Transports

- **stdio**: the binary `sitefile-desktop-mcp` reads and writes MCP on
  stdin/stdout over the real store at `$SITEFILE_HOME` (default `~/.sitefile`),
  through `sfd-local`. Only MCP messages go to stdout; diagnostics go to stderr.
  Servers it starts are detached `__serve-worker` processes of the same binary,
  and they keep running after the session ends. Builds run inside the process,
  so a build still running when the client disconnects is stopped.
- **Streamable HTTP**: `sitefile-desktop-service` serves the same server at
  `/mcp`, behind the API's checks: loopback `Host`, same-origin `Origin`, and
  `Authorization: Bearer <token>` (the token the service prints at start-up).
  See docs/API.md. Under `--sitefile-only`, the tools for desktop operations
  (projects, build history) answer `E_UNSUPPORTED`.

Build the binary with `cargo build --release -p sfd-mcp`. It lands at
`target/release/sitefile-desktop-mcp`.

## Adding it to a client

Claude Code:

```sh
claude mcp add sitefile-desktop -- /path/to/sitefile-desktop-mcp
# on another store:
claude mcp add sitefile-desktop -e SITEFILE_HOME=/path/to/home -- /path/to/sitefile-desktop-mcp
```

Any client that launches stdio servers from a JSON config (Claude Desktop,
Cursor, VS Code, and others) takes the usual shape:

```json
{
  "mcpServers": {
    "sitefile-desktop": {
      "command": "/path/to/sitefile-desktop-mcp",
      "env": { "SITEFILE_HOME": "/Users/me/.sitefile" }
    }
  }
}
```

Over HTTP, while `sitefile-desktop-service` runs:

```sh
claude mcp add --transport http sitefile-desktop http://127.0.0.1:<port>/mcp \
  --header "Authorization: Bearer <token>"
```

The service makes a new token and usually picks a new port each time it
starts, so stdio is the better fit for a client you configure once.

## Tools

Every tool returns a short text summary for the agent to read, plus the data
as `structuredContent` (always a JSON object). Annotations: `readOnlyHint` on
reads, `destructiveHint` on tools that remove or stop something, and
`openWorldHint: false` on all of them (everything is local).

| Tool | Request | Kind |
|---|---|---|
| `status` | `Status` | read |
| `list_images` | `ListImages` | read |
| `inspect_image` (`id`, optional `compare_to`) | `InspectImage` | read |
| `tag_image` (`id`, `tag`) | `TagImage` | write |
| `image_from_folder` (`path`, `tag`) | `ImageFromFolder`: a folder's files as an image, as `serve` serves them (no hidden files but `.well-known`; its `.sitefileignore` applies), the same files giving the same ID (#199) | write |
| `remove_image` (`id`, `force`) | `RemoveImage` | destructive |
| `prune_images` (`dry_run`, `expect`) | `PruneImages`; `dry_run` lists exactly what would go (each image's ID, tags, size and whether a server serves it, and the total freed) and removes nothing; `expect` (that answer's IDs) prunes only if that is still what goes, else nothing goes and the error (`E_CHANGED`) says what changed (#183) | destructive |
| `list_servers` (`all`) | `ListServers`; under a JSX server, a line per mounted fileable project ("pages from") and per gateway backend (what it is, its health, its upstream errors), the local backends of running gateways checked first (`CheckJsxBackends`, #158) | read |
| `serve` (`source`, `name`, `publish`, `spa`, `cors`, `compress`, `max_age`, `immutable`, `isolate`, `throttle`, `host_profile`, `base`, `rewrite_base`, `max_connections_per_ip`, `live_reload`) | `Serve` | write |
| `stop_server` (`id`) | `StopServer` | destructive |
| `restart_server` (`id`) | `RestartServer` | destructive |
| `update_server` (`id`) | `UpdateServer` (a pinned server is left as it is) | destructive |
| `pin_server` (`id`) | `PinServer { pinned: true }` (#185): keep it on the image it serves while new builds land | write |
| `unpin_server` (`id`) | `PinServer { pinned: false }`: follow its tag again, moving to the newest image now | destructive |
| `remove_server` (`id`) | `RemoveServer` | destructive |
| `server_logs` (`id`, `tail`, default 100) | `ServerLogs` | read |
| `connected_pages` (`id`) | `ConnectedPages` (the page each browser has open on a server with synced browsing) | read |
| `list_projects` | `ListProjects` | read |
| `add_project` (`path`, `dry_run`) | `AddProject`; with `dry_run`, `DetectAdd` (#201): says what the path can be added as in the app's Add… sheet (Sitefile project, JSX project, a folder to serve as it is, a folder project, an archive) and adds nothing; a folder without a Sitefile gets that answer with the error. Agents don't add JSX projects (the user does, in the app) | write |
| `list_folder_projects` | `ListFolderProjects` (#203): the plain folders remembered as projects, each with the tag its saves use, its save count (the next is `name:<n+1>`), when it was last saved, whether its folder is missing or in a parked folder, and whether it is saving on change (#208) | read |
| `add_folder_project` (`path`, `tag`) | `AddFolderProject` (#203): remember a plain folder as a project (nothing is written to it); a remembered one keeps its entry and takes the `tag`. Agents can't forget one: the user does, in the app | write |
| `save_folder_project` (`path`, `tag`) | `SaveFolderProject` (#203): the folder's files as an image, as `image_from_folder`, under the project's tag and its next build-number tag together (`site:latest` and `site:3`) | write |
| `watch_folder_project` (`path`, `watch`, default true) | `WatchFolderProject` (#208): Save on change, as `build` with `watch` is for a Sitefile project. While on, the folder is watched (sitefile's own watch loop: hidden files and `.sitefileignore` stay out of the image) and each change that makes a different image is saved under the project's tag and its next build-number tag, the tag's servers moving to it; a change that makes the same image takes no number. Remembered in the project, resumed when the app starts; `watch: false` stops it | write |
| `build` (`context`, `sitefile`, `tag`, `build_args`, `target`, `no_cache`, `watch`) | `Build`; `watch` is Build and Watch (#184) | write |
| `wait_for_build` (`id`, `timeout_seconds`, default 120, max 600) | events + `ListBuilds` | read |
| `get_build` (`id`) | `ListBuilds` | read |
| `list_builds` (`limit`, default 20) | `ListBuilds` | read |
| `list_activity` (`origin`: `app`/`web`/`siri`/`mcp`, `limit`, default 20, max 500) | `ListActivity` (#182): what was done lately and by whom | read |
| `build_log` (`id`, `tail`, default 200) | `BuildLog` | read |
| `cancel_build` (`id`) | `CancelBuild` | destructive |
| `list_plugins` | `ListPlugins` | read |
| `diff_images` (`from`, `to`) | `DiffImages`: files added, removed and changed (sizes), and `/_redirects`/`/_headers` rules added or removed; the text lists up to 200, structuredContent all (#181) | read |
| `read_image_file` (`id`, `path`) | `ReadImageFile`: the file as text when it is UTF-8 and at most 256 KB, else only its size | read |
| `save_image` (`id`, `path`, `format`: `directory` default, `oci_tar`, `tar_gz`, `zip`, `wbn`; `base_url`, required for `wbn`) | `SaveImage`; creates the file or folder at `path` (see below) | write |
| `move_server` (`id`, `port`, 0 for any free port) | `MoveServer`: the same server (ID, name, source, address) on another port; it restarts | destructive |
| `free_port` (`port`) | `FreePort`: who holds a taken port, and the next free one | read |
| `replay_request` (`id`, `method`: `GET` default or `HEAD`, `path`, default `/`) | `ReplayRequest`: status, headers, body size and time (see below) | write (not read-only: the server's handler runs; idempotent) |
| `router_status` | `RouterStatus`: the name router's port, whether it runs, why not | read |
| `list_parked` | `ListParked`: parked folders and their subfolders' servers; like the app, listing brings them up to date (a new subfolder is served, a gone one's server is removed) | destructive (idempotent) |
| `write_diagnostics` (`path`) | `WriteDiagnostics`: creates a JSON report at `path` (see below); a proxy password in Settings is masked as `***` | write |

#181's tools live in `crates/sfd-mcp/src/more.rs`, in this always-on group.

**`save_image` and `write_diagnostics` only create.** `path` must be absolute and must not
exist yet (not even as a symlink): an agent can't overwrite or replace anything with them, and a
taken path is a tool error, `E_EXISTS`, before anything is sent to the backend. `save_image`
writes a folder (`directory`), an OCI layout tar, a `.tar.gz`, a `.zip` or a Web Bundle (`wbn`,
with the `https://…/` `base_url` its resources live under). Both are annotated as non-destructive
writes, not idempotent.

### The `jsx` group (#137), on by default

Tools for JSX projects (fileable, servable, hostable), listed while Settings' `mcp_jsx_tools` is
on (read on every `tools/list` and call; a call while it's off is a tool error, `E_DISABLED`).
It's on by default since #181, so a freshly connected agent sees JSX projects; the user can
still turn it off. A settings file without the key reads as on (older files never wrote it
while it was off by default); one that says `false` stays off, and `false` is always written.

39 + 8 = 47 tools at most (`list_activity` is #182's, the folder-project tools #203's). That's over #116's 38, which is Siri's budget (Apple Intelligence was
reported to stop considering an app's tools around 40); MCP clients don't share that limit, so
since #181 the MCP server has its own budget, 49 (`tools::MAX_TOOLS`, checked by a test), and
Siri's stays 38.

| Tool | Request | Kind |
|---|---|---|
| `jsx_list_projects` | `ListJsxProjects`, with each project's capabilities (#157), then each project's servers with what they're made of (#158: mounted pages' project, a gateway's backends with their health and upstream errors; local backends checked, never outside URLs) | read |
| `jsx_detect` (`path`: a folder or a module file) | `DetectJsx` (#157): what it would be as a project, without adding it: each capability (build site, run app, run gateway), how its entry was found (package.json field, conventional `app.*`/`server.*`/`gateway.*`, the user's choice, a file opened directly and inspected), and what's missing with the fix (`npm install`, a TypeScript 5/6 or esbuild compiler for `.tsx`/`.jsx`). The same detection the app, `jsx_list_projects` and Siri read | read |
| `jsx_runtime` | `JsxRuntime` (the Node in use, and every one looked at) | read |
| `jsx_serve` (`path`, `level`: `serve`/`host`, default the project's app, else its gateway (#157), `watch`, `name`) | `ServeJsx`; the text starts "Serving at" the best URL (#156: `/` when a GET route answers it, else the first GET route without parameters, a gateway's first literal host) and lists the routes, one per line (a mounted tree as one line), or says why there are none (servable before 0.3) | write |
| `jsx_build` (`path`, `watch`, `tag`) | `BuildJsx` (never `serve`); a build waits up to 120 s for `JsxBuildFinished` and answers with the image ID and tags (#155), a watch answers at once | write |
| `jsx_stop` (`id`) | `StopJsx` | destructive |
| `jsx_list_builds` | `ListJsxBuilds` | read |
| `jsx_build_log` (`id`) | `JsxBuildLog` | read |

**Agents never probe another machine** (#158): the checks behind `list_servers` and
`jsx_list_projects` connect only to backends on this Mac; an outside URL's health is shown only
after the user checks it in the app. The tool count is unchanged.

**Agents can't download runtimes**: there is no tool for `InstallManagedNode` or
`RemoveManagedNode` (#140). Only the user downloads, updates or removes the managed Node, in
Settings → Advanced; `jsx_runtime` shows it (`managed`) when there is one.

`serve`'s text also starts "Serving at" `ServerSummary::open_url` (the same as `link()` for a
sitefile server). JSX servers are in `list_servers` (with `jsx.routes` and `jsx.open_url` in
structuredContent), and `stop_server`, `restart_server`, `remove_server` and
`server_logs` work on them. **Agents can't grant a JSX project anything**: there is no tool
for `SetJsxGrants`, `AddJsxProject` or `ChooseJsxEntry` (`jsx_detect` only previews), and `jsx_serve`/`jsx_build` have no grant inputs. A
permission denial (`E_ACCESS_DENIED`) comes back saying only the user can allow it, in the app.

**A fileable build makes an image** (#155): `jsx_build`'s answer names it
(`image 0123456789ab hello:latest hello:3`), and it's in `list_images` like any other, so
serving it is the ordinary `serve` tool (`source: "hello:latest"`); no JSX tool serves an
image, and the tool count is unchanged. A server already serving the tag moves to each new
build (its pages reload); agents never ask a build to serve (`serve` is never sent), and
`tag` (remembered for the project) is the only image input.

**The request inspector**: `server_logs` returns the same request lines (with the rule,
referring page and client once sitefile's JSON log carries them), and `replay_request` (#181)
sends one again: `GET` or `HEAD` only (anything else is refused before it's sent), to a running
server on this Mac's loopback address only (a server bound to every address is reached on
`127.0.0.1`; sfd-local refuses any other address), without credentials, and it answers the
status, headers, body size and time, never the body. It never reaches the network.

**Agents can't share servers on the network** (issue #27). Sharing exposes the
site to everyone on the network, so only the user turns it on, in the app. There
is no tool for `ShareServer`, `ServerCredentials` or `NewServerPassword`, so an
agent can't share a server, turn its password off or read the password; `serve`
always listens on `127.0.0.1` when `publish` names an address (`0.0.0.0:8080`
becomes `127.0.0.1:8080`), and never sets `share`. A server the user shared stays
shared (with its password) when an agent restarts it.

**Agents can't set up HTTPS** (issue #28): there is no tool for `CreateLocalCa`,
`RemoveLocalCa` or `SetServerHttps`, and `serve` never sets `https`.

**Agents can't share publicly** (issue #42): there is no tool for `StartTunnel` or
`StopTunnel`; only the user starts a public link, in the app.

**A server serves one image ID.** `serve` resolves a tag once; `restart_server`
keeps that image. When a later build or `tag_image` moves the tag,
`list_servers` shows the server as outdated (with the image the tag names now),
and `update_server` serves that image on the same name and port. A server
started without a name is named after its tag (`docs`, then `docs-2`).

**Builds are asynchronous.** `build` returns the build ID right away.
`wait_for_build` subscribes to the backend's events and returns when that
build's `BuildFinished` arrives. If the build has already finished, it returns
at once. If the timeout passes first, it returns the record, still `running`,
so the agent can wait again instead of polling. A failed build comes back as a
tool error (`isError: true`) with its code, message and Sitefile line.

**Build and Watch** (#184): `build` with `watch: true` runs sitefile's own `build --watch` loop
in the app: it builds, then builds again whenever the folder, the Sitefile or what it reads
changes. Each good build is stored under `tag` like a plain build, and the servers serving that
tag move to it (their pages reload). `wait_for_build` returns after the watch's next build (at
once when it has built already), with `watching: true` and that build's status, image and error;
the record stays `running` and counts `watch_builds`. A failing build keeps the last good image
and the watch goes on. `cancel_build` stops it (it ends `cancelled`; images it stored stay). A
watch needs a local folder, not a Git URL. Over stdio it runs in `sitefile-desktop-mcp`'s
process, so it stops when that process exits, like any build there.

**Every result ends with its next step** (#159): a last text line `Next: …`, from the same
`sfd_core::next_step` the apps' notices and Siri use, naming the follow-up tool and its
arguments. A build that made an image: `Next: serve {"source":"hello:latest"}`; a server that
started: `Next: open http://hello.localhost:8080/hello (stop_server {"id":"…"} stops it)` (its best
route); one that stopped: `Next: restart_server {"id":"…"} starts it again`; a running build:
`Next: wait_for_build {"id":"…"}`; a failure, its fix: `Next: fix Sitefile line 7, then build
again (build_log {"id":"…"} has the details)`, `Next: run npm install in /p/hello, then try
again`. What only the user can do is phrased as asking them: `Next: ask the user to allow the
plugin md-toc in Sitefile Desktop (agents can't), then build again`, and for a JSX permission
`Next: ask the user to allow network access for hello in Sitefile Desktop (agents can't grant
it), then try again`. The hints are text only (no new tools, no new structured fields).

**Agents are named in the activity list** (#182). Every request a tool call sends reaches the
backend with the origin `{"kind":"mcp","client":"<name>"}`, the `clientInfo.name` the client
gave in `initialize` (no name: just "Agent"), and each one that changes something is recorded
in the app's Activity list, where the user sees it and can undo it. `list_activity` reads that
list (the agent's own actions included); there is no tool to undo, clear or edit it.

**Errors.** A backend error (`ApiError`) or a bad argument is a tool error:
`isError: true`, the text `E_CODE: message`, and
`structuredContent.error = {code, message}`. The agent sees it and can fix the
call. Only an unknown tool name is a JSON-RPC protocol error (`-32602`).

## The trust rule: agents can't grant trust

Plugins and TOOLs run code on the user's machine, and a build's network access
decides which hosts it can reach (and which receive `IMPORT … SECRET` headers).
Only the user can allow them, in the app.

- There's no tool for `SetTrust` or `SetHostTrust`.
- `build`'s schema has no `allow_plugins`, `allow_exec` or `allow_hosts` inputs
  (`additionalProperties: false`). The server forces them to empty/false
  whatever arrives. If a client sends them anyway, the result says they were
  ignored.
- `list_plugins` is read-only. It shows whether each use is allowed.
- When a build fails because a plugin or TOOL isn't allowed (`needs_plugin`, or
  `needs_exec`/`needs_tool`), or a host it may not contact (`needs_host`,
  `needs_secret_host`), the result names it and says the user must allow
  it in Sitefile Desktop (the Plugins screen, or "Allow … and rebuild" on the
  build) before building again. The same sentence is in
  `structuredContent.user_action_required`.

Two other operations aren't exposed either:

- `SetSettings`: the settings are the store location, the default port and the
  Dock icon. These are the user's preferences, and changing the store location
  would point the app at a different store. An agent has no need for this.
- `ClearPluginCache`: it only makes the next builds slower, and an agent that
  wants a clean build can pass `no_cache: true` to `build`.

`RemoveProject` isn't exposed yet. `SaveImage` is (`save_image`, #181), creating new paths
only.
