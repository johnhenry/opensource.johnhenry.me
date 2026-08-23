---
title: "Bridge API"
---

Complete API reference for the `Bridge` class - the core component for connecting frontend and backend adapters.

## Constructor

### `new Bridge(frontendAdapter, backendAdapter, options?)`

Creates a new Bridge instance.

**Parameters:**

- `frontendAdapter: FrontendAdapter` - Adapter for parsing input format
- `backendAdapter: BackendAdapter` - Adapter for executing requests with AI provider
- `options?: BridgeOptions` - Optional configuration

**Returns:** `Bridge` instance

**Example:**

```typescript
import { Bridge } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY
  }),
  {
    timeout: 30000,
    retryCount: 3
  }
);
```

## Methods

### `chat(request)`

Execute a chat completion request.

**Parameters:**

- `request: any` - Request in frontend adapter format

**Returns:** `Promise<any>` - Response in frontend adapter format

**Throws:**
- `BackendError` - If backend request fails
- `ValidationError` - If request validation fails
- `TimeoutError` - If request times out

**Example:**

```typescript
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
});

console.log(response.choices[0].message.content);
```

---

### `chatStream(request)`

Execute a streaming chat completion request.

**Parameters:**

- `request: any` - Request in frontend adapter format (with `stream: true`)

**Returns:** `AsyncIterable<any>` - Stream of chunks in frontend adapter format

**Throws:**
- `BackendError` - If backend request fails
- `ValidationError` - If request validation fails

**Example:**

```typescript
const stream = await bridge.chatStream({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Count to 10' }],
  stream: true
});

for await (const chunk of stream) {
  const content = chunk.choices?.[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);
  }
}
```

---

### `use(middleware)`

Add middleware to the bridge.

**Parameters:**

- `middleware: Middleware` - Middleware to add to the chain

**Returns:** `this` (for chaining)

**Example:**

```typescript
import { createLoggingMiddleware, createCachingMiddleware } from 'ai.matey.middleware';

bridge
  .use(createLoggingMiddleware({ level: 'info' }))
  .use(createCachingMiddleware({ ttl: 3600 }));
```

---

### `execute(irRequest)`

Execute a request using the IR format directly (bypassing frontend adapter).

**Parameters:**

- `irRequest: IRChatCompletionRequest` - Request in IR format

**Returns:** `Promise<IRChatCompletionResponse>` - Response in IR format

**Example:**

```typescript
const irResponse = await bridge.execute({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Hello' }],
  temperature: 0.7
});
```

---

### `executeStream(irRequest)`

Execute a streaming request using IR format directly.

**Parameters:**

- `irRequest: IRChatCompletionRequest` - Request in IR format with streaming enabled

**Returns:** `AsyncIterable<IRChatCompletionChunk>` - Stream of IR chunks

**Example:**

```typescript
const stream = await bridge.executeStream({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true
});

for await (const chunk of stream) {
  console.log(chunk.delta?.content);
}
```

---

### `setBackend(backendAdapter)`

Replace the backend adapter.

**Parameters:**

- `backendAdapter: BackendAdapter` - New backend adapter

**Returns:** `void`

**Example:**

```typescript
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';

// Switch from Anthropic to OpenAI
bridge.setBackend(new OpenAIBackendAdapter({
  apiKey: process.env.OPENAI_API_KEY
}));
```

---

### `setFrontend(frontendAdapter)`

Replace the frontend adapter.

**Parameters:**

- `frontendAdapter: FrontendAdapter` - New frontend adapter

**Returns:** `void`

**Example:**

```typescript
import { AnthropicFrontendAdapter } from 'ai.matey.frontend/anthropic';

// Switch input format to Anthropic
bridge.setFrontend(new AnthropicFrontendAdapter());
```

---

### `on(event, handler)`

Subscribe to bridge events.

**Parameters:**

- `event: BridgeEvent` - Event name
- `handler: Function` - Event handler function

**Returns:** `void`

**Events:**

