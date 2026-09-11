---
title: "@johnhenry/aimatey-middleware"
description: "Guide to the built-in middleware in @johnhenry/aimatey-middleware: logging, caching, retry, cost tracking, and more."
---

Production-ready middleware for logging, caching, retry logic, cost tracking, and more. Transform your Bridge into a production-grade AI application.

## Installation

```bash
npm install @johnhenry/aimatey-middleware
```

## Overview

Middleware intercepts requests and responses as they flow through your Bridge or Router, allowing you to:

- **Log** all requests and responses
- **Cache** responses to reduce costs
- **Retry** failed requests automatically
- **Track costs** and set budgets
- **Transform** data on-the-fly
- **Validate** and sanitize requests

## Quick Start

```typescript
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
import {
  createLoggingMiddleware,
  createCachingMiddleware,
  createRetryMiddleware
} from '@johnhenry/aimatey-middleware';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey: 'your-key' })
);

// Add middleware (order matters!)
bridge.use(createLoggingMiddleware({ level: 'info' }));
bridge.use(createRetryMiddleware({ maxAttempts: 3 }));
bridge.use(createCachingMiddleware({ ttl: 3_600_000 })); // ttl is milliseconds

// All requests now have logging, retry, and caching!
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## Logging Middleware

Track all requests and responses for debugging and monitoring.

### Basic Usage

```typescript
import { createLoggingMiddleware } from '@johnhenry/aimatey-middleware';

bridge.use(
  createLoggingMiddleware({
    level: 'info' // 'debug' | 'info' | 'warn' | 'error'
  })
);
```

### Configuration

```typescript
interface LoggingConfig {
  level?: 'debug' | 'info' | 'warn' | 'error'; // default: 'info'
  logRequests?: boolean;   // Log request bodies (default: true)
  logResponses?: boolean;  // Log response bodies (default: true)
  logErrors?: boolean;     // Log errors (default: true)
  sanitize?: boolean;      // Redact API keys and tokens (default: true)
  logger?: Logger;         // Custom logger (default: console)
  prefix?: string;         // Custom log prefix
}

interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}
```

### Examples

#### Basic Logging

```typescript
bridge.use(
  createLoggingMiddleware({
    level: 'info',
    logRequests: true,
    logResponses: true
  })
);

// Output:
// [INFO] Request: Model=gpt-4, Messages=1, Temperature=0.7
// [INFO] Response: 200 OK (1234ms), Tokens=50
```

#### Redact Sensitive Data

Redaction is a single on/off switch, not a field list. With `sanitize: true`
(the default) API keys and tokens are replaced with `[REDACTED]`.

```typescript
bridge.use(
  createLoggingMiddleware({
    level: 'info',
    sanitize: true
  })
);
```

#### Custom Logger

There is no `format` or `destination` option - route output by supplying a
`logger`. Anything with `debug`/`info`/`warn`/`error` methods works, so a
JSON or file logger is a matter of which logger you pass.

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: 'ai.log' })]
});

bridge.use(
  createLoggingMiddleware({
    level: 'info',
    logger
  })
);
```

## Caching Middleware

Cache responses to reduce API costs and latency.

### Basic Usage

```typescript
import { createCachingMiddleware } from '@johnhenry/aimatey-middleware';

bridge.use(
  createCachingMiddleware({
    ttl: 3_600_000 // Cache for 1 hour (ttl is in milliseconds)
  })
);

// Cache entries belong to a caller; name one on each request
await bridge.chat(request, { principal: userId });
```

### Configuration

```typescript
interface CachingConfig {
  ttl?: number;                 // Time to live in MILLISECONDS (default: 3600000)
  maxSize?: number;             // Max cached items (default: 1000)
  storage?: CacheStorage;       // Storage object (default: in-memory LRU)
  keyGenerator?: (request: IRChatRequest) => string; // Custom cache key
  scopeKey?: string | ((request: IRChatRequest) => string | undefined); // Caller scoping
  unidentified?: 'bypass' | 'share'; // Request with no caller identity (default: 'bypass')
  cacheStreaming?: boolean;     // Also cache streaming responses (default: false)
}

interface CacheStorage {
  get(key: string): Promise<IRChatResponse | undefined>;
  set(key: string, value: IRChatResponse, ttl?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
}
```

### Examples

#### In-Memory Cache

