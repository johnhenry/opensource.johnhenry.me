---
title: "ai.matey.middleware"
---

Production-ready middleware for logging, caching, retry logic, cost tracking, and more. Transform your Bridge into a production-grade AI application.

## Installation

```bash
npm install ai.matey.middleware
```

## Overview

Middleware intercepts requests and responses as they flow through your Bridge or Router, allowing you to:

- **Log** all requests and responses
- **Cache** responses to reduce costs
- **Retry** failed requests automatically
- **Track costs** and set budgets
- **Transform** data on-the-fly
- **Rate limit** to prevent abuse

## Quick Start

```typescript
import { Bridge } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';
import {
  createLoggingMiddleware,
  createCachingMiddleware,
  createRetryMiddleware
} from 'ai.matey.middleware';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey: 'your-key' })
);

// Add middleware (order matters!)
bridge.use(createLoggingMiddleware({ level: 'info' }));
bridge.use(createRetryMiddleware({ maxAttempts: 3 }));
bridge.use(createCachingMiddleware({ ttl: 3600 }));

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
import { createLoggingMiddleware } from 'ai.matey.middleware';

bridge.use(
  createLoggingMiddleware({
    level: 'info' // 'debug' | 'info' | 'warn' | 'error'
  })
);
```

### Configuration

```typescript
interface LoggingOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  logRequests?: boolean;        // Log outgoing requests (default: true)
  logResponses?: boolean;       // Log incoming responses (default: true)
  logErrors?: boolean;          // Log errors (default: true)
  redactFields?: string[];      // Fields to redact (e.g., ['apiKey'])
  includeTimestamps?: boolean;  // Add timestamps (default: true)
  destination?: 'console' | 'file' | Logger; // Where to log
  format?: 'text' | 'json';     // Output format
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

```typescript
bridge.use(
  createLoggingMiddleware({
    level: 'info',
    redactFields: ['apiKey', 'authorization', 'api_key']
  })
);

// API keys will be replaced with [REDACTED]
```

#### JSON Logging

```typescript
bridge.use(
  createLoggingMiddleware({
    level: 'info',
    format: 'json'
  })
);

// Output:
// {"level":"info","timestamp":"2024-01-01T00:00:00.000Z","type":"request","model":"gpt-4"}
```

#### Custom Logger

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  transports: [new winston.transports.File({ filename: 'ai.log' })]
});

bridge.use(
  createLoggingMiddleware({
    level: 'info',
    destination: logger
  })
);
```

## Caching Middleware

Cache responses to reduce API costs and latency.

### Basic Usage

```typescript
import { createCachingMiddleware } from 'ai.matey.middleware';

bridge.use(
  createCachingMiddleware({
    ttl: 3600 // Cache for 1 hour (in seconds)
  })
);
```

### Configuration

```typescript
interface CachingOptions {
  ttl: number;                  // Time to live in seconds
  maxSize?: number;             // Max cached items (default: 1000)
  storage?: 'memory' | 'redis' | 'file' | CacheStorage;
  keyGenerator?: (request) => string; // Custom cache key
  shouldCache?: (response) => boolean; // Should this response be cached?
  connectionString?: string;    // For Redis
}
```

### Examples

#### In-Memory Cache

```typescript
bridge.use(
  createCachingMiddleware({
    ttl: 3600,        // 1 hour
    maxSize: 1000,    // Max 1000 items
    storage: 'memory'
  })
);

// First request hits the API
const response1 = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'What is 2+2?' }]
});

// Second identical request served from cache (<1ms)
const response2 = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'What is 2+2?' }]
});
```

#### Redis Cache

```typescript
bridge.use(
  createCachingMiddleware({
    ttl: 3600,
    storage: 'redis',
    connectionString: 'redis://localhost:6379'
  })
);
```

#### Custom Cache Key

