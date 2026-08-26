---
title: "Tutorial 02: Using Middleware"
description: "Beginner tutorial: add logging, caching, and retry middleware to a Bridge."
---

Learn how to enhance your Bridge with logging, caching, and retry middleware for production-ready applications.

## What You'll Build

A production-grade Bridge with:
- **Logging** to track all requests and responses
- **Caching** to reduce API costs
- **Retry logic** for resilience

## Time Required

⏱️ **15 minutes**

## Prerequisites

- Completed [Tutorial 01: Simple Bridge](/ai-matey/tutorials/beginner/simple-bridge)
- An AI provider API key

## What is Middleware?

Middleware are functions that intercept requests and responses as they flow through your Bridge. They can:

- **Log** requests/responses for debugging
- **Cache** responses to reduce costs
- **Retry** failed requests automatically
- **Transform** data on-the-fly
- **Track costs** and usage
- **Add authentication**

```
Request
   ↓
Logging Middleware (logs request)
   ↓
Caching Middleware (checks cache)
   ↓
Retry Middleware (handles failures)
   ↓
Backend Adapter → AI Provider
   ↓
Retry Middleware (retries on error)
   ↓
Caching Middleware (stores response)
   ↓
Logging Middleware (logs response)
   ↓
Response
```

## Step 1: Install Middleware Package

```bash
npm install @johnhenry/aimatey-middleware
```

## Step 2: Add Logging Middleware

Logging helps you debug and monitor your application:

```typescript
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
import { createLoggingMiddleware } from '@johnhenry/aimatey-middleware';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY })
);

// Add logging middleware
bridge.use(
  createLoggingMiddleware({
    level: 'info',           // Log level: 'debug', 'info', 'warn', 'error'
    logRequests: true,       // Log outgoing requests
    logResponses: true,      // Log incoming responses
    redactFields: ['apiKey'] // Don't log sensitive data
  })
);

// Now all requests will be logged
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

**Console output:**
```
[INFO] Request: POST /chat/completions
[INFO] Model: gpt-4
[INFO] Messages: 1
[INFO] Response: 200 OK (1.2s)
[INFO] Tokens: 50
```

## Step 3: Add Caching Middleware

Caching reduces costs by storing responses:

```typescript
import {
  createLoggingMiddleware,
  createCachingMiddleware
} from '@johnhenry/aimatey-middleware';

bridge.use(createLoggingMiddleware({ level: 'info' }));

// Add caching
bridge.use(
  createCachingMiddleware({
    ttl: 3600,        // Cache for 1 hour (in seconds)
    maxSize: 1000,    // Max 1000 cached items
    storage: 'memory' // or 'redis', 'file'
  })
);

// First request - hits the API
const response1 = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'What is 2+2?' }]
});
console.log('First request took:', response1.latency, 'ms');

// Second identical request - served from cache!
const response2 = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'What is 2+2?' }]
});
console.log('Second request took:', response2.latency, 'ms'); // < 1ms
```

**Console output:**
```
[INFO] Request: Model=gpt-4, Messages=1
[INFO] Cache miss - fetching from API
[INFO] Response: 200 OK (1200ms)
[INFO] Request: Model=gpt-4, Messages=1
[INFO] Cache hit! ✓
[INFO] Response: 200 OK (0.5ms)
```

## Step 4: Add Retry Middleware

Retry failed requests automatically:

```typescript
import {
  createLoggingMiddleware,
  createCachingMiddleware,
  createRetryMiddleware
} from '@johnhenry/aimatey-middleware';

bridge.use(createLoggingMiddleware({ level: 'info' }));
bridge.use(createCachingMiddleware({ ttl: 3600 }));

// Add retry logic
bridge.use(
  createRetryMiddleware({
    maxAttempts: 3,        // Try up to 3 times
    initialDelay: 1000,    // Wait 1s before first retry
    maxDelay: 10000,       // Max 10s between retries
    backoffMultiplier: 2,  // Double delay each time (1s, 2s, 4s)
    retryableErrors: [     // Which errors to retry
      'RATE_LIMIT_EXCEEDED',
      'TIMEOUT',
      'SERVICE_UNAVAILABLE'
    ]
  })
);

// If this fails, it will automatically retry
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

**Console output (if provider fails):**
```
[INFO] Request: Model=gpt-4, Messages=1
[WARN] Request failed: RATE_LIMIT_EXCEEDED
[INFO] Retrying in 1000ms (attempt 1/3)
[INFO] Request: Model=gpt-4, Messages=1
[INFO] Response: 200 OK (1100ms)
```

## Middleware Order Matters!

Middleware is executed in the order you add it. The **last middleware added runs first** (like an onion):

```typescript
// ❌ Wrong order
bridge.use(createCachingMiddleware({ ttl: 3600 }));  // Runs 3rd
bridge.use(createRetryMiddleware({ maxAttempts: 3 })); // Runs 2nd
bridge.use(createLoggingMiddleware({ level: 'info' })); // Runs 1st

// ✅ Correct order
bridge.use(createLoggingMiddleware({ level: 'info' })); // Runs 1st (logs everything)
bridge.use(createRetryMiddleware({ maxAttempts: 3 }));  // Runs 2nd (retries if needed)
bridge.use(createCachingMiddleware({ ttl: 3600 }));     // Runs 3rd (caches successful responses)
```

**Best practice:** Logging first, then retry, then caching.

## Step 5: Combine Everything

Here's a production-ready Bridge with all three middlewares:

