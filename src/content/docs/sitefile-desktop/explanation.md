---
title: "How it works"
description: "Why the app behaves as it does: a window onto sitefile, servers that outlive the app, trust, local by default."
sidebar:
  order: 3
---

Background reading: why the app behaves as it does. For steps, see the
[how-to guides](/sitefile-desktop/how-to/); for lookups, the reference pages in the [index](/sitefile-desktop/).

## A window onto sitefile

[sitefile](https://github.com/johnhenry/sitefile) builds sites from a Sitefile into images and
serves them from the command line. Sitefile Desktop shows and drives the same things: servers,
images, builds, projects and plugins. It is built like Podman Desktop rather than Docker Desktop:
there is no daemon. The disk is the source of truth, the app and the `sitefile` command read and
write the same `~/.sitefile`, and either one sees what the other did.

## Servers outlive the app

Each server is its own process, so quitting the app leaves your servers running. Settings >
General can stop them on quit instead, and Settings > Servers can start again the ones that were
running after a restart. The menu-bar item exists so the app can run without a window.

## Trust

A Sitefile can name plugins and external tools, and those run code on your Mac. So nothing runs
until you allow it, per project. A plugin whose code changed, or a tool that changed, stops
holding until you allow it again. Wasm plugins can't reach files or the network, so they need no
allowing. Only you, in the app, can grant trust: agents over MCP and Siri can ask for a build
and are told what needs allowing, but cannot allow it. Networks are guarded the same way: builds
reach only the hosts a project allows unless you change that in Settings > Network.
[SECURITY.md](/sitefile-desktop/security/) has the full model and how to report a problem.

## Local by default

A server listens on `127.0.0.1`, so only this Mac can open it, until you choose Your Network or
Share to Phone, which adds a password kept in the Keychain. The web UI's service binds loopback,
checks the `Host` header and needs a start-up token, because it can run builds and plugins. The
app sends nothing anywhere by itself: no telemetry, no accounts, no update check
([PRIVACY.md](/sitefile-desktop/privacy/)).

## Where state lives

- sitefile's images, server records, caches and lock: `~/.sitefile/`, owned by sitefile. The app
  goes through sitefile's code and never writes them itself.
- The app's own state (projects, allowed plugins, settings, build history, the example):
  `~/.sitefile/desktop/`.
- Passwords: the Keychain.

## One backend, several fronts

The Mac app, the web UI, the MCP server and Siri are all frontends over one contract, so they
agree about what exists and the Activity page can say who did what (you, the web UI, Siri or an
agent). For the architecture itself, contributors read [the plan](https://github.com/johnhenry/sitefile-desktop/blob/main/docs/dev/PLAN.md).
