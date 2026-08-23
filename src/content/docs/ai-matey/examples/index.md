---
title: "Examples Overview"
---

Explore **35+ runnable examples** demonstrating every feature of ai.matey, organized by complexity from beginner to advanced.

## 🎯 Quick Navigation

### By Skill Level

- **⭐ Beginner** → [01. Basics](#01-basics) | [02. Providers](#02-providers)
- **⭐⭐ Intermediate** → [03. Middleware](#03-middleware) | [04. Routing](#04-routing) | [05. HTTP Servers](#05-http-servers) | [06. SDK Wrappers](#06-sdk-wrappers)
- **⭐⭐⭐ Advanced** → [07. Advanced Patterns](#07-advanced-patterns) | [08. Observability](#08-observability)
- **🎯 Specialized** → [09. React](#09-react) | [10. CLI Tools](#10-cli-tools)

### By Feature

- **Getting Started** → [Basics](#01-basics)
- **Multiple Providers** → [Providers](#02-providers) | [Routing](#04-routing)
- **Performance** → [Middleware](#03-middleware)
- **Production** → [Advanced Patterns](#07-advanced-patterns)
- **Monitoring** → [Observability](#08-observability)

## 📂 All Examples

### 01. Basics

**Complexity:** ⭐ Beginner
**Time to complete:** 5-10 minutes each

Learn the fundamentals of ai.matey with these simple examples.

| Example | Description | Key Concepts |
|---------|-------------|--------------|
| [01-hello-world](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/01-basics/01-hello-world.ts) | Your first bridge | Bridge, Frontend, Backend |
| [02-streaming](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/01-basics/02-streaming.ts) | Real-time responses | Streaming, Async generators |
| [03-error-handling](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/01-basics/03-error-handling.ts) | Handle errors gracefully | Error handling, Validation |
| [04-reverse-bridge](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/01-basics/04-reverse-bridge.ts) | Swap frontend/backend | Adapter flexibility |

**Start here if:** You're new to ai.matey or want to understand core concepts.

---

### 02. Providers

**Complexity:** ⭐ Beginner
**Time to complete:** 5-10 minutes each

Work with different AI providers.

| Example | Description | Provider |
|---------|-------------|----------|
| [01-openai](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/02-providers/01-openai.ts) | OpenAI integration | OpenAI (GPT-4, GPT-3.5) |
| [02-anthropic](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/02-providers/02-anthropic.ts) | Anthropic Claude | Anthropic (Claude 3.5) |
| [03-gemini](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/02-providers/03-gemini.ts) | Google Gemini | Google (Gemini 1.5) |
| [04-local-ollama](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/02-providers/04-local-ollama.ts) | Local models | Ollama (Llama 3, Mistral) |
| [05-multi-provider](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/02-providers/05-multi-provider.ts) | Multiple providers | Router pattern |

**Start here if:** You want to understand provider-specific features.

---

### 03. Middleware

**Complexity:** ⭐⭐ Intermediate
**Time to complete:** 10-15 minutes each

Add powerful middleware to your pipelines.

| Example | Description | Performance |
|---------|-------------|-------------|
| [01-logging](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware/01-logging.ts) | Request/response logging | - |
| [02-caching](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware/02-caching.ts) | Response caching | 1000x+ speedup |
| [03-retry](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware/03-retry.ts) | Auto retry on failure | Improved reliability |
| [04-transform](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware/04-transform.ts) | Modify requests/responses | Custom behavior |
| [05-cost-tracking](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware/05-cost-tracking.ts) | Track API costs | Cost visibility |
| [06-middleware-stack](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware/06-middleware-stack.ts) | Compose middleware | &lt;10ms overhead |

**Start here if:** You need logging, caching, retry, or cost tracking.

---

### 04. Routing

**Complexity:** ⭐⭐ Intermediate
**Time to complete:** 15-20 minutes each

Intelligently route requests across providers.

| Example | Description | Use Case |
|---------|-------------|----------|
| [01-round-robin](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing/01-round-robin.ts) | Load balancing | Distribute load |
| [02-fallback](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing/02-fallback.ts) | Automatic failover | High availability |
| [03-complexity-based](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing/03-complexity-based.ts) | Route by query complexity | Cost optimization |
| [04-parallel-dispatch](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing/04-parallel-dispatch.ts) | Fan-out to multiple backends | Comparison/consensus |
| [05-cost-optimized](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing/05-cost-optimized.ts) | Choose cheapest provider | 84% cost savings |

**Start here if:** You need multi-provider routing or failover.

---

### 05. HTTP Servers

**Complexity:** ⭐⭐ Intermediate
**Time to complete:** 15-20 minutes each

Integrate with web frameworks.

| Example | Description | Framework |
|---------|-------------|-----------|
| [01-node-http](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/05-http-servers/01-node-http.ts) | Native Node.js HTTP | Node.js http |
| [02-express](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/05-http-servers/02-express.ts) | Express.js integration | Express |
| [03-hono](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/05-http-servers/03-hono.ts) | Edge-ready server | Hono |
| [04-streaming-http](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/05-http-servers/04-streaming-http.ts) | SSE streaming | Server-Sent Events |

**Start here if:** You're building an HTTP API.

---

### 06. SDK Wrappers

**Complexity:** ⭐⭐ Intermediate
**Time to complete:** 10-15 minutes each

Drop-in replacements for official SDKs.

| Example | Description | Compatibility |
|---------|-------------|---------------|
| [01-openai-sdk](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/06-sdk-wrappers/01-openai-sdk.ts) | OpenAI SDK wrapper | 100% compatible |
| [02-anthropic-sdk](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/06-sdk-wrappers/02-anthropic-sdk.ts) | Anthropic SDK wrapper | 100% compatible |
| [03-chrome-ai](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/06-sdk-wrappers/03-chrome-ai.ts) | Chrome AI compatibility | Chrome AI API |
| [04-wrapper-utils](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/06-sdk-wrappers/04-wrapper-utils.ts) | Stream utilities | 50+ functions |

**Start here if:** You want SDK compatibility.

---

### 07. Advanced Patterns

**Complexity:** ⭐⭐⭐ Advanced
**Time to complete:** 20-30 minutes each

Production-ready patterns for real-world applications.

| Example | Description | Performance |
|---------|-------------|-------------|
| [01-streaming-aggregation](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/01-streaming-aggregation.ts) | Parallel streaming | Real-time comparison |
| [02-websocket-chat](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/02-websocket-chat.ts) | WebSocket chat | Multi-client support |
| [03-batch-processing](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/03-batch-processing.ts) | Batch requests | 21+ req/s throughput |
| [04-health-monitoring](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/04-health-monitoring.ts) | Provider health checks | Real-time dashboard |
| [05-middleware-chain](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/05-middleware-chain.ts) | Complex middleware | Chain of Responsibility |

**Start here if:** You're building production systems.

---

### 08. Observability

**Complexity:** ⭐⭐⭐ Advanced
**Time to complete:** 20-30 minutes each

Monitor and trace your AI requests.

| Example | Description | Platform |
|---------|-------------|----------|
| [01-jaeger](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/08-observability/01-jaeger.ts) | OpenTelemetry + Jaeger | Local (Docker) |
| [02-honeycomb](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/08-observability/02-honeycomb.ts) | Honeycomb integration | SaaS |
| [03-sampling](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/08-observability/03-sampling.ts) | Sampling strategies | Configurable |
| [04-multi-provider](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/08-observability/04-multi-provider.ts) | Multi-provider tracing | All providers |

**Start here if:** You need monitoring and observability.

---

### 09. React

**Complexity:** 🎯 Specialized
**Time to complete:** 15-20 minutes

Frontend integration with React.

| Example | Description | Hooks |
|---------|-------------|-------|
| [01-hooks](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/09-react/01-hooks.ts) | React hooks | useChat, useCompletion, useObject |

**Start here if:** You're building React applications.

---

### 10. CLI Tools

**Complexity:** 🎯 Specialized
**Time to complete:** 10-15 minutes

Command-line utilities.

| Example | Description | Tools |
|---------|-------------|-------|
| [01-cli-basics](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/10-cli-tools/01-cli-basics.ts) | CLI tools | Format conversion, backend generation |

**Start here if:** You need CLI tooling.

---

## 🚀 Running Examples

### Prerequisites

```bash
# Install dependencies
cd /path/to/ai.matey
npm install
npm run build

# Set up API keys (create .env file)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

### Run Any Example

```bash
npx tsx examples/01-basics/01-hello-world.ts
npx tsx examples/03-middleware/01-logging.ts
npx tsx examples/07-advanced-patterns/01-streaming-aggregation.ts
```

## 📚 Learning Paths

### Beginner Path (Recommended for Newcomers)
1. [01-basics/01-hello-world](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/01-basics/01-hello-world.ts)
2. [01-basics/02-streaming](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/01-basics/02-streaming.ts)
3. [02-providers/01-openai](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/02-providers/01-openai.ts)
4. [02-providers/05-multi-provider](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/02-providers/05-multi-provider.ts)

### Intermediate Path
1. [03-middleware/01-logging](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware/01-logging.ts)
2. [03-middleware/02-caching](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/03-middleware/02-caching.ts)
3. [04-routing/01-round-robin](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing/01-round-robin.ts)
4. [05-http-servers/02-express](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/05-http-servers/02-express.ts)

### Advanced Path
1. [04-routing/05-cost-optimized](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/04-routing/05-cost-optimized.ts)
2. [07-advanced-patterns/01-streaming-aggregation](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/01-streaming-aggregation.ts)
3. [07-advanced-patterns/04-health-monitoring](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns/04-health-monitoring.ts)
4. [08-observability/01-jaeger](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/08-observability/01-jaeger.ts)

## 💡 Tips

- **Start Simple**: Begin with `01-hello-world` to understand the basics
- **Read Comments**: Every example has detailed inline comments
- **Experiment**: Modify examples to learn how they work
- **Use Shared Utils**: The `_shared/` directory has helpful utilities
- **Check Prerequisites**: Each example lists what you need to run it

## 🔗 Related Resources

- **[Getting Started](/ai-matey/getting-started/installation)** - Installation and setup
- **[API Reference](/ai-matey/api)** - Complete API documentation
- **[IR Format Guide](/ai-matey/guides/architecture/ir-format)** - In-depth guides
- **[Patterns](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/07-advanced-patterns)** - Production patterns

---

**Ready to start?** Jump to [Hello World](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples/01-basics/01-hello-world.ts) or explore examples by category above!