```typescript
bridge.use(
  createCachingMiddleware({
    ttl: 3600,
    keyGenerator: (request) => {
      // Only cache based on last message
      const lastMessage = request.messages[request.messages.length - 1];
      return `chat:${lastMessage.content}`;
    }
  })
);
```

#### Conditional Caching

```typescript
bridge.use(
  createCachingMiddleware({
    ttl: 3600,
    shouldCache: (response) => {
      // Only cache if response is successful and not too long
      return response.usage?.total_tokens < 1000;
    }
  })
);
```

## Retry Middleware

Automatically retry failed requests with exponential backoff.

### Basic Usage

```typescript
import { createRetryMiddleware } from 'ai.matey.middleware';

bridge.use(
  createRetryMiddleware({
    maxAttempts: 3 // Retry up to 3 times
  })
);
```

### Configuration

```typescript
interface RetryOptions {
  maxAttempts: number;          // Max retry attempts (default: 3)
  initialDelay?: number;        // Initial delay in ms (default: 1000)
  maxDelay?: number;            // Max delay in ms (default: 10000)
  backoffMultiplier?: number;   // Backoff multiplier (default: 2)
  jitter?: boolean;             // Add randomness (default: true)
  retryableErrors?: string[];   // Which errors to retry
  shouldRetry?: (error) => boolean; // Custom retry logic
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

```typescript
bridge.use(
  createRetryMiddleware({
    maxAttempts: 3,
    retryableErrors: [
      'RATE_LIMIT_EXCEEDED',
      'TIMEOUT',
      'SERVICE_UNAVAILABLE'
    ]
    // Don't retry AUTH_ERROR, INVALID_REQUEST, etc.
  })
);
```

#### Custom Retry Logic

```typescript
bridge.use(
  createRetryMiddleware({
    maxAttempts: 5,
    shouldRetry: (error, attempt) => {
      // Retry rate limits up to 5 times
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        return attempt < 5;
      }

      // Retry timeouts up to 2 times
      if (error.code === 'TIMEOUT') {
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
    jitter: true // Adds ±25% randomness to prevent thundering herd
  })
);

// Delays: 1s±250ms, 2s±500ms, 4s±1s
```

## Cost Tracking Middleware

Monitor API costs and set budgets.

### Basic Usage

```typescript
import { createCostTrackingMiddleware } from 'ai.matey.middleware';

bridge.use(
  createCostTrackingMiddleware({
    budgetLimit: 100 // Alert when cost exceeds $100
  })
);
```

### Configuration

```typescript
interface CostTrackingOptions {
  budgetLimit?: number;         // Budget limit in dollars
  alertThreshold?: number;      // Alert at % of budget (default: 0.9)
  resetInterval?: number;       // Reset period in ms (default: 86400000 = 1 day)
  onBudgetExceeded?: () => void; // Callback when budget exceeded
  onThresholdReached?: (used: number, limit: number) => void;
  pricing?: Record<string, { input: number; output: number }>; // Custom pricing
}
```

### Examples

#### Budget Alerts

```typescript
bridge.use(
  createCostTrackingMiddleware({
    budgetLimit: 100,       // $100 daily budget
    alertThreshold: 0.9,    // Alert at 90%
    onBudgetExceeded: () => {
      console.error('⚠️  Daily budget exceeded!');
      sendSlackAlert('Budget exceeded!');
    },
    onThresholdReached: (used, limit) => {
      console.warn(`⚠️  ${used}/${limit} budget used (90%)`);
    }
  })
);
```

#### Custom Pricing

```typescript
bridge.use(
  createCostTrackingMiddleware({
    pricing: {
      'gpt-4': { input: 0.03, output: 0.06 }, // per 1K tokens
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
      'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 }
    }
  })
);
```

#### Get Current Cost

```typescript
const costTracker = createCostTrackingMiddleware({
  budgetLimit: 100
});

bridge.use(costTracker);

// Later
console.log('Current cost:', costTracker.getCurrentCost());
console.log('Remaining budget:', costTracker.getRemainingBudget());
```

## Transform Middleware

Modify requests and responses on-the-fly.

### Basic Usage

```typescript
import { createTransformMiddleware } from 'ai.matey.middleware';

bridge.use(
  createTransformMiddleware({
    transformRequest: (request) => {
      // Modify request before sending
      return { ...request, temperature: 0.7 };
    }
  })
);
```

### Configuration

```typescript
interface TransformOptions {
  transformRequest?: (request: IRChatCompletionRequest) => IRChatCompletionRequest;
  transformResponse?: (response: IRChatCompletionResponse) => IRChatCompletionResponse;
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
      temperature: 0.7 // Always use 0.7
    })
  })
);
```

#### Transform Output

```typescript
bridge.use(
  createTransformMiddleware({
    transformResponse: (response) => ({
      ...response,
      choices: response.choices.map(choice => ({
        ...choice,
        message: {
          ...choice.message,
          content: choice.message.content.toUpperCase()
        }
      }))
    })
  })
);
```

#### Add Metadata

```typescript
bridge.use(
  createTransformMiddleware({
    transformRequest: (request) => ({
      ...request,
      metadata: {
        user_id: getCurrentUserId(),
        timestamp: Date.now()
      }
    })
  })
);
```

## Rate Limiting Middleware

Prevent API abuse with rate limiting.

### Basic Usage

```typescript
import { createRateLimitMiddleware } from 'ai.matey.middleware';

