---
title: Optical Artifact Transport (OAT)
description: A browser-native, capability-safe physical transport for signed state, structured artifacts, and negotiated UI — over just a display and a camera.
---

`<optical-send>` renders a signed, verified artifact as an animated, fountain-coded sequence of QR frames. `<optical-receive>` points a camera at the screen, reconstructs the artifact even under dropped/duplicated/reordered frames, verifies its digest and signature, and — if the sender proposed one — renders a receiver-sanitized UI for the user to accept, downgrade, or reject.

This is **not** a replacement for AirDrop, Nearby Share, or HTTPS. It targets the case those don't cover: payloads too large for a single QR code where zero-setup handoff, physical locality, air-gap compatibility, or trust bootstrapping between two devices with no prior relationship matter more than raw throughput.

```sh
npm install @johnhenry/oat-sender @johnhenry/oat-receiver @johnhenry/oat-protocol
```

```html
<optical-send id="sender" controls frame-rate="12"></optical-send>
<optical-receive id="receiver" controls ui-policy="safe"></optical-receive>
```

```ts
import { defineOpticalSend } from '@johnhenry/oat-sender';
import { defineOpticalReceive } from '@johnhenry/oat-receiver';

defineOpticalSend();
defineOpticalReceive();

const sender = document.querySelector('#sender');
const receiver = document.querySelector('#receiver');

sender.source = 'hello from across the room'; // string, Blob, or File — setting it starts the transfer
receiver.addEventListener('oat-artifact', (e) => console.log(e.detail));
```

Setting `.source` kicks off preparation immediately — there's no separate "start" call. A `Blob`/`File` carries its own `type` automatically into the received result.

## The seven packages

```
protocol/            @johnhenry/oat-protocol      artifact envelope, canonical CBOR, digest, Ed25519 signatures, capabilities, UI proposal types
codecs/qr-fountain/  @johnhenry/oat-qr-fountain    LT fountain encoder/decoder + QR frame render/decode
sender/               @johnhenry/oat-sender         <optical-send> custom element
receiver/             @johnhenry/oat-receiver       <optical-receive> custom element, per-profile policy
ui/                   @johnhenry/oat-ui             safe-view/safe-html rendering, sanitizer, M6 sandbox host
bootstrap/             @johnhenry/oat-bootstrap      release-manifest fetch+verify, WebRTC offer/answer bootstrap
sim/                   @johnhenry/oat-sim            transport simulator (loss/dup/reorder/corruption), no camera needed
```

## The pages here

- [Protocol & codecs](/oat/protocol/) — the artifact envelope, signing, and the fountain-coded wire format underneath both custom elements
- [Elements](/oat/elements/) — `<optical-send>`/`<optical-receive>` in practice: events, properties, the demo's own throughput numbers
- [Security model](/oat/security/) — what's actually verified, the M6 unsafe-HTML break-glass path, trust-on-first-use
- [Advanced](/oat/advanced/) — the transport simulator (test without a camera) and the bootstrap workflows

## No published size cap — know the real throughput before you rely on it

The library itself imposes no maximum payload size. The practical limit comes from the fountain code's redundancy overhead over 200-byte QR frames: at 12fps, effective throughput is roughly **700 KB/min** after the ~30% redundancy the fountain code adds for loss recovery. Larger payloads work, they just stop being interactive — plan around this before you build a UI that assumes transfers finish in seconds.

## Status

Implements the full M0–M6 milestone set from the project's design doc — protocol spec, transport simulator, both custom elements, receiver-owned safe UI rendering, bootstrap workflows (verified release-manifest fetch, real WebRTC offer/answer), and the M6 unsafe-HTML break-glass profile. BitTorrent/content-addressed bootstrap was scoped in M5 but not built — the pattern generalizes to it.

Source: [github.com/johnhenry/optical-artifact-transport](https://github.com/johnhenry/optical-artifact-transport) ·
Runnable examples in [`examples/`](https://github.com/johnhenry/optical-artifact-transport/tree/main/examples) —
round trip, lossy channel, signature rejection, bootstrap manifest — all camera-free via the simulator.
