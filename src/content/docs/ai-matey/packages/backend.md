---
title: "@johnhenry/aimatey-backend"
description: "Guide to the backend adapters in @johnhenry/aimatey-backend: execute requests against cloud and local AI providers."
---

Backend adapters connect to AI provider APIs. Switch providers without changing your application code - just swap the backend adapter.

## Installation

```bash
npm install @johnhenry/aimatey-backend
```

## Overview

Backend adapters translate ai.matey's Intermediate Representation (IR) into provider-specific API calls. This allows you to switch AI providers without changing your application code.

**Supported Providers (24+):**
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude 3.5 Sonnet, Opus, Haiku)
- Google (Gemini 1.5 Pro, Flash)
- Groq (Llama 3, Mixtral)
- DeepSeek (V3, Chat)
- Ollama (Local models)
- Cohere, Mistral, Perplexity, Together AI, and more!

## Quick Start

```typescript
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({
    apiKey: process.env.ANTHROPIC_API_KEY
  })
);

// Write in OpenAI format, execute with Claude
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## OpenAI Backend

Use OpenAI's GPT models.

### Installation

```typescript
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';
```

### Configuration

```typescript
const backend = new OpenAIBackendAdapter({
  apiKey: process.env.OPENAI_API_KEY, // Required
  baseURL: 'https://api.openai.com/v1', // Optional
  organization: 'org-xxx', // Optional
  timeout: 60000, // Optional (default: 60s)
  maxRetries: 3 // Optional (default: 2)
});
```

### Available Models

- **GPT-4 Turbo**: `gpt-4-turbo`, `gpt-4-turbo-preview`
- **GPT-4**: `gpt-4`, `gpt-4-0613`
- **GPT-3.5 Turbo**: `gpt-3.5-turbo`, `gpt-3.5-turbo-16k`
- **GPT-4 Vision**: `gpt-4-vision-preview`

### Features

- ✅ Chat completions
- ✅ Streaming
- ✅ Function calling
- ✅ Vision (GPT-4 Vision)
- ✅ JSON mode
- ✅ Seed for reproducibility

### Pricing (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| GPT-4 Turbo | $10 | $30 |
| GPT-4 | $30 | $60 |
| GPT-3.5 Turbo | $0.50 | $1.50 |

## Anthropic Backend

Use Anthropic's Claude models.

### Installation

```typescript
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
```

### Configuration

```typescript
const backend = new AnthropicBackendAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY, // Required
  baseURL: 'https://api.anthropic.com', // Optional
  timeout: 60000 // Optional
});
```

### Available Models

- **Claude 3.5 Sonnet**: `claude-3-5-sonnet-20241022` (Latest, most capable)
- **Claude 3 Opus**: `claude-3-opus-20240229` (Highest intelligence)
- **Claude 3 Sonnet**: `claude-3-sonnet-20240229` (Balanced)
- **Claude 3 Haiku**: `claude-3-haiku-20240307` (Fastest, cheapest)

### Features

- ✅ Chat completions
- ✅ Streaming
- ✅ Tool use
- ✅ Vision
- ✅ 200K context window
- ✅ System prompts

### Pricing (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| Claude 3.5 Sonnet | $3 | $15 |
| Claude 3 Opus | $15 | $75 |
| Claude 3 Sonnet | $3 | $15 |
| Claude 3 Haiku | $0.25 | $1.25 |

## Google Gemini Backend

Use Google's Gemini models.

### Installation

```typescript
import { GeminiBackendAdapter } from '@johnhenry/aimatey-backend/gemini';
```

### Configuration

```typescript
const backend = new GeminiBackendAdapter({
  apiKey: process.env.GEMINI_API_KEY, // Required
  baseURL: 'https://generativelanguage.googleapis.com', // Optional
});
```

### Available Models

- **Gemini 1.5 Pro**: `gemini-1.5-pro-latest` (Most capable)
- **Gemini 1.5 Flash**: `gemini-1.5-flash-latest` (Fast, efficient)
- **Gemini 1.0 Pro**: `gemini-1.0-pro` (Previous generation)

### Features

- ✅ Chat completions
- ✅ Streaming
- ✅ Function calling
- ✅ Native multi-modal (vision, audio)
- ✅ 2M token context (Pro)
- ✅ Grounding with Google Search

### Pricing (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| Gemini 1.5 Pro | $3.50 | $10.50 |
| Gemini 1.5 Flash | $0.35 | $1.05 |

## Groq Backend

Use Groq's ultra-fast inference.

### Installation

```typescript
import { GroqBackendAdapter } from '@johnhenry/aimatey-backend/groq';
```

### Configuration

```typescript
const backend = new GroqBackendAdapter({
  apiKey: process.env.GROQ_API_KEY // Required
});
```

### Available Models

- **Llama 3**: `llama3-70b-8192`, `llama3-8b-8192`
- **Mixtral**: `mixtral-8x7b-32768`
- **Gemma**: `gemma-7b-it`

### Features

- ✅ Chat completions
- ✅ Streaming
- ✅ **Ultra-fast** (500+ tokens/sec)
- ⚠️ Limited tool support

### Pricing

**Free tier available!** Very cost-effective for high-throughput use cases.

## DeepSeek Backend

Use DeepSeek's cost-effective models.

### Installation

```typescript
import { DeepSeekBackendAdapter } from '@johnhenry/aimatey-backend/deepseek';
```

### Configuration

```typescript
const backend = new DeepSeekBackendAdapter({
  apiKey: process.env.DEEPSEEK_API_KEY // Required
});
```

### Available Models

- **DeepSeek V3**: `deepseek-chat` (Latest)
- **DeepSeek Coder**: `deepseek-coder` (Code specialist)

### Features

- ✅ Chat completions
- ✅ Streaming
- ✅ Competitive quality
- ✅ **Very low cost**

### Pricing (per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| DeepSeek Chat | $0.14 | $0.28 |
| DeepSeek Coder | $0.14 | $0.28 |

**Up to 95% cheaper than GPT-4!**

## Ollama Backend

Use local open-source models.

### Installation

```typescript
import { OllamaBackendAdapter } from '@johnhenry/aimatey-backend/ollama';
```

### Configuration

```typescript
const backend = new OllamaBackendAdapter({
  baseURL: 'http://localhost:11434', // Optional (default)
  timeout: 120000 // Optional (2 min for local inference)
});
```

### Available Models

Any model supported by Ollama:
- **Llama 3.2**: `llama3.2`, `llama3.2:70b`
- **Mistral**: `mistral`, `mistral-nemo`
- **Qwen**: `qwen2.5:72b`
- **Gemma**: `gemma2`
- **Phi**: `phi3`

### Features

- ✅ Chat completions
- ✅ Streaming
- ✅ **100% local** (no API costs)
- ✅ Privacy (data never leaves your machine)
- ⚠️ Slower than cloud providers
- ⚠️ Limited tool support (model-dependent)

### Setup

1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama3.2`
3. Use with ai.matey:

