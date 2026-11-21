---
title: "How-to guides"
description: "Task by task: install, serve, build, run servers, plugins and trust, projects, the web UI, MCP, Siri."
sidebar:
  order: 2
---

Task by task, for when you know what you want to do. New here? Start with the
[tutorial](/sitefile-desktop/tutorial/). Menu names are the app's own. Pages are in the sidebar (and View,
Command-1 and on): Servers, Images, Projects, Builds, Plugins, Logs, Activity. Every
setting is in the [settings reference](/sitefile-desktop/settings/) and every key in the
[keyboard shortcuts](/sitefile-desktop/keyboard-shortcuts/).

## Contents

- [Install and open the app](#install-and-open-the-app)
- [Serve a folder](#serve-a-folder)
- [Build a Sitefile into an image](#build-a-sitefile-into-an-image)
- [First run: a site on your phone](#first-run-a-site-on-your-phone)
- [Run and stop servers](#run-and-stop-servers)
- [Read logs](#read-logs)
- [Plugins and trust](#plugins-and-trust)
- [Projects and folders](#projects-and-folders)
- [Menu bar and open at login](#menu-bar-and-open-at-login)
- [Open the web UI](#open-the-web-ui)
- [Connect an agent over MCP](#connect-an-agent-over-mcp)
- [Siri and Shortcuts](#siri-and-shortcuts)
- [Where things are stored](#where-things-are-stored)

## Install and open the app

1. Download `Sitefile-Desktop-<version>-arm64.zip` (and `SHA256SUMS`) from the
   [latest release](https://github.com/johnhenry/sitefile-desktop/releases/latest), unzip
   it and drag **Sitefile Desktop** to Applications.
2. The current builds are signed ad hoc and not yet notarized (tracked in
   [#232](https://github.com/johnhenry/sitefile-desktop/issues/232)), so Gatekeeper blocks
   the first launch. Right-click the app and choose **Open**, or run
   `xattr -dr com.apple.quarantine "/Applications/Sitefile Desktop.app"`.

A Homebrew cask is coming (`brew install --cask`, from a tap that isn't published yet);
until then, use the download above. It needs macOS 27 or later.

## Serve a folder

1. File > **Serve…** (Command-N), or **Serve…** on the Servers page. You can also
   drop a folder on the window, or open one with the app (Dock icon, Open With).
2. Pick the folder (or type an image, a tag like `docs:latest`, or a `.zip`), and
   optionally a port. Empty means any free port.
3. **Serve**. The server is listed on Servers with its address; **Open in Browser**
   (Shift-Command-O) opens it.

Hidden files stay out of what is served, except `.well-known`, and a
`.sitefileignore` in the folder applies.

To reach it from another device, set Settings > Network > **Listen on** to
**Your Network**. Anyone on that network can then open your servers.

## Build a Sitefile into an image

1. File > **Add…** (Shift-Command-N) and pick a folder with a Sitefile. It appears on
   Projects.
2. Select it and choose **Build…** (Project > Build…, Shift-Command-B).
3. Give it a tag such as `site:latest` (empty only checks that it builds) and any
   build arguments, then build. The Builds page shows it running; **Open Log** shows
   the output; **Stop Build** is Command-Period.
4. A finished build with a tag is an image on the Images page. **Open This Build**
   serves it. **Rebuild** and **Build Again…** repeat it. Pick two builds and
   **Compare Builds** to see what changed.

A build that needs a plugin or tool you haven't allowed says so and offers
**Allow … and rebuild**.

## First run: a site on your phone

With no servers, images or projects, the Servers page offers three ways in. Each ends
with a running server and its address:

- **Build the Example** builds the example that ships with the app (kept in
  `~/.sitefile/desktop/example/`, so you can edit it and build again) into
  `hello:latest` and serves it. It needs no network and no plugins.
- **Serve a Folder…**, or drop a folder on the window: a local address, no build.
- **Add a Project…** (or drop the folder): for a folder with a Sitefile, **Add and Serve**
  adds it, builds it as `<name>:latest` and serves the image. For a plain folder, **Serve**
  serves it as it is. Turn "Build and serve it now" (or "Serve it now") off in the sheet to
  only add it, or, for Serve as is, to open the Serve sheet first. A build that needs a
  plugin or host allowed stops there with its usual notice, and nothing is served until you
  allow it and build again.

Then **Share to Phone** (the server's side panel, its page, or Server menu) opens the
Share tab. If the server is on this Mac only, the app first says what sharing means: it
restarts on the same port on every network this Mac is on, with a password kept in your
Keychain, and macOS may ask to allow incoming connections. After you confirm, scan the QR
code with the phone's camera (same Wi-Fi) and enter the user and password shown. The code
holds only the address, on purpose: sitefile's login is HTTP Basic auth, which has no
one-time link, and a password in the address would land in the phone's history and be
dropped by some browsers (#234).

Sitefile itself is built into the app, so nothing else needs installing; the page shows its
version and the matching terminal commands. To type them yourself, install the command
line tool in Settings > General.

## Run and stop servers

On Servers, select a server to see its panel, or use the Server menu:

- **Open in Browser**, **Restart**/**Start**, **Stop** (Shift-Command-Period),
  **Update** (when its image has a newer build), **Pin to Image**/**Unpin**,
  **Save as Image…** (for a folder), **Show Logs**, **Locate…** (if the folder moved),
  and **Remove**.
- Tick several rows for bulk actions.
- **Import Servers…** and **Export Servers…** (File menu) move a set of servers
  between machines.

Servers are separate processes, so quitting the app leaves them running unless you
change what happens when the app quits in Settings > General. Settings > Servers can
restore servers after a restart.

## Read logs

Select a server and choose **Show Logs**, or open the Logs page. Builds have their own
log (Build > Open Log).

## Plugins and trust

![The Plugins page](/sitefile-desktop/plugins-light.png)

Sitefile projects can use JavaScript plugins, Wasm plugins and external tools. The
Plugins page lists each one, its source and which projects use it.

- JavaScript plugins and tools are **not allowed** until you allow them, per project.
  Toggle **Allowed** on the plugin, or choose **Allow in Every Project**.
- If a plugin's code or a tool changes, it reads **Changed** and stops holding until
  you allow it again.
- **Revoke** takes it back.

Agents over MCP and Siri cannot allow anything. See [SECURITY.md](/sitefile-desktop/security/).

## Projects and folders

![The Projects page](/sitefile-desktop/projects-light.png)

Projects has three tabs:

- **Sitefile**: folders with a Sitefile, built with Build….
- **Folders**: any folder you want to keep. **Save as image…** stores it under a tag
  with build numbers. **Save on change** saves again whenever it changes.
- **JSX**: JSX projects (they need Node; Settings > Advanced covers it).

**Add…** offers the kinds that apply to a folder. The app doesn't write to a project's
folder. **Show in Finder** and **Locate…** are in the Project menu.

## Menu bar and open at login

![The menu-bar item](/sitefile-desktop/menu-bar-light.png)

The menu-bar item shows the number of running servers and opens the window and the web
UI. In Settings > General: **Show in the Dock**, **Open at login**, **Start in the menu
bar** (no window at launch) and **Running count in the menu bar**.

## Open the web UI

View > **Open Web UI** starts the bundled service on 127.0.0.1 (any free port) and
opens your browser at its address, which includes a start-up token. It stops when the
app quits. It is not reachable from other devices.

## Connect an agent over MCP

The app bundle contains the MCP server:
`/Applications/Sitefile Desktop.app/Contents/MacOS/sitefile-desktop-mcp`.

```sh
claude mcp add sitefile-desktop -- "/Applications/Sitefile Desktop.app/Contents/MacOS/sitefile-desktop-mcp"
```

Or in a client's JSON config:

```json
{
  "mcpServers": {
    "sitefile-desktop": {
      "command": "/Applications/Sitefile Desktop.app/Contents/MacOS/sitefile-desktop-mcp",
      "env": { "SITEFILE_HOME": "/Users/me/.sitefile" }
    }
  }
}
```

The agent can then list images, build, serve, stop and read logs. It can't allow
plugins or tools; when a build needs one it says so and you allow it in the app.
Tools and options: [MCP.md](/sitefile-desktop/mcp/); the [API reference](/sitefile-desktop/api/) says where each
interface lives.

## Siri and Shortcuts

Settings > **Siri & Apple Intelligence** has a global switch and a switch per action,
all off by default. They need a properly signed build, which current releases are not.
Details and limits: [SIRI.md](/sitefile-desktop/siri/).

## Where things are stored

The app's own state is in `~/.sitefile/desktop/`; sitefile's images and server records
are in `~/.sitefile/`, shared with the CLI; passwords are in the Keychain. See
[PRIVACY.md](/sitefile-desktop/privacy/).