```typescript
import 'dotenv/config';
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
import {
  createLoggingMiddleware,
  createRetryMiddleware,
  createCachingMiddleware,
} from '@johnhenry/aimatey-middleware';

// Create bridge
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY
  })
);

// Add middleware (order matters!)
bridge.use(
  createLoggingMiddleware({
    level: 'info',
    logRequests: true,
    logResponses: true,
    redactFields: ['apiKey', 'authorization']
  })
);

bridge.use(
  createRetryMiddleware({
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  })
);

bridge.use(
  createCachingMiddleware({
    ttl: 3600,
    maxSize: 1000,
    storage: 'memory'
  })
);

// Use it
async function chat(message) {
  const response = await bridge.chat({
    model: 'gpt-4',
    messages: [{ role: 'user', content: message }]
  });
  return response.choices[0].message.content;
}

// Test it
console.log(await chat('What is ai.matey?'));
console.log(await chat('What is ai.matey?')); // Cached!
```

## Additional Middleware

### Cost Tracking

Track API costs in real-time:

```typescript
import { createCostTrackingMiddleware } from '@johnhenry/aimatey-middleware';

bridge.use(
  createCostTrackingMiddleware({
    budgetLimit: 100,     // Alert when cost exceeds $100
    alertThreshold: 0.9,  // Alert at 90% of budget
    onBudgetExceeded: () => {
      console.error('Budget exceeded!');
      // Send alert email, Slack message, etc.
    }
  })
);
```

### Transform Middleware

Modify requests/responses on-the-fly:

```typescript
import { createTransformMiddleware } from '@johnhenry/aimatey-middleware';

bridge.use(
  createTransformMiddleware({
    transformRequest: (request) => {
      // Add a system message to every request
      return {
        ...request,
        messages: [
          { role: 'system', content: 'Be concise' },
          ...request.messages
        ]
      };
    },
    transformResponse: (response) => {
      // Transform all responses to uppercase
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
  })
);
```

## Building Custom Middleware

You can create your own middleware:

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

### Middleware Interface

All middleware must implement:

```typescript
interface Middleware {
  name: string;
  execute(request: any, next: Function): Promise<any>;
}
```

The `next` function calls the next middleware in the chain.

## Advanced Patterns

### Conditional Middleware

Only apply middleware for certain requests:

```typescript
bridge.use({
  name: 'conditional-cache',
  async execute(request, next) {
    // Only cache if model is gpt-3.5-turbo
    if (request.model === 'gpt-3.5-turbo') {
      return cacheMiddleware.execute(request, next);
    }
    return next(request);
  }
});
```

### Middleware with State

Create middleware that maintains state:

```typescript
function createRequestCounterMiddleware() {
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

const counter = createRequestCounterMiddleware();
bridge.use(counter);

// Later
console.log('Total requests:', counter.getCount());
```

## Troubleshooting

### "Middleware not executing"

Make sure you're calling `bridge.use()` **before** making any requests:

```typescript
// ✅ Correct
const bridge = new Bridge(...);
bridge.use(createLoggingMiddleware({ level: 'info' }));
await bridge.chat({ ... }); // Middleware runs

// ❌ Wrong
const bridge = new Bridge(...);
await bridge.chat({ ... }); // No middleware
bridge.use(createLoggingMiddleware({ level: 'info' }));
```

### "Cache not working"

Make sure caching middleware is added **after** retry middleware:

```typescript
// ✅ Correct order
bridge.use(createLoggingMiddleware());
bridge.use(createRetryMiddleware());
bridge.use(createCachingMiddleware()); // Caches successful retries

// ❌ Wrong order
bridge.use(createCachingMiddleware());
bridge.use(createRetryMiddleware()); // Retries happen before cache
```

### "Too many retries"

Lower your `maxAttempts` or add specific retry conditions:

```typescript
bridge.use(
  createRetryMiddleware({
    maxAttempts: 2, // Only retry once
    shouldRetry: (error) => {
      // Only retry rate limits, not auth errors
      return error.code === 'RATE_LIMIT_EXCEEDED';
    }
  })
);
```

## Next Steps

Great work! You've learned how to use middleware to make your Bridge production-ready.

**Continue learning:**
- [Tutorial 03: Multi-Provider Routing](/ai-matey/tutorials/beginner/multi-provider) - Use multiple providers
- [Middleware Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware)
- [Middleware Package Docs](/ai-matey/packages/middleware) - Complete middleware reference

## Complete Example

```typescript
// production-bridge.js
import 'dotenv/config';
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
import {
  createLoggingMiddleware,
  createRetryMiddleware,
  createCachingMiddleware,
  createCostTrackingMiddleware,
} from '@johnhenry/aimatey-middleware';

function createProductionBridge(apiKey) {
  const bridge = new Bridge(
    new OpenAIFrontendAdapter(),
    new AnthropicBackendAdapter({ apiKey })
  );

  // Middleware stack
  bridge.use(createLoggingMiddleware({
    level: process.env.LOG_LEVEL || 'info',
    redactFields: ['apiKey', 'authorization']
  }));

  bridge.use(createRetryMiddleware({
    maxAttempts: 3,
    initialDelay: 1000,
    backoffMultiplier: 2
  }));

  bridge.use(createCachingMiddleware({
    ttl: 3600,
    maxSize: 1000
  }));

  bridge.use(createCostTrackingMiddleware({
    budgetLimit: 100,
    onBudgetExceeded: () => {
      console.error('⚠️  Budget exceeded!');
    }
  }));

  return bridge;
}

// Usage
const bridge = createProductionBridge(process.env.ANTHROPIC_API_KEY);

async function main() {
  try {
    const response = await bridge.chat({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Explain middleware' }]
    });
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

---

**Ready for multi-provider routing?** Continue to [Tutorial 03: Multi-Provider Routing](/ai-matey/tutorials/beginner/multi-provider)
