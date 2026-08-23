---
title: "Middleware API"
---

Complete API reference for all built-in middleware and the Middleware interface.

## Middleware Interface

All middleware must implement this interface:

```typescript
interface Middleware {
  /** Middleware name */
  name: string;

  /** Called before request is sent to backend */
  onRequest?(request: IRChatCompletionRequest): Promise<IRChatCompletionRequest>;

  /** Called after response is received from backend */
  onResponse?(response: IRChatCompletionResponse): Promise<IRChatCompletionResponse>;

  /** Called when an error occurs */
  onError?(error: Error): Promise<Error | void>;

  /** Called for each stream chunk */
  onStreamChunk?(chunk: IRChatCompletionChunk): Promise<IRChatCompletionChunk>;

  /** Cleanup function called when middleware is removed */
  cleanup?(): Promise<void>;
}
```

---

## Built-in Middleware

### Logging Middleware

#### `createLoggingMiddleware(options)`

Logs requests and responses for debugging and monitoring.

**Parameters:**

```typescript
interface LoggingMiddlewareOptions {
  /** Log level: 'debug' | 'info' | 'warn' | 'error' (default: 'info') */
  level?: string;

  /** Log requests (default: true) */
  logRequests?: boolean;

  /** Log responses (default: true) */
  logResponses?: boolean;

  /** Log stream chunks (default: false) */
  logStreamChunks?: boolean;

  /** Fields to redact from logs (default: ['apiKey', 'authorization']) */
  redactFields?: string[];

  /** Custom logger (default: console) */
  logger?: Logger;

  /** Pretty print (default: true) */
  pretty?: boolean;
}
```

**Returns:** `Middleware`

**Example:**

```typescript
import { createLoggingMiddleware } from 'ai.matey.middleware';

const logger = createLoggingMiddleware({
  level: 'info',
  logRequests: true,
  logResponses: true,
  redactFields: ['apiKey', 'authorization', 'password']
});

bridge.use(logger);
```

**Output:**

```
[INFO] Request: POST /chat/completions
[INFO] Model: gpt-4
[INFO] Messages: 1
[INFO] Response: 200 OK (1.2s)
[INFO] Tokens: 50 (cost: $0.0015)
```

---

### Caching Middleware

#### `createCachingMiddleware(options)`

Caches responses to reduce API calls and costs.

**Parameters:**

```typescript
interface CachingMiddlewareOptions {
  /** Time-to-live in seconds (default: 3600) */
  ttl?: number;

  /** Maximum cache size (default: 1000) */
  maxSize?: number;

  /** Storage backend: 'memory' | 'redis' | 'file' (default: 'memory') */
  storage?: string;

  /** Redis configuration (if storage is 'redis') */
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };

  /** File path (if storage is 'file') */
  filePath?: string;

  /** Custom cache key function */
  keyGenerator?: (request: IRChatCompletionRequest) => string;

  /** Enable cache statistics (default: false) */
  stats?: boolean;
}
```

**Returns:** `Middleware`

**Example:**

```typescript
import { createCachingMiddleware } from 'ai.matey.middleware';

const cache = createCachingMiddleware({
  ttl: 3600,           // Cache for 1 hour
  maxSize: 1000,       // Max 1000 items
  storage: 'memory',
  stats: true
});

bridge.use(cache);

// First request - cache miss
await bridge.chat({ model: 'gpt-4', messages: [...] }); // ~1200ms

// Second identical request - cache hit
await bridge.chat({ model: 'gpt-4', messages: [...] }); // ~0.5ms ⚡
```

**Cache Statistics:**

```typescript
// Get cache stats
const stats = cache.getStats();
console.log(stats);
/*
{
  hits: 45,
  misses: 12,
  hitRate: 0.789,
  size: 12,
  memoryUsage: 2048
}
*/
```

---

### Retry Middleware

#### `createRetryMiddleware(options)`

Automatically retries failed requests with exponential backoff.

**Parameters:**

