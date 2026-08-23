---
title: "Types API"
---

Complete TypeScript type definitions for ai.matey.

## Core Types

### IRChatCompletionRequest

The universal request format (Intermediate Representation).

```typescript
interface IRChatCompletionRequest {
  /** Model identifier */
  model: string;

  /** Conversation messages */
  messages: IRMessage[];

  /** Sampling temperature (0-2, default: 1) */
  temperature?: number;

  /** Maximum tokens to generate */
  max_tokens?: number;

  /** Top-p sampling (0-1) */
  top_p?: number;

  /** Top-k sampling */
  top_k?: number;

  /** Frequency penalty (-2 to 2) */
  frequency_penalty?: number;

  /** Presence penalty (-2 to 2) */
  presence_penalty?: number;

  /** Stop sequences */
  stop?: string | string[];

  /** Enable streaming */
  stream?: boolean;

  /** Random seed for deterministic output */
  seed?: number;

  /** Response format */
  response_format?: {
    type: 'text' | 'json_object';
  };

  /** Tool/function definitions */
  tools?: IRTool[];

  /** Tool choice strategy */
  tool_choice?: 'none' | 'auto' | 'required' | IRToolChoice;

  /** User identifier for tracking */
  user?: string;

  /** Additional provider-specific parameters */
  [key: string]: any;
}
```

---

### IRChatCompletionResponse

The universal response format.

```typescript
interface IRChatCompletionResponse {
  /** Unique response identifier */
  id: string;

  /** Object type (always 'chat.completion') */
  object?: string;

  /** Creation timestamp */
  created?: number;

  /** Model used */
  model: string;

  /** Generated choices */
  choices: IRChoice[];

  /** Token usage statistics */
  usage?: IRUsage;

  /** System fingerprint */
  system_fingerprint?: string;
}
```

---

### IRChatCompletionChunk

Stream chunk format.

```typescript
interface IRChatCompletionChunk {
  /** Unique identifier */
  id: string;

  /** Object type (always 'chat.completion.chunk') */
  object?: string;

  /** Creation timestamp */
  created?: number;

  /** Model used */
  model: string;

  /** Delta choices */
  choices: IRChoiceDelta[];

  /** System fingerprint */
  system_fingerprint?: string;
}
```

---

### IRMessage

A single message in a conversation.

```typescript
interface IRMessage {
  /** Message role */
  role: 'system' | 'user' | 'assistant' | 'tool';

  /** Message content */
  content: string | IRContentPart[];

  /** Message name (optional) */
  name?: string;

  /** Tool calls (for assistant messages) */
  tool_calls?: IRToolCall[];

  /** Tool call ID (for tool messages) */
  tool_call_id?: string;
}
```

---

### IRContentPart

Multi-modal content part (text or image).

```typescript
type IRContentPart =
  | IRTextContentPart
  | IRImageContentPart;

interface IRTextContentPart {
  type: 'text';
  text: string;
}

interface IRImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}
```

---

### IRChoice

A completion choice.

```typescript
interface IRChoice {
  /** Choice index */
  index: number;

  /** Generated message */
  message: IRMessage;

  /** Finish reason */
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;

  /** Log probabilities */
  logprobs?: IRLogProbs;
}
```

---

### IRChoiceDelta

Stream delta choice.

```typescript
interface IRChoiceDelta {
  /** Choice index */
  index: number;

  /** Message delta */
  delta: IRMessageDelta;

  /** Finish reason (only on last chunk) */
  finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

interface IRMessageDelta {
  role?: 'assistant';
  content?: string;
  tool_calls?: IRToolCallDelta[];
}
```

---

### IRUsage

Token usage statistics.

```typescript
interface IRUsage {
  /** Tokens in prompt */
  prompt_tokens: number;

  /** Tokens in completion */
  completion_tokens: number;

  /** Total tokens */
  total_tokens: number;

  /** Prompt tokens details */
  prompt_tokens_details?: {
    cached_tokens?: number;
  };

  /** Completion tokens details */
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}
```

---

### IRTool

Tool/function definition.

```typescript
interface IRTool {
  type: 'function';
  function: IRFunction;
}

interface IRFunction {
  /** Function name */
  name: string;

  /** Function description */
  description?: string;

  /** Parameters schema (JSON Schema) */
  parameters?: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
```

