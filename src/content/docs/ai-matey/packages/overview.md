---
title: "Packages Overview"
description: "Map of the ai.matey monorepo: all 23 published @johnhenry/aimatey-* packages, what each one does, and which ones to install."
---

ai.matey is organized as a monorepo of 24 packages — 23 published to npm under the `@johnhenry` scope, plus the private package that builds this documentation site. This modular approach allows you to install only what you need.

## Package Architecture

```
@johnhenry/aimatey (umbrella package)
├── Foundation Packages (6)
│   ├── @johnhenry/aimatey-core          # Bridge, Router, Middleware
│   ├── @johnhenry/aimatey-types         # TypeScript types
│   ├── @johnhenry/aimatey-errors        # Error classes
│   ├── @johnhenry/aimatey-utils         # Utilities
│   ├── @johnhenry/aimatey-testing       # Test utilities
│   └── @johnhenry/aimatey               # Umbrella (convenience)
│
├── Adapter Packages (3)
│   ├── @johnhenry/aimatey-frontend        # Frontend adapters (7 formats)
│   ├── @johnhenry/aimatey-backend         # Backend adapters (cloud + local providers)
│   └── @johnhenry/aimatey-backend-browser # Browser backends (3 providers)
│
├── Middleware & Patterns (2)
│   ├── @johnhenry/aimatey-middleware    # 10 middleware types
│   └── @johnhenry/aimatey-patterns      # Production integration patterns
│
├── Tool Calling (1)
│   └── @johnhenry/aimatey-mcp           # MCP (Model Context Protocol) tools
│
├── HTTP Integration (2)
│   ├── @johnhenry/aimatey-http-core     # Core HTTP utilities
│   └── @johnhenry/aimatey-http          # Framework integrations (6)
│
├── React Integration (4)
│   ├── @johnhenry/aimatey-react-core    # Core hooks
│   ├── @johnhenry/aimatey-react-hooks   # Extended hooks
│   ├── @johnhenry/aimatey-react-stream  # Streaming components
│   └── @johnhenry/aimatey-react-nextjs  # Next.js integration
│
├── SDK Wrappers (1)
│   └── @johnhenry/aimatey-wrapper       # SDK compatibility layer
│
├── Native Backends (3)
│   ├── @johnhenry/aimatey-native-node-llamacpp  # llama.cpp
│   ├── @johnhenry/aimatey-native-apple          # Apple on-device models
│   └── @johnhenry/aimatey-native-model-runner   # Model runner base class
│
└── CLI Tools (1)
    └── @johnhenry/aimatey-cli           # Command-line utilities
```

## Foundation Packages

### [@johnhenry/aimatey-core](/ai-matey/packages/core)

The core package containing Bridge, Router, and Middleware functionality.

**Install:** `npm install @johnhenry/aimatey-core`

**Key Exports:**
- `Bridge` - Connect frontend and backend adapters
- `Router` / `createRouter()` - Multi-backend routing
- `MiddlewareStack` - Middleware management

**Use when:** Every ai.matey project needs this package.

---

### @johnhenry/aimatey-types

TypeScript type definitions shared across all packages.

**Install:** `npm install @johnhenry/aimatey-types`

**Key Types:**
- `IRChatCompletionRequest` - IR request format
- `IRChatCompletionResponse` - IR response format
- `BackendAdapter` - Backend interface
- `FrontendAdapter` - Frontend interface

**Use when:** You need TypeScript types (automatically included as dependency).

---

### @johnhenry/aimatey-errors

Error classes and error handling utilities.

**Install:** `npm install @johnhenry/aimatey-errors`

**Key Exports:**
- `AIMateyError` - Base error class
- `BackendError`, `RateLimitError`, `AuthenticationError`, etc.

**Use when:** You need specific error handling.

---

### @johnhenry/aimatey-utils

Shared utility functions for stream processing and more.

**Install:** `npm install @johnhenry/aimatey-utils`

**Key Functions:**
- `collectStream()` - Collect stream chunks
- `streamToText()` - Extract text from stream
- `processStream()` - Process with callbacks

**Use when:** Working with streams or need utilities.

---

### @johnhenry/aimatey-testing

Testing utilities and mock adapters.

**Install:** `npm install -D @johnhenry/aimatey-testing`

**Key Exports:**
- `MockBackendAdapter` - Mock backend
- `createTestBridge()` - Test bridge factory
- `createMockResponse()` - Mock responses

**Use when:** Writing tests for AI integrations.

---

### @johnhenry/aimatey

