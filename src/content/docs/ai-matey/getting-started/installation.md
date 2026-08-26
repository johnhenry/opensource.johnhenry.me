---
title: "Installation"
description: "Install the scoped @johnhenry/aimatey-* packages and set up API keys, TypeScript, and your environment."
---

Get ai.matey up and running in 2 minutes.

## Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** 9.0.0 or higher (or yarn/pnpm)
- **TypeScript** 5.0+ (optional but recommended)

## Quick Install

Install the main package to get started quickly:

```bash
npm install @johnhenry/aimatey
```

This installs the umbrella package which includes commonly-used adapters and utilities.

## Package-Specific Installation

For more control over bundle size, install only the packages you need:

### Core Packages

```bash
# Essential packages
npm install @johnhenry/aimatey-core        # Bridge, Router, Middleware
npm install @johnhenry/aimatey-types       # TypeScript type definitions
npm install @johnhenry/aimatey-errors      # Error classes and utilities
npm install @johnhenry/aimatey-utils       # Shared utility functions
```

### Frontend Adapters

Choose the input format you want to use:

```bash
npm install @johnhenry/aimatey-frontend    # All frontend adapters
```

Each format lives at its own import subpath, so bundlers only include what you import:

```typescript
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';       // OpenAI format
import { AnthropicFrontendAdapter } from '@johnhenry/aimatey-frontend/anthropic'; // Anthropic format
import { GeminiFrontendAdapter } from '@johnhenry/aimatey-frontend/gemini';       // Google Gemini format
import { MistralFrontendAdapter } from '@johnhenry/aimatey-frontend/mistral';     // Mistral format
```

### Backend Adapters

Choose which AI providers you want to support:

```bash
npm install @johnhenry/aimatey-backend     # All backend adapters, one package
```

Each provider lives at its own import subpath, so unused providers stay out of your bundle:

```typescript
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';       // OpenAI
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic'; // Anthropic (Claude)
import { GeminiBackendAdapter } from '@johnhenry/aimatey-backend/gemini';       // Google Gemini
import { OllamaBackendAdapter } from '@johnhenry/aimatey-backend/ollama';       // Ollama (local)
import { GroqBackendAdapter } from '@johnhenry/aimatey-backend/groq';           // Groq (fast inference)
```

<details>
<summary><strong>All backend provider subpaths</strong></summary>

```
# Cloud providers
@johnhenry/aimatey-backend/openai
@johnhenry/aimatey-backend/anthropic
@johnhenry/aimatey-backend/gemini
@johnhenry/aimatey-backend/mistral
@johnhenry/aimatey-backend/cohere
@johnhenry/aimatey-backend/groq
@johnhenry/aimatey-backend/ai21
@johnhenry/aimatey-backend/anyscale
@johnhenry/aimatey-backend/aws-bedrock
@johnhenry/aimatey-backend/azure-openai
@johnhenry/aimatey-backend/cerebras
@johnhenry/aimatey-backend/cloudflare
@johnhenry/aimatey-backend/dashscope
@johnhenry/aimatey-backend/deepinfra
@johnhenry/aimatey-backend/deepseek
@johnhenry/aimatey-backend/fireworks
@johnhenry/aimatey-backend/github-models
@johnhenry/aimatey-backend/huggingface
@johnhenry/aimatey-backend/inception
@johnhenry/aimatey-backend/moonshot
@johnhenry/aimatey-backend/nvidia
@johnhenry/aimatey-backend/omniroute
@johnhenry/aimatey-backend/openrouter
@johnhenry/aimatey-backend/perplexity
@johnhenry/aimatey-backend/replicate
@johnhenry/aimatey-backend/sambanova
@johnhenry/aimatey-backend/together-ai
@johnhenry/aimatey-backend/xai

# Local/Self-Hosted
@johnhenry/aimatey-backend/ollama
@johnhenry/aimatey-backend/lmstudio
```

</details>

### Optional Packages

```bash
# Middleware (logging, caching, retry, etc.)
npm install @johnhenry/aimatey-middleware

# HTTP server integration
npm install @johnhenry/aimatey-http        # Express, Fastify, Hono, Node.js http

# React hooks
npm install @johnhenry/aimatey-react-core
npm install @johnhenry/aimatey-react-hooks

# SDK wrappers (drop-in replacements)
npm install @johnhenry/aimatey-wrapper

# CLI tools
npm install @johnhenry/aimatey-cli

# Testing utilities
npm install @johnhenry/aimatey-testing
```

## Verify Installation

Create a simple test file to verify installation:

```typescript
// test.ts
import { Bridge } from '@johnhenry/aimatey-core';
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';

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
npm install @johnhenry/aimatey-core \
            @johnhenry/aimatey-frontend \
            @johnhenry/aimatey-backend \
            @johnhenry/aimatey-middleware
```

```typescript
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
```

### For HTTP APIs

```bash
npm install @johnhenry/aimatey-core \
            @johnhenry/aimatey-frontend \
            @johnhenry/aimatey-backend \
            @johnhenry/aimatey-http
```

```typescript
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
```

### For React Apps

```bash
npm install @johnhenry/aimatey-core \
            @johnhenry/aimatey-frontend \
            @johnhenry/aimatey-backend \
            @johnhenry/aimatey-react-core \
            @johnhenry/aimatey-react-hooks
```

```typescript
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { OpenAIBackendAdapter } from '@johnhenry/aimatey-backend/openai';
```

### For Local Development

```bash
npm install @johnhenry/aimatey-core \
            @johnhenry/aimatey-frontend \
            @johnhenry/aimatey-backend
```

```typescript
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { OllamaBackendAdapter } from '@johnhenry/aimatey-backend/ollama';
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
Error: Cannot find module '@johnhenry/aimatey-core'
```

**Solution:** Ensure you've installed the package:
```bash
npm install @johnhenry/aimatey-core
```

### Type Errors in TypeScript

```
Could not find a declaration file for module '@johnhenry/aimatey-core'
```

**Solution:** Install type definitions:
```bash
npm install @johnhenry/aimatey-types
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
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend/openai';
import { AnthropicBackendAdapter } from '@johnhenry/aimatey-backend/anthropic';
```

❌ **Incorrect:**
```typescript
import { OpenAIFrontendAdapter } from '@johnhenry/aimatey-frontend';
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
@johnhenry/aimatey-core@0.0.0
@johnhenry/aimatey-frontend@0.0.0
@johnhenry/aimatey-backend@0.0.0

# Avoid (mismatched versions)
@johnhenry/aimatey-core@0.0.0
@johnhenry/aimatey-frontend@0.1.5
```

Check the latest version on [npm](https://www.npmjs.com/package/@johnhenry/aimatey).