---

### IRToolCall

A tool/function call.

```typescript
interface IRToolCall {
  /** Unique identifier */
  id: string;

  /** Type (always 'function') */
  type: 'function';

  /** Function details */
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

interface IRToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}
```

---

### IRToolChoice

Tool choice specification.

```typescript
interface IRToolChoice {
  type: 'function';
  function: {
    name: string;
  };
}
```

---

## Adapter Interfaces

### BackendAdapter

Interface for backend adapters.

```typescript
interface BackendAdapter {
  /** Adapter name */
  name: string;

  /** Execute a chat completion */
  execute(request: IRChatCompletionRequest): Promise<IRChatCompletionResponse>;

  /** Execute a streaming chat completion */
  executeStream(request: IRChatCompletionRequest): AsyncIterable<IRChatCompletionChunk>;

  /** Health check (optional) */
  checkHealth?(): Promise<boolean>;

  /** Get supported capabilities (optional) */
  getCapabilities?(): BackendCapabilities;
}
```

---

### FrontendAdapter

Interface for frontend adapters.

```typescript
interface FrontendAdapter {
  /** Adapter name */
  name: string;

  /** Parse input to IR format */
  parseRequest(input: any): IRChatCompletionRequest;

  /** Format IR response to output format */
  formatResponse(response: IRChatCompletionResponse): any;

  /** Format IR stream chunk to output format */
  formatStreamChunk?(chunk: IRChatCompletionChunk): any;

  /** Validate input (optional) */
  validateInput?(input: any): boolean;
}
```

---

### BackendCapabilities

Backend capabilities descriptor.

```typescript
interface BackendCapabilities {
  /** Streaming support */
  streaming: boolean;

  /** Tool/function calling support */
  tools: boolean;

  /** Vision/multimodal support */
  vision: boolean;

  /** JSON mode support */
  jsonMode: boolean;

  /** Maximum tokens */
  maxTokens: number;

  /** Context window size */
  contextWindow: number;

  /** Supported parameters */
  supportedParams: string[];
}
```

---

## Middleware Types

### Middleware

Middleware interface.

```typescript
interface Middleware {
  /** Middleware name */
  name: string;

  /** Process request before sending */
  onRequest?(request: IRChatCompletionRequest): Promise<IRChatCompletionRequest>;

  /** Process response after receiving */
  onResponse?(response: IRChatCompletionResponse): Promise<IRChatCompletionResponse>;

  /** Handle errors */
  onError?(error: Error): Promise<Error | void>;

  /** Process stream chunks */
  onStreamChunk?(chunk: IRChatCompletionChunk): Promise<IRChatCompletionChunk>;

  /** Cleanup function */
  cleanup?(): Promise<void>;
}
```

---

## Configuration Types

### BridgeOptions

Bridge configuration options.

```typescript
interface BridgeOptions {
  /** Request timeout (ms) */
  timeout?: number;

  /** Retry attempts */
  retryCount?: number;

  /** Retry delay (ms) */
  retryDelay?: number;

  /** Validate request */
  validateRequest?: boolean;

  /** Validate response */
  validateResponse?: boolean;

  /** Error handler */
  onError?: (error: Error) => void;
}
```

---

### RouterOptions

Router configuration options.

```typescript
interface RouterOptions {
  /** Backend adapters */
  backends: BackendAdapter[];

  /** Routing strategy */
  strategy: RoutingStrategy;

  /** Custom strategy function */
  customStrategy?: CustomStrategyFunction;

  /** Enable fallback on error */
  fallbackOnError?: boolean;

  /** Health check config */
  healthCheck?: HealthCheckOptions;

  /** Request timeout (ms) */
  timeout?: number;

  /** Weights for weighted strategy */
  weights?: number[];
}
```

---

### HealthCheckOptions

Health check configuration.

```typescript
interface HealthCheckOptions {
  /** Enable health checks */
  enabled: boolean;

  /** Check interval (ms) */
  interval: number;

  /** Check timeout (ms) */
  timeout: number;

  /** Consecutive failures before marking unhealthy */
  failureThreshold?: number;
}
```

---

