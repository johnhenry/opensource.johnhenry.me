---
title: "Errors API"
---

Complete error handling reference for ai.matey.

## Error Hierarchy

```
Error
└── AIMateyError (base)
    ├── BackendError
    │   ├── RateLimitError
    │   ├── AuthenticationError
    │   ├── InvalidRequestError
    │   ├── TimeoutError
    │   └── ServiceUnavailableError
    ├── ValidationError
    ├── AdapterError
    ├── MiddlewareError
    ├── RoutingError
    └── ConfigurationError
```

---

## Base Error

### `AIMateyError`

Base class for all ai.matey errors.

```typescript
class AIMateyError extends Error {
  /** Error name */
  name: string;

  /** Error message */
  message: string;

  /** Error code */
  code: string;

  /** Original error (if wrapped) */
  cause?: Error;

  /** Additional context */
  context?: Record<string, any>;

  /** Stack trace */
  stack?: string;
}
```

**Example:**

```typescript
try {
  await bridge.chat({ ... });
} catch (error) {
  if (error instanceof AIMateyError) {
    console.log('AI Matey error:', error.code);
    console.log('Context:', error.context);
  }
}
```

---

## Backend Errors

### `BackendError`

Base class for backend-related errors.

```typescript
class BackendError extends AIMateyError {
  /** Backend adapter name */
  backend: string;

  /** HTTP status code (if applicable) */
  statusCode?: number;

  /** Response body */
  responseBody?: any;

  /** Request that caused the error */
  request?: IRChatCompletionRequest;
}
```

**Example:**

```typescript
try {
  await bridge.chat({ ... });
} catch (error) {
  if (error instanceof BackendError) {
    console.log('Backend:', error.backend);
    console.log('Status:', error.statusCode);
    console.log('Response:', error.responseBody);
  }
}
```

---

### `RateLimitError`

Thrown when rate limit is exceeded.

```typescript
class RateLimitError extends BackendError {
  code = 'RATE_LIMIT_EXCEEDED';

  /** Retry after (seconds) */
  retryAfter?: number;

  /** Limit details */
  limit?: {
    requests: number;
    period: string;
    remaining: number;
  };
}
```

**Example:**

```typescript
try {
  await bridge.chat({ ... });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limit exceeded. Retry after ${error.retryAfter}s`);
    console.log(`Limit: ${error.limit.requests} requests per ${error.limit.period}`);

    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, error.retryAfter * 1000));
    await bridge.chat({ ... });
  }
}
```

---

### `AuthenticationError`

Thrown when API key is invalid or missing.

```typescript
class AuthenticationError extends BackendError {
  code = 'AUTHENTICATION_FAILED';

  /** Authentication type */
  authType: 'api_key' | 'bearer_token' | 'oauth';
}
```

**Example:**

```typescript
try {
  await bridge.chat({ ... });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key for:', error.backend);
    console.error('Auth type:', error.authType);

    // Prompt for new API key
    const newKey = await promptForApiKey();
    bridge.setBackend(new AnthropicBackendAdapter({ apiKey: newKey }));
  }
}
```

---

### `InvalidRequestError`

Thrown when request is malformed or invalid.

```typescript
class InvalidRequestError extends BackendError {
  code = 'INVALID_REQUEST';

  /** Validation errors */
  errors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}
```

**Example:**

```typescript
try {
  await bridge.chat({ model: null }); // Invalid
} catch (error) {
  if (error instanceof InvalidRequestError) {
    console.error('Invalid request:', error.message);
    error.errors?.forEach(err => {
      console.error(`  ${err.field}: ${err.message}`);
    });
  }
}
```

---

### `TimeoutError`

Thrown when request exceeds timeout.

```typescript
class TimeoutError extends BackendError {
  code = 'TIMEOUT';

  /** Timeout duration (ms) */
  timeout: number;

  /** Elapsed time (ms) */
  elapsed: number;
}
```

**Example:**

```typescript
const bridge = new Bridge(frontend, backend, { timeout: 5000 });

try {
  await bridge.chat({ ... });
} catch (error) {
  if (error instanceof TimeoutError) {
    console.error(`Request timed out after ${error.timeout}ms`);

    // Retry with longer timeout
    bridge.options.timeout = 10000;
    await bridge.chat({ ... });
  }
}
```

---

### `ServiceUnavailableError`

Thrown when backend service is down or unavailable.

```typescript
class ServiceUnavailableError extends BackendError {
  code = 'SERVICE_UNAVAILABLE';

  /** Expected recovery time */
  retryAfter?: number;
}
```

**Example:**

```typescript
try {
  await bridge.chat({ ... });
} catch (error) {
  if (error instanceof ServiceUnavailableError) {
    console.error(`${error.backend} is unavailable`);

    // Try fallback backend
    bridge.setBackend(fallbackBackend);
    await bridge.chat({ ... });
  }
}
```

---

## Validation Errors

### `ValidationError`

Thrown when request or response validation fails.

```typescript
class ValidationError extends AIMateyError {
  code = 'VALIDATION_FAILED';

