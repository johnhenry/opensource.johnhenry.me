---
title: Kernel
description: browsermesh-kernel — a capability-secure browser microkernel with resource handles, IPC, tracing, and chaos engineering. Zero dependencies, standalone.
---

`@johnhenry/browsermesh-kernel` is deliberately the odd one out in this family: a capability-secure browser microkernel — resource handles, byte streams, IPC, a service mesh, structured tracing, chaos engineering, and tenant isolation. It has **zero npm dependencies**, including zero dependency on `@johnhenry/browsermesh-primitives` — it doesn't do mesh networking or peer identity at all. Think of it as a sibling project that happened to come out of the same private monorepo, not a mesh-stack layer.

```sh
npm install @johnhenry/browsermesh-kernel
```

```js
import { Kernel, KERNEL_CAP } from '@johnhenry/browsermesh-kernel'

const kernel = new Kernel()

// Create a tenant with scoped capabilities
const tenant = kernel.createTenant({
  capabilities: [KERNEL_CAP.CLOCK, KERNEL_CAP.IPC, KERNEL_CAP.STDIO],
  env: { MODE: 'sandbox' },
})

const handle = kernel.resources.allocate('stream', myStream, tenant.id)
kernel.tracer.emit({ type: 'custom', tenant: tenant.id })

kernel.destroyTenant(tenant.id)
kernel.close()
```

### Subsystems

| Module | Key exports |
| --- | --- |
| constants / errors | `KERNEL_DEFAULTS`, `KERNEL_CAP`, `KERNEL_ERROR`, `KernelError` + 7 subclasses |
| resource-table | `ResourceTable` — handle-based `res_N` resource allocation |
| byte-stream | `BYTE_STREAM`, `isByteStream`, `asByteStream`, `createPipe`, `pipe`, `devNull`, `compose` |
| clock / rng | `Clock` (fixed, for deterministic tests), `RNG` (seeded xorshift128+) |
| caps | `buildCaps`, `requireCap`, `CapsBuilder` — capability enforcement |
| message-port | `KernelMessagePort`, `createChannel` — IPC |
| service-registry | `ServiceRegistry` — `svc://` service lookup with `onLookupMiss` |
| tracer | `Tracer` — ring-buffer, `AsyncIterable` trace event stream |
| logger | `Logger`, `LOG_LEVEL` |
| chaos | `ChaosEngine` — fault injection |
| env | `Environment` — immutable env vars |
| signal / stdio | `SIGNAL`, `SignalController` (TERM/INT/HUP + `AbortSignal`), `Stdio` |
| kernel | `Kernel` — the facade tying every subsystem together |

`Clock` defaults to real time (`Date.now()`/`performance.now()`) whether constructed standalone or via `new Kernel()` with no `opts.clock` — it does **not** default to a fixed/deterministic clock, despite "fixed for testing" reading like the default at a glance. Determinism only kicks in if you explicitly construct `new Clock({ wallFn, monoFn })` (or pass `opts.clock` to `Kernel`) with your own fixed functions — do that explicitly whenever you need `kernel.tracer`'s event stream or `kernel.uptime` to be reproducible in tests.

### `Kernel` facade getters worth knowing about

Beyond the subsystem getters (`kernel.resources`, `kernel.tracer`, `kernel.clock`, `kernel.rng`, `kernel.log`, `kernel.chaos`, `kernel.services`, `kernel.signals`), the facade exposes three simple state getters that are easy to miss reading the module's top-level JSDoc alone: `kernel.startTime` (wall time at construction), `kernel.uptime` (elapsed time since construction, computed from the kernel's own `Clock` — not `Date.now()`, so it respects an injected fixed `Clock` in tests), and `kernel.tenantCount` (live count of active tenants — a cheap size check that doesn't require iterating `listTenants()`).

### Origin

Extracted from `clawser`, a private browser agent workspace, where it underpins workspace tenants, shell pipes, MCP service registration, provider cost tracing, sandboxed code execution, and daemon IPC — all wired through opt-in hooks (`clawser-kernel-integration.js`) that are no-ops when the kernel isn't active. That integration file isn't part of this published package (it lives in the private workspace), but it's worth knowing the "kernel present vs. kernel absent" no-op-hook pattern exists as prior art if you're evaluating how to wire the kernel into your own host application.

### Provenance

Extracted from the private `clawser` monorepo (previously `packages/browsermesh-kernel`, at path `web/packages/kernel`), where it was manually published to npm, unscoped, as `browsermesh-kernel@0.1.0` (2026-07-17), with no CI ever automating that publish. First release as `@johnhenry/browsermesh-kernel`; version restarts at `0.0.0`.
