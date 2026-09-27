# ORRERY companion

`npm run node` starts an **optional** Node companion on `http://localhost:7777`. It's
never required — every planet in the site works without it, falling back to an
in-page stand-in. When it *is* running, planets that have a server side talk to
the real library instead.

`GET /orrery.json` (CORS-enabled) lists every demo the companion mounted, and
whether each one mounted successfully. Each demo lives in `server/demos/<id>.mjs`
and exports `{ id, describe, mount(app) }`; a demo that throws while mounting
is reported in `/orrery.json` (`ok: false`, `error`) rather than crashing the
whole companion.

## afm — Apple On-Device (`@johnhenry/apple-foundation-models`)

Routes: `GET /afm/status`, `POST /afm/chat`, `WS /afm/stream`.

This package is **not** a dependency of this project on purpose — it requires:

- **macOS 26 (Tahoe) or later** (`sw_vers -productVersion` ≥ 26.0)
- **Apple Silicon** (arm64)
- **Apple Intelligence enabled** in System Settings, with the on-device model
  already downloaded (`SystemLanguageModel.default.isAvailable`)
- **Node.js 26.0.0+**
- A Swift 6.0+ toolchain (Xcode 26+, or a recent-enough Command Line Tools)
  to compile the native bridge during `npm install`

If your Mac meets all of the above, enable the real thing:

```bash
npm i @johnhenry/apple-foundation-models
npm run node
```

`server/demos/afm.mjs` does `await import('@johnhenry/apple-foundation-models')`
lazily, inside a try/catch, the first time a route is hit — never at module
load time — so the companion (and every *other* demo) still boots cleanly on
a machine where the package isn't installed, isn't buildable, or is the wrong
OS/arch. `GET /afm/status` reports exactly why it isn't available (`wrong-os`,
`wrong-arch`, `not-installed`, `import-error`, or Apple's own `Availability`
reason such as `appleIntelligenceNotEnabled` / `modelNotReady`), plus the
detected `os`/`arch`/`node` version, so the planet can show an honest status
card instead of guessing.

Without it installed, the `afm` planet in the browser still renders a full,
useful "API surface stand-in": it shows the wrapper's real option surface
(`temperature`, `maximumResponseTokens`, `sampling`, `Instructions`), the
exact JSON request it would send, and a canned response shaped like a real
one — clearly labelled as a stand-in, never pretending to be the model.
