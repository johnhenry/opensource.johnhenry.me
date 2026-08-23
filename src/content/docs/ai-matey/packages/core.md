---
title: "ai.matey.core"
---

The foundational package providing the Bridge and Router classes - the heart of ai.matey's universal adapter system.

## Installation

```bash
npm install ai.matey.core ai.matey.frontend ai.matey.backend
```

## Overview

`ai.matey.core` provides two main classes:

- **Bridge**: Connects a single frontend adapter to a single backend adapter
- **Router**: Connects a frontend adapter to multiple backend adapters with intelligent routing

## Bridge

### Basic Usage

```typescript
import { Bridge } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey: 'your-key' })
);

const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Constructor

```typescript
constructor(
  frontendAdapter: FrontendAdapter,
  backendAdapter: BackendAdapter
)
```

**Parameters:**
- `frontendAdapter`: Adapter that defines the input format (OpenAI, Anthropic, etc.)
- `backendAdapter`: Adapter that defines the AI provider (OpenAI, Anthropic, Gemini, etc.)

### Methods

#### chat()

Execute a non-streaming chat completion:

```typescript
async chat(request: IRChatCompletionRequest): Promise<IRChatCompletionResponse>
```

**Parameters:**
- `request`: Chat completion request in the frontend adapter's format

**Returns:**
- Promise resolving to the response in the frontend adapter's format

**Example:**
```typescript
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'What is 2+2?' }
  ],
  temperature: 0.7,
  max_tokens: 100
});

console.log(response.choices[0].message.content); // "4"
```

#### chatStream()

Execute a streaming chat completion:

```typescript
async chatStream(request: IRChatCompletionRequest): Promise<AsyncIterable<IRChatCompletionChunk>>
```

**Parameters:**
- `request`: Chat completion request with `stream: true`

**Returns:**
- Promise resolving to an async iterable of response chunks

**Example:**
```typescript
const stream = await bridge.chatStream({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Count to 5' }],
  stream: true
});

for await (const chunk of stream) {
  const content = chunk.choices?.[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);
  }
}
```

#### use()

Add middleware to the request/response pipeline:

```typescript
use(middleware: Middleware): void
```

**Parameters:**
- `middleware`: Middleware function or object

**Example:**
```typescript
import { createLoggingMiddleware } from 'ai.matey.middleware';

bridge.use(createLoggingMiddleware({ level: 'info' }));
bridge.use(createCachingMiddleware({ ttl: 3600 }));
```

### Properties

#### frontendAdapter

The frontend adapter instance (read-only):

```typescript
readonly frontendAdapter: FrontendAdapter
```

#### backendAdapter

The backend adapter instance (read-only):

```typescript
readonly backendAdapter: BackendAdapter
```

## Router

The Router extends Bridge functionality to support multiple backend adapters with intelligent routing strategies.

### Basic Usage

```typescript
import { Router } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';

const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
    new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY })
  ],
  strategy: 'round-robin'
});
```

### Constructor

```typescript
constructor(
  frontendAdapter: FrontendAdapter,
  options: RouterOptions
)
```

**Parameters:**
- `frontendAdapter`: Frontend adapter instance
- `options`: Router configuration

### RouterOptions

```typescript
interface RouterOptions {
  backends: BackendAdapter[];
  strategy: 'round-robin' | 'priority' | 'random' | 'weighted' | 'custom';
  customStrategy?: (request: IRChatCompletionRequest, backends: BackendAdapter[]) => number;
  fallbackOnError?: boolean;
  healthCheck?: {
    enabled: boolean;
    interval: number;
    timeout?: number;
  };
}
```

**Fields:**
- `backends`: Array of backend adapter instances
- `strategy`: Routing strategy to use
- `customStrategy`: Custom routing function (required if strategy is 'custom')
- `fallbackOnError`: Automatically try next backend on failure (default: false)
- `healthCheck`: Health check configuration (optional)

### Routing Strategies

#### Round-Robin

Distributes requests evenly across all backends:

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [backend1, backend2, backend3],
  strategy: 'round-robin'
});

// Request 1 → backend1
// Request 2 → backend2
// Request 3 → backend3
// Request 4 → backend1 (cycles)
```

#### Priority

Uses backends in order, falling back on failure:

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [primaryBackend, secondaryBackend, tertiaryBackend],
  strategy: 'priority',
  fallbackOnError: true
});

// Always tries primaryBackend first
// Falls back to secondaryBackend if primary fails
// Falls back to tertiaryBackend if secondary fails
```

#### Random

Randomly selects a backend for each request:

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [backend1, backend2, backend3],
  strategy: 'random'
});
```

#### Weighted

Distributes requests based on weights:

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    { backend: backend1, weight: 70 }, // 70% of traffic
    { backend: backend2, weight: 20 }, // 20% of traffic
    { backend: backend3, weight: 10 }  // 10% of traffic
  ],
  strategy: 'weighted'
});
```

#### Custom

Implement your own routing logic:

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [cheapBackend, fastBackend, powerfulBackend],
  strategy: 'custom',
  customStrategy: (request, backends) => {
    // Route based on message length
    const messageLength = JSON.stringify(request.messages).length;

    if (messageLength < 100) return 0;  // Cheap
    if (messageLength < 500) return 1;  // Fast
    return 2;                            // Powerful
  }
});
```

### Methods

Router inherits all Bridge methods (`chat()`, `chatStream()`, `use()`) plus:

#### getBackendHealth()

Get health status of all backends:

```typescript
async getBackendHealth(): Promise<Record<string, BackendHealth>>
```