bridge.use(
  createRateLimitMiddleware({
    maxRequests: 100,  // Max 100 requests
    windowMs: 60000    // Per minute
  })
);
```

### Configuration

```typescript
interface RateLimitOptions {
  maxRequests: number;          // Max requests per window
  windowMs: number;             // Window size in milliseconds
  strategy?: 'fixed' | 'sliding'; // Window strategy
  onLimitReached?: () => void;  // Callback when limit reached
}
```

### Examples

#### Fixed Window

```typescript
bridge.use(
  createRateLimitMiddleware({
    maxRequests: 100,
    windowMs: 60000,     // 100 requests per minute
    strategy: 'fixed',
    onLimitReached: () => {
      console.warn('Rate limit reached!');
    }
  })
);
```

#### Sliding Window

```typescript
bridge.use(
  createRateLimitMiddleware({
    maxRequests: 100,
    windowMs: 60000,
    strategy: 'sliding' // More accurate
  })
);
```

## Circuit Breaker Middleware

Stop making requests to failing services.

### Basic Usage

```typescript
import { createCircuitBreakerMiddleware } from 'ai.matey.middleware';

bridge.use(
  createCircuitBreakerMiddleware({
    threshold: 5,     // Open after 5 failures
    timeout: 60000    // Try again after 1 minute
  })
);
```

### Configuration

```typescript
interface CircuitBreakerOptions {
  threshold: number;            // Failures before opening
  timeout: number;              // Time before trying again (ms)
  resetTimeout?: number;        // Time to fully reset (ms)
}
```

### States

- **Closed**: Normal operation, requests go through
- **Open**: Service is failing, requests immediately fail
- **Half-Open**: Testing if service recovered

## Middleware Composition

### Order Matters

Middleware executes in reverse order (last added runs first):

```typescript
bridge.use(middleware1); // Runs 3rd
bridge.use(middleware2); // Runs 2nd
bridge.use(middleware3); // Runs 1st

// Request flow:
// → middleware3 → middleware2 → middleware1 → Backend
// ← middleware3 ← middleware2 ← middleware1 ← Backend
```

### Recommended Order

```typescript
// 1. Logging (outermost - sees everything)
bridge.use(createLoggingMiddleware({ level: 'info' }));

// 2. Rate limiting (protect from abuse)
bridge.use(createRateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }));

// 3. Circuit breaker (stop requests to failing services)
bridge.use(createCircuitBreakerMiddleware({ threshold: 5, timeout: 60000 }));

