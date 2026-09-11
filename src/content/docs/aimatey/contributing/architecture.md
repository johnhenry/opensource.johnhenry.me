---
title: "Architecture Guide"
description: "Architecture overview of the aimatey monorepo: package layers, data flow, and design decisions."
---

Deep dive into aimatey's architecture, design patterns, and implementation details.

## Core Concepts

### The Universal Adapter Pattern

aimatey uses the **Adapter Pattern** to provide a universal interface for AI APIs:

```
┌─────────────────────────────────────────────────────────┐
│                   Your Application                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Frontend Adapter (Input Format)             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│      Intermediate Representation (IR) - Universal        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Middleware Stack                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│            Backend Adapter (AI Provider)                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                     AI Provider API                      │
└─────────────────────────────────────────────────────────┘
```

**Key Insight:** The Intermediate Representation (IR) is the secret sauce that makes everything work.

## Intermediate Representation (IR)

The IR is a provider-agnostic format for representing AI requests and responses.

### Design Principles

1. **Provider-Agnostic**: Works with any AI provider
2. **Extensible**: Can add new fields without breaking compatibility
3. **Type-Safe**: Full TypeScript support
4. **Stream-Friendly**: First-class streaming support
5. **Semantic Drift Tracking**: Captures lossy conversions

### IR Message Format

```typescript
interface IRMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | readonly MessageContent[];
  name?: string;
  metadata?: Record<string, unknown>;
}
```

Tool calls and tool results are content blocks (`ToolUseContent`,
`ToolResultContent`) inside `content` - not separate `tool_calls` /
`tool_call_id` fields.

### IR Request Format

```typescript
interface IRChatRequest {
  messages: readonly IRMessage[];
  tools?: readonly IRTool[];
  toolChoice?: 'auto' | 'required' | 'none' | { name: string };
  responseFormat?: IRResponseFormat;
  parameters?: IRParameters;   // model, temperature, maxTokens, topP, topK, ...
  metadata: IRMetadata;        // required: requestId, timestamp, provenance, ...
  stream?: boolean;
  streamMode?: StreamMode;
}
```

### IR Response Format

```typescript
interface IRChatResponse {
  message: IRMessage;          // one assistant message - no `choices` array
  finishReason: FinishReason;
  usage?: IRUsage;             // promptTokens / completionTokens / totalTokens
  metadata: IRMetadata;
  raw?: Record<string, unknown>;
}
```

## Frontend Adapters

Frontend adapters translate from a specific API format to IR.

### Interface

```typescript
interface FrontendAdapter {
  // Identification and capabilities - there is no bare `name` field
  readonly metadata: AdapterMetadata;

  // Convert frontend format → IR (async)
  toIR(request: FrontendRequest): Promise<IRChatRequest>;

  // Convert IR → frontend format (async)
  fromIR(response: IRChatResponse): Promise<FrontendResponse>;

  // Streaming support (required)
  fromIRStream(
    stream: IRChatStream,
    options?: StreamConversionOptions
  ): AsyncGenerator<FrontendChunk, void, undefined>;

  // Validate a request before conversion (optional)
  validate?(request: FrontendRequest): Promise<void>;
}
```

### Implementation Example

```typescript
export class OpenAIFrontendAdapter implements FrontendAdapter {
  readonly metadata: AdapterMetadata = {
    name: 'openai',
    version: '1.0.0',
    provider: 'OpenAI',
    capabilities: {
      streaming: true,
      multiModal: true,
      tools: true,
      systemMessageStrategy: 'in-messages',
      supportsMultipleSystemMessages: true
    }
  };

  async toIR(request: OpenAIRequest): Promise<IRChatRequest> {
    return {
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      parameters: {
        model: request.model,
        temperature: request.temperature,
        maxTokens: request.max_tokens,
        // ... map remaining sampling parameters
      },
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: Date.now(),
        provenance: { frontend: 'openai' }
      },
      stream: request.stream
    };
  }

  async fromIR(response: IRChatResponse): Promise<OpenAIResponse> {
    return {
      id: response.metadata.providerResponseId ?? response.metadata.requestId,
      object: 'chat.completion',
      created: Math.floor(response.metadata.timestamp / 1000),
      // The model that answered. `resolveServedModel` walks a proxied provenance chain to
      // the hop that actually served; it returns undefined when the provider does not
      // report one, so pick a fallback rather than asserting the requested model.
      model: resolveServedModel(response.metadata.provenance) ?? 'unknown',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response.message.content as string
        },
        finish_reason: response.finishReason
      }],
      usage: response.usage && {
        prompt_tokens: response.usage.promptTokens,
        completion_tokens: response.usage.completionTokens,
        total_tokens: response.usage.totalTokens
      }
    };
  }

  async *fromIRStream(stream: IRChatStream) {
    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        yield { choices: [{ index: 0, delta: { content: chunk.delta } }] };
      }
    }
  }
}
```

