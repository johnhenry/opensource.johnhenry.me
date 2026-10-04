---
title: Advanced
description: The transport simulator for testing without a camera, and the bootstrap workflows that unlock a faster follow-on transport.
---

## `@johnhenry/oat-sim` — test without camera hardware

```sh
npm install @johnhenry/oat-sim
```

Encodes and decodes a full artifact through the same fountain-coded pipeline `<optical-send>`/`<optical-receive>` use, with **no camera and no display** — plus deliberate loss, duplication, reordering, and corruption injection, so you can test how your app handles a bad optical link without ever pointing a real camera at a real screen.

This is the package to reach for in CI, or anywhere you need to exercise the receiver's error paths (`oat-rejected`, retries, partial-frame handling) deterministically.

## `@johnhenry/oat-bootstrap` — a small transfer unlocks a bigger one

```sh
npm install @johnhenry/oat-bootstrap
```

The idea: a small, easily-transferred signed artifact bootstraps a faster follow-on channel that wouldn't otherwise have a trust anchor. Two workflows ship:

- **Verified release-manifest fetch** — `buildReleaseManifestArtifact`/`extractReleaseManifest`/`fetchAndVerifyManifest`: a digest-checked, mirror-fallback HTTPS download, gated on signature verification before the fetch happens at all (see [Security model](/oat/security/) — this function enforces its own check rather than trusting callers).
- **Real WebRTC offer/answer** — `createOfferArtifact`/`createAnswerArtifact`/`applyAnswerArtifact`: a genuine `RTCPeerConnection` with a live data channel, bootstrapped by exchanging the offer and answer as optical artifacts instead of a signaling server.

**Not implemented**: BitTorrent / content-addressed bootstrap was scoped as part of the original M5 milestone but never built. The pattern generalizes to it — the same "small signed artifact authorizes a bigger transfer" shape applies — it's just not shipped code.

## Everything together: the reference demo

`examples/file-transfer` in the [repository](https://github.com/johnhenry/optical-artifact-transport) (not published — it's an app, not a library) wires sender and receiver together end to end: arbitrary file transfer with type-appropriate rendering, a declarative form UI proposal (`safe-view` kind `'form'` — typed field descriptors, no HTML at all), live switching between Safe/Strict/Permissive/Locked-down receiver policies, a capability grant with a real effect (downloading a generated `.ics` file, re-checked at submit time), and the full `ui.decision` round trip sent back optically through a second sender/receiver pair.
