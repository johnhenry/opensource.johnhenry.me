---
title: "Core Concepts"
---

Understanding the four fundamental concepts in ai.matey: **Bridge**, **Router**, **Middleware**, and **Intermediate Representation (IR)**.

## The Problem ai.matey Solves

Every AI provider has their own API format:

```typescript
// OpenAI format
{
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  max_tokens: 100
}

// Anthropic format
{
  model: "claude-3-5-sonnet-20241022",
  messages: [{ role: "user", content: "Hello" }],
  max_tokens: 100
}

// Gemini format
{
  model: "gemini-1.5-flash",
  contents: [{ role: "user", parts: [{ text: "Hello" }] }],
  generationConfig: { maxOutputTokens: 100 }
}
```

Switching providers means rewriting your code. ai.matey solves this by using an **Intermediate Representation** that all providers can convert to/from.

## Architecture Overview

```
┌─────────────────┐
│   Your Code     │  Write in any format (OpenAI, Anthropic, etc.)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Frontend Adapter│  Parses your input format
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  IR (Universal) │  Provider-agnostic format
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Backend Adapter │  Converts IR to provider format
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AI Provider    │  OpenAI, Anthropic, Gemini, etc.
└─────────────────┘
```

## 1. Intermediate Representation (IR)

The **IR** is a universal format that all providers can convert to and from. It's the core of ai.matey's portability.

### IR Structure

```typescript
interface IRChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  // ... other standard fields
}
```

### Why IR Matters

- ✅ **Provider-agnostic**: Same format works with all backends
- ✅ **Stable**: Your code doesn't break when providers change their APIs
- ✅ **Extensible**: Add new providers without changing your code
- ✅ **Testable**: Mock backends easily with consistent interfaces

### Example: IR in Action

```typescript
// Your code uses IR directly (no frontend adapter needed)
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';

const backend = new AnthropicBackendAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// IR format request
const irRequest = {
  model: 'claude-3-5-sonnet-20241022',
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  temperature: 0.7,
  max_tokens: 100
};

// Execute with IR
const response = await backend.execute(irRequest);
```

## 2. Bridge

The **Bridge** connects a **Frontend Adapter** (input format) with a **Backend Adapter** (AI provider).

### Bridge Pattern

```typescript
import { Bridge } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),    // Accept OpenAI format
  new AnthropicBackendAdapter({   // Execute on Anthropic
    apiKey: process.env.ANTHROPIC_API_KEY
  })
);
```

### Frontend Adapters

Frontend adapters parse different input formats into IR:

- **OpenAIFrontendAdapter** - OpenAI's chat completion format
- **AnthropicFrontendAdapter** - Anthropic's messages API format
- **GeminiFrontendAdapter** - Google Gemini's format
- **MistralFrontendAdapter** - Mistral's format
- **GenericFrontendAdapter** - Already in IR format

### Backend Adapters

Backend adapters convert IR to provider-specific formats:

- **24 different providers** (OpenAI, Anthropic, Gemini, Ollama, Groq, etc.)
- Each handles API specifics (authentication, rate limits, retries)
- Consistent interface: `execute()` and `executeStream()`

### Bridge with Middleware

Add middleware to enhance functionality:

```typescript
import { createLoggingMiddleware } from 'ai.matey.middleware';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey }),
  [
    createLoggingMiddleware({ level: 'info' })
  ]
);
```

## 3. Router

The **Router** routes requests to multiple backends based on strategies.

### Basic Router

```typescript
import { createRouter } from 'ai.matey.core';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';

const router = createRouter({
  routingStrategy: 'round-robin'
})
  .register('openai', new OpenAIBackendAdapter({ apiKey: openaiKey }))
  .register('anthropic', new AnthropicBackendAdapter({ apiKey: anthropicKey }));

// Router is a backend, so use it in a Bridge
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  router
);
```

### Routing Strategies

#### 1. Round Robin

Distribute load evenly:

```typescript
const router = createRouter({
  routingStrategy: 'round-robin'
});

// Request 1 → openai
// Request 2 → anthropic
// Request 3 → openai
// ...
```

#### 2. Model-Based

Route by model name:

```typescript
const router = createRouter({
  routingStrategy: 'model-based'
})
  .register('openai', openaiBackend)
  .register('anthropic', anthropicBackend);

// gpt-4 → openai
// claude-3 → anthropic
```

#### 3. Custom Strategy

Route based on custom logic:

```typescript
const router = createRouter({
  routingStrategy: (request) => {
    // Route expensive queries to powerful models
    const isComplex = request.messages[0].content.length > 1000;
    return isComplex ? 'openai' : 'anthropic';
  }
});
```

#### 4. Fallback Chain

Automatic failover:

```typescript
router.setFallbackChain(['openai', 'anthropic', 'groq']);

// Try openai → if fails, try anthropic → if fails, try groq
```

### Advanced Routing

#### Parallel Dispatch

Query multiple backends simultaneously:

```typescript
const results = await router.parallelDispatch(request, {
  backends: ['openai', 'anthropic', 'gemini'],
  strategy: 'all' // or 'first' or 'fastest'
});

// Get responses from all 3 providers for comparison
```

#### Health Checking

Monitor backend health:

```typescript
router.on('health-check', (backend, healthy) => {
  console.log(`${backend} is ${healthy ? 'healthy' : 'unhealthy'}`);
});

const health = await router.checkHealth();
// { openai: true, anthropic: true, groq: false }
```