### RoutingStrategy

Available routing strategies.

```typescript
type RoutingStrategy =
  | 'round-robin'
  | 'random'
  | 'priority'
  | 'weighted'
  | 'least-latency'
  | 'least-cost'
  | 'custom';
```

---

### CustomStrategyFunction

Custom routing strategy function.

```typescript
type CustomStrategyFunction = (
  request: IRChatCompletionRequest,
  backends: BackendAdapter[],
  health: BackendHealthMap
) => number | Promise<number>;
```

---

### BackendHealthMap

Backend health status map.

```typescript
interface BackendHealthMap {
  [backendName: string]: BackendHealth;
}

interface BackendHealth {
  /** Is backend healthy */
  healthy: boolean;

  /** Average latency (ms) */
  latency: number;

  /** Error rate (0-1) */
  errorRate: number;

  /** Last health check */
  lastCheck: Date;

  /** Consecutive failures */
  consecutiveFailures: number;
}
```

---

## Event Types

### BridgeEvent

Events emitted by Bridge.

```typescript
type BridgeEvent =
  | 'request'
  | 'response'
  | 'error'
  | 'stream:start'
  | 'stream:chunk'
  | 'stream:end';
```

---

### RouterEvent

Events emitted by Router.

```typescript
type RouterEvent =
  | 'backend:selected'
  | 'backend:failed'
  | 'backend:switch'
  | 'backend:health';
```

---

## Utility Types

### ModelMapping

Model name mapping.

```typescript
interface ModelMapping {
  /** Source model name */
  from: string;

  /** Target model name */
  to: string;

  /** Provider name */
  provider?: string;
}
```

---

### TokenEstimate

Token estimation result.

```typescript
interface TokenEstimate {
  /** Estimated prompt tokens */
  promptTokens: number;

  /** Estimated completion tokens */
  completionTokens: number;

  /** Total estimated tokens */
  totalTokens: number;
}
```

---

### CostEstimate

Cost estimation result.

```typescript
interface CostEstimate {
  /** Input cost (USD) */
  inputCost: number;

  /** Output cost (USD) */
  outputCost: number;

  /** Total cost (USD) */
  totalCost: number;

  /** Provider name */
  provider: string;

  /** Model name */
  model: string;
}
```

---

## Type Guards

### Type guard utilities

```typescript
/** Check if value is IRChatCompletionRequest */
function isIRChatCompletionRequest(value: any): value is IRChatCompletionRequest;

/** Check if value is IRChatCompletionResponse */
function isIRChatCompletionResponse(value: any): value is IRChatCompletionResponse;

/** Check if value is IRChatCompletionChunk */
function isIRChatCompletionChunk(value: any): value is IRChatCompletionChunk;

/** Check if adapter is BackendAdapter */
function isBackendAdapter(adapter: any): adapter is BackendAdapter;

/** Check if adapter is FrontendAdapter */
function isFrontendAdapter(adapter: any): adapter is FrontendAdapter;
```

---

## Import Examples

### Importing Types

```typescript
import type {
  IRChatCompletionRequest,
  IRChatCompletionResponse,
  IRChatCompletionChunk,
  IRMessage,
  IRChoice,
  BackendAdapter,
  FrontendAdapter,
  Middleware
} from 'ai.matey.types';
```

---

### Using Types

```typescript
import type { IRChatCompletionRequest, BackendAdapter } from 'ai.matey.types';

class MyBackend implements BackendAdapter {
  name = 'my-backend';

  async execute(request: IRChatCompletionRequest) {
    // Type-safe implementation
    const { model, messages, temperature } = request;
    // ...
  }

  async *executeStream(request: IRChatCompletionRequest) {
    // Type-safe streaming
    yield {
      id: 'chunk-1',
      model: request.model,
      choices: [{
        index: 0,
        delta: { content: 'Hello' },
        finish_reason: null
      }]
    };
  }
}
```

---

## See Also

- [Bridge API](/ai-matey/api/bridge) - Bridge class reference
- [Router API](/ai-matey/api/router) - Router class reference
- [Middleware API](/ai-matey/api/middleware) - Middleware reference
- [IR Format Guide](/ai-matey/guides/architecture/ir-format) - IR format deep dive
