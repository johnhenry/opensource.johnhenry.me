---
title: "Testing Guide"
---

Comprehensive testing strategy and practices for ai.matey applications.

:::success Test Coverage
- **Test Suite**: 14 integration applications + unit tests
- **Overall Pass Rate**: 100% (core packages)
- **Production Validation**: ✅ Complete
:::

## Test Coverage Overview

### Package Test Status

| Package | Unit Tests | Integration Tests | Pass Rate | Status |
|---------|------------|-------------------|-----------|--------|
| ai.matey.core | ✅ Yes | ✅ Yes (4/4) | 100% | Production-ready |
| ai.matey.backend | ✅ Yes | ✅ Yes (24 providers) | 100% | Production-ready |
| ai.matey.frontend | ✅ Yes | ✅ Yes (7 adapters) | 100% | Production-ready |
| ai.matey.middleware | ✅ Yes | ✅ Yes (4/4 types) | 100% | Production-ready |
| ai.matey.http | ✅ Yes | ✅ Yes (6/6 tests) | 100% | Production-ready |
| ai.matey.wrapper | ✅ Yes | ✅ Yes (28/28) | 100% | Production-ready |
| ai.matey.cli | ✅ Yes | ✅ Yes (9/9) | 100% | Production-ready |
| ai.matey.react.hooks | ✅ Yes | ✅ Yes (build) | 100% | Production-ready |
| ai.matey.utils | ✅ Yes | ✅ Yes (50+ utils) | 100% | Production-ready |
| ai.matey.types | ✅ Yes | ✅ Yes | 100% | Production-ready |

## Testing Strategy

### 1. Unit Testing

Test individual components in isolation with mocked dependencies.

```typescript
import { Bridge } from 'ai.matey.core';
import { MockBackendAdapter } from '../test-utils';

describe('Bridge', () => {
  it('should process chat requests', async () => {
    const mockBackend = new MockBackendAdapter({
      response: {
        choices: [{ message: { content: 'Mock response' } }]
      }
    });

    const bridge = new Bridge(
      new OpenAIFrontendAdapter(),
      mockBackend
    );

    const response = await bridge.chat({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    });

    expect(response.choices[0].message.content).toBe('Mock response');
  });
});
```

### 2. Integration Testing

Test multiple components working together.

```typescript
import { Bridge } from 'ai.matey.core';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';

describe('OpenAI Integration', () => {
  it('should make real API calls', async () => {
    const bridge = new Bridge(
      new OpenAIFrontendAdapter(),
      new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY })
    );

    const response = await bridge.chat({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 10
    });

    expect(response.choices).toHaveLength(1);
    expect(response.choices[0].message.content).toBeTruthy();
  });
});
```

### 3. End-to-End Testing

Test complete user flows with real services.

```typescript
import request from 'supertest';
import { app } from '../server';

describe('HTTP API E2E', () => {
  it('should handle chat requests', async () => {
    const response = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }]
      })
      .expect(200);

    expect(response.body.choices).toBeDefined();
  });
});
```

## Mock Backend Adapter

Create deterministic tests with a mock adapter:

```typescript
class MockBackendAdapter {
  private responses: Map<string, any> = new Map();

  setResponse(key: string, response: any) {
    this.responses.set(key, response);
  }

  async chat(request: any): Promise<any> {
    const key = JSON.stringify(request.messages);
    const response = this.responses.get(key);

    return response || {
      id: 'mock-123',
      choices: [{ message: { content: 'Default mock response' } }]
    };
  }

  async *chatStream(request: any): AsyncGenerator<any> {
    const chunks = ['Mock', ' ', 'streaming', ' ', 'response'];

    for (const chunk of chunks) {
      yield {
        choices: [{ delta: { content: chunk } }]
      };
    }
  }
}
```

## Testing Patterns

### Testing Streaming

```typescript
it('should handle streaming responses', async () => {
  const stream = await bridge.chatStream({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Count to 5' }],
    stream: true
  });

  let fullText = '';
  for await (const chunk of stream) {
    if (chunk.choices?.[0]?.delta?.content) {
      fullText += chunk.choices[0].delta.content;
    }
  }

  expect(fullText.length).toBeGreaterThan(0);
});
```

### Testing Error Handling

