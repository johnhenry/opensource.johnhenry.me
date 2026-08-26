---
title: '@johnhenry/math-grapher'
description: A headless, DOM-less reactive-cell runtime that an AI agent can drive over MCP — no arbitrary code execution.
---

```bash
npx @johnhenry/math-grapher
```

A session runtime built on [`@johnhenry/math`](/math/math/)'s `CellGraph`, exposed as an MCP server. An agent creates a session, defines cells, and reads computed values — the way you'd drive a spreadsheet, except every operation comes from a fixed catalog.

## Early-stage — treat the API as unstable

Version `0.0.0`, one test file, v1 freshly implemented. The MCP *tool contract* below is the settled part ([docs/design.md](https://github.com/johnhenry/math-grapher/blob/main/docs/design.md) is the design of record); the library surface underneath it can still move. Pin exact versions, and don't build anything yet that can't tolerate a breaking release.

## The design constraint

The agent never supplies code. It supplies **op names and arguments**, resolved against a server-side catalog (`OP_CATALOG`). There is no `eval`, no dynamic import, no expression compiler reachable from the wire.

That's the whole point: an agent-drivable compute surface where the blast radius is the catalog, not the runtime.

## The tool surface

| Tool | What it does |
|---|---|
| `session_open` | Open a session (`generic` or `graph-theory` preset), optionally seeding cells and granting capabilities |
| `session_close` / `session_list` | Lifecycle. Sessions are **in-memory** — a server restart loses them all |
| `session_set_cell` / `session_get_cell` / `session_list_cells` | Free-cell writes and reads. Setting over a computed cell **demotes it to a free cell** |
| `session_define` | Declare a computed cell as a JSON define-spec: an op from the catalog plus args, with `{"$cell": "name"}` live references |
| `session_explain_cell` | One level of provenance: a cell's op, raw args, and immediate dependencies with current values |
| `session_snapshot` / `session_resume` | Serialize free values + define-specs; reconstruct an equivalent live session, possibly in a different process |

Ops today: `math_eval`, `graph_parse_edge_list`, `graph_analyze`, `graph_bfs`/`dfs`/`dijkstra`.

## Snapshots don't carry authority

`session_snapshot` captures free-cell values and define-specs — **not** computed results (they re-derive lazily) and **not** capabilities. Resuming a snapshot that used a capability-gated op fails outright unless `session_resume` re-grants the capability. That's deliberate: a resumed session is exactly as trusted as a freshly opened one. (No op in the current catalog declares a capability yet — the gate exists ahead of the first write-capable op, mirroring the family's default-off write posture.)

## Resource guards

All modest by default, all overridable by env var: `MATH_GRAPHER_MAX_SESSIONS` (16), `MATH_GRAPHER_MAX_CELLS` (512), `MATH_GRAPHER_EVAL_BUDGET_MS` (250), `MATH_GRAPHER_MAX_PAYLOAD_BYTES` (262144). The eval budget is checked *between* cell recomputes — a runaway cascade fails fast with a structured error, but a single op that overruns internally can't be preempted.

## Library surface

It's usable as a library as well as a binary:

```ts
import { buildServer, SessionTable, OP_CATALOG, PRESETS } from '@johnhenry/math-grapher';
import { CellGraph } from '@johnhenry/math-grapher'; // re-exported from @johnhenry/math
```

`SessionTable` manages sessions and enforces `SessionLimits` (configurable, with `limitsFromEnv()`). `PRESETS` supplies starting graphs per `SessionKind`. Transports: stdio by default, Streamable HTTP via `--http [port]`.

## Not on JSR

Every sibling in this family dual-publishes to JSR. This one doesn't, and that's deliberate rather than an oversight.

JSR's slow-types check passes cleanly. The blocker is upstream: `@modelcontextprotocol/sdk` has no explicit export entry for `./server/mcp.js`, so it falls through a `"./*"` wildcard whose types target is `./dist/esm/*.d.ts`. The wildcard captures the extension too, so the types path resolves to `mcp.js.d.ts` — a file that doesn't exist. TypeScript papers over this via a `typesVersions` fallback; Deno implements `exports` without `typesVersions` and fails with `TS2307`, which then cascades into implicit-`any` on every zod-inferred callback.

Tracked upstream at [modelcontextprotocol/typescript-sdk#2701](https://github.com/modelcontextprotocol/typescript-sdk/issues/2701) with a proposed fix in [#2702](https://github.com/modelcontextprotocol/typescript-sdk/pull/2702).
