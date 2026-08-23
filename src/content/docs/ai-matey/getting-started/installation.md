---
title: "Installation"
---

Get ai.matey up and running in 2 minutes.

## Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** 9.0.0 or higher (or yarn/pnpm)
- **TypeScript** 5.0+ (optional but recommended)

## Quick Install

Install the main package to get started quickly:

```bash
npm install ai.matey
```

This installs the umbrella package which includes commonly-used adapters and utilities.

## Package-Specific Installation

For more control over bundle size, install only the packages you need:

### Core Packages

```bash
# Essential packages
npm install ai.matey.core        # Bridge, Router, Middleware
npm install ai.matey.types       # TypeScript type definitions
npm install ai.matey.errors      # Error classes and utilities
npm install ai.matey.utils       # Shared utility functions
```

### Frontend Adapters

Choose the input format you want to use:

```bash
npm install ai.matey.frontend    # All frontend adapters

# Or install individually:
npm install ai.matey.frontend/openai      # OpenAI format
npm install ai.matey.frontend/anthropic   # Anthropic format
npm install ai.matey.frontend/gemini      # Google Gemini format
npm install ai.matey.frontend/mistral     # Mistral format
```

### Backend Adapters

Choose which AI providers you want to support:

```bash
npm install ai.matey.backend     # All backend adapters (24 providers)

# Or install individually for smaller bundle:
npm install ai.matey.backend/openai       # OpenAI
npm install ai.matey.backend/anthropic    # Anthropic (Claude)
npm install ai.matey.backend/gemini       # Google Gemini
npm install ai.matey.backend/ollama       # Ollama (local)
npm install ai.matey.backend/groq         # Groq (fast inference)
```

<details>
<summary><strong>All 24 Backend Providers</strong></summary>

```bash
# Cloud Providers
npm install ai.matey.backend/openai
npm install ai.matey.backend/anthropic
npm install ai.matey.backend/gemini
npm install ai.matey.backend/mistral
npm install ai.matey.backend/cohere
npm install ai.matey.backend/groq
npm install ai.matey.backend/ai21
npm install ai.matey.backend/anyscale
npm install ai.matey.backend/aws-bedrock
npm install ai.matey.backend/azure-openai
npm install ai.matey.backend/cerebras
npm install ai.matey.backend/cloudflare
npm install ai.matey.backend/deepinfra
npm install ai.matey.backend/deepseek
npm install ai.matey.backend/fireworks
npm install ai.matey.backend/huggingface
npm install ai.matey.backend/nvidia
npm install ai.matey.backend/openrouter
npm install ai.matey.backend/perplexity
npm install ai.matey.backend/replicate
npm install ai.matey.backend/together
npm install ai.matey.backend/xai

# Local/Self-Hosted
npm install ai.matey.backend/ollama
npm install ai.matey.backend/lmstudio
```

</details>

### Optional Packages

```bash
# Middleware (logging, caching, retry, etc.)
npm install ai.matey.middleware

# HTTP server integration
npm install ai.matey.http        # Express, Fastify, Hono, Node.js http

# React hooks
npm install ai.matey.react.core
npm install ai.matey.react.hooks

# SDK wrappers (drop-in replacements)
npm install ai.matey.wrapper

# CLI tools
npm install ai.matey.cli

# Testing utilities
npm install ai.matey.testing
```

## Verify Installation

Create a simple test file to verify installation:

```typescript
// test.ts
import { Bridge } from 'ai.matey.core';
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { OpenAIBackendAdapter } from 'ai.matey.backend/openai';

console.log('ai.matey installed successfully!');

const bridge = new Bridge(
  new OpenAIFrontendAdapter(),
  new OpenAIBackendAdapter({ apiKey: 'test-key' })
);

console.log('Bridge created:', bridge ? '✓' : '✗');
```

Run it:

```bash
npx tsx test.ts
# Should output: ai.matey installed successfully!
#                Bridge created: ✓
```

## Environment Setup

### 1. Create Environment File

Create a `.env` file in your project root:

```bash
# .env

# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
GOOGLE_API_KEY=...

# Other providers (as needed)
DEEPSEEK_API_KEY=...
GROQ_API_KEY=...
MISTRAL_API_KEY=...
HUGGINGFACE_API_KEY=...

# Local models (optional)
OLLAMA_BASE_URL=http://localhost:11434
LMSTUDIO_BASE_URL=http://localhost:1234
```

### 2. Load Environment Variables

#### Node.js

```bash
npm install dotenv
```

```typescript
import 'dotenv/config';

const apiKey = process.env.ANTHROPIC_API_KEY;
```

#### TypeScript with Vite/Vitest

Environment variables are loaded automatically from `.env` files.

```typescript
const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
```

## TypeScript Configuration

For optimal TypeScript support, configure your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  }
}
```

## Installation by Use Case

### For Chat Applications

```bash
npm install ai.matey.core \
            ai.matey.frontend/openai \
            ai.matey.backend/anthropic \
            ai.matey.middleware
```

### For HTTP APIs

```bash
npm install ai.matey.core \
            ai.matey.frontend/openai \
            ai.matey.backend \
            ai.matey.http
```

### For React Apps

```bash
npm install ai.matey.core \
            ai.matey.frontend/openai \
            ai.matey.backend/openai \
            ai.matey.react.core \
            ai.matey.react.hooks
```

### For Local Development

```bash
npm install ai.matey.core \
            ai.matey.frontend/openai \
            ai.matey.backend/ollama
```

Then install and run [Ollama](https://ollama.ai):

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama3.2

# Ollama server runs on http://localhost:11434
```

## Troubleshooting

### Module Not Found Error

```
Error: Cannot find module 'ai.matey.core'
```

**Solution:** Ensure you've installed the package:
```bash
npm install ai.matey.core
```

### Type Errors in TypeScript

```
Could not find a declaration file for module 'ai.matey.core'
```

**Solution:** Install type definitions:
```bash
npm install ai.matey.types
```

### ESM vs CommonJS Issues

ai.matey is an **ES Module (ESM)** package. If you're using CommonJS:

**package.json:**
```json
{
  "type": "module"
}
```

Or use `.mjs` file extensions.

### Import Path Issues

Use **full import paths** including the adapter name:

✅ **Correct:**
```typescript
import { OpenAIFrontendAdapter } from 'ai.matey.frontend/openai';
import { AnthropicBackendAdapter } from 'ai.matey.backend/anthropic';
```

❌ **Incorrect:**
```typescript
import { OpenAIFrontendAdapter } from 'ai.matey.frontend';
```

## Next Steps

- **[Quick Start](/ai-matey/getting-started/quick-start)** - Build your first bridge
- **[Core Concepts](/ai-matey/getting-started/core-concepts)** - Understand the architecture
- **[Your First Bridge](/ai-matey/getting-started/your-first-bridge)** - Step-by-step tutorial
- **[Examples](https://github.com/johnhenry/ai.matey/tree/main/packages/ai.matey.docs/examples)** - Explore working code

## Package Versions

All ai.matey packages use synchronized versioning. Install matching versions:

```bash
# Good (matching versions)
ai.matey.core@0.2.0
ai.matey.frontend@0.2.0
ai.matey.backend@0.2.0

# Avoid (mismatched versions)
ai.matey.core@0.2.0
ai.matey.frontend@0.1.5
```

Check the latest version on [npm](https://www.npmjs.com/package/ai.matey).
