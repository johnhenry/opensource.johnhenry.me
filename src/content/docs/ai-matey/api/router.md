---
title: "Router API"
---

Complete API reference for the `Router` class - intelligent routing across multiple backend providers.

## Constructor

### `new Router(frontendAdapter, options)`

Creates a new Router instance with multiple backend adapters.

**Parameters:**

- `frontendAdapter: FrontendAdapter` - Adapter for parsing input format
- `options: RouterOptions` - Router configuration

**Returns:** `Router` instance

**Example:**

```typescript
import { Router } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';

const router = new Router(
  new OpenAIFrontendAdapter(),
  {
    backends: [
      new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
      new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY })
    ],
    strategy: 'round-robin',
    fallbackOnError: true
  }
);
```

---

## Methods

### `chat(request)`

Execute a chat completion request with automatic routing.

**Parameters:**

- `request: any` - Request in frontend adapter format

**Returns:** `Promise<any>` - Response in frontend adapter format

**Example:**

```typescript
// Router automatically selects backend based on strategy
const response = await router.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

---

### `chatStream(request)`

Execute a streaming chat completion request with routing.

**Parameters:**

- `request: any` - Request in frontend adapter format (with `stream: true`)

**Returns:** `AsyncIterable<any>` - Stream of chunks

**Example:**

```typescript
const stream = await router.chatStream({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Count to 10' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices?.[0]?.delta?.content || '');
}
```

---

### `use(middleware)`

Add middleware to all backend adapters.

**Parameters:**

- `middleware: Middleware` - Middleware to add

**Returns:** `this` (for chaining)

**Example:**

```typescript
import { createLoggingMiddleware } from 'ai.matey.middleware';

router.use(createLoggingMiddleware({ level: 'info' }));
```

---

### `addBackend(backend, weight?)`

Add a new backend adapter to the router.

**Parameters:**

- `backend: BackendAdapter` - Backend adapter to add
- `weight?: number` - Weight for weighted strategy (default: 1)

**Returns:** `void`

**Example:**

```typescript
import { GroqBackendAdapter } from 'ai.matey.backend/groq';

router.addBackend(
  new GroqBackendAdapter({ apiKey: process.env.GROQ_API_KEY }),
  50 // 50% of traffic if using weighted strategy
);
```

---

### `removeBackend(backendName)`

Remove a backend adapter by name.

**Parameters:**

- `backendName: string` - Name of backend to remove

**Returns:** `boolean` - True if removed, false if not found

**Example:**

```typescript
router.removeBackend('anthropic'); // Returns true if removed
```

---

### `setStrategy(strategy, customStrategy?)`

Change the routing strategy.

**Parameters:**

- `strategy: RoutingStrategy` - Strategy name
- `customStrategy?: CustomStrategyFunction` - Custom strategy function (if strategy is 'custom')

**Returns:** `void`

**Example:**

```typescript
// Change to priority strategy
router.setStrategy('priority');

// Or use custom strategy
router.setStrategy('custom', (request, backends) => {
  // Return index of backend to use
  return request.messages.length > 10 ? 0 : 1;
});
```

---

### `getBackendHealth()`

Get health status of all backends.

**Parameters:** None

**Returns:** `Promise<BackendHealthMap>` - Health status for each backend

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

---

### `on(event, handler)`

Subscribe to router events.

**Parameters:**

- `event: RouterEvent` - Event name
- `handler: Function` - Event handler

**Returns:** `void`

**Events:**

- `backend:selected` - Fired when a backend is selected
- `backend:failed` - Fired when a backend fails
- `backend:switch` - Fired when switching to fallback
- `backend:health` - Fired on health check

**Example:**

```typescript
router.on('backend:selected', ({ backend, strategy }) => {
  console.log(`Using ${backend} (strategy: ${strategy})`);
});

router.on('backend:failed', ({ backend, error }) => {
  console.error(`${backend} failed: ${error.message}`);
});

router.on('backend:switch', ({ from, to, reason }) => {
  console.log(`Switched from ${from} to ${to}: ${reason}`);
});
```

---

## Properties

### `backends`

**Type:** `BackendAdapter[]`

**Read-only**

Array of registered backend adapters.

---

### `strategy`

**Type:** `RoutingStrategy`

**Read-only**

Current routing strategy.

---

### `currentBackendIndex`

**Type:** `number`

**Read-only**

Index of the currently selected backend (for stateful strategies).

---

## Types

### `RouterOptions`

Configuration options for Router.

```typescript
interface RouterOptions {
  /** Array of backend adapters */
  backends: BackendAdapter[];

  /** Routing strategy */
  strategy: RoutingStrategy;

  /** Custom strategy function (required if strategy is 'custom') */
  customStrategy?: CustomStrategyFunction;

  /** Enable automatic fallback on error (default: false) */
  fallbackOnError?: boolean;

  /** Health check configuration */
  healthCheck?: {
    enabled: boolean;
    interval: number; // milliseconds
    timeout: number;  // milliseconds
  };

  /** Request timeout (default: 30000ms) */
  timeout?: number;

  /** Weights for weighted routing */
  weights?: number[];
}
```

---

### `RoutingStrategy`

Available routing strategies.

```typescript
type RoutingStrategy =
  | 'round-robin'   // Distribute evenly
  | 'random'        // Random selection
  | 'priority'      // Use in order, fallback on error
  | 'weighted'      // Weighted distribution
  | 'least-latency' // Select fastest backend
  | 'least-cost'    // Select cheapest backend
  | 'custom';       // Custom function
```

---

### `CustomStrategyFunction`

Custom strategy function signature.

```typescript
type CustomStrategyFunction = (
  request: IRChatCompletionRequest,
  backends: BackendAdapter[],
  health: BackendHealthMap
) => number | Promise<number>;
```

**Returns:** Index of backend to use

**Example:**

```typescript
const customStrategy: CustomStrategyFunction = (request, backends, health) => {
  // Route based on message complexity
  const complexity = analyzeComplexity(request);

  if (complexity < 25) return 0;  // Simple → Groq
  if (complexity < 75) return 1;  // Medium → OpenAI
  return 2;                       // Complex → Anthropic
};
```

---

### `BackendHealthMap`

Health status for each backend.

```typescript
interface BackendHealthMap {
  [backendName: string]: {
    healthy: boolean;
    latency: number;        // Average latency in ms
    errorRate: number;      // Error rate (0-1)
    lastCheck: Date;
    consecutiveFailures: number;
  };
}
```

---

### `RouterEvent`

Event types emitted by Router.

```typescript
type RouterEvent =
  | 'backend:selected'
  | 'backend:failed'
  | 'backend:switch'
  | 'backend:health';
```

---

## Routing Strategies

### Round-Robin

Distributes requests evenly across all backends.

```typescript
const router = new Router(frontend, {
  backends: [backend1, backend2, backend3],
  strategy: 'round-robin'
});

// Request 1 → Backend 1
// Request 2 → Backend 2
// Request 3 → Backend 3
// Request 4 → Backend 1 (cycles)
```

**Use case:** Even load distribution, all providers have similar pricing/performance.

---

### Random

Randomly selects a backend for each request.

```typescript
const router = new Router(frontend, {
  backends: [backend1, backend2, backend3],
  strategy: 'random'
});
```

**Use case:** Simple distribution, A/B testing.

---

### Priority (Failover)

Uses backends in order, falls back if one fails.

```typescript
const router = new Router(frontend, {
  backends: [primaryBackend, secondaryBackend, tertiaryBackend],
  strategy: 'priority',
  fallbackOnError: true
});
```

**Use case:** High availability, disaster recovery, primary + fallback providers.

---

### Weighted

Distributes requests according to weights.

```typescript
const router = new Router(frontend, {
  backends: [backend1, backend2, backend3],
  strategy: 'weighted',
  weights: [70, 20, 10] // 70%, 20%, 10%
});
```

**Use case:** Canary deployments, gradual provider migration, A/B testing with traffic split.

---

### Least-Latency

Selects the backend with lowest average latency.

```typescript
const router = new Router(frontend, {
  backends: [backend1, backend2, backend3],
  strategy: 'least-latency',
  healthCheck: {
    enabled: true,
    interval: 60000,
    timeout: 5000
  }
});
```

**Use case:** Optimize for response time, latency-sensitive applications.

---

### Least-Cost

Selects the cheapest backend based on estimated cost.

```typescript
const router = new Router(frontend, {
  backends: [
    groqBackend,      // $0.00027 per 1K tokens
    deepseekBackend,  // $0.0002 per 1K tokens
    openaiBackend     // $0.0015 per 1K tokens
  ],
  strategy: 'least-cost'
});
```

**Use case:** Cost optimization, budget-conscious applications.

---

### Custom

Use your own routing logic.

```typescript
function selectBackend(request, backends, health) {
  // Analyze request complexity
  const wordCount = request.messages
    .map(m => m.content.split(' ').length)
    .reduce((a, b) => a + b, 0);

  if (wordCount < 10) return 0;    // Simple → Fast/cheap
  if (wordCount < 100) return 1;   // Medium → Balanced
  return 2;                        // Complex → Powerful
}

const router = new Router(frontend, {
  backends: [groqBackend, openaiBackend, anthropicBackend],
  strategy: 'custom',
  customStrategy: selectBackend
});
```

**Use case:** Application-specific logic, multi-factor routing.

---

## Health Monitoring

### Automatic Health Checks

```typescript
const router = new Router(frontend, {
  backends: [backend1, backend2, backend3],
  strategy: 'priority',
  fallbackOnError: true,
  healthCheck: {
    enabled: true,
    interval: 60000,  // Check every minute
    timeout: 5000     // 5s timeout
  }
});

// Monitor health status
router.on('backend:health', ({ backend, healthy, latency }) => {
  console.log(`${backend}: ${healthy ? '✅' : '❌'} (${latency}ms)`);
});
```

---

### Manual Health Check

```typescript
const health = await router.getBackendHealth();

for (const [name, status] of Object.entries(health)) {
  if (!status.healthy) {
    console.log(`⚠️  ${name} is unhealthy`);
    console.log(`  Error rate: ${(status.errorRate * 100).toFixed(1)}%`);
    console.log(`  Consecutive failures: ${status.consecutiveFailures}`);
  }
}
```

---

## Advanced Examples

### Cost-Optimized Routing

```typescript
const PRICING = {
  groq: 0.00027,
  deepseek: 0.0002,
  anthropic: 0.0008,
  openai: 0.0015
};

function estimateCost(request, backend) {
  const tokens = estimateTokens(request);
  const pricePerToken = PRICING[backend.name];
  return tokens * pricePerToken / 1000;
}

const router = new Router(frontend, {
  backends: [groqBackend, deepseekBackend, anthropicBackend, openaiBackend],
  strategy: 'custom',
  customStrategy: (request, backends) => {
    let cheapestIndex = 0;
    let lowestCost = Infinity;

    backends.forEach((backend, index) => {
      const cost = estimateCost(request, backend);
      if (cost < lowestCost) {
        lowestCost = cost;
        cheapestIndex = index;
      }
    });

    return cheapestIndex;
  }
});
```

---

### Multi-Factor Routing

```typescript
function intelligentRouting(request, backends, health) {
  // Factor 1: Health status
  const healthyBackends = backends.filter((_, i) =>
    health[backends[i].name]?.healthy !== false
  );

  if (healthyBackends.length === 0) {
    return 0; // Fallback to first backend
  }

  // Factor 2: Request complexity
  const complexity = analyzeComplexity(request);

  // Factor 3: Time of day (off-peak = cheaper)
  const hour = new Date().getHours();
  const isOffPeak = hour < 6 || hour > 22;

  // Routing logic
  if (complexity > 80) {
    return backends.findIndex(b => b.name === 'anthropic'); // Most capable
  }

  if (isOffPeak && complexity < 30) {
    return backends.findIndex(b => b.name === 'groq'); // Cheapest
  }

  return backends.findIndex(b => b.name === 'openai'); // Balanced
}

const router = new Router(frontend, {
  backends: [groqBackend, openaiBackend, anthropicBackend],
  strategy: 'custom',
  customStrategy: intelligentRouting,
  healthCheck: { enabled: true, interval: 60000, timeout: 5000 }
});
```

---

## Error Handling

### Automatic Fallback

```typescript
const router = new Router(frontend, {
  backends: [primaryBackend, fallbackBackend],
  strategy: 'priority',
  fallbackOnError: true
});

router.on('backend:failed', ({ backend, error }) => {
  console.error(`❌ ${backend} failed: ${error.message}`);
});

router.on('backend:switch', ({ from, to }) => {
  console.log(`🔄 Switched from ${from} to ${to}`);
});

// If primary fails, automatically uses fallback
const response = await router.chat({ ... });
```

---

### Manual Error Handling

```typescript
try {
  const response = await router.chat({ ... });
} catch (error) {
  if (error instanceof AllBackendsFailedError) {
    console.error('All backends failed!');
    error.failures.forEach(({ backend, error }) => {
      console.error(`  ${backend}: ${error.message}`);
    });
  }
}
```

---

## See Also

- [Bridge API](/ai-matey/api/bridge) - Single backend bridge
- [Middleware API](/ai-matey/api/middleware) - Middleware reference
- [Tutorial: Multi-Provider](/ai-matey/tutorials/beginner/multi-provider) - Getting started with routing
- [Routing Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing) - Code examples
