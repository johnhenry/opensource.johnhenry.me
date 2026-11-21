---
title: "Security"
description: "The security model, what stays yours, and how to report a vulnerability."
sidebar:
  order: 10
---

## Security model

Sitefile Desktop starts servers, runs builds, and can run the plugins and
external tools a Sitefile names. That is a lot of power, so the app is built to
keep it on your Mac and under your say-so.

**What Sitefile Desktop guarantees:**

- **The local service is local.** The service behind the web UI
  (`sitefile-desktop-service`) binds `127.0.0.1` only, never a public
  interface. Every request must carry a `Host` of `127.0.0.1:<port>` or
  `localhost:<port>` for the bound port (this stops DNS rebinding), and every
  API request needs the random token made at each start-up. The token is never
  written to disk, so a web page that can't see it can't call the service. The
  same checks guard the agent (MCP) endpoint the service serves.
- **Trust is yours, per project, and asked for.** JavaScript plugins, external
  tools (`TOOL`), network hosts a build may contact, and the hosts that may
  receive a secret are each allowed per project, and the app asks before it
  allows any. An approval is tied to the code you approved: if a plugin or tool
  changes, it stops holding until you allow it again. Builds run in sitefile's
  strict network mode and reach only the hosts you allowed. Wasm plugins are
  sandboxed, and JavaScript plugins run under Node's permission model.
- **Agents and Siri can't grant trust.** AI agents over MCP and Siri or
  Shortcuts can build and serve, but have no way to allow a plugin, a tool, a
  host or a JSX project's access. A build that needs one says what it needs,
  and you allow it in the app. Siri's tools are off until you turn each on.
- **Servers on the network are limited per device.** A server that listens on
  the network (not loopback) gets a limit on connections from each device,
  10 by default.
- **The app sends nothing anywhere by itself.** No telemetry, no accounts, no
  crash reports, no update check. See [PRIVACY.md](/sitefile-desktop/privacy/).

**What is still yours:**

- **Anything you allow runs with your privileges.** An allowed external tool is
  a program running as you, and a Sitefile or JSX project can ask for one.
  Allow only what you have read or trust. A JavaScript plugin is limited, but
  that is a seat belt, not a vault.
- **A server you put on the network is reachable by your network.** Everyone
  who can reach that address and port can read what it serves. Use a password
  (and HTTPS) if the network isn't yours alone. A public link
  (Cloudflare or Tailscale Funnel) puts a server on the internet; it needs a
  password and you start it yourself.
- **Agents can start servers.** An agent you connect over MCP can serve a
  folder or image, including on the network, and run builds of what is in your
  projects, under the limits above. Connect only agents you trust with that.
- **Other processes running as you are out of scope.** The service's start-up
  URL and token can be read by another process of yours, and by a browser
  extension that can see the page.
- **The app is not notarized yet**, and builds from this repo are ad-hoc
  signed. Verify what you download against its `SHA256SUMS`.

## Reporting a vulnerability

Please report it privately with GitHub's private vulnerability reporting:
open the repository's **Security** tab and choose **Report a vulnerability**
(<https://github.com/johnhenry/sitefile-desktop/security/advisories/new>). Don't
open a public issue for it.

Say what you found, how to reproduce it and which version you used. You will
get a reply and, if it is confirmed, a fix and a credit unless you'd rather not
have one. The supported version is the latest release.
