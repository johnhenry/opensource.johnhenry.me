---
title: "Sitefile Desktop"
description: "A Mac app for sitefile: drop a folder on it and get a URL, build Sitefile projects into images and serve them, and see every server, image, build and plugin in one window. Everything stays on your Mac."
sidebar:
  order: 0
---

**Sitefile Desktop** is a Mac app for [sitefile](/sitefile/), the static-site image builder. Drop a folder on it and get a
URL; build a Sitefile project into an image and serve it; see every server, image, build and plugin in one window, and
keep it all running from the menu bar. Everything stays on your Mac.

:::caution[Not public yet]
The source repository, [johnhenry/sitefile-desktop](https://github.com/johnhenry/sitefile-desktop), is not public yet, so
the GitHub links on these pages (releases, issues, the contributor docs) will not resolve until it is. The install steps
below are written for the release URLs it will have.
:::

<!-- TODO(johnhenry/sitefile-desktop#236): the repo is private. Once it is public, check that the releases and
     contributor-doc links on this section's pages resolve, then delete this comment and the "Not public yet" note above. -->

![The Servers page: four servers, two running](/sitefile-desktop/servers-light.png)

![The same page in dark mode](/sitefile-desktop/servers-dark.png)

## What it does

- **Servers.** Serve a folder, a site archive or an image on `127.0.0.1` (or on your network, if you choose). Start,
  stop, restart, pin to an image, read the logs and requests, and copy the address.
- **Images.** Browse sitefile's image store: inspect, tag, save, serve, prune.
- **Builds.** Build a Sitefile project into an image with tags and build arguments, watch it run, read the log, rebuild,
  and compare two builds.
- **Projects.** Remember Sitefile projects, plain folders (save one as an image on every change if you like) and JSX
  projects.
- **Plugins.** See every plugin and external tool a project uses, and allow or revoke each one. Nothing runs until you
  allow it.
- **Activity.** What was done and by whom (you, the web UI, Siri or an agent), with Undo.
- **Menu bar.** A menu-bar item with the running servers; the app can run without a window.
- **Web UI.** View > Open Web UI opens the same screens in your browser, served from the app on this Mac only.
- **MCP for agents.** An MCP server in the bundle lets Claude Code and other agents build and serve for you. They cannot
  grant trust. See [MCP server](/sitefile-desktop/mcp/).
- **Siri and Shortcuts.** App Intents for the common actions, all off until you turn them on. See
  [Siri and Shortcuts](/sitefile-desktop/siri/).

![Builds](/sitefile-desktop/builds-light.png)

![Plugins and trust, dark](/sitefile-desktop/plugins-dark.png)

## Install

<!-- TODO(johnhenry/sitefile-desktop#236): these release URLs 404 until the repo is public and a release is published. -->

1. Download `Sitefile-Desktop-<version>-arm64.zip` (and `SHA256SUMS`) from the
   [latest release](https://github.com/johnhenry/sitefile-desktop/releases/latest).
2. Unzip it and drag **Sitefile Desktop** to Applications.
3. The app is signed ad hoc and not yet notarized, so Gatekeeper blocks the first launch. Right-click the app and choose
   **Open**, or run `xattr -dr com.apple.quarantine "/Applications/Sitefile Desktop.app"`. Notarized builds are tracked in
   [#232](https://github.com/johnhenry/sitefile-desktop/issues/232).

Siri and Shortcuts need a properly signed build, so they don't work in the current releases.

A Homebrew cask is coming (`brew install --cask`), from a tap that isn't published yet. Until then, use the download
above.

**Requirements:** macOS 27 or later, on Apple silicon (releases are arm64 for now).

## Quick start

1. Open the app. The first screen offers **Build the Example**, **Serve a Folder…** and **Add a Project…**.
2. Choose **Serve a Folder…** (or File > Serve…, Command-N) and pick a folder of HTML.
3. The server appears on the Servers page with its address. Open it in the browser.
4. To open it on your phone, choose **Share to Phone** on the server and scan the QR code. It asks for a password, and
   anyone on the network who has it can open the site, so use networks you trust.

More in the [tutorial](/sitefile-desktop/tutorial/) and the [how-to guides](/sitefile-desktop/how-to/).

## How it relates to sitefile

[sitefile](/sitefile/) builds sites from a Sitefile into images and serves them, from the command line. Sitefile Desktop
is a window onto the same thing, built like Podman Desktop rather than Docker Desktop: there is no daemon, it reads and
writes the same `~/.sitefile` as the CLI, and quitting the app leaves your servers running (unless you set Settings >
General to stop them). Everything the app does, you can also do with `sitefile`; Settings > General can install a
`sitefile` command that links to the one in the app. See [How it works](/sitefile-desktop/explanation/).

## Documentation

The pages here follow the [Diataxis](https://diataxis.fr/) split.

| I want to… | Read |
| --- | --- |
| Learn the app by doing one thing end to end | [Tutorial: your first site](/sitefile-desktop/tutorial/) |
| Get a particular job done | [How-to guides](/sitefile-desktop/how-to/) |
| Look up a setting, a menu item or a key | [Settings](/sitefile-desktop/settings/), [Keyboard shortcuts and menus](/sitefile-desktop/keyboard-shortcuts/) |
| Drive the app from code or an agent | [API reference](/sitefile-desktop/api/), [MCP server](/sitefile-desktop/mcp/), [Local service API](/sitefile-desktop/local-api/), [Siri and Shortcuts](/sitefile-desktop/siri/) |
| Understand how it works and why | [How it works](/sitefile-desktop/explanation/) |
| Check what it does with your data | [Security](/sitefile-desktop/security/), [Privacy](/sitefile-desktop/privacy/) |

For contributors, the design notes, plan and releasing docs live in the
[repository](https://github.com/johnhenry/sitefile-desktop/tree/main/docs/dev).

## Security and privacy

The app sends nothing anywhere by itself: no telemetry, no accounts, no update check. The web UI's service binds
`127.0.0.1`, checks the `Host` header and needs a start-up token. Plugins and tools run only after you allow them, per
project; agents and Siri can't allow them. See [Security](/sitefile-desktop/security/) (including how to report a
problem) and [Privacy](/sitefile-desktop/privacy/).

## License

MIT. See the [repository](https://github.com/johnhenry/sitefile-desktop/blob/main/LICENSE).
