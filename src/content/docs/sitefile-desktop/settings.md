---
title: "Settings"
description: "Every tab of the Settings window."
sidebar:
  order: 4
---

Open with Command-Comma (Sitefile Desktop > Settings…). One tab per group. Switches and menus
save at once; text fields save on Return or when you leave them, and a field the app can't accept
shows its problem under the form until it is fixed. The window reopens on the tab you last used.

Tabs: [General](#general), [Servers](#servers), [Builds](#builds), [Network](#network),
[Notifications](#notifications), [Storage](#storage), [Advanced](#advanced),
[Siri & Apple Intelligence](#siri--apple-intelligence).

![The Settings window](/sitefile-desktop/settings-light.png)

## General

| Setting | Choices | What it does |
|---|---|---|
| Appearance | System, Light, Dark | System follows macOS as it changes. |
| Show in the Dock | switch | Off keeps the app in the menu bar only. |
| Open at login | switch | Starts the app when you log in to this Mac. |
| Start in the menu bar | switch | Opens without the window; the menu-bar item opens it. |
| Running count in the menu bar | switch | The number of running servers beside the menu-bar icon. |
| Show site thumbnails | switch | A picture of each running site on the server list, server pages and Compare builds, taken by loading the page in a private, off-screen web view. |
| Rows per page | Off, 10, 25, 50, 100, Custom | Every table shows this many rows at a time, after its filter and sort, with a pager. Off shows every row in one scrolling table. Custom takes any number from 1. |
| Editor | text | What Open in Editor uses for a folder: an app's name, like Visual Studio Code or Zed. Empty: one found on this Mac, else the folder's default app. |
| When the app quits | Keep Running, Stop Them | Servers are separate processes. Keep them serving, or stop every running server as the app quits. |
| Command line tool | Install / Uninstall | Links `~/.local/bin/sitefile` to the sitefile inside the app. The tab also shows the command for `/usr/local/bin`, which needs your administrator password in Terminal. |

## Servers

| Setting | What it does |
|---|---|
| Default port | What the Serve dialog suggests. Empty picks a free port. |
| Port range | Ports picked when none is given, like `8080-8099`. Empty: any free port. |
| Listen on | **This Mac Only** (127.0.0.1) or **Your Network**. On your network, anyone on it can open your servers. A port field with an address still wins. |
| Readable addresses | Show servers as `name.localhost` instead of `127.0.0.1`. |
| Name router | A port for the name router, or Off. |
| Reuse ports | Serving a project, folder or archive again suggests the port it had last time. |
| Restore servers | When the app starts, start again the servers that were running when the Mac shut down or their process ended. Servers you stopped stay stopped. **Restore Now** does it at once. |
| Keep this Mac awake | Off, While Serving, or While Shared (while a server listens on your network). Only while the app is open; the display can still sleep, and closing the lid on battery still sleeps the Mac. |
| HTTPS | **Set Up HTTPS…** creates a local certificate authority so browsers and phones can trust local servers. Once it exists the tab shows whether this Mac trusts it, the command to trust it, Open in Keychain Access and Check Again. The app never trusts it for you. |
| Parked Folders | **Park a Folder…**: every folder inside a parked folder is served on its own, named after it (`docs` becomes `docs.localhost`), and new folders get a server while the app is open. **Unpark** removes one. |
| Advertise shared servers | Servers shared on your network appear by name to other devices (Bonjour) while the app is open. |

## Builds

| Setting | What it does |
|---|---|
| Tag | The Build dialog's tag for a project's first build. `{project}` is the project's name. Placeholder: `{project}:latest`. |
| Build arguments | `NAME=value`, one per line. Every first build of a project starts with these; later builds reuse their last arguments. |
| Skip the transform cache | Builds run every TRANSFORM again unless you turn the cache back on in the Build dialog. |
| Keep build history | Last 100 builds, Last 30 days, or Forever. Older records and logs are removed after each build and at launch. Each project's last build always stays, and images are never removed. |
| Allowing plugins and tools | **Remember per Project** (Allow and rebuild saves it for that project) or **Ask Every Build** (it allows for that build only). Wasm plugins never need allowing. |

## Network

| Setting | What it does |
|---|---|
| Ask before contacting new hosts | Builds reach only the hosts each project allows; a build that needs another host stops and names it, with Allow and rebuild. |
| Proxy | An `http://` proxy for everything builds fetch. A user and password in the URL are saved in the app's settings file. `HTTP_PROXY` is never used. |
| Bypass the proxy for | Hosts reached directly, like `.internal.example`, `10.0.0.0/8` or `localhost`. |
| Allow these hosts everywhere | Every project may reach these hosts. |
| Block these hosts | Fetches never reach these, even when allowed above. |
| Fetch timeout | Milliseconds, or `connect=5000,read=60000`. Empty: sitefile's defaults. |
| Insecure registries | Registries reached over plain HTTP or with self-signed certificates, as `host:port`, separated by commas. |

Registry sign-in uses your Docker credentials (`docker login`, `~/.docker/config.json`,
credential helpers); the app doesn't store passwords.

## Notifications

Each is a switch: Builds that finish, Builds that fail (with the error), Servers that stop
(without you stopping them), Browser errors (a served page reports a console error; pages report
them while a server watches its folder), and Servers left on an old build (a build moved a tag a
server still serves the old image of).

## Storage

| Item | What it does |
|---|---|
| Store folder | `SITEFILE_HOME`: images, server records and caches, shared with the CLI. A new folder takes effect when the app next starts. |
| Transform cache limit | The most the transform cache keeps (`500M`, `2G`; `0` for no limit). Default 1G. Takes effect at the next start. |
| Untagged images | **Prune…** deletes images no tag or server uses, and the files only they use. |
| Build history | The app's own records and logs, with the Clear choices. Clearing never removes images; Undo brings them back. |
| Transform cache | **Clear…** removes cached plugin and tool results; the next builds are slower. |

## Advanced

| Section | Setting | What it does |
|---|---|---|
| Troubleshoot | Rebuild everything | Skip incremental builds. Takes effect at the next start. |
| | Compile wasm plugins every time | Don't reuse compiled wasm modules. Takes effect at the next start. |
| | Diagnostics | **Write** a JSON file (versions, store health, settings, projects, recent builds, servers) to attach to an issue. No passwords in it. |
| | Local certificate authority | Shown once HTTPS is set up. **Remove…** deletes its key and certificates; HTTPS servers go back to http. |
| | Reset Sitefile Desktop | Forget projects, allowed plugins and tools, build history and settings. Images, servers and caches stay. |
| JSX Projects | Node | The Node 26 or later that JSX projects run on, as an absolute path. Empty: the newest found in Homebrew, nvm, fnm, Volta or `/usr/local`, then the downloaded one. |
| | Offer JSX tools to AI agents | The MCP server's JSX tools. Agents still can't grant a project anything. |
| Experimental | Show experimental features | Features still in development. |
| | Follow tags automatically | (Shown when experimental is on.) When a build or tag moves a server's tag, update the server to the new image. |
| About | sitefile | The sitefile version built into the app. |

## Siri & Apple Intelligence

A global **Enable Siri & Apple Intelligence** switch and one switch per action, all off by
default, with a count of how many are enabled. Actions are grouped as Overview, Servers, Images,
Builds, JSX Projects and Folder Projects. Turning an action off blocks every future run, from
Siri, Shortcuts, Spotlight or a saved shortcut. An Availability section says whether App Intents
work on this Mac. They need a properly signed build; see [Siri and Shortcuts](/sitefile-desktop/siri/).
