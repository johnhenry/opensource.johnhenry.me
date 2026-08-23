---
title: "ai.matey.frontend"
---

Frontend adapters define the input format for your AI requests. Write code in any API format you prefer - OpenAI, Anthropic, Google Gemini, or others.

## Installation

```bash
npm install ai.matey.frontend
```

## Overview

Frontend adapters translate your chosen API format into ai.matey's Intermediate Representation (IR). This allows you to write code in whatever format you're most comfortable with.

**Available Adapters:**
- OpenAI
- Anthropic
- Google Gemini
- Ollama
- Cohere
- Mistral
- Groq

## OpenAI Frontend Adapter

Use OpenAI's API format as input.

### Installation

```typescript
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
```

### Usage

```typescript
import { Bridge } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey: 'your-key' })
);

// Write in OpenAI format
const response = await bridge.chat({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello!' }
  ],
  temperature: 0.7,
  max_tokens: 100
});
```

### Supported Features

- ✅ Chat completions
- ✅ Streaming
- ✅ Function calling/tools
- ✅ Vision (image inputs)
- ✅ System messages
- ✅ Temperature, top_p, max_tokens
- ✅ Stop sequences
- ✅ Presence/frequency penalties

### Request Format

```typescript
interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  tools?: OpenAITool[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}
```

## Anthropic Frontend Adapter

Use Anthropic's API format as input.

### Installation

```typescript
import { AnthropicFrontendAdapter } from 'ai.matey.frontend/anthropic';
```

### Usage

```typescript
import { Bridge } from 'ai.matey.core';
import { AnthropicFrontendAdapter } from 'ai.matey.frontend/anthropic';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';

const bridge = new Bridge(
  new AnthropicFrontendAdapter(),
  new OpenAIBackendAdapter({ apiKey: 'your-key' })
);

// Write in Anthropic format
const response = await bridge.chat({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 100,
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  system: 'You are helpful.', // System message separate
  temperature: 0.7
});
```

### Key Differences from OpenAI

- System messages are a separate `system` parameter (not in messages array)
- `max_tokens` is **required**
- No `presence_penalty` or `frequency_penalty`
- Different tool/function calling format

### Supported Features

- ✅ Chat completions
- ✅ Streaming
- ✅ Tool use
- ✅ Vision (image inputs)
- ✅ System messages (as parameter)
- ✅ Temperature, top_p, top_k
- ✅ Stop sequences

## Google Gemini Frontend Adapter

Use Google's Gemini API format as input.

### Installation

```typescript
import { GeminiFrontendAdapter } from 'ai.matey.frontend/gemini';
```

### Usage

```typescript
import { Bridge } from 'ai.matey.core';
import { GeminiFrontendAdapter } from 'ai.matey.frontend/gemini';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';

const bridge = new Bridge(
  new GeminiFrontendAdapter(),
  new OpenAIBackendAdapter({ apiKey: 'your-key' })
);

// Write in Gemini format
const response = await bridge.chat({
  model: 'gemini-1.5-pro',
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Hello!' }]
    }
  ],
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 100
  }
});
```

### Key Differences

- Uses `contents` instead of `messages`
- Uses `parts` for multi-modal content
- Role is `model` instead of `assistant`
- Configuration in `generationConfig` object
- System instructions separate parameter

### Supported Features

- ✅ Chat completions
- ✅ Streaming
- ✅ Function calling
- ✅ Vision (native multi-modal support)
- ✅ System instructions
- ✅ Temperature, topP, topK
- ✅ Stop sequences
- ✅ Safety settings

## Ollama Frontend Adapter

Use Ollama's API format (compatible with local models).

### Installation

```typescript
import { OllamaFrontendAdapter } from 'ai.matey.frontend/ollama';
```

### Usage

```typescript
import { Bridge } from 'ai.matey.core';
import { OllamaFrontendAdapter } from 'ai.matey.frontend/ollama';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';

const bridge = new Bridge(
  new OllamaFrontendAdapter(),
  new OpenAIBackendAdapter({ apiKey: 'your-key' })
);

// Write in Ollama format
const response = await bridge.chat({
  model: 'llama3.2',
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  stream: false
});
```

### Supported Features

- ✅ Chat completions
- ✅ Streaming
- ✅ System messages
- ✅ Temperature, top_p, top_k
- ⚠️ Limited tool support (model-dependent)

## Cohere Frontend Adapter

Use Cohere's API format as input.

### Installation

```typescript
import { CohereFrontendAdapter } from 'ai.matey.frontend/cohere';
```

### Usage

```typescript
import { Bridge } from 'ai.matey.core';
import { CohereFrontendAdapter } from 'ai.matey.frontend/cohere';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';

const bridge = new Bridge(
  new CohereFrontendAdapter(),
  new OpenAIBackendAdapter({ apiKey: 'your-key' })
);

// Write in Cohere format
const response = await bridge.chat({
  model: 'command-r-plus',
  message: 'Hello!',
  chat_history: [
    { role: 'USER', message: 'Hi' },
    { role: 'CHATBOT', message: 'Hello!' }
  ],
  temperature: 0.7
});
```

### Key Differences

- Uses `message` for current user message
- Chat history separate from current message
- Roles are `USER` and `CHATBOT` (uppercase)
- Different parameter names

## Mistral Frontend Adapter

Use Mistral's API format (very similar to OpenAI).

### Installation

```typescript
import { MistralFrontendAdapter } from 'ai.matey.frontend/mistral';
```