- `request` - Fired before request is sent
- `response` - Fired after response is received
- `error` - Fired when an error occurs
- `stream:start` - Fired when streaming starts
- `stream:chunk` - Fired for each stream chunk
- `stream:end` - Fired when streaming ends

**Example:**

```typescript
bridge.on('request', (req) => {
  console.log('Request:', req.messages);
});

bridge.on('response', (res) => {
  console.log('Response tokens:', res.usage?.total_tokens);
});

bridge.on('error', (err) => {
  console.error('Error:', err.message);
});
```

---

## Properties

### `frontendAdapter`

**Type:** `FrontendAdapter`

**Read-only**

The current frontend adapter instance.

---

### `backendAdapter`

**Type:** `BackendAdapter`

**Read-only**

The current backend adapter instance.

---

### `middlewares`

**Type:** `Middleware[]`

**Read-only**

Array of registered middleware in execution order.

---

## Types

### `BridgeOptions`

Configuration options for Bridge.

```typescript
interface BridgeOptions {
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Number of retry attempts (default: 0) */
  retryCount?: number;

  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;

  /** Enable request validation (default: true) */
  validateRequest?: boolean;

  /** Enable response validation (default: true) */
  validateResponse?: boolean;

  /** Custom error handler */
  onError?: (error: Error) => void;
}
```

---

### `BridgeEvent`

Event types emitted by Bridge.

```typescript
type BridgeEvent =
  | 'request'
  | 'response'
  | 'error'
  | 'stream:start'
  | 'stream:chunk'
  | 'stream:end';
```

---

## Error Handling

Bridge can throw the following errors:

### `BackendError`

Thrown when the backend adapter fails to execute a request.

```typescript
try {
  await bridge.chat({ ... });
} catch (error) {
  if (error instanceof BackendError) {
    console.log('Backend failed:', error.backend);
    console.log('Status:', error.statusCode);
    console.log('Message:', error.message);
  }
}
```

### `ValidationError`

Thrown when request or response validation fails.

```typescript
try {
  await bridge.chat({ model: null }); // Invalid request
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation failed:', error.errors);
  }
}
```

### `TimeoutError`

Thrown when a request exceeds the timeout limit.

```typescript
const bridge = new Bridge(frontend, backend, { timeout: 5000 });

try {
  await bridge.chat({ ... });
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Request timed out after 5s');
  }
}
```

---

## Advanced Usage

### Custom Backend Adapter

```typescript
import { BackendAdapter, IRChatCompletionRequest, IRChatCompletionResponse } from 'ai.matey.types';

class CustomBackend implements BackendAdapter {
  name = 'custom';

  async execute(request: IRChatCompletionRequest): Promise<IRChatCompletionResponse> {
    // Custom implementation
    return {
      id: 'custom-id',
      model: request.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Custom response'
        },
        finish_reason: 'stop'
      }],
      usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 }
    };
  }

  async *executeStream(request: IRChatCompletionRequest) {
    yield {
      id: 'custom-id',
      model: request.model,
      choices: [{
        index: 0,
        delta: { content: 'Custom' },
        finish_reason: null
      }]
    };
  }
}

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new CustomBackend()
);
```

---

### Middleware Stack

```typescript
import {
  createLoggingMiddleware,
  createCachingMiddleware,
  createRetryMiddleware,
  createCostTrackingMiddleware
} from 'ai.matey.middleware';

const bridge = new Bridge(frontend, backend);

// Add middleware in order
bridge
  .use(createLoggingMiddleware({ level: 'info' }))
  .use(createRetryMiddleware({ maxAttempts: 3 }))
  .use(createCachingMiddleware({ ttl: 3600 }))
  .use(createCostTrackingMiddleware({ budgetLimit: 100 }));
```

---

## See Also

- [Router API](/ai-matey/api/router) - Multi-backend routing
- [Middleware API](/ai-matey/api/middleware) - Middleware reference
- [Error Handling](/ai-matey/api/errors) - Error types
- [Tutorial: Simple Bridge](/ai-matey/tutorials/beginner/simple-bridge) - Getting started
- [Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/01-basics) - Code examples
