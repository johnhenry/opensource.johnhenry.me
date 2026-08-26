---
title: "Development Guide"
description: "Development guide for the ai.matey monorepo: building, testing, linting, and creating new packages."
---

Detailed guide for setting up your development environment and working with the ai.matey codebase.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** installed
- **npm 9+** (comes with Node.js)
- **Git** for version control
- A code editor (we recommend VS Code)

## Initial Setup

### 1. Clone the Repository

```bash
# Fork the repository on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/ai.matey.git
cd ai.matey
```

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for all packages in the monorepo.

### 3. Set Up Environment

Create a `.env` file for API keys (optional, needed for testing):

```bash
# .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
GROQ_API_KEY=...
```

**Note:** Never commit API keys! The `.env` file is gitignored.

### 4. Build All Packages

```bash
npm run build
```

This builds all packages in dependency order using Turbo.

## Monorepo Structure

ai.matey uses **npm workspaces** for package management and **Turbo** for build orchestration.

### Workspaces

```json
{
  "workspaces": [
    "packages/*"
  ]
}
```

All packages are in `packages/`. Dependencies between packages are managed automatically.

### Package Dependencies

Packages have internal dependencies:

```
@johnhenry/aimatey-core → @johnhenry/aimatey-types
@johnhenry/aimatey-frontend → @johnhenry/aimatey-types
@johnhenry/aimatey-backend → @johnhenry/aimatey-types
@johnhenry/aimatey-middleware → @johnhenry/aimatey-core, @johnhenry/aimatey-types
```

## Development Commands

### Build

```bash
# Build all packages
npm run build

# Build specific package
npm run build --workspace=@johnhenry/aimatey-core

# Build in watch mode
npm run dev
```

### Test

```bash
# Run all tests
npm test

# Run tests for specific package
npm test --workspace=@johnhenry/aimatey-core

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Lint

```bash
# Check all packages
npm run lint

# Auto-fix issues
npm run lint:fix

# Lint specific package
npm run lint --workspace=@johnhenry/aimatey-core
```

### Format

```bash
# Format all code
npm run format

# Check formatting
npm run format:check
```

### Clean

```bash
# Clean build artifacts
npm run clean

# Clean and rebuild
npm run clean && npm run build
```

## Working with Packages

### Creating a New Package

1. Create package directory:
   ```bash
   mkdir packages/newpackage
   cd packages/newpackage
   ```

2. Initialize package.json:
   ```json
   {
     "name": "@johnhenry/aimatey-newpackage",
     "version": "0.0.0",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "scripts": {
       "build": "tsc",
       "test": "jest"
     },
     "dependencies": {
       "@johnhenry/aimatey-types": "*"
     },
     "devDependencies": {
       "typescript": "^5.0.0",
       "jest": "^29.0.0"
     }
   }
   ```

3. Add tsconfig.json:
   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src"
     },
     "include": ["src/**/*"]
   }
   ```

4. Create source files:
   ```bash
   mkdir src
   touch src/index.ts
   ```

### Adding Dependencies

```bash
# Add to specific package
npm install package-name --workspace=@johnhenry/aimatey-core

# Add to root (dev dependencies)
npm install -D package-name
```

### Linking Between Packages

Packages automatically link in the monorepo:

```json
{
  "dependencies": {
    "@johnhenry/aimatey-core": "*"  // Uses local version
  }
}
```

## TypeScript Configuration

### Root tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Package-Specific Config

Packages extend the root config:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../ai.matey.types" }
  ]
}
```

## Testing

### Test Structure

Tests live alongside source code:

```
src/
├── bridge.ts
├── bridge.test.ts
├── router.ts
└── router.test.ts
```

### Writing Tests

```typescript
// bridge.test.ts
import { Bridge } from './bridge';
import { MockFrontendAdapter, MockBackendAdapter } from '../test-utils';