```typescript
interface RetryMiddlewareOptions {
  /** Maximum retry attempts (default: 3) */
  maxAttempts?: number;

  /** Initial delay in ms (default: 1000) */
  initialDelay?: number;

  /** Maximum delay in ms (default: 10000) */
  maxDelay?: number;

  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;

  /** Errors to retry */
  retryableErrors?: string[];

  /** HTTP status codes to retry */
  retryableStatusCodes?: number[];

  /** Custom retry condition */
  shouldRetry?: (error: Error, attempt: number) => boolean;

  /** Called before each retry */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}
```

**Returns:** `Middleware`

**Example:**

```typescript
import { createRetryMiddleware } from 'ai.matey.middleware';

const retry = createRetryMiddleware({
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['RATE_LIMIT_EXCEEDED', 'TIMEOUT', 'SERVICE_UNAVAILABLE'],
  onRetry: (error, attempt, delay) => {
    console.log(`Retry ${attempt}/3 after ${delay}ms: ${error.message}`);
  }
});

bridge.use(retry);
```

**Console output (on failure):**

```
[WARN] Request failed: RATE_LIMIT_EXCEEDED
[INFO] Retry 1/3 after 1000ms
[INFO] Retry 2/3 after 2000ms
[INFO] Request succeeded on attempt 3
```

---

### Transform Middleware

#### `createTransformMiddleware(options)`

Transforms requests and responses on-the-fly.

**Parameters:**

```typescript
interface TransformMiddlewareOptions {
  /** Transform request before sending */
  transformRequest?: (request: IRChatCompletionRequest) => IRChatCompletionRequest | Promise<IRChatCompletionRequest>;

  /** Transform response after receiving */
  transformResponse?: (response: IRChatCompletionResponse) => IRChatCompletionResponse | Promise<IRChatCompletionResponse>;

  /** Transform stream chunks */
  transformChunk?: (chunk: IRChatCompletionChunk) => IRChatCompletionChunk | Promise<IRChatCompletionChunk>;
}
```

**Returns:** `Middleware`

**Example:**

```typescript
import { createTransformMiddleware } from 'ai.matey.middleware';

const transform = createTransformMiddleware({
  transformRequest: (request) => {
    // Add system message to all requests
    return {
      ...request,
      messages: [
        { role: 'system', content: 'Be concise and helpful.' },
        ...request.messages
      ]
    };
  },
  transformResponse: (response) => {
    // Convert to uppercase
    return {
      ...response,
      choices: response.choices.map(choice => ({
        ...choice,
        message: {
          ...choice.message,
          content: choice.message.content.toUpperCase()
        }
      }))
    };
  }
});

bridge.use(transform);
```

---

### Cost Tracking Middleware

#### `createCostTrackingMiddleware(options)`

Tracks API costs and enforces budgets.

**Parameters:**

```typescript
interface CostTrackingMiddlewareOptions {
  /** Budget limit in USD (default: Infinity) */
  budgetLimit?: number;

  /** Alert threshold (0-1, default: 0.9) */
  alertThreshold?: number;

  /** Pricing per provider */
  pricing?: {
    [provider: string]: {
      inputTokens: number;   // $ per 1K tokens
      outputTokens: number;  // $ per 1K tokens
    };
  };

  /** Called when budget exceeded */
  onBudgetExceeded?: (current: number, limit: number) => void;

  /** Called when threshold reached */
  onThresholdReached?: (current: number, limit: number) => void;

  /** Reset interval in ms (default: null - never reset) */
  resetInterval?: number;
}
```

**Returns:** `Middleware`

**Example:**

```typescript
import { createCostTrackingMiddleware } from 'ai.matey.middleware';

const costTracker = createCostTrackingMiddleware({
  budgetLimit: 100,      // $100 budget
  alertThreshold: 0.9,   // Alert at 90%
  onBudgetExceeded: (current, limit) => {
    console.error(`Budget exceeded! $${current.toFixed(2)} / $${limit}`);
    // Send alert email, Slack message, etc.
  },
  onThresholdReached: (current, limit) => {
    console.warn(`Budget warning: $${current.toFixed(2)} / $${limit}`);
  }
});

bridge.use(costTracker);

// Get current cost
const stats = costTracker.getStats();
console.log(`Current cost: $${stats.totalCost.toFixed(2)}`);
console.log(`Requests: ${stats.requestCount}`);
console.log(`Average cost per request: $${stats.avgCostPerRequest.toFixed(4)}`);
```

