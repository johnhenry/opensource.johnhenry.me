---
title: "Privacy"
description: "What the app stores, where, and what it never sends."
sidebar:
  order: 11
---

Sitefile Desktop keeps everything on your Mac.

- **No telemetry, no accounts, no analytics, no crash reporting.** The app
  doesn't phone home.
- **No network calls of its own.** The only traffic is what you ask for: the
  fetches your builds make (to the hosts you allowed), what your servers
  serve and receive, the public links you start, and, if you choose to
  download Node for JSX projects, one download from nodejs.org. There is no
  update check yet; when one is added, this file will say so.
- **Servers listen where you tell them to.** By default, on loopback. On the
  network, only when you publish them there; with Bonjour on (Settings), the
  names of servers shared on the local network are advertised to it.

## What is stored, and where

- `$SITEFILE_HOME/desktop/` (default `~/.sitefile/desktop/`): the app's own
  state, as plain files: settings, registered projects, trust decisions, pins,
  build history and logs, the activity list (what was done, and by whom: you,
  the web UI, Siri or an agent), thumbnails, and certificates you create.
- `~/.sitefile/` (`$SITEFILE_HOME`): sitefile's image store, server records and
  logs, which the CLI shares.
- The macOS Keychain: server passwords.
- `~/Library/Application Support/Sitefile Desktop/runtimes/`: Node, only if you
  asked the app to download it.

Delete any of these to remove that data. Diagnostics reports are written only
when you ask for one, and you choose where; a proxy password is masked.
