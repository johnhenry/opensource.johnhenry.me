---
title: "Packages Overview"
---

ai.matey is organized as a monorepo with **21 packages**, each serving a specific purpose. This modular approach allows you to install only what you need.

## Package Architecture

```
ai.matey (umbrella package)
├── Foundation Packages (6)
│   ├── ai.matey.core          # Bridge, Router, Middleware
│   ├── ai.matey.types         # TypeScript types
│   ├── ai.matey.errors        # Error classes
│   ├── ai.matey.utils         # Utilities
│   ├── ai.matey.testing       # Test utilities
│   └── ai.matey               # Umbrella (convenience)
│
├── Adapter Packages (3)
│   ├── ai.matey.frontend      # Frontend adapters (7 formats)
│   ├── ai.matey.backend       # Backend adapters (24 providers)
│   └── ai.matey.backend.browser # Browser backends (3 providers)
│
├── Middleware Package (1)
│   └── ai.matey.middleware    # 10 middleware types
│
├── HTTP Integration (2)
│   ├── ai.matey.http.core     # Core HTTP utilities
│   └── ai.matey.http          # Framework integrations (6)
│
├── React Integration (4)
│   ├── ai.matey.react.core    # Core hooks
│   ├── ai.matey.react.hooks   # Extended hooks
│   ├── ai.matey.react.stream  # Streaming components
│   └── ai.matey.react.nextjs  # Next.js integration
│
├── SDK Wrappers (1)
│   └── ai.matey.wrapper       # SDK compatibility layer
│
├── Native Backends (3)
│   ├── ai.matey.native.node-llamacpp  # llama.cpp
│   ├── ai.matey.native.apple         # Apple MLX
│   └── ai.matey.native.model-runner  # Generic runner
│
└── CLI Tools (1)
    └── ai.matey.cli           # Command-line utilities
```

## Foundation Packages

### [ai.matey.core](/ai-matey/packages/core)

The core package containing Bridge, Router, and Middleware functionality.

**Install:** `npm install ai.matey.core`

**Key Exports:**
- `Bridge` - Connect frontend and backend adapters
- `Router` / `createRouter()` - Multi-backend routing
- `MiddlewareStack` - Middleware management

**Use when:** Every ai.matey project needs this package.

---

### ai.matey.types

TypeScript type definitions shared across all packages.

**Install:** `npm install ai.matey.types`

**Key Types:**
- `IRChatCompletionRequest` - IR request format
- `IRChatCompletionResponse` - IR response format
- `BackendAdapter` - Backend interface
- `FrontendAdapter` - Frontend interface

**Use when:** You need TypeScript types (automatically included as dependency).

---

### ai.matey.errors

Error classes and error handling utilities.

**Install:** `npm install ai.matey.errors`

**Key Exports:**
- `AIMateyError` - Base error class
- `BackendError`, `RateLimitError`, `AuthenticationError`, etc.

**Use when:** You need specific error handling.

---

### ai.matey.utils

Shared utility functions for stream processing and more.

**Install:** `npm install ai.matey.utils`

**Key Functions:**
- `collectStream()` - Collect stream chunks
- `streamToText()` - Extract text from stream
- `processStream()` - Process with callbacks

**Use when:** Working with streams or need utilities.

---

### ai.matey.testing

Testing utilities and mock adapters.

**Install:** `npm install -D ai.matey.testing`

**Key Exports:**
- `MockBackendAdapter` - Mock backend
- `createTestBridge()` - Test bridge factory
- `createMockResponse()` - Mock responses

**Use when:** Writing tests for AI integrations.

---

### ai.matey

Umbrella package for convenience.

**Install:** `npm install ai.matey`

**Includes:** Commonly-used packages bundled together.

**Use when:** You want quick setup without picking individual packages.

## Adapter Packages

### [ai.matey.frontend](/ai-matey/packages/frontend)

Frontend adapters for different input formats.

**Install:** `npm install ai.matey.frontend`

**Adapters (7):**
- OpenAI format
- Anthropic format
- Gemini format
- Mistral format
- Ollama format
- Groq format
- Generic IR format

**Use when:** You need to accept requests in specific formats.

---

### [ai.matey.backend](/ai-matey/packages/backend)

Backend adapters for 24 AI providers.

**Install:** `npm install ai.matey.backend`

**Providers (24):**
- Cloud: OpenAI, Anthropic, Gemini, Groq, Mistral, Cohere, and 16 more
- Local: Ollama, LMStudio

**Use when:** You need to execute requests on AI providers.

---