## Backend Adapters

Backend adapters translate from IR to provider-specific API calls.

### Interface

```typescript
interface BackendAdapter {
  // Identification and capabilities (capabilities live under metadata)
  readonly metadata: AdapterMetadata;

  // Convert IR → provider format, and provider format → IR
  fromIR(request: IRChatRequest): ProviderRequest;
  toIR(
    response: ProviderResponse,
    originalRequest: IRChatRequest,
    latencyMs: number
  ): IRChatResponse;

  // Execute non-streaming request
  execute(request: IRChatRequest, signal?: AbortSignal): Promise<IRChatResponse>;

  // Execute streaming request - returns the stream, not a Promise
  executeStream(request: IRChatRequest, signal?: AbortSignal): IRChatStream;

  // Health check (optional)
  healthCheck?(): Promise<boolean>;

  // Cost estimation, model listing, embeddings (all optional)
  estimateCost?(request: IRChatRequest): Promise<number | null>;
  listModels?(options?: ListModelsOptions): Promise<ListModelsResult>;
  embed?(request: IREmbedRequest, signal?: AbortSignal): Promise<IREmbedResponse>;
}
```

### Implementation Example

```typescript
export class AnthropicBackendAdapter implements BackendAdapter {
  readonly metadata: AdapterMetadata = {
    name: 'anthropic',
    version: '1.0.0',
    provider: 'Anthropic',
    capabilities: {
      streaming: true,
      multiModal: true,
      tools: true,
      systemMessageStrategy: 'separate-parameter',
      supportsMultipleSystemMessages: false
    }
  };

  private client: Anthropic;

  constructor(config: BackendAdapterConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async execute(request: IRChatRequest): Promise<IRChatResponse> {
    const start = Date.now();

    // Convert IR → Anthropic format
    const anthropicRequest = this.fromIR(request);

    // Make API call
    const anthropicResponse = await this.client.messages.create(anthropicRequest);

    // Convert Anthropic format → IR
    return this.toIR(anthropicResponse, request, Date.now() - start);
  }

  async *executeStream(request: IRChatRequest) {
    const anthropicRequest = this.fromIR(request);

    const stream = await this.client.messages.create({
      ...anthropicRequest,
      stream: true
    });

    let sequence = 0;
    yield { type: 'start' as const, sequence: sequence++, metadata: request.metadata };

    for await (const chunk of stream) {
      yield this.chunkToIR(chunk, sequence++);
    }

    yield { type: 'done' as const, sequence: sequence++, finishReason: 'stop' as const };
  }

  fromIR(request: IRChatRequest): MessageCreateParams {
    // Extract system message (a separate parameter in Anthropic)
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const system = systemMessages.map(m => m.content).join('\n');
    const params = request.parameters ?? {};

    return {
      model: this.mapModel(params.model),
      max_tokens: params.maxTokens ?? 1024,
      messages: request.messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        })),
      system: system || undefined,
      temperature: params.temperature,
      top_p: params.topP,
      stop_sequences: params.stopSequences ? [...params.stopSequences] : undefined
    };
  }

  toIR(response: Message, originalRequest: IRChatRequest, latencyMs: number): IRChatResponse {
    return {
      message: {
        role: 'assistant',
        content: response.content[0].type === 'text' ? response.content[0].text : ''
      },
      finishReason: response.stop_reason === 'end_turn' ? 'stop' : 'length',
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      metadata: {
        ...originalRequest.metadata,
        providerResponseId: response.id,
        provenance: { ...originalRequest.metadata.provenance, backend: 'anthropic' },
        custom: { ...originalRequest.metadata.custom, latencyMs }
      },
      raw: response as unknown as Record<string, unknown>
    };
  }
}
```

## Bridge Architecture

The Bridge connects frontend and backend adapters.

### Core Implementation

```typescript
export class Bridge {
  private middleware: Middleware[] = [];

  constructor(
    readonly frontend: FrontendAdapter,
    readonly backend: BackendAdapter | Router,
    readonly config: BridgeConfig = {}
  ) {}

  async chat(request: any): Promise<any> {
    // 1. Convert frontend format → IR (toIR is async)
    const irRequest = await this.frontend.toIR(request);

    // 2. Execute middleware chain
    const irResponse = await this.executeMiddleware(irRequest);

    // 3. Convert IR → frontend format (fromIR is async)
    return this.frontend.fromIR(irResponse);
  }

  private async executeMiddleware(
    request: IRChatRequest
  ): Promise<IRChatResponse> {
    // Shared context - middleware reads and replaces context.request
    const context: MiddlewareContext = {
      request,
      isStreaming: false,
      state: {},
      config: {},
    };

    // Build middleware chain (first registered ends up outermost)
    const execute = this.middleware.reduceRight<MiddlewareNext>(
      (next, middleware) => {
        return async () => middleware(context, next);
      },
      // Final handler: call backend
      async () => {
        return this.backend.execute(context.request);
      }
    );

    return execute();
  }

  use(middleware: Middleware): this {
    this.middleware.push(middleware);
    return this; // `use()` returns the bridge, for chaining
  }
}
```