## 4. Middleware

**Middleware** intercepts requests and responses to add functionality.

### Middleware Pattern

```typescript
import { Bridge } from 'ai.matey.core';
import {
  createLoggingMiddleware,
  createCachingMiddleware,
  createRetryMiddleware
} from 'ai.matey.middleware';

const bridge = new Bridge(
  frontend,
  backend,
  [
    createLoggingMiddleware({ level: 'info' }),
    createCachingMiddleware({ ttl: 300000 }),  // 5 minutes
    createRetryMiddleware({ maxAttempts: 3 })
  ]
);
```

### Built-in Middleware

#### 1. Logging

Log requests and responses:

```typescript
createLoggingMiddleware({
  level: 'info',          // 'debug' | 'info' | 'warn' | 'error'
  sanitize: true,         // Remove sensitive data
  includeTimings: true    // Add timing information
})
```

#### 2. Caching

Cache responses for identical requests:

```typescript
createCachingMiddleware({
  ttl: 300000,           // Cache for 5 minutes
  maxSize: 100,          // Max 100 cached items
  keyGenerator: (req) => JSON.stringify(req)  // Custom cache key
})
```

**Performance**: 1000x+ speedup for duplicate requests!

#### 3. Retry

Automatic retry with exponential backoff:

```typescript
createRetryMiddleware({
  maxAttempts: 3,
  initialDelay: 1000,    // Start with 1 second
  maxDelay: 10000,       // Max 10 seconds
  backoffMultiplier: 2,  // Double each time
  retryOn: ['rate_limit', 'server_error']
})
```

#### 4. Transform

Modify requests/responses:

```typescript
createTransformMiddleware({
  transformRequest: (req) => ({
    ...req,
    messages: [
      { role: 'system', content: 'You are helpful' },
      ...req.messages
    ]
  }),
  transformResponse: (res) => {
    // Modify response
    return res;
  }
})
```

#### 5. Cost Tracking

Track API costs:

```typescript
createCostTrackingMiddleware({
  onCost: (cost, provider) => {
    console.log(`${provider}: $${cost}`);
  }
})
```

#### 6. OpenTelemetry

Add distributed tracing:

```typescript
createOpenTelemetryMiddleware({
  serviceName: 'my-ai-service',
  endpoint: 'http://localhost:4318'
})
```

### Custom Middleware

Create your own:

```typescript
interface Middleware {
  onRequest?: (request: IRRequest) => IRRequest | Promise<IRRequest>;
  onResponse?: (response: IRResponse) => IRResponse | Promise<IRResponse>;
  onError?: (error: Error) => Error | Promise<Error>;
}

const customMiddleware: Middleware = {
  onRequest: async (request) => {
    console.log('Request:', request);
    return request;
  },
  onResponse: async (response) => {
    console.log('Response:', response);
    return response;
  }
};
```

### Middleware Order

Middleware executes in order:

```
Request Flow:
  [Logging] → [Transform] → [Retry] → [Backend]

Response Flow:
  [Backend] → [Retry] → [Transform] → [Logging]
```

## Putting It All Together

Here's a production-ready example combining all concepts:

```typescript
import { Bridge, createRouter } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';
import {
  createLoggingMiddleware,
  createCachingMiddleware,
  createRetryMiddleware,
  createCostTrackingMiddleware
} from 'ai.matey.middleware';

// 1. Create backends
const openaiBackend = new OpenAIBackendAdapter({
  apiKey: process.env.OPENAI_API_KEY
});

const anthropicBackend = new AnthropicBackendAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// 2. Create router with fallback
const router = createRouter({
  routingStrategy: 'model-based'
})
  .register('openai', openaiBackend)
  .register('anthropic', anthropicBackend)
  .setFallbackChain(['openai', 'anthropic']);

// 3. Add middleware
const middleware = [
  createLoggingMiddleware({ level: 'info' }),
  createCachingMiddleware({ ttl: 300000 }),
  createRetryMiddleware({ maxAttempts: 3 }),
  createCostTrackingMiddleware({
    onCost: (cost, provider) => console.log(`Cost: $${cost}`)
  })
];

// 4. Create bridge
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  router,
  middleware
);

// 5. Use it
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});

// Features you get:
// ✅ Write in OpenAI format
// ✅ Automatic provider routing
// ✅ Fallback if primary fails
// ✅ Request/response logging
// ✅ Response caching
// ✅ Automatic retries
// ✅ Cost tracking
```

## Key Takeaways

1. **IR (Intermediate Representation)** - Universal format that makes portability possible
2. **Bridge** - Connects frontend (input format) with backend (provider)
3. **Router** - Routes to multiple backends with strategies and fallback
4. **Middleware** - Adds logging, caching, retry, cost tracking, and more

## Next Steps

- **[Your First Bridge](/ai-matey/getting-started/your-first-bridge)** - Build a bridge step-by-step
- **[IR Format Guide](/ai-matey/guides/architecture/ir-format)** - Deep dive into IR format
- **[Testing Guide](/ai-matey/guides/testing)** - Testing your integrations
- **[Middleware Package](/ai-matey/packages/middleware)** - All middleware types
- **[Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples)** - Working code examples

---

**Ready to build?** Continue to [Your First Bridge](/ai-matey/getting-started/your-first-bridge) for a hands-on tutorial!
