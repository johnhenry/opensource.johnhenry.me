---
title: "API reference"
description: "The local service, the MCP server, and App Intents: which to use and where each lives."
sidebar:
  order: 6
---

Three ways to drive Sitefile Desktop from outside its window. Each has its own full reference;
this page says which to use and where it lives. None can allow a plugin or tool: only you can,
in the app.

| Interface | For | Reference |
|---|---|---|
| Local service (HTTP and server-sent events on `127.0.0.1`) | The web UI, scripts on this Mac | [docs/API.md](/sitefile-desktop/local-api/) |
| MCP server (stdio, or Streamable HTTP at `/mcp` on the service) | AI agents such as Claude Code | [docs/MCP.md](/sitefile-desktop/mcp/) |
| App Intents | Siri, Shortcuts, Spotlight | [docs/SIRI.md](/sitefile-desktop/siri/) |

## In the app bundle

```
/Applications/Sitefile Desktop.app/Contents/MacOS/sitefile-desktop-service
/Applications/Sitefile Desktop.app/Contents/MacOS/sitefile-desktop-mcp
```

- **Local service.** View > Open Web UI starts it on 127.0.0.1 and opens the browser at an
  address with a start-up token; it stops when the app quits. It binds loopback only, checks
  the `Host` header and requires the token. Flags, endpoints and events: [API.md](/sitefile-desktop/local-api/).
- **MCP server.** `sitefile-desktop-mcp` speaks MCP on stdio over the store at `SITEFILE_HOME`
  (default `~/.sitefile`). Set-up commands: [Connect an agent over MCP](/sitefile-desktop/how-to/#connect-an-agent-over-mcp). Tools:
  [MCP.md](/sitefile-desktop/mcp/). The JSX tools are off until you turn on
  [Offer JSX tools to AI agents](/sitefile-desktop/settings/#advanced).
- **Siri and Shortcuts.** Off until you turn on actions in
  [Settings](/sitefile-desktop/settings/#siri--apple-intelligence).

## The sitefile command

Everything the app does, `sitefile` does on the command line, over the same `~/.sitefile`.
Settings > General can install a `sitefile` command that links to the one in the app.