```typescript
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new OllamaBackendAdapter()
);

const response = await bridge.chat({
  model: 'llama3.2',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## More Providers

### Cohere

```typescript
import { CohereBackendAdapter } from '@johnhenry/aimatey-backend/cohere';

const backend = new CohereBackendAdapter({
  apiKey: process.env.COHERE_API_KEY
});
```

**Models:** `command-r-plus`, `command-r`, `command`

### Mistral

```typescript
import { MistralBackendAdapter } from '@johnhenry/aimatey-backend/mistral';

const backend = new MistralBackendAdapter({
  apiKey: process.env.MISTRAL_API_KEY
});
```

**Models:** `mistral-large-latest`, `mistral-medium-latest`, `mistral-small-latest`

### Perplexity

```typescript
import { PerplexityBackendAdapter } from '@johnhenry/aimatey-backend/perplexity';

const backend = new PerplexityBackendAdapter({
  apiKey: process.env.PERPLEXITY_API_KEY
});
```

**Models:** `llama-3.1-sonar-large`, `llama-3.1-sonar-small`

### Together AI

```typescript
import { TogetherBackendAdapter } from '@johnhenry/aimatey-backend/together';

const backend = new TogetherBackendAdapter({
  apiKey: process.env.TOGETHER_API_KEY
});
```

**Models:** Wide selection of open-source models

## Provider Comparison

### By Use Case

#### Best for Production
1. **OpenAI** - Most reliable, widely tested
2. **Anthropic** - Excellent quality, large context
3. **Google Gemini** - Strong multi-modal capabilities

#### Best for Cost Optimization
1. **DeepSeek** - Cheapest cloud option
2. **Ollama** - Free (local)
3. **Groq** - Generous free tier

#### Best for Speed
1. **Groq** - 500+ tokens/sec
2. **Gemini Flash** - Very fast
3. **Claude Haiku** - Fast cloud model

#### Best for Privacy
1. **Ollama** - 100% local
2. **LM Studio** - Local with GUI
3. Self-hosted options

### Feature Matrix

| Provider | Streaming | Tools | Vision | Context | Speed |
|----------|-----------|-------|--------|---------|-------|
| OpenAI | ✅ | ✅ | ✅ | 128K | Fast |
| Anthropic | ✅ | ✅ | ✅ | 200K | Fast |
| Gemini | ✅ | ✅ | ✅ | 2M | Fast |
| Groq | ✅ | ⚠️ | ❌ | 32K | **Very Fast** |
| DeepSeek | ✅ | ✅ | ❌ | 64K | Medium |
| Ollama | ✅ | ⚠️ | ⚠️ | Varies | Slow |

## Switching Providers

### Simple Switch

Change providers by only changing the backend:

```typescript
// Before: OpenAI
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new OpenAIBackendAdapter({ apiKey: openaiKey })
);