**Returns:**
- Object mapping backend names to health metrics

**Example:**
```typescript
const health = await router.getBackendHealth();
console.log(health);
/*
{
  anthropic: { healthy: true, latency: 1200, errorRate: 0 },
  openai: { healthy: true, latency: 1500, errorRate: 0.02 },
  groq: { healthy: false, latency: 5000, errorRate: 0.5 }
}
*/
```

### Events

Router emits events for monitoring:

```typescript
router.on('backend:failed', ({ backend, error }) => {
  console.log(`Backend ${backend} failed: ${error.message}`);
});

router.on('backend:switch', ({ from, to }) => {
  console.log(`Switched from ${from} to ${to}`);
});

router.on('backend:health', ({ backend, healthy }) => {
  console.log(`${backend}: ${healthy ? 'Healthy' : 'Unhealthy'}`);
});
```

## Middleware System

Both Bridge and Router support middleware for intercepting and transforming requests/responses.

### Middleware Interface

```typescript
interface Middleware {
  name: string;
  execute(
    request: IRChatCompletionRequest,
    next: (request: IRChatCompletionRequest) => Promise<IRChatCompletionResponse>
  ): Promise<IRChatCompletionResponse>;
}
```

### Creating Custom Middleware

```typescript
function createTimingMiddleware() {
  return {
    name: 'timing',
    async execute(request, next) {
      const start = Date.now();
      const response = await next(request);
      const duration = Date.now() - start;

      console.log(`Request took ${duration}ms`);

      return response;
    }
  };
}

bridge.use(createTimingMiddleware());
```

### Middleware Order

Middleware executes in reverse order (last added runs first):

```typescript
bridge.use(middleware1); // Runs 3rd
bridge.use(middleware2); // Runs 2nd
bridge.use(middleware3); // Runs 1st

// Request → middleware3 → middleware2 → middleware1 → Backend
// Response ← middleware3 ← middleware2 ← middleware1 ← Backend
```

**Best practice order:**
1. Logging (first - sees everything)
2. Retry (second - handles failures)
3. Caching (third - caches successful responses)
4. Transform (fourth - modifies data)

## Error Handling

### Error Types

```typescript
class BridgeError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'BridgeError';
  }
}
```

**Error codes:**
- `ADAPTER_ERROR`: Frontend/backend adapter error
- `VALIDATION_ERROR`: Invalid request format
- `NETWORK_ERROR`: Network/connection error
- `RATE_LIMIT_ERROR`: Rate limit exceeded
- `TIMEOUT_ERROR`: Request timeout
- `AUTH_ERROR`: Authentication failed

### Handling Errors

```typescript
try {
  const response = await bridge.chat(request);
} catch (error) {
  if (error instanceof BridgeError) {
    switch (error.code) {
      case 'RATE_LIMIT_ERROR':
        console.log('Rate limited, retrying...');
        break;
      case 'AUTH_ERROR':
        console.log('Invalid API key');
        break;
      default:
        console.log('Unknown error:', error.message);
    }
  }
}
```

## TypeScript Types

### Key Interfaces

```typescript
// Request
interface IRChatCompletionRequest {
  model: string;
  messages: IRMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: IRTool[];
  // ... more parameters
}

// Response
interface IRChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: IRChoice[];
  usage?: IRUsage;
}

// Message
interface IRMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | IRContent[];
  name?: string;
}

// Streaming chunk
interface IRChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: IRStreamChoice[];
}
```

See [IR Format Documentation](/ai-matey/guides/architecture/ir-format) for complete type definitions.

## Best Practices

### 1. Reuse Instances

Create Bridge/Router instances once and reuse:

```typescript
// ✅ Good - reuse instance
const bridge = new Bridge(frontend, backend);

async function chat(message) {
  return await bridge.chat({ model: 'gpt-4', messages: [{ role: 'user', content: message }] });
}

// ❌ Bad - creates new instance each call
async function chat(message) {
  const bridge = new Bridge(frontend, backend);
  return await bridge.chat({ model: 'gpt-4', messages: [{ role: 'user', content: message }] });
}
```

### 2. Use TypeScript

Take advantage of full type safety:

```typescript
import type { IRChatCompletionRequest, IRChatCompletionResponse } from 'ai.matey.types';

async function chat(request: IRChatCompletionRequest): Promise<IRChatCompletionResponse> {
  return await bridge.chat(request);
}
```

### 3. Handle Errors

Always wrap calls in try-catch:

```typescript
try {
  const response = await bridge.chat(request);
  return response.choices[0].message.content;
} catch (error) {
  console.error('Chat failed:', error);
  throw error;
}
```

### 4. Use Middleware

Add production features with middleware:

```typescript
import { createLoggingMiddleware, createRetryMiddleware, createCachingMiddleware } from 'ai.matey.middleware';

bridge.use(createLoggingMiddleware({ level: 'info' }));
bridge.use(createRetryMiddleware({ maxAttempts: 3 }));
bridge.use(createCachingMiddleware({ ttl: 3600 }));
```

## See Also

- [Frontend Adapters](/ai-matey/packages/frontend) - Available frontend adapters
- [Backend Adapters](/ai-matey/packages/backend) - Available backend adapters
- [Middleware](/ai-matey/packages/middleware) - Available middleware
- [IR Format](/ai-matey/guides/architecture/ir-format) - Intermediate representation details
- [Tutorial: Simple Bridge](/ai-matey/tutorials/beginner/simple-bridge) - Step-by-step guide