  /** Field that failed validation */
  field?: string;

  /** Validation errors */
  errors: Array<{
    path: string;
    message: string;
    value?: any;
  }>;

  /** Schema that failed */
  schema?: any;
}
```

**Example:**

```typescript
try {
  await bridge.chat({
    model: 'gpt-4',
    messages: [] // Empty messages - invalid
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:');
    error.errors.forEach(err => {
      console.error(`  ${err.path}: ${err.message}`);
    });
  }
}
```

---

## Adapter Errors

### `AdapterError`

Thrown when adapter encounters an error.

```typescript
class AdapterError extends AIMateyError {
  code = 'ADAPTER_ERROR';

  /** Adapter name */
  adapter: string;

  /** Adapter type */
  adapterType: 'frontend' | 'backend';
}
```

**Example:**

```typescript
try {
  await bridge.chat({ ... });
} catch (error) {
  if (error instanceof AdapterError) {
    console.error(`${error.adapterType} adapter "${error.adapter}" failed`);
  }
}
```

---

## Middleware Errors

### `MiddlewareError`

Thrown when middleware encounters an error.

```typescript
class MiddlewareError extends AIMateyError {
  code = 'MIDDLEWARE_ERROR';

  /** Middleware name */
  middleware: string;

  /** Phase where error occurred */
  phase: 'onRequest' | 'onResponse' | 'onError' | 'onStreamChunk';
}
```

**Example:**

```typescript
try {
  await bridge.chat({ ... });
} catch (error) {
  if (error instanceof MiddlewareError) {
    console.error(`Middleware "${error.middleware}" failed in ${error.phase}`);
  }
}
```

---

## Routing Errors

### `RoutingError`

Thrown when router encounters an error.

```typescript
class RoutingError extends AIMateyError {
  code = 'ROUTING_ERROR';

  /** Current strategy */
  strategy: string;

  /** Available backends */
  backends: string[];
}
```

**Example:**

```typescript
try {
  await router.chat({ ... });
} catch (error) {
  if (error instanceof RoutingError) {
    console.error(`Routing failed with strategy: ${error.strategy}`);
    console.error(`Available backends: ${error.backends.join(', ')}`);
  }
}
```

---

### `AllBackendsFailedError`

Thrown when all backends fail.

```typescript
class AllBackendsFailedError extends RoutingError {
  code = 'ALL_BACKENDS_FAILED';

  /** Individual backend failures */
  failures: Array<{
    backend: string;
    error: Error;
  }>;
}
```

**Example:**

```typescript
try {
  await router.chat({ ... });
} catch (error) {
  if (error instanceof AllBackendsFailedError) {
    console.error('All backends failed:');
    error.failures.forEach(({ backend, error }) => {
      console.error(`  ${backend}: ${error.message}`);
    });
  }
}
```

---

## Configuration Errors

### `ConfigurationError`

Thrown when configuration is invalid.

```typescript
class ConfigurationError extends AIMateyError {
  code = 'INVALID_CONFIGURATION';

  /** Configuration field */
  field?: string;

  /** Expected value/type */
  expected?: string;

  /** Actual value */
  actual?: any;
}
```

**Example:**

```typescript
try {
  const bridge = new Bridge(null, backend); // Invalid
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(`Invalid config: ${error.field}`);
    console.error(`Expected: ${error.expected}`);
    console.error(`Got: ${error.actual}`);
  }
}
```

---

## Error Handling Patterns

### Try-Catch

Basic error handling:

```typescript
try {
  const response = await bridge.chat({ ... });
} catch (error) {
  if (error instanceof RateLimitError) {
    // Handle rate limit
    await sleep(error.retryAfter * 1000);
  } else if (error instanceof AuthenticationError) {
    // Handle auth error
    console.error('Invalid API key');
  } else {
    // Handle other errors
    console.error('Unexpected error:', error);
  }
}
```

---

### Error Handler Middleware

Global error handling:

```typescript
function createErrorHandlerMiddleware() {
  return {
    name: 'error-handler',

    async onError(error: Error) {
      if (error instanceof RateLimitError) {
        console.log('Rate limit exceeded, waiting...');
        await sleep(error.retryAfter * 1000);
        return; // Retry
      }

      if (error instanceof AuthenticationError) {
        console.error('Auth failed:', error.backend);
        // Send alert
        await sendAlert('Authentication failed');
      }

      // Re-throw to propagate
      return error;
    }
  };
}