---

### OpenTelemetry Middleware

#### `createOpenTelemetryMiddleware(options)`

Adds distributed tracing with OpenTelemetry.

**Parameters:**

```typescript
interface OpenTelemetryMiddlewareOptions {
  /** Service name (default: 'ai.matey') */
  serviceName?: string;

  /** Tracer provider */
  tracerProvider?: TracerProvider;

  /** Span attributes to include */
  attributes?: Record<string, any>;

  /** Record request/response bodies (default: false) */
  recordBodies?: boolean;

  /** Record token usage (default: true) */
  recordUsage?: boolean;
}
```

**Returns:** `Middleware`

**Example:**

```typescript
import { createOpenTelemetryMiddleware } from 'ai.matey.middleware';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const provider = new NodeTracerProvider();

const tracing = createOpenTelemetryMiddleware({
  serviceName: 'my-ai-service',
  tracerProvider: provider,
  recordUsage: true
});

bridge.use(tracing);
```

---

### Rate Limit Middleware

#### `createRateLimitMiddleware(options)`

Enforces rate limits on requests.

**Parameters:**

```typescript
interface RateLimitMiddlewareOptions {
  /** Maximum requests per window */
  maxRequests: number;

  /** Time window in ms */
  windowMs: number;

  /** Strategy: 'fixed-window' | 'sliding-window' | 'token-bucket' */
  strategy?: string;

  /** Called when rate limit exceeded */
  onRateLimitExceeded?: (retryAfter: number) => void;
}
```

**Returns:** `Middleware`

**Example:**

```typescript
import { createRateLimitMiddleware } from 'ai.matey.middleware';

const rateLimit = createRateLimitMiddleware({
  maxRequests: 60,       // 60 requests
  windowMs: 60000,       // per minute
  strategy: 'sliding-window',
  onRateLimitExceeded: (retryAfter) => {
    console.log(`Rate limit exceeded. Retry after ${retryAfter}ms`);
  }
});

bridge.use(rateLimit);
```

---

### Validation Middleware

#### `createValidationMiddleware(options)`

Validates requests and responses against schemas.

**Parameters:**

```typescript
interface ValidationMiddlewareOptions {
  /** Request schema (JSON Schema) */
  requestSchema?: object;

  /** Response schema (JSON Schema) */
  responseSchema?: object;

  /** Throw error on validation failure (default: true) */
  strict?: boolean;

  /** Custom validator function */
  customValidator?: (data: any, schema: any) => boolean;
}
```

**Returns:** `Middleware`

**Example:**

```typescript
import { createValidationMiddleware } from 'ai.matey.middleware';

const validation = createValidationMiddleware({
  requestSchema: {
    type: 'object',
    properties: {
      model: { type: 'string', minLength: 1 },
      messages: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['role', 'content'],
          properties: {
            role: { enum: ['system', 'user', 'assistant'] },
            content: { type: 'string', minLength: 1 }
          }
        }
      }
    },
    required: ['model', 'messages']
  },
  strict: true
});

bridge.use(validation);
```

---

### Conversation History Middleware

#### `createConversationHistoryMiddleware(options)`

Maintains conversation state across requests.

**Parameters:**

```typescript
interface ConversationHistoryMiddlewareOptions {
  /** Maximum messages to keep (default: 100) */
  maxMessages?: number;

  /** Storage: 'memory' | 'redis' | 'database' (default: 'memory') */
  storage?: string;

  /** Session TTL in seconds (default: 3600) */
  sessionTtl?: number;

  /** Auto-summarize long conversations (default: false) */
  autoSummarize?: boolean;

  /** Summarization threshold (default: 50 messages) */
  summarizeThreshold?: number;
}
```

**Returns:** `Middleware`

**Example:**

```typescript
import { createConversationHistoryMiddleware } from 'ai.matey.middleware';

const history = createConversationHistoryMiddleware({
  maxMessages: 100,
  storage: 'memory',
  sessionTtl: 3600,
  autoSummarize: true,
  summarizeThreshold: 50
});

bridge.use(history);

// Messages are automatically maintained across requests
await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
  sessionId: 'user-123'
});

await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'What did I just say?' }],
  sessionId: 'user-123'
});
// Previous message is automatically included
```