### Usage

```typescript
import { Bridge } from 'ai.matey.core';
import { MistralFrontendAdapter } from 'ai.matey.frontend/mistral';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';

const bridge = new Bridge(
  new MistralFrontendAdapter(),
  new OpenAIBackendAdapter({ apiKey: 'your-key' })
);

// Mistral format is very similar to OpenAI
const response = await bridge.chat({
  model: 'mistral-large-latest',
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  temperature: 0.7
});
```

## Groq Frontend Adapter

Use Groq's API format (OpenAI-compatible).

### Installation

```typescript
import { GroqFrontendAdapter } from 'ai.matey.frontend/groq';
```

### Usage

```typescript
import { Bridge } from 'ai.matey.core';
import { GroqFrontendAdapter } from 'ai.matey.frontend/groq';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';

const bridge = new Bridge(
  new GroqFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey: 'your-key' })
);

// Groq uses OpenAI-compatible format
const response = await bridge.chat({
  model: 'llama3-8b-8192',
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
});
```

## Choosing a Frontend Adapter

### Use OpenAI Frontend Adapter if:
- You're familiar with OpenAI's API
- You want the most widely-used format
- Your codebase already uses OpenAI
- You need maximum compatibility

### Use Anthropic Frontend Adapter if:
- You prefer Anthropic's API design
- You want explicit system message separation
- Your codebase uses Claude

### Use Gemini Frontend Adapter if:
- You're working with Google AI Platform
- You need native multi-modal support
- You use Vertex AI

### Use Ollama Frontend Adapter if:
- You're working with local models
- You want a simple format
- You're developing locally

## Feature Compatibility Matrix

| Feature | OpenAI | Anthropic | Gemini | Ollama | Cohere | Mistral | Groq |
|---------|--------|-----------|--------|--------|--------|---------|------|
| Chat | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Streaming | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tools/Functions | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| Vision | ✅ | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ⚠️ |
| System Messages | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |

✅ Fully supported | ⚠️ Partially supported | ❌ Not supported

## Creating Custom Frontend Adapters

You can create your own frontend adapter:

```typescript
import { FrontendAdapter } from 'ai.matey.core';
import type { IRChatCompletionRequest, IRChatCompletionResponse } from 'ai.matey.types';

export class CustomFrontendAdapter implements FrontendAdapter {
  name = 'custom';

  // Convert custom format to IR
  toIR(request: CustomRequest): IRChatCompletionRequest {
    return {
      model: request.modelName,
      messages: request.conversation.map(msg => ({
        role: msg.sender === 'human' ? 'user' : 'assistant',
        content: msg.text
      })),
      temperature: request.temp,
      max_tokens: request.maxLength
    };
  }

  // Convert IR back to custom format
  fromIR(response: IRChatCompletionResponse): CustomResponse {
    return {
      reply: response.choices[0].message.content,
      tokens: response.usage?.total_tokens || 0
    };
  }

  // Stream support (optional)
  async *fromIRStream(stream: AsyncIterable<IRChatCompletionChunk>) {
    for await (const chunk of stream) {
      yield {
        text: chunk.choices?.[0]?.delta?.content || '',
        done: chunk.choices?.[0]?.finish_reason !== null
      };
    }
  }
}
```

## Best Practices

### 1. Choose Based on Your Codebase

If your codebase already uses a specific API format, use that frontend adapter:

```typescript
// Existing OpenAI code
const openaiResponse = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Easy migration - use OpenAI frontend adapter
const bridge = new Bridge(
  new OpenAIFrontendAdapter(), // Same format!
  new AnthropicBackendAdapter({ apiKey })
);
```

### 2. Frontend is Independent of Backend

Mix and match any frontend with any backend:

```typescript
// OpenAI format → Anthropic backend
new Bridge(new OpenAIFrontendAdapter(), new AnthropicBackendAdapter({ apiKey }));

// Anthropic format → OpenAI backend
new Bridge(new AnthropicFrontendAdapter(), new OpenAIBackendAdapter({ apiKey }));

// Gemini format → Groq backend
new Bridge(new GeminiFrontendAdapter(), new GroqBackendAdapter({ apiKey }));
```

### 3. Type Safety

Use TypeScript for frontend-specific request types:

```typescript
import type { OpenAIChatRequest, OpenAIChatResponse } from 'ai.matey.frontend/openai';

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new AnthropicBackendAdapter({ apiKey })
);

const request: OpenAIChatRequest = {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
};

const response: OpenAIChatResponse = await bridge.chat(request);
```

## Semantic Drift

When converting between formats, some features may not map perfectly. This is called "semantic drift."

### Example: System Messages

```typescript
// OpenAI: system messages in array
{
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' }
  ]
}

// Anthropic: system separate
{
  system: 'You are helpful.',
  messages: [
    { role: 'user', content: 'Hello' }
  ]
}
```

The adapter handles this automatically, but be aware of potential drift.

### Handling Drift

Frontend adapters track and warn about semantic drift:

```typescript
const response = await bridge.chat(request);

if (response.warnings) {
  console.warn('Semantic drift detected:', response.warnings);
}
```

## See Also

- [Backend Adapters](/ai-matey/packages/backend) - Available backend providers
- [IR Format](/ai-matey/guides/architecture/ir-format) - Intermediate representation details
- [Core Package](/ai-matey/packages/core) - Bridge and Router documentation
- [Tutorial: Simple Bridge](/ai-matey/tutorials/beginner/simple-bridge) - Step-by-step guide
