---
title: "aimatey Documentation"
description: "Introduction to aimatey, the Universal AI Adapter System: one interface for many AI providers with routing, middleware, and streaming."
---

Welcome to **aimatey** - the Universal AI Adapter System that lets you write once and run anywhere.

> Previously published as the unscoped `aimatey.*` family (e.g.
> `aimatey-core@0.3.4`, `aimatey-backend@0.9.0`). Renamed to
> `@johnhenry/aimatey-*` and restarted at 0.0.0 — a new address and era, not a
> maturity signal.

## Install

```bash
npm install @johnhenry/aimatey
```

The umbrella package includes the commonly-used adapters and utilities. For
finer-grained installs (core, frontends, backends, middleware, and more), see
[Installation](/aimatey/getting-started/installation).

## What is aimatey?

aimatey is a comprehensive TypeScript/JavaScript framework that provides a unified interface for interacting with multiple AI providers. Write your code once using any standard format (OpenAI, Anthropic, Google, etc.) and seamlessly switch between 24+ AI providers without changing your application code.

```typescript
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';

// Write code in OpenAI format, execute with Anthropic
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey: 'your-key' })
);

const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## Key Features

### 🔌 Universal Compatibility
- **24+ AI Providers**: OpenAI, Anthropic, Google Gemini, Cohere, Groq, DeepSeek, Ollama, and more
- **7 Input Formats**: Write in your preferred API format
- **Seamless Switching**: Change providers without changing code

### 🎯 Smart Routing
- **Load Balancing**: Round-robin, weighted, priority-based routing
- **Automatic Failover**: Built-in redundancy and error recovery
- **Cost Optimization**: Route to cheapest provider based on quality requirements
- **Custom Strategies**: Build your own routing logic

### 🔧 Powerful Middleware
- **Logging**: Track all requests and responses
- **Caching**: Reduce costs with intelligent caching
- **Retry Logic**: Automatic retries with exponential backoff
- **Cost Tracking**: Monitor API spending in real-time
- **Transforms**: Modify requests/responses on-the-fly

### 🚀 Production Ready
- **100% Test Coverage**: All core packages fully tested
- **TypeScript First**: Complete type safety
- **Edge Compatible**: Deploy to Cloudflare Workers, Vercel Edge, Deno Deploy
- **Framework Agnostic**: Works with Express, Hono, Next.js, and more

## Quick Start

Get started with aimatey in under 5 minutes:

1. **[Installation](/aimatey/getting-started/installation)** - Install packages and set up your environment
2. **[Quick Start](/aimatey/getting-started/quick-start)** - Your first Bridge in 30 seconds
3. **[Core Concepts](/aimatey/getting-started/core-concepts)** - Understand the architecture
4. **[Examples](/aimatey/examples)** - 34 runnable examples from basic to advanced

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   Frontend Adapter                           │
│        (OpenAI, Anthropic, Google, Ollama, etc.)            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              Intermediate Representation (IR)                │
│               (Universal Format Layer)                       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Middleware Stack                          │
│         (Logging, Caching, Retry, Transform, etc.)          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Backend Adapter                           │
│      (OpenAI, Anthropic, Gemini, Groq, Ollama, etc.)       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                      AI Provider                             │
└─────────────────────────────────────────────────────────────┘
```

## Use Cases

### Provider Migration
Switch from OpenAI to Anthropic (or any provider) with zero code changes:

```typescript
// Before
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new OpenAIBackendAdapter({ apiKey })
);

// After - just change the backend
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey })
);
```

### Cost Optimization
Route simple queries to cheaper models, complex ones to powerful models:

