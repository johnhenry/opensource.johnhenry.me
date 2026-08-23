---
title: "API Reference"
---

Complete API documentation for all ai.matey packages.

## Core API

Comprehensive reference for the core ai.matey APIs:

### [Bridge API](/ai-matey/api/bridge)

Complete reference for the `Bridge` class - connecting frontend and backend adapters.

- Constructor and configuration
- Request/response methods (chat, chatStream, execute)
- Middleware management
- Event handling
- Error handling

[View Bridge API →](/ai-matey/api/bridge)

---

### [Router API](/ai-matey/api/router)

Complete reference for the `Router` class - intelligent multi-backend routing.

- Routing strategies (round-robin, priority, weighted, custom)
- Backend management
- Health monitoring
- Failover and fallback
- Advanced routing patterns

[View Router API →](/ai-matey/api/router)

---

### [Middleware API](/ai-matey/api/middleware)

Complete reference for all built-in middleware and the Middleware interface.

- Logging, caching, retry, transform
- Cost tracking, rate limiting, validation
- OpenTelemetry tracing
- Creating custom middleware
- Middleware composition

[View Middleware API →](/ai-matey/api/middleware)

---

### [Types API](/ai-matey/api/types)

Complete TypeScript type definitions.

- IR types (IRChatCompletionRequest, IRChatCompletionResponse, etc.)
- Adapter interfaces (BackendAdapter, FrontendAdapter)
- Configuration types (BridgeOptions, RouterOptions)
- Utility types and type guards

[View Types API →](/ai-matey/api/types)

---

### [Errors API](/ai-matey/api/errors)

Complete error handling reference.

- Error hierarchy (AIMateyError, BackendError, ValidationError, etc.)
- Error codes and descriptions
- Error handling patterns
- Best practices

[View Errors API →](/ai-matey/api/errors)

---

## Core Packages

### ai.matey.core

The foundational package containing Bridge, Router, and core functionality.

**Key Exports:**
- `Bridge` - Connect frontend and backend adapters → [API](/ai-matey/api/bridge)
- `Router` - Route requests to multiple backends → [API](/ai-matey/api/router)
- `MiddlewareStack` - Manage middleware chain

[View Package Documentation →](/ai-matey/packages/core)

### ai.matey.types

TypeScript type definitions for all packages.

**Key Types:**
- `IRChatCompletionRequest` - Intermediate Representation request format
- `IRChatCompletionResponse` - IR response format
- `IRChatCompletionChunk` - Streaming chunk format
- `BackendAdapter` - Backend interface
- `FrontendAdapter` - Frontend interface
- `Middleware` - Middleware interface

[View Full API Documentation →](/ai-matey/api/all-packages)

### ai.matey.errors

Error classes and utilities.

**Key Exports:**
- `AIMateyError` - Base error class
- `BackendError` - Backend-specific errors
- `RateLimitError` - Rate limit exceeded
- `AuthenticationError` - Invalid API key
- `ValidationError` - Request validation failed

[View Full API Documentation →](/ai-matey/api/all-packages)

## Adapter Packages

### Frontend Adapters

Parse different input formats into IR.

- **ai.matey.frontend/openai** - OpenAI chat completion format
- **ai.matey.frontend/anthropic** - Anthropic messages API format
- **ai.matey.frontend/gemini** - Google Gemini format
- **ai.matey.frontend/mistral** - Mistral format
- **ai.matey.frontend/ollama** - Ollama format
- **ai.matey.frontend/groq** - Groq format
- **ai.matey.frontend/generic** - Generic IR format

[View Frontend Adapters →](/ai-matey/packages/frontend)

### Backend Adapters

Convert IR to provider-specific formats and execute requests.

**24 Supported Providers:**
- ai.matey.backend/openai
- ai.matey.backend/anthropic
- ai.matey.backend/gemini
- ai.matey.backend/mistral
- ai.matey.backend/ollama
- ai.matey.backend/groq
- ... and 18 more

[View All Backend Providers →](/ai-matey/packages/backend)

## Middleware Packages

### ai.matey.middleware

Built-in middleware for common use cases.