### ai.matey.backend.browser

Browser-compatible backends.

**Install:** `npm install ai.matey.backend.browser`

**Backends (3):**
- Chrome AI
- Mock backend
- Function-based backend

**Use when:** Building browser applications.

## Integration Packages

### [ai.matey.middleware](/ai-matey/packages/middleware)

10 built-in middleware types.

**Install:** `npm install ai.matey.middleware`

**Middleware:**
- Logging, Caching, Retry, Transform
- Cost Tracking, OpenTelemetry, Security
- Rate Limiting, Validation, Conversation History

**Use when:** You need logging, caching, retry, or monitoring.

---

### ai.matey.http

HTTP server integrations.

**Install:** `npm install ai.matey.http`

**Frameworks (6):**
- Express, Fastify, Hono, Koa, Node.js http, Deno

**Use when:** Building HTTP APIs.

---

### ai.matey.react.core

Core React hooks.

**Install:** `npm install ai.matey.react.core`

**Hooks:**
- `useChat()` - Chat interface
- `useCompletion()` - Text completion
- `useObject()` - Structured output

**Use when:** Building React chat applications.

---

### ai.matey.react.hooks

Extended React hooks.

**Install:** `npm install ai.matey.react.hooks`

**Hooks:**
- `useAssistant()` - Assistant API
- `useStream()` - Generic streaming
- `useTokenCount()` - Token counting

**Use when:** You need advanced React features.

---

### ai.matey.wrapper

Drop-in SDK replacements.

**Install:** `npm install ai.matey.wrapper`

**Wrappers:**
- OpenAI SDK
- Anthropic SDK
- Chrome AI API
- Any method wrapper

**Use when:** You want SDK compatibility.

---

### ai.matey.cli

Command-line tools.

**Install:** `npm install -g ai.matey.cli`

**Features:**
- Format conversion
- Backend generation
- Proxy server
- Ollama emulation

**Use when:** You need CLI utilities.

## Installation Strategies

### Minimal Setup

For basic usage:

```bash
npm install ai.matey.core \
            ai.matey.frontend/openai \
            ai.matey.backend/anthropic
```

### Full Setup

For all features:

```bash
npm install ai.matey.core \
            ai.matey.frontend \
            ai.matey.backend \
            ai.matey.middleware \
            ai.matey.http
```

### React App

For React applications:

```bash
npm install ai.matey.core \
            ai.matey.frontend/openai \
            ai.matey.backend/openai \
            ai.matey.react.core \
            ai.matey.react.hooks
```

### HTTP API

For HTTP APIs:

```bash
npm install ai.matey.core \
            ai.matey.frontend/openai \
            ai.matey.backend \
            ai.matey.http \
            ai.matey.middleware
```

## Package Sizes

All packages are optimized for tree-shaking:

| Package | Size (gzipped) | Dependencies |
|---------|----------------|--------------|
| ai.matey.core | ~15 KB | types, errors |
| ai.matey.frontend | ~8 KB | types |
| ai.matey.backend | ~25 KB | types, utils |
| ai.matey.middleware | ~12 KB | core, types |
| ai.matey.http | ~10 KB | core, http-core |
| ai.matey.react.core | ~8 KB | react, core |

*Sizes are approximate and vary with bundler configuration.*

## Version Compatibility

All packages use **synchronized versioning**. Always use matching versions:

```json
{
  "dependencies": {
    "ai.matey.core": "^0.2.0",
    "ai.matey.frontend": "^0.2.0",
    "ai.matey.backend": "^0.2.0",
    "ai.matey.middleware": "^0.2.0"
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
} from 'ai.matey.types';
```

## Next Steps

- **[Installation Guide](/ai-matey/getting-started/installation)** - Get started
- **[Core Package](/ai-matey/packages/core)** - Bridge and Router
- **[Frontend Adapters](/ai-matey/packages/frontend)** - Input formats
- **[Backend Adapters](/ai-matey/packages/backend)** - AI providers
- **[Middleware](/ai-matey/packages/middleware)** - Middleware types
- **HTTP Integration** - Web frameworks (see [Tutorial 04](/ai-matey/tutorials/beginner/building-chat-api))
- **React Hooks** - React components (see [examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/09-react))
- **SDK Wrappers** - SDK compatibility (see [examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/06-sdk-wrappers))
- **CLI Tools** - Command-line utilities (see [examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/10-cli-tools))

---

**Need help choosing packages?** Check the [Quick Start](/ai-matey/getting-started/quick-start) guide or explore [examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples).