```typescript
// A Router is a BackendAdapter: register backends by name, then give it to a Bridge.
const router = new Router({
  routingStrategy: 'custom',
  customRouter: async (request, availableBackends) => {
    const complexity = analyzeComplexity(request);
    const preferred =
      complexity < 25 ? 'deepseek'   // cheapest
      : complexity < 50 ? 'groq'
      : complexity < 80 ? 'openai'
      : 'anthropic';                 // most capable
    return availableBackends.includes(preferred) ? preferred : (availableBackends[0] ?? null);
  },
});

router
  .register('deepseek', deepseek)
  .register('groq', groq)
  .register('openai', openai)
  .register('anthropic', anthropic);

const bridge = new Bridge(new OpenAIFrontendAdapter(), router);
```

### High Availability
Automatic failover when providers go down:

```typescript
const router = new Router({
  routingStrategy: 'explicit',
  defaultBackend: 'primary',
  fallbackStrategy: 'sequential',
  healthCheckInterval: 60000,
  enableCircuitBreaker: true,
});

router
  .register('primary', primary)
  .register('secondary', secondary)
  .register('tertiary', tertiary);

router.setFallbackChain(['secondary', 'tertiary']);

const bridge = new Bridge(new OpenAIFrontendAdapter(), router);
```

## Packages Overview

aimatey is built as a monorepo of 24 packages — 23 published to npm under the `@johnhenry` scope. Highlights:

| Package | Purpose | Status |
|---------|---------|--------|
| **@johnhenry/aimatey-core** | Bridge & Router | ✅ Production |
| **@johnhenry/aimatey-frontend** | 7 input format adapters | ✅ Production |
| **@johnhenry/aimatey-backend** | 24 provider adapters | ✅ Production |
| **@johnhenry/aimatey-middleware** | Logging, caching, retry, etc. | ✅ Production |
| **@johnhenry/aimatey-http** | HTTP server integrations | ✅ Production |
| **@johnhenry/aimatey-wrapper** | Drop-in SDK replacements | ✅ Production |
| **@johnhenry/aimatey-cli** | Command-line interface | ✅ Production |
| **@johnhenry/aimatey-react-hooks** | React hooks | ✅ Production |
| **@johnhenry/aimatey-patterns** | Production integration patterns | ✅ Production |
| **@johnhenry/aimatey-mcp** | MCP (Model Context Protocol) tool calling | ✅ Production |
| **@johnhenry/aimatey-utils** | Shared utilities | ✅ Production |
| **@johnhenry/aimatey-types** | TypeScript definitions | ✅ Production |

[View all packages →](/aimatey/packages/overview)

## Status

- **23 packages published** to npm under the `@johnhenry` scope, all currently
  at 0.0.0 — the first release cycle under the new names (see the provenance
  note above).
- **1522 tests** pass across the monorepo (`npm test`).
- Developed in the open in the
  [johnhenry/aimatey monorepo](https://github.com/johnhenry/aimatey).

## Community & Support

- **[GitHub](https://github.com/johnhenry/aimatey)** - Source code, issues, discussions
- **[npm](https://www.npmjs.com/package/@johnhenry/aimatey)** - Package registry
- **[Examples](/aimatey/examples)** - 34 working examples
- **[API Reference](/aimatey/api)** - Complete API documentation

## What's Next?

Ready to get started? Here are some recommended paths:

### For Beginners
1. Read the [Core Concepts](/aimatey/getting-started/core-concepts)
2. Follow the [Quick Start Guide](/aimatey/getting-started/quick-start)
3. Try the [Hello World Example](https://github.com/johnhenry/aimatey/tree/main/packages/aimatey-docs/examples/01-basics/01-hello-world.ts)

### For Production
1. Review [Production Patterns](https://github.com/johnhenry/aimatey/tree/main/packages/aimatey-docs/examples/07-advanced-patterns)
2. Explore [Integration Patterns](/aimatey/patterns)
3. Check [Testing Strategies](/aimatey/guides/testing)

### For Developers
1. Study the [IR Format](/aimatey/guides/architecture/ir-format)
2. Browse [Provider Documentation](/aimatey/packages/overview)
3. Review the [API Reference](/aimatey/api)

---

**Ready to build?** Start with [Installation →](/aimatey/getting-started/installation)
