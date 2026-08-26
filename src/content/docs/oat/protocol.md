---
title: Protocol & codecs
description: The artifact envelope, canonical CBOR, Ed25519 signatures, capabilities — and the fountain-coded QR wire format underneath.
---

`@johnhenry/oat-protocol` and `@johnhenry/oat-qr-fountain` are the two layers neither custom element exposes directly, but both build on.

## The artifact envelope

Every payload — a message, a file, a UI proposal, a signed decision, a bootstrap manifest — travels as an **artifact**: canonical CBOR, a content digest, and an optional Ed25519 signature.

```ts
import { buildArtifact, generateSigningKey, computeDigest, verifyArtifact } from '@johnhenry/oat-protocol';

const key = await generateSigningKey();
const artifact = await buildArtifact(payload, { signingKey: key });
// on the other end:
const ok = await verifyArtifact(artifact); // checks digest AND signature
```

The envelope's shape (`OatArtifact`) is small enough to hold in your head:

| Field | Shape | Notes |
| --- | --- | --- |
| `version` | `1` | |
| `id` / `createdAt` / `expiresAt?` | strings (ISO timestamps) | |
| `mediaType` | string | a `Blob`/`File` source carries its own `type` here |
| `payload` | `Uint8Array` | optionally gzipped when `compression: 'gzip'` |
| `digest` | `{ algorithm: 'sha256', value }` | always present; computed with `digest`/`signature` excluded |
| `signature?` | `{ algorithm: 'ed25519', publicKey, value, keyId? }` | covers everything but itself — payload *and* digest bound together |
| `encryption?` | `{ scheme, keyEnvelope, recipientHint? }` | |
| `uiProposal?` | `UiProposalEnvelope` | the negotiated-UI path |
| `metadata?` | `Record<string, unknown>` | |

**The signature carries the signer's public key inline.** There's no separate key-exchange step for cross-device use — a valid signature alone tells you *some* key signed it. Whether that key is one you should trust is a separate question, handled by trust-on-first-use (see [Security model](/oat/security/)).

## Capabilities

A sender can request capabilities (e.g. `calendar.event.create`); the effective grant is always the intersection of three sets:

```
effective = sender requested ∩ receiver policy ∩ user-approved grants
```

Rendering a UI is never itself authority. Declarative actions carry typed, receiver-mediated requests — never remote code, never a DOM handle back to the sender.

## `ui.decision` — signed acknowledgments travel back too

The receiver can build a signed acknowledgment of what happened (accepted/downgraded/rejected, which capabilities were actually granted/denied, a correlation token) and send it back over any channel — including a second `<optical-send>`/`<optical-receive>` pair, so a full round trip can happen entirely optically with no other transport.

`extractUiDecision()` refuses to extract anything without a verified signature, since a decision artifact is itself a claim that capabilities were granted — an unsigned one is worthless as an audit record.

## The wire format: `@johnhenry/oat-qr-fountain`

LT (Luby Transform) fountain coding turns an artifact into a stream of QR frames that survives loss, duplication, and reordering — the receiver doesn't need every frame, or frames in order, just *enough* of them.

```ts
import { encode, decode } from '@johnhenry/oat-qr-fountain';
```

This is the layer that makes `<optical-receive>` tolerant of a shaky camera angle or a frame the reader missed. It has **no size cap of its own** — see the [throughput note](/oat/#no-published-size-cap--know-the-real-throughput-before-you-rely-on-it) on the overview page before assuming a transfer will be fast.