bridge.use(createErrorHandlerMiddleware());
```

---

### Bridge Error Events

Listen to error events:

```typescript
bridge.on('error', (error) => {
  if (error instanceof BackendError) {
    console.error(`Backend ${error.backend} failed`);
    console.error(`Status: ${error.statusCode}`);

    // Log to monitoring service
    logToSentry(error);
  }
});
```

---

### Router Failover

Automatic failover on errors:

```typescript
const router = new Router(frontend, {
  backends: [primaryBackend, fallbackBackend],
  strategy: 'priority',
  fallbackOnError: true
});

router.on('backend:failed', ({ backend, error }) => {
  console.error(`❌ ${backend} failed: ${error.message}`);
});

router.on('backend:switch', ({ from, to, reason }) => {
  console.log(`🔄 Switched from ${from} to ${to}: ${reason}`);
});

// Automatically uses fallback on error
const response = await router.chat({ ... });
```

---

### Retry Logic

Retry on specific errors:

```typescript
import { createRetryMiddleware } from 'ai.matey.middleware';

bridge.use(createRetryMiddleware({
  maxAttempts: 3,
  initialDelay: 1000,
  shouldRetry: (error, attempt) => {
    // Retry on rate limits and timeouts
    if (error instanceof RateLimitError) return true;
    if (error instanceof TimeoutError) return true;

    // Don't retry on auth errors
    if (error instanceof AuthenticationError) return false;

    // Retry up to 2 times for other errors
    return attempt < 2;
  }
}));
```

---

### Error Logging

Comprehensive error logging:

```typescript
function logError(error: Error) {
  const logData = {
    timestamp: new Date().toISOString(),
    name: error.name,
    message: error.message,
    stack: error.stack
  };

  if (error instanceof AIMateyError) {
    logData.code = error.code;
    logData.context = error.context;
  }

  if (error instanceof BackendError) {
    logData.backend = error.backend;
    logData.statusCode = error.statusCode;
  }

  console.error(JSON.stringify(logData, null, 2));

  // Send to logging service
  sendToLogService(logData);
}

try {
  await bridge.chat({ ... });
} catch (error) {
  logError(error);
}
```

---

## Error Codes Reference

| Code | Error Class | Description |
|------|------------|-------------|
| `RATE_LIMIT_EXCEEDED` | RateLimitError | API rate limit exceeded |
| `AUTHENTICATION_FAILED` | AuthenticationError | Invalid API key or token |
| `INVALID_REQUEST` | InvalidRequestError | Malformed request |
| `TIMEOUT` | TimeoutError | Request timeout |
| `SERVICE_UNAVAILABLE` | ServiceUnavailableError | Backend unavailable |
| `VALIDATION_FAILED` | ValidationError | Request/response validation failed |
| `ADAPTER_ERROR` | AdapterError | Adapter failure |
| `MIDDLEWARE_ERROR` | MiddlewareError | Middleware failure |
| `ROUTING_ERROR` | RoutingError | Routing failure |
| `ALL_BACKENDS_FAILED` | AllBackendsFailedError | All backends failed |
| `INVALID_CONFIGURATION` | ConfigurationError | Invalid configuration |

---

## Best Practices

### 1. Always Handle Errors

```typescript
// ✅ Good
try {
  const response = await bridge.chat({ ... });
} catch (error) {
  console.error('Error:', error);
}

// ❌ Bad
const response = await bridge.chat({ ... }); // Unhandled errors
```

---

### 2. Use Specific Error Types

```typescript
// ✅ Good
catch (error) {
  if (error instanceof RateLimitError) {
    // Handle rate limit specifically
  } else if (error instanceof AuthenticationError) {
    // Handle auth error specifically
  }
}

// ❌ Bad
catch (error) {
  console.log('Something went wrong'); // Too generic
}
```

---

### 3. Log Error Context

```typescript
// ✅ Good
catch (error) {
  if (error instanceof BackendError) {
    console.log('Backend:', error.backend);
    console.log('Status:', error.statusCode);
    console.log('Request:', error.request);
  }
}

// ❌ Bad
catch (error) {
  console.log(error.message); // Missing context
}
```

---

### 4. Implement Graceful Degradation

```typescript
// ✅ Good
try {
  return await primaryService.chat({ ... });
} catch (error) {
  if (error instanceof ServiceUnavailableError) {
    return await fallbackService.chat({ ... });
  }
  throw error;
}

// ❌ Bad
try {
  return await primaryService.chat({ ... });
} catch (error) {
  throw error; // No fallback
}
```

---

## See Also

- [Bridge API](/ai-matey/api/bridge) - Bridge error handling
- [Router API](/ai-matey/api/router) - Router error handling
- [Middleware API](/ai-matey/api/middleware) - Middleware error handling
- [Testing Guide](/ai-matey/guides/testing) - Testing error scenarios
