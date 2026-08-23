---
title: "Tutorial 03: Multi-Provider Routing"
---

Learn how to use the Router to automatically distribute requests across multiple AI providers for load balancing, failover, and cost optimization.

## What You'll Build

A Router that:
- **Load balances** across multiple providers
- **Automatically fails over** when a provider is down
- **Optimizes costs** by routing to cheaper providers

## Time Required

⏱️ **20 minutes**

## Prerequisites

- Completed [Tutorial 02: Using Middleware](/ai-matey/tutorials/beginner/using-middleware)
- At least **2 AI provider API keys** (e.g., OpenAI + Anthropic)

## What is a Router?

A **Router** is like a Bridge, but it can work with **multiple backend providers** simultaneously. It decides which provider to use for each request based on a **routing strategy**.

```
Your Request
     ↓
   Router
  /  |  \
 /   |   \
Backend Backend Backend
  1      2      3
OpenAI Anthropic Groq
```

### Why Use a Router?

1. **Load Balancing**: Distribute load evenly across providers
2. **High Availability**: Auto-failover if a provider fails
3. **Cost Optimization**: Route to cheaper providers
4. **Performance**: Use fastest provider for each request
5. **Testing**: A/B test different providers

## Step 1: Install Packages

You already have `ai.matey.core`, now install more backend adapters:

```bash
npm install ai.matey.backend
```

## Step 2: Create a Basic Router

Create a Router with multiple backends:

```typescript
import { Router } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';

const router = new Router(
  new OpenAIFrontendAdapter(),
  {
    backends: [
      new AnthropicBackendAdapter({
        apiKey: process.env.ANTHROPIC_API_KEY
      }),
      new OpenAIBackendAdapter({
        apiKey: process.env.OPENAI_API_KEY
      })
    ],
    strategy: 'round-robin' // Alternate between providers
  }
);

// First request → Anthropic
const response1 = await router.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Second request → OpenAI
const response2 = await router.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hi' }]
});

// Third request → Anthropic (cycles back)
const response3 = await router.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hey' }]
});
```

## Routing Strategies

### 1. Round-Robin (Load Balancing)

Distributes requests evenly:

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [backend1, backend2, backend3],
  strategy: 'round-robin'
});

// Request 1 → Backend 1
// Request 2 → Backend 2
// Request 3 → Backend 3
// Request 4 → Backend 1 (cycles)
```

**Use case**: Even load distribution, all providers have similar pricing/performance.

### 2. Priority (Failover)

Uses providers in order, falls back if one fails:

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    primaryBackend,   // Try this first
    secondaryBackend, // Fallback if primary fails
    tertiaryBackend   // Last resort
  ],
  strategy: 'priority',
  fallbackOnError: true
});
```

**Use case**: High availability, redundancy, disaster recovery.

### 3. Random

Selects a random backend for each request:

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [backend1, backend2, backend3],
  strategy: 'random'
});
```

**Use case**: Simple distribution, testing.

### 4. Weighted

Some providers get more traffic:

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

**Use case**: A/B testing, gradual provider migration, canary deployments.

### 5. Custom Strategy

Write your own routing logic:

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [cheapBackend, fastBackend, powerfulBackend],
  strategy: 'custom',
  customStrategy: (request) => {
    // Route based on your logic
    const isComplex = request.messages.length > 10;
    const needsSpeed = request.max_tokens < 100;

    if (needsSpeed) return 1;      // Fast backend
    if (isComplex) return 2;       // Powerful backend
    return 0;                      // Cheap backend
  }
});
```

**Use case**: Cost optimization, complexity-based routing, performance tuning.

## Step 3: Automatic Failover

Handle provider failures gracefully:

```typescript
import { Router } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';
import { GroqBackendAdapter } from 'ai.matey.backend/groq';

const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
    new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY }),
    new GroqBackendAdapter({ apiKey: process.env.GROQ_API_KEY })
  ],
  strategy: 'priority',
  fallbackOnError: true,
  healthCheck: {
    enabled: true,
    interval: 60000, // Check every minute
    timeout: 5000
  }
});

// Listen for failover events
router.on('backend:failed', ({ backend, error }) => {
  console.log(`❌ ${backend} failed: ${error.message}`);
});

router.on('backend:switch', ({ from, to }) => {
  console.log(`🔄 Switched from ${from} to ${to}`);
});

// If Anthropic is down, automatically uses OpenAI
const response = await router.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

**Console output (if Anthropic is down):**
```
❌ anthropic failed: Connection timeout
🔄 Switched from anthropic to openai
```

## Step 4: Cost-Based Routing

Route to the cheapest provider that meets quality requirements:

```typescript
// Provider pricing (per 1K tokens)
const PRICING = {
  groq: 0.00027,
  deepseek: 0.0002,
  anthropic: 0.0008,
  openai: 0.0015
};

function selectCheapestProvider(request, backends) {
  // Estimate tokens
  const estimatedTokens = Math.ceil(
    (JSON.stringify(request.messages).length + 200) / 4
  );

  // Find cheapest
  let cheapestIndex = 0;
  let lowestCost = Infinity;

  backends.forEach((backend, index) => {
    const cost = PRICING[backend.name] * estimatedTokens / 1000;
    if (cost < lowestCost) {
      lowestCost = cost;
      cheapestIndex = index;
    }
  });

  return cheapestIndex;
}

const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    new GroqBackendAdapter({ apiKey: process.env.GROQ_API_KEY }),
    new DeepSeekBackendAdapter({ apiKey: process.env.DEEPSEEK_API_KEY }),
    new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
    new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY })
  ],
  strategy: 'custom',
  customStrategy: selectCheapestProvider
});

// Always routes to cheapest provider
const response = await router.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Short query' }]
});
// → Uses Groq or DeepSeek (cheapest)
```

## Step 5: Complexity-Based Routing

Route simple queries to cheap models, complex ones to powerful models:

```typescript
function analyzeComplexity(request) {
  const lastMessage = request.messages[request.messages.length - 1];
  const content = lastMessage.content.toString();

  let score = 0;

  // Length factor
  const wordCount = content.split(/\s+/).length;
  score += Math.min(wordCount / 2, 30);

  // Complexity keywords
  const complexKeywords = ['analyze', 'explain', 'compare', 'evaluate', 'why'];
  if (complexKeywords.some(kw => content.toLowerCase().includes(kw))) {
    score += 20;
  }

  // Math or code
  if (/\d+\s*[+\-*/]\s*\d+/.test(content)) score += 15;
  if (/```/.test(content)) score += 15;

  return Math.min(score, 100);
}

const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    new GroqBackendAdapter({ apiKey: process.env.GROQ_API_KEY }),        // Fast, cheap
    new DeepSeekBackendAdapter({ apiKey: process.env.DEEPSEEK_API_KEY }), // Cost-effective
    new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY }),    // Powerful
    new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }) // Most capable
  ],
  strategy: 'custom',
  customStrategy: (request) => {
    const complexity = analyzeComplexity(request);

    if (complexity < 25) return 0; // Groq: Simple queries
    if (complexity < 50) return 1; // DeepSeek: Moderate
    if (complexity < 80) return 2; // OpenAI: Complex
    return 3; // Anthropic: Very complex
  }
});

// Simple query → Groq
await router.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'What is 2+2?' }]
});

// Complex query → Anthropic
await router.chat({
  model: 'gpt-4',
  messages: [{
    role: 'user',
    content: 'Analyze the philosophical implications of AI consciousness and compare different theories'
  }]
});
```

## Middleware with Router

You can add middleware to Routers just like Bridges:

```typescript
import { createLoggingMiddleware } from 'ai.matey.middleware';

const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [backend1, backend2],
  strategy: 'round-robin'
});

router.use(createLoggingMiddleware({ level: 'info' }));
router.use(createRetryMiddleware({ maxAttempts: 3 }));
router.use(createCachingMiddleware({ ttl: 3600 }));
```

## Monitoring Router Health

Track which backends are healthy:

```typescript
router.on('backend:health', ({ backend, healthy }) => {
  console.log(`${backend}: ${healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
});

// Get current health status
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

## Advanced Patterns

### Environment-Based Routing

Use different providers for dev/staging/prod:

```typescript
const backends =
  process.env.NODE_ENV === 'production'
    ? [
        new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
        new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY })
      ]
    : [
        new OllamaBackendAdapter({ baseURL: 'http://localhost:11434' })
      ];

const router = new Router(new OpenAIFrontendAdapter(), {
  backends,
  strategy: 'priority',
  fallbackOnError: true
});
```

### Per-Request Provider Selection

Override routing for specific requests:

```typescript
// Use default routing
const response1 = await router.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Force specific backend
const response2 = await router.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
  backend: 'anthropic' // Force Anthropic
});
```

## Troubleshooting

### "All backends failed"

Make sure at least one backend has a valid API key:

```typescript
// ✅ Good - at least one working backend
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    new OpenAIBackendAdapter({ apiKey: validKey }),
    new AnthropicBackendAdapter({ apiKey: invalidKey }) // This can fail
  ],
  fallbackOnError: true
});

// ❌ Bad - all backends will fail
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    new OpenAIBackendAdapter({ apiKey: null }),
    new AnthropicBackendAdapter({ apiKey: null })
  ]
});
```

### "Router not falling back"

Enable `fallbackOnError`:

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [backend1, backend2],
  strategy: 'priority',
  fallbackOnError: true // Don't forget this!
});
```

### "Routing is inconsistent"

For round-robin, make sure you're reusing the same Router instance:

```typescript
// ✅ Correct - reuse instance
const router = new Router(...);
await router.chat(...); // Backend 1
await router.chat(...); // Backend 2
await router.chat(...); // Backend 3