// 4. Retry (retry failed requests)
bridge.use(createRetryMiddleware({ maxAttempts: 3 }));

// 5. Caching (cache successful responses)
bridge.use(createCachingMiddleware({ ttl: 3600 }));

// 6. Cost tracking (monitor spending)
bridge.use(createCostTrackingMiddleware({ budgetLimit: 100 }));

// 7. Transform (modify requests/responses)
bridge.use(createTransformMiddleware({ transformRequest: (req) => req }));
```

## Creating Custom Middleware

### Basic Template

```typescript
function createCustomMiddleware(options) {
  return {
    name: 'custom',
    async execute(request, next) {
      // Before request
      console.log('Before request');

      // Call next middleware/backend
      const response = await next(request);

      // After response
      console.log('After response');

      return response;
    }
  };
}

bridge.use(createCustomMiddleware());
```

### With State

```typescript
function createRequestCounter() {
  let count = 0;

  return {
    name: 'request-counter',
    async execute(request, next) {
      count++;
      console.log(`Request #${count}`);
      return next(request);
    },
    getCount: () => count,
    reset: () => { count = 0; }
  };
}

const counter = createRequestCounter();
bridge.use(counter);

// Later
console.log('Total requests:', counter.getCount());
```

### Async Operations

```typescript
function createDatabaseLogger() {
  return {
    name: 'db-logger',
    async execute(request, next) {
      const start = Date.now();

      try {
        const response = await next(request);

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
    }
  };
}
```

### Conditional Logic

```typescript
function createConditionalCache() {
  return {
    name: 'conditional-cache',
    async execute(request, next) {
      // Only cache short messages
      const messageLength = JSON.stringify(request.messages).length;

      if (messageLength < 500) {
        return cacheMiddleware.execute(request, next);
      }

      return next(request);
    }
  };
}
```

## Production Stack

Here's a complete production middleware stack:

```typescript
import {
  createLoggingMiddleware,
  createRateLimitMiddleware,
  createCircuitBreakerMiddleware,
  createRetryMiddleware,
  createCachingMiddleware,
  createCostTrackingMiddleware
} from 'ai.matey.middleware';

function createProductionBridge(apiKey) {
  const bridge = new Bridge(
    new OpenAIFrontendAdapter(),
    new AnthropicBackendAdapter({ apiKey })
  );

  // Production middleware stack
  bridge.use(createLoggingMiddleware({
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    destination: 'file',
    redactFields: ['apiKey', 'authorization']
  }));

  bridge.use(createRateLimitMiddleware({
    maxRequests: 1000,
    windowMs: 60000,
    strategy: 'sliding'
  }));

  bridge.use(createCircuitBreakerMiddleware({
    threshold: 5,
    timeout: 60000
  }));

  bridge.use(createRetryMiddleware({
    maxAttempts: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    jitter: true
  }));

  bridge.use(createCachingMiddleware({
    ttl: 3600,
    storage: 'redis',
    connectionString: process.env.REDIS_URL
  }));

  bridge.use(createCostTrackingMiddleware({
    budgetLimit: parseFloat(process.env.DAILY_BUDGET || '100'),
    onBudgetExceeded: async () => {
      await sendAlert('Budget exceeded!');
    }
  }));

  return bridge;
}
```

## Best Practices

1. **Order middleware correctly** - logging first, caching last
2. **Redact sensitive data** - never log API keys
3. **Set appropriate TTLs** - balance freshness vs cost
4. **Monitor costs** - use cost tracking
5. **Use circuit breakers** - prevent cascading failures
6. **Add jitter to retries** - prevent thundering herd

## See Also

- [Core Package](/ai-matey/packages/core) - Bridge and Router
- [Tutorial: Using Middleware](/ai-matey/tutorials/beginner/using-middleware) - Step-by-step guide
- [Examples on GitHub](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples) - View all examples