```typescript
bridge.use(
  createCachingMiddleware({
    ttl: 3_600_000,   // 1 hour, in milliseconds
    maxSize: 1000     // Max 1000 items
    // storage defaults to an in-memory LRU store
  })
);

// First request hits the API
const response1 = await bridge.chat(
  { model: 'gpt-4', messages: [{ role: 'user', content: 'What is 2+2?' }] },
  { principal: userId }
);

// Same prompt, same caller: served from cache (<1ms)
const response2 = await bridge.chat(
  { model: 'gpt-4', messages: [{ role: 'user', content: 'What is 2+2?' }] },
  { principal: userId }
);
```

Cache entries are scoped to the caller named by `principal`. A request that
names no caller is not cached at all - see
[Scoping the Cache per Caller](#scoping-the-cache-per-caller) below.

#### Redis Cache

`storage` takes a `CacheStorage` object, so there is no built-in Redis backend
and no `connectionString`. Implement the five methods against your own client:

```typescript
import type { CacheStorage, IRChatResponse } from '@johnhenry/aimatey-types';

function redisStorage(client): CacheStorage {
  return {
    async get(key) {
      const raw = await client.get(key);
      return raw ? (JSON.parse(raw) as IRChatResponse) : undefined;
    },
    async set(key, value, ttl) {
      await client.set(key, JSON.stringify(value), { PX: ttl ?? 3_600_000 });
    },
    async has(key) {
      return (await client.exists(key)) === 1;
    },
    async delete(key) {
      return (await client.del(key)) > 0;
    },
    async clear() {
      await client.flushDb();
    }
  };
}

bridge.use(
  createCachingMiddleware({
    ttl: 3_600_000,
    storage: redisStorage(redisClient)
  })
);
```

#### Custom Cache Key

```typescript
bridge.use(
  createCachingMiddleware({
    ttl: 3_600_000,
    keyGenerator: (request) => {
      // Only cache based on last message
      const lastMessage = request.messages[request.messages.length - 1];
      return `chat:${JSON.stringify(lastMessage.content)}`;
    }
  })
);
```

#### Scoping the Cache per Caller

Cache entries belong to a caller. The default key mixes in a scope taken from
`scopeKey`, or failing that from the request's `metadata.principal`, which is
set per request:

```typescript
await bridge.chat(request, { principal: `tenant-${tenantId}:user-${userId}` });
```

A request with neither is **not cached at all** - it is passed through with a
`cache-bypassed` warning on `metadata.warnings`. That is the safe default: a
cache with nothing to scope on is a cache that answers whoever asks next.

When identity lives somewhere the request does not reach, `scopeKey` supplies it
from the middleware side and wins over `metadata.principal`:

```typescript
bridge.use(
  createCachingMiddleware({
    ttl: 3_600_000,
    scopeKey: () => currentTenantId() // e.g. an async-local store
  })
);
```

#### Single-Tenant Deployments

One process, one audience, every entry safe to share - say so explicitly and
unidentified requests are cached in one shared bucket again:

```typescript
bridge.use(
  createCachingMiddleware({
    ttl: 3_600_000,
    unidentified: 'share'
  })
);
```

The keys are unchanged by this option, so an existing external cache (Redis and
friends) keeps its entries across the upgrade.

## Retry Middleware

Automatically retry failed requests with exponential backoff.

### Basic Usage

```typescript
import { createRetryMiddleware } from '@johnhenry/aimatey-middleware';

bridge.use(
  createRetryMiddleware({
    maxAttempts: 3 // Retry up to 3 times
  })
);
```

### Configuration

```typescript
interface RetryConfig {
  maxAttempts?: number;         // Total attempts, first included (default: 3)
  initialDelay?: number;        // Initial delay in ms (default: 1000)
  maxDelay?: number;            // Max delay in ms (default: 30000)
  backoffMultiplier?: number;   // Backoff multiplier (default: 2)
  useJitter?: boolean;          // Add randomness (default: true)
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}
```

### Examples

#### Basic Retry

```typescript
bridge.use(
  createRetryMiddleware({
    maxAttempts: 3,
    initialDelay: 1000,    // Wait 1s before first retry
    maxDelay: 10000,       // Max 10s between retries
    backoffMultiplier: 2   // Double delay each time (1s, 2s, 4s)
  })
);

// If request fails, automatically retries:
// Attempt 1: Immediate
// Attempt 2: After 1s
// Attempt 3: After 2s
// Attempt 4: After 4s
```

#### Specific Errors Only

There is no `retryableErrors` list - which errors retry is decided by
`shouldRetry`. `createRetryPredicate` builds one from the shipped classifiers:

```typescript
import { createRetryMiddleware, createRetryPredicate } from '@johnhenry/aimatey-middleware';

bridge.use(
  createRetryMiddleware({
    maxAttempts: 3,
    shouldRetry: createRetryPredicate(['rate_limit', 'network', 'server'])
    // Auth and validation errors are not retried
  })
);
```

#### Custom Retry Logic

```typescript
import { AdapterError, ErrorCode } from '@johnhenry/aimatey-errors';

bridge.use(
  createRetryMiddleware({
    maxAttempts: 5,
    shouldRetry: (error, attempt) => {
      if (!(error instanceof AdapterError)) return false;

      // Retry rate limits up to 5 times
      if (error.code === ErrorCode.RATE_LIMIT_EXCEEDED) {
        return attempt < 5;
      }

      // Retry timeouts up to 2 times
      if (
        error.code === ErrorCode.CONNECTION_TIMEOUT ||
        error.code === ErrorCode.PROVIDER_TIMEOUT
      ) {
        return attempt < 2;
      }

      // Don't retry other errors
      return false;
    }
  })
);
```

#### With Jitter

```typescript
bridge.use(
  createRetryMiddleware({
    maxAttempts: 3,
    useJitter: true // Adds randomness to prevent thundering herd
  })
);
```

## Cost Tracking Middleware

Monitor API costs and set budgets.

### Basic Usage

```typescript
import { createCostTrackingMiddleware } from '@johnhenry/aimatey-middleware';

bridge.use(
  createCostTrackingMiddleware({
    dailyThreshold: 100 // Alert once the day's spend passes $100
  })
);
```

### Configuration

```typescript
interface CostTrackingConfig {
  storage?: CostStorage;                       // Where costs are recorded
  providers?: Record<string, ProviderPricing>; // Per-provider pricing overrides
  models?: ModelPricing[];                     // Per-model pricing overrides
  requestThreshold?: number;                   // Per-request alert, USD
  hourlyThreshold?: number;                    // Hourly alert, USD
  dailyThreshold?: number;                     // Daily alert, USD
  onCost?: (cost: CostCalculation) => void | Promise<void>;
  onThresholdExceeded?: (cost: CostCalculation, threshold: number) => void | Promise<void>;
  logCosts?: boolean;                          // Log each cost (default: false)
  includeInMetadata?: boolean;                 // Attach cost to metadata (default: true)
}

interface ProviderPricing {
  inputCostPer1M: number;   // USD per 1M input tokens
  outputCostPer1M: number;  // USD per 1M output tokens
  cachedInputCostPer1M?: number;
  imageInputCostPer1M?: number;
}
```

### Examples

#### Budget Alerts

Thresholds are absolute dollar amounts; a single `onThresholdExceeded` callback
fires for whichever one was crossed.

```typescript
bridge.use(
  createCostTrackingMiddleware({
    dailyThreshold: 100,   // $100 per day
    hourlyThreshold: 10,   // $10 per hour
    requestThreshold: 1,   // $1 for any single request
    onThresholdExceeded: (cost, threshold) => {
      console.error(`⚠️  Spend passed $${threshold}`);
      sendSlackAlert(`Last request: $${cost.totalCost.toFixed(4)} on ${cost.model}`);
    }
  })
);
```

#### Custom Pricing

Pricing is quoted per million tokens. `models` matches a model id or RegExp;
`providers` sets a per-provider default.

```typescript
bridge.use(
  createCostTrackingMiddleware({
    models: [
      { model: 'gpt-4', pricing: { inputCostPer1M: 30, outputCostPer1M: 60 } },
      { model: /^claude-3-5-sonnet/, pricing: { inputCostPer1M: 3, outputCostPer1M: 15 } }
    ],
    providers: {
      openai: { inputCostPer1M: 0.5, outputCostPer1M: 1.5 }
    }
  })
);
```

#### Get Current Cost

The factory returns a plain `Middleware`, so there is no `getCurrentCost()` or
`getRemainingBudget()`. Read totals back from the storage with `getCostStats`:

```typescript
import {
  createCostTrackingMiddleware,
  getCostStats,
  InMemoryCostStorage
} from '@johnhenry/aimatey-middleware';

const storage = new InMemoryCostStorage();
bridge.use(createCostTrackingMiddleware({ storage, dailyThreshold: 100 }));

// Later
const stats = await getCostStats(storage, 24);
console.log('Spent in last 24h:', stats.total);
console.log('Remaining against a $100 budget:', 100 - stats.total);
```

## Transform Middleware

Modify requests and responses on-the-fly.

### Basic Usage

```typescript
import { createTransformMiddleware } from '@johnhenry/aimatey-middleware';

bridge.use(
  createTransformMiddleware({
    transformRequest: (request) => {
      // Modify request before sending - sampling options live under `parameters`
      return { ...request, parameters: { ...request.parameters, temperature: 0.7 } };
    }
  })
);
```

### Configuration

```typescript
interface TransformConfig {
  transformRequest?: (request: IRChatRequest) => IRChatRequest | Promise<IRChatRequest>;
  transformResponse?: (response: IRChatResponse) => IRChatResponse | Promise<IRChatResponse>;
  transformMessages?: (
    messages: readonly IRMessage[]
  ) => readonly IRMessage[] | Promise<readonly IRMessage[]>;
}
```

### Examples

#### Add System Message

```typescript
bridge.use(
  createTransformMiddleware({
    transformRequest: (request) => ({
      ...request,
      messages: [
        { role: 'system', content: 'Be concise.' },
        ...request.messages
      ]
    })
  })
);
```

#### Force Temperature

```typescript
bridge.use(
  createTransformMiddleware({
    transformRequest: (request) => ({
      ...request,
      parameters: { ...request.parameters, temperature: 0.7 } // Always use 0.7
    })
  })
);
```

#### Transform Output

An `IRChatResponse` carries a single `message` - there is no `choices` array.

```typescript
bridge.use(
  createTransformMiddleware({
    transformResponse: (response) => ({
      ...response,
      message: {
        ...response.message,
        content:
          typeof response.message.content === 'string'
            ? response.message.content.toUpperCase()
            : response.message.content
      }
    })
  })
);
```

#### Add Metadata

`metadata` is required and already carries `requestId` and `timestamp`, so merge
into it rather than replacing it, and put your own fields under `custom`.

```typescript
bridge.use(
  createTransformMiddleware({
    transformRequest: (request) => ({
      ...request,
      metadata: {
        ...request.metadata,
        custom: {
          ...request.metadata.custom,
          userId: getCurrentUserId()
        }
      }
    })
  })
);
```

## Rate Limiting and Circuit Breaking

Neither is a middleware in this package.

- **Rate limiting** lives at the HTTP layer: use `RateLimiter` from
  `@johnhenry/aimatey-http-core`, which limits inbound requests to your server.
- **Circuit breaking** is a `Router` feature, not middleware. Enable it with
  `enableCircuitBreaker`, `circuitBreakerThreshold` and `circuitBreakerTimeout`
  in `RouterConfig`, and drive it manually with `router.openCircuitBreaker()`,
  `closeCircuitBreaker()` and `resetCircuitBreaker()`.

```typescript
import { Router } from '@johnhenry/aimatey-core';

const router = new Router({
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 5,   // open after 5 consecutive failures
  circuitBreakerTimeout: 60000, // try again after 1 minute
  fallbackStrategy: 'sequential'
});
```

## Middleware Composition

### Order Matters

Middleware executes in registration order (first added runs first, as the
outermost layer):

```typescript
bridge.use(middleware1); // Runs 1st
bridge.use(middleware2); // Runs 2nd
bridge.use(middleware3); // Runs 3rd

// Request flow:
// → middleware1 → middleware2 → middleware3 → Backend
// ← middleware1 ← middleware2 ← middleware3 ← Backend
```

### Recommended Order

```typescript
// 1. Logging (outermost - sees everything)
bridge.use(createLoggingMiddleware({ level: 'info' }));

// 2. Validation (reject bad requests early)
bridge.use(createValidationMiddleware({ maxMessages: 50 }));

// 3. Retry (retry failed requests)
bridge.use(createRetryMiddleware({ maxAttempts: 3 }));

// 4. Caching (cache successful responses)
bridge.use(createCachingMiddleware({ ttl: 3_600_000 }));

// 5. Cost tracking (monitor spending)
bridge.use(createCostTrackingMiddleware({ dailyThreshold: 100 }));

// 6. Transform (modify requests/responses)
bridge.use(createTransformMiddleware({ transformRequest: (req) => req }));
```

## Creating Custom Middleware

### Basic Template

```typescript
import type { Middleware } from '@johnhenry/aimatey-types';

function createCustomMiddleware(options): Middleware {
  return async (context, next) => {
    // Before request
    console.log('Before request');

    // Call next middleware/backend
    const response = await next();

    // After response
    console.log('After response');

    return response;
  };
}

bridge.use(createCustomMiddleware());
```

### With State

```typescript
function createRequestCounter() {
  let count = 0;

  const middleware: Middleware = async (context, next) => {
    count++;
    console.log(`Request #${count}`);
    return next();
  };

  return {
    middleware,
    getCount: () => count,
    reset: () => { count = 0; }
  };
}

