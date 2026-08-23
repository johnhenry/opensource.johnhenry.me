---
title: "Intermediate Representation (IR) Format"
---

The **Intermediate Representation (IR)** is the universal format that sits between frontend and backend adapters in ai.matey. It normalizes chat requests, responses, and streams in a provider-agnostic way.

## Overview

```
Client (OpenAI format)
        ↓
Frontend Adapter → IR Format → Backend Adapter
                                        ↓
                                Provider (Anthropic API)
```

The IR acts as a translation layer, allowing any client format to work with any backend provider.

## Design Principles

### 1. Provider-Agnostic
No provider-specific fields in core types. All providers map to the same IR structure.

### 2. Extensible
Support for metadata and custom fields allows provider-specific data to flow through without breaking compatibility.

### 3. Type-Safe
Uses TypeScript discriminated unions for runtime type checking and compile-time safety.

### 4. Stream-Friendly
First-class support for streaming responses with multiple streaming modes (delta and accumulated).

### 5. Semantic Drift Tracking
Captures transformations and compatibility warnings when converting between formats.

## Message Roles

The role of a participant in the conversation:

```typescript
type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
```

**Role Mapping Across Providers:**

| IR Role | OpenAI | Anthropic | Gemini | Ollama |
|---------|---------|-----------|---------|---------|
| `system` | `system` | (separate param) | `systemInstruction` | `system` |
| `user` | `user` | `user` | `user` | `user` |
| `assistant` | `assistant` | `assistant` | `model` | `assistant` |
| `tool` | `tool` | `tool_result` | N/A | N/A |

## Message Content Types

### Text Content

```typescript
interface TextContent {
  type: 'text';
  text: string;
}
```

### Image Content

```typescript
interface ImageContent {
  type: 'image';
  source: {
    type: 'url' | 'base64';
    url?: string;
    mediaType?: string;
    data?: string;
  };
}
```

### Tool Use Content

```typescript
interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
```

### Tool Result Content

```typescript
interface ToolResultContent {
  type: 'tool_result';
  toolUseId: string;
  content: string | TextContent[];
  isError?: boolean;
}
```

## Request Format

### IRChatCompletionRequest

```typescript
interface IRChatCompletionRequest {
  model: string;
  messages: IRMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: IRTool[];
  // ...additional parameters
}
```

**Example:**
```typescript
{
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello!' }
  ],
  temperature: 0.7,
  max_tokens: 150
}
```

## Response Format

### IRChatCompletionResponse

```typescript
interface IRChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: IRChoice[];
  usage?: IRUsage;
}
```

**Example:**
```typescript
{
  id: 'chatcmpl-abc123',
  object: 'chat.completion',
  created: 1677858242,
  model: 'gpt-4',
  choices: [{
    index: 0,
    message: {
      role: 'assistant',
      content: 'Hello! How can I help you today?'
    },
    finish_reason: 'stop'
  }],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 9,
    total_tokens: 19
  }
}
```

## Streaming Format

### IRChatCompletionChunk

```typescript
interface IRChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: IRStreamChoice[];
}
```

**Streaming Flow:**
```typescript
// Chunk 1
{ choices: [{ delta: { content: 'Hello' } }] }

// Chunk 2
{ choices: [{ delta: { content: ' there' } }] }

// Final Chunk
{ choices: [{ delta: {}, finish_reason: 'stop' }] }
```

## Tools & Function Calling

### IRTool Definition

```typescript
interface IRTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}
```

**Example:**
```typescript
{
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' },
        units: { type: 'string', enum: ['celsius', 'fahrenheit'] }
      },
      required: ['location']
    }
  }
}
```

## Parameters

### Common Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `temperature` | number | 0.7 | Randomness (0-2) |
| `max_tokens` | number | - | Maximum response length |
| `top_p` | number | 1.0 | Nucleus sampling |
| `top_k` | number | - | Top-k sampling |
| `stream` | boolean | false | Enable streaming |
| `stop` | string[] | - | Stop sequences |
| `presence_penalty` | number | 0 | Presence penalty (-2 to 2) |
| `frequency_penalty` | number | 0 | Frequency penalty (-2 to 2) |

### Provider Compatibility

Not all providers support all parameters. The IR format includes all common parameters, and adapters handle unsupported parameters gracefully.

## Capabilities

### IRCapabilities

Describes what a provider/backend supports:

```typescript
interface IRCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  json_mode: boolean;
  max_context_length: number;
  // ...more capabilities
}
```

## Best Practices

1. **Always validate IR objects** before passing to adapters
2. **Use type guards** for content types
3. **Handle missing optional fields** gracefully
4. **Preserve metadata** when transforming
5. **Check capabilities** before using advanced features

## See Also

- [Frontend Adapters](/ai-matey/packages/frontend)
- [Backend Adapters](/ai-matey/packages/backend)
- [Type Definitions](https://github.com/johnhenry/ai.matey/blob/main/packages/ai.matey.types)
