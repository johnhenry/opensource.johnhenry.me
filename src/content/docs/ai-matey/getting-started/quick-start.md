---
title: "Quick Start"
description: "Build your first ai.matey Bridge in minutes: install, wire a frontend to a backend, and make a chat request."
---

Get started with ai.matey in less than 5 minutes. This guide will walk you through creating your first bridge and making AI requests.

## 1. Install ai.matey

```bash
npm install @johnhenry/aimatey-core @johnhenry/aimatey-frontend @johnhenry/aimatey-backend
```

## 2. Get API Keys

You'll need an API key from at least one provider. We recommend starting with [Anthropic (Claude)](https://console.anthropic.com/) as it's reliable and has good free tier:

```bash
# Sign up at https://console.anthropic.com/
# Get your API key and set it in your environment
export ANTHROPIC_API_KEY=sk-ant-...
```

Alternatively, use any of these providers:
- [OpenAI](https://platform.openai.com/api-keys) - GPT-4, GPT-3.5
- [Google AI Studio](https://makersuite.google.com/app/apikey) - Gemini (free tier available)
- [Groq](https://console.groq.com/) - Fast inference (free tier available)
- [Ollama](https://ollama.ai) - Local models (no API key needed)

## 3. Create Your First Bridge

Create a file called `hello.ts`:

```typescript
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';

// Create a bridge: OpenAI format → Anthropic execution
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY
  })
);

// Make a request using OpenAI format
const response = await bridge.chat({
  model: 'gpt-4', // Will be mapped to claude-3-5-sonnet
  messages: [
    { role: 'user', content: 'What is ai.matey?' }
  ]
});

console.log(response.choices[0].message.content);
```

## 4. Run It

```bash
npx tsx hello.ts
```

You should see Claude's response, even though you wrote the code in OpenAI format!

## What Just Happened?

```
Your Code (OpenAI format)
         ↓
OpenAI Frontend Adapter (parses OpenAI format)
         ↓
Intermediate Representation (IR) - Universal format
         ↓
Anthropic Backend Adapter (converts IR to Anthropic format)
         ↓
Claude API (executes the request)
         ↓
Response (converted back through the pipeline)
```

This is the power of ai.matey: **write once, run anywhere**.

## Common Patterns

### Pattern 1: Direct Backend (No Bridge)

For simple use cases, use backends directly:

```typescript
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';

const backend = new AnthropicBackendAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Execute using Intermediate Representation (IR) format
const response = await backend.execute({
  model: 'claude-3-5-sonnet-20241022',
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
});
```

### Pattern 2: Streaming

Stream responses in real-time:

```typescript
const stream = await bridge.chatStream({
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Write a haiku about TypeScript' }
  ],
  stream: true
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta) {
    process.stdout.write(delta);
  }
}
```

### Pattern 3: Multiple Providers with Fallback

Route to multiple providers with automatic fallback:

```typescript
import { Bridge, createRouter } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';

const router = createRouter({
  routingStrategy: 'fallback'
})
  .register('openai', new OpenAIBackendAdapter({
    apiKey: process.env.OPENAI_API_KEY
  }))
  .register('anthropic', new AnthropicBackendAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY
  }))
  .setFallbackChain(['openai', 'anthropic']); // Try OpenAI first, fall back to Anthropic

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  router
);

// If OpenAI fails, automatically tries Anthropic
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Pattern 4: With Middleware

Add logging, caching, or retry logic:

```typescript
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
import { createLoggingMiddleware, createRetryMiddleware } from '@johnhenry/aimatey-middleware';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
  [
    createLoggingMiddleware({ level: 'info' }),
    createRetryMiddleware({ maxAttempts: 3 })
  ]
);

// Now all requests are logged and automatically retried on failure
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## Switching Providers

The beauty of ai.matey is that switching providers is trivial. Just change the backend:

```typescript
// Development: Use local Ollama
const devBackend = new OllamaBackendAdapter({
  baseURL: 'http://localhost:11434'
});

// Production: Use OpenAI
const prodBackend = new OpenAIBackendAdapter({
  apiKey: process.env.OPENAI_API_KEY
});

// Choose based on environment
const backend = process.env.NODE_ENV === 'production'
  ? prodBackend
  : devBackend;

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  backend
);

// Same code works with both!
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## Frontend Adapters

You can also swap the **frontend** to use different API formats:

```typescript
import { AnthropicFrontendAdapter } from '@johnhenry/aimatey-frontend/anthropic';
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';

// Accept Anthropic format → Execute on OpenAI
const bridge = new Bridge(
  new AnthropicFrontendAdapter(),
  new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY })
);

// Now use Anthropic's API format
const response = await bridge.chat({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 100,
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
});
```

## Next Steps

### Learn the Concepts
- **[Core Concepts](/ai-matey/getting-started/core-concepts)** - Understand Bridge, Router, Middleware, and IR
- **[Your First Bridge](/ai-matey/getting-started/your-first-bridge)** - Detailed step-by-step tutorial

### Explore Examples
- **[Hello World](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/01-basics/01-hello-world.ts)** - Simplest example
- **[Streaming](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/01-basics/02-streaming.ts)** - Real-time responses
- **[Middleware](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware)** - Add logging, caching, retry
- **[Routing](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing)** - Multi-provider routing

### Dive Deeper
- **[IR Format Guide](/ai-matey/guides/architecture/ir-format)** - Understand the IR format
- **[Backend Package](/ai-matey/packages/backend)** - All 24+ supported providers
- **[Middleware Package](/ai-matey/packages/middleware)** - All middleware types
- **[Advanced Patterns](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns)** - Production-ready patterns

### Integration Guides
- **[HTTP Servers](/ai-matey/tutorials/beginner/building-chat-api)** - Express, Fastify, Hono
- **[React Hooks](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/05-react-integration.ts)** - useChat, useCompletion
- **[Testing](/ai-matey/guides/testing)** - Test your AI integrations

## Common Issues

### Missing API Key Error

```
Error: Missing required API key
```

**Solution:** Set your API key in the environment:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or load from a `.env` file using [dotenv](https://www.npmjs.com/package/dotenv):
```bash
npm install dotenv
```

```typescript
import 'dotenv/config';
```

### Module Import Errors

```
Cannot find module '@johnhenry/aimatey-core'
```

**Solution:** Make sure you've installed all required packages:
```bash
npm install @johnhenry/aimatey-core @johnhenry/aimatey-frontend @johnhenry/aimatey-backend
```

### Model Mapping

By default, models are automatically mapped between providers:
- `gpt-4` → `claude-3-5-sonnet-20241022` (OpenAI → Anthropic)
- `gpt-3.5-turbo` → `claude-3-haiku-20240307` (OpenAI → Anthropic)

To use specific models, check the [Backend Adapters](/ai-matey/packages/backend) documentation.

## Need Help?

- **[Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples)** - Browse 35+ working examples
- **[API Reference](/ai-matey/api)** - Complete API documentation
- **[GitHub Issues](https://github.com/johnhenry/ai.matey/issues)** - Report bugs or ask questions
- **[Contributing](/ai-matey/contributing)** - Contribute to ai.matey

---

**Ready to build?** Continue to [Core Concepts](/ai-matey/getting-started/core-concepts) to learn the fundamentals, or jump straight to [Your First Bridge](/ai-matey/getting-started/your-first-bridge) for a hands-on tutorial!
