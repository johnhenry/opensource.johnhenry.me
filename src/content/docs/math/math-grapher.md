---
title: '@johnhenry/math-grapher'
description: A headless, DOM-less reactive-cell runtime that an AI agent can drive over MCP — no arbitrary code execution.
---

```bash
npx @johnhenry/math-grapher
```

A session runtime built on `@johnhenry/math`'s `CellGraph`, exposed as an MCP server. An agent creates a session, defines cells, and reads computed values — the way you'd drive a spreadsheet, except every operation comes from a fixed catalog.

## The design constraint

The agent never supplies code. It supplies **op names and arguments**, resolved against a server-side catalog (`OP_CATALOG`). There is no `eval`, no dynamic import, no expression compiler reachable from the wire.

That's the whole point: an agent-drivable compute surface where the blast radius is the catalog, not the runtime.

## Library surface

It's usable as a library as well as a binary:

```ts
import { buildServer, SessionTable, OP_CATALOG, PRESETS } from '@johnhenry/math-grapher';
import { CellGraph } from '@johnhenry/math-grapher'; // re-exported from @johnhenry/math
```

`SessionTable` manages sessions and enforces `SessionLimits` (configurable, with `limitsFromEnv()`). `PRESETS` supplies starting graphs per `SessionKind`.

## Not on JSR

Every sibling in this family dual-publishes to JSR. This one doesn't, and that's deliberate rather than an oversight.

JSR's slow-types check passes cleanly. The blocker is upstream: `@modelcontextprotocol/sdk` has no explicit export entry for `./server/mcp.js`, so it falls through a `"./*"` wildcard whose types target is `./dist/esm/*.d.ts`. The wildcard captures the extension too, so the types path resolves to `mcp.js.d.ts` — a file that doesn't exist. TypeScript papers over this via a `typesVersions` fallback; Deno implements `exports` without `typesVersions` and fails with `TS2307`, which then cascades into implicit-`any` on every zod-inferred callback.

Tracked upstream at [modelcontextprotocol/typescript-sdk#2701](https://github.com/modelcontextprotocol/typescript-sdk/issues/2701) with a proposed fix in [#2702](https://github.com/modelcontextprotocol/typescript-sdk/pull/2702).
