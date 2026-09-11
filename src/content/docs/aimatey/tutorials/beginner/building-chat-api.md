---
title: "Tutorial 04: Building a Chat API"
description: "Beginner tutorial: expose a Bridge as an HTTP chat API with Express."
---

Learn how to build a production-ready HTTP API server for chat completions using Express and aimatey.

## What You'll Build

A complete chat API with:
- **REST endpoint** for chat completions
- **Streaming support** with Server-Sent Events
- **Error handling** and validation
- **Rate limiting** and security
- **OpenAI-compatible** API format

## Time Required

⏱️ **25 minutes**

## Prerequisites

- Completed [Tutorial 03: Multi-Provider Routing](/aimatey/tutorials/beginner/multi-provider)
- Basic understanding of HTTP and REST APIs
- Node.js 18+ installed

## What We're Building

An HTTP server that exposes an OpenAI-compatible `/v1/chat/completions` endpoint:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Step 1: Install Dependencies

```bash
mkdir ai-matey-api
cd ai-matey-api
npm init -y
npm install express cors dotenv
npm install @johnhenry/aimatey-core @johnhenry/aimatey-frontend @johnhenry/aimatey-backend @johnhenry/aimatey-middleware
npm install -D @types/express @types/cors
```

## Step 2: Create Basic Server

Create `server.js`:

```typescript
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Create bridge
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY
  })
);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const response = await bridge.chat(req.body);
    res.json(response);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'api_error'
      }
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API: http://localhost:${PORT}/v1/chat/completions`);
});
```

Create `.env`:

```bash
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
```

Update `package.json`:

```json
{
  "name": "ai-matey-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "@johnhenry/aimatey-core": "latest",
    "@johnhenry/aimatey-frontend": "latest",
    "@johnhenry/aimatey-backend": "latest"
  }
}
```

## Step 3: Test It

Start the server:

```bash
npm start
```

Test with curl:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "What is aimatey?"}
    ]
  }'
```

## Step 4: Add Streaming Support

Streaming allows clients to receive responses in real-time:

```typescript
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';

const app = express();
app.use(cors());
app.use(express.json());

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY
  })
);

app.post('/v1/chat/completions', async (req, res) => {
  try {
    // Check if streaming is requested
    if (req.body.stream) {
      // Set headers for Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = bridge.chatStream(req.body);

      for await (const chunk of stream) {
        // Send chunk as SSE
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      // Send done signal
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      const response = await bridge.chat(req.body);
      res.json(response);
    }
  } catch (error) {
    console.error('Error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: error.message,
          type: 'api_error'
        }
      });
    } else {
      // If streaming already started, send error event
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
```

Test streaming:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Count to 5"}],
    "stream": true
  }'
```

## Step 5: Add Request Validation

Validate incoming requests:

```typescript
// Validation middleware
function validateChatRequest(req, res, next) {
  const { model, messages } = req.body;

  // Check required fields
  if (!model) {
    return res.status(400).json({
      error: {
        message: 'Missing required field: model',
        type: 'invalid_request_error'
      }
    });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: {
        message: 'Missing or invalid field: messages',
        type: 'invalid_request_error'
      }
    });
  }

  if (messages.length === 0) {
    return res.status(400).json({
      error: {
        message: 'messages array cannot be empty',
        type: 'invalid_request_error'
      }
    });
  }

  // Validate message format
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return res.status(400).json({
        error: {
          message: 'Each message must have role and content',
          type: 'invalid_request_error'
        }
      });
    }

    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      return res.status(400).json({
        error: {
          message: `Invalid role: ${msg.role}`,
          type: 'invalid_request_error'
        }
      });
    }
  }

  next();
}

// Use validation
app.post('/v1/chat/completions', validateChatRequest, async (req, res) => {
  // ... rest of handler
});
```

## Step 6: Add Rate Limiting

Protect your API from abuse:

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per window
  message: {
    error: {
      message: 'Too many requests, please try again later',
      type: 'rate_limit_exceeded'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to all routes
app.use('/v1/', limiter);
```

## Step 7: Add Authentication (Optional)

Require API keys:

```typescript
// API key middleware
function requireApiKey(req, res, next) {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({
      error: {
        message: 'Missing API key',
        type: 'authentication_error'
      }
    });
  }

  // Validate API key (in production, check against database)
  const validKeys = process.env.VALID_API_KEYS?.split(',') || [];

  if (!validKeys.includes(apiKey)) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error'
      }
    });
  }

  next();
}

// Require auth for chat endpoint
app.post('/v1/chat/completions', requireApiKey, validateChatRequest, async (req, res) => {
  // ... rest of handler
});
```

Update `.env`:

```bash
VALID_API_KEYS=sk-test-123,sk-test-456
```

Test with API key:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-test-123" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Step 8: Add Middleware

Use aimatey middleware for production features:

```typescript
import {
  createLoggingMiddleware,
  createCachingMiddleware,
  createCostTrackingMiddleware
} from '@johnhenry/aimatey-middleware';

// Add middleware to bridge
bridge.use(createLoggingMiddleware({
  level: 'info',
  sanitize: true   // redacts API keys and tokens
}));

bridge.use(createCachingMiddleware({
  ttl: 3_600_000,  // ttl is milliseconds
  maxSize: 1000
}));

bridge.use(createCostTrackingMiddleware({
  dailyThreshold: 100,
  onThresholdExceeded: (cost, threshold) => {
    console.error(`⚠️  Spend passed $${threshold} (last request $${cost.totalCost.toFixed(4)})`);
  }
}));
```

An API server answers for many people out of one process, so cache entries are
scoped to a caller. Pass the caller's identity with each request:

```typescript
const response = await bridge.chat(req.body, { principal: req.user.id });
```

Without it the response is simply not cached - the middleware will not risk
handing it to the next person who asks the same question. If your server really
does serve a single audience, say so once with
`createCachingMiddleware({ unidentified: 'share' })`.

## Step 9: Add Multi-Provider Support

Use Router for high availability:

A `Router` is a backend adapter, not a bridge: it takes only a config object,
backends are added with `register()`, and requests still go through a `Bridge`.

```typescript
import { Bridge, Router } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';

const router = new Router({
  routingStrategy: 'explicit',
  defaultBackend: 'anthropic',
  fallbackStrategy: 'sequential'
});

router.register('anthropic', new AnthropicBackendAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY
}));
router.register('openai', new OpenAIBackendAdapter({
  apiKey: process.env.OPENAI_API_KEY
}));

router.setFallbackChain(['anthropic', 'openai']);

// The bridge stays the entry point - it just talks to the router now
const bridge = new Bridge(new OpenAIFrontendAdapter(), router);

app.post('/v1/chat/completions', async (req, res) => {
  const response = req.body.stream
    ? bridge.chatStream(req.body)
    : await bridge.chat(req.body);
  // ... handle response
});
```

## Complete Production Server

Here's the full production-ready server:

```typescript
// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Bridge, Router } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';
import {
  createLoggingMiddleware,
  createCachingMiddleware,
  createRetryMiddleware
} from '@johnhenry/aimatey-middleware';

const app = express();
const PORT = process.env.PORT || 3000;

// Express middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: { message: 'Too many requests', type: 'rate_limit_exceeded' } }
});
app.use('/v1/', limiter);

// Create router
const router = new Router({
  routingStrategy: 'explicit',
  defaultBackend: 'anthropic',
  fallbackStrategy: 'sequential',
  healthCheckInterval: 60000
});

router.register('anthropic', new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }));
router.register('openai', new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY }));
router.setFallbackChain(['anthropic', 'openai']);

// The router is the bridge's backend
const bridge = new Bridge(new OpenAIFrontendAdapter(), router);

// Add aimatey middleware - the middleware stack lives on the bridge
bridge.use(createLoggingMiddleware({ level: 'info', sanitize: true }));
bridge.use(createRetryMiddleware({ maxAttempts: 3 }));
bridge.use(createCachingMiddleware({ ttl: 3_600_000 }));

// Validation middleware
function validateChatRequest(req, res, next) {
  const { model, messages } = req.body;

  if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: { message: 'Invalid request', type: 'invalid_request_error' }
    });
  }

  next();
}

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.post('/v1/chat/completions', validateChatRequest, async (req, res) => {
  try {
    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = bridge.chatStream(req.body);

      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const response = await bridge.chat(req.body);
      res.json(response);
    }
  } catch (error) {
    console.error('Error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: { message: error.message, type: 'api_error' }
      });
    }
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { message: 'Internal server error', type: 'server_error' }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Chat API: POST http://localhost:${PORT}/v1/chat/completions`);
  console.log(`❤️  Health: GET http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
```

## Testing Your API

### cURL

```bash
# Non-streaming
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}]}'

# Streaming
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Count to 5"}],"stream":true}'
```

### JavaScript Client

```typescript
// client.js
async function chat(message) {
  const response = await fetch('http://localhost:3000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: message }]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

console.log(await chat('What is aimatey?'));
```

### Streaming Client

```typescript
async function chatStream(message) {
  const response = await fetch('http://localhost:3000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: message }],
      stream: true
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;

        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content;
        if (content) {
          process.stdout.write(content);
        }
      }
    }
  }
}

await chatStream('Count to 10');
```

## Next Steps

Congratulations! You've built a production-ready chat API.

**Explore more:**
- [HTTP Server Examples](https://github.com/johnhenry/aimatey/tree/main/packages/aimatey-docs/examples/05-http-servers)
- [Integration Patterns](/aimatey/patterns)

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t ai-matey-api .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=your_key ai-matey-api
```

### Vercel

```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "/server.js" }]
}
```

---

**🎉 Tutorial Complete!** You've mastered the aimatey basics. Explore [Advanced Examples](https://github.com/johnhenry/aimatey/tree/main/packages/aimatey-docs/examples/07-advanced-patterns)
