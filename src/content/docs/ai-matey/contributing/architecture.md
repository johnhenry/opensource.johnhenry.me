---
title: "Architecture Guide"
---

Deep dive into ai.matey's architecture, design patterns, and implementation details.

## Core Concepts

### The Universal Adapter Pattern

ai.matey uses the **Adapter Pattern** to provide a universal interface for AI APIs:

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
  content: string | IRContent[];
  name?: string;
  tool_calls?: IRToolCall[];
  tool_call_id?: string;
}
```

### IR Request Format

```typescript
interface IRChatCompletionRequest {
  model: string;
  messages: IRMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  stop?: string | string[];
  tools?: IRTool[];
  metadata?: Record<string, unknown>;
}
```

### IR Response Format

```typescript
interface IRChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: IRChoice[];
  usage?: IRUsage;
  metadata?: Record<string, unknown>;
}
```

## Frontend Adapters

Frontend adapters translate from a specific API format to IR.

### Interface

```typescript
interface FrontendAdapter {
  name: string;

  // Convert frontend format → IR
  toIR(request: FrontendRequest): IRChatCompletionRequest;

  // Convert IR → frontend format
  fromIR(response: IRChatCompletionResponse): FrontendResponse;

  // Streaming support (optional)
  fromIRStream?(
    stream: AsyncIterable<IRChatCompletionChunk>
  ): AsyncIterable<FrontendChunk>;
}
```

### Implementation Example

```typescript
export class OpenAIFrontendAdapter implements FrontendAdapter {
  name = 'openai';

  toIR(request: OpenAIChatRequest): IRChatCompletionRequest {
    return {
      model: request.model,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      // ... map all fields
    };
  }

  fromIR(response: IRChatCompletionResponse): OpenAIChatResponse {
    return {
      id: response.id,
      object: 'chat.completion',
      created: response.created,
      model: response.model,
      choices: response.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content
        },
        finish_reason: choice.finish_reason
      })),
      usage: response.usage
    };
  }
}
```

## Backend Adapters

Backend adapters translate from IR to provider-specific API calls.

### Interface

```typescript
interface BackendAdapter {
  name: string;

  // Execute non-streaming request
  chat(request: IRChatCompletionRequest): Promise<IRChatCompletionResponse>;

  // Execute streaming request
  chatStream(
    request: IRChatCompletionRequest
  ): AsyncIterable<IRChatCompletionChunk>;

  // Health check (optional)
  healthCheck?(): Promise<boolean>;

  // Capabilities (optional)
  capabilities?: IRCapabilities;
}
```

### Implementation Example

```typescript
export class AnthropicBackendAdapter implements BackendAdapter {
  name = 'anthropic';
  private client: Anthropic;

  constructor(options: AnthropicOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
  }

  async chat(request: IRChatCompletionRequest): Promise<IRChatCompletionResponse> {
    // Convert IR → Anthropic format
    const anthropicRequest = this.toAnthropicFormat(request);

    // Make API call
    const anthropicResponse = await this.client.messages.create(anthropicRequest);

    // Convert Anthropic format → IR
    return this.toIRFormat(anthropicResponse);
  }

  async *chatStream(request: IRChatCompletionRequest) {
    const anthropicRequest = this.toAnthropicFormat(request);

    const stream = await this.client.messages.create({
      ...anthropicRequest,
      stream: true
    });

    for await (const chunk of stream) {
      yield this.chunkToIR(chunk);
    }
  }

  private toAnthropicFormat(request: IRChatCompletionRequest): MessageCreateParams {
    // Extract system message (separate in Anthropic)
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const system = systemMessages.map(m => m.content).join('\n');

    return {
      model: this.mapModel(request.model),
      max_tokens: request.max_tokens || 1024,
      messages: request.messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        })),
      system: system || undefined,
      temperature: request.temperature,
      top_p: request.top_p,
      stop_sequences: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined
    };
  }

  private toIRFormat(response: Message): IRChatCompletionResponse {
    return {
      id: response.id,
      object: 'chat.completion',
      created: Date.now(),
      model: response.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response.content[0].type === 'text' ? response.content[0].text : ''
        },
        finish_reason: response.stop_reason === 'end_turn' ? 'stop' : response.stop_reason
      }],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens
      }
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
    private frontendAdapter: FrontendAdapter,
    private backendAdapter: BackendAdapter
  ) {}

  async chat(request: any): Promise<any> {
    // 1. Convert frontend format → IR
    const irRequest = this.frontendAdapter.toIR(request);

    // 2. Execute middleware chain
    const irResponse = await this.executeMiddleware(irRequest);

    // 3. Convert IR → frontend format
    return this.frontendAdapter.fromIR(irResponse);
  }

  private async executeMiddleware(
    request: IRChatCompletionRequest
  ): Promise<IRChatCompletionResponse> {
    // Build middleware chain
    const execute = this.middleware.reduceRight(
      (next, middleware) => {
        return async (req: IRChatCompletionRequest) => {
          return middleware.execute(req, next);
        };
      },
      // Final handler: call backend
      async (req: IRChatCompletionRequest) => {
        return this.backendAdapter.chat(req);
      }
    );

    return execute(request);
  }

  use(middleware: Middleware) {
    this.middleware.push(middleware);
  }
}
```

## Router Architecture

The Router extends Bridge to support multiple backends.

### Core Implementation

```typescript
export class Router extends Bridge {
  private backends: BackendAdapter[];
  private strategy: RoutingStrategy;
  private currentIndex = 0;

