---
title: "Your First Bridge - Step-by-Step Tutorial"
description: "Step-by-step tutorial that builds a working Bridge with streaming, error handling, and middleware."
---

Build a complete AI application using ai.matey in this hands-on tutorial. You'll create a bridge, handle errors, add streaming, and learn best practices.

## What You'll Build

By the end of this tutorial, you'll have:
- ✅ A working bridge connecting OpenAI format to Anthropic (Claude)
- ✅ Error handling with graceful fallbacks
- ✅ Streaming support for real-time responses
- ✅ Environment-based configuration
- ✅ A reusable helper module

**Time to complete:** ~15 minutes

## Prerequisites

- Node.js 18+ installed
- Basic TypeScript knowledge
- An [Anthropic API key](https://console.anthropic.com/) (free tier available)

## Step 1: Project Setup

### Create Project Directory

```bash
mkdir my-ai-app
cd my-ai-app
npm init -y
```

### Install Dependencies

```bash
npm install @johnhenry/aimatey-core @johnhenry/aimatey-frontend @johnhenry/aimatey-backend
npm install -D tsx typescript @types/node
```

### Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

### Set Up Environment

Create `.env` file:

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Install dotenv:

```bash
npm install dotenv
```

## Step 2: Create Your First Bridge

Create `src/bridge.ts`:

```typescript
import 'dotenv/config';
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';

// Validate API key
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is required in .env file');
}

// Create the bridge
export const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY
  })
);

// Helper function for chat
export async function chat(message: string) {
  const response = await bridge.chat({
    model: 'gpt-4', // Will be mapped to Claude
    messages: [
      { role: 'user', content: message }
    ],
    temperature: 0.7,
    max_tokens: 500
  });

  return response.choices[0].message.content;
}
```

### Test It

Create `src/test.ts`:

```typescript
import { chat } from './bridge.js';

async function main() {
  try {
    const response = await chat('What is ai.matey in one sentence?');
    console.log('Claude says:', response);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

Run it:

```bash
npx tsx src/test.ts
```

You should see Claude's response! 🎉

## Step 3: Add Error Handling

Update `src/bridge.ts` to handle errors gracefully:

```typescript
import 'dotenv/config';
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is required');
}

export const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY
  })
);

export async function chat(message: string) {
  try {
    const response = await bridge.chat({
      model: 'gpt-4',
      messages: [{ role: 'user', content: message }],
      temperature: 0.7,
      max_tokens: 500
    });

    return response.choices[0].message.content;

  } catch (error) {
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('rate_limit')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (error.message.includes('invalid_api_key')) {
        throw new Error('Invalid API key. Check your .env file.');
      }
    }

    // Re-throw unknown errors
    throw error;
  }
}
```

## Step 4: Add Streaming Support

Add streaming to `src/bridge.ts`:

```typescript
export async function chatStream(message: string) {
  try {
    const stream = await bridge.chatStream({
      model: 'gpt-4',
      messages: [{ role: 'user', content: message }],
      temperature: 0.7,
      stream: true
    });

    return stream;

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('rate_limit')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
    }
    throw error;
  }
}
```

### Test Streaming

Create `src/test-stream.ts`:

```typescript
import { chatStream } from './bridge.js';

async function main() {
  try {
    console.log('Streaming response:\n');

    const stream = await chatStream('Write a haiku about coding');

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        process.stdout.write(delta);
      }
    }

    console.log('\n\nDone!');

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

Run it:

```bash
npx tsx src/test-stream.ts
```

Watch the response stream in real-time! ⚡

## Step 5: Add Multi-Turn Conversations

Create `src/conversation.ts`:

```typescript
import { bridge } from './bridge.js';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class Conversation {
  private messages: Message[] = [];

  constructor(systemPrompt?: string) {
    if (systemPrompt) {
      this.messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
  }

  async send(userMessage: string): Promise<string> {
    // Add user message
    this.messages.push({
      role: 'user',
      content: userMessage
    });

    // Get AI response
    const response = await bridge.chat({
      model: 'gpt-4',
      messages: this.messages,
      temperature: 0.7
    });

    const assistantMessage = response.choices[0].message.content;

    // Add assistant response to history
    this.messages.push({
      role: 'assistant',
      content: assistantMessage
    });

    return assistantMessage;
  }

  getHistory(): Message[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }
}
```

### Test Multi-Turn Chat

Create `src/test-conversation.ts`:

```typescript
import { Conversation } from './conversation.js';

async function main() {
  const conv = new Conversation(
    'You are a helpful coding assistant. Keep responses concise.'
  );

  try {
    // First message
    console.log('User: What is TypeScript?');
    const response1 = await conv.send('What is TypeScript?');
    console.log('AI:', response1, '\n');

    // Follow-up message
    console.log('User: How is it different from JavaScript?');
    const response2 = await conv.send('How is it different from JavaScript?');
    console.log('AI:', response2, '\n');

    // Show conversation history
    console.log('\n=== Conversation History ===');
    console.log(JSON.stringify(conv.getHistory(), null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

Run it:

```bash
npx tsx src/test-conversation.ts
```

The AI remembers context from previous messages! 💬

## Step 6: Add Environment-Based Configuration

Create `src/config.ts`:

```typescript
import 'dotenv/config';
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
import { OllamaBackendAdapter } from '@johnhenry/aimatey-backend/ollama';

