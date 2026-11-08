---
title: "Security model"
description: "What building someone else's Sitefile can and cannot do: reads stay in the context, remote means public HTTPS, pins are enforced, nothing executes unless you allow it by name."
sidebar:
  order: 4
---

A Sitefile can come from someone else: a Git URL, a theme image, a shared stage. So a build treats its Sitefile as
untrusted input. Templates, imports and WebAssembly plugins are data. JavaScript plugins and external tools are code,
and they run only when you name them on the command line.

## What sitefile guarantees

- **Local reads stay inside the build context.** No `..`, absolute paths or symlinks out. Hard-linked files are refused
  (`E_HARDLINK`) unless `--allow-hardlinks`, because a hard link can alias a file outside the context.
- **Remote imports are `https:` only, to public addresses only.** Checked when connecting (so DNS rebinding can't slip
  past) and on every redirect; bodies are size- and time-limited and never decompressed or executed.
- **Pins are enforced.** An unpinned URL is locked in `Sitefile.lock` and must match afterwards; `--strict-pins` refuses
  any remote input that is not pinned, before anything is fetched.
- **Git imports run no `git`.** Protocol v2 over the same HTTPS client and policy, every object's SHA-1 checked, symlinks
  kept inside the tree, submodules refused.
- **Secrets go only where they are sent.** A `--secret` reaches only its import's own origin, and never the output,
  caches, `Sitefile.lock`, vendor files, provenance, traces or messages.
- **Nothing executes unless you allow it by name.** JavaScript plugins need `--allow-plugin <name>` and run under Node's
  permission model; `TOOL` programs need `--allow-exec <name>` and run with argv only, no shell, a scrubbed environment.
  A Sitefile cannot allow itself. Import-free WebAssembly plugins run under a time and memory limit with no flag.
- **No silent overwrites.** Different content at an existing path fails without `--overwrite`; paths differing only in
  case always fail; every path is Unicode NFC.
- **Exports are atomic**, and a non-empty destination outside the context is replaced only with `--force`.
- **`sitefile serve` listens on `127.0.0.1`**, GET and HEAD only, no directory listings, unless `-p` names another
  address.

## What is still yours

- **What you allow is trusted code.** `--allow-plugin` on a Sitefile you did not write runs its author's JavaScript on
  your machine (Node's permission model is a seat belt, not a defence against malice). `--allow-exec` runs a program
  from your `PATH` with arguments the Sitefile chose. Read them first.
- **The content you build.** Nothing is escaped without `RENDER --escape=html`, and `${x|raw}` opts out per value.
  Markdown and data imported from elsewhere end up in your pages.
- **Whether the first locked version was the right one.** The lockfile catches a change; it can't tell you the content
  you locked first was what you meant. Use `INTEGRITY`, `@sha256:` and `--strict-pins` for builds that must be
  reproducible.
- **Signing.** `EXPORT … AS wbn` writes an unsigned Web Bundle; signing (for an Isolated Web App, say) happens outside
  Sitefile.
- **Every widening flag.** `--allow-http`, `--allow-private-network`, `--allow-hardlinks`, `--force` and `serve -p
  0.0.0.0:…` each turn one guarantee off for that build.