---

## Custom Middleware

### Creating Custom Middleware

```typescript
import { Middleware, IRChatCompletionRequest, IRChatCompletionResponse } from 'ai.matey.types';

function createCustomMiddleware(options: CustomOptions): Middleware {
  return {
    name: 'custom-middleware',

    async onRequest(request: IRChatCompletionRequest) {
      // Modify request before sending
      console.log('Before request:', request.model);

      // Can modify and return request
      return {
        ...request,
        temperature: Math.min(request.temperature || 0.7, 0.9)
      };
    },

    async onResponse(response: IRChatCompletionResponse) {
      // Process response after receiving
      console.log('After response:', response.usage);

      return response;
    },

    async onError(error: Error) {
      // Handle errors
      console.error('Error occurred:', error.message);

      // Can modify error or return void
      return error;
    },

    async onStreamChunk(chunk: IRChatCompletionChunk) {
      // Process each stream chunk
      return chunk;
    },

    async cleanup() {
      // Cleanup when middleware is removed
      console.log('Cleaning up...');
    }
  };
}
```

---

### Middleware with State

```typescript
function createStatefulMiddleware() {
  let requestCount = 0;
  const startTime = Date.now();

  return {
    name: 'request-counter',

    async onRequest(request) {
      requestCount++;
      console.log(`Request #${requestCount}`);
      return request;
    },

    getStats() {
      return {
        totalRequests: requestCount,
        uptime: Date.now() - startTime,
        avgRequestsPerMinute: (requestCount / ((Date.now() - startTime) / 60000)).toFixed(2)
      };
    }
  };
}

const counter = createStatefulMiddleware();
bridge.use(counter);

// Later
console.log(counter.getStats());
```

---

### Async Middleware

```typescript
function createAsyncMiddleware() {
  return {
    name: 'async-middleware',

    async onRequest(request) {
      // Async operations
      const userContext = await fetchUserContext(request.userId);

      return {
        ...request,
        messages: [
          { role: 'system', content: `User context: ${userContext}` },
          ...request.messages
        ]
      };
    },

    async onResponse(response) {
      // Async logging
      await logToDatabase({
        request: response.id,
        tokens: response.usage?.total_tokens,
        timestamp: new Date()
      });

      return response;
    }
  };
}
```

---

## Middleware Order

**Order matters!** Middleware is executed in the order added:

```typescript
// ❌ Wrong order
bridge.use(createCachingMiddleware());  // Runs 3rd
bridge.use(createRetryMiddleware());    // Runs 2nd
bridge.use(createLoggingMiddleware());  // Runs 1st

// ✅ Correct order
bridge.use(createLoggingMiddleware());  // Runs 1st (logs everything)
bridge.use(createRetryMiddleware());    // Runs 2nd (retries if needed)
bridge.use(createCachingMiddleware());  // Runs 3rd (caches successful responses)
```

**Request Flow:**
1. Logging → logs request
2. Retry → sends request (may retry)
3. Caching → checks cache, stores response
4. Backend → executes request

**Response Flow:**
1. Backend → returns response
2. Caching → stores in cache
3. Retry → handles errors
4. Logging → logs response

---

## Middleware Composition

### Combining Multiple Middleware

```typescript
import {
  createLoggingMiddleware,
  createRetryMiddleware,
  createCachingMiddleware,
  createCostTrackingMiddleware,
  createValidationMiddleware
} from 'ai.matey.middleware';

const bridge = new Bridge(frontend, backend);

// Production middleware stack
bridge
  .use(createLoggingMiddleware({ level: 'info' }))
  .use(createValidationMiddleware({ strict: true }))
  .use(createRetryMiddleware({ maxAttempts: 3 }))
  .use(createCachingMiddleware({ ttl: 3600 }))
  .use(createCostTrackingMiddleware({ budgetLimit: 100 }));
```

---

## See Also

- [Bridge API](/ai-matey/api/bridge) - Using middleware with Bridge
- [Router API](/ai-matey/api/router) - Using middleware with Router
- [Middleware Package](/ai-matey/packages/middleware) - Package documentation
- [Middleware Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware) - Code examples