export function getBackend() {
  const env = process.env.NODE_ENV || 'development';

  switch (env) {
    case 'production':
      // Use OpenAI in production
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY required for production');
      }
      return new OpenAIBackendAdapter({
        apiKey: process.env.OPENAI_API_KEY
      });

    case 'staging':
      // Use Anthropic in staging
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY required for staging');
      }
      return new AnthropicBackendAdapter({
        apiKey: process.env.ANTHROPIC_API_KEY
      });

    case 'development':
    default:
      // Use local Ollama in development
      return new OllamaBackendAdapter({
        baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
      });
  }
}

export const backend = getBackend();
```

Update `src/bridge.ts`:

```typescript
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { backend } from './config.js';

export const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  backend
);

// ... rest of the code
```

Now you can switch environments:

```bash
# Development (uses Ollama)
npx tsx src/test.ts

# Staging (uses Anthropic)
NODE_ENV=staging npx tsx src/test.ts

# Production (uses OpenAI)
NODE_ENV=production npx tsx src/test.ts
```

## Step 7: Add Middleware

Install middleware:

```bash
npm install @johnhenry/aimatey-middleware
```

Update `src/bridge.ts`:

```typescript
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { backend } from './config.js';
import {
  createLoggingMiddleware,
  createRetryMiddleware,
  createCachingMiddleware
} from '@johnhenry/aimatey-middleware';

const middleware = [
  createLoggingMiddleware({
    level: 'info',
    sanitize: true // Remove API keys from logs
  }),
  createRetryMiddleware({
    maxAttempts: 3,
    initialDelay: 1000
  }),
  createCachingMiddleware({
    ttl: 300000 // 5 minutes
  })
];

export const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  backend,
  middleware
);

// ... rest of the code
```

Now you get:
- ✅ Automatic logging
- ✅ Retries on failure
- ✅ Response caching

## Step 8: Create a CLI Tool

Create `src/cli.ts`:

```typescript
#!/usr/bin/env node
import { chat, chatStream } from './bridge.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: npm run chat "Your message here"');
  console.log('       npm run chat:stream "Your message here"');
  process.exit(1);
}

const message = args.join(' ');
const isStream = process.argv[1].includes('stream');

async function main() {
  try {
    if (isStream) {
      console.log('Streaming response:\n');
      const stream = await chatStream(message);

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          process.stdout.write(delta);
        }
      }
      console.log('\n');
    } else {
      const response = await chat(message);
      console.log(response);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "chat": "tsx src/cli.ts",
    "chat:stream": "tsx src/cli.ts"
  }
}
```

Use it:

```bash
npm run chat "What is the capital of France?"
npm run chat:stream "Write a poem about coding"
```

## Final Project Structure

```
my-ai-app/
├── src/
│   ├── bridge.ts          # Bridge setup
│   ├── config.ts          # Environment config
│   ├── conversation.ts    # Multi-turn chat
│   ├── cli.ts            # CLI tool
│   ├── test.ts           # Basic test
│   ├── test-stream.ts    # Streaming test
│   └── test-conversation.ts
├── .env                   # API keys
├── tsconfig.json
└── package.json
```

## What You've Learned

✅ Creating a bridge with frontend and backend adapters
✅ Error handling for API failures
✅ Streaming responses for real-time output
✅ Multi-turn conversations with context
✅ Environment-based configuration
✅ Middleware for logging, retry, and caching
✅ Building a CLI tool

## Next Steps

### Explore More Examples
- **[Middleware Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware)** - Advanced middleware patterns
- **[Routing Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing)** - Multi-provider routing
- **[HTTP Server Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/05-http-servers)** - Build HTTP APIs

### Dive Deeper
- **[IR Format Guide](/ai-matey/guides/architecture/ir-format)** - Understand IR format
- **[Backend Package](/ai-matey/packages/backend)** - All 24+ providers
- **[Middleware Package](/ai-matey/packages/middleware)** - All middleware types

### Build Real Applications
- **[React Integration](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/05-react-integration.ts)** - Build chat UIs
- **[Advanced Patterns](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns)** - Best practices
- **[Testing](/ai-matey/guides/testing)** - Test your AI code

## Common Enhancements

### Add Rate Limiting

```typescript
import { createRateLimitMiddleware } from '@johnhenry/aimatey-middleware';

const middleware = [
  createRateLimitMiddleware({
    maxRequests: 10,
    windowMs: 60000 // 10 requests per minute
  })
];
```

### Add Cost Tracking

```typescript
import { createCostTrackingMiddleware } from '@johnhenry/aimatey-middleware';

const middleware = [
  createCostTrackingMiddleware({
    onCost: (cost, provider) => {
      console.log(`Request cost: $${cost} (${provider})`);
    }
  })
];
```

### Add Multi-Provider Fallback

```typescript
import { createRouter } from '@johnhenry/aimatey-core';
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';

const router = createRouter({
  routingStrategy: 'fallback'
})
  .register('openai', new OpenAIBackendAdapter({ apiKey: openaiKey }))
  .register('anthropic', new AnthropicBackendAdapter({ apiKey: anthropicKey }))
  .setFallbackChain(['openai', 'anthropic']);

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  router
);
```

## Troubleshooting

### "Invalid API Key" Error
Check your `.env` file and make sure the API key is correct.

### Streaming Not Working
Make sure you're iterating the stream with `for await`:
```typescript
for await (const chunk of stream) {
  // Process chunk
}
```

### TypeScript Errors
Run `npm install @johnhenry/aimatey-types` for type definitions.

## Need Help?

- **[Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples)** - Browse 35+ examples
- **[API Reference](/ai-matey/api)** - Complete API docs
- **[GitHub Issues](https://github.com/johnhenry/ai.matey/issues)** - Ask questions

---

**Congratulations!** 🎉 You've built your first ai.matey application! Continue exploring with the [examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples) or dive into [advanced patterns](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns).