## Router Architecture

The Router does **not** extend Bridge. It implements `BackendAdapter`, so a
`Bridge` can be handed a router wherever it would take a single backend. Backends
are registered by name, and the fallback chain is what gives ordered failover.

### Core Implementation

```typescript
export class Router implements BackendAdapter {
  readonly metadata: AdapterMetadata;
  readonly config: RouterConfig;

  private backends = new Map<string, BackendAdapter>();
  private fallbackChain: string[] = [];
  private currentIndex = 0;

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = { routingStrategy: 'explicit', fallbackStrategy: 'none', ...config };
    // ...build metadata from the registered backends' capabilities
  }

  register(name: string, adapter: BackendAdapter): Router {
    this.backends.set(name, adapter);
    return this;
  }

  async execute(request: IRChatRequest, signal?: AbortSignal): Promise<IRChatResponse> {
    const name = await this.selectBackend(request);
    const attempted: string[] = [];

    for (const candidate of [name, ...this.fallbackChain.filter(n => n !== name)]) {
      const backend = this.backends.get(candidate);
      if (!backend) continue;

      try {
        return await backend.execute(request, signal);
      } catch (error) {
        attempted.push(candidate);
        if (this.config.fallbackStrategy === 'none') throw error;
      }
    }

    throw new RouterError({
      code: ErrorCode.ROUTING_FAILED,
      message: `All backends failed: ${attempted.join(', ')}`
    });
  }

  async selectBackend(request: IRChatRequest): Promise<string> {
    const names = [...this.backends.keys()];

    switch (this.config.routingStrategy) {
      case 'round-robin': {
        const index = this.currentIndex;
        this.currentIndex = (this.currentIndex + 1) % names.length;
        return names[index];
      }

      case 'random':
        return names[Math.floor(Math.random() * names.length)];

      case 'model-based':
        return this.modelMapping[request.parameters?.model ?? ''] ?? names[0];

      case 'custom': {
        const chosen = await this.config.customRouter?.(request, names, this.routingContext());
        return chosen ?? this.config.defaultBackend ?? names[0];
      }

      case 'explicit':
      default:
        return (
          (request.metadata.custom?.backend as string) ??
          this.config.defaultBackend ??
          names[0]
        );
    }
  }
}
```

There is no `'priority'` or `'weighted'` strategy, and the router emits no
events - failures are observable through `getStats()` and `getBackendInfo()`.

## Middleware System

Middleware intercepts requests/responses using the **Chain of Responsibility** pattern.

### Middleware Interface

```typescript
type Middleware = (
  context: MiddlewareContext,
  next: () => Promise<IRChatResponse>
) => Promise<IRChatResponse>;

interface MiddlewareContext {
  request: IRChatRequest;                    // inspect and replace to modify
  readonly isStreaming: boolean;
  readonly backend?: BackendAdapter;
  readonly backendName?: string;
  readonly state: Record<string, unknown>;   // shared between middleware
  readonly config: Record<string, unknown>;
  readonly signal?: AbortSignal;
}
```

### Implementation Example

```typescript
export function createLoggingMiddleware(options: LoggingOptions): Middleware {
  return async (context, next) => {
    const start = Date.now();

    console.log('[INFO] Request:', {
      model: context.request.parameters?.model,
      messages: context.request.messages.length
    });

    try {
      const response = await next();

      console.log('[INFO] Response:', {
        duration: Date.now() - start,
        tokens: response.usage?.total_tokens
      });

      return response;
    } catch (error) {
      console.error('[ERROR]', error.message);
      throw error;
    }
  };
}
```

### Middleware Chain Execution

```typescript
// Middleware stack
bridge.use(middleware1); // Outer
bridge.use(middleware2); // Middle
bridge.use(middleware3); // Inner

// Execution flow:
// Request  → middleware1 → middleware2 → middleware3 → Backend
// Response ← middleware1 ← middleware2 ← middleware3 ← Backend
```

## Streaming Architecture

Streaming uses **AsyncIterators** for real-time response delivery.

### Streaming Flow

```typescript
async *chatStream(request: IRChatRequest) {
  // 1. Convert to provider format
  const providerRequest = this.toProviderFormat(request);

  // 2. Get provider stream
  const stream = await this.provider.stream(providerRequest);

  // 3. Convert chunks to IR
  for await (const providerChunk of stream) {
    const irChunk = this.chunkToIR(providerChunk);
    yield irChunk;
  }
}
```