// After: Anthropic (only change backend!)
const bridge = new Bridge(
  new OpenAIFrontendAdapter(), // Same frontend
  new AnthropicBackendAdapter({ apiKey: anthropicKey })
);
```

### Environment-Based

Use different providers for dev/prod:

```typescript
const backend = process.env.NODE_ENV === 'production'
  ? new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY })
  : new OllamaBackendAdapter({ baseURL: 'http://localhost:11434' });

const bridge = new Bridge(new OpenAIFrontendAdapter(), backend);
```

### Multi-Provider Fallback

Use Router for automatic failover:

```typescript
import { Router } from '@johnhenry/aimatey-core';

const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
    new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY }),
    new GroqBackendAdapter({ apiKey: process.env.GROQ_API_KEY })
  ],
  strategy: 'priority',
  fallbackOnError: true
});

// Automatically tries Anthropic, then OpenAI, then Groq
const response = await router.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## Cost Optimization

### Route by Complexity

```typescript
const router = new Router(new OpenAIFrontendAdapter(), {
  backends: [
    new DeepSeekBackendAdapter({ apiKey: process.env.DEEPSEEK_API_KEY }), // Cheap
    new GroqBackendAdapter({ apiKey: process.env.GROQ_API_KEY }),         // Fast
    new OpenAIBackendAdapter({ apiKey: process.env.OPENAI_API_KEY }),     // Powerful
    new AnthropicBackendAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }) // Most capable
  ],
  strategy: 'custom',
  customStrategy: (request) => {
    const messageLength = JSON.stringify(request.messages).length;

    if (messageLength < 100) return 0;  // DeepSeek: simple queries
    if (messageLength < 500) return 1;  // Groq: moderate queries
    if (messageLength < 2000) return 2; // OpenAI: complex queries
    return 3; // Anthropic: very complex queries
  }
});
```

**Potential savings:** Up to 90% compared to always using GPT-4.

## Provider-Specific Features

### OpenAI: JSON Mode

```typescript
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new OpenAIBackendAdapter({ apiKey })
);

const response = await bridge.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Return a user object' }],
  response_format: { type: 'json_object' }
});
```

### Anthropic: Extended Context

```typescript
const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey })
);

// Claude supports up to 200K tokens!
const longDocument = fs.readFileSync('long-doc.txt', 'utf-8');

const response = await bridge.chat({
  model: 'claude-3-5-sonnet-20241022',
  messages: [
    { role: 'user', content: `Summarize this:\n\n${longDocument}` }
  ]
});
```

### Gemini: Grounding

```typescript
const bridge = new Bridge(
  new GeminiFrontendAdapter(),
  new GeminiBackendAdapter({ apiKey })
);

const response = await bridge.chat({
  model: 'gemini-1.5-pro',
  contents: [{ role: 'user', parts: [{ text: 'Latest AI news?' }] }],
  tools: [{ google_search_retrieval: {} }] // Enable grounding
});
```

## Best Practices

### 1. Use Environment Variables

```typescript
const backend = new AnthropicBackendAdapter({
  apiKey: process.env.ANTHROPIC_API_KEY // Don't hardcode!
});
```

### 2. Set Timeouts

```typescript
const backend = new OpenAIBackendAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000 // 30 seconds
});
```

### 3. Handle Errors

```typescript
try {
  const response = await bridge.chat(request);
} catch (error) {
  if (error.code === 'RATE_LIMIT_ERROR') {
    console.log('Rate limited, waiting...');
    await sleep(1000);
  } else if (error.code === 'AUTH_ERROR') {
    console.error('Invalid API key');
  } else {
    console.error('Error:', error.message);
  }
}
```

### 4. Monitor Costs

```typescript
import { createCostTrackingMiddleware } from '@johnhenry/aimatey-middleware';

bridge.use(createCostTrackingMiddleware({
  budgetLimit: 100,
  onBudgetExceeded: () => {
    console.error('Daily budget exceeded!');
  }
}));
```

## See Also

- [Frontend Adapters](/ai-matey/packages/frontend) - Available input formats
- [Core Package](/ai-matey/packages/core) - Bridge and Router
- [Middleware](/ai-matey/packages/middleware) - Add logging, caching, etc.
- [Integration Patterns](/ai-matey/patterns) - Production patterns
- [Examples on GitHub](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/02-providers) - Provider examples