Umbrella package for convenience.

**Install:** `npm install @johnhenry/aimatey`

**Includes:** Commonly-used packages bundled together.

**Use when:** You want quick setup without picking individual packages.

## Adapter Packages

### [@johnhenry/aimatey-frontend](/ai-matey/packages/frontend)

Frontend adapters for different input formats.

**Install:** `npm install @johnhenry/aimatey-frontend`

**Adapters (7):**
- OpenAI format
- Anthropic format
- Gemini format
- Mistral format
- Ollama format
- Chrome AI format
- Generic IR format

**Use when:** You need to accept requests in specific formats.

---

### [@johnhenry/aimatey-backend](/ai-matey/packages/backend)

Backend adapters for cloud and local AI providers.

**Install:** `npm install @johnhenry/aimatey-backend`

**Providers:**
- Cloud: OpenAI, Anthropic, Gemini, Groq, Mistral, Cohere, and many more
- Local: Ollama, LMStudio

**Use when:** You need to execute requests on AI providers.

---

### @johnhenry/aimatey-backend-browser

Browser-compatible backends.

**Install:** `npm install @johnhenry/aimatey-backend-browser`

**Backends (3):**
- Chrome AI
- Mock backend
- Function-based backend

**Use when:** Building browser applications.

## Integration Packages

### [@johnhenry/aimatey-middleware](/ai-matey/packages/middleware)

10 built-in middleware types.

**Install:** `npm install @johnhenry/aimatey-middleware`

**Middleware:**
- Logging, Caching, Retry, Transform
- Cost Tracking, OpenTelemetry, Security
- Rate Limiting, Validation, Conversation History

**Use when:** You need logging, caching, retry, or monitoring.

---

### @johnhenry/aimatey-patterns

Production integration patterns built on top of core routing and middleware.

**Install:** `npm install @johnhenry/aimatey-patterns`

**Key Exports:**
- `createComplexityRouter()` - Route by query complexity
- `createParallelAggregator()` - Fan out to multiple backends and aggregate
- `createFailoverMiddleware()` - Automatic failover
- `createCostOptimizer()` - Cost-optimized backend selection
- `createBatchProcessor()` - Batch request processing

**Use when:** You want ready-made production patterns (complexity routing, parallel aggregation, failover, cost optimization, batching).

---

### @johnhenry/aimatey-mcp

MCP (Model Context Protocol) tool-calling support - translate MCP tools into the IR tool-execution loop via an injectable client.

**Install:** `npm install @johnhenry/aimatey-mcp`

**Key Exports:**
- `mcpToolsToDefinitions()` - Expose MCP tools as IR tool definitions
- `runMcpTools()` - Drive the tool-execution loop against an MCP client
- `mcpToolToIRTool()` / `extractMcpResultText()` - Conversion helpers

**Use when:** You want models to call MCP server tools through ai.matey.

---

### @johnhenry/aimatey-http

HTTP server integrations.

**Install:** `npm install @johnhenry/aimatey-http`

**Frameworks (6):**
- Express, Fastify, Hono, Koa, Node.js http, Deno

**Use when:** Building HTTP APIs.

---

### @johnhenry/aimatey-http-core

Framework-agnostic HTTP core utilities shared by the framework integrations.

**Install:** `npm install @johnhenry/aimatey-http-core`

**Use when:** Building a custom HTTP integration (automatically included by `@johnhenry/aimatey-http`).

---

### @johnhenry/aimatey-react-core

Core React hooks.

**Install:** `npm install @johnhenry/aimatey-react-core`

**Hooks:**
- `useChat()` - Chat interface
- `useCompletion()` - Text completion
- `useObject()` - Structured output

**Use when:** Building React chat applications.

---

### @johnhenry/aimatey-react-hooks

Extended React hooks.

**Install:** `npm install @johnhenry/aimatey-react-hooks`

**Hooks:**
- `useAssistant()` - Assistant API
- `useStream()` - Generic streaming
- `useTokenCount()` - Token counting

**Use when:** You need advanced React features.

---

### @johnhenry/aimatey-react-stream

React streaming utilities.

**Install:** `npm install @johnhenry/aimatey-react-stream`

**Key Exports:**
- `StreamProvider` / `StreamContext` - Share streaming state across components

**Use when:** You need streaming UI primitives beyond the hooks.

---

### @johnhenry/aimatey-react-nextjs

Next.js integration.

**Install:** `npm install @johnhenry/aimatey-react-nextjs`

**Features:**
- App Router support
- Server Actions
- API Routes

