---
title: "Intermediate Representation (IR) Format"
description: "Deep dive into aimatey's Intermediate Representation (IR), the universal format every adapter converts to and from."
---

The **Intermediate Representation (IR)** is the universal format that sits between frontend and backend adapters in aimatey. It normalizes chat requests, responses, and streams in a provider-agnostic way.

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
  source:
    | { type: 'url'; url: string }
    | { type: 'base64'; mediaType: string; data: string };
}
```

`AudioContent`, `DocumentContent` and `VideoContent` follow the same
`{ type, source }` shape.

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

### IRChatRequest

```typescript
interface IRChatRequest {
  messages: readonly IRMessage[];
  tools?: readonly IRTool[];
  toolChoice?: 'auto' | 'required' | 'none' | { name: string };
  responseFormat?: IRResponseFormat;
  parameters?: IRParameters;
  metadata: IRMetadata;
  stream?: boolean;
  streamMode?: StreamMode;
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | `IRMessage[]` | ✅ | Conversation messages (minimum 1) |
| `tools` | `IRTool[]` | ❌ | Available tools/functions |
| `toolChoice` | `string \| object` | ❌ | Tool selection strategy |
| `responseFormat` | `IRResponseFormat` | ❌ | JSON-schema-constrained output request |
| `parameters` | `IRParameters` | ❌ | Generation parameters (model, temperature, ...) |
| `metadata` | `IRMetadata` | ✅ | Request tracking metadata |
| `stream` | `boolean` | ❌ | Enable streaming (default: `false`) |
| `streamMode` | `StreamMode` | ❌ | Streaming mode (default: `'delta'`) |

Note that the model and the sampling options are **not** top-level fields - they
live on `parameters` - and that `metadata` is required.

**Example:**
```typescript
{
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello!' }
  ],
  parameters: {
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 150
  },
  metadata: {
    requestId: 'req_abc123xyz',
    timestamp: 1701234567890,
    provenance: { frontend: 'openai' }
  },
  stream: false
}
```

## Response Format

### IRChatResponse

```typescript
interface IRChatResponse {
  message: IRMessage;
  finishReason: FinishReason;
  usage?: IRUsage;
  metadata: IRMetadata;
  raw?: Record<string, unknown>;
}
```

A response carries exactly one assistant `message` - there is no `choices`
array, and no `id` / `object` / `created` / `model` fields. The provider's own
response id, when there is one, is `metadata.providerResponseId`.

```typescript
type FinishReason =
  | 'stop'           // Natural completion
  | 'length'         // Hit max tokens
  | 'tool_calls'     // Requested tool execution
  | 'content_filter' // Filtered by safety system
  | 'error'          // Error occurred
  | 'cancelled';     // Request cancelled

interface IRUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  details?: Record<string, unknown>;
}
```

**Example:**
```typescript
{
  message: {
    role: 'assistant',
    content: 'Hello! How can I help you today?'
  },
  finishReason: 'stop',
  usage: {
    promptTokens: 10,
    completionTokens: 9,
    totalTokens: 19
  },
  metadata: {
    requestId: 'req_abc123xyz',
    providerResponseId: 'chatcmpl-abc123',
    timestamp: 1677858242000,
    provenance: { frontend: 'openai', backend: 'anthropic' }
  }
}
```

## Streaming Format

### IRStreamChunk

`IRStreamChunk` is a discriminated union keyed on `type`, and every chunk carries
a monotonically increasing `sequence`:

```typescript
type IRStreamChunk =
  | StreamStartChunk
  | StreamContentChunk
  | StreamToolUseChunk
  | StreamMetadataChunk
  | StreamDoneChunk
  | StreamErrorChunk;

interface StreamStartChunk {
  type: 'start';
  sequence: number;
  metadata: IRMetadata;
}

interface StreamContentChunk {
  type: 'content';
  sequence: number;
  delta: string;         // New text in this chunk - always present
  accumulated?: string;  // Full text so far (accumulated mode only)
  role?: 'assistant';
}

interface StreamToolUseChunk {
  type: 'tool_use';
  sequence: number;
  id: string;
  name: string;
  inputDelta?: string;   // Raw partial-JSON fragment of the tool arguments
  index?: number;
}

interface StreamDoneChunk {
  type: 'done';
  sequence: number;
  finishReason: FinishReason;
  usage?: IRUsage;
  message?: IRMessage;
}
```

`StreamMetadataChunk` (`usage` / `metadata` updates) and `StreamErrorChunk`
(`error: { code, message, details? }`) complete the union.

### Streaming Modes

**Delta mode (default)** - each chunk carries only the new text:

```typescript
{ type: 'start',   sequence: 0, metadata }
{ type: 'content', sequence: 1, delta: 'Hello' }
{ type: 'content', sequence: 2, delta: ' there' }
{ type: 'done',    sequence: 3, finishReason: 'stop' }
```

**Accumulated mode** - each content chunk also carries the full text so far:

```typescript
{ type: 'content', sequence: 1, delta: 'Hello',  accumulated: 'Hello' }
{ type: 'content', sequence: 2, delta: ' there', accumulated: 'Hello there' }
```

**Consuming a stream:**
```typescript
for await (const chunk of stream) {
  switch (chunk.type) {
    case 'content':
      process.stdout.write(chunk.delta);
      break;
    case 'done':
      console.log('\nFinished:', chunk.finishReason);
      break;
    case 'error':
      throw new Error(chunk.error.message);
  }
}
```

## Tools & Function Calling

### IRTool Definition

A tool is described directly - there is no `{ type: 'function', function: {...} }`
wrapper.

```typescript
interface IRTool {
  name: string;
  description: string;
  parameters: JSONSchema;
  metadata?: Record<string, unknown>;
}
```

**Example:**
```typescript
{
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
```

Tool selection is `IRChatRequest.toolChoice`: `'auto'`, `'required'`, `'none'`,
or `{ name: 'get_weather' }`.

## Parameters

### IRParameters

Generation parameters live on `IRChatRequest.parameters` and are camelCase:

```typescript
interface IRParameters {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: readonly string[];
  seed?: number;
  user?: string;
  custom?: Record<string, unknown>;
}
```

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `temperature` | 0.0 - 2.0 | 0.7 | Sampling randomness (higher = more random) |
| `maxTokens` | 1 - ∞ | varies | Maximum tokens to generate |
| `topP` | 0.0 - 1.0 | 1.0 | Nucleus sampling threshold |
| `topK` | 1 - ∞ | varies | Top-K sampling limit |
| `frequencyPenalty` | -2.0 - 2.0 | 0.0 | Penalize frequent tokens |
| `presencePenalty` | -2.0 - 2.0 | 0.0 | Penalize present tokens |

`stream` and `streamMode` are top-level fields on the request, not parameters.

### Provider Compatibility

Not all providers support all parameters. The IR format includes all common parameters, and adapters handle unsupported parameters gracefully.

## Capabilities

### IRCapabilities

Describes what a provider/backend supports:

```typescript
interface IRCapabilities {
  streaming: boolean;
  multiModal: boolean;
  systemMessageStrategy: SystemMessageStrategy;
  supportsMultipleSystemMessages: boolean;
  tools?: boolean;
  structuredOutput?: 'native' | 'fallback';
  maxContextTokens?: number;
  supportedModels?: readonly string[];
  supportsTemperature?: boolean;
  supportsTopP?: boolean;
  supportsTopK?: boolean;
  supportsSeed?: boolean;
  // ...audio/document/video flags, embedding support, penalty flags
}
```

Multi-modal support is `multiModal` (with `supportsAudio`, `supportsDocuments`
and `supportsVideo` for specific input types), schema-constrained output is
`structuredOutput`, and the context window is `maxContextTokens`.

An adapter's capabilities are read from `adapter.metadata.capabilities`.

## Best Practices

1. **Always validate IR objects** before passing to adapters
2. **Use type guards** for content types
3. **Handle missing optional fields** gracefully
4. **Preserve metadata** when transforming
5. **Check capabilities** before using advanced features

## See Also

- [Frontend Adapters](/aimatey/packages/frontend)
- [Backend Adapters](/aimatey/packages/backend)
- [Type Definitions](https://github.com/johnhenry/aimatey/blob/main/packages/aimatey-types)