```typescript
it('should handle backend errors gracefully', async () => {
  const failingBackend = new MockBackendAdapter();
  failingBackend.setError(new Error('API Error'));

  const bridge = new Bridge(
    new OpenAIFrontendAdapter(),
    failingBackend
  );

  await expect(
    bridge.chat({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    })
  ).rejects.toThrow('API Error');
});
```

### Testing Middleware

```typescript
it('should execute middleware in order', async () => {
  const order: string[] = [];

  const middleware1 = {
    name: 'middleware-1',
    async execute(request, next) {
      order.push('before-1');
      const response = await next(request);
      order.push('after-1');
      return response;
    }
  };

  const middleware2 = {
    name: 'middleware-2',
    async execute(request, next) {
      order.push('before-2');
      const response = await next(request);
      order.push('after-2');
      return response;
    }
  };

  bridge.use(middleware1);
  bridge.use(middleware2);

  await bridge.chat({ /* ... */ });

  expect(order).toEqual([
    'before-1',
    'before-2',
    'after-2',
    'after-1'
  ]);
});
```

### Testing Router Failover

```typescript
it('should failover to secondary backend', async () => {
  const primary = new MockBackendAdapter();
  primary.setError(new Error('Primary failed'));

  const secondary = new MockBackendAdapter();
  secondary.setResponse('*', { content: 'Fallback response' });

  const router = new Router(new OpenAIFrontendAdapter(), {
    backends: [primary, secondary],
    strategy: 'priority',
    fallbackOnError: true
  });

  const response = await router.chat({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Test' }]
  });

  expect(response.content).toBe('Fallback response');
});
```

## Test Utilities

### Request Assertion Helper

```typescript
function assertChatRequest(request: any) {
  expect(request).toBeDefined();
  expect(request.model).toBeTruthy();
  expect(request.messages).toBeInstanceOf(Array);
  expect(request.messages.length).toBeGreaterThan(0);

  request.messages.forEach((msg: any) => {
    expect(msg.role).toMatch(/^(system|user|assistant|tool)$/);
    expect(msg.content).toBeTruthy();
  });
}
```

### Response Assertion Helper

```typescript
function assertChatResponse(response: any) {
  expect(response).toBeDefined();
  expect(response.id).toBeTruthy();
  expect(response.choices).toBeInstanceOf(Array);
  expect(response.choices.length).toBeGreaterThan(0);

  const choice = response.choices[0];
  expect(choice.message).toBeDefined();
  expect(choice.message.role).toBe('assistant');
  expect(choice.message.content).toBeTruthy();
}
```

## Best Practices

### 1. Use Environment Variables

```typescript
// test.env
OPENAI_API_KEY=sk-test-...
ANTHROPIC_API_KEY=sk-ant-test-...

// test setup
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });
```

### 2. Mock External Dependencies

```typescript
jest.mock('ai.matey.backend/openai', () => ({
  OpenAIBackendAdapter: jest.fn().mockImplementation(() => ({
    chat: jest.fn().mockResolvedValue({ /* mock response */ })
  }))
}));
```

### 3. Test Rate Limiting

```typescript
it('should respect rate limits', async () => {
  const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

  const requests = Array(10).fill(null).map(() =>
    limiter.execute(async () => 'done')
  );

  const startTime = Date.now();
  await Promise.all(requests);
  const duration = Date.now() - startTime;

  // Should take at least 1 second (due to rate limit)
  expect(duration).toBeGreaterThanOrEqual(1000);
});
```

### 4. Test Cleanup

```typescript
afterEach(async () => {
  // Clear caches
  await cache.clear();

  // Close connections
  await db.close();

  // Reset mocks
  jest.clearAllMocks();
});
```

## Performance Testing

### Latency Testing

```typescript
it('should meet latency requirements', async () => {
  const start = Date.now();

  await bridge.chat({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'Quick test' }],
    max_tokens: 10
  });

  const duration = Date.now() - start;

  expect(duration).toBeLessThan(5000); // <5s
});
```

### Throughput Testing

```typescript
it('should handle high throughput', async () => {
  const requests = 100;
  const startTime = Date.now();

  await Promise.all(
    Array(requests).fill(null).map(() =>
      bridge.chat({ /* ... */ })
    )
  );

  const duration = (Date.now() - startTime) / 1000;
  const rps = requests / duration;

  expect(rps).toBeGreaterThan(10); // >10 req/s
});
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## See Also

- [Testing Patterns Example](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns)