**Use when:** Building Next.js applications.

---

### @johnhenry/aimatey-wrapper

Drop-in SDK replacements.

**Install:** `npm install @johnhenry/aimatey-wrapper`

**Wrappers:**
- OpenAI SDK
- Anthropic SDK
- Chrome AI API
- Any method wrapper

**Use when:** You want SDK compatibility.

---

### @johnhenry/aimatey-cli

Command-line tools.

**Install:** `npm install -g @johnhenry/aimatey-cli`

**Features:**
- Format conversion
- Backend generation
- Proxy server
- Ollama emulation

**Use when:** You need CLI utilities.

## Native Backends

### @johnhenry/aimatey-native-node-llamacpp

Run llama.cpp models locally from Node.js.

**Install:** `npm install @johnhenry/aimatey-native-node-llamacpp`

**Use when:** Running GGUF models on-device from Node.js.

---

### @johnhenry/aimatey-native-apple

Apple native backend for on-device models.

**Install:** `npm install @johnhenry/aimatey-native-apple`

**Use when:** Targeting Apple platforms with on-device inference.

---

### @johnhenry/aimatey-native-model-runner

Model runner base class shared by the native backends.

**Install:** `npm install @johnhenry/aimatey-native-model-runner`

**Use when:** Building your own native backend (automatically included by the native backends).

## Installation Strategies

### Minimal Setup

For basic usage:

```bash
npm install @johnhenry/aimatey-core \
            @johnhenry/aimatey-frontend \
            @johnhenry/aimatey-backend
```

```typescript
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
```

### Full Setup

For all features:

```bash
npm install @johnhenry/aimatey-core \
            @johnhenry/aimatey-frontend \
            @johnhenry/aimatey-backend \
            @johnhenry/aimatey-middleware \
            @johnhenry/aimatey-http
```

### React App

For React applications:

```bash
npm install @johnhenry/aimatey-core \
            @johnhenry/aimatey-frontend \
            @johnhenry/aimatey-backend \
            @johnhenry/aimatey-react-core \
            @johnhenry/aimatey-react-hooks
```

```typescript
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';
```

### HTTP API

For HTTP APIs:

```bash
npm install @johnhenry/aimatey-core \
            @johnhenry/aimatey-frontend \
            @johnhenry/aimatey-backend \
            @johnhenry/aimatey-http \
            @johnhenry/aimatey-middleware
```

## Package Sizes

All packages are optimized for tree-shaking:

| Package | Size (gzipped) | Dependencies |
|---------|----------------|--------------|
| @johnhenry/aimatey-core | ~15 KB | types, errors |
| @johnhenry/aimatey-frontend | ~8 KB | types |
| @johnhenry/aimatey-backend | ~25 KB | types, utils |
| @johnhenry/aimatey-middleware | ~12 KB | core, types |
| @johnhenry/aimatey-http | ~10 KB | core, http-core |
| @johnhenry/aimatey-react-core | ~8 KB | react, core |

*Sizes are approximate and vary with bundler configuration.*

## Version Compatibility

All packages use **synchronized versioning**. Always use matching versions:

```json
{
  "dependencies": {
    "@johnhenry/aimatey-core": "0.0.0",
    "@johnhenry/aimatey-frontend": "0.0.0",
    "@johnhenry/aimatey-backend": "0.0.0",
    "@johnhenry/aimatey-middleware": "0.0.0"
  }
}
```

## TypeScript Support

All packages include TypeScript definitions:

```typescript
import type {
  IRChatCompletionRequest,
  BackendAdapter,
  Middleware
} from '@johnhenry/aimatey-types';
```

## Next Steps

- **[Installation Guide](/ai-matey/getting-started/installation)** - Get started
- **[Core Package](/ai-matey/packages/core)** - Bridge and Router
- **[Frontend Adapters](/ai-matey/packages/frontend)** - Input formats
- **[Backend Adapters](/ai-matey/packages/backend)** - AI providers
- **[Middleware](/ai-matey/packages/middleware)** - Middleware types
- **HTTP Integration** - Web frameworks (see [Tutorial 04](/ai-matey/tutorials/beginner/building-chat-api))
- **React Hooks** - React components (see [example](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/05-react-integration.ts))
- **SDK Wrappers** - SDK compatibility (see [examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/06-sdk-wrappers))
- **CLI Tools** - Command-line utilities (see [example](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/04-cli-tool.ts))

---

**Need help choosing packages?** Check the [Quick Start](/ai-matey/getting-started/quick-start) guide or explore [examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples).