  constructor(
    frontendAdapter: FrontendAdapter,
    options: RouterOptions
  ) {
    // Router doesn't have a single backend
    super(frontendAdapter, options.backends[0]);

    this.backends = options.backends;
    this.strategy = options.strategy;
  }

  protected async executeBackend(
    request: IRChatCompletionRequest
  ): Promise<IRChatCompletionResponse> {
    // Select backend based on strategy
    const backendIndex = this.selectBackend(request);
    const backend = this.backends[backendIndex];

    try {
      return await backend.chat(request);
    } catch (error) {
      // Fallback to next backend if configured
      if (this.options.fallbackOnError && backendIndex < this.backends.length - 1) {
        this.emit('backend:failed', { backend: backend.name, error });
        return this.executeBackend(request); // Recursive fallback
      }
      throw error;
    }
  }

  private selectBackend(request: IRChatCompletionRequest): number {
    switch (this.strategy) {
      case 'round-robin':
        const index = this.currentIndex;
        this.currentIndex = (this.currentIndex + 1) % this.backends.length;
        return index;

      case 'priority':
        return 0; // Always use first (will fallback if it fails)

      case 'random':
        return Math.floor(Math.random() * this.backends.length);

      case 'custom':
        return this.options.customStrategy(request, this.backends);

      default:
        return 0;
    }
  }
}
```

## Middleware System

Middleware intercepts requests/responses using the **Chain of Responsibility** pattern.

### Middleware Interface

```typescript
interface Middleware {
  name: string;
  execute(
    request: IRChatCompletionRequest,
    next: (request: IRChatCompletionRequest) => Promise<IRChatCompletionResponse>
  ): Promise<IRChatCompletionResponse>;
}
```

### Implementation Example

```typescript
export function createLoggingMiddleware(options: LoggingOptions): Middleware {
  return {
    name: 'logging',
    async execute(request, next) {
      const start = Date.now();

      console.log('[INFO] Request:', {
        model: request.model,
        messages: request.messages.length
      });

      try {
        const response = await next(request);

        console.log('[INFO] Response:', {
          duration: Date.now() - start,
          tokens: response.usage?.total_tokens
        });

        return response;
      } catch (error) {
        console.error('[ERROR]', error.message);
        throw error;
      }
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
async *chatStream(request: IRChatCompletionRequest) {
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
const stream = await bridge.chatStream(request);

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
├── ir-request.ts       # IRChatCompletionRequest
├── ir-response.ts      # IRChatCompletionResponse
├── ir-chunk.ts         # IRChatCompletionChunk
├── ir-message.ts       # IRMessage, IRContent
├── ir-tool.ts          # IRTool, IRToolCall
├── frontend.ts         # FrontendAdapter interface
├── backend.ts          # BackendAdapter interface
└── middleware.ts       # Middleware interface
```

### Type Safety

All conversions are type-safe:

```typescript
// Frontend adapter
toIR(request: OpenAIChatRequest): IRChatCompletionRequest {
  // TypeScript ensures all required IR fields are present
}

// Backend adapter
chat(request: IRChatCompletionRequest): Promise<IRChatCompletionResponse> {
  // TypeScript ensures correct IR types
}
```

## Error Handling

### Error Hierarchy

```typescript
export class BridgeError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

// Specific error types
export class ValidationError extends BridgeError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

export class NetworkError extends BridgeError {
  constructor(message: string, details?: unknown) {
    super(message, 'NETWORK_ERROR', details);
  }
}
```

### Error Propagation

```typescript
try {
  const response = await bridge.chat(request);
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation errors
  } else if (error instanceof NetworkError) {
    // Handle network errors
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
async execute(request, next) {
  const start = Date.now();
  const response = await next(request);
  console.log('Duration:', Date.now() - start);
  return response;
}

// ❌ Bad - slow blocking operation
async execute(request, next) {
  await heavyComputation(); // Blocks all requests!
  return next(request);
}
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

  async chat(request: IRChatCompletionRequest) {
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

- [Development Guide](/ai-matey/contributing/development) - Set up your environment
- [Contributing Guide](/ai-matey/contributing) - Make your first contribution

---

**Understanding the architecture helps you contribute effectively!** 🏗️