// ❌ Wrong - creates new router each time
async function chat() {
  const router = new Router(...); // Fresh state!
  return await router.chat(...);
}
```

## Next Steps

Excellent! You now know how to use multi-provider routing.

**Continue learning:**
- [Tutorial 04: Building a Chat API](/ai-matey/tutorials/beginner/building-chat-api) - Create an HTTP server
- [Routing Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing)
- [Integration Patterns](/ai-matey/patterns) - Production-ready patterns

## Complete Example

```typescript
// multi-provider-router.js
import 'dotenv/config';
import { Router } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';
import { GroqBackendAdapter } from 'ai.matey.backend/groq';
import { createLoggingMiddleware } from 'ai.matey.middleware';

// Create router with multiple backends
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    new AnthropicBackendAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY
    }),
    new OpenAIBackendAdapter({
      apiKey: process.env.OPENAI_API_KEY
    }),
    new GroqBackendAdapter({
      apiKey: process.env.GROQ_API_KEY
    })
  ],
  strategy: 'priority',
  fallbackOnError: true,
  healthCheck: {
    enabled: true,
    interval: 60000
  }
});

// Add logging
router.use(createLoggingMiddleware({ level: 'info' }));

// Event handlers
router.on('backend:failed', ({ backend, error }) => {
  console.error(`❌ ${backend} failed: ${error.message}`);
});

router.on('backend:switch', ({ from, to }) => {
  console.log(`🔄 Switched from ${from} to ${to}`);
});

// Use it
async function chat(message) {
  const response = await router.chat({
    model: 'gpt-4',
    messages: [{ role: 'user', content: message }]
  });
  return response.choices[0].message.content;
}

// Test
console.log(await chat('What is ai.matey?'));
```

---

**Ready to build an API?** Continue to [Tutorial 04: Building a Chat API](/ai-matey/tutorials/beginner/building-chat-api)
