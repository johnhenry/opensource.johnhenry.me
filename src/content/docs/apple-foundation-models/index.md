---
title: "apple-foundation-models"
description: "A 1-to-1 TypeScript wrapper for Apple's on-device FoundationModels framework: text generation, streaming, and automatic tool calling, no network, no API key."
---

> Previously published as `apple-foundation-models@0.0.1`. Now publishes as
> `@johnhenry/apple-foundation-models`, restarting its version at `0.0.0`.

A TypeScript wrapper providing 1-to-1 API translation of Apple's [FoundationModels](https://developer.apple.com/documentation/FoundationModels) framework, so you can call Apple's on-device language model from Node.js and JavaScript.

## Before you install: the traps

**This requires macOS 26 (Tahoe) or later, on Apple Silicon, with Apple Intelligence enabled.** Not macOS 15 (Sequoia) — a fair amount of the framework's own early documentation (and this package's, before this adoption) said "macOS 15.0 (Sequoia)"; that was wrong. The `FoundationModels` framework itself only exists starting with the macOS 26 SDK. If you're on an older macOS, both the install and every API call will fail, and the error you'll see first is usually not about the OS version at all — it's `isAvailable: false`, or a Swift build failure that looks unrelated. Check both of these before anything else:

- **macOS version**: `sw_vers -productVersion` must be `26.0` or higher.
- **Apple Intelligence enabled**: System Settings → Apple Intelligence & Siri. Even on a qualifying macOS 26 Mac, `SystemLanguageModel.default.isAvailable` is `false` until this is turned on and the on-device model has finished downloading.

**`npm install` does a real Swift Package Manager build, not just a download.** The postinstall (`scripts/build-swift.js`) runs `swift build -c release` against `swift/Package.swift` to compile the native bridge executable this package talks to over stdin/stdout (and a Unix domain socket, for tool-enabled sessions). That means:

- The first install can take noticeably longer than a typical `npm install` — it's compiling Swift, not unpacking a tarball.
- You need a Swift 6.0+ toolchain with the **macOS 26 SDK** available (the SDK is what actually contains `FoundationModels.framework`'s module). A full Xcode 26+ install satisfies this. A **standalone Xcode Command Line Tools** install can too, if it's recent enough — verified directly on the machine used for this adoption: `xcrun --sdk macosx --show-sdk-path` under a CLT-only toolchain can resolve to an SDK (`MacOSX26.5.sdk` / `MacOSX27.0.sdk`) that already contains `System/Library/Frameworks/FoundationModels.framework`. If your CLT is older than that, install/update it (`xcode-select --install`) or install full Xcode instead — don't assume you specifically need the full Xcode.app for this.
- If the Swift build fails, `npm install` does **not** fail the overall install — `build-swift.js` warns and exits 0 so the rest of your dependency tree still installs. That's convenient for CI/non-macOS machines, but it also means a broken Swift toolchain can go unnoticed until you actually call the API and get a runtime error about a missing executable. Run `npm run build:swift` manually right after install if you want to fail fast instead.

## Install

```bash
npm install @johnhenry/apple-foundation-models
```

To rebuild the Swift wrapper manually (e.g. after a Swift toolchain upgrade):

```bash
npm run build:swift
```

## Quick start

```typescript
import { SystemLanguageModel, LanguageModelSession }
  from '@johnhenry/apple-foundation-models';

const model = SystemLanguageModel.default;

if (!model.isAvailable) {
  // Almost always means: wrong macOS version, or Apple Intelligence isn't
  // enabled/finished downloading yet -- see the traps above.
  console.log('Model not available:', model.availability);
} else {
  const session = new LanguageModelSession(model);
  const response = await session.respond('Write a haiku about TypeScript');
  console.log(response.content);
}
```

Multi-turn conversations keep instructions and history on the session:

```typescript
import { SystemLanguageModel, LanguageModelSession, Instructions }
  from '@johnhenry/apple-foundation-models';

const session = new LanguageModelSession(
  SystemLanguageModel.default,
  undefined,                                           // guardrails (default)
  [],                                                   // tools
  new Instructions('You are a helpful coding assistant.'),
);

const r1 = await session.respond('What is TypeScript?');
const r2 = await session.respond('How is it different from JavaScript?');
console.log(session.transcript.length); // grows with each turn
```

## API surface

This is a **1-to-1 translation** — every Swift API has a directly corresponding TypeScript one:

| Swift | JavaScript/TypeScript |
|-------|----------------------|
| `SystemLanguageModel.default` | `SystemLanguageModel.default` |
| `model.availability` | `model.availability` (getter) |
| `model.isAvailable` | `model.isAvailable` (getter) |
| `LanguageModelSession(model:)` | `new LanguageModelSession(model)` |
| `session.respond(to:)` | `await session.respond(prompt)` |
| `session.streamResponse(to:)` | `session.streamResponse(prompt)` |
| `session.transcript` | `session.transcript` (getter) |
| `session.isResponding` | `session.isResponding` (getter) |

Full API reference with side-by-side Swift/JS examples: [API_REFERENCE.md](https://github.com/johnhenry/apple-foundation-models/blob/main/API_REFERENCE.md) in the repo.

## Tool calling

Automatic tool/function-calling execution is fully implemented: give a session tools, and the model can call them mid-response.

```typescript
import { LanguageModelSession, ToolOutput } from '@johnhenry/apple-foundation-models';

const weatherTool = {
  name: 'getWeather',
  description: 'Get current weather for a city',
  async call(args) {
    const weather = await fetchWeatherAPI(args.city);
    return new ToolOutput(weather);
  },
};

const session = new LanguageModelSession(undefined, undefined, [weatherTool]);
const response = await session.respond("What's the weather in Boston?");
console.log(response.content);

// Sessions created with tools open a local persistent server (Unix domain
// socket) -- always close it when you're done:
await session.close();
```

## Security model

This package spawns a local Swift subprocess and talks to it over stdin/stdout (or a Unix domain socket, for tool-enabled sessions). Everything runs on-device — no network calls of its own (the one-time Apple Intelligence model download is Apple's, not this package's).

**What it guarantees:** no network I/O from the package itself; the tool-session socket is per-session, local-only, and cleaned up when the session closes or the process is signaled.

**What is still yours:** when a session has tools, the model decides when to call them, and your tool's `call()` runs with whatever privileges your process has — this package does not sandbox tool code. If a tool wraps something dangerous, an LLM choosing when to invoke it is a trust boundary you design, not one this package provides.

## Family

`@johnhenry/apple-foundation-models` is the on-device Apple Intelligence backend that [`@johnhenry/aimatey-native-apple`](https://github.com/johnhenry/aimatey/tree/main/packages/native-apple) (part of [aimatey](/aimatey/)) wraps as a `BackendAdapter`, so any aimatey frontend adapter can run against Apple's on-device model with no API key, no network, and no cost:

```bash
npm install @johnhenry/aimatey-native-apple @johnhenry/apple-foundation-models
```

`aimatey-native-apple` dynamically `import()`s this package at runtime rather than declaring it as a hard `package.json` dependency, so it's opt-in — installing `@johnhenry/aimatey-native-apple` alone does not pull this package in.

## Limitations

- **Platform**: macOS 26.0+ (Tahoe), Apple Silicon (ARM64) only.
- **Offline**: requires internet for the one-time on-device model download; generation itself is fully on-device.
- **No sandboxing of tool calls** — see Security model above.

## Source

[github.com/johnhenry/apple-foundation-models](https://github.com/johnhenry/apple-foundation-models)