describe('Bridge', () => {
  let bridge: Bridge;
  let mockBackend: MockBackendAdapter;

  beforeEach(() => {
    mockBackend = new MockBackendAdapter();
    bridge = new Bridge(
      new MockFrontendAdapter(),
      mockBackend
    );
  });

  describe('chat()', () => {
    it('should process requests correctly', async () => {
      mockBackend.setResponse({
        choices: [{ message: { content: 'Test response' } }]
      });

      const response = await bridge.chat({
        model: 'test',
        messages: [{ role: 'user', content: 'Test' }]
      });

      expect(response.choices[0].message.content).toBe('Test response');
    });

    it('should handle errors', async () => {
      mockBackend.setError(new Error('API Error'));

      await expect(
        bridge.chat({
          model: 'test',
          messages: [{ role: 'user', content: 'Test' }]
        })
      ).rejects.toThrow('API Error');
    });
  });

  describe('chatStream()', () => {
    it('should stream responses', async () => {
      const stream = await bridge.chatStream({
        model: 'test',
        messages: [{ role: 'user', content: 'Test' }],
        stream: true
      });

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});
```

### Test Utilities

Create mock adapters for testing:

```typescript
// test-utils/mock-backend.ts
export class MockBackendAdapter implements BackendAdapter {
  name = 'mock';
  private response: any;
  private error: Error | null = null;

  setResponse(response: any) {
    this.response = response;
  }

  setError(error: Error) {
    this.error = error;
  }

  async chat(request: IRChatCompletionRequest) {
    if (this.error) throw this.error;
    return this.response || { choices: [{ message: { content: 'Mock' } }] };
  }

  async *chatStream(request: IRChatCompletionRequest) {
    if (this.error) throw this.error;
    yield { choices: [{ delta: { content: 'Mock' } }] };
  }
}
```

## Debugging

### VS Code Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "program": "${workspaceFolder}/node_modules/jest/bin/jest",
      "args": ["--runInBand", "--no-coverage"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Current File",
      "program": "${file}",
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    }
  ]
}
```

### Debugging Tips

1. **Use breakpoints** in VS Code
2. **Add `debugger` statements** in code
3. **Use console.log** strategically
4. **Run tests in watch mode** for quick feedback

## Build System (Turbo)

### Turbo Configuration

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    }
  }
}
```

### Caching

Turbo caches build outputs. To clear cache:

```bash
npx turbo run build --force
```

## Common Tasks

### Adding a New Backend Adapter

1. **Create adapter file:**
   ```bash
   cd packages/backend
   touch src/adapters/newprovider.ts
   ```

2. **Implement adapter:**
   ```typescript
   export class NewProviderBackendAdapter implements BackendAdapter {
     name = 'newprovider';
     // ... implementation
   }
   ```

3. **Add tests:**
   ```bash
   touch src/adapters/newprovider.test.ts
   ```

4. **Export:**
   ```typescript
   // src/index.ts
   export { NewProviderBackendAdapter } from './adapters/newprovider';
   ```

5. **Test:**
   ```bash
   npm test --workspace=@johnhenry/aimatey-backend
   ```

### Adding New Middleware

1. **Create middleware file:**
   ```bash
   cd packages/middleware
   touch src/newmiddleware.ts
   ```

2. **Implement:**
   ```typescript
   export function createNewMiddleware(options) {
     return {
       name: 'new-middleware',
       async execute(request, next) {
         // Implementation
         return await next(request);
       }
     };
   }
   ```

3. **Test and export**

## Troubleshooting

### Build Failures

```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

### Test Failures

```bash
# Run specific test
npm test -- bridge.test.ts

# Update snapshots
npm test -- -u
```

### Type Errors

```bash
# Check types
npx tsc --noEmit

# Rebuild types
npm run build --workspace=@johnhenry/aimatey-types
```

### Dependency Issues

```bash
# Clear npm cache
npm cache clean --force

# Reinstall
rm -rf node_modules
npm install
```

## Best Practices

1. **Write tests first** (TDD)
2. **Keep PRs focused** - one feature/fix per PR
3. **Update docs** with code changes
4. **Add examples** for new features
5. **Run linter** before committing
6. **Test edge cases**
7. **Handle errors gracefully**

## Next Steps

- [Architecture Guide](/ai-matey/contributing/architecture) - Understanding the codebase
- [Contributing Guide](/ai-matey/contributing) - General contribution guidelines

---

**Happy coding!** 🚀