### Stream Consumption

```typescript
// chatStream() is an async generator - the call itself is not awaited
const stream = bridge.chatStream(request);

for await (const chunk of stream) {
  const content = chunk.choices?.[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);
  }
}
```

## Type System

### Type Hierarchy

```typescript
// Base types
types/
├── ir-request.ts       # IRChatRequest
├── ir-response.ts      # IRChatResponse
├── ir-chunk.ts         # IRStreamChunk
├── ir-message.ts       # IRMessage, MessageContent
├── ir-tool.ts          # IRTool
├── frontend.ts         # FrontendAdapter interface
├── backend.ts          # BackendAdapter interface
└── middleware.ts       # Middleware interface
```

### Type Safety

All conversions are type-safe:

```typescript
// Frontend adapter
async toIR(request: OpenAIRequest): Promise<IRChatRequest> {
  // TypeScript ensures all required IR fields are present
}

// Backend adapter
execute(request: IRChatRequest): Promise<IRChatResponse> {
  // TypeScript ensures correct IR types
}
```

## Error Handling

### Error Hierarchy

Every error derives from `AdapterError` - there is no `BridgeError`. The
hierarchy is flat: each specialized class extends `AdapterError` directly, and
constructors take a single options object.

```typescript
export class AdapterError extends Error {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly isRetryable: boolean;
  readonly provenance: ErrorProvenance;
  readonly irState?: { request?: Partial<IRChatRequest>; response?: Partial<IRChatResponse> };
  readonly details?: Record<string, unknown>;

  constructor(options: BaseErrorOptions) { /* ... */ }
}

// Specific error types, all extending AdapterError directly
export class ValidationError extends AdapterError {
  readonly validationDetails: ValidationErrorDetails[];
}

export class NetworkError extends AdapterError {}
```

The full set is `AuthenticationError`, `AuthorizationError`, `RateLimitError`,
`ValidationError`, `ProviderError`, `AdapterConversionError`, `NetworkError`,
`StreamError`, `RouterError` and `MiddlewareError`.

### Error Propagation

```typescript
import { AdapterError, NetworkError, ValidationError } from '@johnhenry/aimatey-errors';

try {
  const response = await bridge.chat(request);
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation errors - error.validationDetails has the per-field detail
  } else if (error instanceof NetworkError) {
    // Handle network errors
  } else if (error instanceof AdapterError) {
    // Anything else the library threw - switch on error.code
  } else {
    // Handle unknown errors
  }
}
```

## Performance Considerations

### Async Iterator Efficiency

Streams use async generators for efficient memory usage:

```typescript
async *chatStream(request) {
  // Chunks are processed one at a time
  // No buffering of entire response
  for await (const chunk of providerStream) {
    yield processChunk(chunk);
  }
}
```

### Middleware Performance

Middleware executes sequentially. Keep middleware fast:

```typescript
// ✅ Good - fast synchronous operation
const good: Middleware = async (context, next) => {
  const start = Date.now();
  const response = await next();
  console.log('Duration:', Date.now() - start);
  return response;
};

// ❌ Bad - slow blocking operation
const bad: Middleware = async (context, next) => {
  await heavyComputation(); // Blocks all requests!
  return next();
};
```

## Testing Architecture

### Mock Adapters

```typescript
export class MockBackendAdapter implements BackendAdapter {
  name = 'mock';
  private responses = new Map<string, any>();

  setResponse(key: string, response: any) {
    this.responses.set(key, response);
  }

  async chat(request: IRChatRequest) {
    const key = JSON.stringify(request.messages);
    return this.responses.get(key) || this.defaultResponse();
  }
}
```

### Integration Tests

```typescript
describe('OpenAI → Anthropic Integration', () => {
  it('should work end-to-end', async () => {
    const bridge = new Bridge(
      new OpenAIFrontendAdapter(),
      new AnthropicBackendAdapter({ apiKey })
    );

    const response = await bridge.chat({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    });

    expect(response.choices[0].message.content).toBeTruthy();
  });
});
```

## Design Patterns Used

1. **Adapter Pattern**: Frontend/backend adapters
2. **Chain of Responsibility**: Middleware execution
3. **Strategy Pattern**: Routing strategies
4. **Factory Pattern**: Middleware creators
5. **Observer Pattern**: Router events
6. **Iterator Pattern**: Streaming with async generators

## Next Steps

- [Development Guide](/aimatey/contributing/development) - Set up your environment
- [Contributing Guide](/aimatey/contributing) - Make your first contribution

---

**Understanding the architecture helps you contribute effectively!** 🏗️