**Available Middleware:**
- `createLoggingMiddleware()` - Request/response logging
- `createCachingMiddleware()` - Response caching
- `createRetryMiddleware()` - Automatic retry with backoff
- `createTransformMiddleware()` - Request/response transformation
- `createCostTrackingMiddleware()` - Track API costs
- `createOpenTelemetryMiddleware()` - Distributed tracing
- `createRateLimitMiddleware()` - Rate limiting
- `createValidationMiddleware()` - Request validation
- `createSecurityMiddleware()` - Security headers
- `createConversationHistoryMiddleware()` - Conversation state

[View Middleware Guide →](/ai-matey/packages/middleware)

## Integration Packages

### ai.matey.http

HTTP server integration for Express, Fastify, Hono, and Node.js http.

**Key Exports:**
- `ExpressMiddleware` - Express.js integration
- `FastifyPlugin` - Fastify plugin
- `HonoMiddleware` - Hono middleware
- `NodeHTTPListener` - Node.js http integration

[View Examples →](/ai-matey/examples)

## Quick Links

### By Use Case

- **Building a Chat App?** → [Tutorial: Building a Chat API](/ai-matey/tutorials/beginner/building-chat-api)
- **HTTP API?** → [Examples](/ai-matey/examples)
- **Multi-Provider Routing?** → [Tutorial: Multi-Provider](/ai-matey/tutorials/beginner/multi-provider)
- **Need Caching?** → [Middleware Package](/ai-matey/packages/middleware)
- **Testing?** → [Testing Guide](/ai-matey/guides/testing)

### By Package

- [ai.matey.core](/ai-matey/packages/core) - Bridge, Router, Middleware
- [ai.matey.frontend](/ai-matey/packages/frontend) - Frontend adapters
- [ai.matey.backend](/ai-matey/packages/backend) - Backend adapters
- [ai.matey.middleware](/ai-matey/packages/middleware) - Middleware

For every package in the monorepo, including `http`, `react-core`,
`wrapper` and `cli`, see the [full package list](/ai-matey/packages/overview).

## Common Interfaces

### BackendAdapter Interface

```typescript
interface BackendAdapter {
  execute(request: IRChatCompletionRequest): Promise<IRChatCompletionResponse>;
  executeStream(request: IRChatCompletionRequest): Promise<AsyncIterable<IRChatCompletionChunk>>;
  checkHealth?(): Promise<boolean>;
}
```

### FrontendAdapter Interface

```typescript
interface FrontendAdapter {
  parseRequest(input: any): IRChatCompletionRequest;
  formatResponse(ir: IRChatCompletionResponse): any;
}
```

### Middleware Interface

```typescript
interface Middleware {
  onRequest?(request: IRChatCompletionRequest): Promise<IRChatCompletionRequest>;
  onResponse?(response: IRChatCompletionResponse): Promise<IRChatCompletionResponse>;
  onError?(error: Error): Promise<Error | void>;
}
```

## TypeScript Support

All packages include full TypeScript definitions. Import types:

```typescript
import type {
  IRChatCompletionRequest,
  IRChatCompletionResponse,
  IRChatCompletionChunk,
  BackendAdapter,
  FrontendAdapter,
  Middleware
} from 'ai.matey.types';
```

## Version Compatibility

All ai.matey packages use synchronized versioning. Always use matching versions across packages:

```json
{
  "dependencies": {
    "ai.matey.core": "^0.2.0",
    "ai.matey.frontend": "^0.2.0",
    "ai.matey.backend": "^0.2.0"
  }
}
```

## Auto-Generated Documentation

Detailed API documentation is auto-generated from TypeScript source code using TypeDoc:

- [View All Packages →](/ai-matey/api/all-packages) - Complete reference for all 21 packages with full exports

## Contributing

Found an issue with the API? Want to request a new feature?

- [Report an Issue](https://github.com/johnhenry/ai.matey/issues)
- [Contributing Guide](/ai-matey/contributing)
- [GitHub Repository](https://github.com/johnhenry/ai.matey)

---

**Explore the API:**
- [Getting Started](/ai-matey/getting-started/installation)
- [Examples](/ai-matey/examples)
- [IR Format Guide](/ai-matey/guides/architecture/ir-format)
- [Packages](/ai-matey/packages/overview)