const counter = createRequestCounter();
bridge.use(counter.middleware);

// Later
console.log('Total requests:', counter.getCount());
```

### Async Operations

```typescript
function createDatabaseLogger(): Middleware {
  return async (context, next) => {
    const start = Date.now();
    const request = context.request;

    try {
      const response = await next();

      // Log to database
      await db.logs.insert({
        request,
        response,
        duration: Date.now() - start,
        status: 'success'
      });

      return response;
    } catch (error) {
      await db.logs.insert({
        request,
        error: error.message,
        duration: Date.now() - start,
        status: 'error'
      });

      throw error;
    }
  };
}
```

### Conditional Logic

```typescript
function createConditionalCache(): Middleware {
  return async (context, next) => {
    // Only cache short messages
    const messageLength = JSON.stringify(context.request.messages).length;

    if (messageLength < 500) {
      return cacheMiddleware(context, next);
    }

    return next();
  };
}
```

## Production Stack

Here's a complete production middleware stack:

```typescript
import {
  createLoggingMiddleware,
  createValidationMiddleware,
  createRetryMiddleware,
  createCachingMiddleware,
  createCostTrackingMiddleware,
  InMemoryCostStorage
} from '@johnhenry/aimatey-middleware';

function createProductionBridge(apiKey, fileLogger) {
  const bridge = new Bridge(
    new OpenAIFrontendAdapter(),
    new AnthropicBackendAdapter({ apiKey })
  );

  const costStorage = new InMemoryCostStorage();

  // Production middleware stack
  bridge.use(createLoggingMiddleware({
    level: process.env.LOG_LEVEL || 'info',
    logger: fileLogger,
    sanitize: true
  }));

  bridge.use(createValidationMiddleware({
    maxMessages: 100,
    detectPII: true,
    piiAction: 'redact',
    throwOnError: true
  }));

  bridge.use(createRetryMiddleware({
    maxAttempts: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    useJitter: true
  }));

  bridge.use(createCachingMiddleware({
    ttl: 3_600_000,
    storage: redisStorage(redisClient)
  }));

  bridge.use(createCostTrackingMiddleware({
    storage: costStorage,
    dailyThreshold: parseFloat(process.env.DAILY_BUDGET || '100'),
    onThresholdExceeded: async (_cost, threshold) => {
      await sendAlert(`Spend passed $${threshold}`);
    }
  }));

  return bridge;
}
```

Rate limiting sits in front of this, at the HTTP layer
(`RateLimiter` from `@johnhenry/aimatey-http-core`); circuit breaking is
configured on a `Router`.

## Best Practices

1. **Order middleware correctly** - logging first, caching last
2. **Redact sensitive data** - never log API keys
3. **Set appropriate TTLs** - balance freshness vs cost
4. **Monitor costs** - use cost tracking
5. **Use the router's circuit breaker** - prevent cascading failures
6. **Add jitter to retries** - prevent thundering herd

## See Also

- [Core Package](/aimatey/packages/core) - Bridge and Router
- [Tutorial: Using Middleware](/aimatey/tutorials/beginner/using-middleware) - Step-by-step guide
- [Examples on GitHub](https://github.com/johnhenry/aimatey/tree/main/packages/aimatey-docs/examples) - View all examples
