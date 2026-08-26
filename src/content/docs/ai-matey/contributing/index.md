---
title: "Contributing to ai.matey"
description: "How to contribute to ai.matey: repository layout, workflow, commit conventions, and where to start."
---

Thank you for your interest in contributing to ai.matey! This guide will help you get started.

## Ways to Contribute

There are many ways to contribute to ai.matey:

- 🐛 **Report bugs** - Help us identify and fix issues
- ✨ **Suggest features** - Share ideas for new capabilities
- 📝 **Improve documentation** - Help others learn ai.matey
- 🔧 **Submit pull requests** - Contribute code improvements
- 💬 **Answer questions** - Help users in GitHub discussions
- 🎨 **Create examples** - Show how to use ai.matey in new ways

## Quick Start

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/ai.matey.git
cd ai.matey
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build Packages

```bash
npm run build
```

### 4. Run Tests

```bash
npm test
```

## Project Structure

ai.matey is a monorepo containing multiple packages:

```
ai.matey/
├── packages/
│   ├── ai.matey.core/          # Bridge and Router
│   ├── frontend/               # Frontend adapters (7)
│   ├── backend/                # Backend adapters
│   ├── middleware/             # Middleware (logging, caching, etc.)
│   ├── patterns/               # Production integration patterns
│   ├── mcp/                    # MCP tool calling
│   ├── http/                   # HTTP server integrations
│   ├── wrapper/                # SDK wrappers
│   ├── cli/                    # Command-line interface
│   ├── react-hooks/            # React hooks
│   ├── ai.matey.utils/         # Shared utilities
│   ├── ai.matey.types/         # TypeScript type definitions
│   └── ai.matey.docs/          # Documentation site (this site!)
├── examples/                   # Example applications
├── scripts/                    # Build and utility scripts
└── turbo.json                  # Monorepo build configuration
```

## Development Workflow

### Making Changes

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write code
   - Add tests
   - Update documentation

3. **Test locally**
   ```bash
   npm run build
   npm test
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(core): add new routing strategy
fix(backend): resolve Anthropic streaming issue
docs(middleware): improve caching examples
test(frontend): add OpenAI adapter tests
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific package
npm test --workspace=@johnhenry/aimatey-core

# Run tests in watch mode
npm test -- --watch
```

### Writing Tests

We use Jest for testing. Tests live alongside source code:

```
src/
├── bridge.ts
└── bridge.test.ts
```

**Example test:**
```typescript
import { Bridge } from './bridge';
import { MockFrontendAdapter, MockBackendAdapter } from '../test-utils';

describe('Bridge', () => {
  it('should process chat requests', async () => {
    const mockBackend = new MockBackendAdapter({
      response: { choices: [{ message: { content: 'Hello' } }] }
    });

    const bridge = new Bridge(
      new MockFrontendAdapter(),
      mockBackend
    );

    const response = await bridge.chat({
      model: 'test',
      messages: [{ role: 'user', content: 'Hi' }]
    });

    expect(response.choices[0].message.content).toBe('Hello');
  });
});
```

## Code Style

### TypeScript

- Use TypeScript for all new code
- Follow existing code style
- Use meaningful variable names
- Add JSDoc comments for public APIs

**Example:**
```typescript
/**
 * Creates a new Bridge instance.
 *
 * @param frontendAdapter - Adapter for input format
 * @param backendAdapter - Adapter for AI provider
 * @returns Bridge instance
 */
export function createBridge(
  frontendAdapter: FrontendAdapter,
  backendAdapter: BackendAdapter
): Bridge {
  return new Bridge(frontendAdapter, backendAdapter);
}
```

### Formatting

We use Prettier for code formatting:

```bash
npm run format
```

### Linting

We use ESLint for code quality:

```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

## Documentation

### Updating Docs

Documentation lives in `packages/ai.matey.docs/`:

```bash
cd packages/ai.matey.docs
npm start  # Start dev server
```

- **Guides**: `docs/guides/`
- **API Reference**: `docs/api/`
- **Tutorials**: `docs/tutorials/`
- **Examples**: `docs/examples/`

### Writing Good Docs

- Use clear, concise language
- Include code examples
- Add "why" not just "how"
- Keep examples minimal and focused
- Test all code examples

## Adding New Features

### Adding a Backend Adapter

1. Create adapter file:
   ```
   packages/backend/src/adapters/newprovider.ts
   ```

2. Implement `BackendAdapter` interface:
   ```typescript
   import type { BackendAdapter, IRChatCompletionRequest } from '@johnhenry/aimatey-types';

   export class NewProviderBackendAdapter implements BackendAdapter {
     name = 'newprovider';

     constructor(private options: NewProviderOptions) {}

     async chat(request: IRChatCompletionRequest) {
       // Convert IR to provider format
       const providerRequest = this.toProviderFormat(request);

       // Make API call
       const providerResponse = await this.api.chat(providerRequest);

       // Convert back to IR
       return this.toIRFormat(providerResponse);
     }

     async *chatStream(request: IRChatCompletionRequest) {
       // Implement streaming
     }
   }
   ```

3. Add tests:
   ```
   packages/backend/src/adapters/newprovider.test.ts
   ```

4. Export adapter:
   ```typescript
   // packages/backend/src/index.ts
   export { NewProviderBackendAdapter } from './adapters/newprovider';
   ```

5. Add documentation:
   ```
   packages/ai.matey.docs/docs/packages/backend.md
   ```

6. Create example:
   ```
   packages/ai.matey.docs/examples/02-providers/newprovider.ts
   ```

### Adding Middleware

1. Create middleware file:
   ```
   packages/middleware/src/newmiddleware.ts
   ```

2. Implement middleware creator:
   ```typescript
   import type { Middleware } from '@johnhenry/aimatey-types';

   export interface NewMiddlewareOptions {
     option1: string;
     option2?: number;
   }

   export function createNewMiddleware(
     options: NewMiddlewareOptions
   ): Middleware {
     return {
       name: 'new-middleware',
       async execute(request, next) {
         // Before request
         console.log('Before:', request);

         // Process
         const response = await next(request);

         // After response
         console.log('After:', response);

         return response;
       }
     };
   }
   ```

3. Add tests and documentation

## Pull Request Process

### Before Submitting

- ✅ Tests pass (`npm test`)
- ✅ Code is formatted (`npm run format`)
- ✅ No linting errors (`npm run lint`)
- ✅ Documentation updated
- ✅ Examples added/updated if needed

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Breaking change

## Testing
How was this tested?

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Examples added/updated
```

### Review Process

1. **Automated checks** run on PR
2. **Maintainer review** (may request changes)
3. **Approval** and merge
4. **Release** in next version

## Getting Help

- 💬 **GitHub Discussions**: Ask questions, share ideas
- 🐛 **GitHub Issues**: Report bugs, request features
- 📧 **Email**: For security issues only

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT).

---

**Thank you for contributing to ai.matey!** 🎉

Your contributions help make AI more accessible and portable for everyone.

## Next Steps

- [Development Guide](/ai-matey/contributing/development) - Detailed development setup
- [Architecture Guide](/ai-matey/contributing/architecture) - Understanding the codebase
